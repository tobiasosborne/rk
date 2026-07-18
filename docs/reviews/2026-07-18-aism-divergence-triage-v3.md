<!-- ROLE: committed triage record — M0.3 acceptance RERUN (rk-88o), post round-2 repairs.
     SUPERSEDES docs/reviews/2026-07-18-aism-divergence-triage-v2.md. v2's flood section was
     OVERTURNED by the round-2 codex re-review (docs/reviews/2026-07-18-m0.3-rereview-codex.md,
     ruling f); this report re-evaluates the flood criterion under the check-6 aggregation fix
     that landed since (50793c4). UPDATE POLICY: append-only; supersede with a new dated file if
     re-run. TRIGGER: read by the M0.3 round-3 milestone re-review and whoever consumes the M0.5
     cutover list. -->

# AISM divergence triage — M0.3 acceptance RERUN (2026-07-18, v3)

**This report SUPERSEDES `docs/reviews/2026-07-18-aism-divergence-triage-v2.md`** (the "v2"
report), per that file's own supersession clause ("append-only; supersede with a new dated file
if re-run"). It exists for one reason: **v2's flood section was overturned.** The round-2 codex
re-review (`docs/reviews/2026-07-18-m0.3-rereview-codex.md`, finding 8 + **ruling f**) rejected
v2's flood attribution — collapsing 96/118/138 per-item whitelist WARNs by shared message
template does **not** establish one causal root, so the 96- and 118-warning historical buckets
exceeded this document's own `>25-findings-per-check` threshold (`gate-contracts.md`
"Finding-flood, operationally defined") without a valid single-root-cause exception. v2's
"flood 4/4 PASS by per-bucket attribution" is therefore withdrawn here.

