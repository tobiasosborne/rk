<!-- ROLE: committed triage record — M0.3 acceptance RERUN (rk-g68), post-fix. SUPERSEDES
     docs/reviews/2026-07-18-aism-divergence-triage.md (that file's UPDATE POLICY:
     "append-only; supersede with a new dated file if re-run" — this is that file).
     Addresses M0.3 milestone-review findings 8 (flood attribution) and 9 (pre-fix pin).
     UPDATE POLICY: append-only; supersede with a new dated file if re-run. TRIGGER: read by
     the reopened M0.3 milestone review (rk-4wm) and whoever consumes the M0.5 cutover list. -->

# AISM divergence triage — M0.3 acceptance RERUN (2026-07-18, v2)

**This report SUPERSEDES `docs/reviews/2026-07-18-aism-divergence-triage.md`** (the "v1"
report), per that file's own supersession clause. It exists because v1 was pinned to the
pre-fix rk commit `34203ed` and concluded `rk-bug count: 1`, and because v1's no-flood
ruling did not attribute the historical provenance-WARN sets against the contract's own
>25-findings-per-check threshold (milestone-review findings 9 and 8 respectively,
`docs/reviews/2026-07-18-m0.3-milestone-review-codex.md`). Both are resolved below.

Analysis run: **no rk source changed**. Authority: `docs/gate-contracts.md` is normative;
AISM is characterized prior art, not a golden master (CLAUDE.md L5; TJO/bd directive). AISM
is read-only — HEAD was checked in place; the three historical trees were extracted with
`git -C ../almost-idempotent-stochastic-maps archive <commit> | tar -x -C <scratch>`, never
checked out in place. rk findings *on* AISM are a success of the tool, not a defect of it.

## What changed since v1

- rk fixed the single v1 rk-bug: commit `3bfca87` (bead **rk-co2**, now CLOSED) taught
  `introspectWorkspace` (`src/gates/linker-workspace.ts`) to replay `node_amended` ledger
  events, mirroring `af get 1`'s full-ledger replay. The false linker contract-drift ERROR
  on `lem-hx-financing-floor` is gone at both HEAD and `0371dd8`.
- Coverage-truthfulness rework since v1 changed several gate coverage *wordings* (rk-v18,
  rk-1tt, rk-6r3, rk-399, rk-6vw). These are report-only deltas, itemized in the triage
  table; none change a verdict.

## Run metadata

- rk commit: `9f68bce39a00bb974d1547192cae7613beacc93a` (post-fix; `3bfca87` and the
  coverage rework are ancestors).
- rk command: `bun run src/cli.ts check --root <tree>`.
- AISM-HEAD baseline command (per-gate, HEAD tree only, re-verified live):
  `python3 scripts/check-provenance.py --check` etc. at AISM commit `6baf521`.
- `af` binary: present on PATH (`/home/tobiasosborne/go/bin/af`); AISM's `af_introspect`
  is live for the baseline.

| tree | AISM commit | date | argument shards | schema notes |
|---|---|---|---|---|
| HEAD | `6baf521` | 2026-07-16 | 200 | current schema (`routes:` + `workspace:` populated) |
| early | `1521afe` | 2026-07-03 | 31 | pre-`routes:` (0 routes shards); no `report/UNWIRED.md` yet |
| mid | `bdf6800` | 2026-07-10 | 153 | `routes:` introduced here (aism-3ne); `lem-hx-financing-floor` does not exist yet |
| late | `0371dd8` | 2026-07-13 | 180 | modern schema; `lem-hx-financing-floor` present with amended ledger |

Same three trees v1 used; selection rationale unchanged (they straddle the two
mid-campaign schema additions the robustness run targets — see v1 §"Run metadata").

## Per-gate results

Exact coverage lines and finding counts from this rerun. Bracketed `[Δ]` marks a
report-only wording change vs v1 (triage table below); `[✓fix]` marks a verdict change
from the `node_amended` fix.

### HEAD (`6baf521`) — `rk check` exit **0**

