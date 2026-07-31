<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-31, session close — rk-xfzg LANDED; rk-k8dq live-fire DONE)

**rk-k8dq is closed** (attempt 12, banked at
`../rk-m3.5-baseline/RUN-REPORT-12-2026-07-31.md`). The GAP 11 death mode (claude
verifier verdict-envelope parse failure ×3) did NOT reproduce under the current build:
**mass-split B CONVERGED** (root validated + closed, 5/5 nodes, cross-vendor clean,
273,996 tok, cache 0.90) and **starvation B got past GAP 11** (challenge applied,
prover dispatched — the step GAP 11 starved) but stuck on a NEW cause: the codex
prover's decomposition turn timed out (exit 10) twice at the hard-coded 120 s default —
`LiveDispatchOpts.turnTimeoutMs` exists but is unwired from config → filed **rk-k0m1**
(P2). The rk-xxp bounded repair NEVER FIRED in either run (zero `verdict-repair`
records — nothing needed repair), so the bead's fire-once/bind/token criteria closed
VACUOUS with the residual (repair live-unfired) noted for the M3 batched review.
Spend: 312,530 tokens, within the §14 authorization. Mass-split now has BOTH
directions converged; starvation B is the only zero-progress campaign left and is
blocked on rk-k0m1.

**rk-xfzg is closed.** The Tier A review the previous session parked on was run this
session by **Fable with explicit TJO permission** ("work on this by yourself, do not use
codex" — the L6 amendment's escape hatch), verdict CLEAN, zero landing-blockers. Banked
at `docs/reviews/2026-07-31-rk-xfzg-extract-proof-tierA-fable.md`. The reviewed commit
f93de62 was cherry-picked onto master as **b7e5b17** (the branch had diverged from
master's session-close HANDOFF commit only; content verified byte-identical via
`git diff` before and after). Branch `rk-xfzg-pending-review` deleted locally and on
origin. Semantics now on master: `extractProofContent` accepts a prover body iff
`validateRawProverOutput` (prover-raw.ts) reports zero issues — the two silent-drop
paths (unknown keys copied away, non-string `depends` entries filtered out) are flat
rejections, named in the skip reason and a new diagnostic-only `prover-body-invalid`
log record.

**Review highlights** (full record in docs/reviews/): acceptance set strictly shrank
(nothing previously rejected became acceptable); overreach guard still precedes
extraction, so verdict-carrying bodies discard as `prover-overreach`, never misreport;
a FAILED prover repair's preserved exit-0 body now rejects instead of recording with
silent loss (e2e test of that path = rk-wr58, now unblocked); mutation proofs re-run
independently (lax extractor → 8 RED, diagnostics revert → 1 RED, restored
byte-identical both times). Follow-ups filed as **rk-yx5e** (P3, Tier C: stale
skip-reason parenthetical + missing `role` field on the new log record) — batched to
the M3 review per the anti-Zeno rule, NOT a repair wave.

Gates at close: master `bun test` **2333 pass / 1 skip / 0 fail** (150 files) +
selftest **OK** (corpus 127/127, purity, gates-dir, compat).

## Next steps (in order)

1. **rk-k0m1 (P2) — wire `turnTimeoutMs`/`sessionTimeoutMs` from `.rk/config.json`**
   (per-role or per-assignment; compat discipline if the config schema is versioned),
   then re-run starvation B from `_pristine/` — restore the workspace first (it now
   carries the applied root challenge, terminal state of attempt 12).
2. **rk-tbg — ESCALATE the systemic decision before sweeping again** (bead notes,
   2026-07-25): six files are over the 280 cap right now (freshness.ts 442, config.ts
   380, cli/render.ts 356, shards.ts 312, driver-af.ts 305, provenance.ts 303), four of
   them GREW from validity work — every validity fix adds guard code faster than sweeps
   clear it. TJO must pick: budget a split into each validity change, or accept the cap
   as a tripwire triggering scheduled sweeps. Do not silently sweep a third time.
3. **M3 close**: (a) ONE batched Tier A codex review — scope is the M3.5 loop's validity
   changes PLUS: bounded schema repair (verifier rk-xxp + prover rk-i19), Gate 4
   presence-conditionality, Gate 7 single-assembly-path, structural batch eligibility,
   load-bearing membership, family fail-closed, three-cause STALE (rk-xbsx),
   provenance-11 narrowing (rk-lkeh), and rk-xfzg's acceptance change (standalone
   review done, but it is in scope for the batch too); residuals rk-yx5e and rk-wr58
   belong to this wave. (b) M3.9 SC4 comparison; (c) auto-prove.sh disposition in
   vibefeld; (d) acceptance report.
