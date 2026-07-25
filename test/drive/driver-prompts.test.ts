// 1:1 test for src/drive/driver-prompts.ts (M3.5-prep): byte-stability + shared-prefix-first
// properties the M3.0 caching spike's dispatch model depends on, plus the prover-overreach
// guard's precondition (no verdict vocabulary ever appears in a prover prompt).
//
// rk-tbg (shard-cap split): the VERIFIER-role halves of this suite (the verifier-only tests that
// used to share the "buildVerifierTurnPrompt / buildProverTurnPrompt" describe block below, plus the
// dedicated proofless-node/mandatory-justification/buildRepairTurnPrompt describe blocks) moved
// byte-for-byte to test/drive/driver-prompts-verifier.test.ts, following src/drive/driver-prompts.ts's
// own split into driver-prompts.ts (shared + prover) and driver-prompts-verifier.ts (verifier). No
// assertion changed, only which file each one lives in.

import { describe, expect, test } from "bun:test";
import {
  buildProverRepairTurnPrompt,
  buildProverTurnPrompt,
  buildSharedContext,
  OUTPUT_SCHEMA_REF,
} from "../../src/drive/driver-prompts";
import { validateRawProverOutput } from "../../src/drive/prover-raw";

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

describe("buildProverTurnPrompt — shared-prefix-first, item-only turns", () => {
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

  // GAP 8 (STOP-REPORT-7): the prompt must document af's dependency convention so a prover stops
  // naming a not-yet-created sibling by its anticipated absolute id. A forward same-batch sibling is
  // "#N" (0-based; #0 = first child); an already-existing node keeps its absolute id. One concrete
  // example is present.
  test("prover prompt documents the #N in-batch dependency convention with a concrete example", () => {
    const turn = buildProverTurnPrompt({ nodeId: "1.1", statement: "S", deps: ["1"] });
    expect(turn).toContain("#0"); // the 0-based first-child relative ref
    expect(turn).toContain("#N");
    expect(turn).toContain("0-based");
    // the concrete example wiring a second child to the first via #0
    expect(turn).toContain('"depends": ["#0"]');
    // and the explicit warning against an anticipated absolute sibling id
    expect(turn).toContain("absolute id");
  });

  test("prover prompt is byte-stable for the same input", () => {
    const a = buildProverTurnPrompt({ nodeId: "1.1", statement: "S", deps: [] });
    const b = buildProverTurnPrompt({ nodeId: "1.1", statement: "S", deps: [] });
    expect(a).toBe(b);
  });

  // GAP 6: the justification is now presented as a free-text derivation label (af accepts any
  // non-blank string), inviting domain math labels while still naming the recognized logical rules.
  test("prover prompt presents justification as a free-text derivation label, inviting domain steps", () => {
    const turn = buildProverTurnPrompt({ nodeId: "1.1", statement: "S", deps: ["1"] });
    expect(turn).toContain("derivation label");
    expect(turn).toContain("modus_ponens"); // recognized rules still invited where they apply
    expect(turn).toContain("multiplication_by_positive"); // a domain label is explicitly welcomed
  });

});

// rk-i19: the PROVER's bounded schema-repair reprompt. Same three load-bearing properties as the
// verifier's (concrete issues echoed, shape-only correction, stated as the only one) plus a fourth
// that is unique to this role and is a validity precondition, not a style rule: a prover prompt —
// INCLUDING this one, and including every validator message it echoes — must never contain verdict
// vocabulary, because src/drive/driver-guardrails.ts's `detectProverOverreach` depends on a prover
// never being ASKED to judge anything.
describe("buildProverRepairTurnPrompt — the ONE bounded schema-repair reprompt for a prover (rk-i19)", () => {
  const PROVER_FORBIDDEN_WORDS = ["verdict", "accept", "challenge", "VALID", "INVALID", "outcome"];
  const issues = [
    { path: "$.children[1].statement", message: "missing required property 'statement' — every child MUST carry its own sub-claim as a non-blank string" },
  ];

  test("echoes every CONCRETE issue verbatim (path AND message)", () => {
    const p = buildProverRepairTurnPrompt(issues);
    expect(p).toContain("$.children[1].statement");
    expect(p).toContain("missing required property 'statement'");
  });

  test("asks for the corrected object ONLY — no commentary, and the proof content unchanged", () => {
    const p = buildProverRepairTurnPrompt(issues);
    expect(p).toContain("REJECTED");
    expect(p.toLowerCase()).toContain("no commentary");
    expect(p).toContain("fix ONLY the shape");
  });

  test("re-states the prover's FULL output instructions, so the children[] schema + #N convention are present", () => {
    const p = buildProverRepairTurnPrompt(issues);
    expect(p).toContain('"children"');
    expect(p).toContain('"statement"');
    expect(p).toContain("#0");
    expect(p).toContain("0-based");
  });

  test("states that this is the ONLY correction — a second malformed reply ends the item (no loops)", () => {
    expect(buildProverRepairTurnPrompt(issues)).toContain("ONLY correction");
  });

  // The guard's precondition, checked against REAL validator output rather than a hand-picked issue:
  // every message src/drive/prover-raw.ts can emit ends up in these bytes.
  test("uses NO verdict vocabulary anywhere, even when echoing every issue the real validator can emit", () => {
    const real = validateRawProverOutput({
      children: [{ justification: "", depends: [1, "  "] }, { statement: "  ", inference: "x" }, "not an object"],
      itemId: "smuggled",
    });
    expect(real.length).toBeGreaterThan(5);
    const p = buildProverRepairTurnPrompt(real).toLowerCase();
    for (const word of PROVER_FORBIDDEN_WORDS) expect(p).not.toContain(word.toLowerCase());
    // ...and the same for the empty-children and non-object bodies, whose messages differ again.
    for (const body of [{ children: [] }, "prose", {}]) {
      const q = buildProverRepairTurnPrompt(validateRawProverOutput(body)).toLowerCase();
      for (const word of PROVER_FORBIDDEN_WORDS) expect(q).not.toContain(word.toLowerCase());
    }
  });

  test("never re-embeds the shared context (contract rule 6 holds for a repair turn too)", () => {
    const p = buildProverRepairTurnPrompt(issues);
    expect(p.includes(buildSharedContext(SHARED_INPUT))).toBe(false);
    expect(p).not.toContain("Shared context");
  });

  test("byte-stable for the same issues", () => {
    expect(buildProverRepairTurnPrompt(issues)).toBe(buildProverRepairTurnPrompt(issues));
  });
});

describe("OUTPUT_SCHEMA_REF", () => {
  test("one distinct ref per tier", () => {
    expect(OUTPUT_SCHEMA_REF.l5).not.toBe(OUTPUT_SCHEMA_REF.hard);
    expect(OUTPUT_SCHEMA_REF.l5.length).toBeGreaterThan(0);
    expect(OUTPUT_SCHEMA_REF.hard.length).toBeGreaterThan(0);
  });
});
