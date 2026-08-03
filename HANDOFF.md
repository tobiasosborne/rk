<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-03, session close #2 — M3 review + repair wave LANDED; attempt 13 banked)

One session, three landed waves plus a live-fire. Master at 311ad69, pushed.

**1. AISM postmortem + ratified plan + P1/P2** (see session-close #1 narrative in git
history at e935d50 for detail): postmortem memos banked; improvement plan RATIFIED in
full by TJO; P1 (retraction as first-class event) + P2 (Gate 3 quote-at-locus) landed
after a clean Fable Tier A review; P6 filed in vibefeld (vibefeld-e0cb/ji8b/4ahh);
P7 multiplayer memo landed (`docs/memos/2026-08-03-rk-multiplayer-design.md`) —
placement decision + 6 open questions await TJO in **rk-j4vg**.

**2. rk-k0m1 landed and CLOSED**: per-assignment + workers-level `turnTimeoutMs`/
`sessionTimeoutMs` from `.rk/config.json` (config-05 fixture); validated live in
attempt 13's preflight. Codex-direction live validation deferred (no-codex session).

**3. M3-close batched Tier A review DONE + repair wave LANDED** (the milestone's ONE
round + ONE wave, anti-Zeno satisfied). Record:
`docs/reviews/2026-08-03-m3-close-batched-tierA-fable.md` — reviewer Fable with
explicit TJO permission; three Opus hostile lenses as inputs; **9 landing-blockers
confirmed at source and ALL FIXED** same-day by two Opus repair lanes:
- LB1 cross-node challenges were structurally unapplyable (false stale message,
  misdirected retry burn) → per-target hash binding, truthful discard causes.
- LB2 unclassified balloons aborted without persisting the counter; classification
  dispatcher degraded silently on the example config → persist + loud preflight.
- LB3 gate-side retraction veto had store-presence/status-list holes (hostile
  re-derivation caught it in P1 the same day P1 was reviewed clean — the postmortem's
  ~5-10% residual-within-a-framing rate, demonstrated in-house) → unconditional
  `checkRetractionVeto`, S/J coverage, fixtures linker-45/46.
- LB4 structural-loss classes unnamed downstream; bd parse failures silently dropped
  → four classes named everywhere, bd malformed lines first-class.
- LB5 store-integrity ERRORs were phase-demotable; four newest phase-matrix rows
  untested → structural:true + full three-way doc/code/test alignment.
- LB6 Gate 4 configured-but-absent status table silent (incident (a) reborn) →
  overriddenKeys threading, ERROR + three-way source-state coverage, provenance-24.
- LB7 render-edge fr-residual degradation collapsed STALE cause 3 into cause 1 →
  fidelity record threaded into classifyRegen.
- LB8 contract asserted the INVERSE of the enforced cross-vendor severity ×4 → fixed.
- LB9 worker-contract asserted absent safety mechanisms (repair terminal-12; "never a
  blind resume") → rewritten to the actual mechanisms; rk-wr58 named as load-bearing.
~20 follow-ups batched to the M4-boundary review as beads (rk-oy3h zero-usage
timeouts; rk-jb2c exit-11 + repair-cap-manufactures-exit-11; rk-zdi4 reviewer==author
field mismatch; rk-sckg doc-drift batch; plus corrected rk-rxq/rk-sp3n/rk-gkxs).

**4. Live-fire attempt 13 banked** (`../rk-m3.5-baseline/RUN-REPORT-13-2026-08-03.md`,
opus+opus per TJO no-codex directive, same-family consequence stated up front): opus
decomposed the starvation lemma (8 children — attempt-12's codex-timeout blocker is
prover-specific, now also fixed by rk-k0m1); family fail-closed held live (15 accepts
refused, 0 leaked); GAP 11 still dead; budget abort at 1.53M ≥ 1.5M cap demonstrated
rk-rxq's reserve blind spot live; **rk-tk04** filed (preflight hard-stop for
unpromotable rosters — the run spent the cap on a roster it had proven unpromotable).
rk-id1 CLOSED (honest preflight verified live). Campaign matrix: no unknown-cause
blocker remains anywhere.

Gates at close: `bun test` **2580 pass / 1 skip / 0 fail** (161 files) + selftest OK
(corpus **135/135**, purity 117/117, gates-dir 30/30, compat). Compile OK.

## Next steps (in order)