The **structural fix landed since v2**: commit `50793c4` (ruling f) changed Gate 4 check 6 so
the whitelisted-unanchored WARNs **aggregate into one finding** (naming the count + every sorted
id, attributed to the first id's shard path), mirroring the aggregate pattern the reviewer
ratified for frontmatter-invalid exclusions (ruling b). This report re-runs all four trees under
that fix and re-evaluates the flood criterion **on the contract's literal finding-count metric**,
not on the overturned attribution argument.

Analysis run: **no rk source changed** (deliverable is this report only). Authority:
`docs/gate-contracts.md` is normative; AISM is characterized prior art, not a golden master
(CLAUDE.md L5; TJO/bd directive). AISM is **read-only** — HEAD was checked in place; the three
historical trees were extracted with `git -C ../almost-idempotent-stochastic-maps archive
<commit> | tar -x -C <scratch>`, never checked out in place. rk findings *on* AISM are a success
of the tool, not a defect of it.

## What changed since v2

- **Gate 4 check-6 whitelist aggregation** (`50793c4`, ruling f). Per-item whitelist WARNs
  (`<id> unanchored but whitelisted`) collapse into **one** WARN per tree: `<N> registry
  result(s) unanchored but whitelisted in report/UNWIRED.md (off paper-track): <sorted ids>`.
  Non-whitelisted (real, actionable) unanchored shards remain per-item ERRORs. Contract amended
  at `gate-contracts.md:784–795`. This is the **only** behavioral delta vs v2 and it changes no
  verdict on any tree.
- Provenance frontmatter-invalid exclusions likewise aggregate into one WARN (ruling b,
  `provenance-parse.ts`); does not fire on any of these four trees (0 frontmatter-invalid
  everywhere), so it affects no count here — noted for completeness.
- Round-2 repair wave also landed full-tree hashing (`c24b617`), required `SnapshotFacts`
  (`313c116`), the shards denominator fix (`70eafd2`), corpus-runner relocation +
  `rk check --selftest` (`ffb922d`, `d03caf8`), and doc/count sync (`1df81b8..59ab7b2`). None
  of these change any coverage line or verdict on the four AISM trees below.

## Run metadata

- rk commit: `59ab7b276100e55804f471cf667d278c4822c2ce` (HEAD; `50793c4` and the round-2 wave
  are ancestors).
- rk command: `bun run src/cli.ts check --root <tree>`.
- AISM-HEAD baseline command (per-gate, HEAD tree only, re-verified live):
  `python3 scripts/check-provenance.py --check` at AISM commit `6baf521`.
- `af` binary: present on PATH (`/home/tobiasosborne/go/bin/af`); AISM's `af_introspect` is
  live for the baseline.
- rk suite state at run time: `bun test` 465 pass / 1 skip / 0 fail (466 tests, 28 files);
  `bun run selftest` OK, 86/86 corpus fixtures.

| tree | AISM commit | date | argument shards | schema notes |
|---|---|---|---|---|
| HEAD | `6baf521` | 2026-07-16 | 200 | current schema (`routes:` + `workspace:` populated); 138 UNWIRED ids |
| early | `1521afe` | 2026-07-03 | 31 | pre-`routes:` (0 routes shards); **no** `report/UNWIRED.md` yet |
| mid | `bdf6800` | 2026-07-10 | 153 | `routes:` introduced here (aism-3ne); `lem-hx-financing-floor` absent; 96 UNWIRED ids |
| late | `0371dd8` | 2026-07-13 | 180 | modern schema; `lem-hx-financing-floor` present w/ amended ledger; 118 UNWIRED ids |

Same three trees v1/v2 used; selection rationale unchanged (they straddle the two mid-campaign
schema additions the robustness run targets).

## Per-gate results

Exact coverage lines and finding counts from this rerun. `[agg]` marks the value that changed
from v2 purely by check-6 aggregation.

### HEAD (`6baf521`) — `rk check` exit **0**

| gate | rk coverage line | err / warn |
|---|---|---|
| defs | 19/19 shards | 0 / 10 |
| refs | 0/23 externals byte-verified, 0 failed, 23 import-skipped, 0 no-quote-skipped | 0 / 0 |
| linker | 200/200 lemma shards | 0 / 6 |
| runs | 38/38 run bundle(s) | 0 / 0 |
| provenance | 200/200 registry results, 0 frontmatter-invalid, 62 claim rows, 31 tab:status rows | 0 / **2** `[agg]` |
| shards | 23/23 shard(s) fully conforming (included, labeled, cataloged) | 0 / 0 |

Total: **0 ERROR / 18 WARN.** v2 reported 0 ERROR / 155 WARN; the drop (155→18) is entirely the
137 per-item whitelist WARNs collapsing into 1 aggregate. The 2 provenance WARNs are: 1 aggregate
whitelist WARN naming all 138 UNWIRED ids + 1 hash-unverifiable-here WARN (`AF-LEM-HALO-COLLAPSE`
payload absent from the snapshot). AISM-HEAD baseline (`check-provenance.py`, live, re-run):
`200 registry results, 62 claim rows, 102 tex labels — 0 errors, **139** warnings`, of which 138
are per-item `unanchored but whitelisted`. rk's verdict matches AISM (0 errors); rk's WARN *count*
now deliberately diverges (2 vs 139) — the flood-suppression aggregation, same information, every
id named (triage row below).

### `1521afe` (early) — `rk check` exit **1**

| gate | rk coverage line | err / warn |
|---|---|---|
| defs | 9/9 shards | 0 / 0 |
| refs | 0/3 externals byte-verified, 0 failed, 3 import-skipped, 0 no-quote-skipped | 0 / 0 |
| linker | 31/31 lemma shards | **1** / 3 |
| runs | 6/6 run bundle(s) | 0 / 0 |
| provenance | 31/31 registry results, 0 frontmatter-invalid, 31 claim rows, 0 tab:status rows | 0 / 0 |
| shards | 9/9 shard(s) fully conforming | 0 / 0 |

Total: **1 ERROR / 3 WARN.** Unchanged from v2. The ERROR is `argument/DAG.md is STALE`
(linker check 11, generated-freshness): AISM-HEAD `argument.py --check` flags it too (HEAD
renderer != 2026-07-03 committed file). **true-finding-in-AISM**, parity, not a divergence. No
`report/UNWIRED.md` exists at this commit, so check 6 emits **0** whitelist findings — the
aggregation fix is a no-op here, confirming the WARN volume is genuinely UNWIRED-driven.

### `bdf6800` (routes introduced) — `rk check` exit **0**

| gate | rk coverage line | err / warn |
|---|---|---|
| defs | 19/19 shards | 0 / 10 |
| refs | 0/19 externals byte-verified, 0 failed, 19 import-skipped, 0 no-quote-skipped | 0 / 0 |
| linker | 153/153 lemma shards | 0 / 6 |
| runs | 30/30 run bundle(s) | 0 / 0 |
| provenance | 153/153 registry results, 0 frontmatter-invalid, 57 claim rows, 31 tab:status rows | 0 / **2** `[agg]` |
| shards | 21/21 shard(s) fully conforming | 0 / 0 |

Total: **0 ERROR / 18 WARN.** v2 reported 0 / 113. The 2 provenance WARNs: 1 aggregate whitelist
WARN naming 96 UNWIRED ids + 1 hash-unverifiable WARN. `routes:`-absent shards reduce
byte-identically to pre-routes behavior (no spurious finding on the 152 routes-less shards).

### `0371dd8` (late) — `rk check` exit **0**

| gate | rk coverage line | err / warn |
|---|---|---|
| defs | 19/19 shards | 0 / 10 |
| refs | 0/23 externals byte-verified, 0 failed, 23 import-skipped, 0 no-quote-skipped | 0 / 0 |
| linker | 180/180 lemma shards | 0 / 6 |
| runs | 35/35 run bundle(s) | 0 / 0 |
| provenance | 180/180 registry results, 0 frontmatter-invalid, 62 claim rows, 31 tab:status rows | 0 / **2** `[agg]` |
| shards | 23/23 shard(s) fully conforming | 0 / 0 |

Total: **0 ERROR / 18 WARN.** v2 reported 0 / 135. The 2 provenance WARNs: 1 aggregate whitelist
WARN naming 118 UNWIRED ids + 1 hash-unverifiable WARN. The `node_amended` fix (rk-co2,
`3bfca87`, closed pre-v2) keeps the `lem-hx-financing-floor` contract-drift ERROR gone here;
no regression.

## Robustness-run acceptance (Gate 2, `gate-contracts.md:435–462`)

Three criteria: (1) no crashes on any tree, (2) no finding-floods, (3) every divergence from the
AISM-HEAD baseline triaged.

- **(1) Crashes: 0/4.** All four outputs contain only `WARN`/`ERROR`/`checked`/verdict lines —
  no stack traces, no partial gate output, no dropped coverage lines. All six gates reported a
  coverage line on every tree.
- **(2) Floods:** evaluated per check in the next section — this is the section v2 got wrong.
- **(3) Divergences:** triage table below; the only divergence vs the AISM-HEAD baseline is the
  deliberate check-6 aggregation.

## Per-check flood evaluation (the overturned v2 section, redone)

**Threshold (`gate-contracts.md:458–462`):** a flood is *a single check emitting **more than 25
findings** on one tree*, OR *a check erroring on a majority of its checked units*, **unless** every
one of those findings is attributable to a single triaged root cause. The metric is **findings
emitted per check**, per tree.

**Method (honest, post-aggregation).** I enumerate every check that emitted ≥1 finding, per tree,
and count the **findings it actually emits** — not the identifiers named inside an aggregate
finding's message. This is the correction ruling f demanded: v2 kept 138 separate findings and
argued they shared a root (rejected); the fix instead makes the check emit **one** finding, so
the count is 1 by construction, not by attribution. Ruling f overturned an *attribution
argument*; it did not (and could not) forbid the aggregate emission shape — ruling **b** of the
same review explicitly ratified that exact aggregate shape for the sibling frontmatter-invalid
exclusions.

| tree | emitting check | findings emitted | notes |
|---|---|---:|---|
| HEAD | defs check 13 (`status=draft`) | 10 | one advisory WARN per draft def shard |
| HEAD | linker check 12 (brittleness `REFACTOR`) | 6 | proofs >26-node cap; byte-identical to `argument.py --check` |
| HEAD | provenance check 4 (source hash-verify) | 1 | `AF-LEM-HALO-COLLAPSE` payload absent |
| HEAD | provenance check 6 (anchor, **whitelist aggregate**) | **1** | one WARN naming all 138 UNWIRED ids |
| `1521afe` | linker check 11 (generated freshness) | 1 (ERROR) | `argument/DAG.md STALE`; AISM baseline agrees |
| `1521afe` | linker check 12 (brittleness) | 3 | 3 proofs >26 nodes |
| `bdf6800` | defs check 13 | 10 | |
| `bdf6800` | linker check 12 | 6 | |
| `bdf6800` | provenance check 4 | 1 | |
| `bdf6800` | provenance check 6 (**whitelist aggregate**) | **1** | one WARN naming 96 UNWIRED ids |
| `0371dd8` | defs check 13 | 10 | |
| `0371dd8` | linker check 12 | 6 | |
| `0371dd8` | provenance check 4 | 1 | |
| `0371dd8` | provenance check 6 (**whitelist aggregate**) | **1** | one WARN naming 118 UNWIRED ids |

**Max findings-per-check, per tree:** HEAD **10**, `1521afe` **3**, `bdf6800` **10**,
`0371dd8` **10**. Every value is ≤ 10, comfortably under the 25 threshold.

**"Erroring on a majority of checked units" clause:** the only ERROR on any tree is `1521afe`'s
single `DAG.md STALE` (linker check 11), a whole-file cross-shard check — 1 finding, not a
per-shard sweep, nowhere near a majority of 31 shards. No check errors on a majority of its units
on any tree.

**Verification of the whitelist bucket = 1 finding (not assumed).** The provenance coverage line
reads `... (0 errors, 2 warnings)` on HEAD/`bdf6800`/`0371dd8`; those 2 are the single aggregate
whitelist WARN + the single hash-verify WARN. On `1521afe` (no `UNWIRED.md`) the whitelist check
emits **0**. So the historical flood buckets (96/118/138) are now genuinely **1 finding each** —
verified from the live output, not assumed.

**Flood criterion verdict, per tree: PASS (HEAD), PASS (`1521afe`), PASS (`bdf6800`),
PASS (`0371dd8`) — 4/4.** This PASS rests on the contract's **primary** metric (≤25
findings-per-check), satisfied outright with max 10; it does **not** invoke the single-root-cause
exception, and therefore does not depend on the attribution argument ruling f overturned. The
one residual judgment question — *does an aggregate finding legitimately count as one finding for
the flood metric?* — is answered YES here on three grounds: (i) the aggregation restores exactly
the signal-to-noise the flood clause exists to protect (18 total gate WARNs vs 155, the 6
REFACTOR + 1 hash WARNs no longer buried); (ii) it loses no information (every id is named in the
message); (iii) it is the same aggregate shape ruling b ratified for exclusions. That judgment is
the round-3 reviewer's to ratify (bd rk-88o schedules codex xhigh round-3); this report states
the position and its basis rather than asserting closure.

