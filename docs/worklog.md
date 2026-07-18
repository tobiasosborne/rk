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
