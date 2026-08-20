<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-20, session close — quantum-PCP campaign (rk-campaign-E) bootstrapped; three Tier A rk items in repair waves on branches)

TJO directives this session (in-conversation): target = quantum PCP, HAMILTONIAN version,
north star a complete rigorous proof; signature schema + notation register are rk-OWNED; roster
per orchestrator recommendation; orchestrate with ZERO Fable subagents, codex gpt-5.6-sol xhigh
for reviews/hard lanes, opus for heavy cognition, sonnet for mundane. TJO's own idea, the
flow-expanderisation note (`../codex-scratch/flow-expanderisation.tex`), is a pre-registered arm
candidate, ingested as `kind: original` content only.

Design record: `docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md` v2 — phases 0-4 with
mechanical acceptance bars; authored hash-bound extraction + review records with GENERATED cards;
convention profile + notation register + Gate 9; interval-valued signatures over chain|poset
lattices with least-fixed-point route entailment (Check 17); mechanical bite core; admission is
phase-independent (new checks structural). v1 was REJECTED by codex xhigh (9 blockers); v2 is the
single repair wave (`docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md`, verification table).

Landed on master this session (all pushed): campaign-D restored from its bundle (bd dolt state
for D is NOT bundled — empty bd there); `rk refs snowball` (rk-hzla, CLOSED: S2 citation closure
+ triage ledger; unauthenticated S2 throttles to ~1 paper/min); vendor wiring for campaigns D+E;
four review records under `docs/reviews/`.

**NOT landed — three Tier A branches, each REJECTED once by codex xhigh and now in their SINGLE
repair wave (anti-Zeno: verify mechanically against file:line claims, then merge; no re-review):**

| bead | branch (worktree under .claude/worktrees/) | first impl | review record |
|---|---|---|---|
| rk-nsex records gate (Check 11/12, cards-v1, schemas extraction-record/card-review) | `worktree-agent-a9f0e64703ddb02bd` | 186 fixtures | `2026-08-20-rk-nsex-tierA-codex.md` (6 blockers: source binding, statement envelope, join optional at promotion, cards-v1 non-structural, lossy canonical JSON, schema under-enforced) |
| rk-5lzf profile schema + notation shards + Gate 9 + recursive defs discovery | `worktree-agent-a54164d035c96a7d3` | 188 fixtures | `2026-08-20-rk-5lzf-tierA-codex.md` (6 MAJOR: meaning not byte-bound, blessed not tied to register/overlap false green, quoted-line bypass, vacuous class coverage, evadable compat check, ambiguous recursive ids) |
| rk-8805 signature schema + Check 17 + graph v3 + bite core | `worktree-agent-a642886cb46efe3cc` | 188 fixtures | `2026-08-20-rk-8805-tierA-codex.md` (6 MAJOR: duplicate predicates any-match, canonical non-unique, `required` evaded via kind, projection drops signature, v3 schema rejects intervals, bite clauses incomplete; ENTAILMENT CORE CONFIRMED) |

Each lane was told at wind-up to commit WIP on its branch and note state on its bead. Branch
tips and bead notes are the ground truth for what got repaired; the worktree dirs may be gone.
Corpus counts COLLIDE across the three branches (each bumped from 176 independently; 5lzf and
8805 both claim 188; 5lzf also changed the corpus runner to apply `applyPhase`, and added a
`notation` GATE_DIR) — integration reconciles `test/corpus.test.ts` (title + assertion +
EXPECTED_FIXTURE_COUNT) and `corpus/README.md` Totals ONCE, after all three repair waves.

## Current work

Integration of the three Tier A branches, in this order: rk-nsex (phase 0b needs it) ->
rk-5lzf -> rk-8805. For each: read the bead note + branch log; verify each blocker's fixture
exists and fails on its code; `timeout 300 bun test` + `timeout 120 bun run selftest` on the
branch; merge to master; reconcile counts; append the verification table to the review record.

## Next steps

1. Finish/verify the three repair waves (above); merge; rebuild `dist/rk`; push.
2. New bead from this session: phase-matrix amendment (new checks structural) — folded into the
   three branches; close it at integration if covered.
3. Campaign E (`../rk-campaign-E/HANDOFF.md`): resume depth-1 closure (41/149 cached), bless the
   profile after rk-5lzf, records after rk-nsex.
4. Tier C beads from this session: refs payload gitignore stamp; `arXiv:` locator case.
5. Unchanged queue: rk-t69x, rk-yic3, rk-ptx0/rk-lmtr (Gates C/D — now a HARD prerequisite for
   campaign-E phase 3), rk-23pr, rk-cz1h, rk-4w2y wave, rk-rz74 (its bead is MISSING on this
   device — re-file: provenance-existence gate).

## TJO decision queue

1. Campaign E D1: north-star reduction class — Karp (in force) vs AAV's quantum poly-time.
2. Campaign E D7: Gate 9 exemption for settled `contract:` lines (likely moot as built).
3. Semantic Scholar API key for the closure crawl.
4. Carried: rk-cz1h memo §6.1; rk-23pr ratification; rk-mief; window-5 waiver; campaign codas;
   campaign-D frozen-P1 erratum; promotion permission-hold FYI.

## Key facts

- **Corpus count on master is 176**; the three branches each carry their own count.
- Codex invocation that worked all session (5 reviews, 0 kills): `codex exec -s read-only
  [-C <dir>] -c model_reasoning_effort="xhigh" -o <file> "<prompt>" < /dev/null`, tracked
  background task, `timeout 5400`. For branch reviews run it from inside the worktree.
- Opus implementers in `isolation: worktree` worked well; the hazard is exactly the shared count
  files (memory: rk-orchestration-shared-file-writers).
- Campaign-D bd is EMPTY on this device (dolt state never bundled; vendor/README documents it).
  rk-rz74 is likewise absent here. `make refresh-bundles` now bundles D and E.
- Campaign E roster: Fable sole seat, zero Fable workers; prover codex / verifier opus in
  `.rk/config.json`; consolidation phase; TJO note source id `tjo-flow-expanderisation-2026`.

## Governance (standing)

L1/L2 never relaxed; 176/176 + selftest green on master at close. D1-D9 + A1 stand. bd for all
tracking. Campaigns: A wound down, B closed, C between windows, D restored here (audit due at its
next close, counter 9/10), E session 1 closed (audit counter 1/10).
