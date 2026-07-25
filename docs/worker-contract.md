<!-- ROLE: normative contract for `rk verify`'s worker interface (PRD C9, IMPLEMENTATION_PLAN.md
     M3.1) — every backend (claude headless, codex exec, any future headless CLI) must satisfy
     this to be eligible for prover or verifier duty. UPDATE POLICY: rewritten-whole per section
     when that section's semantics change; a driver change that alters request/response shape,
     dispatch model, or exit-code meaning without updating this doc is incomplete work (CLAUDE.md
     Rule 7). Schema changes here are compat events (CLAUDE.md Rule 10): `schemas/verdict.v1.json`
     bumps its version field on any incompatible shape change.
     TRIGGER: before implementing or modifying a backend in src/drive/; before changing
     schemas/verdict.v1.json or src/drive/{verdict-schema,verdict-raw,bind-verdicts,session,
     identity,worker-result}.ts; before the M3.2 backend-registry WP; read alongside
     docs/memos/2026-07-19-m3.0-caching-spike.md, whose measured results this contract encodes as
     normative dispatch rules, not just recommendations.
     REPAIR WAVE (2026-07-19): this revision is the single repair wave following the Tier A
     review of commit 6dcf828 — seven landing-blockers, nine follow-ups, all mechanically fixed
     and RED->GREEN + mutation-proven (see the landing commit message for file:line evidence per
     blocker). Per CLAUDE.md's anti-Zeno rule, this repair wave is NOT itself re-reviewed by a
     fresh hostile pass — the orchestrator verifies it mechanically against the review's claims. -->

# Worker contract

This is the interface every `rk verify` backend implements. It supersedes the PRD C9 / M3.1
sketch's flat `prompt_parts {shared_prefix, item[]}` request shape — the M3.0 caching spike
(`docs/memos/2026-07-19-m3.0-caching-spike.md`) measured that shape at **0% shared-block cache
reuse** the moment per-item content varies (Finding 1), against **~99.6-99.8% cache-read per
turn** for a session/turn dispatch model (Finding 2). `rk-z34` records the consequence,
`../vibefeld/handoff.md`'s V1 session records the kernel-side identity fields (`verified_by`,
`batch_id`) this contract's identity block encodes into.

## Authority

Normative for `src/drive/*` and every backend module under it (claude headless, codex exec,
future CLIs). `schemas/verdict.v1.json` is the wire contract for shape (b) below;
`src/drive/verdict-schema.ts` is its runtime enforcement. Where PRD C9 or
IMPLEMENTATION_PLAN.md M3.1's original sketch disagrees with this document, this document wins.

## Data flow: two shapes, one trust boundary

**This is the section the Tier A review's landing-blocker 1 forced into existence.** The
pre-review v1 of this contract validated worker output directly against the enriched,
driver-owned document shape — meaning a worker could return a structurally valid but FALSE
`itemId`, `contentHash`, `tier`, `batchId`, `modelFamily`, or `sessionId`, and nothing rejected
it. That is now impossible by construction, not by convention: there are two distinct shapes,
and only the driver ever produces the second one.

```
                     ┌─────────────────────────┐
  backend process -> │ WorkerResult (envelope) │   src/drive/worker-result.ts
                     │  { exit, usage, rawText }│   exit = the PROCESS exit code, authoritative
                     └───────────┬─────────────┘   (blocker 7's ruling)
                                 │ exit==0, rawText parses as JSON
                                 v
                     ┌─────────────────────────┐
                     │ shape (a): RAW WORKER   │   src/drive/verdict-raw.ts
                     │ OUTPUT (untrusted)       │   ONLY: verdict + justification +
                     │  { verdict, justification│   optional correction detail.
                     │    , correction? }        │   NO itemId/contentHash/tier/batchId/
                     └───────────┬─────────────┘   identity field exists in this shape AT ALL
                                 │ bindVerdicts(dispatchState, rawOutput)
                                 │ src/drive/bind-verdicts.ts
                                 v
                     ┌─────────────────────────┐
                     │ shape (b): VERDICT       │   src/drive/verdict-schema.ts
                     │ DOCUMENT (driver-owned)  │   schemas/verdict.v1.json
                     │  { schema_version,       │   itemId/contentHash/tier/batchId/verifier
                     │    verifier, verdicts:[1]}│   are ALL injected from the driver's own
                     └─────────────────────────┘   immutable DispatchState — never read back
                                                     from worker output.
```

