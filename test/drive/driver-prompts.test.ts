// 1:1 test for src/drive/driver-prompts.ts (M3.5-prep): byte-stability + shared-prefix-first
// properties the M3.0 caching spike's dispatch model depends on, plus the prover-overreach
// guard's precondition (no verdict vocabulary ever appears in a prover prompt).

import { describe, expect, test } from "bun:test";
import {
  buildProverTurnPrompt,
  buildSharedContext,
  buildVerifierTurnPrompt,
  OUTPUT_SCHEMA_REF,
} from "../../src/drive/driver-prompts";

const SHARED_INPUT = {
  conjecture: "sqrt(2) is irrational.",
  definitions: [
    { id: "d-rational", text: "A number is rational iff it can be written p/q, q != 0." },
    { id: "d-coprime", text: "Two integers are coprime iff their gcd is 1." },
  ],
  contractGuidance: "Judge each node strictly against its own stated dependencies.",
};

describe("buildSharedContext — cache-stability (docs/worker-contract.md (d))", () => {
  test("byte-stable: identical input -> identical output, called twice", () => {
    expect(buildSharedContext(SHARED_INPUT)).toBe(buildSharedContext(SHARED_INPUT));
  });

  test("definition order never perturbs the output (sorted internally)", () => {
    const forward = buildSharedContext(SHARED_INPUT);
    const reversed = buildSharedContext({ ...SHARED_INPUT, definitions: [...SHARED_INPUT.definitions].reverse() });
    expect(forward).toBe(reversed);
  });

  test("has no item-level parameter at all -- the shared block for a claim cannot vary by which item is about to be dispatched", () => {
    // The property under test is structural (the function signature carries no `item`), which the
    // type system already enforces; this test pins the OBSERVABLE consequence: two "sessions" of
    // the same claim (same SharedContextInput) always compute byte-identical shared context,
    // regardless of how many/which items each session goes on to dispatch afterward.
    const session1Shared = buildSharedContext(SHARED_INPUT);
    const session2Shared = buildSharedContext(SHARED_INPUT);
    expect(session1Shared).toEqual(session2Shared);
  });

  test("empty definitions renders an honest '(none cited)', never a blank section", () => {
    const out = buildSharedContext({ ...SHARED_INPUT, definitions: [] });
    expect(out).toContain("(none cited)");
  });

  test("contains the conjecture and every definition's id and text", () => {
    const out = buildSharedContext(SHARED_INPUT);
    expect(out).toContain("sqrt(2) is irrational.");
    expect(out).toContain("d-rational");
    expect(out).toContain("d-coprime");
    expect(out).toContain("gcd is 1");
  });
});

