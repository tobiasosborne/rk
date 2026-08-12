# M3.5 SC4-baseline live session (ATTEMPT 3) — STOPPED at the codex-model-auth gate (2026-07-20)

ROLE: durable stop-report banked by the M3.5 baseline operator (attempt 3). One live run
WAS dispatched this time (lem-weighted-min run A); it aborted `stuck-no-progress` with
ZERO rk-attributed tokens because the codex worker failed at the first call. STOP-1
(verifier-only driver / unseeded workspace) and STOP-2 (single-global-model pin) are both
RESOLVED and re-verified below. This attempt halts at a THIRD, newly-isolated gap that only
a real codex turn could surface — which is exactly why the two zero-spend preflights missed
it.

## Verdict

Attempt 3 cleared every gate STOP-1 and STOP-2 flagged, plus the model-resolution pin
(verified zero-spend, both directions, all three lemmas: claude -> `claude-opus-4-8`,
codex -> `gpt-5.1-codex`). It then dispatched lem-weighted-min run A and hit a real-turn
failure: **rk's codex backend forces `-m gpt-5.1-codex`, and this machine's codex is
authenticated with a ChatGPT account that REJECTS `gpt-5.1-codex` (and every other explicit
`gpt-5*-codex` model id) with HTTP 400.** The only codex model this account accepts is
`gpt-5.6-sol` (the account's own config default — and, notably, the Tier-A REVIEWER model,
CLAUDE.md §3). Proceeding requires substituting the codex worker model to `gpt-5.6-sol`,
which is (a) not the model the runbook names, (b) a decision about what the one-shot SC4
codex-side denominator measures, and (c) the reviewer's own model. That is a first-order
"what does SC4 mean" decision — the codex-side twin of STOP-2 — so it escalates, not
improvises. Stopping is CLAUDE.md §7 ("a PRD/plan conflict or gap discovered mid-WP →
surface it, pick nothing silently") + §3 (model policy is TJO-directive domain) + the task
brief ("a mid-run rk gap is likely a §7 abort — stop, report, never patch around").

No further runs were dispatched: every codex-verifier or codex-prover turn in all three
lemmas × both directions would fail identically until the codex-model decision is made. Run
A already demonstrated the failure at zero rk-token cost; re-running to "prove" it again
would violate spend discipline.

## Root cause: rk forces `-m <model>` for codex; ChatGPT-account codex accepts only its config default

The pin/default requires codex to run on `gpt-5.1-codex` (runbook §11/§12, and rk's
hard-coded `DEFAULT_MODEL_BY_BACKEND["codex"]`). rk cannot honor that here:

1. `resolveModel` (`src/drive/driver-live-model.ts`) NEVER returns empty for a configured
   backend: config `model` field > global `--model` > `DEFAULT_MODEL_BY_BACKEND[backend]`.
   For codex (no `model` field in these configs, no `--model` flag) it resolves to
   `DEFAULT_MODEL_BY_BACKEND["codex"] = "gpt-5.1-codex"`.
2. `backend-codex.ts:151` appends `...(session.model ? ["-m", session.model] : [])`. Since
   `session.model` is ALWAYS a non-empty string (step 1), rk ALWAYS passes
   `-m gpt-5.1-codex`. There is no rk configuration that makes codex omit `-m` (the only
   path this account's implicit default is reachable by).
3. This machine's codex (`~/.codex/config.toml`: `model = "gpt-5.6-sol"`) is logged in via a
   **ChatGPT account** (`codex login status` → "Logged in using ChatGPT"). Under that auth,
   `codex exec ... -m gpt-5.1-codex` returns, verbatim:
   `{"status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.1-codex'
   model is not supported when using Codex with a ChatGPT account."}}` → terminal event
   `turn.failed` (not `turn.completed`) → `backend-codex.ts:168` returns **exit 13**
   ("backend unavailable", `docs/worker-contract.md:243`) with ZERO usage.
4. In the driver loop node 1 is verifier-ready first (the truthful split STOP-2 restored), so
   the FIRST real call is the codex verifier → exit 13 → no verdict → `roundsWithoutProgress`
   climbs → after 3 rounds `evaluateStuckGuard` aborts `stuck-no-progress` (exit 4). The
   claude/opus prover was never reached.

### Probe matrix (real codex `exec` turns, trivial "reply OK" prompts, this account)

| codex model passed via `-m` | result |
|---|---|
| (none — codex implicit default) | `turn.completed`, input=12671 — **works** |
| `gpt-5.6-sol` (explicit) | `turn.completed`, output "OK" — **works** |
| `gpt-5.1-codex` | 400 not-supported → `turn.failed` |
| `gpt-5.1-codex-max` | 400 not-supported |
| `gpt-5.1-codex-mini` | 400 not-supported |
| `gpt-5-codex` | 400 not-supported |
| `gpt-5-codex-mini` | 400 not-supported |
| `codex-mini-latest` | 400 not-supported |
| `gpt-5` / `gpt-5.1` / `gpt-5.2` | 400 not-supported |

The ONLY runnable codex model on this account is `gpt-5.6-sol` (its config default). No
`gpt-5*-codex`-family id — including the runbook's named default — is accepted.

## Claude side is fine — the gap is isolated to codex

A trivial `claude -p "Reply OK." --model claude-opus-4-8 --output-format json
--exclude-dynamic-system-prompt-sections` (backend-claude's exact createSession shape)
returned a clean success envelope: `is_error:false`, `result:"OK"`, a real `session_id`,
usage recorded, `total_cost_usd ≈ 0.066`. The opus prover/verifier half works end to end.

## Preflight gates that DID pass (so the gap is isolated to the codex model-auth)

- `bun test` 1840 pass / 1 skip / 0 fail; `bun run selftest` OK (123/123, purity 99/99 +
  24/24, all corpus green). `dist/rk` rebuilt from master tip **789a46f**.
- Backends present: `claude` 2.1.215, `codex` 0.144.6, `af` 0.1.5.
- **STOP-1 stays RESOLVED** — prover dispatch + af-authoritative readiness flags: af export
  emits `features: [readiness-flags, closure-flag, node-dependencies]` on all three dirs;
  dry-run split is truthful (`verifier-ready now (1): 1`, `prover-ready now (0): none`).
- **STOP-2 stays RESOLVED** — per-assignment model pin (rk-7hi). Zero-spend resolution check
  over the ACTUAL config files (`resolveModel` + `BackendRegistry` on each `.rk/config.json`
  and `.rk/workers.reverse.json`) gave, all three lemmas both directions:
  `prover claude -> claude-opus-4-8 | verifier codex -> gpt-5.1-codex` (run A) and the mirror
  (run B). The live preflight lines confirmed it in-band on run A:
  `backend resolved: verifier/hard -> 'codex' (model 'gpt-5.1-codex')` /
  `prover/hard -> 'claude' (model 'claude-opus-4-8')`. The pin took effect exactly as §12
  designed — the failure is downstream, at codex's API, not in resolution.
- Config validation clean, all three dirs both directions: `checked config: 3/3 ... valid`
  (with the NEW binary, after the model-field addition).
- The `--max-campaign-tokens 500000` cap was honored (run A carried it; the run never
  approached it — it aborted stuck at ~0 tokens).

## What must change before a re-run (for TJO to decide — nothing chosen here)

Options, surfaced not selected (§7 "pick nothing silently"):

- **(a) TJO blesses `gpt-5.6-sol` as the codex worker model for this baseline**, recorded as
  a dated runbook addendum. Then add `"model": "gpt-5.6-sol"` to the codex assignment in all
  six staging configs (config change only, in this dir, allowed) and re-run. rk-7hi's
  per-assignment override makes this expressible with zero rk source change. Caveat TJO must
  weigh: `gpt-5.6-sol` is the Tier-A REVIEWER model — the cross-vendor prove/verify baseline
  would then measure the codex side on the same model that reviews rk. If that is acceptable
  (it is the account's only runnable codex model), this is the fastest green path and the SC4
  denominator is honestly "codex=gpt-5.6-sol, claude=opus-4-8".
- **(b) Fix rk so codex can run on its account-implicit default** (omit `-m` when no explicit
  model is configured): make `DEFAULT_MODEL_BY_BACKEND["codex"]` optional / let
  `resolveModel` yield "no explicit model" so `backend-codex.ts:151` omits `-m`. This is an
  rk source change (NOT this operator's to make — task bars touching rk source) and a subtle
  one (the resume-turn model-consistency invariant at `backend-codex.ts` header assumes a
  known model string). File as a bead. It makes the codex default portable across API-key vs
  ChatGPT-account auth — the more durable fix, since the hard-coded `gpt-5.1-codex` default is
  simply wrong for a ChatGPT-account codex.
- **(c) TJO points the session at an API-key codex login** where `gpt-5.1-codex` is
  supported, honoring the runbook's literal named default with no code/config change. Purely
  an environment switch (`codex login`), outside rk. Then the SC4 codex denominator is the
  originally-named `gpt-5.1-codex`.

Recommended: **(a)** to proceed now if a `gpt-5.6-sol` codex denominator is acceptable;
**(b)** as the durable rk fix regardless (the codex default is non-portable); **(c)** if the
literal `gpt-5.1-codex` denominator is load-bearing and an API-key codex is available. Any
of the three decides what SC4's codex side measures — hence a TJO call.

## Candidate beads (NOT filed — task confines writes to ../rk-m3.5-baseline)

- **NEW (P1, machinery/portability gap):** "rk codex backend is non-portable across codex
  auth modes: `resolveModel` always yields a non-empty model for codex
  (`DEFAULT_MODEL_BY_BACKEND['codex']='gpt-5.1-codex'`) and `backend-codex.ts:151` always
  passes `-m <model>`, so codex can never run on its account-implicit default. On a
  ChatGPT-account codex login, `gpt-5.1-codex` (and every explicit `gpt-5*-codex` id) is
  rejected 400 'not supported when using Codex with a ChatGPT account' → `turn.failed` →
  exit 13 → stuck-abort with zero tokens. Blocks the M3.5 baseline on this machine. Fix:
  allow 'no explicit codex model' (omit `-m`) or make the default account-mode-aware."
- **NEW (P2, preflight gap):** "rk `--live` preflight (and both prior M3.5 STOP zero-spend
  preflights) validate model RESOLUTION but never that the resolved model is actually
  RUNNABLE by the backend's current auth. A one-line `codex exec 'reply OK' -m <resolved>` /
  `claude -p 'reply OK' --model <resolved>` smoke turn would have caught this before dispatch
  (it cost ~0). Consider an opt-in `--smoke` preflight that spends one trivial turn per
  resolved (backend, model) to fail fast with the real API error instead of an opaque
  stuck-abort."
- `rk-mq2` (af accepts `batch_id:""` single-item applies?) — **still NOT resolvable**: its
  text gates it to the live-fire; no verdict was ever produced (codex verifier failed before
  emitting one), so no `af apply` ran. STOP-2's code-inspection note stands
  (`driver-run.ts` builds `{batch_id:"", items:[{...}]}` per node); live confirmation of af's
  ACCEPTANCE still pending a working codex worker. Leave open.
- `rk-6nv` (prove→verify termination on a real lemma; challenge→prover-flip + refine-author
  recording) — **still NOT resolvable**: requires a completed prove→verify cycle, never
  reached (first codex turn failed). The machinery to exercise it EXISTS (STOP-1/STOP-2 gaps
  closed); rk-6nv is unblocked pending only the codex-model decision. Leave open.

## Ledger

- Real rk-attributed tokens (baseline campaign): **0** — run A's codex turns all returned
  exit 13 with zero usage; `rk verify --report` shows `input=0 output=0 turns=3`.
- Diagnostic spend (isolating the gap, NOT baseline campaign): ~8 trivial codex `exec` "reply
  OK" probes (the two that completed ≈12.7k input each, mostly cached; the 400-rejected ones
  billed ~0) + 1 trivial claude opus turn (`total_cost_usd ≈ 0.066`). A few cents total; no
  lemma's 500k cap was meaningfully touched.
- Live baseline runs completed: lem-weighted-min run A only (aborted stuck). lem-mass-split,
  lem-starvation-completion-obstruction: NOT dispatched. Run B (reverse) for any lemma: NOT
  dispatched.
- AISM: untouched (read-only — no read even needed this attempt; parity never reached). rk
  repo tree: untouched except `dist/rk` rebuild. All writes here in `../rk-m3.5-baseline/`
  (`STOP-REPORT-3-2026-07-20.md`, `_logs/lem-weighted-min.run-A.console.log`,
  `_logs/lem-weighted-min.run-A.driver-log.jsonl`).
- Wall-clock: preflight + isolation + run A (12.5s) + diagnostics ≈ a few minutes; no
  long-running proof turn ever executed.
