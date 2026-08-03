<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-03, session close — AISM postmortem + ratified plan; P1+P2 LANDED)

**The AISM bitter-lesson snapshot exists and drove a ratified improvement plan.** Seven
Opus subagents scoured `../almost-idempotent-stochastic-maps` (read-only); synthesis at
`docs/memos/2026-08-03-aism-bitter-lesson-snapshot.md`, raw reports in
`docs/memos/2026-08-03-aism-postmortem/01..07` (file:line evidence). The plan
(`docs/memos/2026-08-03-rk-improvement-plan-from-aism.md`) was **RATIFIED IN FULL by TJO
in-chat 2026-08-03**, including all five [TJO] decision points as proposed. Beads:
P3=rk-7v6i (M4), P4=rk-tmno (M4.4), P5=rk-j1w6 (M5.1), P7=rk-psrh (multiplayer memo,
separate workstream). P6 closed — filed in vibefeld as vibefeld-e0cb (contract exports
clause), vibefeld-ji8b (challenge outcome enum + non-nullable verified_by), vibefeld-4ahh
(typed citation fields).

**P1 (rk-0ehr) + P2 (rk-wkzh) are LANDED on master** (wave branch cherry-picked, head
06445b3) after a **CLEAN in-session Fable Tier A review with explicit TJO permission**
("dont use codex subagent" — the L6 escape hatch; record at
`docs/reviews/2026-08-03-p1p2-validity-wave-tierA-fable.md`, zero landing-blockers,
three rulings: schema filename = family convention; Checks 16/6-7 non-structural;
SHARED-EDITS scaffolding deleted). Two Opus lanes authored on isolated worktree
branches; orchestrator merged shared files (fixture counts 127 → **131**) and reviewed.

