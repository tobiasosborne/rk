<!-- ROLE: normative contract for `rk verify`'s worker interface (PRD C9, IMPLEMENTATION_PLAN.md
     M3.1) — every backend (claude headless, codex exec, any future headless CLI) must satisfy
     this to be eligible for prover or verifier duty. UPDATE POLICY: rewritten-whole per section
     when that section's semantics change; a driver change that alters request/response shape,
     dispatch model, or exit-code meaning without updating this doc is incomplete work (CLAUDE.md
     Rule 7). Schema changes here are compat events (CLAUDE.md Rule 10): `schemas/verdict.v1.json`
     bumps its version field on any incompatible shape change.
     TRIGGER: before implementing or modifying a backend in src/drive/; before changing
     schemas/verdict.v1.json or src/drive/verdict-schema.ts; before the M3.2 backend-registry WP;
     read alongside docs/memos/2026-07-19-m3.0-caching-spike.md, whose measured results this
     contract encodes as normative dispatch rules, not just recommendations. -->

# Worker contract

This is the interface every `rk verify` backend implements. It supersedes the PRD C9 / M3.1
sketch's flat `prompt_parts {shared_prefix, item[]}` request shape — the M3.0 caching spike
(`docs/memos/2026-07-19-m3.0-caching-spike.md`) measured that shape at **0% shared-block cache
reuse** the moment per-item content varies (Finding 1), against **~99.6-99.8% cache-read per
turn** for a session/turn dispatch model (Finding 2). This document is the amended contract the
spike forced; `rk-z34` records the consequence, `../vibefeld/handoff.md`'s V1 session records the
kernel-side identity fields (`verified_by`, `batch_id`) this contract's identity block mirrors.

## Authority

Normative for `src/drive/*` and every backend module under it (claude headless, codex exec,
future CLIs). `schemas/verdict.v1.json` is the wire contract for section (c)'s response shape;
`src/drive/verdict-schema.ts` is the runtime enforcement of that schema's full surface. Where
PRD C9 or IMPLEMENTATION_PLAN.md M3.1's original sketch disagrees with this document, this
document wins — it is the amended design the plan's own sequencing constraint required
("M3.0 caching spike before M3.3 design freeze").

## (a) Dispatch model

A **worker session** is created per **(role, tier, node-or-batch claim)** — never per item, and
never shared across an unrelated claim. Items belonging to that claim are delivered as **turns**
on the session, not as separate flat-prompt processes:

- **Session creation** (turn 1): the driver opens a new backend session and sends the shared
  context once — conjecture, common ancestors, definitions relevant to the claim's subtree, the
  tier's checklist/rubric, `output_schema`. For the claude backend this is a plain `claude -p`
  invocation *without* `--no-session-persistence`, whose response carries a `session_id` the
  driver retains for the life of the claim.
- **Turn dispatch** (turns 2..N): each subsequent item in the claim is sent as **only its own
  content** — the item's statement, deps, scope, its own checklist delta if any — through
  `--resume <session_id>` (claude) or the backend's equivalent resume/continue mechanism. The
  shared context is **never re-sent**; Finding 1 is the proof that re-sending it (even
  byte-identically inside one flat string) defeats caching the instant anything downstream
  varies.
