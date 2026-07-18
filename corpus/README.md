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

Totals: 15 defs + 24 argument/linker + 8 refs + 18 provenance + 8 runs + 13 report-shards = **86
fixtures** across the six M0 gates named in `docs/gate-contracts.md`'s per-gate tables (recounted
2026-07-18, rk-4uw N4+N5: +2 over the previously-pinned 84 — `provenance-17`, this WP's new
frontmatter-invalid>0 fixture landed below, and `provenance-18`, ruling f's whitelisted-unanchored
aggregate fixture, which had already landed on disk with its own ledger row above but was not yet
reflected in the Totals line or the `EXPECTED_FIXTURE_COUNT`/corpus-count-assertion constants).
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
"report-shards" prose name used in `docs/gate-contracts.md`'s section headers). Two files:

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
uses, `src/gates/config-load.ts`); the corpus runner (`src/corpus/run.ts`'s `runFixture`,
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
all 86 fixtures, and not by itself a reason to assert on it). By that criterion:

| fixture | why | `docs/gate-contracts.md` anchor |
|---|---|---|
| `defs-14` | manifest absent ⇒ checks 8–9 coverage count must read `0/K`, not silently no-op | Gate 1 fixture table |
| `refs-01` | 19/19 false-green ⇒ coverage line must show `0` import/no-quote-skipped, not `N` silently-skipped | Gate 3 fixture table |
| `provenance-13` | status-table label absent ⇒ coverage line must show `0 tab:status rows` loudly (F3); the SAME coverage line also carries the rk-v18 registry-skip fix's `0 frontmatter-invalid` sub-count, so this one fixture's `unit_patterns` pins both deviations at once | Gate 4 fixture table + Gate 4 Divergences (rk-v18) |
| `provenance-17` | registry-parse frontmatter-invalid > 0 (one malformed shard among two) ⇒ coverage `checked`/`total` must show the honest raw-inputs denominator (`1/2`), not a silently-collapsed `1/1`; closes the gap this section used to flag as a known follow-up (rk-v18, N4) | Gate 4 fixture table + Gate 4 Divergences (rk-v18) |
| `runs-07` | empty `runs/` day-1 golden case, explicitly "asserts the coverage line still fires" | Gate 5 fixture table |
| `shards-07` | invalid `\include` target ⇒ the non-conforming shard identity counts in the denominator, never the numerator (`0/1`, not the pre-N3 `0/0`) | Gate 6 fixture table (N3) |
| `shards-08`, `shards-09` | coverage numerator must mean "fully conforming", not "examined" — a live CATALOG/README ERROR must still exclude the shard from `checked` (rk-1tt) | Gate 6 Divergences |

**Known gap CLOSED (rk-4uw, 2026-07-18, N4).** This section previously flagged that
`registrySkipReport`'s frontmatter-invalid-registry-shard path (rk-v18) had red-first proof only
at the unit-test level (`test/gates/provenance.test.ts`, git-stash mutation check), with no landed
corpus fixture driving `skipped.length > 0` — a live L2 gap (2026-07-18 M0.3 re-review, finding
4: "That conflicts directly with L2's fixture-per-failure-mode law"). `provenance-17` (above)
closes it: one valid lemma plus one lemma with no frontmatter at all, asserting both the aggregate
WARN and the honest `1/2` coverage denominator end-to-end through the corpus runner.

Every other fixture (the remaining 78 = 86 total − 8 with an asserted `coverage` expectation) is a
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
`PURITY: pure` and is exempt from the L3 purity grep, same as `src/gates/load.ts`/
`src/gates/config-load.ts`). `runFixture`/`runAllFixtures` (and their fixture-discovery sibling,
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

## Empty-directory fixtures (rk-399)

Git cannot store an empty directory, but two contract checks turn on directory existence
independent of any file inside: an empty run bundle must still ERROR on a missing README
(`gate-contracts.md:862`), and `report/sections/` must exist as a directory
(`gate-contracts.md:956`, `check-report-shards.sh:23`). `src/gates/load.ts` measures directory
existence (empty ones included) into the `dirs` SnapshotFact by walking the tree with
`readdirSync`, and the gates consume it via `dirExists`/`childDirs` (`src/gates/snapshot.ts`).

Convention: a fixture that needs a genuinely-empty directory to survive a `git clone` places a
single **`.gitkeep`** file in it. `load.ts` records the containing directory in `dirs` but
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
(WARN). `src/gates/load.ts` now hashes **every file present on disk** (full-tree walk, `.git`
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
| linker | 24/24 | 21 | 3 (`linker-15` message-only, `linker-21` crash→ERROR, `linker-24` missing-`kind` no-op — confirmed rk-stricter-intended by empirical harness run, rk-4uw, see below) | 0 |
| refs | 8/8 | 6 | 2 (`refs-07`, whole-quote-match rule; `refs-08`, crash→ERROR — check-refs.py:180 uncaught AttributeError on null external, rk-stricter-intended) | 0 |
| provenance | 18/18 | 15 | 3 (`provenance-11`, hardcoded-filename incident; `provenance-17`, silent registry-parse denominator shrinkage — rk-stricter-intended; `provenance-18`, per-item-WARN flood — rk-stricter-intended) | 0 |
| runs | 8/8 | 8 | 0 | 0 |
| shards | 13/13 | 13 | 0 | 0 |
| **total** | 86 (all script-validated) | 77 | 9 | 0 |

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
