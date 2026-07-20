// 1:1 test for src/drive/driver-verdict-map.ts (M3.6, L6 validity-critical). Ground truth:
// ../vibefeld/docs/verdicts-apply.md items + docs/worker-contract.md (g) — accept carries a non-blank
// reason; a challenge NEVER becomes an accept; L5 is refused (af verdicts apply is hard-tier only).
// The document under test is produced through the real bindVerdicts pipeline, not hand-forged.

import { describe, expect, test } from "bun:test";
import { bindVerdicts, type DispatchState } from "../../src/drive/bind-verdicts";
import { afItemFromVerdictDocument } from "../../src/drive/driver-verdict-map";
import type { VerifierIdentity } from "../../src/drive/identity";

const IDENTITY: VerifierIdentity = { modelFamily: "gpt", backend: "codex", model: "gpt-5.6", sessionId: "s1" };
const HASH = "a".repeat(64);
function state(tier: "l5" | "hard"): DispatchState {
  return { itemId: "1.1", contentHash: HASH, tier, claimId: "lem-x", verifier: IDENTITY };
}

// rk-qxp (FIX 6): the model-facing challenge "target" is a NODE ID at fault (not af's aspect enum).
// The mapper now (1) records the challenge on the BLAMED node (item.node := the model's target),
// validated present in the export; (2) derives af's `target` ASPECT from the model's `category` via a
// fixed map {gap→gap, dependency→dependencies, missing→completeness, incorrect→inference,
// unclear→statement, other→statement, absent→statement}; (3) passes severity through unchanged. An
// unknown blamed node is a loud map failure, never a mis-attributed challenge.
const KNOWN = new Set(["1", "1.1", "1.2"]);

describe("afItemFromVerdictDocument — verdict → af apply item", () => {
  test("hard accept → {verdict:accept, reason=justification} on the reviewed node", () => {
    const bound = bindVerdicts(state("hard"), { verdict: { outcome: "accept" }, justification: "follows from 1.1.1 and def 3.2" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const r = afItemFromVerdictDocument("1.1", bound.document, KNOWN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item).toEqual({ node: "1.1", verdict: "accept", reason: "follows from 1.1.1 and def 3.2" });
  });

  test("challenge blaming the node under review lands ON that node, aspect derived from category — NEVER an accept", () => {
    // reviewing 1.1, blaming 1.1 itself, category "incorrect" → af aspect "inference"
    const bound = bindVerdicts(state("hard"), { verdict: { outcome: "challenge", target: "1.1", severity: "major", reason: "modus ponens misapplied", category: "incorrect" }, justification: "see step 2" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const r = afItemFromVerdictDocument("1.1", bound.document, KNOWN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // mutation: emit verdict:"accept" for a challenge outcome → this goes red.
    expect(r.item.verdict).toBe("challenge");
    expect(r.item.node).toBe("1.1"); // the blamed node (== the reviewed node here)
    expect(r.item.target).toBe("inference"); // af ASPECT derived from category "incorrect", NOT the node id
    expect(r.item.severity).toBe("major"); // severity passes through
    expect(r.item.reason).toBe("modus ponens misapplied");
    expect(r.item.category).toBe("incorrect"); // model category passes through to af's category field
  });

  test("challenge blaming a DEPENDENCY node lands on THAT node, not the reviewed node", () => {
    // reviewing 1.2, but blaming dependency 1.1
    const bound = bindVerdicts(state("hard"), { verdict: { outcome: "challenge", target: "1.1", severity: "critical", reason: "the cited lemma is itself wrong", category: "dependency" }, justification: "x" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const r = afItemFromVerdictDocument("1.2", bound.document, KNOWN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.node).toBe("1.1"); // the BLAMED dependency, not the reviewed 1.2
    expect(r.item.target).toBe("dependencies"); // category "dependency" → aspect "dependencies"
  });

  test("challenge naming an UNKNOWN blamed node → loud map failure, never a mis-attributed challenge", () => {
    const bound = bindVerdicts(state("hard"), { verdict: { outcome: "challenge", target: "9.9", severity: "major", reason: "x", category: "gap" }, justification: "y" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const r = afItemFromVerdictDocument("1.1", bound.document, KNOWN);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("9.9");
    expect(r.reason.toLowerCase()).toContain("not present");
  });

  test("category→aspect: no category → aspect defaults to 'statement'", () => {
    const bound = bindVerdicts(state("hard"), { verdict: { outcome: "challenge", target: "1", severity: "major", reason: "disputed claim" }, justification: "z" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const r = afItemFromVerdictDocument("1", bound.document, KNOWN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.target).toBe("statement"); // absent category → statement
    expect(r.item.category).toBeUndefined();
  });

  test("category→aspect: missing→completeness (the bare-root proofless bootstrap case)", () => {
    // This is the live case: the proofless root is challenged with category "missing" → af
    // "completeness", which the operator probe confirmed flips the root prover_ready.
    const bound = bindVerdicts(state("hard"), { verdict: { outcome: "challenge", target: "1", severity: "critical", reason: "no proof body recorded", category: "missing" }, justification: "bootstrap" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const r = afItemFromVerdictDocument("1", bound.document, KNOWN);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item.node).toBe("1");
    expect(r.item.target).toBe("completeness");
  });

  test("category→aspect: the full documented map is applied", () => {
    const cases: [string | undefined, string][] = [
      ["gap", "gap"],
      ["dependency", "dependencies"],
      ["missing", "completeness"],
      ["incorrect", "inference"],
      ["unclear", "statement"],
      ["other", "statement"],
    ];
    for (const [category, aspect] of cases) {
      const raw: Record<string, unknown> = { outcome: "challenge", target: "1", severity: "minor", reason: "r" };
      if (category !== undefined) raw.category = category;
      const bound = bindVerdicts(state("hard"), { verdict: raw, justification: "j" });
      expect(bound.ok).toBe(true);
      if (!bound.ok) return;
      const r = afItemFromVerdictDocument("1", bound.document, KNOWN);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.item.target).toBe(aspect);
    }
  });

  test("an L5 verdict document is REFUSED (af verdicts apply is hard-tier only)", () => {
    const bound = bindVerdicts(state("l5"), { verdict: "VALID", justification: "ok" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const r = afItemFromVerdictDocument("1.1", bound.document, KNOWN);
    expect(r.ok).toBe(false);
  });
});