describe("buildVerifierTurnPrompt / buildProverTurnPrompt — shared-prefix-first, item-only turns", () => {
  const shared = buildSharedContext(SHARED_INPUT);

  test("a verifier turn's prompt never re-embeds the shared context bytes (contract rule 6)", () => {
    const turn = buildVerifierTurnPrompt({ nodeId: "1.1", statement: "Suppose p/q in lowest terms.", deps: [], tier: "hard" });
    expect(turn.includes(shared)).toBe(false);
    expect(turn).not.toContain("Shared context");
  });

  test("shared-prefix-first: sharedContext + '\\n\\n' + turn always puts the byte-stable shared block at position 0", () => {
    const turnA = buildVerifierTurnPrompt({ nodeId: "1.1", statement: "A", deps: [], tier: "hard" });
    const turnB = buildVerifierTurnPrompt({ nodeId: "1.2", statement: "B", deps: ["1.1"], tier: "hard" });
    const firstCallA = `${shared}\n\n${turnA}`;
    const firstCallB = `${shared}\n\n${turnB}`;
    // Different items, but the identical shared prefix leads both -- this is the property a
    // prompt-caching backend needs to ever get a cache hit across turns of one claim.
    expect(firstCallA.startsWith(shared)).toBe(true);
    expect(firstCallB.startsWith(shared)).toBe(true);
    expect(firstCallA.slice(0, shared.length)).toBe(firstCallB.slice(0, shared.length));
  });

  test("hard-tier verifier prompt carries accept/challenge instructions, never VALID/INVALID vocabulary", () => {
    const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: ["1.1", "1.2"], tier: "hard" });
    expect(turn).toContain('"outcome": "accept"');
    expect(turn).toContain('"outcome": "challenge"');
    expect(turn).toContain("Dependencies (2): 1.1, 1.2");
    expect(turn).not.toContain("VALID");
  });

  test("l5-tier verifier prompt carries VALID/VALID-WITH-CORRECTION/INVALID + justification instructions", () => {
    const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier: "l5" });
    expect(turn).toContain("VALID-WITH-CORRECTION");
    expect(turn).toContain('"INVALID"');
    expect(turn).toContain("justification");
    expect(turn).toContain("Dependencies (0): (none)");
  });

  test("prover prompt asks for a proof step as a children[] decomposition, never a verdict, and uses none of the forbidden verdict vocabulary", () => {
    const turn = buildProverTurnPrompt({ nodeId: "1.1", statement: "S", deps: ["1"] });
    expect(turn).toContain("proof step");
    // rk-gn4: the prover output is a structured decomposition af's `refine` seam can record, not free
    // text — a `{"children":[{"statement":...}]}` JSON object. No verdict vocab anywhere (the
    // prover-overreach guard depends on provers never even being ASKED for one).
    expect(turn).toContain('"children"');
    expect(turn).toContain('"statement"');
    const forbidden = ["verdict", "accept", "challenge", "VALID", "INVALID", "outcome"];
    for (const word of forbidden) expect(turn.toLowerCase()).not.toContain(word.toLowerCase());
  });

  test("prover prompt is byte-stable for the same input", () => {
    const a = buildProverTurnPrompt({ nodeId: "1.1", statement: "S", deps: [] });
    const b = buildProverTurnPrompt({ nodeId: "1.1", statement: "S", deps: [] });
    expect(a).toBe(b);
  });
});

describe("buildVerifierTurnPrompt — proofless-node HARD RULE (rk-jit / STOP-4)", () => {
  test("a proofless node's prompt HARD-FORBIDS accept and DEMANDS a challenge naming the missing proof", () => {
    const proofless = buildVerifierTurnPrompt({ nodeId: "1", statement: "min_i n_i <= sum_i p_i n_i.", deps: [], tier: "hard", proofless: true });
    // Forbids accepting a node with nothing to verify...
    expect(proofless).toContain("NOTHING TO VERIFY");
    expect(proofless).toContain("MUST NOT");
    // ...and demands the negative verdict (a challenge) instead.
    expect(proofless).toContain('"challenge"');
    expect(proofless.toLowerCase()).toContain("no proof");
    // The normal "judge this node's inference" scope line has NO meaning for a proofless node and
    // must NOT be emitted in its place.
    expect(proofless).not.toContain("Scope: judge whether this node's OWN inference");
  });

  test("a CONTENTFUL node's prompt keeps the normal scope line and never emits the proofless HARD RULE", () => {
    const contentful = buildVerifierTurnPrompt({ nodeId: "1.2", statement: "S", deps: ["1.1"], tier: "hard", proofless: false });
    expect(contentful).toContain("Scope: judge whether this node's OWN inference");
    expect(contentful).not.toContain("NOTHING TO VERIFY");
    // Still carries the normal accept/challenge output schema.
    expect(contentful).toContain('"outcome": "accept"');
  });

  test("proofless flag omitted defaults to contentful behavior (backward-compatible input)", () => {
    const dflt = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier: "hard" });
    expect(dflt).toContain("Scope: judge whether this node's OWN inference");
    expect(dflt).not.toContain("NOTHING TO VERIFY");
  });

  test("l5-tier proofless prompt demands INVALID (its negative verdict), not a challenge", () => {
    const proofless = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier: "l5", proofless: true });
    expect(proofless).toContain("NOTHING TO VERIFY");
    expect(proofless).toContain('"INVALID"');
  });
});

describe("OUTPUT_SCHEMA_REF", () => {
  test("one distinct ref per tier", () => {
    expect(OUTPUT_SCHEMA_REF.l5).not.toBe(OUTPUT_SCHEMA_REF.hard);
    expect(OUTPUT_SCHEMA_REF.l5.length).toBeGreaterThan(0);
    expect(OUTPUT_SCHEMA_REF.hard.length).toBeGreaterThan(0);
  });
});
