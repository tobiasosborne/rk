<!-- ROLE: committed triage record — M0.3 acceptance run (rk-g7h). rk check on AISM HEAD +
     3-tree robustness run, every divergence triaged per CLAUDE.md L5. UPDATE POLICY:
     append-only; supersede with a new dated file if re-run. TRIGGER: read by the M0.3
     milestone review (rk-4wm) and by whoever fixes the rk-bug filed below. -->

# AISM divergence triage — M0.3 acceptance (2026-07-18)

Analysis run, no rk source changed. Authority: `docs/gate-contracts.md` is normative;
AISM is characterized prior art, not a golden master (CLAUDE.md L5). AISM is read-only —
historical trees were extracted with `git archive | tar -x` into a scratchpad, never
checked out in place. The comparison baseline for every divergence is **AISM's HEAD
scripts** (`scripts/*.py` at AISM commit `6baf521`) replayed against the tree under test,
per `docs/gate-contracts.md` Gate 2 "The M0.3 robustness run is defined as follows" — never
the contemporaneous script version that existed at each historical commit.

## Run metadata

- rk commit: `34203edd8fd389212b6dd11c32acb9315a179d6e`
- rk command: `bun run src/cli.ts check --root <tree>`
- AISM baseline command (per-gate): `python3 scripts/<gate>.py --check` and
  `python3 scripts/argument.py --check`, with AISM-HEAD `scripts/argument.py` +
  `af_constants.py` overlaid onto each extracted historical tree (scratch copies) so the
  HEAD renderer/introspector is the baseline, not the contemporaneous one.
- `af` binary: present on PATH (`/home/tobiasosborne/go/bin/af`); AISM's `af_introspect`
  is therefore live for the baseline.

| tree | AISM commit | date | argument shards | schema notes |
|---|---|---|---|---|
| HEAD | `6baf521` | 2026-07-16 | 200 | current schema (`routes:` + `workspace:` populated) |
| early | `1521afe` | 2026-07-03 | 31 | pre-`routes:` (0 shards); `workspace:` present but sparse |
| mid | `bdf6800` | 2026-07-10 | 153 | `routes:` introduced here (aism-3ne, OR-route); `lem-hx-financing-floor` shard does not exist yet |
| late | `0371dd8` | 2026-07-13 | 180 | modern schema; `lem-hx-financing-floor` present with amended ledger |

Selection rationale: the three trees straddle the two mid-campaign schema additions the
robustness run targets. `1521afe` predates `routes:` entirely (tests the backward-compat
`routes: []` reduction and the older generated-file renderer). `bdf6800` is the exact
commit that introduced `routes:` (mixed population: 1 routes shard among 153, exercising
the routes-present / routes-absent coexistence). `0371dd8` is a mature modern-schema tree
short of HEAD. `workspace:` is present from AISM's first commit but sparsely populated
across this span, so all three also exercise the `af != none`/`workspace:`-population path.

## HEAD (`6baf521`) — coverage, counts, and baseline comparison

`rk check` exit 1 (>=1 ERROR). Per-gate, rk vs AISM-HEAD baseline:

| gate | rk coverage | rk err / warn | AISM err / warn | agree? |
|---|---|---|---|---|
| defs | 19/19 shards | 0 / 10 | 0 / 10 | yes |
| refs | 0/23 byte-verified, 23 import-skipped | 0 / 0 | 0 / 0 (`23 skipped`) | yes |
| linker | 200/200 lemma shards | **1** / 6 | **0** / 6 | **NO (+1 ERROR)** |
| runs | 38/38 run bundles | 0 / 0 | 0 / 0 | yes |
| provenance | 200/200 results, 62 claim rows, 31 tab:status rows | 0 / 139 | 0 / 139 | yes |
| shards | 23/23 included/labeled/cataloged | 0 / 0 | 0 / 0 | yes |

Warning total: rk 155, AISM 155 — exact parity (defs 10 `status=draft`, provenance 139
[138 unanchored-but-whitelisted + 1 untracked source payload `AF-LEM-HALO-COLLAPSE`],
linker 6 REFACTOR/brittleness). The 6 linker REFACTOR warnings are byte-for-byte identical
to AISM's own `argument.py --check` output (>26-node brittleness cap, aism-s64-realigned).

**No rk-silence:** there is nothing AISM's HEAD scripts flag that rk does not. rk's finding
set at HEAD is a strict superset of AISM's, the only extra being the single linker ERROR
below.

Benign coverage-granularity note (not a finding divergence): the provenance coverage line
differs in sub-metric — rk prints `31 tab:status rows`, AISM prints `102 tex labels`. Both
agree on 62 claim rows, 0 errors, 139 warnings. rk's `tab:status` row count is the F3
Fable-review addition (loud coverage on the status table); it is additional signal, not a
disagreement.

## The one HEAD divergence — linker contract-drift ERROR (rk-bug)