| gate | rk coverage line | err / warn |
|---|---|---|
| defs | 19/19 shards | 0 / 10 |
| refs | 0/23 externals byte-verified, 0 failed, 23 import-skipped, 0 no-quote-skipped `[Δ]` | 0 / 0 |
| linker | 200/200 lemma shards | **0** / 6 `[✓fix]` |
| runs | 38/38 run bundle(s) | 0 / 0 |
| provenance | 200/200 registry results, 0 frontmatter-invalid, 62 claim rows, 31 tab:status rows `[Δ]` | 0 / 139 |
| shards | 23/23 shard(s) fully conforming (included, labeled, cataloged) `[Δ]` | 0 / 0 |

Total: **0 ERROR / 155 WARN.** v1 reported 1 ERROR / 155 WARN. The removed ERROR is the
`node_amended` rk-bug. AISM-HEAD baseline (`check-provenance.py`, live): `200 registry
results, 62 claim rows, 102 tex labels — 0 errors, 139 warnings`, of which 138 are
`unanchored but whitelisted` — **byte-parity** with rk's provenance gate. rk's finding set
at HEAD is now exactly equal to AISM's (was: strict superset by the one false ERROR).

### `1521afe` (early) — `rk check` exit **1**

| gate | rk coverage line | err / warn |
|---|---|---|
| defs | 9/9 shards | 0 / 0 |
| refs | 0/3 externals byte-verified, 0 failed, 3 import-skipped, 0 no-quote-skipped | 0 / 0 |
| linker | 31/31 lemma shards | **1** / 3 |
| runs | 6/6 run bundle(s) | 0 / 0 |
| provenance | 31/31 registry results, 0 frontmatter-invalid, 31 claim rows, 0 tab:status rows | 0 / 0 |
| shards | 9/9 shard(s) fully conforming | 0 / 0 |

Total: **1 ERROR / 3 WARN.** The ERROR is `argument/DAG.md is STALE`. Unchanged from v1:
AISM-HEAD `argument.py --check` on this same tree also flags DAG.md STALE (HEAD renderer !=
2026-07-03 committed file). **true-finding-in-AISM**, full parity, not a divergence. No
`UNWIRED.md` exists at this commit, so provenance emits 0 anchor WARNs (see flood section).

### `bdf6800` (routes introduced) — `rk check` exit **0**

| gate | rk coverage line | err / warn |
|---|---|---|
| defs | 19/19 shards | 0 / 10 |
| refs | 0/19 externals byte-verified, 0 failed, 19 import-skipped, 0 no-quote-skipped | 0 / 0 |
| linker | 153/153 lemma shards | 0 / 6 |
| runs | 30/30 run bundle(s) | 0 / 0 |
| provenance | 153/153 registry results, 0 frontmatter-invalid, 57 claim rows, 31 tab:status rows | 0 / 97 |
| shards | 21/21 shard(s) fully conforming | 0 / 0 |

Total: **0 ERROR / 113 WARN.** Clean exit; the `routes:`-absent shards reduce
byte-identically to pre-routes behavior (no spurious finding on the 152 routes-less shards).
`lem-hx-financing-floor` does not exist here, so the (now-fixed) drift bug never applied.

### `0371dd8` (late) — `rk check` exit **0** `[✓fix]`

| gate | rk coverage line | err / warn |
|---|---|---|
| defs | 19/19 shards | 0 / 10 |
| refs | 0/23 externals byte-verified, 0 failed, 23 import-skipped, 0 no-quote-skipped | 0 / 0 |
| linker | 180/180 lemma shards | **0** / 6 `[✓fix]` |
| runs | 35/35 run bundle(s) | 0 / 0 |
| provenance | 180/180 registry results, 0 frontmatter-invalid, 62 claim rows, 31 tab:status rows | 0 / 119 |
| shards | 23/23 shard(s) fully conforming | 0 / 0 |

Total: **0 ERROR / 135 WARN.** v1 reported 1 ERROR (the same contract-drift rk-bug) and
exit 1. The `node_amended` fix removed it; rk now matches the AISM-HEAD baseline (0 errors)
on this tree. This is the only verdict change across all four trees.

## Robustness-run acceptance (Gate 2, `gate-contracts.md:425–452`)

Three criteria: (1) no crashes on any tree, (2) no finding-floods, (3) every divergence
from the AISM-HEAD baseline triaged.

- **(1) Crashes: 0/4.** All four outputs contain only `WARN`/`ERROR`/`checked`/verdict
  lines — no stack traces, no partial gate output, no dropped coverage lines. All six gates
  reported coverage on every tree.
