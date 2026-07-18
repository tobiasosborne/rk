<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-18, session close)

**M0 is functionally complete. M0.3 ACCEPTED** (bd rk-4wm close note has the full basis).
Tree: 489 tests / 0 fail / 1 env-gated skip; `bun run selftest` OK (purity 26 files,
corpus 87/87 executed); `rk check --selftest --root .` OK; compiled binary builds.
No git remote configured — all commits local (tell orchestrator if one should be added).

## Milestone scorecard

- M0.1 contracts, M0.2 corpus, M0.4 doctor, M0.6 refs, M0.7 amendment: DONE (prior).
- M0.3 six gates + `rk check`: DONE + ACCEPTED this session. All six gates implemented
  (provenance was the last stub), corpus grown 75→87 fixtures, AISM HEAD live-fire
  0 ERRORs with rk's findings verified strictly stronger than AISM's own gates.
- M0.5 AISM cutover: **DEFERRED INDEFINITELY** (TJO directive, see below). Not an rk goal.

## Governance changes this session (all TJO-ratified, in CLAUDE.md==AGENTS.md + bd memory)

1. **Reviews: codex gpt-5.6-sol via `codex exec`** (xhigh for Tier A, high for Tier B).
   Fable reviews only with explicit TJO permission. Invocation pattern in CLAUDE.md §3.
2. **Two-list reviews**: landing-blockers (BLOCKER/MAJOR on validity semantics) vs
   follow-ups (beads, batched, non-gating). Repair rigor follows the finding's tier.
3. **Anti-Zeno cap**: ONE review round + ONE repair wave per milestone, hard stop.
   Orchestrator verifies repairs mechanically; no hostile re-review of repairs.
   (M0.3 ran 3 rounds before this rule existed — do not repeat.)
4. **AISM stance (strongest form)**: AISM is a case study in what NOT to do. rk must
   serve ANY theoretical campaign (SC7 is the vision core). AISM permissible only as
   incident-history seed + read-only crash-test corpus. Plan note filed at
   `../research-workflows/NOTES-2026-07-18-aism-role.md`; M2/M3/M4 AISM touchpoints
   need explicit TJO calls at those boundaries.
5. Orchestration model: Fable orchestrates + bookkeeps; Sonnet/Opus subagents implement
   (disjoint file scopes, explicit-path commits); codex reviews.

## Review-cycle outcome (M0.3, 3 rounds — pre-cap)

Review records: docs/reviews/2026-07-18-m0.3-{milestone-review,rereview,review3}-codex.md.
Acceptance chain: aism-divergence-triage{,-v2,-v3}.md (v3 final: rk-bug 0, flood PASS
by ratified per-check count). Highlights fixed along the way: stale-source false-PASS
paths, optional-facts semantic split, coverage-line lies, a purity grep that never
scanned 5 of 6 gate files, refs crash on null externals, symlink crash-before-boundary.
Six reviewer rulings ratified (a-e + aggregate-flood), one overturned and fixed
structurally (check-6 WARN aggregation, 139→2 WARNs on AISM, zero verdict change).

## Architecture notes for next session

- Snapshot edge: `loadSnapshot` (src/gates/load.ts) supplies REQUIRED SnapshotFacts
  {sha256 (every present file, raw bytes), tracked (git ls-files), dirs (incl. empty)}.
  lstat policy: symlinks content-invisible. Load failure → `<snapshot-load>` ERROR,
  never an uncaught exit. Pure test builder: snapshotFromFiles (hashes via pure
  src/gates/sha256.ts, byte-identical to edge hasher).
- Corpus infra: src/corpus/{run,discovery,report}.ts (edge). EXPECTED_FIXTURE_COUNT
  single source of truth in discovery.ts (=87). Fixtures may carry repo/.rk/config.json
  ONLY with a matching expected.json config_override declaration.
- src/gates is pure (marker-scanned, full leading comment block) EXCEPT allowlisted
  load.ts/config-load.ts — relocation debt filed as rk-7uc; do not grow the allowlist.

## Next steps (in order)

1. **M1 scaffold** (plan M1.1–M1.5): template set, `rk init`, `rk phase`, `rk upgrade`
   stub, dogfood 1 on a fresh small conjecture. This is the generality-defining
   milestone — dispatch parallel Sonnet implementers, ONE codex review at the boundary.
2. **rk-hq9 (P2): AISM-residue audit** — at the M1 boundary, justify/configure/remove
   every AISM-derived assumption in gate contracts + defaults (candidate list in bead).
   Natural companion to M1.1 template design.
3. **rk-7uc (P2)**: relocate load.ts/config-load.ts out of src/gates (batch with M1).
4. Backlog P3s: rk-fdl (refs test cleanup), rk-rko, rk-t14, rk-zjq, rk-w91 (V0
   firstproof recovery-or-strike decision), rk-8ux (fr binary refresh — TJO decision,
   de-prioritized with AISM work).

## Standing cautions

- Shared working tree for parallel agents: disjoint file scopes, explicit-path commits
  only (never `git add -A`), re-read shared files (corpus/README.md) before editing.
- codex exec can hang at startup (0 CPU, no session file in ~/.codex/sessions) — the
  health-check pattern: after launch, wait ≤3 min for the rollout file; relaunch if
  absent. Log the full stream to a file; never pipe through `tail`.
- CLAUDE.md==AGENTS.md byte-identity: every CLAUDE.md edit must `cp` to AGENTS.md.