```
ERROR argument/lemmas/lem-hx-financing-floor.md:1 contract drift:
  lem-hx-financing-floor — af root conjecture != registry contract
```

Classification: **rk-bug** (rk reports an ERROR on contract-*valid* content).

Evidence chain:

1. rk (`src/gates/linker-graph.ts:158`, Check 9) and AISM (`argument.py:246`) use the
   identical normalized comparison `normalize(ws_root) != normalize(registry.contract)`
   with equivalent `normalize` (`" ".join(s.split())`, `argument.py:64-65` /
   `linker-graph.ts:23`). The check logic is a faithful port; the divergence is upstream,
   in how the af-root statement is obtained.
2. The registry contract for `lem-hx-financing-floor` reads `... all reals A > 0 and
   Lambda > 0 ...` (quantifier correction applied 2026-07-10 W61, recorded in the shard's
   own `provenance:` field).
3. AISM obtains the af root via `af get 1 -d <ws> -f json` (`argument.py:af_introspect`,
   ~531). `af` replays the full event ledger, so it returns the **amended** node-1
   statement `... all reals A > 0 and Lambda > 0 ...`, which normalize-equals the registry
   contract. AISM therefore reports **no drift** (0 errors at HEAD, verified).
4. rk obtains the af root via `introspectWorkspace` (`src/gates/linker-workspace.ts:40-68`),
   which replays only `proof_initialized.conjecture` and `node_created` (`node.id == "1"`)
   events. It has **no handler for `node_amended`**. The ledger
   `proofs/lem-hx-financing-floor/ledger/000043.json` is a `node_amended` on `node_id: 1`
   whose `new_statement` is the corrected `A > 0 and Lambda > 0` and whose
   `previous_statement` is the pre-correction `A, Lambda > 0`. rk reads the stale
   `node_created` text (`= previous_statement`) and misses the amendment.
5. Confirmed at the byte level: the amended `new_statement` normalize-equals the registry
   contract (`True`); the original `previous_statement` does not (`False`). The only
   textual difference is `A, Lambda > 0` (stale) vs `A > 0 and Lambda > 0` (current).

This is not `rk-stricter-intended`: the registry contract and the *actual current* af root
statement agree; there is no drift to catch. rk's ledger replay is simply reading a
superseded value. It is not `ambiguous`: `af`'s event-sourcing semantics make
`node_amended` authoritative over the original `node_created`, and rk's own workspace
introspector is meant to mirror `af get`.

Blast radius: `lem-hx-financing-floor` is the **only** AISM workspace (HEAD) with a
`node_amended` event on node `1` (root); scanned all `proofs/*/ledger/`. So the bug
produces exactly one false ERROR wherever that shard exists with its post-amendment ledger.

Filed: **rk-co2** (P1) — see "Beads filed".

## Robustness run (3 historical trees)

Acceptance criteria (`docs/gate-contracts.md` Gate 2): (1) no crashes, (2) no finding-floods
(>25 findings from one check on one tree, or a check erroring on a majority of its units,
un-attributed to a single triaged root cause), (3) every divergence from the AISM-HEAD
baseline triaged.

| tree | rk exit | crash? | flood? | rk ERRORs | AISM-HEAD baseline ERRORs | divergence |
|---|---|---|---|---|---|---|
| `1521afe` | 1 | no | no (13 output lines) | 1 (`argument/DAG.md STALE`) | 1 (`DAG.md is STALE`) | none — parity |
| `bdf6800` | 0 | no | no (121 lines) | 0 | 0 | none — parity |
| `0371dd8` | 1 | no | no (145 lines) | 1 (contract drift) | 0 | 1 — same rk-bug as HEAD |

Robustness verdict: **3/3 no crashes, 3/3 no floods — PASS.**

Per-tree detail:

- **`1521afe`** (early). rk: `argument/DAG.md STALE` ERROR + 3 REFACTOR warns; defs 9/9,
  refs 0/3 import-skipped, runs 6/6, provenance 31/31, shards 9/9, all clean. The
  contemporaneous 2026-07-03 `argument.py` reports 0 errors on its own committed `DAG.md`
  (it rendered it) — but that is the *wrong* baseline. AISM's **HEAD** `argument.py` run
  against this tree **also** flags `DAG.md is STALE` (1 error, 3 warns), because the
  HEAD-era `render_dag` diverges from the 2026-07-03 committed file (renderer evolved:
  OR-route rendering, legend, brittleness cap 12->26). rk matches the AISM-HEAD baseline
  exactly (same 1 ERROR, same 3 REFACTOR warns — the 26-node cap drops
  `obs-height-collapse` at 19 nodes, which the old 12-cap script warned on). Classification:
  **true-finding-in-AISM**, full parity with the mandated baseline. Not a divergence.