## Triage table — deltas vs v2 and standing divergences

Per task framing: aggregation-driven changes are **report-only-with-commit-citation**; anything
else gets full `{true-finding | rk-bug | ambiguous}` triage.

| finding | tree(s) | classification | evidence |
|---|---|---|---|
| provenance whitelist WARNs 138/96/118 per-item → **1 aggregate** per tree | HEAD, `bdf6800`, `0371dd8` | report-only, aggregation-driven (`50793c4`, ruling f) | Contract `gate-contracts.md:784–795`; corpus `provenance-05`/`provenance-18` pin the aggregate (mutation-proven). No verdict change; every id still named. |
| rk provenance WARN count now diverges from AISM-HEAD baseline (2 vs 139 at HEAD) | HEAD | `[rk-stricter-intended]` (deliberate flood-suppression), report-only | rk aggregates; AISM emits per-item console lines (`check-provenance.py:349–365`). Same information, same verdict (0 errors both). This *replaces* v2's now-stale "byte-parity with AISM" claim — parity was intentionally broken by the aggregation fix. Not an rk-bug. |
| `argument/DAG.md STALE` ERROR | `1521afe` | true-finding-in-AISM | AISM-HEAD `argument.py --check` flags it too; HEAD renderer != 2026-07-03 committed file. Parity. Unchanged from v1/v2. |
| defs 10× `status=draft` WARN | HEAD, `bdf6800`, `0371dd8` | true-finding-in-AISM | Identical to `check-defs.py`; advisory, `defs-13` fixture class. Under threshold (10 ≤ 25). |
| linker 6×/3× `REFACTOR` (>26 nodes) WARN | all | true-finding-in-AISM | Byte-identical to `argument.py --check`; aism-s64-realigned cap. Under threshold. |
| provenance 1× hash-unverifiable `AF-LEM-HALO-COLLAPSE` WARN | HEAD, `bdf6800`, `0371dd8` | true-finding-in-AISM | Payload absent from snapshot; contract-conformant WARN. Under threshold. |
| linker `lem-hx-financing-floor` contract-drift ERROR | — | resolved rk-bug (fixed pre-v2) | `3bfca87` (rk-co2, CLOSED) replays `node_amended`; ERROR gone at HEAD + `0371dd8`. Carried forward, no reopen. |

