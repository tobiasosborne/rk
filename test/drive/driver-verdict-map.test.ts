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

describe("afItemFromVerdictDocument — verdict → af apply item", () => {
  test("hard accept → {verdict:accept, reason=justification}", () => {
    const bound = bindVerdicts(state("hard"), { verdict: { outcome: "accept" }, justification: "follows from 1.1.1 and def 3.2" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const r = afItemFromVerdictDocument("1.1", bound.document);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.item).toEqual({ node: "1.1", verdict: "accept", reason: "follows from 1.1.1 and def 3.2" });
  });

  test("hard challenge → {verdict:challenge, reason,target,severity} — NEVER an accept", () => {
    const bound = bindVerdicts(state("hard"), { verdict: { outcome: "challenge", target: "inference", severity: "major", reason: "modus ponens misapplied", category: "incorrect" }, justification: "see step 2" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const r = afItemFromVerdictDocument("1.1", bound.document);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // mutation: emit verdict:"accept" for a challenge outcome → this goes red.
    expect(r.item.verdict).toBe("challenge");
    expect(r.item.target).toBe("inference");
    expect(r.item.severity).toBe("major");
    expect(r.item.reason).toBe("modus ponens misapplied");
    expect(r.item.category).toBe("incorrect");
  });

  test("an L5 verdict document is REFUSED (af verdicts apply is hard-tier only)", () => {
    const bound = bindVerdicts(state("l5"), { verdict: "VALID", justification: "ok" });
    expect(bound.ok).toBe(true);
    if (!bound.ok) return;
    const r = afItemFromVerdictDocument("1.1", bound.document);
    expect(r.ok).toBe(false);
  });
});
