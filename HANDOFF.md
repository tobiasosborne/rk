<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-19, session close — M1+M2 ACCEPTED; M3 built, review-repaired NEXT)

**M1 ACCEPTED. M2 ACCEPTED** (all WPs, one review + one repair wave, SC5 marginal pass,
dagre vendored). **M3 is fully built through its single boundary review**: M3.0 spike,
M3.1 contract (Tier A reviewed + repaired + merged), M3.2 backends, M3.3 session/cache
manager, M3.4 batch composer, M3.6 hard-tier driver pass 1, M3.7 L5 verdict store,
M3.9 report instrument all on master; M3.8 cross-vendor rule and the M3.5 live-dispatch
wiring sit on two UNMERGED worktree branches (below). The M3 boundary review returned
**8 landing-blockers** — the repair wave is the P0 bead and the NEXT session's first
move; per its verdict the machinery is NOT yet safe for the M3.5 real-token run.
**TJO has explicitly authorized the M3.5 spend** (bd memory
m3-5-spend-authorization-tjo-2026-07-19) — gated only on the repair wave.
Master tree: green at the M3.9 tip (1581/0/1, selftest 109/109, dist/rk current).
No rk git remote (TJO: add one if pushing is wanted). vibefeld pushed through 1320ef6
(V0-V4 ALL done: identity schema, verdicts apply, unvalidate --batch, graph export);
knowledge-frontier pushed through 0d5f4df (F7 fr export).

## Unmerged branches (both green in their worktrees — MERGE ORDER MATTERS)

- `worktree-agent-a9b12837c0ead0e82` — M3.8 cross-vendor + linker Checks 13/14 +
  L5-promotion integration + corpus linker-31..38 (count 109→117). Tier A; several
  review blockers (5, 6) land IN its files.
- `worktree-agent-a79b59394bee01511` — M3.5 live wiring: --live flag, safety valves,
  driver-prompts, driver-live, async driver-run injection points.
- **THREE lines touch src/drive/driver-run.ts**: master (M3.9 usage logging), M3.8
  branch (cross-vendor apply wiring), live-wiring branch (async injection). The repair
  session must reconcile all three — recommended order: merge M3.8 first (resolve
  against master), then live-wiring, then apply the repair wave on the unified tree.

## Next steps (in order — next session)

1. **M3 repair wave** (the P0 bead lists all 8 with file:line; full text in
   docs/reviews/2026-07-19-m3-milestone-review-codex.md): (1) re-bind verdicts to
   authoritative bytes at apply; (2) challenges never count as progress, converged
   requires validated root; (3) role===verifier exactly + true per-node sessions/
   applies in per-node mode; (4) codex terminal-event requirement; (5) grandfathering
   de-gamed (unparseable=ERROR unless exact atomic legacy-same-family token; north-star
   unresolved fails closed); (6) L5 corruption poisons promotion + promoted shards
   re-validated continuously; (7) balloon counts persisted + threaded into the graph
   (from-registry hard-codes balloons:0); (8) SC4 accounting hardening + spend guards
   (campaign cap, pre-dispatch budget checks — review verdict (c): exit-11 is NOT a
   spend guard). Merge branches per the order above; ONE wave, mechanical verification,
   NO re-review; full bun test + selftest + live-fire gates (the review env was
   read-only and could not run them).
2. **M3.5 baseline run** (TJO-authorized): follow
   docs/memos/2026-07-19-m3.5-baseline-runbook.md — staging is DURABLE at
   ../rk-m3.5-baseline (3 lemma dirs: lem-weighted-min, lem-mass-split,
   lem-starvation-completion-obstruction; configs validate 3/3; dry-run verified).
   Per-lemma baseline memos (af node ids collide across dirs — never one combined
   array); verdict-parity procedure + abort criteria in the runbook. Both worker
   pairings (workers.reverse.json swap — rk has no --config flag).
3. **M3 close**: M3.9 SC4 comparison against the baseline; auto-prove.sh disposition
   in vibefeld (delete or deprecate — D6 stale-tooling trap); worklog + acceptance.
4. **Then M4** (fr upgrades + bandit experiment, pre-registration doc M4.0 first) and
   M5 leftovers; render beads (dashboard ordering P1 rk-…, vocabulary, fr residual
   carry-through) batch into the next render wave.

## Review/bead ledger (this session)

All four codex reviews banked in docs/reviews/ (M2.1, M2 boundary, M3.1, M3 boundary).
Open highlights: P0 M3-repair-wave bead; P1 dashboard-ordering (SC5); rk-mnp (crux not
in graph schema); rk-eet/rk-pwv (usage-log gaps); graph-v2 batch (workspace-prefix
rk-rgp, conflict identity rk-tns closed-by-coalesce, fr residual text); rk-45m
(config JSON silent); rk-3af (report-label teacher); rk-b09 (selftest lines for
graph/render corpora); scheduler-knob config promotion; fr stale command tables
(fr repo has no tracker — filed here). vibefeld-0l3d lives in vibefeld's tracker.

## Governance (standing, in bd memory)

- Reviews: codex gpt-5.6-sol HIGH; Fable only with explicit TJO permission.
- Anti-Zeno: ONE review round + ONE repair wave per milestone; orchestrator verifies
  mechanically; residuals → beads → next milestone's single review.
- Two-list reviews; repair rigor follows the finding's tier.
- Breaking fr changes acceptable; af/fr work unrestricted in rk's service.
- AISM: read-only crash-test corpus + incident seed ONLY (SC7 generality is the lens).
- M3.5 spend: TJO-authorized 2026-07-19, gated on the repair wave only.

## Standing cautions

- Parallel agents, shared tree: disjoint file scopes; `git commit -m "..." -- <paths>`
  ALWAYS (bare commit once swept another lane's staged files). Shared files
  (corpus/README.md, gate-contracts.md, discovery.ts count, selftest.ts, contract
  docs) are orchestrator-single-writer; lanes report deltas.
- Cross-lane interfaces: pin the exact type/name contract in BOTH briefs before
  dispatch (BuildDiagnostics, WorkerBackend both landed byte-identical this way).
- Worktree agents: merge from the REPO ROOT (a merge run inside a worktree no-ops
  into itself); remove worktree before deleting its branch; freeze master commits
  while a codex review is reading the tree.
- Shell cwd resets to project root between tool calls when cd'ing outside the
  project; cd + command must share one invocation.
- bd `update --notes` REPLACES — append manually. bd is per-repo; fr has none.
- codex exec: 17-60 min for milestone reviews at high; `-o <file>`; the review
  sandbox is read-only — it CANNOT run bun gates (EROFS), so repairs must run them.
- Scratchpad is EPHEMERAL per session: bank review outputs into docs/reviews/ and
  relocate any staging out of /tmp before stopping (done this session).
- Template CONTENT changes are compat events (bump template_version).
- Purity grep false-triggers on `node:` param names and `Date.now()` in comments —
  rename/reword, never touch the guard.
