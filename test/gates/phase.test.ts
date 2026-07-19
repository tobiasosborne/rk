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

// rk-xbm (M1 review B1, docs/reviews/2026-07-18-m1-milestone-review-codex.md L1): the OLD code
// here was `if (phase === "consolidation") return findings; <demote>` -- ANY value that wasn't
// the literal string "consolidation", including a typo, fell into the demotion branch and ran as
// exploration. `phase`'s static type is `Phase`, but `GateConfig.phase` is (transitively) sourced
// from untyped `.rk/config.json` JSON a compile-time cast cannot make honest -- these tests pass
// a value the type system would normally forbid via `as Phase`, exactly the shape a real typo'd
// config file produces at runtime.
describe("applyPhase — rk-xbm: an invalid phase value never silently demotes (L6)", () => {
  test("a typo'd phase value: severities are NOT demoted (behaves like consolidation)", () => {
    const findings = [err(false, "missing SHARD-TITLE header")];
    const out = applyPhase(findings, "typo" as Phase);
    const original = out.find((f) => f.message.includes("missing SHARD-TITLE header"));
    expect(original!.severity).toBe("ERROR"); // NOT demoted to WARN
    expect(original!.message).not.toContain("advisory in exploration phase");
  });

  test("a typo'd phase value produces one loud, structural, non-demotable config ERROR", () => {
    const out = applyPhase([warn()], "typo" as Phase);
    const configFindings = out.filter((f) => f.path === ".rk/config.json");
    expect(configFindings).toHaveLength(1);
    expect(configFindings[0]).toMatchObject({ severity: "ERROR", structural: true });
    expect(configFindings[0]!.message).toContain("typo");
    expect(configFindings[0]!.message).toContain("consolidation");
  });

  test("count is preserved: the invalid-phase finding is PREPENDED, existing findings untouched in count", () => {
    const findings = [err(true), err(false), warn()];
    const out = applyPhase(findings, "typo" as Phase);
    expect(out).toHaveLength(4); // 3 original + 1 synthetic config-error
  });

  // Mutation proof (this WP's brief): reverting to the pre-fix `if (phase === "consolidation")
  // return findings; return findings.map(demote)` (i.e. deleting the `phase !== "exploration"`
  // branch entirely) makes "typo'd phase value: severities are NOT demoted" above go RED (the
  // ERROR gets rewritten to WARN with an "advisory in exploration phase" clause) -- confirmed by
  // hand during implementation, reverted immediately after.
});