- **`bdf6800`** (routes introduced). rk exit 0, fully clean: linker 0/6, provenance 0/97,
  defs 0/10, all others 0/0. AISM-HEAD baseline: 0 errors, 6 warns — parity. The
  `routes:`-absent shards reduce byte-identically to pre-routes behavior (no spurious
  ERROR/WARN on the 152 routes-less shards), confirming the backward-compat path. The
  contract-drift rk-bug does **not** fire here because `lem-hx-financing-floor` does not
  exist at this commit.
- **`0371dd8`** (late). rk: same single contract-drift ERROR on `lem-hx-financing-floor`
  as HEAD; everything else clean/parity (linker 6 warns, provenance 119 warns, etc.).
  AISM-HEAD baseline: 0 errors (`af get 1` returns the amended statement). Divergence =
  the identical rk-bug (missing `node_amended` handling), same root cause, blast radius 1
  shard. No new bug class.

## Triage table (all divergences, all trees)

| finding | tree(s) | classification | evidence |
|---|---|---|---|
| linker contract drift `lem-hx-financing-floor` | HEAD, `0371dd8` | **rk-bug** | `introspectWorkspace` (`linker-workspace.ts:40-68`) ignores `node_amended`; ledger `000043.json` amends node 1 to match the registry; `af get 1` (AISM baseline) returns the amended text -> 0 drift. Single root cause, 1 shard. |
| `argument/DAG.md STALE` | `1521afe` | true-finding-in-AISM | AISM-HEAD `argument.py --check` on the same tree also flags it (1 error); HEAD renderer != 2026-07-03 committed file. Parity, not a divergence. |
| defs 10x `status=draft` WARN | HEAD, `bdf6800`, `0371dd8` | true-finding-in-AISM | `check-defs.py` emits identical 10 warns (`defs-13` fixture class); advisory, contract-conformant. |
| linker 6x REFACTOR (>26 nodes) WARN | HEAD, `bdf6800`, `0371dd8` | true-finding-in-AISM | byte-identical to `argument.py --check`; aism-s64-realigned cap. |
| provenance 138x unanchored-but-whitelisted WARN | HEAD | true-finding-in-AISM | `check-provenance.py` emits identical count (remediation item 9; `provenance-05` class). |
| provenance 1x untracked source payload `AF-LEM-HALO-COLLAPSE` WARN | HEAD | true-finding-in-AISM | payload absent from snapshot; hash-unverifiable-here WARN, contract-conformant. |
| refs 23/23 import-skipped, 0 byte-verified | all | true-finding-in-AISM | externals are af-lemma imports (`provenance: null`, no quote); `check-refs.py` reports `23 skipped`. rk reports coverage loudly (not the aism-dbq false-green). |
| provenance coverage sub-metric (`tab:status rows` vs `tex labels`) | HEAD, `0371dd8` | not a divergence | rk adds F3 tab:status coverage; err/warn/claim-row counts identical. |

## Candidate AISM-side fixes / waivers for M0.5

The single true content defect surfaced (not counting the rk-bug) is on the AISM side and is
a real latent inconsistency worth flagging into the staged cutover:

1. **`lem-hx-financing-floor` root-vs-registry latent match-by-luck.** The registry contract
   matches the af root only because `af`'s live replay applies `node_amended`; the ledger's
   original `node_created` text is stale. This is not an AISM *gate* failure (AISM's gate
   reads live `af get`), but it means the raw ledger's node-1 `node_created` record no longer
   reflects the contract. No AISM-side fix required for correctness; noted so M0.5 does not
   mistake rk's (buggy) ERROR here for a real AISM drift. **Waiver candidate:** none needed —
   this is an rk-bug, not an AISM defect.
2. **Generated-file staleness across schema epochs (`1521afe` DAG.md).** Expected and
   correct: old committed generated files are stale against the current renderer. No AISM
   fix; this is a property of the staleness gate, and a real repo running current rk would
   regenerate. No waiver needed for cutover; flagged only so the M0.5 parallel-run does not
   treat historical-tree STALE as a regression.

No AISM-side code change is required by this triage. The lone actionable defect is rk-internal.

## rk-bug count: 1

Single root cause: `introspectWorkspace` (`src/gates/linker-workspace.ts:40-68`) does not
apply `node_amended` ledger events, so it reports superseded root statements and false
contract-drift ERRORs. Manifests as exactly one false ERROR (`lem-hx-financing-floor`) on
every tree where that shard exists with its post-amendment ledger (HEAD, `0371dd8`).

- ambiguous-escalate count: 0
- crash count: 0
- finding-flood count: 0

## Beads filed

- **rk-co2** (P1): rk-bug — `introspectWorkspace` ignores `node_amended`; false linker
  contract-drift ERROR on `lem-hx-financing-floor`. Fix: replay `node_amended` (apply
  `new_statement` to the matching `node_id`) so the root statement mirrors `af get 1`.
  Add a corpus fixture (ledger with a `node_amended` on node 1 that reconciles a
  registry/`node_created` mismatch; expected verdict PASS). Do not fix in this analysis
  dispatch. Flagged for the rk-4wm M0.3 milestone review.