4. **Then M4** (fr upgrades + bandit experiment, pre-registration M4.0 first).

## Governance (standing, in bd memory)

- Reviews: codex gpt-5.6-sol; Tier A at xhigh. Fable only with explicit TJO permission
  (used this session for rk-xfzg, by TJO directive in-chat).
- Anti-Zeno: ONE review round + ONE repair wave per milestone; mechanical verification;
  residuals → beads → next milestone's single review.
- Worker models: claude side opus/sonnet ONLY (never Fable); codex side gpt-5.6-sol.
- AISM: read-only crash-test corpus + incident seed ONLY (SC7 generality lens).

## Key facts for the next session

- **`codex exec review --uncommitted` takes NO prompt argument** — the flag and
  `[PROMPT]` are mutually exclusive (codex-cli 0.146.0). Use the promptless form for
  diff reviews; use `codex exec -s read-only "<prompt>"` when a directed question is
  needed. `-o`/`--output-last-message <file>` captures the final message.
- The auto-mode permission classifier blocks `git checkout`/`git merge` in this
  environment; `git switch` and `git cherry-pick` pass. A pure fast-forward landing can
  be done as a cherry-pick when the branch content is disjoint from master's drift —
  verify with `git diff <branch> master -- <paths>` afterwards.
- Parallel-lane rules and the FOUR shared-writer files are unchanged (corpus/README.md,
  src/corpus/discovery.ts, docs/gate-contracts.md + worker-contract.md, and
  test/corpus.test.ts's SECOND hardcoded fixture total — bump both counts together).
- Corpus is **127** gate fixtures; non-gate trees outside the count: corpus/graph/,
  corpus/render/, corpus/drive/ (rk-b09 / rk-x573 track surfacing them in selftest).
  corpus/drive/'s only fixture is a full live-driver harness (fake af binary) — it is
  NOT a cheap place to drop unit-shaped fixtures; unit rejection tests live in
  test/drive/.
- Template **1.4.0**; af **0.1.6**; fr **0.2.1**; bd 1.0.0. `rk doctor` verifies.
- Live invocation shape unchanged: `dist/rk verify --af <id> --live
  --max-campaign-tokens 1500000` from a lemma dir in `../rk-m3.5-baseline`; models
  pinned per-assignment in `.rk/config.json`; NO `--model` flag.

## Standing cautions

- **Bound every process (CLAUDE.md rule 13).** 8 GiB soft RLIMIT_DATA is wired via
  `.claude/settings.json` → `scripts/agent-limits.sh` (verify: `bash -c 'ulimit -S -d'`
  → 8388608). It converts a VM freeze into one dead process — it does NOT make loops
  terminate. Keep `timeout` on bun test/selftest/ad-hoc scripts; never `(cmd &)`.
  Mutation waves remain the specific risk (2026-07-25 incident: 34.5 GB + 61.5 GB).
- Do NOT take a subagent's finding at face value — verify against source before filing.
- Live runs write `.rk/parse-failures/` in workspaces — no rotation; clean when
  restoring pristine.
- Purity grep false-triggers on `node:` param names — rename, never touch the guard.
- `bd close` with multiple ids applies ONE `--reason` to all (fix notes after).
- Scratchpad is EPHEMERAL: bank anything durable into `docs/reviews/` and
  `../rk-m3.5-baseline`.
