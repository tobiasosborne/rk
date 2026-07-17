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
(M0.2) builds one minimal repo fixture per row below; `rk check --selftest` runs the corpus.

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
| `defs-01` | defs | missing/unterminated frontmatter | class-driven (no incident on record) | planned |
| `defs-02` | defs | frontmatter line without `:` | class-driven (no incident on record) | planned |
| `defs-03` | defs | missing required field (id/term/kind/status) | class-driven (no incident on record) | planned |
| `defs-04` | defs | `id` != filename stem | class-driven (no incident on record) | planned |
| `defs-05` | defs | bad `kind` enum value | class-driven (no incident on record) | planned |
| `defs-06` | defs | bad `status` enum value | class-driven (no incident on record) | planned |
| `defs-07` [PLAN] | defs | duplicate alias (DRIFT) | class-driven (no incident on record; the guard is preventive per `definitions/README.md:9-10`) | planned |
| `defs-08` | defs | `cited` shard, unknown source-id | class-driven (no incident on record) | planned |
| `defs-09` | defs | `cited` shard, sha256 not in manifest | class-driven (no incident on record) | planned |
| `defs-10` | defs | `cited` shard, sha under a different source (WARN) | class-driven (no incident on record) | planned |
| `defs-11` | defs | `cited` shard, payload absent locally (WARN) | class-driven (no incident on record) | planned |
| `defs-12` | defs | consensus/original shard missing `consensus:` | class-driven (no incident on record) | planned |
| `defs-13` | defs | `status: draft` golden case (WARN) | baseline, not a violation | planned |
| `defs-14` | defs | manifest file entirely absent (WARN) | class-driven; same shape as `refs-01` at smaller scale | planned |
| `linker-01` | argument/linker | missing/unterminated frontmatter | class-driven (no incident on record) | planned |
| `linker-02` | argument/linker | `id` != filename stem | class-driven (no incident on record) | planned |
| `linker-03` | argument/linker | bad `kind` enum value | class-driven (no incident on record) | planned |
| `linker-04` | argument/linker | bad `status` enum value | class-driven (no incident on record) | planned |
| `linker-05` | argument/linker | bad `af` enum value | class-driven (no incident on record) | planned |
| `linker-06` [PLAN] | argument/linker | dependency cycle | class-driven (no incident on record) | planned |
| `linker-07` | argument/linker | unknown `dep` id | class-driven (no incident on record) | planned |
| `linker-08` | argument/linker | unknown `routes` member id | class-driven (no incident on record) | planned |
| `linker-09` | argument/linker | unknown `defs` id | class-driven (no incident on record) | planned |
| `linker-10` | argument/linker | `af: validated` with unmet unconditional dep | class-driven (no incident on record) | planned |
| `linker-11` | argument/linker | `af: validated`, routes present, no route fully available | class-driven (no incident on record) | planned |
| `linker-12` [PLAN] | argument/linker | contract mismatch registry↔af-root | class-driven (no incident on record) | planned |
| `linker-13` | argument/linker | orphan: `af != none`, declared workspace dir missing | class-driven (no incident on record) | planned |
| `linker-14` | argument/linker | orphan: `proofs/<ws>` dir with no registry entry | class-driven (no incident on record) | planned |
| `linker-15` | argument/linker | `workspace:` field absent on `af != none` shard | 2026-07-10 remediation plan: `seed-af-workspaces.py`'s `flip_af_seeded` omitted `workspace:` on 62/151 shards (`docs/plans/2026-07-10-project-remediation-plan.md` Phase 0 item 2) | planned |
| `linker-16` [PLAN] | argument/linker | hand-edited generated file (`argument/INDEX.md`/`DAG.md` stale) | class-driven (no incident on record); this is the M0.2-mandatory "hand-edited generated file" fixture, assigned here not to `defs`/`shards` — see gate-contracts.md | planned |
| `linker-17` | argument/linker | brittleness WARN at 27 nodes | aism-s64: brittleness-cap drift (`af_constants.py:5-10`) — regression probe for the realigned cap | planned |
| `linker-18` | argument/linker | brittleness boundary golden case: 26 nodes, no warn | aism-s64 (boundary confirmed by AISM's own `test_argument.py:107-108`) | planned |
| `linker-19` | argument/linker | OR-route golden case: one route fully available | aism-3ne (OR-route feature, `bdf6800`) | planned |
| `linker-20` | argument/linker | schema-drift golden case: `routes:`-less shard, byte-identical behavior | aism-3ne backward-compat guarantee (`argument.py:77-78`) | planned |
| `refs-01` [PLAN] | refs | 19/19 false-green (all payloads absent) | aism-dbq: pre-fix, "the fabrication gate verifies nothing — 19/19 externals skip — and false-greens on a clean checkout" (`docs/plans/2026-07-10-project-remediation-plan.md:51`) | planned |
| `refs-02` | refs | fabricated quote, ≥40 chars | class-driven (no incident on record) | planned |
| `refs-03` | refs | fabricated quote, <40 chars | class-driven (no incident on record) | planned |
| `refs-04` | refs | IMPORT external golden case | class-driven (no incident on record) | planned |
| `refs-05` | refs | no-quote external (WARN) | class-driven (no incident on record) | planned |
| `refs-06` | refs | unparseable external JSON | class-driven (no incident on record) | planned |
| `provenance-01` [PLAN] | provenance | OVERCLAIM (registry `open` framed as proved) | class-driven; the gate's own header names this "the project's #1 guarded failure mode" (`check-provenance.py:24`) — no dated instance actually caught in AISM history, guarded preventively | planned |
| `provenance-02` | provenance | underclaim (proved framed only `open`, WARN) | class-driven (no incident on record) | planned |
| `provenance-03` [PLAN] | provenance | stale SHA256 (tracked source edited post-hash) | class-driven (no incident on record) | planned |
| `provenance-04` [PLAN] | provenance | unwired anchor (zero labels, not on UNWIRED.md) | 2026-07-10 remediation plan item 9: the anchor whitelist "turns 107 permanently-ignored warnings back into a regression gate" (`docs/plans/2026-07-10-project-remediation-plan.md:59-61`) | planned |
| `provenance-05` | provenance | whitelisted-unanchored (on UNWIRED.md, WARN) | same remediation item as `provenance-04` | planned |
| `provenance-06` | provenance | forward-label dangling | class-driven (no incident on record) | planned |
| `provenance-07` | provenance | claim-source token unresolved | class-driven (no incident on record) | planned |
| `provenance-08` | provenance | duplicate source key (WARN) | class-driven (no incident on record) | planned |
| `provenance-09` | provenance | reverse-label orphan (WARN) | class-driven (no incident on record) | planned |
| `provenance-10` | provenance | coverage: report-facing result with no per-claim row (WARN) | class-driven (no incident on record) | planned |
| `provenance-11` | provenance | hardcoded-filename regression probe | worklog.md 2026-07-04: "caught a false-green: `check-provenance.py` hard-coded the ledger filename" (`docs/worklog.md:270-272`) | planned |
| `provenance-12` | provenance | absolute source path (WARN) | class-driven (no incident on record) | planned |
| `runs-01` [PLAN] | runs | orphaned run bundle (not in INDEX.md) | class-driven (no incident on record) | planned |
| `runs-02` [PLAN] | runs | missing invariant | class-driven (no incident on record) | planned |
| `runs-03` | runs | bad bundle name | class-driven (no incident on record) | planned |
| `runs-04` | runs | missing README.md | class-driven (no incident on record) | planned |
| `runs-05` | runs | missing one required field (hypothesis/command/finding/next) | class-driven (no incident on record) | planned |
| `runs-06` | runs | stray top-level file (WARN) | class-driven (no incident on record) | planned |
| `runs-07` | runs | empty `runs/` golden case (day-1 green) | class-driven; baseline, not a violation | planned |
| `shards-01` | report-shards | oversized shard (>280 lines) | class-driven (no incident on record) | planned |
| `shards-02` | report-shards | duplicate `SHARD-ID` | class-driven (no incident on record) | planned |
| `shards-03` | report-shards | malformed `SHARD-ID` | class-driven (no incident on record) | planned |
| `shards-04` | report-shards | wrong `SHARD-SUMMARY` count | class-driven (no incident on record) | planned |
| `shards-05` | report-shards | orphan shard file (not `\include`d) | class-driven (no incident on record) | planned |
| `shards-06` | report-shards | duplicate `\include` | class-driven (no incident on record) | planned |
| `shards-07` | report-shards | `\include` outside `sections/` | class-driven (no incident on record) | planned |
| `shards-08` | report-shards | missing `SHARD_CATALOG.md` entry | class-driven (no incident on record) | planned |
| `shards-09` | report-shards | missing `README.md` entry | class-driven (no incident on record) | planned |
| `shards-10` | report-shards | body-sectioning command in `main.tex` | class-driven (no incident on record) | planned |
| `shards-11` | report-shards | empty-scaffold golden case | class-driven; baseline, not a violation | planned |
| `shards-12` | report-shards | non-empty scaffold, zero `\include`s | class-driven (no incident on record) | planned |

Totals: 14 defs + 20 argument/linker + 6 refs + 12 provenance + 7 runs + 12 report-shards = **71
fixtures** across the six M0 gates. Ten carry `[PLAN]` (IMPLEMENTATION_PLAN M0.2's mandatory
list): `defs-07` (duplicate alias), `linker-06` (dependency cycle), `linker-12` (contract
mismatch registry↔af-root), `linker-16` (hand-edited generated file), `refs-01` (19/19
false-green), `provenance-01` (overclaim), `provenance-03` (stale SHA256), `provenance-04`
(unwired anchor) — plus `runs-01` (orphaned run bundle) and `runs-02` (missing invariant). The
plan's "duplicate alias" item is `defs-07`; "missing invariant" is `runs-02`.
