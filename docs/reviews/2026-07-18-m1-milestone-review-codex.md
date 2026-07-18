## LIST 1 — LANDING-BLOCKERS

1. **BLOCKER — arbitrary config values can silently disable validity checks.** [src/store/config-load.ts:39](/home/tobiasosborne/Projects/rk/src/store/config-load.ts:39) casts every JSON object to `Partial<GateConfig>`, and [src/gates/config.ts:64](/home/tobiasosborne/Projects/rk/src/gates/config.ts:64) spreads it without runtime validation. Consequently, `phase: "typo"` reaches [src/gates/phase.ts:40](/home/tobiasosborne/Projects/rk/src/gates/phase.ts:40), where every value other than `"consolidation"` receives exploration demotion. Separately, `shardsMaxLines: "garbage"` makes the comparison at [src/gates/shards.ts:152](/home/tobiasosborne/Projects/rk/src/gates/shards.ts:152) false: the 284-line `shards-01` tree reports no finding and `1/1 fully conforming`. A typoed config can therefore produce both a loose phase and false-green coverage.

2. **BLOCKER — Gate 4 silently excludes the scaffold’s root-level result layout.** Gate 2 recursively discovers all result shards at [src/gates/linker-parse.ts:120](/home/tobiasosborne/Projects/rk/src/gates/linker-parse.ts:120), but Gate 4 remains fixed to `argument/lemmas` at [src/gates/provenance-parse.ts:17](/home/tobiasosborne/Projects/rk/src/gates/provenance-parse.ts:17) and [src/gates/provenance-parse.ts:58](/home/tobiasosborne/Projects/rk/src/gates/provenance-parse.ts:58). A root-level `argument/lem-x.md` with `status: open`, paired with a report row framing `lem:x` as proved, gives linker coverage `1/1` but provenance coverage `0/0`, one parsed status row, and no `OVERCLAIM` ERROR. This defeats Gate 4’s stated primary failure mode at [docs/gate-contracts.md:875](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:875).

3. **MAJOR — recursive discovery permits duplicate registry ids without a structural finding.** Each recursive candidate is appended directly at [src/gates/linker-parse.ts:217](/home/tobiasosborne/Projects/rk/src/gates/linker-parse.ts:217), while downstream graph state collapses ids through `Set`/`Map` construction at [src/gates/linker-graph.ts:35](/home/tobiasosborne/Projects/rk/src/gates/linker-graph.ts:35). Valid files `argument/lem-x.md` and `argument/nested/lem-x.md`, both with `id: lem-x`, produce no findings and truthful-looking `2/2` coverage; graph, status, and contract checks then operate on overwritten identity state. Duplicate ids are explicitly structural at [docs/gate-contracts.md:186](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:186).

4. **MAJOR — consolidation transitions are not logged to `fr`, contrary to the milestone contract and stamped constitution.** The command writes the phase and optionally the worklog at [src/cli/phase.ts:97](/home/tobiasosborne/Projects/rk/src/cli/phase.ts:97) through [src/cli/phase.ts:115](/home/tobiasosborne/Projects/rk/src/cli/phase.ts:115), with no `fr` invocation or event. The M1.3 acceptance contract requires worklog plus `fr` at [IMPLEMENTATION_PLAN.md:91](/home/tobiasosborne/Projects/research-workflows/IMPLEMENTATION_PLAN.md:91), while the stamped constitution asserts both occurred at [templates/CLAUDE.md.tmpl:122](/home/tobiasosborne/Projects/rk/templates/CLAUDE.md.tmpl:122). A successful `rk phase consolidation` therefore leaves an incomplete transition audit trail and stamps an untrue process guarantee.

5. **MAJOR — the constitution promises a generated-file check that this binary does not perform.** [templates/CLAUDE.md.tmpl:102](/home/tobiasosborne/Projects/rk/templates/CLAUDE.md.tmpl:102) states that hand-editing a generated `build/` file fails `rk check`, but the registered suite contains only the six M0 gates at [src/gates/index.ts:16](/home/tobiasosborne/Projects/rk/src/gates/index.ts:16); the general freshness check is explicitly deferred to M2.6 at [IMPLEMENTATION_PLAN.md:104](/home/tobiasosborne/Projects/research-workflows/IMPLEMENTATION_PLAN.md:104). Editing a `build/` artifact is currently invisible to the verdict.

## LIST 2 — FOLLOW-UPS

1. [templates/argument/README.md.tmpl:1](/home/tobiasosborne/Projects/rk/templates/argument/README.md.tmpl:1) still describes `argument/lemmas/*.md`, and lines 10–15 state that shards live there, contradicting Gate 2’s recursive `argument/**/*.md` contract.

2. [templates/definitions/README.md.tmpl:27](/home/tobiasosborne/Projects/rk/templates/definitions/README.md.tmpl:27) teaches that `source: internal` is allowed, but [src/gates/defs.ts:153](/home/tobiasosborne/Projects/rk/src/gates/defs.ts:153) rejects it whenever a non-empty manifest lacks an `internal` source id.

3. [test/templates/templates.test.ts:226](/home/tobiasosborne/Projects/rk/test/templates/templates.test.ts:226) checks only that schema-field and enum tokens occur somewhere; it cannot detect the incorrect discovery path or field semantics above.

