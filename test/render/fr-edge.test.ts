// EDGE test for src/render/fr-edge.ts (rk-50v RENDER-EDGE option): `loadFrResiduals` reads
// `derived.deadRoutes` off a SECOND, independent `fr export` invocation (a fake `fr` binary here,
// same convention as test/store/fr-load.test.ts's own fake binary) and keys it by
// `killedAtCycle` — the same cycle number a graveyard row's own `cycle` carries
// (src/graph/from-fr.ts's `buildFrEdges`: `base.cycle = rec.cycle`).

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMPTY_FR_RESIDUALS, loadFrResiduals } from "../../src/render/fr-edge";

const FAKE_FR = [Bun.which("bun")!, join(import.meta.dir, "fixtures", "fake-fr.ts")];
const ABSENT = ["definitely-not-a-real-fr-binary-xyz"];

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-fr-edge-test-"));
}

describe("render/fr-edge", () => {
  test("reads derived.deadRoutes, keyed by killedAtCycle", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "fake-fr-response.json"),
      JSON.stringify({
        schema_version: "1",
        log: [],
        verdicts: [],
        derived: {
          deadRoutes: [
            { arm: "a1", residual: "induction fails at n=5", reason: "counterexample found", killedAtCycle: 2, killedByWave: "w3", outcome: "died" },
            { arm: "a2", residual: "target obstruction", reason: "no oracle path", killedAtCycle: 4, killedByWave: null, outcome: "refuted" },
          ],
        },
      }),
    );
    const data = loadFrResiduals(root, FAKE_FR);
    expect(data.byCycle.size).toBe(2);
    expect(data.byCycle.get(2)).toEqual({ residual: "induction fails at n=5", reason: "counterexample found", killedByWave: "w3" });
    expect(data.byCycle.get(4)).toEqual({ residual: "target obstruction", reason: "no oracle path", killedByWave: null });
    rmSync(root, { recursive: true, force: true });
  });

  // LB7 (2026-08-03 M3-close review): the DEGRADATION IS UNCHANGED — still an empty result, still
  // no ledger fallback, still never a throw — but it is now OBSERVABLE via `fidelity`. Before this,
  // a binary failure degraded silently and DETERMINISTICALLY, so `rk check`'s reproducibility probe
  // saw two identical regenerations and reported DRIFT, advising a re-render that would re-pin the
  // artifact to degraded output. See src/cli/check-regen.ts's header, cause 3.
  test("fr binary unavailable: degrades to an empty result and REPORTS it, never throws", () => {
    const root = tempRoot();
    const data = loadFrResiduals(root, ABSENT);
    expect(data.byCycle.size).toBe(0);
    expect(data.fidelity.ok).toBe(false);
    expect(data.fidelity.ok === false && data.fidelity.reason).toContain("could not be spawned");
    rmSync(root, { recursive: true, force: true });
  });

  test("fr export exits non-zero (.frontier missing/corrupt): empty + reported, never throws", () => {
    const root = tempRoot();
    writeFileSync(join(root, "fake-fr-exit-code"), "1");
    const data = loadFrResiduals(root, FAKE_FR);
    expect(data.byCycle.size).toBe(0);
    expect(data.fidelity.ok === false && data.fidelity.reason).toContain("exited 1");
    rmSync(root, { recursive: true, force: true });
  });

  test("RED CASE: unparseable stdout JSON degrades to empty + reported, never throws", () => {
    const root = tempRoot();
    writeFileSync(join(root, "fake-fr-response.txt"), "{not valid json at all");
    expect(() => loadFrResiduals(root, FAKE_FR)).not.toThrow();
    const data = loadFrResiduals(root, FAKE_FR);
    expect(data.byCycle.size).toBe(0);
    expect(data.fidelity.ok === false && data.fidelity.reason).toContain("not parseable JSON");
    rmSync(root, { recursive: true, force: true });
  });

  // The one degradation that is NOT one: fr answered, and "this campaign has no dead routes" is a
  // real, authoritative answer. Reporting it as reduced fidelity would put an unclearable cause-3
  // finding on every healthy repo — the exact cry-wolf failure rk-xbsx exists to prevent.
  test("a doc with no derived / no deadRoutes at all is an AUTHORITATIVE empty (fidelity ok)", () => {
    const root = tempRoot();
    writeFileSync(join(root, "fake-fr-response.json"), JSON.stringify({ schema_version: "1", log: [], verdicts: [] }));
    const data = loadFrResiduals(root, FAKE_FR);
    expect(data).toEqual(EMPTY_FR_RESIDUALS);
    expect(data.fidelity).toEqual({ ok: true });
    rmSync(root, { recursive: true, force: true });
  });

  test("an individual malformed deadRoutes row is skipped on its own; sibling valid rows still land", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "fake-fr-response.json"),
      JSON.stringify({
        schema_version: "1",
        log: [],
        verdicts: [],
        derived: {
          deadRoutes: [
            { arm: "a1", residual: "ok row", reason: "ok reason", killedAtCycle: 1, killedByWave: null, outcome: "died" },
            { arm: "a2", residual: 42, reason: "wrong type for residual", killedAtCycle: 2, outcome: "died" },
            { arm: "a3", reason: "missing residual field entirely", killedAtCycle: 3, outcome: "died" },
            "not even an object",
          ],
        },
      }),
    );
    const data = loadFrResiduals(root, FAKE_FR);
    expect(data.byCycle.size).toBe(1);
    expect(data.byCycle.get(1)).toEqual({ residual: "ok row", reason: "ok reason", killedByWave: null });
    expect(data.byCycle.has(2)).toBe(false);
    expect(data.byCycle.has(3)).toBe(false);
    // LB7: a skipped row IS a fidelity loss — this render is missing death-certificate text fr has.
    expect(data.fidelity.ok).toBe(false);
    expect(data.fidelity.ok === false && data.fidelity.reason).toContain("3 dead-route row(s)");
    rmSync(root, { recursive: true, force: true });
  });

  test("a clean read with real rows reports fidelity ok (LB7)", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "fake-fr-response.json"),
      JSON.stringify({
        schema_version: "1",
        log: [],
        verdicts: [],
        derived: {
          deadRoutes: [{ arm: "a1", residual: "r", reason: "why", killedAtCycle: 1, killedByWave: null, outcome: "died" }],
        },
      }),
    );
    expect(loadFrResiduals(root, FAKE_FR).fidelity).toEqual({ ok: true });
    rmSync(root, { recursive: true, force: true });
  });
});