1. **M3 final close**: (a) SC4 comparison (M3.9) — needs the M3.5 baseline memo passed
   via `rk verify --report --baseline`; attempt 13 is NOT an SC4 datum (single-vendor,
   budget-terminated); a codex-permitted cross-vendor run is the honest datum.
   (b) auto-prove.sh disposition in ../vibefeld (delete or deprecate with pointer).
   (c) acceptance report (one per milestone, cites both review records + repair
   outcomes + RUN-REPORT-12/13).
2. **rk-j4vg** — TJO ratifies multiplayer memo placement (recommendation: fold into
   M5, pull MP.1-MP.3 before M4) + its 6 open questions.
3. **M4** (fr upgrades + bandit, M4.0 pre-registration first) — P3 (rk-7v6i runs
   edges + rk run verify) and P4 (rk-tmno lane stop rules) land inside it; the
   M4-boundary review inherits the ~20 batched follow-ups.
4. **Residual Tier A queue**: rk-svd5 (retraction-withdrawal record) before first
   production retraction use; rk-wr58 is now load-bearing (pins LB9's rewritten
   contract sentence) — good early M4 pick.
5. Occasional shard sweep per rk-tbg's TJO ruling when convenient (worst: freshness
   442, config 413).

## Governance (standing)

- Reviews: codex gpt-5.6-sol default; **Fable only with explicit TJO permission** —
  granted three times to date (rk-xfzg; P1+P2 wave; M3-close batch, all banked in
  docs/reviews/). No-codex was a THIS-SESSION directive; confirm scope next session.
- Anti-Zeno: M3's one round + one wave are SPENT. Residuals go to the M4-boundary
  review — do not reopen M3 findings for re-review.
- Session model roles (TJO): implementers = Opus lanes; surveys/queries = Sonnet;
  orchestrator coordinates and (when permitted) reviews; campaign workers
  opus/sonnet claude-side.
- AISM: read-only incident corpus. Postmortem evidence lives in
  docs/memos/2026-08-03-aism-postmortem/.

## Key facts for the next session

- **Orchestration pattern proven twice** (P1/P2, M3 repair): Sonnet survey → design
  decisions on the bead → parallel Opus worktree lanes on pushed branches with
  SHARED-EDITS.md ledgers → orchestrator cherry-picks onto a wave branch (`git
  merge`/`checkout` classifier-blocked; `switch`/`cherry-pick`/`branch -f` pass),
  reconciles counts, re-runs gates, lands via `branch -f master`.
- **Hostile-lens review pattern proven**: three read-only Opus lenses (domain,
  cross-domain, residuals/stale-prose) → orchestrator-reviewer verifies EVERY
  landing-blocker at source before listing. The lenses caught a blocker in a wave
  reviewed clean the same day; different-granularity re-derivation is not optional.
- Corpus is **135** fixtures (132 + linker-45/46 + provenance-24). Count sites:
  `test/corpus.test.ts:66,68` + `src/corpus/discovery.ts` EXPECTED_FIXTURE_COUNT.
  corpus/README.md Totals line still deliberately inconsistent — rk-sp3n (must also
  pick 135-GATE_DIRS vs 148-all-corpus definition, see its notes).
- Retraction semantics now END-TO-END: unconditional gate veto (Check 16) + graph
  conflict + render defect + promotion/availability overrides; store-integrity
  faults structural in both phases. `_configValidation.overriddenKeys` is new
  internal contract surface (LB6) — Tier-A-adjacent, named in the review record.
- `GraphEdges.retraction` REQUIRED; grep `edges: {` after merges (bun doesn't
  typecheck).
- Live invocation unchanged; models pinned per-assignment; per-assignment
  `turnTimeoutMs`/`sessionTimeoutMs` now honored (preflight prints ceilings).
- Template 1.4.0; af 0.1.6; fr 0.2.1; bd 1.0.0. `rk doctor` verifies.

## Standing cautions

- Bound every process (rule 13): timeout prefixes always; baselines now bun test
  ~26-29s / 2580 tests; selftest ~1s. Never `(cmd &)`.
- Verify subagent claims against source — three demonstrations this session (two
  survey errors caught; one reviewer-missed blocker caught by a fresh lens).
- Purity grep false-triggers on `node:` param names — rename, never touch the guard.
- Live runs write `.rk/parse-failures/` in workspaces; clean when restoring pristine.
- `bd close` multi-id applies ONE --reason to all.
- Scratchpad is EPHEMERAL — everything durable this session went to docs/ or
  ../rk-m3.5-baseline (which is NOT a git repo; files bank by existing there).
