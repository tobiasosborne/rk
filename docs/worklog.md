<!-- ROLE: narrative session log for the rk repo itself. UPDATE POLICY: authored,
     append-only — one dated entry per orchestration session, never rewritten.
     TRIGGER: appended at session close (CLAUDE.md §6). -->

# rk worklog

## 2026-07-18 — M1 orchestration session (Fable orchestrating Sonnet/Opus implementers)

M1 built end-to-end in one session, five parallel dispatch waves, all WPs landed:

- Wave 1: AISM-residue audit (16 items, memo + 5 beads; one landing-blocker R12 =
  shardsPrefix default "AISM"), src/store relocation (purity allowlist now empty),
  fr binary refresh (surfaced rk-dh0: fr version number does not move with behavior).
- Wave 2: M1.1 template set (residue bar is now a grep test; it caught the template
  agent's own first draft) and M1.3 `rk phase` + R12 removal.
- Wave 3: M1.2 `rk init` + M1.4 `rk upgrade` stub (templates embedded in the binary).
- Live-fire incident: fresh scaffold in consolidation failed with 6 ERRORs (mirror +
  report/ residue) — audit's "fresh repos no-op cleanly" claim falsified. Fixed by
  presence-conditional amendments (Gate 2 mirrors, Gate 6 report/-root guard).
- Dogfood 1 (K6 monochromatic-triangles campaign): SC1 PASS at 3.2 min (bar 30);
  10 friction beads; worst find: linker scanned only argument/lemmas/ (AISM residue),
  so user shards at argument/ were invisible under a green check. Fixed: recursive
  discovery with visible ignored-count. Seven-bead repair wave (help flags, schema
  READMEs, honest command refs, PATH guidance, exercisable audit trigger).
- Dogfood 2: upgrade path followed for real (1.0.0→1.1.0), shards fixed in one pass
  using the new READMEs, audit trigger fired/blocked/reset correctly live. Two P2s:
  upgrade instructions mark slot-filled files as safe overwrites (rk-czv); multi-line
  deps: silently parses empty, defeating DAG checks (rk-wc3, bumped P1).
- Boundary review (codex gpt-5.6-sol, high, ONE round per anti-Zeno cap): 5 landing-
  blockers (config validation, Gate 4 lemmas path, duplicate ids, fr transition log,
  constitution freshness overpromise), 6 follow-ups, 12/15 implementer flags ratified.
  All blocker claims orchestrator-verified at cited file:line. M1 acceptance held open
  pending next session's single repair wave + dogfood 3.

Tree at close: 671 tests / 0 fail / 1 skip; selftest OK (92/92 fixtures, purity clean).
Process notes: bd `--notes` REPLACES (dossier nearly lost); a `pgrep -f` watcher can
match its own command line (burned 1.5 h); codex review took ~17 min wall-clock.

## 2026-07-19 — M1 repair wave + acceptance (orchestration session 2)

- Repair wave, ONE wave per the anti-Zeno cap, five parallel Sonnet lanes with disjoint
  file scopes on the shared tree (shared docs single-writer: orchestrator): rk-xbm
  (config runtime validation, synthetic seventh gate, blocking ERROR on malformed
  fields), rk-2t8 (Gate 4 recursive argument/**/*.md discovery, mirrors Gate 2,
  independent re-parse preserved), rk-sj6 (duplicate registry id = structural ERROR
  naming both paths), rk-wc3 (parseFrontmatter accepts multi-line YAML block lists;
  Gate 2 reports malformedLines), rk-huq (rk phase consolidation logs worklog + fr
  orient with visible skips), rk-19i/rk-gvx/rk-mdx/rk-czv/rk-ax5 (template/CLI
  truthfulness + init conflict set). Every validity fix mutation-proven red-first.
- Orchestrator reconciliation: corpus wired to 98 fixtures (config 2, linker 30,
  provenance 20); gate-contracts.md gained the config-validation section, Gate 2
  Checks 2a/2b + multi-line grammar, Gate 4 recursive-discovery text; restored the
  provenance-19 fixture row the round-3 wave never added. template_version 1.1.0→1.2.0
  (repair wave changed stamped template content — rule 10 compat event the lanes
  missed).
- Mechanical verification (NO re-review, per cap): selftest 98/98; live-fire on a
  scratch campaign — bad config exits 1 with honest 0/2 coverage, phase transition
  writes worklog + fr orient, multi-line deps yield the unknown-dep ERROR dogfood-2
  never got, re-init conflicts on settings.json/pre-commit, CLAUDE==AGENTS
  byte-identical.
- Dogfood session 3 (../rk-dogfood-1, user seat): all six verification items PASS;
  upgrade 1.1.0→1.2.0 followed literally with zero campaign-content loss; shards
  committed in the now-documented multi-line style; real increment (first fr arm
  registered, budget/model slots filled). SC1 question answered yes. **M1 ACCEPTED**
  (rk-bi4 closed).
- Parallel M2 entry: V4 landed in vibefeld (c266dae, pushed) — af export --graph json,
  schema_version 1, deterministic, read-only-proven; reader caveats captured as a bead
  (workspace.id is a path; contract match targets nodes[].statement). M2.1 graph
  schema v1 drafting started in an isolated worktree, Tier A codex review to follow.
- New beads: rk-45m (unparseable config JSON still silent — known residual, documented
  in contract), rk-3af (no in-repo teacher for report labels at consolidation),
  M2.2 reader notes, vibefeld integration-suite breakage (filed in vibefeld's tracker).
- Process: `git commit` with no pathspec commits the WHOLE index — one lane swept
  another's staged files, caught via git show --stat and recomposed; always commit
  with explicit `-- <paths>` under shared-tree parallelism.

Tree at acceptance: 743 tests / 0 fail / 1 skip; selftest OK (98/98); dist/rk rebuilt.

## 2026-07-19 — M2 built end-to-end: schema, readers, conflicts, queries, render, freshness (orchestration session 2, continued)

- M2.1 graph schema v1: drafted in a worktree, Tier A codex review (4 MAJOR blockers:
  af-evidence requirement, root-only contract match, workspaceResolved/contractMatch
  split with recomputed closed-enum conflicts, fr one-to-one unresolved accounting),
  single repair wave, mechanically verified, merged (06ad2ea).
- M2.2 store readers + pure join boundary: registry/af/fr/bd readers, total-conversion
  property tests, repo-level rename-hazard corpus fixture. AISM live-fire (read-only):
  200/200 shards, af 44/44 joins, fr resolution 8.0% honest baseline (185 unresolved,
  1:1 accounted), 113 conflicts, zero crashes (memo committed).
- M2.3: one repo-level corpus fixture per conflict class through the full pipeline +
  21-case never-auto-resolved property test; zero changes to the reviewed Tier A files.
- M2.5: pure query cores (focus, critical path, taint trace, what-blocks) + rk graph
  CLI. Critical-path rule: over-inclusive across OR-routes (under-inclusion would be
  the M3.4 validity bug). AISM agreement 200/200 vs linker ground truth. northStarId
  config field added in the shardsPrefix pattern (Tier A flagged, reviewed).
- M2.4 first pass (Opus, worktree): single styling source of truth + rendering-
  truthfulness corpus (one fixture per rigour status), dashboard, hash-routed no-server
  drill-down, layered DAG (dagre deviation — review REJECTED as permanent, vendoring
  scheduled, rk-fhd), rk render CLI. AISM render: 200 nodes, badge distribution matches
  source exactly, conflicts/unresolved surfaced as defects. Breadth views deferred to
  pass 2 (bead filed).
- M2.6 (worktree): Gate 7 freshness — regenerate-and-diff over .rk/generated.json,
  per-path Check-11 supersession (ratified), presence-conditional, 5 fixtures;
  template_version 1.3.0 (constitution freshness hedge flipped to present tense).
- M2 boundary review (codex gpt-5.6-sol high, ONE round): 9 landing-blockers, 8
  follow-ups, all 6 design questions answered. Branches merged first, then ONE repair
  wave in three parallel lanes (join/conflicts, render/CLI, freshness), all blockers
  red-first + mutation-proven: effective presentation state (conflicted/tainted proved
  = defect styling, excluded from rigorous counts); refuse-to-render on structural
  loss + degraded-source banners; byte-exact contract match; verdictFresh === true;
  superseded-cycle exclusion; per-node banked-conflict coalescing; honest fr line
  accounting; unknown generator = blocking ERROR; render-site-v1 verification (pure
  gate + edge regeneration); full manifest schema enforcement; repo-relative --out.
- Reconciliation: corpus 109 fixtures (8 gate dirs) + 3 graph-harness fixtures;
  ledgers + memo addendum synced. Follow-ups: beads (verdicts recorded on rk-fhd,
  rk-rgp, rk-b09, rk-tns; new: afRecordsIn accounting, .rk include regression test,
  six-gates wording sweep, snapshot-load build/site gap).
- Cross-repo: V4 af export --graph json (vibefeld c266dae, pushed); F7 fr export
  (knowledge-frontier 0d5f4df, pushed); both schema-versioned, deterministic,
  read-only-proven.

M2 status: M2.1-M2.3, M2.5, M2.6 COMPLETE; M2.4 first pass complete, pass 2 (breadth
views: graveyard, run gallery, provenance chains, conventions view) + SC5 third-party
dry-run + dagre vendoring remain before full M2 acceptance. Tree at close: 1070 tests /
0 fail / 1 skip; selftest OK (109/109); dist/rk rebuilt.

## 2026-07-19 — M2 ACCEPTED; M3 groundwork landed (orchestration session 2, close)

- M2.4 pass 2: graveyard, run gallery, provenance chains, defs index + verbatim
  conventions block (four commits, truthfulness invariants mutation-proven, an
  unescaped-interpolation bug caught pre-landing). AISM live-fire: 38/38 bundles,
  6 dead routes, 19 defs.
- SC5 dry-run (fresh-context agent as third party, AISM site only, no repo access):
  **marginal PASS** — all five questions answered, page honest about its own limits
  everywhere. Findings → beads: dashboard buries legend/north-star under ~400 defect
  lines and the 147-declared-vs-34-rigorous reconciliation is invisible to skimmers
  (P1, presentation-order overclaim risk); vocabulary gaps (af/fr/bd unexpanded,
  node-prefix glossary absent, 'graveyard' double meaning); fr death-certificate
  text not carried into the projection (graph-v2 candidate).
- Dagre vendored (690bebc, rk-fhd closed): devDependency route, dependencies stays {},
  determinism forced by canonical pre-dagre insertion order (dagre proven
  order-sensitive by live probe), crossing improvement demonstrated against the
  frozen old algorithm, +216KB binary / +0.16% site.
- **M2 ACCEPTED**: all six WPs complete, one boundary review + one repair wave (9/9
  blockers mechanically verified), SC5 passed, dagre landed. Tree: 1115 tests / 0
  fail / 1 skip; selftest OK (109/109 + graph/render harnesses).
- M3 groundwork already in: M3.0 caching spike memo (session-resume is a hard
  requirement — flat prompt concatenation gets 0% shared-block reuse vs ~99.7% for
  resume; TTL 1h not 5min; stagger confirmed; PRD-assumption note filed in
  ../research-workflows/NOTES-2026-07-19-m3.0-caching-spike.md); V0 struck
  (firstproof unrecoverable, corpus = AISM's 44 workspaces); V1 landed in vibefeld
  (author identity on nodes, verifier identity + batch id on validations,
  byte-identical replay across all 44 workspaces, export fields additive; pushed).
  V2/V3 queued in vibefeld's tracker.