**The resolving design adopted here is full injection, the stronger of the review's two offered
remedies** ("the driver must inject ... from immutable dispatch state — or compare every echoed
value for exact equality"): shape (a) simply has no field for a worker to put a false `itemId`
or `contentHash` INTO. `checkNoExtraKeys` in `src/drive/verdict-raw.ts` rejects any of those
fields outright if a worker's JSON output happens to contain them — they are never silently
stripped, never merged, never compared; their mere presence is a shape violation.

`bindVerdicts(dispatchState, rawWorkerOutput)` (`src/drive/bind-verdicts.ts`) is the one place
shape (a) and shape (b) meet:
1. Validates `dispatchState` itself (defensive — it is driver-owned, but a driver bug should
   still be caught, not silently trusted).
2. Detects a **tier mismatch** (raw output shaped for the wrong tier relative to
   `dispatchState.tier` — e.g. a hard-tier `{outcome:...}` object handed to an l5 dispatch) with
   a dedicated, explicit message.
3. Validates `rawWorkerOutput` against shape (a) for `dispatchState.tier`
   (`src/drive/verdict-raw.ts`'s `validateRawWorkerOutput`).
4. Constructs shape (b) by injecting `itemId`, `contentHash`, `tier`, `batchId` (if any), and
   `verifier` from `dispatchState`, carrying the worker's own `justification`/`verdict`/
   `correction` through unmodified (those ARE legitimately worker-authored content).
5. Validates the constructed document against `schemas/verdict.v1.json`
   (`src/drive/verdict-schema.ts`) as a belt-and-suspenders check.

Under the session/one-item-per-turn model (see "Exactly one verdict per turn" below), one
dispatch = one raw output = one verdict, which is why the review's original "missing, extra,
duplicate, or mismatched items" language (written before that constraint existed) now resolves
as: "missing" = the call failed before producing anything (`WorkerResult`'s job — see the
envelope section); "extra/duplicate" = a `verdicts[]` array of length != 1 (shape (b)'s
`minItems`/`maxItems` job); "mismatched" = `bindVerdicts`'s tier-mismatch check. There is no
surviving code path where "duplicate itemIds within one document" is a distinct case from
"more than one verdict in a document," since a document with more than one verdict is rejected
by cardinality alone, regardless of whether the ids repeat.

## (a) Dispatch model

A **worker session** is created per **(role, tier, node-or-batch claim)** — never per item, and
never shared across an unrelated claim. Items belonging to that claim are delivered as **turns**
on the session, not as separate flat-prompt processes.

For a batch, `claimId` is `l5:<batchId>` where `batchId` is re-derived over the members that
actually entered the session (rk-74o): members discarded pre-dispatch (no content, hash mismatch)
are NOT in it, because they never shared the session and cannot have correlated its errors; a turn
that fails AFTER dispatch remains a member, because it did share the session and could have biased
the others — and `af unvalidate --batch <id>` must therefore be able to revoke it. Zero surviving
members means no session is opened and no id is minted at all.

- **Session creation** (turn 1): the driver opens a new backend session and sends the shared
  context once — conjecture, common ancestors, definitions relevant to the claim's subtree, the
  tier's checklist/rubric, `outputSchema`. For the claude backend this is a plain `claude -p`
  invocation *without* `--no-session-persistence`, whose response carries a `session_id` the
  driver retains for the life of the claim.
- **Turn dispatch** (turns 2..N): each subsequent item in the claim is sent as **only its own
  content** through `--resume <session_id>` (claude) or the backend's equivalent resume/continue
  mechanism. The shared context is **never re-sent**.
- **Backends without session support declare it.** A backend that cannot resume a prior
  conversation MUST report `dispatchModel: "flat"` in its registration (`.rk/config`'s backend
  registry, M3.2) so the driver can **cost it honestly** — no cache-read credit is assumed, and
  the batch composer's shared-context preference (M3.4) does not apply to it.
- **Role isolation is identity-based, never process-amnesia-based, and is now MECHANICALLY
  enforced, not prose alone (review blocker 2's fix).** A session is created for exactly one
  **isolation tuple**: `(backend, model, role, tier, claimId, dispatchModel)`
  (`src/drive/session.ts`'s `SessionRecord` — immutable once created: a change to any of these
  fields means a NEW claim/session, never an edit to this one). Every request naming
  `session.mode: "resume"` is checked against the recorded tuple for the `sessionId` it names —
  `src/drive/session.ts`'s `validateSessionRequest` rejects a mismatch on ANY field, and the
  review's own failure scenario ("a verifier request resumes a prover session... nothing binds
  sessionId to (backend/model, role, tier, claim)") is now a dedicated, named test
  (`test/drive/session.test.ts`, "THE core failure scenario"). The concrete create-once store
  implementing this — global sessionId uniqueness, tuple recorded at creation, every resume
  validated against it — is `src/drive/session-manager.ts` (M3.3), property-tested against an
  independent ground-truth model over 1000 seeded random operations
  (`test/drive/session-manager.test.ts`). A `dispatchModel: "flat"` backend
  requesting `session.mode: "resume"` is rejected unconditionally — it receives a fresh synthetic
  attempt id via `session.mode: "new"` on every turn instead.
- **`claimId` and `turnId` are both required on every request** (review blocker 2). `claimId`
  identifies the node/batch claim a session belongs to (part of the isolation tuple above);
  `turnId` is a per-turn idempotency key — see "Retry ownership" below for what it is for.
- **Model selection (rk-7hi, M3.5 STOP-2 blocker).** `model` is part of the isolation tuple above,
  so a prover session and a verifier session pinned to DIFFERENT models are already, mechanically,
  different sessions — nothing about session isolation needed to change for per-role model pinning
  to be safe. What was missing was a way to CHOOSE two different models for one `rk verify --live`
  run at all: the CLI's `--model` flag is a single global value. `resolveModel`
  (`src/drive/driver-live.ts`) resolves the model for each (role, tier) independently, most-specific
  wins: (1) `.rk/config.json`'s `workers.assignments.<role>.<tier>.model` (`src/drive/
  backend-registry.ts`'s `RoleTierAssignment.model`, optional; `BackendRegistry.modelFor`), (2) the
  global `--model` flag, (3) `DEFAULT_MODEL_BY_BACKEND[backend]`. This is the ONLY mechanism that
  lets a cross-vendor run pin, e.g., the claude side to `claude-opus-4-8` while the codex side stays
  on its own default in the SAME run. Family identity (`modelFamily`, section (e) below) is derived
  from the BACKEND name alone (`familyForBackend`, `src/drive/driver-live.ts`) — completely
  independent of which model wins here, so this pin can never perturb the cross-vendor rule.

## (b) Request shape

```
WorkerRequest {
  role:      "prover" | "verifier" | "reviewer"
  tier:      "l5" | "hard"
  backend:   string
  claimId:   string                                     // isolation-tuple member (blocker 2)
  turnId:    string                                     // idempotency key for retry (blocker 2 / Q3)
  session:   { mode: "new" }
           | { mode: "resume", sessionId: string }       // validated against SessionRecord
  sharedContext?: string                                 // sent ONLY when session.mode = "new"
  item: {
    itemId:      string
    content:     string
    contentHash: string                                  // PINNED hash domain — see below
  }
  outputSchema: string
  timeout:      number                                   // seconds
  budget: {                                               // Q2 ruling: structured INTEGER token
    maxTotalTokens: number                                // limits on the wire, not an ambiguous
    maxOutputTokens?: number                               // scalar or a dollar amount
  }
}
```

`sharedContext` is assembled once per claim, never per item; a `session.mode: "resume"` request
carrying a non-empty `sharedContext` is a contract violation (re-sending the shared block on a
resume turn defeats the caching this whole dispatch model exists to capture — Finding 1).
`budget` is expressed as integer token limits (Q2 ruling: "use structured integer token limits on
the worker wire, not an ambiguous scalar or dollars; keep dollar campaign budgets and versioned
price conversion driver-side") — a researcher-facing dollar budget is a driver-side concept,
converted to a token limit via a versioned price table that lives in `.rk/config`, not on this
wire.

**No second JSON Schema for the request** (Q4 ruling: "a second JSON Schema is unnecessary while
requests are internal ... add if requests become a serialized plugin boundary"). Requests never
cross an untrusted-process boundary the way a response does (the driver constructs them), so
TypeScript types are the request-shape contract — but Q4 also ruled that types alone are
insufficient for the session/claim ISOLATION invariant specifically, which is why
`src/drive/session.ts`'s runtime `validateSessionRequest` and its property-test suite exist
(see "(a) Dispatch model" above).

## (c) Response envelope and the buffered apply pipeline

**This section replaces the pre-review v1's inconsistent `{verdicts, usage, exit}` prose shape**
(which conflicted with `schemas/verdict.v1.json`'s actual top-level shape,
`{schema_version, verifier, verdicts}` — review blocker 7). There is now exactly one envelope:

```
WorkerResult {                          // src/drive/worker-result.ts — the PROCESS-level wrapper
  exit:  number                         // the backend process's own exit code — AUTHORITATIVE
  usage: { input, output, cache_read, cache_creation }
  rawText?: string                      // what the process printed; absent iff nothing usable was
                                        // produced (killed, crashed, true timeout)
  dispatchModel?: "session" | "flat"    // adapter-set (M3.2), mirrors capabilities.sessionResume;
}                                        // lets accounting cost declared-flat turns honestly
```

`schemas/verdict.v1.json`'s document (shape (b) above) is what's INSIDE `rawText` once every
check passes — it is never confused with the envelope again.

**Authoritative exit is the PROCESS exit code, not anything inside the parsed body** (blocker 7's
explicit ruling). `src/drive/worker-result.ts`'s `resolveTurn(dispatchState, result)` buffers a
complete turn and applies it only after, IN ORDER:
1. `result.exit === 0` — a nonzero exit discards the call EVEN IF `rawText` looks like a
   well-formed verdict (a backend that prints a plausible verdict and then crashes must not have
   it applied — this exact scenario is a named test, `test/drive/worker-result.test.ts`).
2. `result.rawText` is present and parses as JSON.
3. `bindVerdicts` accepts the parsed body (tier match, raw-shape validity, document validity).

**On failure at ANY stage, every verdict from that call is discarded — never partially applied.**
Previously-committed turns for the same claim are untouched by a later turn's rejection (a
driver-loop invariant — implemented by M3.6's `src/drive/driver-run.ts`, which consumes this
two-shape pipeline end-to-end; `src/drive/driver-verdict-map.ts` is the bound-verdict →
af-apply-item translation, deliberately tiny and isolated because it decides what becomes a
validated ledger event — L6-flagged for the M3 boundary Tier A review before any live-fire); a
rejected or never-attempted item is reported explicitly, never silently dropped, consistent with
PRD C5's "never silently dropped" ethos applied to this domain.

**Exit-code discipline (self-teaching, af-style)** — this table is about the WORKER PROCESS's own
exit code (`WorkerResult.exit`), distinct from `TurnOutcome.stage`, which is `resolveTurn`'s own
post-hoc classification of why a call didn't apply:

| code | meaning | driver action |
|---|---|---|
| 0 | process succeeded, `rawText` should contain a verdict | proceed to parse + bind (may still be rejected at those stages) |
| 10 | timeout | see "Retry ownership" below — never a blind resume |
| 11 | budget exceeded | stop dispatching further turns on this session; report, do not retry blindly |
| 12 | schema-invalid output | exit was 0 but parsing/binding failed — log the rejection reason (`TurnOutcome.issues`), never apply a partially-valid document. Encoding tolerance (GAP 7a): `toDispatchedTurn` strips at most one surrounding markdown code fence and requires the whole remainder to parse to exactly one JSON object; ambiguous output (prose around JSON, multiple objects, a bare array/primitive) still fails 12. On a parse/extraction failure the driver persists a `parse-failed` driver-log record — node, role, and a bounded 500-char raw snippet — so the model's output is recoverable, never lost behind the bare "worker exit 12" reason |
| 13 | backend unavailable | fall back per `.rk/config`'s per-role×tier fallback chain (M3.2); if none, abort the claim |

Any other nonzero code the backend's own process naturally returns (crash, killed) is treated as
13 by the driver's wrapper, never surfaced as a silent success.

**Bounded schema repair (rk-xxp, GAP 11).** Before a code-12 turn becomes terminal, the driver
dispatches AT MOST ONE repair reprompt on the SAME session, echoing the concrete `RawIssue[]`
(path + message) and asking for the corrected object only, with the assessment unchanged. Exactly
one attempt, ever — structurally, not by a counter: the repair path dispatches directly and never
re-enters itself. A repair that also fails is a normal terminal 12, and the ORIGINAL failure
representation is preserved verbatim (a parse-failed stays parse-failed). A repaired reply carries
NO extra trust: identical raw-shape validation, identical `bindVerdicts`, identical hash and
cross-vendor checks, and no field is ever copied to satisfy a missing one (`verdict.reason` never
becomes `justification`). The repair turn is a real backend turn: its usage is logged as its own
`usage` record (flagged `repair: true`) and accrues to the campaign budget. Codes 10/11/13 are
never repaired — 11 in particular must never provoke more spend. The incident this rule exists for
burned 96,066 tokens across three identical rejected turns and applied zero nodes.

Reality note (M3.2 live-fire, docs/memos/2026-07-19-m3.2-backend-livefire.md): codes 10-13 are
ADAPTER-COMPUTED classifications of raw process/timeout/API-error behavior — no real CLI emits
them natively; the adapter maps observed behavior onto this table. Code 11 specifically is a
post-hoc heuristic for both current adapters (`usage.output >= maxOutputTokens` after the fact),
since neither CLI exposes a per-turn output-token cap flag — a known contract-vs-reality gap
until a WP finds an enforcement mechanism; the budget is therefore a detection threshold, not a
hard limit, and campaign budgeting must not assume mid-turn cutoffs.

## (d) Caching obligations (driver-side, from the M3.0 spike)

**Wording discipline (follow-ups 2-7): every claim below is tagged MEASURED, INFERRED, or POLICY
so a future reader cannot mistake a conservative design choice for a proven universal law.** The
spike measured 14 calls on one model, one backend, one host; several of the rules below are
sound engineering decisions that go beyond what was directly measured, and this section now says
so explicitly rather than implying more confidence than the data supports.

1. **Stagger rule — POLICY, motivated by ONE measured trial.** The first call of every
   same-prefix group (a new session's turn 1) is dispatched alone, awaited to its first streamed
   token, before any other call sharing that prefix fires. MEASURED: one concurrency trial pair
   showed an asymmetric outcome (one caller hit, one paid a full redundant write) — a single data
   point, not a proof of universal race behavior. The "await first streamed token" mechanic and
   "no escape/no configuration override" are POLICY choices this contract adopts conservatively
   given that one data point and the documented worst case, not additional measured facts.
   SCOPE AS IMPLEMENTED (M3.3, `src/drive/scheduler.ts`): "sharing that prefix" is read
   CAMPAIGN-WIDE — every first-call in a schedule is globally serialized, not merely first-calls
   within the same content group — because the spike's Finding 5 showed a common CLI-level root
   prefix is shared by every call regardless of group content. This is the conservative reading;
   it can bottleneck a large multi-group batch, and same-group-only serialization is the flagged
   alternative for the M3 milestone review to ratify or relax.
2. **Shared-context group floor: >= 3 items — POLICY, pricing-derived, not a measured batch
   result.** Given the MEASURED 1-hour cache-write tier (see item 5), a write costs 2x; a group
   of 1-2 items is arithmetically not a caching win. No 3-item (or larger) batch was actually run
   through this spike — this is a scheduling heuristic sound on the measured per-token economics,
   not itself a measured outcome.

   CONCRETE VALUES AS IMPLEMENTED (M3.3, `src/drive/scheduler-defaults.ts`, pending promotion to
   `.rk/config`): prefix staleness threshold 45 min (conservatively inside the OBSERVED 1-hour
   tier — scheduling never assumes survival near an unmeasured boundary), shared-context floor 3,
   burst 4, per-tier concurrency caps 6 (L5 soft) / 3 (hard). NORMATIVE cache-fraction
   definition (M3.9 reports this; `src/drive/accounting.ts` computes it):
   `cacheFraction = cache_read / (input + cache_read + cache_creation)`, token-weighted, output
   tokens excluded.
3. **Minimum cacheable prefix: ~4096 tokens — DOCUMENTED BACKGROUND, not measured by this spike,
   and model-specific.** This threshold comes from `shared/prompt-caching.md`'s stated minimum
   for the tested model tier; the spike did not probe the boundary directly. Treat "shared
   context under ~4k tokens" as not worth engineering a cache win around.
4. **`--exclude-dynamic-system-prompt-sections` as a fixed, campaign-wide worker setting for the
   claude backend.** MEASURED: this flag changes and shrinks the CLI's own fixed prefix (a direct
   before/after comparison in the spike). INFERRED, not measured: that this specifically helps
   cross-host cache-sharing on a multi-machine campaign — a reasonable inference from what moved
   out of the system prompt, never tested across more than one host. Toggling the flag mid-
   campaign is itself a cache-invalidating event either way; pick it once at `rk init`/`.rk/config`
   time regardless of which justification carries more weight for a given campaign.
5. **1-hour TTL — MEASURED presence and ONE 180-second survival point; NOT a measured expiry
   guarantee.** Every call in the spike reported activity entirely under
   `ephemeral_1h_input_tokens`; `ephemeral_5m` was zero throughout, and the 180-second gap tested
   held. **Tier A review's forced correction (rejecting the original combined ruling): do NOT
   promise cache survival for scheduling arbitrarily close to the one-hour boundary.** The
   original repair-candidate text conflated "observed 1h tier + 180s survival" with "safe to
   schedule right up to the boundary" — those are not the same claim, and only the former is
   measured. Batch-window scheduling may rely on the observed tier and the one confirming gap;
   it may NOT rely on an assumed precise expiry point.
6. **Never build a turn as `shared_prefix + item` concatenated into one string, even inside a
   single session-resume turn — MEASURED for the case that matters (cross-call reuse, Finding 1)
   and NOT separately measured for a same-turn variant.** Follow-up 7: "repeating context on a
   resumed turn was not tested directly; the flat-prompt experiment does not prove identical
   resume behavior." The rule is retained as sound conservative policy (there is no known reason
   a resumed turn's cache mechanics would behave better than the flat-prompt case already
   measured to fail), but it is POLICY extending a measured result by analogy, not a directly
   measured fact about resumed turns specifically.

## (e) Identity

Every verdict document carries the **verifier identity**: `modelFamily`, `backend`, `model`, and
`sessionId`, plus an optional `batchId`. This entire object is **DRIVER-CONSTRUCTED from
immutable dispatch state** (`src/drive/bind-verdicts.ts`'s `DispatchState.verifier`) — **NEVER
worker output** (review blocker 5's fold-in of blocker 1's enrichment principle: a worker
self-reporting its own family would let the same underlying model report inconsistent or
self-serving families across calls, silently defeating the cross-vendor comparison M3.8 depends
on). This is **driver-supplied provenance — recorded and mechanically checkable, NOT
adversary-proof** (the C3 honesty rule, stated at exactly this strength and no further): nothing
here cryptographically binds a backend process to its claimed identity; the trust anchor remains
the driver's own process discipline and the role-isolation enforcement in section (a).

**`modelFamily` is a closed, driver-registry vocabulary of REAL vendor lineages: `claude` |
`gpt` | `gemini` — as of today** (`src/drive/vocab.ts`'s `MODEL_FAMILIES`).

**Validated at run start, fails closed (rk-9zd, 2026-07-25).** A backend's `modelFamily` is read
off the RESOLVED BACKEND INSTANCE and checked against `MODEL_FAMILIES` before the af preflight and
before any session is created — an absent, non-string or out-of-vocabulary family aborts the run
with exit 1 and zero spend. It is never inferred from the backend's NAME: the previous derivation
(`backendName === "codex" ? "gpt" : "claude"`) silently mapped every unrecognized name to the
`claude` family, which is fail-OPEN in a function feeding the cross-vendor inequality. **A third
backend must therefore DECLARE its family**; the contract will not guess one for it. No model
string is a parameter of the resolution, so a `--model` flag or a per-assignment `model` override
cannot reach it.

**Two vendors are a precondition of promotion, not a surprise (rk-id1).** PRD C9 requires the
verifier's family to differ from the prover's on every load-bearing claim. A roster whose prover
and verifier resolve to the SAME family can still run — prover turns and challenges do real work —
but no node on the critical path will ever be promoted to `proved`. The driver states this at
preflight, before any spend, naming the config key to change. Configure a second vendor, or work
the claim at the l5 soft tier.

Review blocker 5's two removals, both deliberate:
- **`codex` is removed.** It is a backend/product name, not a model lineage — codex fronts
  OpenAI models, whose family is `gpt`. The pre-review enum conflated the two, so "the same
  OpenAI model can be recorded as family `codex` in one verdict and `gpt` in another" (the
  review's exact failure scenario), defeating the cross-vendor inequality check.
- **`other` is removed.** A catch-all cannot distinguish one future family from another — two
  verdicts both tagged `other` would compare equal (`other !== other` is false), producing a
  false SAME-family read for two backends that might be entirely different vendors.

Extending this enum is a `schema_version` bump plus a fixture (CLAUDE.md rule 10), never a silent
string-literal addition.

**Seam encoding into `../vibefeld`'s free-text fields (blocker 5's other required fix).**
`../vibefeld`'s V1 schema addition stores only a plain string on `NodeValidated.VerifiedBy` /
`ChallengeRaised.RaisedBy` — no structured identity object exists there, and no vibefeld changes
are in scope for this WP. `src/drive/identity.ts`'s `encodeVerifierSeam`/`decodeVerifierSeam` is
**THE one canonical, lossless encoding**: `family|backend|model|sessionId`, joined and split on
`|`. Losslessness is an ENFORCED invariant, not a hope — `encodeVerifierSeam` refuses (returns
`{ok:false}`) rather than silently mangling the round trip if any component itself contains `|`.
M3.8's cross-vendor check MUST decode both the prover's and the verifier's recorded identity
strings through `decodeVerifierSeam` before comparing `modelFamily` — never a bespoke parse, and
a decode failure must be treated as "family unknown, cross-vendor check cannot proceed," never as
a silent pass.

**Prover-of-record precedence (GAP 9, RUN-REPORT-8, 2026-07-20).** The PROVER-side identity the
check decodes is the node's **`proof_author` when present, else its `author`**
(`src/drive/cross-vendor.ts`'s `proverOfRecord`, both fields read off `af export --graph json`).
For a node DECOMPOSED via `af record-proof`, the prover-of-record is the DECOMPOSER — af stamps
the acting prover onto the parent as `proof_author` (`../vibefeld` `node_proof_authored`,
`FeatureProofAuthor`), symmetric with the `author` stamp its children already carry — NOT its
content `author`, which for a root is the `af init` stamp (e.g. an orchestration identity that
decodes to no family). This is exactly the RUN-REPORT-8 wall: a fully-decomposed root whose
children all validated cross-vendor still failed closed as `prover=unknown` because the gate read
the init `author`. The verifier side is unchanged. Fail-closed is untouched for a genuinely
unattributed proof: a node with neither `proof_author` nor a parseable `author` still yields
`identity-unparseable` and blocks on a load-bearing claim, exactly as before.

## (f) Hash domains (review blocker 4 — pinned byte-for-byte)

`contentHash` does NOT mean the same bytes across tiers, and the two domains must never be
compared to each other:

- **L5 tier (`l5ContentHash` in `schemas/verdict.v1.json`): lowercase hex SHA-256 of the RAW
  SHARD-FILE BYTES, with NO normalization** — no whitespace trimming, no re-encoding, no
  frontmatter parsing, exactly the bytes on disk at dispatch time. This is the SAME domain the
  M3.7 L5 verdict store recomputes to decide staleness.
- **Hard tier (`hardContentHash`): `../vibefeld`'s OWN `Node.ComputeContentHash()` value**
  (`internal/node/node.go`) — SHA-256 hex over the canonical string
  `type:<type>|statement:<statement>[|latex:<latex>]|inference:<inference>[|context:<sorted,
  joined>][|dependencies:<sorted,joined>][|validation_deps:<sorted,joined>]`. This is af's own
  field concatenation, NOT the rendered prompt bytes an L5 dispatch would hash, and it already
  excludes workflow/provenance metadata (`Author`, `ValidatedBy`, `ValidationBatchID`) by
  construction — stable across those fields changing, but a different domain from a raw shard
  file's bytes regardless.

**The driver verifies the current source hash against the pinned domain for the tier both BEFORE
dispatch (so a stale prompt is never sent) and BEFORE apply (so an edit landing mid-flight cannot
be silently absorbed).** This verification is edge-code (it touches fs), out of this WP's pure-
module scope, but is a hard requirement on whichever future WP implements the driver loop.

**Reserved, NOT built**: a canonical `inputHash` covering the FULL verification input (dependency
and rubric changes too, not just the node's own content) would let staleness track more than the
node's own bytes — explicitly out of scope here per the review's own scope limit ("if the full
verification input must stale on dependency/rubric changes, add a separate canonical inputHash").
Adding it is a `schema_version` bump when and if it is wanted.

## (g) Outcome transition semantics (review blocker 6)

- **`VALID-WITH-CORRECTION` requires a structured `correction` field** (`{description,
  correctedContentHash}` — `schemas/verdict.v1.json`'s `verdictItemL5Correction`), forbidden on
  every other verdict. **Promotion on this verdict is FORBIDDEN until a fresh dispatch
  re-verifies and re-binds against `correction.correctedContentHash`** — the original
  `contentHash` refers to the PRE-correction bytes, so promoting on the strength of that hash
  while the corrected bytes were never independently re-checked is exactly the false-freshness
  failure mode this rule guards against. `src/drive/bind-verdicts.ts`'s
  `correctionRequiresReVerificationBeforePromotion` states this as a callable code artifact
  (always returns `true`) for the M3.7 verdict store (not yet built) to depend on — the rule
  exists in code, not only in this prose.
- **A hard-tier `challenge` means NOT-ACCEPTED-THIS-TURN, regardless of `severity`.** There is NO
  accept-with-advisory-challenge shape in v1 — a `minor`/`note` severity challenge is provenance/
  routing detail (how urgently it should be triaged), never an acceptance switch, unlike
  `../vibefeld`'s OWN `SeverityBlocksAcceptance` (which lets `minor`/`note` not block there).
  `src/drive/bind-verdicts.ts`'s `hardChallengeAcceptsThisTurn` always returns `false` for every
  severity, matching this rule as a callable code artifact. A future v2 could introduce an
  accept-with-advisory shape for low severities — explicitly out of scope here.

## Retry ownership (Q3 ruling)

**Retries belong to a shared driver component, not to individual backend adapters.** Q3: "retries
belong to the shared driver, with caps/backoff in config; adapters perform one attempt, and
ambiguous timeout retries require a new session or idempotent `turnId`, never blind resume." A
backend adapter (a future `src/drive/{claude,codex}-backend.ts`) makes exactly one attempt per
call; a retry after exit 10 (timeout) is the shared driver's decision, governed by caps/backoff
in `.rk/config`, and MUST either open a fresh session or reuse the SAME `turnId` (an idempotency
key — see "(b) Request shape") so a backend that actually completed the original call despite an
apparent timeout can be recognized as a duplicate rather than double-applied. This shared retry
component is not built in this WP; this section records where it belongs so a future WP does not
reinvent per-backend retry logic ad hoc.

## Justification is checked structurally only (follow-up 1)

The honesty limit stated in "(e) Identity" above — "driver-supplied, recorded and mechanically
checkable, not adversary-proof" — applies just as much to `justification`. `schemas/
verdict.v1.json`'s `minLength:1` (plus `src/drive/verdict-raw.ts`'s whitespace-trim check) proves
only that SOME non-blank text was supplied. `"OK"` passes. **Substantive per-item reasoning is
NOT mechanically established by this contract, its schema, or its validator** — that remains a
human/audit-time judgment (`rk audit`, M5.1's overclaim hunter), never a wire-contract guarantee.

## Cross-repo seam fixture (follow-up 8)

`src/drive/vocab.ts`'s `SEVERITIES`/`CATEGORIES` are documented as byte-identical to
`../vibefeld`'s `ChallengeSeverity`/`ChallengeCategory` Go enums. `test/drive/
vibefeld-seam-fixture.test.ts` reads those Go source files DIRECTLY (never a hand-copied string
list, never vibefeld's compiled output) and fails the moment they diverge — the same "cross-repo
smoke test" class CLAUDE.md §5 describes for af/fr binaries, applied to an enum-vocabulary seam
instead of a binary version. Confirmed to catch drift: a spot mutation adding a fifth severity
value to `vocab.ts` alone (not mirrored in vibefeld) turned this fixture red immediately.

## Validator not in the red corpus (follow-up 9) — deliberate

`src/drive/verdict-schema.ts`/`verdict-raw.ts`/`bind-verdicts.ts` guard real validity failures but
are NOT represented under `corpus/` alongside the six M0 gates. This is a DELIBERATE choice,
consistent with precedent: `src/graph/validate.ts` (M2.1) is likewise a validity-guarding module
tested entirely through its own `bun:test` suite (`test/graph/*.test.ts`), never through
`corpus/<gate>/` fixtures, because `corpus/` is specifically the six-gate `rk check` fixture
ledger (`corpus/README.md`'s own stated scope) — a structurally different mechanism (gate `Finding`s
+ coverage lines) from a request/response-binding validator's issue list. The task brief for this
WP states the same thing explicitly: "no corpus dir for drive yet — tests carry the red cases."
Coverage instead: 183 tests across 7 files in `test/drive/`, none of which is a corpus fixture,
all of which are red-first per CLAUDE.md L1.

## Open questions — RESOLVED (Tier A review rulings, 2026-07-19)

1. **Codex backend session semantics — RESOLVED.** Ruling: "Codex defaults to
   `dispatchModel:'flat'` until a Codex-specific spike proves continuation semantics; do not
   infer them from Claude." This is now the stated default in section (a) — `codex` is NOT
   assumed session-capable anywhere in this contract until measured.
2. **Budget unit — RESOLVED.** Ruling: "use structured integer token limits on the worker wire,
   not an ambiguous scalar or dollars; keep dollar campaign budgets and versioned price
   conversion driver-side." Implemented in section (b)'s `budget: {maxTotalTokens,
   maxOutputTokens?}`.
3. **Retry-semantics ownership — RESOLVED.** Ruling: "retries belong to the shared driver, with
   caps/backoff in config; adapters perform one attempt, and ambiguous timeout retries require a
   new session or idempotent turnId, never blind resume." See "Retry ownership" above.
4. **Request-shape schema validation — RESOLVED.** Ruling: "a second JSON Schema is unnecessary
   while requests are internal, but TypeScript types alone are insufficient — add runtime
   request/session invariant validation and property tests; add a schema if requests become a
   serialized plugin boundary." Implemented as `src/drive/session.ts`'s `validateSessionRequest`
   plus `test/drive/session.test.ts`'s property suite — no `WorkerRequest` JSON Schema exists or
   is planned unless requests cross a process boundary in the future.
5. **`verdicts[]` cap per call — RESOLVED.** Ruling: "cap each session turn at exactly one
   verdict; the batch cap limits turns." Implemented as `minItems:1`/`maxItems:1` in
   `schemas/verdict.v1.json` and enforced in `src/drive/verdict-schema.ts`; M3.4's batch cap
   (default 10) limits TURNS per claim, never verdicts inside one reply.

**Forced decisions — ratify/reject outcomes, recorded verbatim:**
- **RATIFY**: session/turn dispatch for batching, with an explicit non-cache-credited flat
  fallback (section (a)).
- **REJECT as originally combined**: "the ≥3 floor + 1h TTL scheduling" decision as first
  written — the ≥3 economic floor is RATIFIED, but the corrected ruling records ONLY an observed
  1-hour tier and a 180-second survival point, NOT a measured expiry guarantee (see "(d) Caching
  obligations," item 5, for the corrected text).
- **RATIFY**: byte-for-byte `../vibefeld` challenge vocabulary (severity/category) — see the
  cross-repo seam fixture section above.
- **REJECT**: the original closed `modelFamily` enum (`claude|codex|gpt|gemini|other`).
  Closedness itself is RETAINED, but re-defined after removing the backend/catch-all ambiguity —
  see "(e) Identity" for the corrected `claude|gpt|gemini` enum and its rationale.

No further open questions remain from the M3.1 spec-writing phase; residual concerns are the
follow-ups already folded into this document (justification honesty, wording attributions, the
cross-repo fixture, the corpus-placement note) plus the cross-repo items already queued in
`../vibefeld`'s tracker (V2/V3) and the M3.2 codex-session spike named in ruling 1 above.
