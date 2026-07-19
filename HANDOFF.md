<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-19, session close — M1 accepted; M2 built and review-repaired)

**M1 is ACCEPTED** (repair wave + mechanical verification + dogfood session 3, all six
user-seat checks PASS, rk-bi4 closed). **M2 is functionally complete through its single
boundary review and repair wave**; M2.4 pass 2 + SC5 dry-run + dagre vendoring remain
before full M2 acceptance (see scorecard). Tree: 1070 tests / 0 fail / 1 skip;
`bun run selftest` OK (109/109 fixtures across 8 gate dirs + 3 graph-harness fixtures +
render truthfulness corpus); dist/rk current. No rk git remote (TJO: add one if pushing
is wanted). vibefeld and knowledge-frontier ARE pushed (V4 c266dae, F7 0d5f4df).

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
- **M2.4 render**: FIRST PASS done (styling single-source-of-truth + effective
  presentation state, truthfulness corpus, dashboard, hash-routed drill-down, layered
  DAG, rk render CLI, manifest adoption, repo-relative --out). REMAINING: pass 2 breadth
  (graveyard, run gallery, provenance chains, conventions view — bead), SC5 third-party
  <10min dry-run, dagre vendoring (review rejected built-in as permanent, rk-fhd).
- **M2.6 freshness (Gate 7)**: regenerate-and-diff over .rk/generated.json; per-path
  Check-11 supersession RATIFIED; unknown generator = blocking ERROR; full manifest
  schema enforcement; render-site-v1 verified via edge regeneration (pure gate, edge
  prepares bytes); template_version 1.3.0.
- **M2 boundary review** (codex gpt-5.6-sol high, ONE round + ONE repair wave, no
  re-review): 9 blockers ALL repaired red-first + mutation-proven; 8 follow-ups filed;
  6 design verdicts recorded on beads (scratch review file is session-local; substance
  is in the memo addendum, gate-contracts Gate 7 section, and bead notes).

## Next steps (in order)

1. **M2 acceptance remainder**: M2.4 pass 2 (breadth views bead, P1); then SC5 dry-run
   on the AISM site (third party answers the five questions <10 min); dagre vendoring
   (rk-fhd) behind computeLayers/renderDag.
2. **M3 entry (verification driver)**: M3.0 caching spike FIRST (plan sequencing —
   before M3.3 design freezes); worker contract spec M3.1; V1-V3 kernel verbs in
   ../vibefeld (author identity, af verdicts apply, unvalidate --batch) needed by M3.4.
   M2.5's critical-path query is ready for M3.4's batch exclusion.
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
