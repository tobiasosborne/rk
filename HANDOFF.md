<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-19, session close — M1 and M2 both ACCEPTED; M3 groundwork in)

**M1 ACCEPTED** (repair wave + mechanical verification + dogfood-3 all-PASS).
**M2 ACCEPTED**: all six WPs, one boundary review + one repair wave (9/9 blockers
mechanically verified), M2.4 pass 2 landed, SC5 dry-run marginal PASS (fresh-context
third party answered all five questions; usability beads filed), dagre vendored
(690bebc). M3 groundwork already landed: M3.0 caching-spike memo (session-resume is a
HARD requirement for the worker contract; 1h TTL; stagger confirmed — see
../research-workflows/NOTES-2026-07-19-m3.0-caching-spike.md), V0 struck, V1 shipped in
vibefeld (identity schema, byte-identical replay on all 44 AISM workspaces, pushed).
Tree: 1115 tests / 0 fail / 1 skip; selftest OK (109/109 + graph/render harnesses);
dist/rk current. No rk git remote (TJO: add one if pushing is wanted). vibefeld pushed
through 22bd056; knowledge-frontier pushed through 0d5f4df.

## Milestone scorecard

- **M1**: ACCEPTED 2026-07-19. Six P1 validity fixes + four follow-ups, mutation-proven;
  template_version 1.1.0→1.2.0 (orchestrator-caught compat event); dogfood-3 all-PASS.
- **M2.1 graph schema v1**: Tier A reviewed (4 blockers repaired) + merged. schemas/
  graph.v1.json ratified; workspaceResolved/contractMatch split; closed conflict enum.
- **M2.2 readers**: registry/af/fr/bd → GraphDocument, total-conversion property-tested.
  AISM read-through: 200/200 shards, af 44/44, fr 8.0% resolution honest baseline
  (memo: docs/memos/2026-07-19-m2.2-aism-readthrough.md).
- **M2.3 conflicts**: fixture per class through the full pipeline; never-auto-resolved
  property (21 cases); reviewed Tier A files untouched.
- **M2.5 queries**: rk graph --focus/--critical-path/--taint/--blocks; over-inclusive
  OR-route critical path (ratified; M3.4 depends on it); AISM agreement 200/200;
  northStarId config field (validated, reviewed).
- **M2.4 render**: COMPLETE. Pass 1 (styling single-source-of-truth + effective
  presentation state, truthfulness corpus, dashboard, hash-routed drill-down, rk render
  CLI, manifest adoption, repo-relative --out) + pass 2 (graveyard, run gallery,
  provenance chains, defs index + verbatim conventions) + dagre vendored (devDep,
  deterministic via canonical insertion order). SC5 dry-run: marginal PASS; usability
  beads filed (dashboard ordering P1, vocabulary P2, fr residual carry-through P2).
- **M2.6 freshness (Gate 7)**: regenerate-and-diff over .rk/generated.json; per-path
  Check-11 supersession RATIFIED; unknown generator = blocking ERROR; full manifest
  schema enforcement; render-site-v1 verified via edge regeneration (pure gate, edge
  prepares bytes); template_version 1.3.0.
- **M2 boundary review** (codex gpt-5.6-sol high, ONE round + ONE repair wave, no
  re-review): 9 blockers ALL repaired red-first + mutation-proven; 8 follow-ups filed;
  6 design verdicts recorded on beads (scratch review file is session-local; substance
  is in the memo addendum, gate-contracts Gate 7 section, and bead notes).

## Next steps (in order)

1. **M3.1 worker contract + verdict schema** (Tier A, worktree + review before merge):
   design around the M3.0 spike — session/turn dispatch model (session-resume, never
   flat prompt_parts concatenation), role isolation (a session NEVER crosses roles),
   1h-TTL scheduling, stagger rule, verdict.v1.json schema-validated at the boundary.
2. **V2/V3 in vibefeld** (queued in its tracker, V2=vibefeld-lzop, V3=vibefeld-h4ad):
   af verdicts apply calls AcceptNodeWithVerifier/NewChallengeRaisedWithBatch with one
   BatchID per batch; unvalidate --batch filters Node.ValidationBatchID. Then M3.2
   backends, M3.3 session manager, M3.4 composer (M2.5 critical-path query ready).
3. **Backlog highlights**: rk-45m (unparseable config JSON silent), rk-3af (report-label
   teaching doc), snapshot-load build/site include gap (+ .rk include regression test
   bead — pair them), afRecordsIn accounting, six-gates wording sweep, selftest lines
   for graph/render corpora (rk-b09), fr workspace-prefix resolution = graph v2
   (rk-rgp), fr stale command tables (owning repo has no tracker).
4. **AISM stance unchanged**: read-only crash-test corpus + incident seed ONLY; rk must
   serve any campaign (SC7). Dogfood repo ../rk-dogfood-1 is live campaign state.

## Governance (standing, in bd memory)

- Reviews: codex gpt-5.6-sol HIGH suffices; Fable only with explicit TJO permission.
- Anti-Zeno cap: ONE review round + ONE repair wave per milestone; repairs verified
  mechanically by the orchestrator, never re-reviewed.
- Two-list reviews: landing-blockers (validity only) gate; everything else → beads.
- Breaking changes to fr acceptable; af/fr work unrestricted in service of rk.

## Standing cautions

- Shared working tree for parallel agents: disjoint file scopes; explicit-path staging
  AND explicit-path commits — `git commit -m "..." -- <paths>` ALWAYS (a bare
  `git commit` swept another lane's staged files this session; caught and recomposed).
  Shared files (corpus/README.md, gate-contracts.md, discovery.ts fixture count,
  scripts/selftest.ts) are orchestrator-single-writer; lanes report deltas.
- Cross-lane interfaces: specify the exact type/name contract in BOTH lane briefs
  before dispatch (BuildDiagnostics and render-site-v1 both landed clean this way).
- Worktree agents: merge from the REPO ROOT, not from inside a worktree (a merge run
  inside the worktree merged the branch into itself as a no-op); remove worktrees
  before deleting their branches; verify `git status -sb` on master afterwards.
- Shell cwd resets to the project root between tool calls when you cd outside the
  project; cd + command must share one invocation.
- bd `update --notes` REPLACES the field — append manually. bd works per-repo; fr has
  no tracker (file fr items in rk's bd, labeled cross-repo).
- codex exec: ~17-40 min for milestone-sized reviews at high; `-o <file>`, read the
  file, never pipe through tail. Two-list output format must be mandated in the prompt.
- CLAUDE.md==AGENTS.md byte-identity applies to the TEMPLATE and every stamped repo.
- Template CONTENT changes are compat events: bump template_version (missed by an
  implementer lane once this session; caught at orchestrator reconciliation).
- vibefeld `-tags integration` suite is pre-existing broken (bead in vibefeld's bd).