- **Backends without session support declare it.** A backend that cannot resume a prior
  conversation (no session/continuation primitive at all) is not disqualified, but it MUST
  report `dispatchModel: "flat"` in its registration (`.rk/config`'s backend registry, M3.2) so
  the driver can **cost it honestly** — no cache-read credit is assumed for a flat-dispatch
  backend, and the batch composer's shared-context preference (M3.4) does not apply to it. A
  backend silently claiming session support it does not have is a driver-trust violation, not a
  performance regression — the honesty requirement is part of this contract, not an optimization
  detail.
- **Role isolation is identity-based, never process-amnesia-based (C9 law, restated verbatim
  here because this is exactly the mechanism that could accidentally violate it): a session is
  NEVER reused across roles.** A prover session and a verifier session over the same node are
  two distinct backend sessions, full stop, even if reusing one would be cheaper. This is not a
  caching optimization to weigh against cost — it is the reviewer-independence boundary the
  whole validity barrier rests on (PRD §4 C3, C9's cross-vendor rule, af's `Author`/`VerifiedBy`
  separation). A session is also never reused across an unrelated claim (a different node or
  batch), even within the same role — session identity is `(role, tier, claim-id)`, not
  `(role, tier)`.

## (b) Request shape

```
WorkerRequest {
  role:      "prover" | "verifier" | "reviewer"        // D8 / oracle-registry vocabulary
  tier:      "l5" | "hard"                              // the rigour ladder's two verification tiers
  backend:   string                                     // "claude" | "codex" | ... (registry id)
  session:   { mode: "new" }
           | { mode: "resume", sessionId: string }       // never "resume" across roles/claims
  sharedContext?: string                                 // sent ONLY when session.mode = "new";
                                                          // omitted on every resume turn (section a)
  item: {                                                // per-turn payload — always present
    itemId:      string
    content:     string                                  // the item's own statement/deps/scope
    contentHash: string                                  // sha256 hex the returned verdict binds to
  }
  outputSchema: string                                   // ref, e.g. "schemas/verdict.v1.json#/…"
  timeout:      number                                   // seconds; driver-enforced, backend-honored
  budget:       number                                   // see Open questions — unit unresolved
}
```

`sharedContext` is a driver responsibility to assemble once per claim (conjecture + common
ancestors + definitions + tier checklist), never per item. A request with `session.mode:
"resume"` and a non-empty `sharedContext` is a contract violation — resending the shared block on
a resume turn is exactly the anti-pattern Finding 1 measured as a cache-defeating mistake, and it
inflates every subsequent turn's token cost for no benefit.

## (c) Response shape

```
WorkerResponse {
  verdicts: VerdictItem[]                                // schemas/verdict.v1.json, one call may
                                                          // return 1..N items (a batch turn can
                                                          // return several verdicts in one reply)
  usage: {
    input:          number
    output:         number
    cache_read:     number                                // usage.cache_read_input_tokens
    cache_creation: number                                // usage.cache_creation_input_tokens
  }
  exit: number                                            // see exit-code table below
}
```

**Exit-code discipline (self-teaching, af-style — af's own `internal/errors` groups codes by
category and each code documents its remediation; this contract adopts the same shape):**

| code | meaning | driver action |
|---|---|---|
| 0 | verdict(s) delivered, schema-valid | apply the verdicts |
| 10 | timeout | retry per the timeout/retry policy (ownership: open question below) |
| 11 | budget exceeded | stop dispatching further turns on this session; report, do not retry blindly |
| 12 | schema-invalid output | the backend produced a response `src/drive/verdict-schema.ts` rejects — log the rejection reason, never apply a partially-valid document |
| 13 | backend unavailable | fall back per `.rk/config`'s per-role×tier fallback chain (M3.2); if none, abort the claim |

A backend MUST NOT exit 0 with an empty `verdicts` array when items were dispatched — that is a
distinct failure (schema-invalid: nothing to apply) and must exit 12, not 0. Every other nonzero
code the backend's own process naturally returns (crash, killed) is treated as 13 by the driver's
wrapper, never surfaced as a silent success.

## (d) Caching obligations (driver-side, from the M3.0 spike)

These are obligations on the **driver** (`src/drive/*`), not the backend — the spike measured
`claude -p`'s behavior; the driver is what decides how to dispatch against it.

1. **Stagger rule (Finding 4, confirmed not merely assumed).** The first call of every
   same-prefix group (a new session's turn 1) is dispatched **alone**, awaited to its first
   streamed token, before any other call sharing that prefix fires. Concurrent identical-prefix
   dispatch is asymmetric — one caller wins a race it cannot guarantee, the other pays a full,
   redundant write. There is no configuration escape from this rule; it is not a performance
   tuning knob.
2. **Shared-context group floor: >= 3 items** (Recommendation 5). Given the measured 1-hour
   cache-write tier (not the ~5-minute default the bare Messages API uses, and not what PRD C9
   originally assumed), a write costs 2x; a group of 1-2 items sharing a context is not a caching
   win even though its per-token cache-read price looks good in isolation. The batch composer
   (M3.4) must not credit shared-context preference to a group below this floor.
3. **Minimum cacheable prefix: ~4096 tokens** (Recommendation 6). Below this, caching silently
   does not activate (`cache_creation_input_tokens: 0`, no error). A shared context under ~4k
   tokens is batched on independence/critical-path grounds only — engineering for a cache win
   below this size is not worth it and the composer must not assume one.
4. **`--exclude-dynamic-system-prompt-sections` is a fixed, campaign-wide worker setting for the
   claude backend** (Recommendation 4), set once at `rk init`/`.rk/config` time, never toggled
   per-call. Toggling it mid-campaign is itself a cache-invalidating event (Finding 5, item 2:
   the same tiny prompt produced a different, smaller cache structure with the flag present vs.
   absent). Its purpose is cross-host prefix stability: per-machine content (cwd, env, git
   status) otherwise sits inside the cacheable system-prompt prefix and would vary host-to-host,
   breaking cache sharing on a multi-machine campaign even when the shared corpus is identical.
5. **1-hour TTL, not 5 minutes** (Finding 3, corrects the PRD's stated assumption). Every call in
   the spike reported activity entirely under `ephemeral_1h_input_tokens`; `ephemeral_5m` was
   zero throughout. This relaxes batch-window scheduling (a several-minute gap between turns is
   nowhere near the expiry boundary) but doubles the write cost basis the group-floor rule (2
   above) is built on.
6. **Never build a turn as `shared_prefix + item` concatenated into one string, even inside a
   single session-resume turn** (Recommendation 7). This applies to turns 2+ specifically — the
   very first turn of any session necessarily pays a full write regardless of internal structure
   (there is nothing yet to reuse), but every turn after that must carry only its own new item
   content, nothing repeated from the shared corpus.

## (e) Identity

Every verdict carries the **verifier identity**: model family, backend, and session id, plus an
optional `batchId` when the verdict was produced as part of a batch dispatch. This is
**driver-supplied provenance — recorded and mechanically checkable, NOT adversary-proof** (the
C3 honesty rule, stated here at exactly the strength PRD §4 C3 and `../vibefeld/handoff.md`'s V1
notes state it and no further): the driver is the one asserting which backend/session produced a
verdict; nothing in this contract cryptographically binds a backend process to its claimed
identity. The trust anchor remains the driver's own process discipline and role-isolation
enforcement (section a), exactly as af's `VerifiedBy`/`Author` fields are "recorded and
mechanically checkable... never adversary-proof enforcement" per that session's handoff.
`modelFamily` is the field the M3.8 cross-vendor rule reads (promotion to `proved` requires
verifier family != prover family for load-bearing claims) — it must be a normalized value (e.g.
`"claude"`, `"codex"`, `"gpt"`), not a raw model string, so the cross-vendor comparison is a
simple inequality check, not a fuzzy match. See `schemas/verdict.v1.json`'s `verifier` object.

## Open questions for the Tier A reviewer

1. **Codex backend session semantics are unmeasured.** The M3.0 spike scoped itself to the
   `claude -p` CLI only (its own stated "Honest gaps"). Whether `codex exec` has an equivalent
   resume/continuation primitive, and what its cache-partition/TTL behavior looks like, is
   unknown. Until measured, `codex` should probably declare `dispatchModel: "flat"` defensively
   (section a's honesty rule) rather than assume session support it hasn't demonstrated — please
   rule on whether that default is right, or whether M3.2 should spike codex specifically before
   registering it as session-capable.
2. **Budget unit is unresolved.** `WorkerRequest.budget` is specified here only as `number`, unit
   unstated. Candidates: a token count (matches `usage` reporting directly, but requires the
   driver to convert dollar-denominated campaign budgets), or a dollar amount (matches how a
   researcher actually thinks about spend, but requires a per-model price table the driver must
   keep current). Recommend a ruling before M3.2 implements the first real backend against this
   field.
3. **Retry-semantics ownership is unstated.** Exit 10 (timeout) says "retry per the timeout/retry
   policy" without naming who owns that policy — the per-backend module, a shared driver-level
   retry wrapper, or `.rk/config`. If it's shared, it should probably live in `src/drive/` as its
   own module before M3.2's first backend lands, rather than being reinvented per backend.
4. **Whether `sharedContext` needs its own size/shape validation at the request boundary** (e.g.
   rejecting a `session.mode: "new"` request with no `sharedContext` at all, or an implausibly
   large one) is left unspecified here — `src/drive/verdict-schema.ts` (this WP) only validates
   the **response** shape (`schemas/verdict.v1.json`); nothing in this WP validates the request
   shape at a schema level. Worth a ruling on whether M3.2/M3.3 need a `WorkerRequest` JSON Schema
   of their own, symmetric to the verdict schema, or whether TS types + the driver's own
   assembly logic suffice since requests never cross a process boundary the way responses do
   (backend stdout is untrusted input; the driver's own request construction is not).
5. **Whether a single call returning multiple `verdicts[]` entries (section c) needs its own cap**
   independent of M3.4's batch-size cap (default 10) — e.g. can one backend response legally
   claim to have verified 40 items in one turn, or should `src/drive/verdict-schema.ts` reject an
   oversized `verdicts[]` array as itself suspicious (a correlated-batch risk the PRD's guardrails
   were meant to bound)? Left unbounded in `schemas/verdict.v1.json` for this WP; flagging for a
   ruling on whether that is the right default.