- **(3) Divergences:** the sole HEAD/`0371dd8` divergence from v1 (the drift ERROR) is
  gone; no new divergence appeared. Triage table below.
- **(2) Floods:** attributed per bucket in the next section.

## Flood attribution (milestone-review finding 8)

**Threshold (`gate-contracts.md:446`):** a flood is *a single check emitting more than 25
findings on one tree*, OR *a check erroring on a majority of its checked units* — **unless
every one of those findings is attributable to a single triaged root cause** (the
worked example in the contract: one schema-drift field absent across every shard, triaged
once, not per-shard). v1 declared "3/3 no floods" without doing this attribution for the 97
(`bdf6800`) and 119 (`0371dd8`) provenance WARN sets. Below, every WARN set is bucketed by
emitting check and each bucket is attributed or the criterion is failed.

WARN counts were bucketed by message template (identifiers collapsed) across all four
trees. Every bucket maps to exactly one provenance/defs/linker sub-check:

| bucket (emitting check) | HEAD | `bdf6800` | `0371dd8` | `1521afe` | >25 on any tree? | root-cause attribution |
|---|---:|---:|---:|---:|---|---|
| `unanchored but whitelisted in report/UNWIRED.md` — provenance check 6 (anchor), `provenance.ts:113–118`, ports `check-provenance.py:349–365` | 138 | 96 | 118 | 0 | **YES** | **Attributed.** Single condition: the campaign maintains a large backlog of research lemmas/conjectures intentionally OFF the paper track, enumerated in `report/UNWIRED.md`. Check 6 emits exactly one advisory WARN per whitelisted id — loud coverage of the whitelist, not N independent defects. Grounded 1:1: HEAD `UNWIRED.md` has 161 lines / 138 whitelisted ids matched, `bdf6800` 96, `0371dd8` 118; `1521afe` has **no** `UNWIRED.md` and correspondingly emits **0** such WARNs. AISM's own `check-provenance.py` (HEAD, live) emits the identical 138 — byte-parity. This is the contract's exact "one condition, N units, triaged once" exception shape. **NOT a flood.** |
| `status=draft (not yet consensus-gated)` — defs check, advisory | 10 | 10 | 10 | 0 | no | Single condition: 10 definition shards at `status: draft`. Advisory, contract-conformant (`defs-13` fixture class). Under threshold regardless. |
| `REFACTOR: proofs/<id> has N nodes (>26)` — linker brittleness cap | 6 | 6 | 6 | 3 | no | Single condition: proofs exceeding the ratified 26-node brittleness cap (aism-s64-realigned). 6 large proofs at the modern trees, 3 at the early tree. Byte-identical to `argument.py --check`. Under threshold. |
| `N source payload(s) not hash-verifiable here … AF-LEM-HALO-COLLAPSE` — provenance check (hash-verify), `provenance-checks.ts:68` | 1 | 1 | 1 | 0 | no | Single payload absent from the snapshot; advisory WARN, contract-conformant. Under threshold. |

**No bucket resists single-root-cause attribution.** The only bucket exceeding 25 on any
tree is the UNWIRED-whitelist anchor bucket, and it is fully attributed to one condition
(and independently corroborated by AISM's own baseline and by its absence on the
`UNWIRED.md`-less tree). No check errors on a majority of its units (0 ERRORs on three of
four trees; the one ERROR on `1521afe` is a single cross-file DAG.md check).

**Flood criterion verdict, per tree: PASS (HEAD), PASS (`1521afe`), PASS (`bdf6800`),
PASS (`0371dd8`) — 4/4.** This time by explicit per-bucket attribution, not by bare
baseline-parity assertion.

## Triage table — all deltas vs v1 and all standing divergences

