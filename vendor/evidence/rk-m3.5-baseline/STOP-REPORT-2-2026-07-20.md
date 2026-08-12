# M3.5 SC4-baseline live session (RELAUNCH) — STOPPED at the model-pin gate (2026-07-20)

ROLE: durable stop-report banked by the M3.5 baseline operator (relaunch). No live worker
was dispatched; zero real tokens spent. STOP-1 (verifier-only driver / unseeded-workspace
gap) is RESOLVED and re-verified below. This relaunch halts at a DIFFERENT, newly-isolated
gap: the machinery cannot honor the TJO worker-model pin.

## Verdict

The relaunch cleared every preflight gate that STOP-1 flagged — the prover-dispatch half
landed, af's authoritative readiness flags are consumed, the FU5 features preflight passes.
It halts one gate later, at the §11/task-brief **worker-model pin**, because rk's `--model`
is a SINGLE GLOBAL value handed to BOTH backends. The pin ("claude side runs
`--model claude-opus-4-8` explicitly; codex side uses its default") is **not expressible with
the current CLI**: there is no per-backend model selection anywhere (flag, config, or env).
Every way of proceeding either breaks the codex cross-vendor side or measures the SC4
baseline denominator against the wrong model — a first-order decision about what SC4 *means*,
not an operator's call to make silently. Stopping is CLAUDE.md §7 ("a PRD/plan conflict or
gap discovered mid-WP → surface it, pick nothing silently"), reinforced by §3 (model policy
is a TJO-directive domain) and the task brief ("a mid-run rk gap is likely a §7 abort — stop,
report, never patch around").

## Root cause: rk has no per-backend model selection; the pin needs two different models

The pin requires claude=`claude-opus-4-8` AND codex=its default (`gpt-5.1-codex`) in the SAME
run. rk cannot do this:

1. `rk verify --live` parses ONE `--model` flag (`src/cli/verify.ts:124`, passed through at
   `:163`).
2. That one value is applied to BOTH the verifier model and the prover model
   (`src/cli/verify-live.ts:117` and `:130` — both `opts.model ?? DEFAULT_MODEL_BY_BACKEND[...]`).
3. Each backend forwards it verbatim: claude via `--model <m>`
   (`src/drive/backend-claude.ts:104`), codex via `-m <m>` (`src/drive/backend-codex.ts:151`).
   Neither backend guards for a foreign-family model id.
4. `.rk/config.json`'s `workers.assignments.<role>.<tier>` entry is shape
   `{ backend, fallbacks }` ONLY — `validateAssignmentEntry`
   (`src/drive/backend-registry.ts:40-61`) REJECTS any other key, so a per-assignment `model`
   cannot be added there.
5. No env-var path: backend-claude always writes `--model spec.model` on the command line
   (`:104`), overriding any `claude` CLI config.

Consequence, per run:

- **run A** (prover=claude, verifier=codex): node 1 is verifier-ready, so the FIRST real call
  is the codex verifier. With `--model claude-opus-4-8` it is invoked as
  `codex ... -m claude-opus-4-8` — a Claude model id handed to codex → session/turn fails at
  the first call. Also flatly violates "codex side uses its default."
- **run B** (prover=codex, verifier=claude): same collision, codex prover gets the Claude id.
- **Omitting `--model`** → claude=`claude-sonnet-4-5`, codex=`gpt-5.1-codex`. Cross-vendor
  intact, never Fable, and §11 explicitly calls sonnet-default "also permitted" — BUT it
  measures the SC4 denominator against **sonnet, not the opus TJO pinned explicitly**. SC4 is
  a one-shot baseline M3.9 compares future runs against; silently substituting the model
  contaminates that comparison.

There is no configuration of the current rk that produces "claude=opus-4-8, codex=default."
The thing the pin describes is impossible, not merely inconvenient — hence escalate, not
improvise.

## Preflight gates that DID pass (so the gap is isolated to the model pin)

- `bun test`: 1817 pass / 1 skip / 0 fail (1818 total). `bun run selftest`: OK (122/122
  fixtures, purity 98/98 + 24/24, all corpus green). `dist/rk` rebuilt from master tip
  **726813e** (the commit carrying prover-dispatch + af-kernel-guard consumption).
- Backends present: `claude` 2.1.215, `codex` 0.144.6, `af` 0.1.5.
- **STOP-1 RESOLVED — af features preflight (FU5) passes.** `af export --graph json` on all
  three dirs emits `features: [readiness-flags, closure-flag, node-dependencies]`, exactly
  `REQUIRED_AF_FEATURES` (`src/drive/driver-af.ts:107`). The af binary is NOT stale.
- **STOP-1 RESOLVED — readiness now reads af's authoritative export flag, not the misleading
  `af status` summary.** For node 1 the export sets `verifier_ready: true` (pending/available,
  childless, no blocking challenge → af's `internal/jobs` classifier makes it a VERIFIER job:
  the verifier looks first and challenges an unproven claim, which flips it to a prover job).
  `af status` still prints "Prover: 1 / Verifier: 0" from its coarser non-authoritative
  `internal/render/status.go` heuristic — the classifier that misled STOP-1. rk correctly
  ignores it (`src/drive/driver-plan.ts:14-27` documents both classifiers and reads only the
  flags). The dry-run's "prover-ready (0) / verifier-ready (1)" split is now TRUTHFUL.
- **The prove→verify half landed** (STOP-1's core gap): `src/drive/driver-run.ts:139-160`
  dispatches a PROVER turn per prover-ready node and records its decomposition; the verify
  half re-binds hashes and applies (`:162-210`); convergence requires an af-`validated` AND
  af-`closed` root (`classifyRootConvergence`, `:78-90`). An unseeded workspace is no longer a
  guaranteed stuck-abort — the verifier's challenge on the bare conjecture now has a prover to
  address it.
- Config validation clean for all three dirs, both directions (`config.json` run A and
  `workers.reverse.json` run B): `checked config: 3/3 ... valid`.
- Dry-run clean for all three (`rk verify --af <id> --dry-run`): `workspace: proofs/<id>
  (1 node(s))`, `verifier-ready now (1): 1`, `per-node dispatch (1): 1`, `token usage: 0`.

## What must change before a re-run (for TJO to decide — nothing chosen here)

Options, surfaced not selected (§7 "pick nothing silently"):

- **(a) Add per-backend model selection to rk** (source change, NOT this operator's to make —
  task bars touching rk source). Minimal shape: accept a per-assignment `model` in
  `.rk/config.json`'s `workers.assignments.<role>.<tier>` (extend `RoleTierAssignment` +
  `validateAssignmentEntry`, a schema/compat event per CLAUDE.md Rule 10), or a
  `--prover-model`/`--verifier-model` flag pair. Then the pin ("claude=opus, codex=default")
  becomes expressible and both runs A/B are honorable as written. This is the only path that
  produces the baseline the pin actually describes. File as a bead (candidate below).
- **(b) TJO amends the pin** to accept the sonnet default on the claude side for this baseline
  (§11 already calls it "permitted"). Then re-run with NO `--model` flag — compliant, zero
  code change — accepting that the SC4 denominator is measured in sonnet. A documented
  decision, recorded as a dated addendum to the runbook, not an operator improvisation.
- **(c) TJO confirms a different mechanism** (e.g. a claude-side wrapper binary pinned to
  opus so `--model` need not be passed) — but backend-claude always writes `--model` on the
  command line, so a wrapper would have to ignore/override it; not obviously clean.

Recommended: (a) if the opus baseline is load-bearing for the SC4 measurement (it is a
one-shot denominator); (b) if TJO judges a sonnet baseline acceptable and wants the session to
proceed now. Either way it is a TJO decision, because it decides what SC4 measures.

## Candidate beads (NOT filed — task confines writes to ../rk-m3.5-baseline)

- NEW (P1, machinery gap): "rk verify --live has no per-backend model selection: one global
  `--model` is handed to BOTH prover and verifier backends
  (src/cli/verify-live.ts:117,130), and `workers.assignments` config carries no `model` field
  (backend-registry.ts:40-61 rejects it). A cross-vendor run (claude+codex) therefore cannot
  pin the claude side to opus while leaving codex on its default — the exact TJO M3.5
  worker-model pin (bd memory m3-5-model-policy-tjo-2026-07-20). Blocks the M3.5 baseline.
  Fix: per-assignment `model` in config (compat event, Rule 10) or `--prover-model`/
  `--verifier-model` flags."
- `rk-mq2` (batch_id:'' live-fire confirm) — still NOT resolvable: its own text gates it to
  the live-fire, never reached. Leave open. (Code inspection note only: the hard-tier path
  DOES issue single-item non-batch applies with `batch_id: ""` — `driver-run.ts:201` builds
  `{ ...batch_id: "", ...items:[{...}] }` per node — so the assumption behind rk-mq2 is
  consistent with the code, but live confirmation that af *accepts* it is still pending.)
- `rk-6nv` (prove→verify termination on a real lemma; challenge→prover-flip + refine-author
  recording) — still NOT resolvable: requires a live run, never reached. The machinery to
  exercise it now EXISTS (STOP-1's gap closed), so rk-6nv is unblocked *pending the model-pin
  decision above*. Leave open.

## Ledger

- Real tokens spent: 0. Live worker calls: 0. AISM: untouched (read-only). rk repo tree:
  untouched except `dist/rk` rebuild. All writes here in `../rk-m3.5-baseline/`.
- Wall-clock: preflight + isolation only; no run executed.
