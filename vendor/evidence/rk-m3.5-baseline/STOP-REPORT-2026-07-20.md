# M3.5 SC4-baseline live session — STOPPED before any real spend (2026-07-20)

ROLE: durable stop-report banked by the M3.5 baseline operator. No live worker was
dispatched; zero real tokens spent. This records WHY the session halted at preflight and
what must change before it can run.

## Verdict

The M3.5 SC4-baseline session as specified in
`rk/docs/memos/2026-07-19-m3.5-baseline-runbook.md` (incl. §10 addendum) **cannot be
executed with the current machinery.** Halted at the preflight gate (runbook task step 1:
"re-verify the dry-run still looks sane" against the changed driver semantics). It does
not look sane. Stopping is a CLAUDE.md §7 stop condition ("a PRD/plan conflict or gap
discovered mid-WP → surface it, pick nothing silently") and the task brief's own rule
("if you find an rk bug mid-run, that is likely an abort criterion — check §7, stop,
report").

## Root cause: the live driver is VERIFIER-ONLY; the workspaces are UNSEEDED

The runbook's premise (§1, from IMPLEMENTATION_PLAN.md M3.5): "re-proves 2-3
already-validated AISM lemmas *from fresh workspaces*, recording tokens+calls per
validated node." That requires a PROVER to produce proof content that a verifier then
judges. The landed machinery does neither half of that for these dirs:

1. **`rk verify --af <id> --live` dispatches VERIFIER turns only.** There is no prover or
   seeding dispatch anywhere in the loop. `src/drive/driver-run.ts` header, verbatim:
   "Prover/seeding dispatch (producing the proofs a verifier then judges) is NOT driven
   here ... seeding a fresh workspace is a separate WP (see the WP report's deferred-split
   list)." Confirmed: `rk` has no `prove`/`seed` subcommand (full CLI surface checked);
   the only worker-dispatching command is `rk verify --af --live`.

2. **The three fresh workspaces are unseeded pending conjectures.** Each
   `proofs/<id>/` root node `1` is `epistemic_state: pending`, zero proof steps (runbook
   §4, and confirmed live via `af status`). Crucially, **af itself classifies node 1 as a
   PROVER job**, not a verifier job:
   ```
   --- Jobs ---
     Prover: 1 nodes awaiting refinement
     Verifier: 0 nodes ready for review
   ```

3. **rk's readiness proxy misclassifies these nodes as verifier-ready.**
   `isVerificationReady` (`src/drive/driver-plan.ts`) = `epistemicState === "pending" &&
   workflowState !== "blocked"`. Node 1 is pending and `workflow_state: available` (from
   the ledger), so rk reports it "verification-ready" — directly contradicting af's own
   "0 nodes ready for review." This is the exact flagged limitation in that file's header:
   "export v1 carries no explicit 'ready' flag, so this two-axis read is the closest
   faithful proxy." Here the proxy is wrong: an unproven pending node is a prover job.

## What would happen if run anyway (why it is a §7 abort, not a thing to grind through)

`rk verify --af <id> --live --max-campaign-tokens 500000` would:
create a real verifier session (real tokens) → dispatch a verifier turn on an unproven
conjecture with no proof body (real tokens) → the verifier cannot ACCEPT a proof that does
not exist → no accept → `roundsWithoutProgress` climbs → abort `stuck-no-progress` (or the
verdict maps to a challenge and the root stays unvalidated → abort `root-unvalidated`, per
M3 blocker 2, `driver-run.ts:353-356`). Net: real TJO-authorized tokens burned, zero
validated nodes, **no SC4 denominator produced** — the precise expensive-surprise the §7
cost ceiling exists to prevent. The abort is provable from the code + af state without
spending a token, so spending to "demonstrate" it would itself violate the spend
discipline.

## Preflight steps that DID pass (so the gap is isolated to the above)

- `bun test` 1762 pass / 1 skip / 0 fail; `bun run selftest` OK (122/122). dist/rk rebuilt
  from master tip `a3b1f63` (carries the M3 repair wave).
- Both backend CLIs present: `claude` 2.1.215, `codex` 0.144.6.
- Config validation clean for all three dirs (run A `config.json` and run B
  `workers.reverse.json`): `checked config: 3/3 ... valid`.
- Dry-run clean for all three (`rk verify --af <id> --dry-run`): each reports
  `workspace: proofs/<id> (1 node(s))`, `verification-ready now (1): 1`, `token usage: 0`.
  The dry-run "looks fine" only because it never asks whether a pending node has a proof to
  verify — which is exactly the blind spot.

## What must change before a re-run (for the orchestrator / TJO to decide — not chosen here)

Options, surfaced not selected (§7 "pick nothing silently"):
- (a) Land the deferred prover/seeding dispatch WP so `--live` (or a new `rk prove`) can
  produce proof content the verifier then judges — the only path that measures the SC4
  "re-prove from fresh workspace" denominator the plan actually names. IMPLEMENTATION_PLAN
  M3.6's acceptance bar "Re-proves one AISM lemma end-to-end" is likewise NOT met by the
  verifier-only driver; this gap is upstream of M3.5.
- (b) Re-scope the baseline to a VERIFY-only denominator: pre-seed each fresh workspace
  with the original AISM proof content (from the read-only AISM workspace) so the verifier
  has something real to check, and measure verifier tokens/calls. This changes what SC4
  measures (verification cost, not re-proof cost) and needs a plan amendment + the runbook
  premise rewritten — an explicit decision, not an operator improvisation.
- Either way the runbook's §5.2/§10(A) "per-node verifier turns → bind → af apply"
  pipeline description is incomplete: it omits that nothing feeds the verifier a proof.

## Beads to file (recommended; not filed by me — task barred touching the rk repo tree)

- NEW (P1, bug/plan-gap): "M3.5 baseline blocked: live driver is verifier-only + fresh
  workspaces unseeded → no prover produces proof content; isVerificationReady misclassifies
  unproven pending nodes as verifier-ready (af says Prover job). Land seeding WP or re-scope
  baseline. Upstream of M3.6 're-proves end-to-end' acceptance bar."
- `rk-mq2` (batch_id:'' live-fire confirm) — NOT resolvable this session; its own text
  gates it "during the M3.5 baseline live-fire before any real spend," which was never
  reached. Leave open.

## Ledger

- Real tokens spent: 0. Live worker calls: 0. AISM: untouched (read-only, `af status`/reads
  only). rk repo tree: untouched except `dist/rk` rebuild. All writes here in
  `../rk-m3.5-baseline/`.