| finding | tree(s) | classification | evidence |
|---|---|---|---|
| linker contract-drift ERROR `lem-hx-financing-floor` **REMOVED** | HEAD, `0371dd8` | resolved rk-bug (was the v1 count-of-1) | Fixed in `3bfca87` (rk-co2 CLOSED); `introspectWorkspace` now replays `node_amended`, matching `af get 1`. Both trees now exit with 0 linker errors, at parity with the AISM-HEAD baseline. Corpus fixtures `linker-22`/`linker-23` pin both directions, mutation-proven. |
| provenance coverage line adds `0 frontmatter-invalid` + `registry results` denominator | HEAD, `bdf6800`, `0371dd8`, `1521afe` | report-only (rk-v18) | Coverage-truthfulness rework: denominator = raw registry inputs, malformed shards now visibly counted (0 here). No verdict/count change. |
| shards coverage reworded to `N/N shard(s) fully conforming (included, labeled, cataloged)` | all | report-only (rk-1tt) | Numerator semantics clarified to "fully conforming" under cross-file ERRORs. No verdict change (0 shard errors on all trees). |
| refs coverage line expanded (`failed`/`import-skipped`/`no-quote-skipped` sub-counts) | all | report-only | Loud coverage of skip reasons. Behavior unchanged: all externals are af-lemma imports (`provenance: null`), import-skipped, never false-green. |
| `argument/DAG.md STALE` ERROR | `1521afe` | true-finding-in-AISM | AISM-HEAD `argument.py --check` flags it too; HEAD renderer != 2026-07-03 committed file. Parity, not a divergence. Unchanged from v1. |
| defs 10× `status=draft` WARN | HEAD, `bdf6800`, `0371dd8` | true-finding-in-AISM | Identical to `check-defs.py`; advisory, contract-conformant. |
| linker 6×/3× REFACTOR (>26 nodes) WARN | all | true-finding-in-AISM | Byte-identical to `argument.py --check`; aism-s64-realigned cap. |
| provenance unanchored-but-whitelisted WARN (138/96/118) | HEAD, `bdf6800`, `0371dd8` | true-finding-in-AISM | Byte-parity with `check-provenance.py`; `UNWIRED.md` whitelist coverage. See flood section. |
| provenance 1× untracked source payload `AF-LEM-HALO-COLLAPSE` WARN | HEAD, `bdf6800`, `0371dd8` | true-finding-in-AISM | Payload absent from snapshot; hash-unverifiable-here WARN, contract-conformant. |

**New divergences vs v1: 0.** No new or changed finding requiring `{true-finding | rk-bug |
ambiguous}` triage appeared; the delta set is (a) one removed rk-bug and (b) coverage-line
wording changes, all report-only.

## Counts

- **rk-bug count: 0.** (v1: 1; fixed in `3bfca87`.)
- ambiguous-escalate count: 0.
- crash count: 0.
- finding-flood count: 0 (4/4 trees pass, by explicit per-bucket attribution).

## M0.5 candidate AISM-side fixes / waivers

No AISM-side code change is required by this triage. Items carried for the staged cutover
so the M0.5 parallel-run does not mistake expected behavior for a regression:

1. **`lem-hx-financing-floor` root-vs-registry match depends on `node_amended` replay.** The
   registry contract matches the af root only because the live ledger replay applies
   `node_amended`; the raw `node_created` record for node 1 is stale (`A, Lambda > 0` vs the
   corrected `A > 0 and Lambda > 0`). Not an AISM *gate* failure (both AISM and now rk read
   the amended value). **No waiver needed** — resolved rk-side. Noted only so a reader does
   not resurrect the v1 false ERROR.
2. **Generated-file staleness across schema epochs (`1521afe` DAG.md).** Expected: old
   committed generated files are stale against the current renderer. Property of the
   staleness gate, not an AISM defect. No waiver; flagged so historical-tree STALE is not
   read as a regression during parallel-run.
3. **UNWIRED.md whitelist volume.** 138 off-paper-track lemmas at HEAD is a large advisory
   backlog. Not a defect (whitelisted, contract-conformant, AISM-baseline-parity), but the
   volume is real signal for the campaign: M0.5 may want to review whether the UNWIRED
   backlog should shrink. Informational only; no rk or gate action.

## Note on the v1 file

v1's UPDATE POLICY reads "append-only; supersede with a new dated file if re-run." This
file is that superseding dated file. A one-line `SUPERSEDED-BY` banner was added at the top
of v1 pointing here — the header's own supersession clause authorizes marking supersession,
and the banner adds no content to the append-only triage body (it only records that a
re-run occurred, which the policy explicitly anticipates).

## Beads

- **rk-co2** (P1, CLOSED): the v1 rk-bug, fixed in `3bfca87`. No reopen.
- **rk-g68** (P1, this task): superseding report — closed on commit of this file.
- No new beads filed: 0 rk-bugs, 0 crashes, 0 ambiguous escalations, 0 floods. Nothing
  discovered warrants a P1 or P2.