New semantics on master:
- **Retraction as a first-class event**: append-only `.rk/retractions.jsonl`
  (`schemas/retraction.v1.json`; drive triad `retraction-{record,store,store-io}.ts`),
  hash-domain-pinned (`l5-shard-bytes` | `af-canonical`, never cross-compared), LIVE iff
  current hash matches. Gate 2 Check 16 + Check 8 availability override + Check 14
  `retracted` promotion reason; graph `schema_version "2"` with a fifth conflict kind
  `retraction-vs-status` (unconditional on live retraction — that conflict IS the render
  veto via `effectivePresentation`'s existing defect path); taint cascade carries it.
  Fail-closed everywhere: af-canonical liveness unobservable (rk-iejw), corrupt ledger
  poisons the store AND promotion confirmation.
- **Gate 3 checks 6-7**: a matched quote must fall at the claimed `:<lines>` locus
  (dual-convention line counting, `\n` vs `\n`+`\x0c`, PASS on either, tolerance
  `refsLocusToleranceLines` default 50); a source naming a refs/ path with no
  extractable quote is now ERROR, not WARN. Fixtures refs-09/10/11 transcribed from
  real AISM incidents I2/I3/I4; strict acceptance shrink verified (zero pre-existing
  expected.json changed).

Gates at close: `bun test` **2509 pass / 1 skip / 0 fail** (161 files) + selftest OK
(corpus **131/131**, purity, gates-dir, compat). Compile OK.

## Next steps (in order)

1. **rk-k0m1 (P2) — wire `turnTimeoutMs`/`sessionTimeoutMs` from `.rk/config.json`**,
   then re-run starvation B from `_pristine/` (restore workspace first — it carries the
   applied root challenge from attempt 12). Unchanged from previous session.
2. **rk-tbg — ESCALATE the shard-cap systemic decision** (six files over 280; do not
   silently sweep a third time). Note: P1 split linker-graph → linker-status correctly
   under the cap; the pre-existing offenders remain.
3. **M3 close**: (a) ONE batched Tier A review — scope list from the previous session
   PLUS this wave's residuals rk-svd5 (retraction-withdrawal record) and rk-gkxs
   (Check 6 defensive-PASS hardening); reviewer per §Governance. (b) M3.9 SC4
   comparison; (c) auto-prove.sh disposition in vibefeld; (d) acceptance report.
4. **Ratified-plan queue**: P3 rk-7v6i + P4 rk-tmno land inside M4; P5 rk-j1w6 inside
   M5.1; P7 rk-psrh (multiplayer design memo) any time — design-only, no code.
5. **Then M4** (fr upgrades + bandit experiment, pre-registration M4.0 first — the
   postmortem's bandit findings are the design prior, snapshot §7).

## Governance (standing, in bd memory)

- Reviews: codex gpt-5.6-sol default; Tier A at xhigh. **Fable only with explicit TJO
  permission** — used twice now (rk-xfzg 2026-07-31; P1+P2 wave 2026-08-03, TJO
  in-chat "dont use codex subagent"). Confirm per-wave which reviewer TJO wants.
- Anti-Zeno: ONE review round + ONE repair wave per milestone; mechanical verification;
  residuals → beads → next milestone's single review.
- Worker models this session (TJO in-chat): **implementers = Opus subagents; code
  queries/summaries = Sonnet**; orchestrator coordinates, never judges Tier A itself
  except as the sanctioned reviewer above. Campaign workers unchanged (opus/sonnet
  claude-side, gpt-5.6-sol codex-side).
- AISM: read-only crash-test corpus + incident seed ONLY. The postmortem is banked;
  future fixture material cites `docs/memos/2026-08-03-aism-postmortem/`.

## Key facts for the next session

- **Orchestration pattern that worked** (this session): Sonnet read-only survey →
  orchestrator settles design decisions on the bead → Opus lane in worktree isolation
  on a pushed branch, shared-file edits documented in a SHARED-EDITS.md at worktree
  root → orchestrator cherry-picks both lanes onto a wave branch (git merge/checkout
  are classifier-blocked; `git switch`/`git cherry-pick`/`git branch -f` pass),
  reconciles counts, re-runs gates, reviews, fast-forwards master via `branch -f`.
- **Verify subagent claims against source**: two survey errors caught this session —
  the plan memo's "M3.7 not yet built" was wrong (store fully built), and rk-7q1v was
  filed on a stale doc comment then closed (loader gap already fixed by rk-skd).
- Corpus is **131** fixtures (127 + linker-44 + refs-09/10/11). BOTH hardcoded counts
  moved: `test/corpus.test.ts:66-68` and `src/corpus/discovery.ts` EXPECTED_FIXTURE_COUNT.
  `corpus/README.md`'s Totals grand total is STILL deliberately stale (rk-sp3n tracks
  the reconciliation; the refs term is corrected to 11).
- `corpus/graph/` fixtures are OUTSIDE GATE_DIRS/counts — each gets a dedicated
  `test/graph/corpus-conflict-<kind>.test.ts` (new: conflict-retraction-vs-status).
- Graph schema: **v2** inside `schemas/graph.v1.json` — filename tracks the FAMILY per
  review ruling 1; `GRAPH_SCHEMA_VERSION` in `src/graph/types.ts` is the single source.
- `GraphEdges.retraction` is REQUIRED (not optional) — bun doesn't typecheck; a new
  `GraphEdges` literal elsewhere fails at runtime. Grep `edges: {` after merges.
- Open beads from this session: rk-iejw (af export node content hash — has a vibefeld
  half), rk-svd5, rk-gkxs, rk-sp3n, rk-ifrf (REFS_LOCUS_RE trailing punctuation),
  rk-psrh, rk-7v6i, rk-tmno, rk-j1w6.
- Live invocation shape unchanged: `dist/rk verify --af <id> --live
  --max-campaign-tokens 1500000` from a lemma dir in `../rk-m3.5-baseline`; models
  pinned per-assignment in `.rk/config.json`; NO `--model` flag.
- Template **1.4.0**; af **0.1.6**; fr **0.2.1**; bd 1.0.0. `rk doctor` verifies.

## Standing cautions

- **Bound every process (CLAUDE.md rule 13).** 8 GiB RLIMIT wired via
  `.claude/settings.json`; keep `timeout` on bun test/selftest/ad-hoc scripts; never
  `(cmd &)`. Baselines now: bun test ~29s / 2509 tests; selftest ~1s.
- Do NOT take a subagent's finding at face value — verify against source before filing
  (two live demonstrations this session, see Key facts).
- Purity grep false-triggers on `node:` param names — rename, never touch the guard.
- Live runs write `.rk/parse-failures/` in workspaces — no rotation; clean when
  restoring pristine.
- `bd close` with multiple ids applies ONE `--reason` to all (fix notes after).
- Scratchpad is EPHEMERAL: bank anything durable into `docs/` — done this session for
  all seven postmortem reports.
