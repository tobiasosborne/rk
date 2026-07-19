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
