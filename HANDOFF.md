<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-30, session close — rk-xfzg implemented, PARKED pending Tier A review)

**One task this session, taken through the delegation pipeline**: pick from `bd ready`
→ scope inline → Sonnet implementer lane (TDD + mutation proofs) → orchestrator re-ran
gates independently → Tier A codex review started on the uncommitted diff. TJO stopped
the session mid-review; the review was killed and the diff is **committed on branch
`rk-xfzg-pending-review` (f93de62, pushed), NOT on master** — L6 forbids landing a
validity-semantics change without its top-tier review. Master is untouched by rk-xfzg.

**rk-xfzg (P2 bug, validity semantics) implemented.** `extractProofContent`
(src/drive/driver-prove-node.ts) had two silent-drop paths: unknown child keys were
copied away without a log (a prover writing af's own spelling `inference` instead of
`justification` lost its derivation label and the proof recorded anyway), and
non-string `depends` entries were `.filter`ed out (the proof DAG silently lost an edge
the prover declared — `["#0", 1]` recorded as one dependency). The fix is SINGLE SOURCE
OF TRUTH: `extractProofContent` now accepts a body iff `validateRawProverOutput`
(prover-raw.ts, the rk-i19 repair validator) reports zero issues — the "deliberately
stricter than extractProofContent" divergence documented in prover-raw.ts's header is
gone, acceptance and repair-validation can no longer drift. On rejection the caller
recomputes the issues, names the first 3 in the skip reason, and writes a new
`prover-body-invalid` log record (registered in report-parse.ts's OTHER_KINDS;
diagnostic-only, not counted by report math). Stricter by design (L5): a present-but-
blank `justification` and a present-but-non-array `depends` now reject rather than
drop. Three old tests that ASSERTED the silent-drop behavior were rewritten to assert
rejection. Mutation proofs: reinstating the lax extractor → 8 tests RED; reverting the
diagnostics block → 1 test RED; both restored byte-identical.

**Known consequence (intended hardening)**: on a FAILED prover repair,
verdict-repair.ts's `foldRepairTurn` returns the original invalid body with exit 0;
before this fix that body could still record with silent loss — now extractProofContent
rejects it too, so a failed repair is properly terminal. No test exercises that exact
exit-0-failed-repair path yet (the existing FAILED-repair test uses exit 12) — filed
as **rk-wr58** (blocked on the branch merging first).

**HANDOFF staleness corrected**: the previous HANDOFF listed rk-i19 as next-step #2,
but it was already CLOSED in the 2026-07-25 second wave (dc6a2f2, prover-raw.ts) — the
close raced the HANDOFF rewrite. Verify against `bd show`, not this file.

Gates at close: MASTER `bun test` **2327 tests / 0 fail** + selftest **OK**; BRANCH
`rk-xfzg-pending-review` **2333 pass / 1 skip / 0 fail** (150 files) + selftest **OK**
(corpus 127/127, purity 111/111, gates-dir 27/27).

## Next steps (in order)

1. **Finish landing rk-xfzg**: from the branch, run the Tier A review —
   `codex exec -c model_reasoning_effort="xhigh" review --base master` (promptless;
   see Key facts) — then merge to master on a clean verdict (or repair per findings,
   ONE wave), `bd close rk-xfzg`, delete the branch. The bead stays OPEN until merged.
2. **rk-k8dq (P1) — live-confirm the GAP 11 repair**: re-run mass-split B + starvation B
   from `_pristine/`. Confirm the repair fires at most once, the repaired verdict binds
   through the unchanged pipeline, repair tokens appear in the report's repair line and
   the budget, and the prover is finally dispatched. Within the standing M3.5
   authorization (runbook §14, 1.5M/run). Rebuild `dist/rk` + reinstall af first.
3. **rk-tbg — ESCALATE the systemic decision before sweeping again** (bead notes,
   2026-07-25): six files are over the 280 cap right now (freshness.ts 442, config.ts
   380, cli/render.ts 356, shards.ts 312, driver-af.ts 305, provenance.ts 303), four of
   them GREW from validity work — every validity fix adds guard code faster than sweeps
   clear it. TJO must pick: budget a split into each validity change, or accept the cap
   as a tripwire triggering scheduled sweeps. Do not silently sweep a third time.
4. **M3 close**: (a) ONE batched Tier A codex review — scope is the M3.5 loop's validity
   changes PLUS: bounded schema repair (verifier rk-xxp + prover rk-i19), Gate 4
   presence-conditionality, Gate 7 single-assembly-path, structural batch eligibility,
   load-bearing membership, family fail-closed, three-cause STALE (rk-xbsx),
   provenance-11 narrowing (rk-lkeh), and rk-xfzg's acceptance change (this session's
   standalone review notwithstanding — it is in scope for the batch too);
   (b) M3.9 SC4 comparison; (c) auto-prove.sh disposition in vibefeld; (d) acceptance
   report.
5. **Then M4** (fr upgrades + bandit experiment, pre-registration M4.0 first).

## Governance (standing, in bd memory)

- Reviews: codex gpt-5.6-sol; Tier A at xhigh. Fable only with explicit TJO permission.
- Anti-Zeno: ONE review round + ONE repair wave per milestone; mechanical verification;
  residuals → beads → next milestone's single review.
- Worker models: claude side opus/sonnet ONLY (never Fable); codex side gpt-5.6-sol.
- AISM: read-only crash-test corpus + incident seed ONLY (SC7 generality lens).

## Key facts for the next session

- **`codex exec review --uncommitted` takes NO prompt argument** — the flag and
  `[PROMPT]` are mutually exclusive (codex-cli 0.146.0). Use the promptless form for
  diff reviews; use `codex exec -s read-only "<prompt>"` when a directed question is
  needed. `-o`/`--output-last-message <file>` captures the final message.
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
  (This session: implementer's out-of-scope foldRepairTurn claim was verified true
  against verdict-repair.ts before it went anywhere.)
- Live runs write `.rk/parse-failures/` in workspaces — no rotation; clean when
  restoring pristine.
- Purity grep false-triggers on `node:` param names — rename, never touch the guard.
- `bd close` with multiple ids applies ONE `--reason` to all (fix notes after).
- Scratchpad is EPHEMERAL: bank anything durable into `docs/reviews/` and
  `../rk-m3.5-baseline`.
