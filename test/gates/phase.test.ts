// Unit tests for src/gates/phase.ts — the M1.3 FIXED phase matrix (docs/gate-contracts.md "Phase
// matrix"). Pure: no fs, no fixture directory — just data, mirroring test/framework.test.ts's
// style for src/gates/framework.ts.

import { describe, expect, test } from "bun:test";
import { applyPhase, DEFAULT_PHASE } from "../../src/gates/phase";
import type { Finding } from "../../src/gates/framework";

function err(structural: boolean, message = "m"): Finding {
  return { severity: "ERROR", path: "p", message, structural };
}
function warn(message = "w"): Finding {
  return { severity: "WARN", path: "p", message };
}

describe("DEFAULT_PHASE", () => {
  test("is consolidation -- the strictest default (CLAUDE.md L2)", () => {
    expect(DEFAULT_PHASE).toBe("consolidation");
  });
});

describe("applyPhase — consolidation (identity, today's behavior)", () => {
  test("returns findings completely unchanged, structural or not", () => {
    const findings = [err(true), err(false), warn()];
    expect(applyPhase(findings, "consolidation")).toEqual(findings);
  });

  // Mutation proof (this WP's brief): perturbing the matrix so a blocking gate becomes advisory
  // in consolidation must turn this test red. Temporarily forcing `applyPhase` to always demote
  // (removing the `phase === "consolidation"` early return) flips this expectation to
  // `[warn-shaped, warn-shaped, warn]` -- confirmed red by hand during implementation, restored
  // immediately after.
  test("a non-structural ERROR stays ERROR in consolidation (full set blocks)", () => {
    const [f] = applyPhase([err(false)], "consolidation");
    expect(f!.severity).toBe("ERROR");
  });
});

describe("applyPhase — exploration (only structural findings stay blocking)", () => {
  test("a structural ERROR is untouched", () => {
    const [f] = applyPhase([err(true, "cycle detected")], "exploration");
    expect(f).toEqual({ severity: "ERROR", path: "p", message: "cycle detected", structural: true });
  });

  test("a non-structural ERROR (structural omitted, i.e. false-default) demotes to WARN", () => {
    const [f] = applyPhase([err(false, "missing SHARD-TITLE header")], "exploration");
    expect(f!.severity).toBe("WARN");
    expect(f!.message).toContain("missing SHARD-TITLE header");
    expect(f!.message).toContain("advisory in exploration phase");
  });

  test("an already-WARN finding passes through unchanged (nothing to demote)", () => {
    const w = warn("skip_noquote: no refs/ locus");
    const [f] = applyPhase([w], "exploration");
    expect(f).toEqual(w);
  });

  test("count is preserved: a demoted finding is still counted, never dropped (L2)", () => {
    const findings = [err(true), err(false), err(false), warn()];
    const out = applyPhase(findings, "exploration");
    expect(out).toHaveLength(4);
    expect(out.filter((f) => f.severity === "ERROR")).toHaveLength(1); // only the structural one
    expect(out.filter((f) => f.severity === "WARN")).toHaveLength(3); // 2 demoted + 1 already-WARN
  });
});
