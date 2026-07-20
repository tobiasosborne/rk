<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-20, session close — M3 repair DONE, prover dispatch LIVE, M3.5 4/6 banked)

**M3 repair wave COMPLETE** (all 8 boundary-review blockers, rk-e3g closed, one wave,
mechanically verified, no re-review). **Render wave landed** (rk-scy/38f/50v/d2v).
**Prover dispatch landed and Tier-A reviewed** (rk-gn4 closed): af authoritative
readiness flags, atomic `af record-proof` (refine + challenge disposition + release),
per-node prove→verify, kernel CAS enforcement of hash/role/availability at
record-proof and verdicts apply, per-child depends end-to-end, closure flag,
capability preflight. **The M3.5 live-debug loop (11 attempts) fixed ten further
gaps** — see docs/worklog.md 2026-07-20 entry — each with red-green tests, landed
WITHOUT per-fix review per TJO directive (bd memory
m3-5-fix-loop-no-per-fix-reviews-tjo-2026-07-20); all loop validity changes are
QUEUED for ONE batched Tier A review at M3 close (list below).

**M3.5 baseline: 3 of 6 runs converged, 4/6 produced denominators.**
lem-weighted-min A+B CONVERGED, FULL parity (identical challenge dynamics);
mass-split A CONVERGED 7/7; starvation A 36/39 validated then a genuine cross-vendor
'incorrect' dispute on 1.9/1.10; mass-split B + starvation B stuck on GAP 11.
Campaign: 2.31M tokens, 58 validated nodes, **clean whole-lemma SC4 denominator
33,004 tok/validated-node** (wm-A + wm-B + ms-A pooled); cache ~0.50 codex-verifier
vs ~0.93 claude-verifier (M3.9 lever). All banked in ../rk-m3.5-baseline
(RUN-REPORT-11 = campaign table; memos/ has 4 baseline memos, 2 FULL + 2 partial).

Gates at close: bun test 1967/0 (134 files), selftest OK (corpus 123/123, purity
101/101). rk tip pushed to the NEW public GitHub remote (created this close).
vibefeld pushed through 8c32a2c. AISM untouched (read-only) throughout.

## Next steps (in order)

1. **GAP 11** (P1 bead): claude-verifier turns on mass-split/starvation rejected at
   extraction (worker exit 12 ×3, 0 applied) while weighted-min's claude verifier
   converged — output-variance dependent. Diagnosability NOW IN PLACE (4c07540/
   891afcd: parse-error classification, 2000-char snippets, full raw to
   .rk/parse-failures/, prompt conciseness cap). First move: re-run mass-split B —
   the banked evidence will name the exact malformation; fix accordingly (parser
   robustness vs prompt vs bounded reprompt — validity side into the batched review).
2. **Re-run starvation** after GAP 11 (its run A dispute is protocol signal, not a
   bug — see the P2 challenge-loop bead: disputed parent re-decomposes forever).
3. **M3 close**: (a) ONE batched Tier A codex review (gpt-5.6-sol, high) of the
   loop's validity-adjacent changes — vacuous-root guard + prompts, category→aspect
   map, af batch_id contract, free-text justification, #N depends bridge,
   proof_author provenance + prover-of-record precedence, GAP 10 context assembly,
   extraction acceptance rule, DriverDeps signature changes; (b) M3.9 SC4 comparison
   vs the baseline memos; (c) auto-prove.sh disposition in vibefeld (D6 stale-tooling
   trap); (d) acceptance report + close beads.
4. **Then M4** (fr upgrades + bandit experiment, pre-registration doc M4.0 first).
   Backlog highlights: rk-74o (structural batch eligibility, P1), shard-cap split
   wave (P2), scheduler stagger relax, graph-v2 batch (rk-mnp crux, rk-rgp),
   glossary cross-linking (rk-iup), Claude-adapter terminal-event audit.

## Governance (standing, in bd memory)

- Reviews: codex gpt-5.6-sol HIGH; Fable only with explicit TJO permission.
- Anti-Zeno: ONE review round + ONE repair wave per milestone; mechanical
  verification; residuals → beads → next milestone's single review.
- M3.5 loop amendment (TJO 2026-07-20): live-debug fixes land with tests, NO
  per-fix review; batched Tier A at M3 close (bd memory ...no-per-fix-reviews...).
- Worker models (TJO 2026-07-20, bd memory m3-5-model-policy...): claude side
  opus/sonnet ONLY (never Fable) — staging pins claude-opus-4-8; codex side
  gpt-5.6-sol (only model runnable under this machine's ChatGPT-account codex).
- Spend: M3.5 authorization stands; runbook §14 cap 1.5M/run; lemmas 2-3 dispatch
  was TJO-approved 2026-07-20 and is now spent/banked.
- AISM: read-only crash-test corpus + incident seed ONLY (SC7 generality lens).

## Key facts for the next session

- Live invocation shape: `dist/rk verify --af <id> --live --max-campaign-tokens
  1500000` from a lemma dir in ../rk-m3.5-baseline; models pinned per-assignment in
  .rk/config.json (run A) / workers.reverse.json (swap in for run B); NO --model
  flag. Rebuild dist/rk + reinstall af before any run; af features[] must include
  readiness-flags, closure-flag, node-dependencies, proof-author.
- Restore workspaces byte-identical from _pristine/ before every run; per-lemma
  memos (af node ids collide across dirs — never one combined array).
- Driver logs are self-diagnosing: bind-failed / parse-failed (with classification
  + rawFailurePath) / record-proof-failed / stall dominant-cause lines.
- The af binary at ~/go/bin/af is 0.1.5 built from vibefeld 8c32a2c.
- Runbook: docs/memos/2026-07-19-m3.5-baseline-runbook.md §§10-14 (append-only;
  §11 model pin, §12 per-assignment config, §13 codex sol, §14 cap + sequencing).

## Standing cautions

- Parallel agents, shared tree: disjoint file scopes; `git commit -m "..." --
  <paths>` ALWAYS. Shared files (corpus/README.md, gate-contracts.md, discovery.ts
  counts, selftest, contract docs) are orchestrator-single-writer; lanes report
  deltas. Pin cross-lane type contracts in BOTH briefs before dispatch.
- M3.5 operator agents: instruct them to STAY with live runs (tail logs, minutes
  per turn is normal) — two yielded mid-run and needed a resume nudge; monitors
  firing "completed" notifications repeatedly is normal harness behavior.
- codex exec reviews: -s read-only, -C needs --skip-git-repo-check outside a repo;
  17-60 min at high for milestone scope, ~15 min for focused diffs; -o <file>; the
  sandbox cannot run bun (EROFS) — repairs run the gates.
- bd close with multiple ids applies ONE --reason to all (fix notes after).
  bd is per-repo (cd matters); fr has no tracker.
- Purity grep false-triggers on `node:` param names — rename, never touch the guard.
- Scratchpad is EPHEMERAL: bank into docs/reviews/ and ../rk-m3.5-baseline (durable).
- Live runs write .rk/parse-failures/ in workspaces — no rotation; clean when
  restoring pristine.
