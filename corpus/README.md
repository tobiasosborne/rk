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
| `linker-32` | argument/linker | critical-path node validated with NO parseable cross-vendor identity at all (`validated: true`, no `author`/`verified_by` recorded) ⇒ WARNING `legacy-same-family`, never ERROR | **M3.8**: the GRANDFATHERING golden case — PRD C9's standing directive that all 44 AISM workspaces are "codex-prover+codex-verifier ... not demoted." Ledger built with the machine's globally-installed PRE-V1 `af` binary (0.1.5, predating `../vibefeld`'s identity-provenance commits) — genuinely no `node.author`/`verified_by` fields, byte-shape-identical to a spot-check of AISM's own 44 workspaces' ledgers (0/44 carry these fields). Recommended cutover semantics: absence of a parseable seam = legacy = warning. | landed |
| `linker-33` | argument/linker | critical-path node validated via `af verdicts apply` carrying a `batch_id` (cross-family, so isolated from the same-family check) ⇒ WARNING naming the batch id | **M3.8**: PRD C3's critical-path exclusion, checked AFTER THE FACT (C2: "path membership changes when edges are added, not only at verdict-apply time"). Ledger built with a real `af` binary via the V2 kernel verb `af verdicts apply`, script-verified. `aism_behavior`: class-driven, no AISM counterpart (AISM's ledgers predate batch validation). | landed |
| `linker-34` | argument/linker | critical-path node validated cross-family (`author` family `claude`, `validated_by` family `gpt`, both parseable) ⇒ golden pass, zero findings | **M3.8**: proves the check does not false-positive on the case it exists to let through. Ledger built with a real `af` binary, script-verified. Sibling: `linker-31` (same shape, same family ⇒ ERROR). | landed |
| `linker-35` | argument/linker | `status: stated` shard with a fresh (hash-bound to current bytes) `VALID` `.rk/l5-verdicts.jsonl` record ⇒ WARN `L5 promotable` | **M3.8** deliverable 3: `src/drive/l5-promote.ts`'s `stated`→`proved-mod-audit` promotion, wired into Gate 2. `l5ContentHash` computed as the real `sha256sum` of the fixture's own shard file. `aism_behavior`: class-driven, no AISM counterpart (the L5 store is M3.7's own deliverable, first wired to a gate here). | landed |
| `linker-36` | argument/linker | `status: stated` shard whose `.rk/l5-verdicts.jsonl` record is bound to a DIFFERENT hash than the shard's current bytes (stale) ⇒ no promotion, zero findings | **M3.8** sibling of `linker-35`: an edited-since-verified shard is silent, not a defect. | landed |
| `linker-37` | argument/linker | `status: stated` shard with a FRESH `VALID-WITH-CORRECTION` record ⇒ no promotion (rule (g)), zero findings | **M3.8** sibling of `linker-35`/`l5-promote.test.ts`'s own mutation-proof: a fresh `VALID-WITH-CORRECTION` never promotes on the flagged bytes — nothing has independently re-verified the corrected bytes yet. | landed |
| `linker-38` | argument/linker | critical-path node, SAME shape as `linker-31` (post-convention same-family) but shard frontmatter carries `provenance: ...legacy-same-family` ⇒ WARNING, not ERROR | **M3.8**: the explicit grandfathering escape hatch (distinct from `linker-32`'s mechanically-detected "no parseable seam" path) — administratively-marked legacy data that happens to carry a parseable seam. Byte-identical ledger to `linker-31`; the marker alone flips the verdict. | landed |
| `refs-01` [PLAN] | refs | 19/19 false-green (all payloads absent) | aism-dbq: pre-fix, "the fabrication gate verifies nothing — 19/19 externals skip — and false-greens on a clean checkout" (`docs/plans/2026-07-10-project-remediation-plan.md:51`) | landed |
| `refs-02` | refs | fabricated quote, ≥40 chars | class-driven (no incident on record) | landed |
| `refs-03` | refs | fabricated quote, <40 chars | class-driven (no incident on record) | landed |
| `refs-04` | refs | IMPORT external golden case | class-driven (no incident on record) | landed |
| `refs-05` | refs | no-quote external (WARN) | class-driven (no incident on record) | landed |
| `refs-06` | refs | unparseable external JSON | class-driven (no incident on record) | landed |
| `refs-07` | refs | ≥40-char verbatim core wrapped in paraphrase (FAIL under whole-quote-match) | class-driven (no incident on record; zero refs-quote externals have ever existed in AISM history — a full history scan of `proofs/*/externals/*.json` finds none, so this is provably parity-free per the 2026-07-17 Fable review's flagged ruling #3) | landed |
| `refs-08` | refs | syntactically-valid non-object JSON external (`null`, array) — malformed-external ERROR, never a throw | **rk-6r3** / `docs/reviews/2026-07-18-m0.3-milestone-review-codex.md` finding 7: `refs.ts:138` cast a parsed JSON external without an object/null guard before reading `obj.source`, so a `null`/array external threw and killed the entire composed `rk check` (the finding's other half, `cli/check.ts:25`'s missing per-gate exception boundary, is covered by a `test/cli-check.test.ts` fault-injection test, not a separate fixture). AISM's own `check-refs.py` has the identical bug class — `check_refs`'s `d.get("name", f.stem)` (check-refs.py:180) raises an uncaught `AttributeError` on `d=None`, script-verified directly against this fixture. Triage: rk-stricter-intended. | landed |
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
| `runs-01` [PLAN] | runs | orphaned run bundle (not in INDEX.md) | class-driven (no incident on record) | landed |
| `runs-02` [PLAN] | runs | missing invariant | class-driven (no incident on record) | landed |
| `runs-03` | runs | bad bundle name | class-driven (no incident on record) | landed |
| `runs-04` | runs | missing README.md | class-driven (no incident on record) | landed |
| `runs-05` | runs | missing one required field (hypothesis/command/finding/next) | class-driven (no incident on record) | landed |
| `runs-06` | runs | stray top-level file (WARN) | class-driven (no incident on record) | landed |
| `runs-07` | runs | empty `runs/` golden case (day-1 green) | class-driven; baseline, not a violation | landed |
| `runs-08` | runs | empty run bundle DIRECTORY (exists, no README) ⇒ ERROR | **rk-399** / review finding 2 (BLOCKER): an empty bundle dir was invisible to file-prefix inference, reported 0/0 clean instead of ERROR-missing-README (`gate-contracts.md:862`). The gate now enumerates bundles from the `dirs` fact. Uses the empty-directory `.gitkeep` convention (see "Empty-directory fixtures" below); its red-first proof is the `test/gates/runs.test.ts` `dirs`-fact unit test, since a `.gitkeep`-populated bundle is coincidentally already caught by pre-fix inference. | landed |
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

Totals: 2 config + 15 defs + 38 argument/linker + 8 refs + 20 provenance + 8 runs +
15 report-shards + 11 freshness = **117 fixtures** across the eight gates named in
`docs/gate-contracts.md`'s per-gate tables (`config` and `freshness` are the two synthetic gates
with no AISM `check-all.sh` counterpart, added by rk-xbm and M2.6 respectively; both directories
are wired into `src/corpus/discovery.ts`'s `GATE_DIRS`).
`linker-31`..`linker-38` (+8 over the then-pinned 109) are M3.8 (worktree agent-a9b12837c0ead0e82,
cross-vendor rule + L5-promotion integration): Gate 2's new critical-path provenance check
(same-family POST-convention ERROR, no-parseable-seam legacy WARNING, batch-validated-on-critical-
path WARNING, cross-family golden pass, explicit legacy-marker WARNING) and the L5-promotion
check (fresh VALID promotes, stale/correction-pending do not) — see their own rows above and
`docs/gate-contracts.md` Gate 2's new "Critical-path provenance" / "L5 promotion" sections.
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
| `graph/conflict-fr-superseded` | `test/graph/corpus-conflict-fr-superseded.test.ts` | M2-review blocker 7 — a banked-without-oracle cycle superseded by a later cycle produces NO live conflict (superseded evidence is not promotion-bearing; the edge stays visible in `edges.fr`), while an unsuperseded sibling still conflicts. Mutation-proven red-first (93d00a2). | landed |

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
| refs | 8/8 | 6 | 2 (`refs-07`, whole-quote-match rule; `refs-08`, crash→ERROR — check-refs.py:180 uncaught AttributeError on null external, rk-stricter-intended) | 0 |
| provenance | 19/19 | 16 | 3 (`provenance-11`, hardcoded-filename incident; `provenance-17`, silent registry-parse denominator shrinkage — rk-stricter-intended; `provenance-18`, per-item-WARN flood — rk-stricter-intended) | 0 |
| runs | 8/8 | 8 | 0 | 0 |
| shards | 15/15 | 13 | 2 (`shards-14`, rk-stricter-intended, R12 shardsPrefix requiredness; `shards-15` report/-root-presence-conditional, contract amendment not a strictness triage, R13/rk-au6) | 0 |
| **total** | 92 (all script-validated) | 78 | 14 | 0 |

(Scope note, 2026-07-19: this script-validation table is the **M0 cohort** — the 92 fixtures that
existed when the AISM-script harness runs were performed. The 6 M1-repair-wave fixtures
(`provenance-20`, `linker-28`–`linker-30`, `config-01`/`config-02`) are outside it: their
`aism_behavior` fields are backed by direct reads of the AISM source cited in each row
(argument.py / check-provenance.py), not by harness execution, and the two config fixtures have
no AISM counterpart to run at all. The table's totals are deliberately left at the M0 cohort's
92 rather than restated.)

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