**New divergences vs v2 requiring `{true-finding | rk-bug | ambiguous}` triage: 0.** The delta set
is (a) the check-6 aggregation (report-only, commit-cited) and (b) the consequent
rk-vs-AISM WARN-count divergence (rk-stricter-intended, report-only). No verdict changed on any
of the four trees.

## Counts

- **rk-bug count: 0.** (v1: 1, fixed in `3bfca87`; v2: 0; still 0.)
- ambiguous-escalate count: 0.
- crash count: 0.
- **finding-flood count: 0** — 4/4 trees PASS, on the contract's primary ≤25-findings-per-check
  metric (max observed 10), **without** relying on the single-root-cause exception ruling f
  overturned.

## M0.5 candidate AISM-side fixes / waivers

No AISM-side code change is required by this triage. Carried for the staged cutover so the M0.5
parallel-run does not mistake expected behavior for a regression:

1. **`lem-hx-financing-floor` root-vs-registry match depends on `node_amended` replay.** Resolved
   rk-side (`3bfca87`); the raw `node_created` record for node 1 is stale but both AISM and rk
   read the amended value. No waiver — noted only so a reader does not resurrect the v1 false ERROR.
2. **Generated-file staleness across schema epochs (`1521afe` DAG.md STALE).** Expected: old
   committed generated files are stale against the current renderer. Property of the
   staleness/freshness check, not an AISM defect. No waiver; flagged so historical-tree STALE is
   not read as a regression during parallel-run.
