// EDGE — fs. Discovers `corpus/<gate>/<fixture-id>/` fixture directories (corpus/README.md's
// "Fixture directory layout") for both the corpus test harness (test/corpus.test.ts) and `bun
// run selftest`'s coverage line — one discovery implementation, so the two can never silently
// disagree on the fixture count.
//
// Lives under src/corpus/ (not src/gates/), one level up from this repo's own corpus/ fixture
// tree it discovers: this is an fs-touching harness module, not a gate — src/gates/ is a PURE
// directory per CLAUDE.md §5 and IMPLEMENTATION_PLAN.md §0, and an fs-using file placed inside
// it is silently exempt from the marker-based purity grep (scripts/selftest.ts) rather than
// visibly out of place (2026-07-18 M0.3 re-review finding 6). Moved here (not scripts/) because
// it is shared library code two callers import (test/corpus.test.ts, scripts/selftest.ts,
// src/cli/check.ts's `--selftest`), not a standalone script.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** The gate directory names under corpus/ — matches each gate's `name` in src/gates/index.ts
 * and the fixture-id prefix (corpus/README.md: "<gate> is one of defs, linker, refs, provenance,
 * runs, shards"). `freshness` (M2.6, Gate 7, src/gates/freshness.ts) is the second synthetic
 * entry alongside `config` — no AISM check-all.sh counterpart, added at the end. */
export const GATE_DIRS = ["config", "defs", "linker", "refs", "provenance", "runs", "shards", "freshness"] as const;
export type GateDir = (typeof GATE_DIRS)[number];

export function discoverFixtures(corpusRoot: string, gateDir: string): string[] {
  const dir = join(corpusRoot, gateDir);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => {
      try {
        return statSync(join(dir, n)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

export function discoverAllFixtures(corpusRoot: string): Record<GateDir, string[]> {
  const out = {} as Record<GateDir, string[]>;
  for (const g of GATE_DIRS) out[g] = discoverFixtures(corpusRoot, g);
  return out;
}

export function totalFixtureCount(corpusRoot: string): number {
  const all = discoverAllFixtures(corpusRoot);
  return GATE_DIRS.reduce((sum, g) => sum + all[g]!.length, 0);
}

/** corpus/README.md's ledger total across the six M0 gates. One shared home (M0.3 round-3
 * review follow-up 2, check.ts:89): `bun run selftest` (scripts/selftest.ts) and `rk check
 * --selftest` (src/cli/check.ts) both enforce this exact number against `totalFixtureCount`, so
 * the two entry points can never drift apart on what "the corpus" is expected to contain. A drift
 * between this constant and corpus/README.md's own ledger is itself a bug — bump both together.
 * 90 (+2 over the previously-pinned 88): M1 addition `linker-25` + `shards-15` (beads rk-1rv /
 * rk-au6, docs/memos/2026-07-18-aism-residue-audit.md R13/R14) — the presence-conditional
 * report/ and argument/INDEX.md+DAG.md mirror guards' golden-pass fixtures.
 * 92 (+2 over the then-pinned 90): M1 addition `linker-26` + `linker-27` (bead rk-9pk, dogfood-1
 * incident) — the linker's shard glob widened from `argument/lemmas/*.md` to a recursive
 * `argument/**\/*.md` scan; `linker-26` is the recursive-discovery golden-pass fixture (the
 * dogfood shape: shards directly at `argument/*.md` root), `linker-27` proves a non-excluded
 * stray file is still a parse ERROR, never silently skipped.
 * 98 (+6 over the then-pinned 92): M1 repair wave (M1 boundary review + dogfood-2, 2026-07-19) —
 * `provenance-20` (rk-2t8: OVERCLAIM on a root-level shard via recursive discovery),
 * `linker-28` (rk-sj6: duplicate registry id is a structural ERROR), `linker-29` + `linker-30`
 * (rk-wc3: multi-line YAML deps with unknown id must ERROR; malformed frontmatter line is loud),
 * `config-01` + `config-02` (rk-xbm: typo'd `phase` / malformed `shardsMaxLines` in
 * `.rk/config.json` are blocking ERRORs, never silent fallback) — "config" also added to
 * GATE_DIRS as the synthetic seventh gate's corpus directory.
 * 103 (+5 over the then-pinned 98): M2.6 addition — `freshness-01`..`freshness-05` (Gate 7,
 * src/gates/freshness.ts, docs/gate-contracts.md's Gate 7 section): the regenerate-and-diff
 * mechanism over a declared `.rk/generated.json` manifest — clean-regenerate golden pass, a
 * hand-edited generated file, a declared-but-missing generated file, a malformed manifest, and
 * the no-manifest presence-conditional golden pass. `freshness` added to GATE_DIRS as the second
 * synthetic (no AISM check-all.sh counterpart) gate's corpus directory.
 * 109 (+6 over the then-pinned 103): M2 repair wave (M2 boundary review, 2026-07-19) —
 * `freshness-06` (unknown generator = blocking ERROR, review blocker 3) + `freshness-07`
 * (render-site-v1 without edge regeneration = ERROR, never silent) + `freshness-08`..`freshness-11`
 * (manifest schema runtime enforcement: missing/wrong schema_version, extra top-level/per-entry
 * keys, review blocker 4). The concurrent corpus/graph additions (conflict-banked-unfresh-*,
 * conflict-fr-superseded, review blockers 6-7) live under corpus/graph/, which is NOT in
 * GATE_DIRS — they run under the bun-test harness (see corpus/README.md's Graph fixtures
 * section and bead rk-b09 for the selftest-visibility follow-up).
 * 117 (+8 over the then-pinned 109): M3.8 (cross-vendor rule, worktree agent-a9b12837c0ead0e82) —
 * Gate 2's new critical-path provenance check (`linker-31`..`linker-34`, `linker-38`: same-family
 * POST-convention ERROR, no-parseable-seam legacy WARNING, batch-validated-on-critical-path
 * WARNING, cross-family golden pass, explicit `provenance: legacy-same-family` marker WARNING)
 * and the L5-promotion integration (`linker-35`..`linker-37`: fresh VALID promotes, stale does
 * not, VALID-WITH-CORRECTION correction-pending does not). See docs/gate-contracts.md Gate 2's
 * "Critical-path provenance" section for the full contract text.
 * 121 (+4 over the then-pinned 117): 2026-07-19 M3 review repair wave, blockers 5-6 (commits
 * 0446873 + 7e884e5) — `linker-39` (explicit atomic legacy-marker opt-in WARN), `linker-40`
 * (unresolved north star fails closed), `linker-41` (L5 store corruption poisons promotion),
 * `linker-42` (promoted shards continuously re-validated). The same wave HARDENED `linker-32`/
 * `linker-33` from WARN to fail-closed ERROR (legacy never inferred; critical-path batch
 * provenance is an ERROR).
 * 122 (+1 over the then-pinned 121): M3 repair wave completion step (review blocker 7c) —
 * `linker-43`: `checkMandatoryReview` (added by commit 7ede34c alongside the persisted balloon
 * counter) was wired into `linkerGate`'s findings array — a repeat/genuine-gap balloon now
 * surfaces its `MANDATORY-REVIEW` WARN through the full gate, not merely through the unit test.
 * See docs/gate-contracts.md Gate 2's new Check 15.
 * 123 (+1 over the then-pinned 122): rk-7hi (M3.5 STOP-2 blocker) — `config-03`: an empty-string
 * `workers.assignments.<role>.<tier>.model` (the new optional per-assignment model override,
 * src/drive/backend-registry.ts's `validateAssignmentEntry`) is a blocking ERROR at the loading
 * edge, same discipline as a blank `backend` — the companion fixture to config-01/config-02 for
 * the field this bead added so the TJO worker-model pin becomes expressible.
 * 124 (+1 over the then-pinned 123): rk-45m — `config-04`: a syntactically unparseable
 * `.rk/config.json` (a trailing comma), or one whose top-level JSON value is not an object, is a
 * loud structural ERROR at the loading edge instead of a silent fallback to defaults. Closes the
 * residual rk-xbm deliberately left open; values still degrade to DEFAULT_GATE_CONFIG so the run
 * never crashes, but it is never silently green about a config the user thought was in force.
 * 125 (+1 over the then-pinned 124): 2026-07-25 generality-audit P0 wave — `provenance-21` (B1,
 * docs/memos/2026-07-25-generality-audit.md): Gate 4's anchor check bound to the `report/` ROOT,
 * the sibling of `shards-15`/`linker-25` that was never written — and whose absence is exactly why
 * B1 survived the 2026-07-18 residue audit. Gate 4's "fresh repo no-op" was vacuous: it held only
 * while the registry was EMPTY, so no fixture ever exercised shards-present + report-absent.
 * 127 (+2 over the then-pinned 125): rk-lkeh — `provenance-22` and `provenance-23`, the two
 * halves of Gate 4 check 5's half-parameterisation false-green. `provenance-11` parameterised the
 * status-table FILE but left the label scan and the loader's text include rules hardcoded, so a
 * relocated table made check 5 verify nothing at exit 0. `provenance-22`: a configured file
 * PRESENT on disk but outside the include rules is now an ERROR (distinguished from genuinely
 * absent via `snapshot.sha256`, which spans the whole tree while the text map does not).
 * `provenance-23`: rows parsed but ZERO joined is a WARN naming which of two causes applies.
 * 128 (+1 over the then-pinned 127): rk-0ehr / P1 (retraction as a first-class event, ratified
 * plan docs/memos/2026-08-03-rk-improvement-plan-from-aism.md §P1) — `linker-44`, THE INCIDENT
 * FIXTURE: AISM 2026-07-28's two retracted-but-still-green proofs, transcribed with their real
 * ids from docs/memos/2026-08-03-aism-postmortem/03-datamodel.md "Drift & inconsistency found"
 * item 1. One shard exercises the `af-canonical` domain (Gate 2 Check 8: a retracted shard's own
 * `af: validated` claim is an ERROR, and it leaves the available set for every dependent), the
 * other the `l5-shard-bytes` domain (Check 14: a live retraction overrides a FRESH `VALID`
 * verdict — the half no hash comparison could catch, because the bytes never changed). See
 * docs/gate-contracts.md Gate 2's new Check 16.
 * 131 (+3 over the then-pinned 128): rk-wkzh — `refs-09`, `refs-10`, `refs-11`, Gate 3's P2
 * tightening (docs/memos/2026-08-03-rk-improvement-plan-from-aism.md §P2), the first refs fixtures
 * transcribed from real dated incidents rather than classes: `refs-09` is AISM I2 (quote bytes
 * genuine, recorded locus a DIFFERENT theorem — PASS before this bead, ERROR after; the strict
 * acceptance-shrink case), `refs-10` is I3 (a source naming a refs/ path with no extractable
 * quote rode `skip_noquote` WARN past the fabrication gate; now an ERROR), `refs-11` is I4 (a
 * pdftotext payload with real `\x0c` bytes whose locus is plausible under form-feed-aware line
 * counting and off under `\n`-only counting — PASSes via the either-convention rule). */
export const EXPECTED_FIXTURE_COUNT = 131;
