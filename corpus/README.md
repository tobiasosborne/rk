<!-- ROLE: fixture ledger — the tracked index of every red-corpus fixture required by
     docs/gate-contracts.md. UPDATE POLICY: rewritten whole as fixtures are added/landed;
     a fixture id must appear here before or alongside the WP that adds it under corpus/.
     TRIGGER: any change to docs/gate-contracts.md's per-gate fixture tables; landing a
     fixture directory under corpus/<gate>/<id>/ (M0.2). -->

# Corpus — the red-fixture ledger

CLAUDE.md L2 (red corpus first): "Any gate or check guarding a failure mode ships with a
corpus fixture reproducing that failure mode, drawn from a real incident where one exists...
A gate with no red fixture does not exist." This file is the tracked ledger of every fixture
named in `docs/gate-contracts.md`'s per-gate "Corpus fixtures required" tables — the plan
(M0.2) builds one minimal repo fixture per row below; `bun run selftest` (`scripts/
selftest.ts`) actually runs every one of them (see "`bun run selftest` actually runs the corpus"
below — rk-6vw, 2026-07-18 M0.3 milestone review finding 6).

Not every violation class has a real AISM incident behind it — several gates are preventive
(no drift has actually occurred in AISM's history at time of writing). Where a real incident
exists, the **source incident** column names it precisely (with a citation into AISM's own
history); where none exists, it says `class-driven (no incident on record)` — recorded
honestly rather than invented. `[PLAN]` in the id marks a fixture IMPLEMENTATION_PLAN M0.2
names as mandatory.

Status is `planned` for every row until M0.2 lands the fixture directory (`corpus/<gate>/<id>/`)
and `planned` becomes `landed` in a follow-up edit to this table.

| fixture id | gate | violation | source incident | status |
|---|---|---|---|---|
| `defs-01` | defs | missing/unterminated frontmatter | class-driven (no incident on record) | landed |
| `defs-02` | defs | frontmatter line without `:` | class-driven (no incident on record) | landed |
| `defs-03` | defs | missing required field (id/term/kind/status) | class-driven (no incident on record) | landed |
| `defs-04` | defs | `id` != filename stem | class-driven (no incident on record) | landed |
| `defs-05` | defs | bad `kind` enum value | class-driven (no incident on record) | landed |
| `defs-06` | defs | bad `status` enum value | class-driven (no incident on record) | landed |
| `defs-07` [PLAN] | defs | duplicate alias (DRIFT) | class-driven (no incident on record; the guard is preventive per `definitions/README.md:9-10`) | landed |
| `defs-08` | defs | `cited` shard, unknown source-id | class-driven (no incident on record) | landed |
| `defs-09` | defs | `cited` shard, sha256 not in manifest | class-driven (no incident on record) | landed |
| `defs-10` | defs | `cited` shard, sha under a different source (WARN) | class-driven (no incident on record) | landed |
| `defs-11` | defs | `cited` shard, payload absent locally (WARN) | class-driven (no incident on record) | landed |
| `defs-12` | defs | consensus/original shard missing `consensus:` | class-driven (no incident on record) | landed |
| `defs-13` | defs | `status: draft` golden case (WARN) | baseline, not a violation | landed |
| `defs-14` | defs | manifest file entirely absent (WARN) | class-driven; same shape as `refs-01` at smaller scale | landed |
| `defs-15` [TJO] | defs | `cited` shard, `source:`/`sha256:` BOTH entirely absent — strict ERROR | 2026-07-17 TJO premise correction (CLAUDE.md L5 amendment, commit 542197c; F5 reversed in the Fable-review addendum), contract amendment **landed in M0.7**: AISM's own script passes this silently (check-defs.py:112-118) — characterized prior art, not the spec; `docs/gate-contracts.md` Gate 1 checks 8-9 now require `source:`/`sha256:` for `kind=cited`, and Gate 1's "Corpus fixtures required" table now lists this fixture directly. Contract-backed and M0.3-enforceable (no longer anticipatory). Triage: rk-stricter-intended. | landed |
| `defs-16` | defs | nested shard invisible — a `definitions/notation/<symbol-id>.md` shard carrying `defs-15`'s violation produced ZERO findings at `checked defs: 0/0 shards`, exit 0 | **rk-5lzf**, LB5 of `docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md` ("Notation shards are outside the current definition namespace"): `src/store/snapshot-load.ts`'s `definitions` include rule was `recursive: false` and `src/gates/defs.ts` listed one level, so the register the qPCP campaign's Gate 9 checks against was not in the snapshot at all. Red pre-fix on BOTH halves (no findings AND coverage `0/0` instead of `1/1`); mutation-proven by flipping the include rule back. | landed |
| `linker-01` | argument/linker | missing/unterminated frontmatter | class-driven (no incident on record) | landed |
| `linker-02` | argument/linker | `id` != filename stem | class-driven (no incident on record) | landed |
| `linker-03` | argument/linker | bad `kind` enum value | class-driven (no incident on record) | landed |
| `linker-04` | argument/linker | bad `status` enum value | class-driven (no incident on record) | landed |
| `linker-05` | argument/linker | bad `af` enum value | class-driven (no incident on record) | landed |
| `linker-06` [PLAN] | argument/linker | dependency cycle | class-driven (no incident on record) | landed |
| `linker-07` | argument/linker | unknown `dep` id | class-driven (no incident on record) | landed |
| `linker-08` | argument/linker | unknown `routes` member id | class-driven (no incident on record) | landed |
| `linker-09` | argument/linker | unknown `defs` id | class-driven (no incident on record) | landed |
| `linker-10` | argument/linker | `af: validated` with unmet unconditional dep | class-driven (no incident on record) | landed |
| `linker-11` | argument/linker | `af: validated`, routes present, no route fully available | class-driven (no incident on record) | landed |
| `linker-12` [PLAN] | argument/linker | contract mismatch registry↔af-root | class-driven (no incident on record) | landed |
| `linker-13` | argument/linker | orphan: `af != none`, declared workspace dir missing | class-driven (no incident on record) | landed |
| `linker-14` | argument/linker | orphan: `proofs/<ws>` dir with no registry entry | class-driven (no incident on record) | landed |
| `linker-15` | argument/linker | `workspace:` field absent on `af != none` shard | 2026-07-10 remediation plan: `seed-af-workspaces.py`'s `flip_af_seeded` omitted `workspace:` on 62/151 shards (`docs/plans/2026-07-10-project-remediation-plan.md` Phase 0 item 2) | landed |
| `linker-16` [PLAN] | argument/linker | hand-edited generated file (`argument/INDEX.md`/`DAG.md` stale) | class-driven (no incident on record); this is the M0.2-mandatory "hand-edited generated file" fixture, assigned here not to `defs`/`shards` — see gate-contracts.md | landed |
| `linker-17` | argument/linker | brittleness WARN at 27 nodes | aism-s64: brittleness-cap drift (`af_constants.py:5-10`) — regression probe for the realigned cap | landed |
| `linker-18` | argument/linker | brittleness boundary golden case: 26 nodes, no warn | aism-s64 (boundary confirmed by AISM's own `test_argument.py:107-108`) | landed |
| `linker-19` | argument/linker | OR-route golden case: one route fully available | aism-3ne (OR-route feature, `bdf6800`) | landed |
| `linker-20` | argument/linker | schema-drift golden case: `routes:`-less shard, byte-identical behavior | aism-3ne backward-compat guarantee (`argument.py:77-78`) | landed |
| `linker-21` | argument/linker | missing `id:` field on a lemma shard | real crash class (not incident-observed): `argument.py`'s `parse_registry` never defaults `id`, so `l["id"]` downstream raises an uncaught `KeyError`; found by the 2026-07-17 Fable review (F12), not a live AISM event — all AISM shards carry `id` | landed |
| `linker-22` | argument/linker | `node_amended` on root node RECONCILES a `node_created`/registry-contract mismatch — golden case, no drift | **rk-co2** / `docs/reviews/2026-07-18-aism-divergence-triage.md`: AISM's `lem-hx-financing-floor` (`proofs/lem-hx-financing-floor/ledger/000043.json`, node_id `1`) amends a stale root statement to the corrected text that matches the registry contract; pre-fix `introspectWorkspace` ignored `node_amended` and read the stale `node_created` text, emitting a false contract-drift ERROR (rk-bug — the only one from the M0.3 triage). Rebuilt as a minimal fixture (real event shape, not AISM's actual content). | landed |
| `linker-23` | argument/linker | `node_amended` on root node BREAKS agreement with the registry contract — inverse case, drift must still fire | **rk-co2** companion (no separate AISM incident — proves the fix's other direction): `node_created` matches the contract at creation; a later `node_amended` on `node_id` `1` moves the statement away from the contract. Confirms the `node_amended` replay fix does not silence check 9 for a real post-amendment divergence. | landed |
| `linker-24` | argument/linker | lemma shard with NO `kind:` line at all (required field entirely absent, not just an invalid enum value) | **rk-aft** / 2026-07-18 M0.3 milestone review (codex gpt-5.6-sol) finding 3: `linker-parse.ts:125` validated `kind` only when truthy (`if (kind && !KINDS.has(kind))`), so an absent/empty `kind` short-circuited the check entirely and the lemma registered with zero findings and 1/1 coverage despite `gate-contracts.md:303` marking `kind` required (same required-field row shape as `id`). Fixed by adding a presence check ahead of the enum check, ERROR message `missing required field 'kind' (must be one of [...])`, mirroring the `id` required-field check's message convention; unlike absent `id` ([F12]), absent `kind` does NOT exclude the shard from `lemmas` — `kind` stays optional on the `Lemma` type and every other check still runs. Sanity-checked against AISM (`../almost-idempotent-stochastic-maps`, `bun run src/cli.ts check`): before/after outputs are byte-identical (200/200 lemma shards, 0 linker errors) — no live AISM shard lacks `kind:`, so this is a real gap class, not an observed production divergence. | landed |
| `linker-25` | argument/linker | `argument/INDEX.md` + `DAG.md` mirror BOTH entirely absent on an otherwise-valid lemma shard ⇒ golden pass, coverage names both mirrors' non-adoption | **R14** / bead rk-1rv (M1, `docs/memos/2026-07-18-aism-residue-audit.md` section R14): the markdown mirror is AISM's transitional view format, superseded by the M2.4 HTML render + M2.6 regenerate-and-diff gate. Check 11 is now presence-conditional PER FILE — absent means "not adopted", never a finding; `linker.ts`'s coverage line names each mirror's status visibly (`mirrors: INDEX absent (not adopted), DAG absent (not adopted)`), never a silent skip (L2). Fresh-scaffold-shaped fixture: an orchestrator live-fire (2026-07-18) found a fresh `rk init` + `rk phase consolidation` repo failing `rk check` on exactly this state. `aism_behavior: differs` — `argument.py`'s `check_generated` always ERRORs an absent mirror (`have = "" if not path.exists()`); this is the AISM residue the bead removes, not a stricter baseline, so it is not triaged into the usual rk-stricter-intended/rk-bug/ambiguous triad. Mutation-proven red-first (inverting the presence guard so `checkGenerated` always compares against the fresh render turns this fixture red; reverted after confirming). Sibling: `shards-15`. | landed |
| `linker-26` | argument/linker | three shards directly at `argument/*.md` root (dogfood shape: `lem-a` -> `lem-b` -> `thm-main` dep chain), `argument/README.md` + `argument/lemmas/README.md` both present ⇒ golden pass, coverage names both mirrors and both ignored non-shard files | **rk-9pk** (dogfood-1, real user, 2026-07-18): a dogfood session wrote three result shards — including the campaign's north-star theorem — directly at `argument/*.md` (rk's stamped scaffold creates `argument/` only, no `lemmas/` subdirectory, PRD.md:79-85). The pre-fix `argument/lemmas/*.md`-only glob reported `checked linker: 0/0 lemma shards` with zero findings and exit 0 — a green run over an entirely unvalidated north-star theorem, the silent-skip failure class CLAUDE.md L2 forbids. `linker-parse.ts`'s scan is now RECURSIVE across all of `argument/`, excluding `README.md`/`INDEX.md`/`DAG.md` at any depth; this fixture proves discovery + dep resolution both work at `argument/` root and that a same-named `README.md` at two different depths is counted (and named) correctly on the coverage line (`2 non-shard files ignored: README.md, lemmas/README.md`). `aism_behavior: differs` — AISM's `parse_registry` globs `argument/lemmas/*.md` only and would report 0 shards on this tree; this is the AISM residue the bead removes (a private repo layout convention, not a general contract), not a stricter baseline, so it is not triaged into the usual rk-stricter-intended/rk-bug/ambiguous triad — same footing as `linker-25`'s R14 amendment. Mutation-proven red-first (restricting the scan back to `argument/lemmas/` only turns this fixture red — 0/0 shards, the exact dogfood-1 symptom; reverted after confirming). | landed |
| `linker-27` | argument/linker | frontmatter-less stray `.md` at `argument/` root, named neither `README.md`/`INDEX.md`/`DAG.md` ⇒ ERROR "missing/unterminated frontmatter" | **rk-9pk** companion to `linker-26`: proves the recursive scan's exclusion list is exact-name-only — any OTHER `.md` under `argument/` MUST parse as a shard, never silently skipped, so a stray non-frontmatter file is a parse ERROR (Check 1) exactly as it would be for any malformed shard, not a third silently-ignored class. Mutation-proven red-first (making frontmatter-less files silently skip instead of erroring turns this fixture red — zero findings where one ERROR is expected; reverted after confirming). | landed |
| `linker-28` | argument/linker | duplicate registry id across recursive discovery: `argument/lem-x.md` + `argument/nested/lem-x.md` both `id: lem-x` ⇒ structural ERROR naming both claiming paths | **rk-sj6** (M1 review B3, MAJOR): each file individually passes its own id==stem check, so pre-fix both were silently appended with zero findings and truthful-looking 2/2 coverage; `linker-graph.ts`'s Map/Set construction then collapsed the two into one entry, so acyclicity/status/contract/orphan checks ran against an OVERWRITTEN identity. `parseRegistry` now tracks a rolling id→path owner map (Gate 1 DRIFT `aliasOwner` shape) and ERRORs the moment a second file claims a registered id; both shards still register (flag, never exclude). `aism_behavior: same` — AISM's `parse_registry` (argument.py:127-148) has no duplicate-id check at all. Mutation-proven red-first (disabling the duplicate-owner check turns both duplicate-detection unit tests red; reverted). | landed |
| `linker-29` | argument/linker | multi-line YAML `deps:` block list naming an unknown id ⇒ the list parses and `unknown dep 'lem-nonexistent'` ERROR fires | **rk-wc3** (dogfood-2, P1): pre-fix, `parseFrontmatter`'s flat per-line grammar left a block-list key's value empty (`- item` lines became `malformedLines`), so `parseList` yielded `[]` and checkImports validated an edgeless graph — dogfood-1's live shards got `checked linker: 3/3 ... 0 errors` with the DAG/unknown-id checks validating nothing. Fixed: block-list continuation lines join into the same `;`-separated value the single-line grammar produces, uniformly for all list-valued fields. Mutation-proven red-first (reverting the continuation logic turns the parser test and this fixture red; reverted). Sibling: `linker-30`. | landed |
| `linker-30` | argument/linker | genuinely malformed frontmatter line (colon-less, after a non-empty-valued key — not a list continuation) ⇒ ERROR `frontmatter line without ':'` | **rk-wc3** sibling: pre-fix the parser already recorded the line in `fm.malformedLines` but only Gate 1 (defs.ts) ever read that field — Gate 2 never did, so the malformation was invisible to the linker's verdict. Gate 2 now emits one structural ERROR per entry, identical message/classification to Gate 1 Check 2. `aism_behavior: differs` — AISM's `_parse_frontmatter` silently skips any colon-less line with zero diagnostic; triage rk-stricter-intended (Gate 2 catching up to Gate 1's ratified behavior). Mutation-proven red-first (emptying the `malformedLines` loop turns the unit test red; reverted). | landed |
| `linker-31` | argument/linker | critical-path node (IS the north star) validated POST-convention SAME-family (both `author`/`validated_by` parse as the same `modelFamily`, no legacy marker) ⇒ ERROR | **M3.8** (worktree agent-a9b12837c0ead0e82): PRD C2's critical-path provenance check / PRD C9's cross-vendor rule, continuous half. Ledger built with a real `af` binary rebuilt from `../vibefeld` HEAD (`af init --author` + `af accept --agent`), script-verified via `af export --graph json`. `aism_behavior`: class-driven, no AISM counterpart (AISM never had identity provenance). Sibling: `linker-34` (cross-family golden pass), `linker-38` (same shape + explicit legacy marker ⇒ WARN not ERROR). | landed |
| `linker-32` | argument/linker | critical-path node validated with NO parseable cross-vendor identity at all (`validated: true`, no `author`/`verified_by` recorded), no explicit legacy marker ⇒ **ERROR, fail closed** | **M3.8**, HARDENED by the 2026-07-19 M3 review (blocker 5a, commit 0446873): unparseable identity was a WARNING (`legacy-same-family` inferred from absence), so any new same-family result could evade enforcement via free text. Now legacy is never inferred: grandfathering requires the explicit atomic `provenance: legacy-same-family` token (see `linker-39`). Ledger built with the machine's globally-installed PRE-V1 `af` binary (0.1.5) — genuinely no `node.author`/`verified_by` fields, byte-shape-identical to AISM's 44 workspaces (0/44 carry these fields); those workspaces grandfather via the explicit marker, not automatically. | landed |
| `linker-33` | argument/linker | critical-path node validated via `af verdicts apply` carrying a `batch_id` (cross-family, so isolated from the same-family check), no explicit legacy marker ⇒ **ERROR** naming the batch id (PRD C3 exclusion violation) | **M3.8**, HARDENED by the 2026-07-19 M3 review (blocker 5c, commit 0446873): was a WARNING; post-cutover critical-path batch provenance is now an ERROR, downgradable to WARN only via the explicit atomic `legacy-same-family` marker (grandfathers the "batch validated before the node became load-bearing" case C2 names). Ledger built with a real `af` binary via the V2 kernel verb `af verdicts apply`, script-verified. `aism_behavior`: class-driven, no AISM counterpart (AISM's ledgers predate batch validation). | landed |
| `linker-34` | argument/linker | critical-path node validated cross-family (`author` family `claude`, `validated_by` family `gpt`, both parseable) ⇒ golden pass, zero findings | **M3.8**: proves the check does not false-positive on the case it exists to let through. Ledger built with a real `af` binary, script-verified. Sibling: `linker-31` (same shape, same family ⇒ ERROR). | landed |
| `linker-35` | argument/linker | `status: stated` shard with a fresh (hash-bound to current bytes) `VALID` `.rk/l5-verdicts.jsonl` record ⇒ WARN `L5 promotable` | **M3.8** deliverable 3: `src/drive/l5-promote.ts`'s `stated`→`proved-mod-audit` promotion, wired into Gate 2. `l5ContentHash` computed as the real `sha256sum` of the fixture's own shard file. `aism_behavior`: class-driven, no AISM counterpart (the L5 store is M3.7's own deliverable, first wired to a gate here). | landed |
| `linker-36` | argument/linker | `status: stated` shard whose `.rk/l5-verdicts.jsonl` record is bound to a DIFFERENT hash than the shard's current bytes (stale) ⇒ no promotion, zero findings | **M3.8** sibling of `linker-35`: an edited-since-verified shard is silent, not a defect. | landed |
| `linker-37` | argument/linker | `status: stated` shard with a FRESH `VALID-WITH-CORRECTION` record ⇒ no promotion (rule (g)), zero findings | **M3.8** sibling of `linker-35`/`l5-promote.test.ts`'s own mutation-proof: a fresh `VALID-WITH-CORRECTION` never promotes on the flagged bytes — nothing has independently re-verified the corrected bytes yet. | landed |
| `linker-38` | argument/linker | critical-path node, SAME shape as `linker-31` (post-convention same-family) but shard frontmatter carries `provenance: ...legacy-same-family` ⇒ WARNING, not ERROR | **M3.8**: the explicit grandfathering escape hatch (distinct from `linker-32`'s mechanically-detected "no parseable seam" path) — administratively-marked legacy data that happens to carry a parseable seam. Byte-identical ledger to `linker-31`; the marker alone flips the verdict. | landed |
| `linker-39` | argument/linker | critical-path node with AISM-shape unparseable identity + explicit atomic `provenance: legacy-same-family` marker ⇒ WARN (grandfathering opt-in, never demoted) | **M3 review blocker 5a** (2026-07-19, commit 0446873): unparseable identity is now ERROR (`linker-32`) UNLESS explicitly grandfathered; the atomic `;`-delimited token — never a substring match (blocker 5b) — downgrades to WARN. Byte-identical ledger to `linker-32`; the marker alone flips the verdict. Proves genuinely-old AISM data grandfathers only via explicit reviewed opt-in. | landed |
| `linker-40` | argument/linker | configured `northStarId` resolves to no registry node ⇒ fail-closed ERROR on `.rk/config.json` | **M3 review blocker 5d** (0446873): an unresolved north star previously yielded an empty critical set that silently permitted every batch and checked nothing; now a hard misconfiguration ERROR (and `composeBatches` excludes every candidate, reason `north-star-unresolved`). The distinct "no northStarId configured at all" state stays silent by design. | landed |
| `linker-41` | argument/linker | L5 store with a truncated tail line + a would-be-promotable `stated` shard ⇒ ERROR, promotion poisoned, no nudge | **M3 review blocker 6** (7e884e5): a corrupt line was a WARN that degraded coverage while an earlier VALID still promoted — exactly the hole where an earlier VALID survives a later unreadable INVALID. Any parse/ordinal/hash/chain issue now poisons promotion; the writer also refuses to append through corruption. Sibling: `linker-35` (same shard, clean store, promotes). | landed |
| `linker-42` | argument/linker | `proved-mod-audit` shard whose fresh latest L5 verdict is INVALID ⇒ ERROR: demote/re-verify | **M3 review blocker 6b** (7e884e5): Check 14 previously queried only `status: stated`, so an already-promoted shard could remain `proved-mod-audit` after a later INVALID/edit/correction-pending with zero findings — a false validity claim. Promoted shards are now continuously re-validated. Sibling: `linker-35` (stated→promotable, the opposite direction). | landed |
| `linker-43` | argument/linker | repeat balloon (`balloons: 2`, classifications `missing-fact`/`dag-dep`) ⇒ WARN `MANDATORY-REVIEW` through the FULL gate | **M3 review blocker 7c**: commit 7ede34c threaded the persisted `balloons:`/`balloon_classifications:` frontmatter into `Lemma` and gave `linker-graph.ts` a tested `checkMandatoryReview(lemmas)`, but never spread it into `linkerGate`'s findings array — a repeat/genuine-gap balloon flagged the board (`linker-render.ts`'s `MANDATORY-REVIEW` mark) yet produced no gate finding at all. `checkMandatoryReview(lemmas)` is now spread into `linkerGate` alongside `checkBrittleness` (Check 12), same WARN tier — this fixture exercises the full gate, not merely the unit (`test/gates/linker-graph.test.ts` already covered the unit). `aism_behavior`: class-driven, no AISM counterpart (the balloon/classification machinery is rk's own M3 addition). | landed |
| `linker-44` | argument/linker | **retraction as a first-class event** — two shards, one per pinned hash domain: `lem-stage1-approximate-group-laws` (`af: validated`, workspace resolved) with a live `af-canonical` retraction ⇒ Check 8 ERROR on its own unchanged validated claim; `lem-stage1-smooth-unitary-operations` (`proved-mod-audit`, backed by a FRESH `VALID` L5 verdict) with a live `l5-shard-bytes` retraction ⇒ Check 14 ERROR (`retracted`) | **rk-0ehr / P1** (ratified plan `docs/memos/2026-08-03-rk-improvement-plan-from-aism.md` §P1) — THE INCIDENT FIXTURE, real ids and a real date: AISM 2026-07-28, `docs/memos/2026-08-03-aism-postmortem/03-datamodel.md` "Drift & inconsistency found" item 1. Both proofs were af-validated on 2026-07-27 (the campaign's 95th and 100th "rigorous results"), found DEFECTIVE by an independent sweep the next day, and retracted — by hand-editing the shard plus a prose RETRACTED paragraph, so the af ledger's last event was still `node_validated`, `export.md` still read `**Status:** validated`, and the oracle verdict file still read `"result":"pass"`. Three of four layers reported pass on a withdrawn proof, because prose is not a join key and no gate checked that direction. The second shard is the half no hash comparison could ever have caught: the bytes never changed, which is exactly why retraction has to be its own event rather than another staleness rule. `aism_behavior: differs` — AISM has no retraction vocabulary at all (`grep -r retract`: no hits); not triaged into the rk-stricter-intended/rk-bug/ambiguous triad, since there is no AISM check to be stricter than. Mutation-proven red-first (see the rk-0ehr commit: disabling `isAvailable`'s retracted guard + the own-claim ERROR turns the first half red; disabling `promotionStateFor`'s retraction branch turns the second half red; reverted after confirming). | landed |
| `linker-45` | argument/linker | **the store-absent retraction hole** — a live `l5-shard-bytes` retraction on a `status: proved` shard in a repo with NO `.rk/l5-verdicts.jsonl` at all ⇒ Check 16 `retraction veto:` ERROR; coverage reads `1 live (1 l5-shard-bytes, 0 af-canonical), 1 drove a Check 16 veto ERROR` | **LB3** of the 2026-08-03 M3-close batched Tier A review (`docs/reviews/2026-08-03-m3-close-batched-tierA-fable.md`). RED-FIRST: before `checkRetractionVeto` this tree produced ZERO gate findings and `rk check` exited 0, while `src/graph/validate-conflicts.ts`'s `retraction-vs-status` vetoed the SAME tree unconditionally and `rk render` refused it — one repo, two opposite verdicts. Two independent preconditions caused the silence and this fixture exercises both at once: Check 14 early-returns on the absent L5 store BEFORE reading `liveL5`, and even with the store present `liveL5` was consulted only inside the `stated`/`proved-mod-audit` status branches (`proved` is on neither list); Check 8 cannot cover it because this retraction is in the `l5-shard-bytes` domain and Check 8 reads only `af-canonical`. Enforcement now lives in Check 16 itself, unconditional in both domains, mirroring `validate-conflicts.ts:118-133`'s own reasoning — chiefly that a veto depending on a status list silently stops working the day the list drifts. The coverage expectation pins the rk-lkeh S/J accounting (live vs drove-a-finding), never a bare live-count that READS as enforcement. `aism_behavior: differs` — AISM has no retraction vocabulary; not triaged. Perturbation confirmed red: deleting `veto.findings` from `src/gates/linker.ts`'s findings array drops this fixture to 0 findings and flips verdict/exit_code. | landed |
| `linker-46` | argument/linker | **Check 16 fail-closed** — `.rk/retractions.jsonl` line 2 truncated mid-`contentHash` ⇒ store-integrity ERROR per problem (`structural: true`) + the `proved-mod-audit` shard's promotion no longer confirmable, despite a genuinely fresh `VALID` L5 verdict bound to its current bytes | **gates-F14** of the same review, folded into LB3's fixture work: Check 16's fail-closed half had been unit-tested only, and per CLAUDE.md L2 a gate with no red fixture does not exist. A corrupt line's own `itemId` is unknowable, so it could name ANY item — reading "not retracted" for the item whose retraction IS that unreadable line is the false-validity direction. The store is therefore poisoned whole: ZERO live retractions in both domains AND one loud ERROR per problem, never a quietly-degraded "nothing retracted". Note what is deliberately ABSENT: no `retraction veto:` finding, because a corrupt store yields no live retractions by construction — fail-closed and veto are never two descriptions of one fault. The integrity ERRORs are `structural: true` per **LB5** (ledger/parse-integrity faults on the retraction and L5 stores block in BOTH phases, exactly like linker-parse/defs/refs parse faults), pinned in `test/gates/phase-classification.test.ts`. `aism_behavior: differs` — no AISM ledger to corrupt; not triaged. | landed |
| `refs-01` [PLAN] | refs | 19/19 false-green (all payloads absent) | aism-dbq: pre-fix, "the fabrication gate verifies nothing — 19/19 externals skip — and false-greens on a clean checkout" (`docs/plans/2026-07-10-project-remediation-plan.md:51`) | landed |
| `refs-02` | refs | fabricated quote, ≥40 chars | class-driven (no incident on record) | landed |
| `refs-03` | refs | fabricated quote, <40 chars | class-driven (no incident on record) | landed |
| `refs-04` | refs | IMPORT external golden case | class-driven (no incident on record) | landed |
| `refs-05` | refs | no-quote external (WARN) | class-driven (no incident on record) | landed |
| `refs-06` | refs | unparseable external JSON | class-driven (no incident on record) | landed |
| `refs-07` | refs | ≥40-char verbatim core wrapped in paraphrase (FAIL under whole-quote-match) | class-driven (no incident on record; zero refs-quote externals have ever existed in AISM history — a full history scan of `proofs/*/externals/*.json` finds none, so this is provably parity-free per the 2026-07-17 Fable review's flagged ruling #3) | landed |
| `refs-08` | refs | syntactically-valid non-object JSON external (`null`, array) — malformed-external ERROR, never a throw | **rk-6r3** / `docs/reviews/2026-07-18-m0.3-milestone-review-codex.md` finding 7: `refs.ts:138` cast a parsed JSON external without an object/null guard before reading `obj.source`, so a `null`/array external threw and killed the entire composed `rk check` (the finding's other half, `cli/check.ts:25`'s missing per-gate exception boundary, is covered by a `test/cli-check.test.ts` fault-injection test, not a separate fixture). AISM's own `check-refs.py` has the identical bug class — `check_refs`'s `d.get("name", f.stem)` (check-refs.py:180) raises an uncaught `AttributeError` on `d=None`, script-verified directly against this fixture. Triage: rk-stricter-intended. | landed |
| `refs-09` | refs | wrong-passage citation: quote bytes present and whole-quote-matching, but 83 lines outside the claimed `refs/lee-smooth-2ed/lee-2ed.txt:95` window under BOTH line-counting conventions ⇒ check 6 ERROR | **rk-wkzh** / P2 (`docs/memos/2026-08-03-rk-improvement-plan-from-aism.md` §P2, ratified 2026-08-03), AISM incident **I2** (`docs/memos/2026-08-03-aism-postmortem/07-refs-report.md` §Hallucination/staleness): `GT-lee-2ed-thm-21.10` quotes text at line 25202 while recording locus 25748 (a different theorem) — right bytes, wrong attribution, **still registered and still green in AISM**. Transcribed here at 1/230 scale: the quoted sentence is Proposition 21.2's weaker statement at line 12; the recorded locus 95 is Theorem 21.10's sharper 2n+1 statement. This is rk-wkzh's strict acceptance-shrink case: PASS before the bead, ERROR after, and the only direction any verdict moves. Runs at the shipped default tolerance (50 lines), so it also pins that the default is not vacuous. `aism_behavior: differs` — check-refs.py PASSes it (locus advisory, whole-file substring search); triage rk-stricter-intended. Mutation-proven red-first through the corpus harness (`if (atLocus.ok \|\| true)` in refs.ts turns it green at exit 0 — the bug itself; reverted). | landed |
| `refs-10` | refs | `source` names `refs/kitaev-2405.02434/approximate_algebras.tex:503-532` but carries no double-quoted run ⇒ check 7 ERROR (was WARN `skip_noquote`) | **rk-wkzh** / P2, AISM incident **I3**: `GT-kitaev-def-delta-homomorphism` in five `lem-maincb-*` workspaces (created 2026-08-02, the campaign's newest wave) writes its `source` with no `refs/` prefix and no double quotes; both regexes miss, so check-refs returns `skip_noquote` WARN and five of the newest citations sit outside the only gate that would catch a fabrication. The quoted substance was verified correct by hand — the ESCAPE was the defect, not the content. rk: green must never mean we could not parse. Boundary partner `refs-05` (no `refs/` locus anywhere in the `source`) keeps the WARN skip unchanged; the two fixtures together pin the exact edge. `aism_behavior: differs` (check-refs.py exits 0); triage rk-stricter-intended. Mutation-proven red-first (disabling the locus-present condition returns the fixture to a WARN skip with `1 no-quote-skipped`; reverted). | landed |
| `refs-11` | refs | pdftotext-shaped payload with 11 real `\x0c` bytes: the quote is at line 91 counting `\n` only and line 102 counting `\n`+`\x0c`, the recorded locus is 102 ⇒ golden PASS via the either-convention rule | **rk-wkzh** / P2, AISM incident **I4**: `pdftotext` output contains form feeds (558 before line 25748 in the Lee `.txt`); `grep -n`/`wc -l` do not count `\x0c` as a line break, Python's `splitlines()` does, so the same recorded locus resolves ~546 lines apart depending on the reader — hit live during the 2026-08-03 audit. Check 6 therefore accepts a match satisfying EITHER convention instead of picking one and widening the tolerance to cover the gap (a tolerance that large would enforce nothing). `config_override` pins `refsLocusToleranceLines` to 5 so the two conventions are genuinely discriminating at fixture scale; at the shipped default of 50 an 11-line gap would be absorbed and the fixture would prove nothing. `aism_behavior: same` (check-refs.py also exits 0, for the weaker reason that its locus is advisory). Mutation-proven red-first (dropping the `\x0c` clause from the overlap rule turns this fixture RED with one check-6 ERROR; reverted). The far-outside counterpart is `refs-09` plus `test/gates/refs-locus.test.ts`'s "outside BOTH conventions" case. | landed |
| `refs-12` | refs | `status: cited` argument shard whose embedded `rk refs quote` quote no longer matches the hash-pinned source at its recorded locus ⇒ ERROR, coverage `checked 0/1 shard citations` | **rk-uqxh**, campaign-A standing finding across four windows: Gate 3 previously scanned only `proofs/<ws>/externals/*.json`, so this tree reported `checked 0/0 externals` and exited 0 despite a drifted cited-shard quote. The source exists and matches its adopted SHA-256; only the authored quote drifted. Triage: rk-stricter-intended. | landed |
| `refs-13` | refs | `status: cited` argument shard naming an absent/unhashed refs payload ⇒ ERROR, never an unchecked cited green | **rk-uqxh**, shard-side counterpart of the canonical 19/19-skipped incident: the cited rung is unavailable when the bytes or adoption hash cannot be checked. Pre-fix Gate 3 ignored the argument shard and exited 0 at `checked 0/0 externals`; rk now reports `checked 0/1 shard citations` and fails loudly. Triage: rk-stricter-intended. | landed |
| `refs-14` | refs | intact `status: cited` argument-shard citation: adopted SHA-256 matches and the exact quote occurs at the recorded line ⇒ golden PASS, coverage `checked 1/1 shard citations` | **rk-uqxh** green control for the adjacent path:line + quoted-text grammar emitted by `rk refs quote`; proves the new check does not reject an intact citation. | landed |
| `refs-15` | refs | `status: cited` argument shard with a single-space quote ⇒ normalized-empty quote ERROR, coverage `checked 0/1 shard citations` | **rk-uqxh repair R2 / reviewer A:** the raw quote was non-empty and `sourceLine.includes(" ")` found an ordinary separator space, so the gate false-PASSed at `checked 1/1`. The gate now calls the shared `normalizeQuoteText` helper and rejects every normalized-empty quote before substring matching. Triage: rk-stricter-intended; a normalized-empty quote supplies no byte-verifiable evidence. Mutation-proven by restoring the raw `quote.length === 0` guard, which made this fixture green again; reverted. | landed |
| `refs-16` | refs | one genuine strict citation plus one blockquoted fabricated citation ⇒ ERROR, coverage `checked 1/2 shard citations` | **rk-uqxh repair R7 / reviewer B `p1b.ts`:** the blockquoted pointer was previously invisible to both numerator and denominator, producing a false-green `checked 1/1`. A permissive whole-line citation-shape detector now counts Markdown/`./`-decorated pointers and fails any hit not verified by the strict grammar. Triage: rk-stricter-intended; citation-shaped text cannot silently exempt itself through decoration. Mutation-proven by disabling the permissive detector, which restored the false-green `checked 1/1`; reverted. | landed |
| `refs-17` | refs | `status: cited` shard citing a real FlateDecode-compressed PDF (716 bytes) whose quoted sentence occurs NOWHERE in the payload's raw bytes; the lock records a `pdftotext -layout` extraction chained to the payload hash ⇒ golden PASS, coverage `checked 1/1 shard citations` | **rk-we5i** (P1), the bug's own flip: `rk refs quote` searched raw payload bytes, so even `spectral gap` returned pattern-not-found against RVW math/0406038, RV TR05-092 and JMRW 2209.07024 — no shard could carry `kind: cited` against ANY PDF source and Gate 3 reported `checked 0/0 shard citations` (fail-closed, but the cited rung was unreachable; the campaign workaround was hand-quoting `pdftotext -layout` output with PDF-page anchors and sharding at `stated`). PRD C7 already named the mechanism ("SHA256 of payload and extraction"). Both quote-side (`src/refs/quote-locate.ts`) and check-side (`src/gates/refs-extraction.ts`) now resolve a PDF payload to its extraction layer. `aism_behavior: differs` — check-refs.py has no extraction layer at all. Mutation-proven red-first: the fixture fails at `checked 0/1` with `quote NOT found byte-for-byte at recorded locus line 2` against pre-fix source, and forcing `resolveQuotableText` back to raw bytes reproduces exactly that; reverted after confirming. Fail-closed siblings: `refs-18`, `refs-19`. | landed |
| `refs-18` | refs | PDF payload is revision 2 (which states the gap CLOSES) while the extraction sidecar beside it is revision 1's text (which states the gap is bounded below) and the shard quotes revision 1 ⇒ check 10 ERROR, coverage `checked 0/1 shard citations` | **rk-we5i** fail-closed case 1 — why the extraction layer is CHAINED rather than merely present. Every non-chain check is impeccable: the payload matches its lock pin exactly, the sidecar matches its own recorded sha256 exactly, and the quote is byte-verbatim at recorded line 2 of the sidecar. An extraction admitted on presence alone therefore reports `checked 1/1` and exits 0 while certifying a claim the CURRENT source refutes — strictly worse than the rk-we5i bug it fixes. `extraction.payload_sha256` (revision 1's digest) ≠ the payload's current digest, so the citation is unresolvable. Triage: rk-stricter-intended. Mutation-proven: disabling the `payload_sha256` comparison turns this fixture green at `checked 1/1` — the exact false-verify, observed and reverted. Green control: `refs-17`. | landed |
| `refs-19` | refs | PDF payload present and hash-pinned with NO `extraction` recorded on its lock entry ⇒ check 10 ERROR naming the missing layer and the remedy, coverage `checked 0/1 shard citations` | **rk-we5i** fail-closed case 2 — the state every PDF source is in before an extraction exists, i.e. the state the bead's three field reports describe. The verdict is never a silently unchecked green and never a fallback to matching raw FlateDecode streams; the pre-fix path produced the misleading `quote NOT found byte-for-byte`, which blames the author for a tooling gap. The honest shard status while the extraction is missing is `stated`. A partially-written `extraction` record lands on this same branch (dropped, never half-trusted — `test/gates/refs-extraction.test.ts`). Triage: rk-stricter-intended. Green control: `refs-17` (same payload, extraction recorded and chained). | landed |
| `refs-20` | refs | PDF payload SWAPPED after adoption and the sidecar RE-CHAINED to the replacement, so the extraction chain is internally impeccable while the payload violates its adopted pin ⇒ check 10 ERROR, coverage `checked 0/1 externals byte-verified, 1 failed` | **2026-08-14 Tier A review finding P1-1** (`docs/reviews/2026-08-14-refs-extraction-runs-infra-codex.md`), the reviewer's own exploit against rk-we5i's extraction layer. `sources/spectral.pdf` was adopted as revision 1 (pin `2e5f8c74…`, "the spectral gap is uniformly bounded below"); the payload on disk is now revision 2 (`0ce5d389…`, "the spectral gap CLOSES"), never re-adopted. Running `rk refs quote` on the replacement made `ensureExtraction` regenerate the sidecar from the NEW bytes, so `extraction.payload_sha256` equals the payload's current digest, `extraction.sha256` equals the sidecar's own digest, and the external's quote is byte-verbatim at line 2 of that sidecar — every check `resolveQuotableText` performed passed. Only the adopted pin dissented, and the resolver never looked at it: it compared `payload_sha256` to the payload's CURRENT hash only. Gate 3's shard-citation half pin-checks its claims before calling the resolver; **the externals half never did**, so this rode straight through at `checked 1/1`, exit 0. The pin comparison now lives in the resolver itself (single validity core, defense in depth). Triage: rk-stricter-intended. Mutation-proven red-first: red against pre-repair source (`checked 1/1`, exit 0, zero findings), green after; deleting the pin comparison restores exactly that false-verify, observed and reverted. Green control: `refs-17` (pin and chain both intact). Distinct from `refs-18`, whose pin holds while the CHAIN is stale — `refs-18` cannot detect this bug, because the resolver stops at the chain check. | landed |
| `refs-21` | refs | text (non-PDF) payload REPLACED after adoption — revision 2 on disk, revision 1 pinned — with the external quoting revision 2 byte-verbatim at its recorded locus ⇒ check 10 stage-1 ERROR, coverage `checked 0/1 externals byte-verified, 1 failed` | **rk-r0j3** (P1, Tier A), the 2026-08-14 Tier A review's P1-1 carried to its full scope. `resolveQuotableText` pin-checked PDFs only: `refs-extraction.ts:122` returned `{ ok: true, layer: "raw" }` for every non-PDF payload BEFORE it consulted the lock, and Gate 3's externals half performs no pin check of its own — so this tree byte-verified a quote against bytes nobody adopted at `checked 1/1`, exit 0. `refs-20` cannot detect it: its payload is a PDF, so it never reaches the non-PDF return. Triage: rk-stricter-intended. Mutation-proven red-first (red against pre-bead source at `checked 1/1`, exit 0, zero findings; restoring the early non-PDF return reproduces exactly that, observed and reverted). Green controls: `refs-02`/`refs-03`/`refs-07` (same externals path, pins intact). Boundary partner: `refs-22`. | landed |
| `refs-22` | refs | text payload present and quote byte-verbatim at its locus, but the repo has NO `refs/manifest/sources.lock.json` ⇒ check 10 stage-1 ERROR `is not hash-pinned`, coverage `checked 0/1 externals byte-verified, 1 failed` | **rk-r0j3**, the missing-lock half of the same decision, and the fixture that discriminates the adopted rule from the weaker variant "pin-check only when a lock entry happens to exist" (under which `refs-21` still ERRORs and this tree silently returns to `checked 1/1`, exit 0). A green verdict here would mean "the quote matched the file on disk today", not "the quote matched the adopted source". The rule matches what this resolver's PDF branch and Gate 3's shard-citation half already did with a missing lock — no third, softer rule for text. Triage: rk-stricter-intended. Mutation-proven: letting the lock-error branch fall through to raw bytes for non-PDF payloads restores `checked 1/1`, exit 0; reverted. Nearest neighbours: `refs-13` (shard half, absent payload), `defs-14` (Gate 1, manifest absent). | landed |
| `provenance-01` [PLAN] | provenance | OVERCLAIM (registry `open` framed as proved) | class-driven; the gate's own header names this "the project's #1 guarded failure mode" (`check-provenance.py:24`) — no dated instance actually caught in AISM history, guarded preventively | landed |
| `provenance-02` | provenance | underclaim (proved framed only `open`, WARN) | class-driven (no incident on record) | landed |
| `provenance-03` [PLAN] | provenance | stale SHA256 (tracked source edited post-hash) | class-driven (no incident on record) | landed |
| `provenance-04` [PLAN] | provenance | unwired anchor (zero labels, not on UNWIRED.md) | 2026-07-10 remediation plan item 9: the anchor whitelist "turns 107 permanently-ignored warnings back into a regression gate" (`docs/plans/2026-07-10-project-remediation-plan.md:59-61`) | landed |
| `provenance-05` | provenance | whitelisted-unanchored (on UNWIRED.md, WARN) | same remediation item as `provenance-04` | landed |
| `provenance-06` | provenance | forward-label dangling | class-driven (no incident on record) | landed |
| `provenance-07` | provenance | claim-source token unresolved | class-driven (no incident on record) | landed |
| `provenance-08` | provenance | duplicate source key (WARN) | class-driven (no incident on record) | landed |
| `provenance-09` | provenance | reverse-label orphan (WARN) | class-driven (no incident on record) | landed |
| `provenance-10` | provenance | coverage: report-facing result with no per-claim row (WARN) | class-driven (no incident on record) | landed |
| `provenance-11` | provenance | hardcoded-filename regression probe | worklog.md 2026-07-04: "caught a false-green: `check-provenance.py` hard-coded the ledger filename" (`docs/worklog.md:270-272`) | landed |
| `provenance-12` | provenance | absolute source path (WARN) | class-driven (no incident on record) | landed |
| `provenance-13` | provenance | status-table label absent (`13_discussion.tex` present, `\label{tab:status}`/`\midrule` missing) | class-driven; same shape as `refs-01`/`defs-14` (a checker that verifies zero things while reporting green) — `status_table_rows()` returns `[]` silently on this input (`check-provenance.py:207-211`); coverage line must show `0 tab:status rows` loudly, per the 2026-07-17 Fable review (F3) | landed |
| `provenance-14` | provenance | check 4: git-TRACKED source outside every loader include rule, stale hash ⇒ ERROR | **rk-399** / `docs/reviews/2026-07-18-m0.3-milestone-review-codex.md` finding 1 (BLOCKER) + Check-4 ruling: the retired "present in RepoSnapshot" proxy left a tracked path outside the include set absent from the snapshot and downgraded it to WARN, contradicting `gate-contracts.md:743`. The edge now hashes every `git ls-files` path; tracked+stale ⇒ ERROR. Red against pre-fix source (WARN, no ERROR), green after. | landed |
| `provenance-15` | provenance | check 4: binary / non-UTF-8 payload with a CORRECT byte-faithful hash ⇒ PASS | **rk-399** finding 1: the retired UTF-8-string proxy round-tripped bytes through TextDecoder/TextEncoder and false-ERRORed non-UTF-8 payloads; the edge now hashes raw bytes. Red against pre-fix source (false ERROR), green after. Sibling ERROR case: `provenance-16`. | landed |
| `provenance-16` | provenance | check 4: same binary payload, MISMATCHED recorded hash ⇒ ERROR | **rk-399** finding 1: guards against a "blanket-pass binary" mutation — proves the byte-faithful check still fails a genuinely stale binary source. Not corpus-red on its own (pre-fix source also ERRORs, for the wrong reason: string re-encode mismatch); its red-first partner is the `test/gates/provenance.test.ts` "binary payload whose bytes no longer match" mutation test. | landed |
| `provenance-17` | provenance | registry-parse frontmatter-invalid > 0: one valid lemma + one lemma with NO frontmatter at all ⇒ Gate 4's aggregate WARN naming the excluded path, coverage denominator honest (`checked` < `total`) | **rk-v18** / **rk-4uw** (N4, 2026-07-18 M0.3 re-review finding 4): the corpus fixture this ledger previously deferred — see `registrySkipReport` (`provenance-parse.ts:79-107`). Mutation-proven red-first: temporarily reverting `registrySkipReport` to its pre-fix shape (denominator collapsed to the surviving parsed set, no WARN emitted) fails this fixture on both the missing aggregate WARN and the coverage mismatch (`checked=1/1` instead of `1/2`); reverted immediately after confirming red. `aism_behavior`: differs — `check-provenance.py`'s `parse_registry` (check-provenance.py:120-132) silently drops the malformed shard with no finding and no visible count; its `main()` summary (check-provenance.py:514) prints only the surviving count. Triage: rk-stricter-intended. | landed |
| `provenance-18` | provenance | check 6: THREE whitelisted-unanchored shards ⇒ ONE aggregate WARN (the flood shape) | **review ruling f** (overturned in re-review): per-item whitelist WARNs reached 96/118/138 on real AISM historical trees — a finding-flood under the contract's own >25 threshold. The gate now aggregates them into one WARN naming the count + sorted ids (mirrors the ratified frontmatter-invalid aggregate, ruling b). Red against pre-fix source (3 per-item WARNs, no aggregate finding), green after. Non-whitelisted unanchored shards stay per-item ERRORs (`test/gates/provenance.test.ts`). `[rk-stricter-intended]` vs AISM's per-shard console lines. (Id `-18` avoids collision with `provenance-17`, rk-4uw's frontmatter-invalid fixture, landed the same wave.) | landed |
| `provenance-19` | provenance | check 4: stale source payload shadowed by a coincidental VCS-named parent (`notes/.svn/payload.bin`) ⇒ ERROR (the loader-skip-set false-WARN) | **round-3 landing-blocker 1** (docs/reviews/2026-07-18-m0.3-review3-codex.md): the old `loadSnapshot` skip-set skipped every directory basenamed `.git`/`node_modules`/`.hg`/`.svn` ANYWHERE in the tree, so a present-on-disk source under such a parent got no hash and Gate 4 read it as genuinely absent ⇒ WARN false-pass (contradicting present-stale ⇒ ERROR). The skip is now anchored to the repo root and narrowed to `.git` alone. Mutation-proven red-first: restoring the skip-anywhere behavior fails this fixture (no ERROR, verdict flips to pass); reverted after confirming red. `.svn` is not gitignored (unlike `node_modules`), so a `.svn`-shadowed payload is the corpus-expressible witness; the `node_modules`/nested-`.git` cases are covered by the load-edge unit test (`test/store/snapshot-load.test.ts`, "blocker 1: a NESTED directory named like a VCS/dep dir"). `aism_behavior`: same (AISM's raw-byte hash check also ERRORs an edited tracked source). | landed |
| `provenance-20` | provenance | OVERCLAIM on a root-level (non-`lemmas/`) shard: `argument/thm-main.md` with `status: open`, a `tab:status` row framing it proved, no `argument/lemmas/` anywhere ⇒ OVERCLAIM ERROR, coverage `1/1` | **rk-2t8** (M1 review B2, BLOCKER): pre-fix `provenance-parse.ts` hardcoded `argument/lemmas` (one level) while Gate 2 already scanned `argument/**/*.md` recursively (rk-9pk) — this exact shape (rk's own scaffold stamps `argument/` only, PRD.md:79-85) gave linker 1/1, provenance a vacuous 0/0, and NO OVERCLAIM ERROR: the gate's #1 guarded failure mode defeated for any shard outside `argument/lemmas/`. Fixed: Gate 4's registry scan mirrors Gate 2's recursive contract exactly (same README/INDEX/DAG exclusion at any depth), deliberately re-implemented, not imported, to preserve independent re-parse. `aism_behavior: differs` — AISM's script sees an EMPTY registry here and check 5 compares against nothing. Mutation-proven red-first (reverting to the lemmas-only scan turns the unit tests and this fixture red; reverted). | landed |
| `provenance-21` | provenance | registry shards present (`argument/lemmas/lem-widget-bound.md` + root-level `argument/thm-main.md`), `report/` ROOT entirely ABSENT ⇒ golden pass, coverage names the non-adoption | **B1** (`docs/memos/2026-07-25-generality-audit.md`; extends bead rk-au6 / R13): Gate 6 was bound to the `report/` root at M1 (`shards-15`), Gate 4 never was — and its "fresh repo no-op" was vacuous, holding only while the registry is EMPTY. The moment a campaign has one shard, `checkAnchor` fires per shard demanding a `\label{}` or a `report/UNWIRED.md` row; rk's scaffold stamps neither and, per `templates/manifest.json:5`, deliberately never will, so consolidation phase was unusable on a repo rk itself produced (SC7). Live-fire repro: `rk init` + one definition + one lemma + `rk phase consolidation` + `rk check` ⇒ one ERROR per registry shard, unbounded, no in-repo remedy. Check 6 is now presence-conditional on the `report/` ROOT; absence is "convention not adopted", surfaced as `report/: absent (not adopted)` on the coverage line, never a silent skip (L2), while the registry denominator stays honest at 2/2. `aism_behavior: differs` — `check-provenance.py:349-365` runs the anchor check unconditionally; this is the AISM residue the bead removes, not a stricter baseline, so it is not triaged into the rk-stricter-intended/rk-bug/ambiguous triad. Mutation-proven red-first (removing the guard turns this fixture red with two `maps to NO report label` ERRORs; hardcoding `report/: present` turns its `unit_pattern` red; reverted after each). Siblings: `shards-15`, `linker-25`, `freshness-04`. | landed |
| `provenance-22` | provenance | configured `provenanceStatusTableFile` present on disk but OUTSIDE the loader's text include rules (`paper/status.tex`) ⇒ ERROR, never a quiet `0 tab:status rows` | **rk-lkeh**, 2026-07-25 — the half-parameterisation false-green: `provenance-11` parameterised the FILE, while the label scan and the loader's include rules stayed hardcoded, so a relocated table made check 5 verify nothing and exit 0. `snapshot.sha256` spans the whole tree while the text map is bounded, so present-but-unloaded is distinguishable from genuinely-absent with NO new edge fact — the same rule Gate 7's unrecognized-generator ERROR already ratifies. A genuinely absent file remains a non-finding (the ordinary day-1/no-report state). Mutation-proven red-first (collapsing `statusTableSource` to present/absent flips this fixture to pass at exit 0 — the bug itself). | landed |
| `provenance-23` | provenance | status table read normally (`S=1`) but no row's labels resolve to any registry result ⇒ WARN + coverage `1 tab:status rows (0 joined)` | **rk-lkeh**, 2026-07-25 — the readable half: `S` alone reads as enforcement, so a table that parses but joins nothing looked identical to one doing real work. Cause is reported as `labels-disjoint` (non-empty label universe, stale table) and never conflated with `no-join-universe` (the relocated-table shape) — `src/drive/cross-vendor.ts` discipline, where an unknown never passes for a known. WARN not ERROR: drafting a status table ahead of the registry is legitimate; the defect closed is the silence. Mutation-proven red-first. | landed |
| `provenance-24` | provenance | `provenanceStatusTableFile` EXPLICITLY set in `.rk/config.json` — to exactly `DEFAULT_GATE_CONFIG`'s own value — pointing at a file that no longer exists (renamed to `13_results.tex`) ⇒ ERROR; coverage reads `tab:status source: absent (explicitly configured)` | **LB6** of the 2026-08-03 M3-close batched Tier A review — AISM incident (a), reproduced. `provenanceStatusTableFile` has a non-undefined default, so the merged `GateConfig` a PURE gate receives is byte-identical whether the repo configured that path or never touched config at all; the only distinguishing fact is `_configValidation.overriddenKeys` (LB6, projected from `ConfigValidationResult.overrides`). Without it a renamed table file left check 5 — OVERCLAIM, this gate's #1 guarded failure mode — verifying NOTHING and reporting green on `0 tab:status rows (0 joined)`, indistinguishable from a campaign with no table. The fixture makes the overclaim real and unreachable: the renamed table still frames `thm-main` as `proved` while the registry says `status: open`. A DEFAULT-and-absent path stays the legitimate day-1 non-finding, unchanged. Also pins gates-F5's fix (the coverage line renders the three-way source state). Mutation-proven red-first: passing `explicitlyConfigured = false` at the `checkStatusTable` call site turns this fixture green at exit 0 — the bug itself. Siblings: `provenance-22` (present-but-unloaded), `provenance-13` (`read`, honestly zero rows, stays green). | landed |
| `runs-01` [PLAN] | runs | orphaned run bundle (not in INDEX.md) | class-driven (no incident on record) | landed |
| `runs-02` [PLAN] | runs | missing invariant | class-driven (no incident on record) | landed |
| `runs-03` | runs | bad bundle name | class-driven (no incident on record) | landed |
| `runs-04` | runs | missing README.md | class-driven (no incident on record) | landed |
| `runs-05` | runs | missing one required field (hypothesis/command/finding/next) | class-driven (no incident on record) | landed |
| `runs-06` | runs | stray top-level file (WARN) | class-driven (no incident on record) | landed |
| `runs-07` | runs | empty `runs/` golden case (day-1 green) | class-driven; baseline, not a violation | landed |
| `runs-08` | runs | empty run bundle DIRECTORY (exists, no README) ⇒ ERROR | **rk-399** / review finding 2 (BLOCKER): an empty bundle dir was invisible to file-prefix inference, reported 0/0 clean instead of ERROR-missing-README (`gate-contracts.md:862`). The gate now enumerates bundles from the `dirs` fact. Uses the empty-directory `.gitkeep` convention (see "Empty-directory fixtures" below); its red-first proof is the `test/gates/runs.test.ts` `dirs`-fact unit test, since a `.gitkeep`-populated bundle is coincidentally already caught by pre-fix inference. | landed |
| `runs-09` | runs | **sanctioned probe-channel layout ⇒ golden pass**: `runs/probe-channel.sh` + `runs/probe-ledger.jsonl` at the `runs/` top level beside a conforming bundle dir ⇒ zero findings, coverage `1/1` naming both sanctioned files | **rk-z93m**, found live by campaign D (s2): the stamped constitution's § 4b I.3 REQUIRES a single sanctioned, ledgered probe channel, the campaign built exactly that, and check 6's bundles-are-dirs rule reported both files as stray — the template's own mandatory artifact failing the template's own gate. Fixed on both sides: `rk init` now stamps the channel (template_version 1.8.0, `templates/runs/probe-channel.sh.tmpl`, campaign-seed) and `src/gates/runs.ts`'s `SANCTIONED_RUNS_INFRASTRUCTURE` sanctions exactly those two names, naming whichever is present in the coverage line (never a silent skip, L2). Runs under the DEFAULT config, i.e. **phase consolidation** — the phase the bead was about. `aism_behavior: differs` — `check-runs.py:46-50` WARNs every non-directory at the `runs/` top level but `README.md`, and AISM has no probe channel for that rule to have an opinion about; this is a deliberate narrowing of check 6's stray set, not a stricter baseline, so it is not triaged into the rk-stricter-intended/rk-bug/ambiguous triad (same footing as `linker-25`, `shards-15`, `freshness-04`). Mutation-proven red-first (disabling the allowance branch turns this fixture red on its `unit_patterns`; widening it to a `probe-` PREFIX turns `test/gates/runs.test.ts`'s exact-name test red; dropping the coverage naming turns the coverage tests red — reverted after each). Live-fire: `rk init` + `bash runs/probe-channel.sh` + `rk phase consolidation` + `rk check` ⇒ OK. Anti-hole sibling: `runs-10`. | landed |
| `runs-10` | runs | **the allowance is not a hole**: sanctioned pair present AND an ordinary stray (`scratch-notes.txt`) plus a near-miss of a sanctioned name (`probe-ledger.jsonl.bak`) ⇒ both strays still WARN, verdict pass | **rk-z93m** guard fixture for `runs-09`: an infrastructure allowance is exactly the kind of change that quietly becomes "anything probe-shaped under `runs/` is fine". Matching is EXACT-name, files only, one level under `runs/` — the `.bak` WARN is what proves it, and a DIRECTORY carrying a sanctioned name is still classified as a (malformed) bundle (`test/gates/runs.test.ts`). Verdict is `pass` because check 6 has always been WARN-only in BOTH phases: the Phase matrix demotes ERRORs and there is no ERROR here to demote, so bead rk-z93m's "would ERROR in consolidation" overstated the severity — recorded here rather than quietly inherited. `aism_behavior: same` (check-runs.py:46-50 WARNs both strays too). | landed |
| `shards-01` | report-shards | oversized shard (>280 lines) | class-driven (no incident on record) | landed |
| `shards-02` | report-shards | duplicate `SHARD-ID` | class-driven (no incident on record) | landed |
| `shards-03` | report-shards | malformed `SHARD-ID` | class-driven (no incident on record) | landed |
| `shards-04` | report-shards | wrong `SHARD-SUMMARY` count | class-driven (no incident on record) | landed |
| `shards-05` | report-shards | orphan shard file (not `\include`d) | class-driven (no incident on record) | landed |
| `shards-06` | report-shards | duplicate `\include` | class-driven (no incident on record) | landed |
| `shards-07` | report-shards | `\include` outside `sections/` | class-driven (no incident on record) | landed |
| `shards-08` | report-shards | missing `SHARD_CATALOG.md` entry | class-driven (no incident on record) | landed |
| `shards-09` | report-shards | missing `README.md` entry | class-driven (no incident on record) | landed |
| `shards-10` | report-shards | body-sectioning command in `main.tex` | class-driven (no incident on record) | landed |
| `shards-11` | report-shards | empty-scaffold golden case | class-driven; baseline, not a violation | landed |
| `shards-12` | report-shards | non-empty scaffold, zero `\include`s | class-driven (no incident on record) | landed |
| `shards-13` | report-shards | absent `report/sections/` directory ⇒ ERROR | **rk-399** / review finding 2 (BLOCKER): `check-report-shards.sh:23` requires the `report/sections/` directory to exist; the old gate could not represent an empty/absent directory and declined the check, so an absent `sections/` green-lit as a clean empty scaffold (`gate-contracts.md:956`). Check 1 now enforces it via the `dirs` fact, surfaced before the empty-scaffold exemption. Red against pre-fix source (clean pass), green after. Golden "exists but empty" counterpart: `shards-11` (now carries a `.gitkeep`). | landed |
| `shards-14` | report-shards | no `shardsPrefix` configured, a real shard needs SHARD-ID validation ⇒ config-missing ERROR | **R12** / bead rk-psm (M1 landing-blocker, `docs/memos/2026-07-18-aism-residue-audit.md` section R12): `src/gates/config.ts`'s `shardsPrefix` default `"AISM"` deleted — a general tool must never default a shard-id prefix to a specific campaign name. `shardsPrefix` is now required-when-consumed: the shards gate emits ONE loud, counted ERROR (`path: ".rk/config.json"`) the first time it needs to validate a SHARD-ID header without a configured prefix, never a silent AISM-shaped default and never a crash. This is the L2 red fixture for the new failure mode; mutation-proven red-first (temporarily making the gate silently accept on missing prefix turns this fixture red; reverted after confirming). | landed |
| `shards-15` | report-shards | `report/` ROOT directory entirely absent (fresh-scaffold-shaped repo with a real `argument/lemmas` shard) ⇒ golden pass, coverage names the non-adoption | **R13** / bead rk-au6 (M1, `docs/memos/2026-07-18-aism-residue-audit.md` section R13): the `report/` LaTeX layout is not in rk's scaffold (PRD.md:79-85) — a general research tool must not force every repo to hand-create it. Every check in `shards.ts` is now bound only when `report/` (the ROOT directory) exists; absence is "not adopted", never a finding, surfaced in the coverage line (`report/: absent (not adopted)`), never a silent skip (L2). This is the incident fixture: an orchestrator live-fire (2026-07-18) found a fresh `rk init` + `rk phase consolidation` repo failing `rk check` on exactly this state (6 ERRORs: 4 from this gate, 2 from `linker-25`'s sibling case). `aism_behavior: differs` — `check-report-shards.sh:22-25` requires `MASTER`/`SECTIONS_DIR`/`README`/`CATALOG` unconditionally, with no report/-absent no-op; this is the AISM residue the bead removes, not a stricter baseline, so it is not triaged into the usual rk-stricter-intended/rk-bug/ambiguous triad. Mutation-proven red-first (inverting the root guard so Check 1 runs unconditionally turns this fixture red — four missing-file/dir ERRORs; reverted after confirming). Sibling: `linker-25`. | landed |
| `config-01` | config | typo'd `phase` value in `.rk/config.json` ⇒ one loud structural ERROR at `.rk/config.json:1`; `phase` falls back to strict "consolidation", never silently exploration | **rk-xbm** (M1 review B1, BLOCKER): pre-fix, `config-load.ts`'s unvalidated `as Partial<GateConfig>` cast let `"typo"` through and `phase.ts`'s `if (phase === "consolidation")` treated ANY other value as exploration — silently demoting every non-structural ERROR across all gates to WARN, a silent severity-policy change (CLAUDE.md L6). `validateConfigOverrides` (`src/gates/config.ts`) now rejects at the loading edge; findings surface through the synthetic `config` gate (registered first in `src/gates/index.ts`). `aism_behavior: n/a` — `.rk/config.json` is an rk-only concept. Mutation-proven red-first per the config lane's three live perturbations (see the commit). | landed |
| `config-02` | config | malformed `shardsMaxLines` (`"garbage"`) in `.rk/config.json` ⇒ one loud ERROR; the line-cap check keeps working against the numeric default (280) | **rk-xbm** companion: pre-fix, `shards.ts`'s `lineCount > config.shardsMaxLines` compared against NaN — always false, a false-green on the line cap regardless of shard length. Rejected at the loading edge, plus defense-in-depth hardening inside Check 7 itself for callers that bypass `loadGateConfig`. `aism_behavior: differs` — AISM's `check-report-shards.sh` reads MAX_LINES from an env var with no validation either, but there is no AISM counterpart to this config path. Mutation-proven red-first (the "over-length shard still caught with garbage config" test). | landed |
| `config-03` | config | empty-string `workers.assignments.<role>.<tier>.model` in `.rk/config.json` ⇒ one loud ERROR; the whole `workers` field is dropped, never a partial/silently-guessed assignment | **rk-7hi** (M3.5 STOP-2 blocker, `../rk-m3.5-baseline/STOP-REPORT-2-2026-07-20.md`): the new optional per-assignment `model` field (`validateAssignmentEntry`, `src/drive/backend-registry.ts`) added so the TJO worker-model pin ("claude side = claude-opus-4-8, codex side = its default") is expressible — same non-blank-string discipline as `backend`. `aism_behavior: n/a` — this field is rk-only, added by this bead; no AISM counterpart. Mutation-proven red-first (accepting any `model` value unvalidated turns this fixture green when it must be red; reverted after confirming — see the rk-7hi commit). | landed |
| `config-04` | config | file PRESENT but syntactically unparseable JSON (a trailing comma) in `.rk/config.json` ⇒ one loud structural ERROR naming the file and carrying the parser's own SyntaxError text; config VALUES still degrade to strict defaults, never a silent green run | **rk-45m** (residual from rk-xbm's M1 repair wave): pre-fix, `config-load.ts`'s `JSON.parse` catch block returned `mergeGateConfig(undefined)` with an EMPTY `_configValidation` summary — no finding at all, so a single misplaced comma silently reverted the whole repo to strict defaults with zero signal. Now uses the same `configError`/`structural: true` shape `validateConfigOverrides` already produces for a malformed field (docs/gate-contracts.md's Phase matrix names "parse errors" as a canonical STRUCTURAL class). The same branch also covers valid JSON whose top-level value is not an object. `aism_behavior: n/a` — `.rk/config.json` is an rk-only concept. Mutation-proven red-first (see the rk-45m commit). | landed |
| `config-05` | config | zero `workers.assignments.<role>.<tier>.turnTimeoutMs` in `.rk/config.json` ⇒ one loud ERROR; the whole `workers` field is dropped, never a silent fallback to the 120s ceiling the operator meant to raise | **rk-k0m1** / P2 (live-fire **RUN-REPORT-12**): the live turn ceiling was effectively hard-coded — `LiveDispatcherOptions.turnTimeoutMs` existed but nothing wired it from `.rk/config.json`, so the codex prover's full-decomposition turn on a hard lemma died at exactly `DEFAULT_TURN_TIMEOUT_MS` (120s, exit 10) twice with no operator-reachable knob. The bead adds `turnTimeoutMs`/`sessionTimeoutMs` at both the `workers` level (campaign-wide) and per assignment (per role×tier, which is what the live-fire data demanded: claude-opus decomposed the same lemma in one turn, codex needed longer only for the prover). This is the red fixture for the new field, and ZERO is its sharpest case — a number, so a lax numeric guard accepts it, and `?? DEFAULT_TURN_TIMEOUT_MS` does not rescue it (`0` is not nullish): every turn would time out instantly. Rejected by `readTimeouts` (`src/drive/backend-registry.ts`) under the unchanged rk-xbm mechanism (ANY malformation drops the whole `workers` field). `aism_behavior: n/a` — this field is rk-only. Mutation-proven red-first (short-circuiting the `isPositiveIntegerMs` branch turns this fixture green when it must be red, and takes three unit reject cases with it; reverted after confirming — see the rk-k0m1 commits). | landed |
| `freshness-01` | freshness | clean regenerate golden case: `argument/INDEX.md` byte-identical to a fresh render, `.rk/generated.json` declares it under `linker-index` ⇒ zero findings, `checked=1/1` | **M2.6** (Gate 7, `src/gates/freshness.ts`, `docs/gate-contracts.md` Gate 7 section): the regenerate-and-diff mechanism's golden pass. `aism_behavior: n/a` — `.rk/generated.json` is rk-only; no AISM counterpart. Mutation-proven red-first (forcing the byte-comparison to always report STALE turns this fixture red; reverted after confirming). | landed |
| `freshness-02` | freshness | **hand-edited generated file** [M2.6-mandatory] — `argument/INDEX.md`'s contract cell hand-edited so it diverges from a fresh render at line 6 ⇒ ERROR naming the file and the first differing line | **M2.6**: the M0.2/M2.6-mandatory "hand-edited generated file" fixture, exercised through the general mechanism (contrast `linker-16`, the same failure mode through Gate 2 Check 11's file-specific predecessor). `aism_behavior: differs` (mechanism-level) — AISM's `check_generated` would ERROR the identical divergence unconditionally under its own hardcoded check; same underlying failure mode, caught here via the declared-manifest mechanism instead. Mutation-proven red-first (short-circuiting the STALE check to never fire turns this fixture green when it must be red; reverted after confirming). | landed |
| `freshness-03` | freshness | declared-but-missing: the manifest declares `argument/INDEX.md` under `linker-index`, the file is entirely absent from the repo ⇒ ERROR | **M2.6**: proves a manifest entry naming a nonexistent file is a real, counted ERROR — distinct from `freshness-04`'s presence-conditional non-adoption; declaring a path and never generating it is a defect, not a legitimate unadopted state. Mutation-proven red-first (treating a missing declared file as a silent skip, same as an absent manifest, turns this fixture green when it must be red; reverted after confirming). | landed |
| `freshness-04` | freshness | no-manifest presence-conditional golden case: one valid lemma shard, `.rk/generated.json` entirely absent ⇒ zero findings, coverage names the non-adoption | **M2.6**: generalizes Gate 2 Check 11's per-file precedent (`linker-25`) and Gate 6's `report/`-root precedent (`shards-15`) to the whole gate — a repo that never adopted the manifest mechanism has nothing declared to check. `aism_behavior: differs` (deliberate, not triaged into rk-stricter-intended/rk-bug/ambiguous — same footing as `linker-25`/`shards-15`): AISM has no manifest concept at all. Mutation-proven red-first (removing the whole-mechanism presence guard turns this fixture red; reverted after confirming). Siblings: `linker-25`, `shards-15`. | landed |
| `freshness-05` | freshness | malformed manifest: `.rk/generated.json` present but not valid JSON ⇒ one loud ERROR at `.rk/generated.json:1`, never silently read as "absent" | **M2.6** (rk-xbm's `.rk/config.json` untrusted-JSON posture applied to this manifest): proves a malformed manifest is a real, counted defect, never a crash and never misrouted into `freshness-04`'s golden-pass state. `aism_behavior: n/a` — no AISM counterpart. Mutation-proven red-first (catching the JSON parse failure and silently returning an empty, findings-free manifest — i.e. treating malformed as absent — turns this fixture green when it must be red; reverted after confirming). | landed |
| `freshness-06` | freshness | **unknown generator = blocking ERROR** [M2-review blocker 3] — a manifest entry whose `generator` id is recognized by neither the pure `GENERATORS` map nor `render-site-v1` ⇒ loud manifest ERROR (pre-fix: "not adopted", `checked 0/1`, exit 0 — a typo'd generator green-lit an unchecked artifact) | **M2 boundary review blocker 3a** (commit 613b304): flipped the not-adopted expectation to a blocking ERROR. Mutation-proven red-first. | landed |
| `freshness-07` | freshness | **`render-site-v1` without edge regeneration = ERROR** — a declared render-site entry checked through the plain 2-arg gate interface (no edge-supplied expected bytes) ⇒ ERROR "cannot be regenerated for verification", never a silent pass | **M2 boundary review blocker 3** (613b304/94acfa7): the pure gate diffs supplied bytes only; regeneration lives at src/cli/check.ts's edge (`prepareRenderSiteExternalRegen`), which refuses on structurally-incomplete builds or thrown exceptions with a named reason. Mutation-proven red-first. | landed |
| `freshness-08` | freshness | manifest missing `schema_version` ⇒ loud manifest ERROR | **M2 boundary review blocker 4** (613b304): runtime parser now enforces the complete `schemas/generated.v1.json` surface. Mutation-proven red-first. | landed |
| `freshness-09` | freshness | manifest `schema_version: "2"` ⇒ loud manifest ERROR (a future incompatible manifest can never silently run under v1 semantics) | **M2 boundary review blocker 4** (613b304). | landed |
| `freshness-10` | freshness | extra top-level manifest key ⇒ loud ERROR (`additionalProperties: false` enforced at runtime) | **M2 boundary review blocker 4** (613b304). | landed |
| `freshness-11` | freshness | extra per-entry key ⇒ loud ERROR, entry never half-accepted | **M2 boundary review blocker 4** (613b304). | landed |
| `reward-01` | reward | garbage line inside `.rk/reward-ledger.jsonl` ⇒ one structural ERROR per unreadable line, later lines stay checked | **N2 (rk-5man)**, distilled from the mip-re incident CLASS "every automated layer behaved correctly on a bad input" — the account book must be fully readable or loudly not. | landed |
| `reward-02` | reward | duplicate CLOSE of one node ⇒ structural ERROR (the double-pay attempt; the fold ignores it, the gate names it) | **N2 (rk-5man)**. | landed |
| `reward-03` | reward | CLOSE naming a ghost id ⇒ structural ERROR `[reward-unknown-target]` — the ledger may not pay ghosts | **N2 (rk-5man)**, the reward-events-for-work-that-never-entered-the-graph gaming class. | landed |
| `reward-04` | reward | golden pass: predict + round + close of a real shard citing a real definition ⇒ zero findings, exit 0 | **N2 (rk-5man)** no-false-positive guard. | landed |
| `reward-05` | reward | CLOSE(tier=proved) on a self-reported `status: proved` / `af: none` shard ⇒ structural ERROR `[reward-tier-unsupported]` — self-report never banks | **S0 smoke finding S0-1** (rk-ptx0), transcribed same-day; the mapping lives in src/reward/tier.ts, shared with the shadow emitter so gate and writer cannot disagree. | landed |
| `reward-06` | reward | pma close with NEITHER a fresh VALID L5 verdict NOR provenance ⇒ structural ERROR `[reward-tier-unbacked]` | **Window-1 live finding rk-90so**: hand-set proved-mod-audit banked at 0.6 with nothing behind it. Scoped to Gate 8 (banking site) — zero blast radius on live AISM repos. | landed |
| `reward-07` | reward | green twin: same pma close, `provenance:` naming an independently-authored verifier record ⇒ pass | **rk-90so** no-false-positive guard; L5-fresh-VALID backing covered in unit test. Migrated under **rk-ne3a**: the original anonymous-provenance green case is exactly what independence now rejects; the fixture's record gained a canonical verifier author. | landed |
| `reward-08` | reward | proved-mod-audit close backed by the prover-of-record's own provenance record ⇒ structural ERROR `[reward-tier-unbacked]` | **Campaign A window 2, rk-ne3a**: recorded identity equality is mechanically checkable; self-report never banks. The campaign found this loophole and declined to use it. | landed |
| `reward-09` | reward | proved-mod-audit close backed by an authorless provenance record ⇒ structural ERROR `[reward-tier-unbacked]` | **rk-ne3a strict-default companion**: an anonymous record cannot establish independence from the prover-of-record. | landed |
| `reward-10` | reward | green twin: proved-mod-audit close backed by a different recorded verifier identity ⇒ pass | **rk-ne3a no-false-positive guard**: identities are driver-supplied provenance, not authenticated identities. Cross-family by construction since repair R3 (same-model records no longer count as independent). | landed |
| `reward-11` | reward | golden append-only demotion: a proved-mod-audit close legal against recorded prior `proved-mod-audit` / `af:none` state and independently backed, followed by a refuting record and exact current `stated` / `af:none` downgrade ⇒ PASS | **rk-4317, amended by Gate 8 repair R1:** demonstrates the honest legal-then-refuted path while preserving the recorded-and-checkable, unauthenticated-prior-state stance. | landed |
| `reward-12` | reward | DEMOTE targets nonexistent close event 99 ⇒ structural ERROR `[reward-demote-unbanked-close]`; no negative or invented payout is created | **rk-4317 dangling-reference red case**: compensation may address only an earlier close the fold actually banked. | landed |
| `reward-13` | reward | DEMOTE exists but the shard still supports the original proved tier ⇒ structural ERROR `[reward-demotion-without-downgrade]` | **rk-4317 lying-record red case**: writing "demote" without honestly downgrading the registry cannot make Gate 8 green. | landed |
| `reward-14` | reward | schema-v2 DEMOTE lacks a nonblank reason ⇒ malformed-line ERROR, coverage `checked 1/2` | **rk-4317 auditability red case**: an unexplained compensation is not a valid ledger event. | landed |
| `reward-15` | reward | schema-v2 DEMOTE lacks `evidenceRef` ⇒ malformed-line ERROR, coverage `checked 1/2` | **rk-4317 evidence red case**: compensation must identify the refuting verdict or record path. | landed |
| `reward-16` | reward | DEMOTE carries a nonempty `evidenceRef` whose file is absent ⇒ structural ERROR `[reward-demote-evidence-missing]`; the invalid demotion cannot neutralize the close | **rk-4317 fail-closed evidence companion**: a plausible path string is not evidence; the referenced snapshot file must exist. | landed |
| `reward-17` | reward | reward-05's self-reported `proved` / `af:none` close followed by a demote that copies the same current state and records the same never-legal prior state ⇒ `[reward-demote-never-legal]`; the original `[reward-tier-unsupported]` remains active | **Gate 8 repair R1 / reviewer A blocker:** the prior downgrade predicate was vacuous over all status/af/tier combinations, so one honest-looking demote line could launder any unsupported close. The recorded prior state is writer-supplied and unauthenticated, but makes laundering require an explicit falsifiable ledger lie. | landed |
| `reward-18` | reward | demote `targetCloseSeq` resolves to `lem-a` while recorded `nodeId` is `lem-b` ⇒ structural ERROR `[reward-demote-target-mismatch]`; no payout reversal or finding suppression | **Gate 8 repair R1 / reviewer B-LB4:** unreadable earlier lines change parsed-stream positions. The redundant node identity makes positional retargeting fail closed. | landed |
| `reward-19` | reward | demote cites its target argument shard as `evidenceRef` ⇒ structural ERROR `[reward-demote-evidence-self-reference]`; original close-tier finding remains active | **Gate 8 repair R1 / reviewer B-LB3:** existence/readability alone allowed the withdrawn claim to serve as its own refuting evidence. Target-shard and reward-ledger self-reference are now refused. | landed |
| `reward-20` | reward | proved-mod-audit close backed by the prover model under a different session id ⇒ structural ERROR `[reward-tier-unbacked]` | **Gate 8 repair R3 / reviewers A and B:** decoded `modelFamily` + `backend` + `model` equality is self-review regardless of `sessionId`; reward-08 retains the exact-seam case and reward-10 remains the cross-family green control. | landed |
| `reward-21` | reward | well-formed provenance record under `docs/worker-output/` exists and is hash-visible but is outside the snapshot text include-set ⇒ ERROR naming the boundary and canonical direct `.rk/<name>.json` location | **Gate 8 repair R9 / reviewer C:** the previous generic unreadable-authorship reason hid a placement constraint responsible for 12 live campaign-A findings. The include-set is deliberately unchanged. | landed |
| `reward-22` | reward | proved-mod-audit close backed by an independently authored record carrying no `claimSha256` ⇒ structural ERROR `[reward-tier-unbacked]` naming the missing content binding | **rk-io5l, campaign C's record-integrity oracle:** a record bound to no bytes backs every future revision as strongly as the one reviewed and can never be shown stale. Route (ii) has bound verdicts to shard bytes since M3.7. | landed |
| `reward-23` | reward | record whose `claimSha256` is the real hash of the shard's revision 1 while the shard is now at revision 2 ⇒ structural ERROR naming both digests | **rk-io5l, the motion both campaigns produce** ("ENDORSE WITH REVISIONS applied", campaign C w1r3/w1r5; campaign A window 5's orphaned ledgered hash, `probe-runner.sh:35-40`): an endorsement must be re-recorded against the bytes it certifies. | landed |
| `reward-24` | reward | hand-authored backing record whose `schema_version` is the JSON number 1 rather than the string "1" ⇒ structural ERROR `[reward-tier-unbacked]` naming the version field | **rk-tlwb shape-drift red case:** the verification was real, independent, and correctly hash-bound; only the transcription was wrong. For two days after Check 4b v2 landed, hand-authoring was the ONLY way to write this record and no schema existed to check it against — it fails closed on an honest close. | landed |
| `reward-25` | reward | `.rk/provenance-lem-attested.json` written byte-for-byte by `rk reward attest`, carrying `sourceRef` to the verifier transcript ⇒ pass | **rk-tlwb producer fixture (rule 10):** pins schemas/provenance-record.v1.json, src/cli/reward-attest.ts and src/reward/pma-backing.ts to one shape with a checked-in artifact instead of three modules agreeing in prose. | landed |
| `reward-26` | reward | independently authored, current-bytes-bound record whose `verdict` is `REFUTED` ⇒ structural ERROR `[reward-tier-unbacked]` naming the verdict field | **rk-xrgn**, the 2026-08-12 Tier A review's own exploit (finding 2): every clause Check 4b(i) checked was impeccable — `.rk/` placement, `schema_version` "1", right `claimId`, `role: verifier`, decoded model different from the prover-of-record, `claimSha256` equal to the shard's current hash — and the one thing the record SAID was that the claim is false, yet it banked the proved-mod-audit close, because the banking site read who wrote the record and never what it said. Red against pre-repair source (pass, exit 0, zero findings), green after. Green control: `reward-10` (identical shape, honest `verdict: "VALID"`). Editing the shard invalidates `claimSha256` and flips this to `reward-23`'s staleness reason — i.e. passing for the wrong reason; recompute the hash when the shard changes. | landed |
| `reward-27` | reward | proved-mod-audit close on a claim carrying a LIVE `l5-shard-bytes` retraction, backed by an otherwise impeccable `.rk/` provenance record ⇒ structural ERROR `[reward-tier-unbacked]` naming the retraction, its domain, issuer and reason | **rk-yic3 (P1, Tier A):** Check 4b's two routes were asymmetric about withdrawal. `l5Decision` refused backing on a live retraction in either hash domain; `provenanceDecision` consulted the retraction ledger not at all, and `pmaBackingDecision` tried the provenance route FIRST and returned the moment it backed — so a retracted claim banked through route (i), the weaker sibling of a rule route (ii) already enforced. Retraction is a fact about the CLAIM, so it now binds both routes from one shared precondition. Red against pre-repair source (pass, exit 0, zero findings), green after. The shard bytes are hashed TWICE here (the record's `claimSha256` and the retraction's `contentHash`); editing the shard requires recomputing BOTH, or the fixture passes for the wrong reason. | landed |
| `reward-28` | reward | same close, same impeccable record, but the retraction ledger has a truncated append (no live retraction at all) ⇒ structural ERROR `[reward-tier-unbacked]`: unknowable withdrawal status never reads as "nothing is retracted" | **rk-yic3, the half `reward-27` cannot catch:** `readRetractionFacts` fails closed by emptying BOTH live maps on a poisoned store, so removing the health clause alone leaves `reward-27` green while this fixture goes red — the two failure modes are separately breakable and therefore separately fixtured. Same corruption shape as `linker-46`. | landed |

Totals: 5 config + 16 defs + 46 argument/linker + 22 refs + 24 provenance + 10 runs +
15 report-shards + 11 freshness + 28 reward = **177 fixtures** (reconciled 2026-08-10,
rk-sp3n closed; the wave-1 panel's reviewer C recomputed the true counts; +2 rk-io5l,
+2 rk-tlwb, +1 rk-xrgn, 2026-08-12; +3 rk-we5i, +2 rk-z93m, 2026-08-14;
+1 refs-20 review repair 2026-08-14; +2 rk-r0j3, +2 rk-yic3 2026-08-14; +1 rk-5lzf `defs-16`
2026-08-20) across the gates named in
`docs/gate-contracts.md`'s per-gate tables (`config` and `freshness` are the two synthetic gates
with no AISM `check-all.sh` counterpart, added by rk-xbm and M2.6 respectively; both directories
are wired into `src/corpus/discovery.ts`'s `GATE_DIRS`).
`refs-21`, `refs-22` (+2 over the then-pinned 172) are rk-r0j3 (P1, Tier A): Gate 3's adopted-pin
rule extended from PDF payloads to EVERY payload kind, on both halves of the gate. The bug: the
2026-08-14 Tier A review's P1-1 repair put the pin comparison inside `resolveQuotableText`, but
that function returned raw bytes for any non-PDF payload before it looked at the lock at all, and
the externals half (`src/gates/refs.ts`) pin-checks nothing itself — so text sources on that path
were unpinned. Both new fixtures were written RED first and observed byte-verifying at
`checked 1/1`, exit 0, against pre-bead source.

**Divergence decision recorded here (L5, default-stricter).** A payload with NO lock entry is an
ERROR, not a WARN skip and not a raw-bytes fallback. This is not a new rule — it is the rule this
same resolver's PDF branch and Gate 3's shard-citation half (`is not hash-pinned`) already
applied; the alternative would have made "which bytes does a quote verify against?" depend on the
payload's file format. Triage: **rk-stricter-intended**; the acceptance set strictly shrinks (a
repo that never adopted its sources moves from green to a named ERROR with a remedy), and AISM is
unaffected by construction — it has no lock file and zero refs-quote externals have ever existed
there.

**Fixture consequence, disclosed rather than absorbed.** Five pre-existing externals-half fixtures
predate the rule and would otherwise have failed on the pin instead of on their own subject:
`refs-02`, `refs-03`, `refs-07` (fabrication / paraphrase-wrapping), `refs-09` (wrong-passage
locus) and `refs-11` (form-feed locus ambiguity). Each gained a `refs/manifest/sources.lock.json`
adopting its payload at the digest on disk, so each fixture still proves exactly what it proved
before — none of them is *about* pinning, and their expected verdicts are unchanged. Two fixtures
deliberately did NOT gain a lock: `refs-01` (all payloads absent — check 2's ABSENT verdict
precedes pinning, which is itself the assertion) and `refs-10` (the no-quote escape is decided in
check 7, before any payload is resolved). See both new rows above, `docs/gate-contracts.md`
Gate 3 check 10 stage 1 and its new `[rk-stricter-intended]` divergence entry.

`config-05` (+1 over the then-pinned 131) is rk-k0m1 / P2 (live-fire RUN-REPORT-12): the red
fixture for the new `workers` turn/session timeout overrides — a zero `turnTimeoutMs` is a
loading-edge ERROR, not a silent fallback to the very 120s ceiling the operator meant to raise.
See its own row above, `docs/gate-contracts.md`'s Config-validation section, and
`src/drive/backend-registry.ts`'s `readTimeouts`/`BackendRegistry.timeoutsFor`. (The stale Totals
line above is left as-is per the convention the `refs-09`..`refs-11` paragraph set; only this
bead's own `config` term is corrected, 3 → 5 — it had been stale since `config-03`/`config-04`
landed. The authoritative counts remain `src/corpus/discovery.ts`'s `EXPECTED_FIXTURE_COUNT` =
134 and `bun run selftest`'s own `checked corpus:` line; the grand-total reconciliation is its own
bookkeeping item, tracked as rk-sp3n.)

`linker-45`, `linker-46` (+2 over the then-pinned 132) are LB3 of the 2026-08-03 M3-close batched
Tier A review (`docs/reviews/2026-08-03-m3-close-batched-tierA-fable.md`), with gates-F14 folded
in: Check 16's UNCONDITIONAL retraction veto and its fail-closed half. See their own rows above,
`docs/gate-contracts.md` Gate 2 Check 16, and `src/gates/linker-retraction.ts`'s
`checkRetractionVeto`. (Same convention as the `refs-09`..`refs-11` and `config-05` paragraphs:
the stale "Totals" line above is left as-is; the authoritative counts are
`src/corpus/discovery.ts`'s `EXPECTED_FIXTURE_COUNT` = 135, `test/corpus.test.ts`'s own pinned
total, and `bun run selftest`'s `checked corpus:` line.)

`provenance-24` (+1 over 134) is LB6 of the same review: an explicitly-configured-but-absent
`provenanceStatusTableFile`. See its own row above and `docs/gate-contracts.md` Gate 4 check 5.

`refs-09`, `refs-10`, `refs-11` (+3 over the then-pinned 128) are rk-wkzh / P2 (Gate 3's
quote-at-locus tightening and the closed no-quote escape), the first refs fixtures transcribed
from real dated incidents rather than classes: AISM I2 (wrong-passage citation, permanently
green), I3 (five newest citations silently exempt via freeform-string drift) and I4 (form-feed
line-number ambiguity) — see their own rows above, `docs/gate-contracts.md` Gate 3 checks 6-7 and
its new `[rk-stricter-intended]` divergence entry, and
`docs/memos/2026-08-03-aism-postmortem/07-refs-report.md` for the incident writeups. (The Totals
line above still reads 123 — it has been stale since the 127-fixture recount and is deliberately
left as-is here; only its `refs` term is corrected, 8 → 11. The authoritative counts are
`src/corpus/discovery.ts`'s `EXPECTED_FIXTURE_COUNT` = 131 and `bun run selftest`'s own
`checked corpus:` line.)
`linker-44` (+1 over the then-pinned 127) is rk-0ehr / P1 (retraction as a first-class event):
the AISM 2026-07-28 incident fixture — see its own row above and `docs/gate-contracts.md`
Gate 2's new Check 16. NOTE: the "Totals" line immediately above was already stale before this
bead (it reads 123 while `src/corpus/discovery.ts`'s `EXPECTED_FIXTURE_COUNT` and
`test/corpus.test.ts` were at 127); this bead bumps the pinned count 127 -> 128 and records its
own delta here, deliberately without back-filling the four earlier undocumented additions —
that reconciliation is its own bookkeeping item, not this bead's to smuggle in.

`config-04` (+1 over the then-pinned 123) is rk-45m: an unparseable `.rk/config.json` (or one
whose top-level JSON value is not an object) is now a loud structural ERROR rather than a silent
fallback to defaults — closing the residual rk-xbm deliberately left open.

`config-03` (+1 over the then-pinned 122) is rk-7hi (M3.5 STOP-2 blocker): the new per-assignment
`workers.assignments.<role>.<tier>.model` field's own red fixture — see its own row above and
`docs/gate-contracts.md`'s Config-validation section.
`linker-43` (+1 over the then-pinned 121) is the M3 repair wave's completion step (review blocker
7c): `checkMandatoryReview` (added by commit 7ede34c alongside the persisted balloon counter) was
wired into `linkerGate` — see its own row above and `docs/gate-contracts.md` Gate 2's new
Check 15.
`linker-31`..`linker-38` (+8 over the then-pinned 109) are M3.8 (worktree agent-a9b12837c0ead0e82,
cross-vendor rule + L5-promotion integration): Gate 2's critical-path provenance check and the
L5-promotion check — see their own rows above and `docs/gate-contracts.md` Gate 2's
"Critical-path provenance" / "L5 promotion" sections. `linker-39`..`linker-42` (+4 over the
then-pinned 117) are the 2026-07-19 M3 review repair wave (blockers 5-6, commits 0446873 +
7e884e5), which also HARDENED `linker-32`/`linker-33` from WARN to fail-closed ERROR: legacy is
never inferred (explicit atomic marker only), critical-path batch provenance is an ERROR,
unresolved north star fails closed, L5 store corruption poisons promotion, and promoted shards
are continuously re-validated.
`freshness-06`..`freshness-11` (+6 over the then-pinned 103) are the 2026-07-19 M2 repair
wave: boundary-review blockers 3 (unknown-generator flip, render-site-v1 verification) and 4
(manifest schema runtime enforcement) — see their own rows above. The same wave's THREE new
corpus/graph fixtures (`conflict-banked-unfresh-ledger`, `conflict-banked-unfresh-export`,
`conflict-fr-superseded`, blockers 6-7) are in the Graph-fixtures section below, outside this
GATE_DIRS ledger.
`freshness-01`..`freshness-05` (+5 over the then-pinned 98) are the M2.6 addition: Gate 7's
regenerate-and-diff mechanism over a declared `.rk/generated.json` manifest — see their own rows
above and `docs/gate-contracts.md`'s new Gate 7 section. `shards-14`
(+1 over the previously-pinned 87) is the M1 R12 addition: bead rk-psm / audit landing-blocker R12
(`docs/memos/2026-07-18-aism-residue-audit.md`), removing `shardsPrefix`'s `"AISM"` default — see
its own row above and `docs/gate-contracts.md` Gate 6's updated Inputs/Divergences sections.
`linker-25` + `shards-15` (+2 over the then-pinned 88) are the M1 R13/R14 addition: beads
rk-au6/rk-1rv, making the `report/` root and the `argument/INDEX.md`/`DAG.md` mirror checks
presence-conditional — see their own rows above and `docs/gate-contracts.md` Gate 2 Check 11 /
Gate 6 Check 1's updated text.
`linker-26`/`linker-27` (+2 over the then-pinned 90) are the M1 rk-9pk addition: the linker's shard
glob widens from `argument/lemmas/*.md` to a recursive `argument/**/*.md` scan (see their own rows
above and `docs/gate-contracts.md` Gate 2 Inputs/Divergences' updated text) — the dogfood-1 fix for
the "0/0 lemma shards, green over an unvalidated north-star" incident.
`provenance-20`, `linker-28`, `linker-29`+`linker-30`, and `config-01`+`config-02` (+6 over the
then-pinned 92) are the 2026-07-19 M1 repair wave: beads rk-2t8, rk-sj6, rk-wc3, rk-xbm — the M1
boundary review's validity landing-blockers (docs/reviews/2026-07-18-m1-milestone-review-codex.md)
plus dogfood-2's silent-empty-deps incident. See each fixture's own row above and the updated
Gate 2 / Gate 4 / Config-validation sections of `docs/gate-contracts.md`.
(Recounted 2026-07-18, rk-4uw N4+N5, at 87: `provenance-17`, this WP's new frontmatter-invalid>0
fixture landed below, and `provenance-18`, ruling f's whitelisted-unanchored aggregate fixture,
which had already landed on disk with its own ledger row above but was not yet reflected in the
Totals line or the `EXPECTED_FIXTURE_COUNT`/corpus-count-assertion constants.)
`linker-22`/`linker-23`/`linker-24`, `refs-08`, `provenance-14`/`provenance-15`/`provenance-16`/
`provenance-18`, `runs-08`, and `shards-13` were added by the 2026-07-18 M0.3 milestone-review
repair waves (`docs/reviews/2026-07-18-m0.3-milestone-review-codex.md` findings 1-11,
`docs/reviews/2026-07-18-m0.3-rereview-codex.md` findings N1-N5 + rulings b/d/f) and are now
synced into `docs/gate-contracts.md`'s per-gate "Corpus fixtures required" tables alongside this
row. Ten carry
`[PLAN]` (IMPLEMENTATION_PLAN M0.2's mandatory list): `defs-07` (duplicate alias), `linker-06`
(dependency cycle), `linker-12` (contract mismatch registry↔af-root), `linker-16` (hand-edited
generated file), `refs-01` (19/19 false-green), `provenance-01` (overclaim), `provenance-03`
(stale SHA256), `provenance-04` (unwired anchor) — plus `runs-01` (orphaned run bundle) and
`runs-02` (missing invariant). The plan's "duplicate alias" item is `defs-07`; "missing
invariant" is `runs-02`. Six fixtures (`defs-15`, `linker-21`, `linker-22`, `linker-23`,
`refs-07`, `provenance-13`) were added as corrections to this WP's own contract, not
IMPLEMENTATION_PLAN-mandated, and none carry `[PLAN]`: `linker-21`, `refs-07`, and
`provenance-13` by the 2026-07-17 Fable review of `docs/gate-contracts.md` (findings F12, flagged
ruling #3, and F3 respectively); `defs-15` by the same-dated TJO premise correction (below), with
its corresponding contract text (F5 reversed) landing separately in **M0.7**; `linker-22`/
`linker-23` by the 2026-07-18 M0.3 AISM divergence triage (`docs/reviews/
2026-07-18-aism-divergence-triage.md`, bead `rk-co2` — the sole rk-bug found, `introspectWorkspace`
ignoring `node_amended` ledger events).

**`[TJO]` fixture `defs-15`** was added during M0.2 build, ahead of its own contract text: at
build time the corresponding checks 8-9 amendment was queued but not yet landed in
`docs/gate-contracts.md`, so the fixture's ledger row (and this section) originally described it
as anticipatory. **M0.7 (2026-07-17) landed the contract amendment** (Gate 1 checks 8-9, F5
reversed — `source:`/`sha256:` now REQUIRED for `kind=cited`); `defs-15` now also appears in
`docs/gate-contracts.md`'s Gate 1 "Corpus fixtures required" table, alongside the three
Fable-review-added fixtures above, and its row above reads "Contract-backed and
M0.3-enforceable," not anticipatory.

**2026-07-17 TJO premise correction (mid-M0.2).** AISM is prior art, not a golden master —
its script behavior informs but never overrides `docs/gate-contracts.md`. `expected.json`'s
`verdict`/`findings`/`exit_code` state what the CONTRACT requires; AISM's actual, script-verified
behavior is recorded separately in `aism_behavior` (see the convention section below), purely as
migration-bookkeeping data for M0.5's divergence triage. `defs-15` was the one fixture built
*after* this correction whose target verdict deliberately diverged from AISM's own behavior and
from the then-current text of Gate 1 checks 8-9 (F5): the contract amendment making cited-shard
`source:`/`sha256:` absence strict-ERROR, queued at the time this paragraph was first written,
has since **landed as M0.7** — see the note above.

---

## Fixture directory layout (M0.2)

Every fixture lives at `corpus/<gate>/<fixture-id>/`, where `<gate>` is one of `defs`, `linker`,
`refs`, `provenance`, `runs`, `shards` (the fixture-id prefix, not the "argument/linker" or
"report-shards" prose name used in `docs/gate-contracts.md`'s section headers), plus the two
synthetic rk-only gates with no AISM script counterpart: `config` (M1, rk-xbm) and `freshness`
(M2.6). Two files:

```
corpus/<gate>/<fixture-id>/
  repo/          a MINIMAL repo tree exhibiting the violation (or, for golden fixtures, the
                 correct structure): only the files the target gate actually reads, nothing
                 else. Frontmatter/shard/manifest shapes are modelled on real files read
                 (READ-ONLY) from ../almost-idempotent-stochastic-maps; hashes are real SHA256
                 digests computed from the fixture's own payload bytes, never placeholders,
                 wherever the gate parses hash content.
  expected.json  machine-readable expectation — the interface M0.3's test harness consumes.
```

A fixture's `repo/` may carry its own `.rk/config.json` (same shape/path convention a real repo
uses, `src/store/config-load.ts`); the corpus runner (`src/corpus/run.ts`'s `runFixture`,
shared by `test/corpus.test.ts` and `bun run selftest`) loads it per-fixture and merges it over
`DEFAULT_GATE_CONFIG` before running the gate. Absent file: unchanged default-config behavior.

**Declaration is mandatory (rk-6vw, 2026-07-18 M0.3 milestone review finding 10; wording corrected
2026-07-18, rk-4uw, re-review ruling (e) — narrowly ratified).** An undeclared `.rk/config.json`
can silently weaken what a golden fixture proves about the default boundary (finding 10's example:
a higher linker brittleness cap could leave the 26-node golden fixture clean without proving the
default-26 boundary at all) — so `expected.json` must name the override explicitly via its own
`config_override` field (see the convention section below) for the runner to accept it. What the
single comparison in `runFixture` actually guarantees is **exact effective-configuration
equality**: the resolved `GateConfig` a fixture's `repo/` (with or without `.rk/config.json`)
produces via `loadGateConfig` must equal EXACTLY `mergeGateConfig(expected.config_override)` —
`mergeGateConfig(undefined)` (bare defaults) when `config_override` is absent, or the declared
override's merge when present. This catches a *config value* mismatch in both directions: an
override that changes the resolved config without a matching `config_override` declaration, and a
declared `config_override` that doesn't match what the fixture's config actually resolves to. It
does **not** prove `.rk/config.json`'s literal presence or absence on disk: an undeclared file
containing only explicit defaults (or `{}`) resolves to the exact same `GateConfig` as no file at
all — `loadGateConfig` returns merged defaults in both cases — so such a file, present in a
fixture's `repo/` with no `config_override` field, passes this comparison undetected. `provenance-
11` is the only fixture that uses this (its `provenanceStatusTableFile` override, now declared as
`"config_override": { "provenanceStatusTableFile": "report/sections/14_discussion.tex" }`).

## `expected.json` convention

**Normativity hierarchy (2026-07-17 TJO premise correction — read this before anything
else in this section).** AISM is prior art, not a golden master: it kind-of-works, with known
problems, and its incident history is valuable data — but its script *behavior* is never the
spec. `docs/gate-contracts.md` (commit 77a488e) is the normative spec. Every fixture's
`verdict`/`findings`/`exit_code` below express what **the contract** requires. AISM scripts are
still run against every fixture where feasible (see Validation methodology) — but as
characterization of prior art for M0.5's cutover-divergence bookkeeping, never as the arbiter of
what a fixture's expectation should be. Where AISM's actual behavior differs from the contract's
target verdict, that is recorded honestly in `aism_behavior`, **never** used as a reason to
weaken the expectation to match AISM.

```json
{
  "gate": "defs",
  "verdict": "fail",
  "findings": [
    { "severity": "ERROR", "path_pattern": "definitions/def-x.md", "message_pattern": "DRIFT" }
  ],
  "exit_code": 1,
  "coverage": { "checked": 1, "total": 1, "unit_patterns": ["0 frontmatter-invalid"] },
  "config_override": { "linkerBrittlenessSoftCap": 5 },
  "aism_behavior": "same",
  "notes": "one line: what this fixture proves and how it was validated"
}
```

`coverage` and `config_override` are both OPTIONAL — most fixtures carry neither (see "Which
fixtures get a `coverage` expectation" below).

Field semantics:

- **`gate`** — one of `defs`, `linker`, `refs`, `provenance`, `runs`, `shards` (matches the
  directory).
- **`verdict`** — `"fail"` iff **the contract** says the gate reports ≥1 ERROR finding on this
  `repo/` tree (equivalently `exit_code == 1`, per the Shared Conventions' Exit codes rule in
  `docs/gate-contracts.md`); `"pass"` otherwise. WARN-only and golden (zero-finding) fixtures are
  `"pass"`. This is the CONTRACT's verdict, not necessarily AISM's — see `aism_behavior`.
- **`findings`** — the findings this fixture specifically **targets** per the contract, not
  necessarily an exhaustive line-for-line transcript of everything the gate would emit (a
  fixture may incidentally trigger an unrelated WARN, e.g. "manifest absent" alongside its
  target ERROR). M0.3's harness must assert each listed finding is **present** among the gate's
  actual output (subset match on severity + path + message substring), not that the output
  equals this list exactly. An empty `findings` array is legal for a clean golden case with zero
  output beyond the coverage line.
  - `severity` — `"ERROR"` or `"WARN"`, matching the Shared Conventions finding format exactly.
  - `path_pattern` — a repo-relative glob (`fnmatch` semantics) matched against the finding's
    `path`; a literal path (no glob metacharacters) matches exactly.
  - `message_pattern` — a case-sensitive substring that must appear in the finding's `message`
    text (not the whole `SEVERITY path:line message` line).
- **`exit_code`** — the single gate's own exit code in isolation under the contract (0 or 1;
  `rk check`'s composed exit code is a separate concern, out of scope for a per-gate fixture).
- **`coverage`** (OPTIONAL; rk-6vw, 2026-07-18 M0.3 milestone review finding 6) — an exact
  expectation on the gate's own `CoverageLine` (`src/gates/framework.ts`; every one of the six
  gates emits exactly one per run, per `docs/gate-contracts.md`'s "Coverage line" shared
  convention). When present, the runner (`src/corpus/run.ts`) asserts it — never merely
  reports it:
  - `checked`/`total` — matched EXACTLY against `coverage[0].checked`/`coverage[0].total`.
  - `unit_patterns` (optional array) — every string must appear as a case-sensitive substring of
    `coverage[0].unit`, same convention as `findings[].message_pattern`. Needed because a
    fixture's actual coverage-point is often a sub-count embedded in the free-form `unit` text
    rather than the top-level `checked`/`total` pair itself — e.g. provenance-13's point is "0
    tab:status rows", not its registry-level `1/1`.
  - See "Which fixtures get a `coverage` expectation" below for the criterion deciding which
    fixtures carry this field; absent means the harness makes no coverage assertion at all for
    that fixture (a purely finding-shaped fixture, not a claim that its coverage line is
    unconstrained).
- **`config_override`** (OPTIONAL; rk-6vw, finding 10) — declares the exact `Partial<GateConfig>`
  (`src/gates/config.ts`) this fixture's `repo/.rk/config.json` carries. Mandatory whenever that
  file exists; forbidden (must be absent, or the field itself absent) otherwise. The runner
  asserts the loaded config (`loadGateConfig(repoDir)`, merged over `DEFAULT_GATE_CONFIG`) equals
  EXACTLY `mergeGateConfig(config_override)` — this single comparison catches both an undeclared
  override (file present, field absent → the loaded config differs from bare defaults) and a
  stale declaration (field present but doesn't match what the file actually resolves to). See the
  "Fixture directory layout" section above for the full rationale.
- **`aism_behavior`** — characterization of prior art, subordinate to `verdict`/`findings`/
  `exit_code` above; never authoritative:
  - `"same"` — the corresponding AISM script, run against this fixture's `repo/` tree, produces
    the same verdict the contract requires. Validated per the Validation section below.
  - `"differs: <one-line how>"` — AISM's actual, script-verified behavior on this fixture
    diverges from the contract's target verdict (e.g. AISM crashes where the contract wants an
    ERROR finding; AISM passes silently where the contract wants strict-ERROR). The one-line
    explanation states what AISM actually does, cited to `script:line`; this is migration
    bookkeeping for M0.5's divergence triage, not a reason to change `verdict`/`findings` above.
    Every `"differs"` fixture's `notes` field also carries a **pre-triage tag** per CLAUDE.md
    L5 (amended 2026-07-17): `rk-stricter-intended` (the contract deliberately tightens a known
    AISM gap), `rk-bug` (an unintentional divergence — should not exist in a landed fixture; if
    found, fix the fixture or escalate), or `ambiguous → escalate` (genuinely unclear, flagged
    for the M0.3-boundary Fable ratification named in the review addendum). This is separate
    bookkeeping from the `verdict`/`findings` fields, which always state the contract's target
    regardless of triage tag.
  - `"unrunnable"` — the fixture could not be run against the real AISM script at all (a hard
    dependency on repo-scale structure the harness could not construct standalone, e.g. a real
    `latexmk` build or a live `bd` tracker); recorded honestly, never silently folded into
    `"same"`.
- **`notes`** — one line: what the fixture proves, the exact AISM script:line(s)/contract
  clause it exercises, and how it was validated (script-verified / regression probe /
  unrunnable-and-why). Where a fixture's `verdict` anticipates a contract clause that has not
  yet been written into `docs/gate-contracts.md` (a pending correction), say so explicitly here
  — that fixture is not yet enforceable by M0.3 until the contract itself is amended.

## Which fixtures get a `coverage` expectation (rk-6vw)

Not every fixture's contract clause is about the coverage line — most target one specific
`Finding`, and asserting an incidental `checked`/`total` value alongside it would just be
brittle noise unrelated to what the fixture proves. The criterion: a fixture gets a `coverage`
expectation iff its own row in `docs/gate-contracts.md`'s "Corpus fixtures required" table, or
a named Divergences entry, explicitly frames the fixture's POINT as the coverage line's
truthfulness or visibility — not merely "the gate happens to also emit a coverage line" (true of
all 103 fixtures, and not by itself a reason to assert on it). By that criterion:

| fixture | why | `docs/gate-contracts.md` anchor |
|---|---|---|
| `defs-14` | manifest absent ⇒ checks 8–9 coverage count must read `0/K`, not silently no-op | Gate 1 fixture table |
| `refs-01` | 19/19 false-green ⇒ coverage line must show `0` import/no-quote-skipped, not `N` silently-skipped | Gate 3 fixture table |
| `provenance-13` | status-table label absent ⇒ coverage line must show `0 tab:status rows` loudly (F3); the SAME coverage line also carries the rk-v18 registry-skip fix's `0 frontmatter-invalid` sub-count, so this one fixture's `unit_patterns` pins both deviations at once | Gate 4 fixture table + Gate 4 Divergences (rk-v18) |
| `provenance-17` | registry-parse frontmatter-invalid > 0 (one malformed shard among two) ⇒ coverage `checked`/`total` must show the honest raw-inputs denominator (`1/2`), not a silently-collapsed `1/1`; closes the gap this section used to flag as a known follow-up (rk-v18, N4) | Gate 4 fixture table + Gate 4 Divergences (rk-v18) |
| `runs-07` | empty `runs/` day-1 golden case, explicitly "asserts the coverage line still fires" | Gate 5 fixture table |
| `shards-07` | invalid `\include` target ⇒ the non-conforming shard identity counts in the denominator, never the numerator (`0/1`, not the pre-N3 `0/0`) | Gate 6 fixture table (N3) |
| `shards-08`, `shards-09` | coverage numerator must mean "fully conforming", not "examined" — a live CATALOG/README ERROR must still exclude the shard from `checked` (rk-1tt) | Gate 6 Divergences |
| `linker-25` | both argument/INDEX.md + DAG.md mirrors absent ⇒ coverage line must name each mirror's non-adoption visibly, never a silent skip (R14) | Gate 2 fixture table + Gate 2 Check 11 |
| `linker-26` | recursive discovery golden case ⇒ coverage line must name the excluded non-shard file count AND their (depth-disambiguated) names, never a silently-collapsed shard count (rk-9pk) | Gate 2 fixture table + Gate 2 Inputs/Divergences |
| `shards-15` | `report/` ROOT absent ⇒ coverage line must name the non-adoption visibly, never a silent skip (R13) | Gate 6 fixture table + Gate 6 Check 1 |
| `provenance-20` | root-level shard discovery ⇒ coverage must read `1/1` where the pre-fix lemmas-only scan produced a vacuous `0/0` green (rk-2t8) | Gate 4 fixture table + Gate 4 Inputs/Divergences |
| `provenance-21` | `report/` ROOT absent ⇒ coverage line must name the non-adoption visibly, never a silent skip (B1) | Gate 4 fixture table + Gate 4 check 6 |
| `config-01`, `config-02` | the config gate's coverage line must count the validated config exactly once and carry the loud ERROR — a malformed field can never be a silent fallback (rk-xbm) | Config-validation section (Authority) |
| `freshness-01`..`freshness-05` | every Gate 7 fixture's point IS the coverage line: `checked`/`total` and the exact "not adopted"/"manifest not adopted" wording distinguish never-adopted, adopted-but-empty, adopted-with-entries, and malformed-manifest states from one another — none of the four is expressible by the findings list alone | Gate 7 section |

**Known gap CLOSED (rk-4uw, 2026-07-18, N4).** This section previously flagged that
`registrySkipReport`'s frontmatter-invalid-registry-shard path (rk-v18) had red-first proof only
at the unit-test level (`test/gates/provenance.test.ts`, git-stash mutation check), with no landed
corpus fixture driving `skipped.length > 0` — a live L2 gap (2026-07-18 M0.3 re-review, finding
4: "That conflicts directly with L2's fixture-per-failure-mode law"). `provenance-17` (above)
closes it: one valid lemma plus one lemma with no frontmatter at all, asserting both the aggregate
WARN and the honest `1/2` coverage denominator end-to-end through the corpus runner.

Every other fixture (the remaining 84 = 103 total − 19 with an asserted `coverage` expectation) is a
purely finding-shaped fixture per this criterion and carries no `coverage` field — its
`checked`/`total` values are whatever the gate happens to produce, asserted nowhere, same as
before this WP.

## `bun run selftest` actually runs the corpus (rk-6vw)

Before 2026-07-18, `scripts/selftest.ts` only called `totalFixtureCount` — it counted fixture
*directories*, never ran a single one through its gate, contradicting this file's own line 13
above ("`rk check --selftest` runs the corpus"), a guard-the-guards truthfulness gap (2026-07-18
M0.3 milestone review, finding 6). The per-fixture run/assert logic that used to live only inside
`test/corpus.test.ts` is now `src/corpus/run.ts`'s `runFixture`/`runAllFixtures` — an EDGE
module (reads `repo/`, `.rk/config.json`, and `expected.json` off disk, so it is never marked
`PURITY: pure` and is exempt from the L3 purity grep, same as `src/store/snapshot-load.ts`/
`src/store/config-load.ts` — both relocated out of `src/gates/` by rk-7uc, 2026-07-18). `runFixture`/`runAllFixtures` (and their fixture-discovery sibling,
`discoverAllFixtures`) originally landed at `src/gates/corpus-run.ts`/`src/gates/
corpus-discovery.ts` — fs-using files inside `src/gates/`, which CLAUDE.md §5 and
IMPLEMENTATION_PLAN.md §0 both classify PURE; the marker-based grep silently exempted them rather
than flagging the misplacement, an architecture-law regression caught by the 2026-07-18 re-review
(finding 6) and fixed by relocating both to `src/corpus/` (edge territory, same tier as
`src/drive`/`src/refs`/`src/cli`) — `scripts/selftest.ts`'s own `checkGatesDirImpureAllowlist`
now fails loudly if a future impure file lands directly in `src/gates/` again undocumented.

Three callers now share this ONE runner, so none can silently disagree about what "the corpus
passes" means: `test/corpus.test.ts` (per-fixture `test()`/`expect()`, for readable red output
under `bun test`), `scripts/selftest.ts` (aggregated per-gate pass counts under `bun run
selftest`), and — since 2026-07-18, rk-bdd finding 7 — the actual `rk check --selftest` CLI flag
(`src/cli/check.ts`) this section's title refers to, which was unwired until then (only the
`bun run selftest` package script existed). All three format their report the same way
(`src/corpus/report.ts`'s `formatCorpusRunReport`). `bun run selftest`'s corpus-execution step
runs in well under a second (86 in-memory gate runs against small fixture trees); the whole
script, purity grep included, is comfortably under CLAUDE.md's `<10s` bar.

## Graph fixtures (M2.2/M2.3) — a distinct harness, not `src/corpus/run.ts`'s `Gate` runner

`corpus/graph/` holds fixtures for `src/store/build-graph.ts`'s "repo root -> `GraphDocument`"
pipeline (M2.2 store readers + `src/graph/assemble.ts`'s pure join boundary) — a different shape
of thing than the six `docs/gate-contracts.md` gates the rest of this file's table covers: there
is no `Finding[]`/verdict output to compare against an `expected.json`, so these fixtures are NOT
discovered by `src/corpus/run.ts`'s generic `Gate` runner and do NOT count toward `bun run
selftest`'s `checked corpus: N/N gate fixtures discovered` line. Each one gets its own
hand-written test file under `test/graph/` instead (still `repo/`-shaped on disk, same fixture
convention, different harness) — M2.1's memo (docs/memos/2026-07-19-graph-schema-v1.md, "review
outcomes", question 4) explicitly deferred creating this directory until a reader harness existed
to run fixtures through; M2.2's `build-graph.ts` is that harness.

| fixture id | harness | violation | status |
|---|---|---|---|
| `graph/rename-hazard` | `test/graph/corpus-rename-hazard.test.ts` | end-to-end proof that the registry↔af join reads the shard's `workspace:` field, never its `id` — a shard (`lem-halo-collapse`) whose id names one directory (`proofs/lem-halo-collapse/`, present with a DECOY ledger carrying a deliberately wrong contract/node-count) while `workspace:` names a different, real one (`proofs/halo-collapse-v2/`, the correct ledger). Bead rk-bsj (Tier A M2.1 review follow-up 5): the existing unit fixture (`test/graph/fixtures.ts`'s `buildRenameHazardDocument`) proves the SCHEMA/VALIDATOR catch a rename-hazard edge once one exists as a hand-built document — it cannot catch a READER that derives the join key from `id` in the first place. Mutation-proven red-first (temporarily deriving the workspace-discovery list from `id` in `build-graph.ts` turns this fixture red — `workspaceResolved: false` instead of a correct resolve; reverted after confirming). | landed |
| `graph/conflict-status-mismatch` | `test/graph/corpus-conflict-status-mismatch.test.ts` | M2.3 class (a) — registry-status vs af-epistemic-state disagreement: `lem-a` (`status: proved`, `af: validated`) against a deterministically-stubbed `af export` (`fake-af`, invoked via `afCommand`, never a real af binary) reporting root `epistemic_state: "pending"`; `contractMatch`/`taintState` held at non-conflicting values so this fixture isolates `status-mismatch` alone. Drives `build-graph.ts` end to end. Mutation-proven red-first (commenting out `validate-conflicts.ts`'s `epistemicState !== "validated"` push turns this fixture red — `conflicts: []` where one is expected, plus the `test/graph/corpus-conflict-never-resolved.test.ts` property test's baseline/drop cases for this class; reverted after confirming). | landed |
| `graph/conflict-contract-mismatch` | `test/graph/corpus-conflict-contract-mismatch.test.ts` | M2.3 class (b) — contract byte-mismatch: `lem-b`'s registry `contract` and the stubbed af export's root `statement` name related but byte-different claims (`contractMatch: false`) on an otherwise-resolved workspace; `epistemicState`/`taintState` held at non-conflicting values so this fixture isolates `contract-mismatch` alone — the MANDATORY conflict record on a resolved-but-mismatched workspace (Tier A review blocker 3), never demoted to the unresolved bucket. Mutation-proven red-first (commenting out the `!e.contractMatch` push turns this fixture red; reverted after confirming). | landed |
| `graph/conflict-taint-status` | `test/graph/corpus-conflict-taint-status.test.ts` | M2.3 class (c) — taint vs status inconsistency: `lem-c` (`status: proved`) against a stubbed af export reporting `epistemic_state: "validated"`, `contractMatch: true`, but `taint_state: "tainted"`; isolates `taint-status-mismatch` alone. Mutation-proven red-first (commenting out the `e.taintState !== "clean"` push turns this fixture red; reverted after confirming). | landed |
| `graph/conflict-banked-without-oracle` | `test/graph/corpus-conflict-banked-without-oracle.test.ts` | M2.3 class (d) — fr banked-claim without a fresh oracle verdict: `lem-d` (`af: none`, no af edge at all) named by `repo/.frontier/log.jsonl`'s one cycle (`outcome: "banked"`, `evidence.verdict: "claimed"`, read via fr's direct-ledger fallback, `frCommand` pointed at a guaranteed-absent binary) — the bank-gate's own oracle-verdict requirement is unmet. Mutation-proven red-first (short-circuiting `oracleBacked` to always-`true` in `validate-conflicts.ts` turns this fixture red; reverted after confirming). | landed |
| `graph/conflict-banked-unfresh-ledger` | `test/graph/corpus-conflict-banked-unfresh-ledger.test.ts` | M2-review blocker 6 — banked edge via the ledger fallback where verdict freshness cannot be recomputed (`verdictFresh: undefined`): pre-fix `undefined !== false` counted as oracle-backed and the required conflict disappeared; now `verdictFresh === true` is required, so the conflict fires. Mutation-proven red-first (commit 97e58be). | landed |
| `graph/conflict-banked-unfresh-export` | `test/graph/corpus-conflict-banked-unfresh-export.test.ts` | M2-review blocker 6, primary-export path — `verdict:"banked"` with no matching oracle freshness record in the fr export: same `verdictFresh === true` requirement, conflict fires. Mutation-proven red-first (97e58be). | landed |
| `graph/conflict-retraction-vs-status` | `test/graph/corpus-conflict-retraction-vs-status.test.ts` | **rk-0ehr / P1, class (e) — the FIFTH conflict kind and the reason `graph.v1.json`'s `schema_version` went `"1"` -> `"2"`**: `lem-stage1-approximate-group-laws` (the real AISM id) is `status: proved-mod-audit` with its bytes UNCHANGED, and `.rk/retractions.jsonl` carries a record pinned to exactly those current bytes (`l5-shard-bytes` domain) ⇒ one mandatory `retraction-vs-status` conflict, `live: true` with `currentHashObserved: true` (a real hash comparison, not a fail-closed default). `af: none` throughout, so no af edge exists and the fixture isolates the retraction path from all four earlier kinds. Also proves the two halves the incident argues for: PROPAGATION (`lem-downstream` depends on it and inherits `tainted` with `isSource: false`, carrying no conflict of its own) and the RENDER VETO (`effectivePresentation` paints it `rk-defect-tier`, `rigorous: false`, label `declared proved-mod-audit; evidence conflicted, tainted` — the declared claim stays visible). Incident: AISM 2026-07-28, `docs/memos/2026-08-03-aism-postmortem/03-datamodel.md` "Drift & inconsistency found" item 1. Gate-layer sibling: `corpus/linker/linker-44`. Render-surface proof: `test/render/retraction-veto.test.ts` (markup, not just the styling unit). Mutation-proven red-first (emptying the retraction loop in `validate-conflicts.ts`'s `computeExpectedConflicts` → 14 fail; disabling the retraction branch in `query-taint.ts` → 9 fail; flipping `retraction-load.ts`'s fail-closed liveness default to fail-open → 2 fail; all reverted after confirming). | landed |
| `graph/conflict-fr-superseded` | `test/graph/corpus-conflict-fr-superseded.test.ts` | M2-review blocker 7 — a banked-without-oracle cycle superseded by a later cycle produces NO live conflict (superseded evidence is not promotion-bearing; the edge stays visible in `edges.fr`), while an unsuperseded sibling still conflicts. Mutation-proven red-first (93d00a2). | landed |
| `graph/contract-join-af-broken` | `test/cli-check-contract-conflicts.test.ts` | **R4 / reviewer B — answering-but-broken af must fail closed.** The configured `fake-af` answers successfully but emits `NOT-JSON`; because af answered, the existing workspace ledger is not eligible for absent-binary fallback. The resulting af edge is unresolved. `rk check` must emit one structural `graph contract join unresolved` ERROR, report `checked graph-conflicts: 0/1 contract joins (1 errors, 0 warnings)`, and exit 1 in both consolidation and exploration. Mutation-proven by deleting the unresolved-entry loop: both ERROR-surfacing assertions turned red; restored afterward. | landed |
| `graph/contract-match-check-escape` | `test/cli-check-contract-conflicts.test.ts` | **rk-45dj / P2 — obligatory contract-join surfacing.** Campaign-shaped `thm-k-part-ceiling` is `status: proved-mod-audit`, `af: seeded`, with a resolved workspace. Its registry contract contains a two-space run where the af root has one space: Gate 2's historical whitespace-normalized Check 9 remains clean, while the graph's normative byte-exact join reports `contractMatch:false`. Before rk-45dj, graph conflict recomputation also skipped this non-`proved` status and `rk check` exited 0; now consolidation emits ERROR and exits 1, exploration emits WARN and exits 0, and both report `checked graph-conflicts: 1/1 contract joins`. Mutation-proven red-first by inverting the pure `!e.contractMatch` predicate, which removed the conflict and both CLI findings; restored after confirming RED. | landed |

`test/graph/corpus-conflict-never-resolved.test.ts` is a fifth, property-shaped harness (no `repo/`
of its own — it reuses the four fixtures above): for each of the four real assembled documents, it
asserts a clean baseline (`validateGraphDocument(doc) === []`, recorded conflicts == recomputed
exactly) and then tampers with the ASSEMBLED `conflicts` array four ways — drop, duplicate,
edit-`otherValue`, and swap-`kind` — asserting `validateGraphDocument` ERRORs on every tamper, for
every one of the four conflict classes (never a class-specific gap). A fifth block combines TWO
fixtures' real assembled output (`conflict-status-mismatch` + `conflict-contract-mismatch`) into
one document and drops one of the two independently-computed conflicts, proving a "merge" step
cannot silently collapse two real conflicts into one entry either. This is the end-to-end
(not hand-built-`GraphDocument`-level) proof of the WP's "conflicts render as defects, never
auto-resolved" acceptance line, run through the real `build-graph.ts` -> `assemble.ts` ->
`validate.ts` pipeline for all four closed `ConflictKind`s.

## Render fixtures (M2.4) — a third distinct harness, the rendering-truthfulness corpus

`corpus/render/` holds the **rendering-truthfulness** fixtures PRD C6 mandates ("the renderer is
itself a trust surface ... one node per status, asserted against emitted markup"). Same footing as
`corpus/graph/`: a distinct harness, NOT `src/corpus/run.ts`'s six-gate `Gate` runner (there is no
`Finding[]`/verdict to compare — the output is HTML markup), so these are not discovered by the
gate runner and do NOT count toward `bun run selftest`'s `checked corpus: N/N gate fixtures` line.
Each gets a hand-written `test/render/` test. The fixture is a valid canonical `GraphDocument`
(`graph.json`, generated through `computeExpectedConflicts` + `validateGraphDocument` so it is
self-consistent by construction), not a `repo/` tree — the render core (src/render/) consumes a
projected `GraphDocument`, one join layer above the store readers.

| fixture id | harness | what it proves | status |
|---|---|---|---|
| `render/rigour-ladder` | `test/render/corpus-rigour-ladder.test.ts` | One node per rigour-ladder status (PRD §5: cited, proved, consensus, proved-mod-audit, stated, conjecture, heuristic, numerical, open, obstruction, disproved) plus taint (`n-tainted`), conflict (`n-conflict`, contract-mismatch), and unresolved-workspace (`n-orphan`) cases. Each node's drill-down panel (`src/render/node-view.ts`) is rendered and asserted against EMITTED MARKUP: the node badge carries that status's own `rk-s-<status>` class and label, the correct rigour tier class (`rk-rigorous` for cited/proved/consensus ONLY, `rk-nonrigorous` for the rest — PRD §5's rigorous column verbatim), and NO other status's class. The load-bearing assertion is the exact forbidden case — a `stated` node is never painted with `proved`'s class or the rigorous tier. Taint/conflict/unresolved render as first-class `rk-defect` markup, never hidden. Styling flows from the ONE source of truth `src/render/styling.ts` (`STATUS_STYLES`/`RIGOROUS_STATUSES`). Mutation-proven red-first two ways: (a) adding `stated` to `RIGOROUS_STATUSES` turns the forbidden-case test red; (b) making `styleForOptional` map `stated`->`proved` turns the per-status and forbidden-case tests red; reverted after confirming. `test/render/styling.test.ts` additionally pins the map's invariants directly (distinct classes, disjoint rigorous/non-rigorous colour+tier partition). M2.4 pass 2 (rk-c2q) additively extended this SAME fixture (no existing node/status/conflict data touched) with `edges.fr` (cycles 1-5: cycle 1 died/superseded-by-2, cycle 2 died/live, cycle 3 refuted/live, cycle 4 died/unresolved with a companion `unresolved` bucket entry, cycle 5 banked/non-dead — proves the graveyard view excludes non-dead outcomes), `edges.report` (`n-proved` resolved, `n-stated` unresolved), and `defs: [...]` on three nodes (`n-cited`->`def-foo`, `n-proved`->`def-bar`, `n-stated`->`def-missing`) for the pass-2 breadth views below. | landed |
| `render/graveyard` (fixture: `render/rigour-ladder`, see above) | `test/render/graveyard-view.test.ts` | Dead-route graveyard (`src/render/graveyard-view.ts`): every fr edge whose `outcome` is `died`/`refuted` is TOTAL over `edges.fr` (cycles 1-4), never a silent drop. RED CASE (the load-bearing invariant): cycle 1 is superseded by cycle 2 (`supersedes:1` on cycle 2) — cycle 1 must never render in the "live" section, only in a visibly distinct "superseded" section, still present (never dropped) but never presented as current. Mutation-proven red-first: removing the live/superseded partition (rendering every dead route as live) turns the RED CASE test red; reverted after confirming. Also asserts an unresolved dead route (cycle 4, no `resolvedNodeId`) renders honestly, a non-dead outcome (cycle 5, `banked`) is excluded, and the view states plainly that fr's own residual/death-certificate text is NOT carried into rk's graph projection (only cycle/artifact/outcome/verdict/supersedes cross the M2.2 join). | landed |
| `render/run-gallery` | `test/render/runs-edge.test.ts` + `test/render/run-gallery-view.test.ts` | Run-bundle gallery. `repo/` (`runs/2026-07-10-first-bundle/` complete + INDEX-referenced, `runs/2026-07-12-orphan-bundle/` complete but NOT INDEX-referenced, `runs/README.md` the schema doc) exercises `src/render/runs-edge.ts`'s EDGE reader: reuses Gate 5's OWN `runsGate` (src/gates/runs.ts) for validity findings — the gallery can never disagree with `rk check`'s own verdict — plus an independent bundle-name enumeration for display. `src/render/run-gallery-view.ts` (pure, hand-built `RunGalleryData`) asserts a gate-flagged bundle's finding renders directly on its card (never presented as an ordinary clean one) and day-1 vacuity (0 bundles) renders an honest empty state. Mutation-proven red-first: dropping the per-bundle finding lookup turns the flagged-bundle test red; reverted after confirming. | landed |
| `render/defs-index` | `test/render/defs-edge.test.ts` + `test/render/defs-view.test.ts` | Definitions index + conventions ledger. `repo/` carries `definitions/def-foo.md` (kind=cited/status=locked, aliases `Foobar;F`, source+sha256) and `definitions/def-bar.md` (kind=consensus/status=draft, no source/sha256 — cited-only fields), plus a real, filled-in `CONVENTIONS.md` (copy of `templates/CONVENTIONS.md.tmpl`). `src/render/defs-edge.ts` (EDGE) parses frontmatter per Gate 1's own field set (independent re-parse, no gate re-run — display only, never a validity verdict) and reads CONVENTIONS.md verbatim. `src/render/defs-view.ts` (pure) groups by kind then status with alias lists, and renders CONVENTIONS.md as an AUTHORED-CONTENT block (escaped, never parsed/scraped) when present, an honest "no CONVENTIONS.md" note (definitions index still rendered) when absent — the deliberate stance on PRD C6's "conventions ledger view": no machine-readable conventions schema exists in the stamped layout, so this view is verbatim-only, never speculative prose-scraping. Also proves markup-significant characters in a term/alias are escaped (regression-caught: an early draft interpolated `d.term` unescaped — caught by a dedicated test before landing). | landed |
| `render/provenance-view` (fixtures: `render/rigour-ladder` + `render/defs-index`, see above) | `test/render/provenance-view.test.ts` | Per-claim provenance chains (`src/render/provenance-view.ts`): claim -> provenance field -> report anchor -> af evidence -> refs, reusing `computeFocusView` (src/graph/query-focus.ts) for steps 3-4 so this view can never disagree with `rk graph --focus`. Step 2 (provenance field) is honestly reported ABSENT — `RegistryNode` carries no raw `provenance:` frontmatter, only the derived report-anchor join crosses the M2.2 boundary. RED CASE (step 5, refs): `n-stated` cites `def-missing`, which is NOT in the `render/defs-index` fixture — renders an explicit "no matching definitions/*.md record found ... (absent link)" note, never a silent skip; `n-cited` cites `def-foo`, which IS present, and resolves to its term/source/sha256. Without a `defsById` map at all, cited ids still render, honestly noting "definitions data not loaded for this render" rather than implying zero citations. | landed |

## Drive fixtures (M3.8/rk-bun) — a fourth distinct harness

`corpus/drive/` holds fixtures for the LIVE hard-tier driver's validity INPUTS
(`src/cli/verify-live.ts` -> `src/drive/cross-vendor.ts`). Same footing as `corpus/graph/` and
`corpus/render/`: not `Finding[]`-shaped, so not discovered by `src/corpus/run.ts`'s `Gate`
runner and NOT counted in `bun run selftest`'s `checked corpus: N/N gate fixtures` line, nor in
`EXPECTED_FIXTURE_COUNT` (which stays 125 — `corpus/drive` is outside `GATE_DIRS` by design).
Bead rk-b09 tracks surfacing these harnesses in the selftest; rk-x573 extends it to this tree.

| fixture id | harness | what it proves | status |
|---|---|---|---|
| `drive/cross-vendor-offpath-single-vendor` | `test/drive/corpus-cross-vendor-membership.test.ts` | **rk-bun + rk-id1.** A north star that resolves, a claim (`lem-a`) reachable from it by NO dep/route path, and a SINGLE-VENDOR roster. Proves the determined-off-path branch permits same-family accepts (PRD C9's "Non-critical-path: same-family allowed, recorded" — a branch that was unreachable for as long as `isLoadBearing` was hard-coded `() => true`), while `--north-star nope` fails CLOSED with a distinct `north-star-unresolved` reason that is never dressed up as the determined off-path answer. `.rk/config.json`'s `northStarId` and `workers` are read through production `loadGateConfig`, not injected. Mutation-proven red-first two ways (restoring `() => true`; ignoring config `northStarId`). | landed |
| `drive/verifier-fence-citable-record` | `test/drive/verifier-fence.test.ts` + `test/drive/l5-dispatch-fence.test.ts` | **rk-fs8v / Campaign A, window 3.** Reproduces a verifier brief falsely asserting that an unverified input had survived cross-vendor review and must not be re-litigated. Five structured `assumedVerified` declarations exercise a nonexistent verdict reference, hash-stale verdict, live-retracted verdict, wrong-claim verdict, and latest fresh unretracted plain-`VALID` verdict. The validator must report `checked 5/5`, refuse the first four, and admit only the fifth; dispatch tests prove a refusal opens no worker session and a confirmed fence reaches the verifier with its content hash and citable JSONL locus. Mutation-proven by substituting the cited historical hash for the current hash, which incorrectly admitted the stale record and turned the incident test red. | landed |

## Empty-directory fixtures (rk-399)

Git cannot store an empty directory, but two contract checks turn on directory existence
independent of any file inside: an empty run bundle must still ERROR on a missing README
(`gate-contracts.md:862`), and `report/sections/` must exist as a directory
(`gate-contracts.md:956`, `check-report-shards.sh:23`). `src/store/snapshot-load.ts` measures directory
existence (empty ones included) into the `dirs` SnapshotFact by walking the tree with
`readdirSync`, and the gates consume it via `dirExists`/`childDirs` (`src/gates/snapshot.ts`).

Convention: a fixture that needs a genuinely-empty directory to survive a `git clone` places a
single **`.gitkeep`** file in it. `snapshot-load.ts` records the containing directory in `dirs` but
**excludes `.gitkeep` from all content facts** — it is never added to the text map, never hashed,
never counted as bundle/shard content. So `runs/<bundle>/.gitkeep` is an *empty bundle* (ERROR:
missing README), and `report/sections/.gitkeep` is an *existing-but-empty* sections dir (Check 1
passes, empty-scaffold exemption then applies). Fixtures using this: `runs-08`,
`shards-11` (retrofitted), `shards-13` uses the *absence* of the directory.

Red-first caveat for `.gitkeep`-based empty-bundle coverage: pre-fix file-prefix inference
coincidentally already saw the `.gitkeep` as a file and flagged the missing README, so the
`runs-08` corpus fixture is not red against pristine pre-fix source. The genuine red-first proof
is the `test/gates/runs.test.ts` unit test that builds a `dirs`-fact snapshot with an empty
bundle and **no** file at all — the only faithful model of a real on-disk empty directory, which
git cannot commit. `shards-13` (directory *absent*) and `provenance-14`/`-15` are corpus-red-first.

## Untracked-but-present sources (review N1) — why there is no committed corpus fixture

Gate 4 check 4 must treat a source payload **present on disk but git-untracked** (a gitignored
payload) and stale as a `[rk-stricter-intended]` ERROR, distinct from a genuinely-absent source
(WARN). `src/store/snapshot-load.ts` now hashes **every file present on disk** (full-tree walk, `.git`
etc. skipped), so `fileSha256(snapshot, path) !== undefined` iff the file is present — the pure
gate distinguishes present-stale from absent mechanically (review N1).

This failure mode **cannot** be reproduced by a committed corpus fixture. `loadSnapshot` runs
`git ls-files` from the fixture's `repo/` dir, and every file committed to rk's own repo is
returned as *tracked* from that vantage — a committed file is tracked by construction, so
"untracked-but-present" is unrepresentable in a clone-safe committed tree (a `.gitignore` inside
`repo/` does not untrack an already-committed file, and an uncommitted file would not survive a
clone). The faithful red-first proof is therefore the **load-edge unit test**
(`test/load.test.ts`, "hashes every present file, including untracked ones outside the include
rules"): `makeTree` builds a throwaway **non-git** directory, so `git ls-files` returns nothing
and every file is genuinely untracked — the exact gap. It is red against pre-fix source (the file
outside the include rules received no hash) and green after. The corpus-expressible half —
a *tracked* source outside the loader include rules, stale ⇒ ERROR — is `provenance-14`.

## Validation methodology

Every fixture's `aism_behavior` value was determined by actually **running the real AISM check
logic** against `repo/` — never by inspection alone — wherever that was mechanically feasible
(`"unrunnable"` fixtures are the honest exception). One caveat, discovered while building this
corpus and worth flagging for the
next Fable review: every AISM python gate script hardcodes `ROOT =
pathlib.Path(__file__).resolve().parent.parent` — i.e. `ROOT` is derived from the *script's own
file location* inside the AISM checkout, not from `cwd`. Running `cd <fixture>/repo && python3
.../check-defs.py` as this WP's brief literally describes therefore does **not** check the
fixture — it silently re-checks the real AISM repo at whatever `ROOT` resolves to, exit code and
all, and would have produced a false "validated" pass on every fixture. `check-report-shards.sh`
is the sole exception (`ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"`, which falls
back to `cwd` when git can't resolve a toplevel).

The validation harness (`aism_harness.py`, not committed to `corpus/` — a throwaway validation
tool, not part of the fixture interface) instead **imports each AISM script as a module,
read-only, and calls its own pure check functions directly** with the fixture's paths
substituted for the module-level `ROOT`-derived globals those functions read (cited per gate
below) — this executes the exact same AISM logic, just without going through the
`ROOT`-hardcoded `main()`. Nothing under `../almost-idempotent-stochastic-maps` was ever written
to.

- **defs** — `check_defs(defs_dir, manifest_path)` takes both paths as parameters; no override
  needed.
- **linker** — `load_def_ids()`/`scan_workspaces()`/`af_introspect()` read module globals
  `DEFS_DIR`/`PROOFS_DIR`/`ROOT` directly (argument.py:35-38,506-541); the harness patches all
  three post-import, then replicates `main()`'s non-`--generate` composition
  (argument.py:679-702) call-for-call. `af_introspect()` shells out to the real `af` binary
  (present on this machine); brittleness/contract fixtures use real `af init`/`af claim`/`af
  refine` workspaces, not stubs.
- **refs** — `refs_file_for()` reads module global `ROOT` directly (check-refs.py:101-105); the
  harness patches it post-import.
- **provenance** — every sub-check is a parameterized pure function, but `run_semantic()`
  itself binds them to `ROOT`-derived defaults; the harness re-implements `run_semantic()`'s
  composition with the fixture's paths passed explicitly (including `git_tracked(root)` for
  hash-freshness, which requires the fixture `repo/` to be transiently `git init`'d and
  committed so tracked-vs-untracked is real, then the transient `.git` removed — nested repos
  are never left behind).
- **runs** — `check_runs(runs_dir, index_path)` takes both as parameters; no override needed.
- **shards** (bash) — `check-report-shards.sh` run with `GIT_CEILING_DIRECTORIES` set to the rk
  repo's own toplevel, which makes `git rev-parse --show-toplevel` fail from inside any rk
  subdirectory so the script's own `|| pwd` fallback correctly resolves `ROOT` to the fixture's
  `repo/` dir.

## Validation results

Filled in per gate as fixtures land (M0.2 commits, one per gate). See each gate's row for the
script-verified / rk-only / untested breakdown.

| gate | fixtures | `aism_behavior: same` | `differs` | `unrunnable` |
|---|---|---|---|---|
| defs | 15/15 | 14 | 1 (`defs-15`, rk-stricter-intended, F5/M0.7 strict-provenance) | 0 |
| linker | 27/27 | 21 | 6 (`linker-15` message-only, `linker-21` crash→ERROR, `linker-24` missing-`kind` no-op — confirmed rk-stricter-intended by empirical harness run, rk-4uw, see below; `linker-25` mirror-presence-conditional, contract amendment not a strictness triage, R14/rk-1rv; `linker-26`/`linker-27` recursive `argument/**/*.md` discovery, contract amendment not a strictness triage, rk-9pk — AISM's `argument/lemmas/*.md`-only glob would see 0 shards on `linker-26`'s tree and never reach `linker-27`'s stray file at all) | 0 |
| refs | 11/11 | 7 | 4 (`refs-07`, whole-quote-match rule; `refs-08`, crash→ERROR — check-refs.py:180 uncaught AttributeError on null external, rk-stricter-intended; `refs-09`, quote-at-locus enforced — check-refs.py PASSes a right-bytes/wrong-passage citation, rk-stricter-intended; `refs-10`, no-quote escape closed — check-refs.py returns a WARN `skip_noquote`, rk-stricter-intended. `refs-11` is `same`: both exit 0) | 0 |
| provenance | 19/19 | 16 | 3 (`provenance-11`, hardcoded-filename incident; `provenance-17`, silent registry-parse denominator shrinkage — rk-stricter-intended; `provenance-18`, per-item-WARN flood — rk-stricter-intended) | 0 |
| runs | 10/10 | 9 | 1 (`runs-09` sanctioned-infrastructure allowance, contract amendment not a strictness triage, rk-z93m — `check-runs.py:46-50` WARNs both files; `runs-10` is `same`) | 0 |
| shards | 15/15 | 13 | 2 (`shards-14`, rk-stricter-intended, R12 shardsPrefix requiredness; `shards-15` report/-root-presence-conditional, contract amendment not a strictness triage, R13/rk-au6) | 0 |
| **total** | 92 (all script-validated) | 78 | 14 | 0 |

(Scope note, 2026-07-19: this script-validation table is the **M0 cohort** — the 92 fixtures that
existed when the AISM-script harness runs were performed. The 6 M1-repair-wave fixtures
(`provenance-20`, `linker-28`–`linker-30`, `config-01`/`config-02`) are outside it: their
`aism_behavior` fields are backed by direct reads of the AISM source cited in each row
(argument.py / check-provenance.py), not by harness execution, and the two config fixtures have
no AISM counterpart to run at all. The table's totals are deliberately left at the M0 cohort's
92 rather than restated.)

(Scope note, 2026-08-03, rk-wkzh: the refs row is updated to 11/11 to keep the per-gate fixture
count truthful, but `refs-09`/`refs-10`/`refs-11` are outside the M0 cohort on the same footing as
the M1-repair-wave fixtures above — their `aism_behavior` fields are backed by a direct read of
`check-refs.py`'s logic (advisory locus, whole-file substring search, `skip_noquote` WARN) as
recorded in `docs/memos/2026-08-03-aism-postmortem/07-refs-report.md`, where I2 is documented as
*observed live and still green*, not by a fresh harness execution. The `total` row stays at the
M0 cohort's 92.)

(Scope note, 2026-08-14, rk-r0j3: the refs row is deliberately left at 11/11. Gate 3 now has 22
fixtures, but `refs-12`..`refs-22` have no AISM counterpart to run at all — the argument-shard
citation grammar, the extraction layer, and `sources.lock.json` itself are rk constructs
(`check-refs.py` reads only `proofs/<ws>/externals/*.json` and greps raw payload bytes). Their
`aism_behavior: differs` fields are backed by direct reads of that script, as the rows record.
This follows the convention rk-we5i set when it added `refs-17`..`refs-20`; the `total` row stays
at the M0 cohort's 92.)

(Scope note, 2026-08-14, rk-z93m: the runs row is updated to 10/10 on the same footing —
`runs-09`/`runs-10` are outside the M0 cohort, and their `aism_behavior` fields are backed by a
direct read of `check-runs.py:46-50` (WARN on any non-directory at the `runs/` top level other
than `README.md`) plus the live campaign-D observation, not by a fresh harness execution. AISM has
no probe channel at all, so there is nothing there to run these trees against. The `total` row
stays at the M0 cohort's 92.)

`shards-14` (R12, bead rk-psm) was script-validated 2026-07-18: `check-report-shards.sh` run
directly against `corpus/shards/shards-14/repo` (`GIT_CEILING_DIRECTORIES` pinned to rk's own
toplevel, per the Validation methodology below) exits 0 — AISM's script hardcodes `PREFIX="AISM"`
and never requires per-repo configuration, so this fixture's golden `AISM-01-INTRO` content passes
cleanly against it. rk's contract requires the config-missing ERROR regardless (a general tool
must never silently adopt a campaign-specific default) — confirmed `differs`, triage
rk-stricter-intended.

`linker-24` (rk-aft, missing `kind:` field) was script-validated 2026-07-18 (rk-4uw) via the
module-import harness: `argument.exec_module` imported read-only, `ARG_DIR`/`DEFS_DIR`/
`PROOFS_DIR` patched to `corpus/linker/linker-24/repo`, `parse_registry(ARG_DIR)` called directly
— returns the shard with `errors == []`, and the full non-generate composition (argument.py:
679-702) also produces zero errors/warnings, exit 0. Confirms ratified ruling (d) empirically:
AISM's enum check (`if fm.get("kind") and fm["kind"] not in KINDS:`, argument.py:141 in the
current checkout — cited `argument.py:139` in the ruling text, a two-line drift, same statement)
is a no-op when `kind` is absent entirely. See `corpus/linker/linker-24/expected.json`'s
`aism_behavior` field for the full citation.

`linker-22`/`linker-23` (rk-co2 node_amended fix, 2026-07-18) are counted under `same`: both
ledgers were built from a REAL `af init` + `af amend` workspace (not hand-stubbed JSON), and `af
get 1` against each was confirmed to return the amended statement rk's fixed `introspectWorkspace`
now also returns — verified byte-for-byte, same methodology as `linker-12`/`-17..-20`.