3. **UNWIRED.md whitelist volume (carried forward from v2's UNWIRED-backlog observation).**
   138 off-paper-track ids at HEAD (96 at `bdf6800`, 118 at `0371dd8`) is a large advisory
   backlog. Post-aggregation it is one WARN, not a flood — but the *volume* is real campaign
   signal: M0.5 may want to review whether the UNWIRED backlog should shrink, and the aggregation
   makes that backlog legible in one line rather than burying it. Informational; no rk or gate
   action. **Note vs v2:** this is the same standing observation, but the WARN it rides on is now
   aggregated — the parallel-run should expect rk to emit **1** UNWIRED WARN where AISM's script
   emits N per-item lines; that count divergence is intended, not a regression.

## Note on the v2 file

v2's UPDATE POLICY reads "append-only; supersede with a new dated file if re-run." This file is
that superseding dated file. A one-line `SUPERSEDED-BY` banner was added at the top of v2 pointing
here — the same treatment v1 received; the header's own supersession clause authorizes marking
supersession, and the banner adds no content to the append-only triage body. v2's flood section
(§"Flood attribution") is additionally flagged there as overturned by ruling f.

## Beads

- **rk-88o** (P1, this task): superseding v3 report — closed on commit of this file.
- **rk-co2** (P1, CLOSED): the v1 rk-bug, fixed in `3bfca87`. No reopen.
- No new beads filed: 0 rk-bugs, 0 crashes, 0 ambiguous escalations, 0 floods. Nothing discovered
  warrants a P1 or P2.
