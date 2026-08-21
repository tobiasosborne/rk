// The corpus test harness (M0.3 deliverable 7): discovers corpus/<gate>/<fixture>/, loads
// expected.json + repo/ into a RepoSnapshot, runs the single named gate, and checks the result
// against expected.json's convention (corpus/README.md) — findings subset match, verdict/
// exit-code, the optional coverage expectation, and the config-override declaration. The actual
// per-fixture assertion logic lives in src/corpus/run.ts's `runFixture`, shared verbatim
// with `bun run selftest` (rk-6vw, review finding 6: selftest must actually execute the corpus,
// not merely count fixture directories, and the two must never be able to silently disagree).
//
// M0.3 skeleton state: a gate not yet implemented (GateResult.notImplemented === true) has every
// fixture registered as `test.skip`, with the gate's total pending-fixture count visible right in
// the skip name. A gate flips its fixtures from skip to a real assertion the moment its own
// `src/gates/<gate>.ts` stops returning `notImplemented: true` — no change to this harness is
// needed for that to happen.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { GATES } from "../src/gates/index";
import { DEFAULT_GATE_CONFIG } from "../src/gates/config";
import { GATE_DIRS, discoverAllFixtures } from "../src/corpus/discovery";
import { runFixture } from "../src/corpus/run";
import { snapshotFromFiles } from "../src/gates/snapshot";

const CORPUS_ROOT = join(import.meta.dir, "..", "corpus");

const ALL_FIXTURES = discoverAllFixtures(CORPUS_ROOT);

for (const gateDir of GATE_DIRS) {
  const gate = GATES.find((g) => g.name === gateDir);
  const fixtures = ALL_FIXTURES[gateDir];

  describe(`corpus / ${gateDir}`, () => {
    // A stub's notImplemented flag is static at M0.3 (never varies with input) — probe it once
    // against an empty snapshot rather than re-running the gate per fixture just to find out.
    // Built through the sanctioned builder (M0.3 round-3 landing-blocker 2: facts are constructed
    // ONLY via `snapshotFromFiles`, never hand-assembled — an empty file map yields coherent empty
    // facts). A gate that reads facts (provenance/runs/shards) probes cleanly.
    const emptySnapshot = snapshotFromFiles({});
    const isStub = gate ? gate.run(emptySnapshot, DEFAULT_GATE_CONFIG).notImplemented === true : true;

    for (const fixtureId of fixtures) {
      const label = isStub
        ? `${gateDir}/${fixtureId} (gate not implemented — ${fixtures.length} fixtures pending)`
        : `${gateDir}/${fixtureId}`;

      const body = async () => {
        const outcome = await runFixture(CORPUS_ROOT, gateDir, fixtureId);
        expect(outcome.errors).toEqual([]);
      };

      if (isStub) {
        test.skip(label, body);
      } else {
        test(label, body);
      }
    }
  });
}

describe("corpus discovery", () => {
  test("every one of the nine gate directories has at least one fixture", () => {
    for (const g of GATE_DIRS) {
      expect(ALL_FIXTURES[g]!.length).toBeGreaterThan(0);
    }
  });

  test("total fixture count matches corpus/README.md's ledger (191)", () => {
    const total = GATE_DIRS.reduce((sum, g) => sum + ALL_FIXTURES[g]!.length, 0);
    expect(total).toBe(191);
  });
});