4. [src/cli/init.ts:146](/home/tobiasosborne/Projects/rk/src/cli/init.ts:146) checks conflicts only for manifest paths, but later unconditionally overwrites `.claude/settings.json` and `.git/hooks/pre-commit` at [src/cli/init.ts:174](/home/tobiasosborne/Projects/rk/src/cli/init.ts:174) and [src/cli/init.ts:185](/home/tobiasosborne/Projects/rk/src/cli/init.ts:185), even without `--force`.

5. [HANDOFF.md:8](/home/tobiasosborne/Projects/rk/HANDOFF.md:8) still reports M0, 489 tests, and 87 fixtures, while [HANDOFF.md:64](/home/tobiasosborne/Projects/rk/HANDOFF.md:64) lists M1 and dogfood 1 as future work; the claimed 3.2-minute SC1 result and exercised audit trigger have no committed milestone record.

6. [src/cli/upgrade.ts:55](/home/tobiasosborne/Projects/rk/src/cli/upgrade.ts:55) emits unquoted manual `diff` commands, so a stamped root containing spaces produces unusable instructions.

## Implementer flags 1–15

1. **RATIFIED** — test (d) resolves `entry.template` beneath `templates/`, not `entry.path`, at [test/templates/templates.test.ts:147](/home/tobiasosborne/Projects/rk/test/templates/templates.test.ts:147).

2. **REJECTED** — the argument guide teaches the obsolete lemmas-only path at [templates/argument/README.md.tmpl:10](/home/tobiasosborne/Projects/rk/templates/argument/README.md.tmpl:10), and the definitions guide’s `internal` rule disagrees with [src/gates/defs.ts:153](/home/tobiasosborne/Projects/rk/src/gates/defs.ts:153).

3. **RATIFIED, for Gate 2 only** — the manifest stamps `argument/` without `lemmas/` at [templates/manifest.json:27](/home/tobiasosborne/Projects/rk/templates/manifest.json:27), and Gate 2 recursively scans it at [src/gates/linker-parse.ts:117](/home/tobiasosborne/Projects/rk/src/gates/linker-parse.ts:117); Gate 4’s incompatibility remains blocker 2.

4. **RATIFIED** — the fixed per-gate classification is explicit at [docs/gate-contracts.md:224](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:224), including entirely non-structural provenance/runs/shards and demotion of the shards config-missing ERROR at line 229.

5. **RATIFIED** — `Finding.structural` is defined at [src/gates/framework.ts:24](/home/tobiasosborne/Projects/rk/src/gates/framework.ts:24), and [src/gates/phase.ts:42](/home/tobiasosborne/Projects/rk/src/gates/phase.ts:42) rewrites only non-structural ERRORs in exploration.

6. **RATIFIED** — `shardsPrefix` has no default at [src/gates/config.ts:48](/home/tobiasosborne/Projects/rk/src/gates/config.ts:48), the one-per-repo config ERROR is emitted at [src/gates/shards.ts:173](/home/tobiasosborne/Projects/rk/src/gates/shards.ts:173), and the corpus total is 92 at [src/corpus/discovery.ts:66](/home/tobiasosborne/Projects/rk/src/corpus/discovery.ts:66).

7. **RATIFIED** — Rule 10 requires versioning only for `schemas/`, `rk.compat.json`, and the bd compat surface at [CLAUDE.md:72](/home/tobiasosborne/Projects/rk/CLAUDE.md:72); `.rk/config.json` does not presently require its own schema version. This does not ratify its missing runtime validation.

8. **RATIFIED** — `goalFlag ?? northStar` is mechanical at [src/cli/init.ts:116](/home/tobiasosborne/Projects/rk/src/cli/init.ts:116).

9. **RATIFIED** — every template is imported as build-time text and exposed through the embedded map at [src/scaffold/templates-embed.ts:16](/home/tobiasosborne/Projects/rk/src/scaffold/templates-embed.ts:16).

10. **RATIFIED** — bd is invoked with all three non-clobber flags at [src/cli/init.ts:202](/home/tobiasosborne/Projects/rk/src/cli/init.ts:202).

11. **RATIFIED** — the mirror amendment is explicitly outside the triad at [docs/gate-contracts.md:580](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:580), as is the report-root amendment at [docs/gate-contracts.md:1345](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:1345).

12. **REJECTED** — no committed SC1 measurement supports 3.2 minutes; [HANDOFF.md:64](/home/tobiasosborne/Projects/rk/HANDOFF.md:64) still describes dogfood 1 as unstarted.

13. **RATIFIED** — Gate 2’s input contract states recursive discovery, basename exclusions, and the always-visible ignored count at [docs/gate-contracts.md:425](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:425).

14. **RATIFIED** — the constitution explicitly defines a cycle as one orchestrator session, labels the M1 trigger constitutional, and defers mechanization to a later release at [templates/CLAUDE.md.tmpl:152](/home/tobiasosborne/Projects/rk/templates/CLAUDE.md.tmpl:152).

15. **REJECTED** — help and PATH guidance landed, but “honest command references” is not fully satisfied: [templates/CLAUDE.md.tmpl:102](/home/tobiasosborne/Projects/rk/templates/CLAUDE.md.tmpl:102) promises an absent freshness check, and [templates/CLAUDE.md.tmpl:122](/home/tobiasosborne/Projects/rk/templates/CLAUDE.md.tmpl:122) promises an `fr` transition log the command never writes.