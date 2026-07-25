// 1:1 test for src/drive/driver-prompts.ts (M3.5-prep): byte-stability + shared-prefix-first
// properties the M3.0 caching spike's dispatch model depends on, plus the prover-overreach
// guard's precondition (no verdict vocabulary ever appears in a prover prompt).

import { describe, expect, test } from "bun:test";
import {
  buildProverTurnPrompt,
  buildRepairTurnPrompt,
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
    const turnB = buildVerifierTurnPrompt({ nodeId: "1.2", statement: "B", deps: [{ id: "1.1", statement: "A holds", epistemicState: "validated" }], tier: "hard" });
    const firstCallA = `${shared}\n\n${turnA}`;
    const firstCallB = `${shared}\n\n${turnB}`;
    // Different items, but the identical shared prefix leads both -- this is the property a
    // prompt-caching backend needs to ever get a cache hit across turns of one claim.
    expect(firstCallA.startsWith(shared)).toBe(true);
    expect(firstCallB.startsWith(shared)).toBe(true);
    expect(firstCallA.slice(0, shared.length)).toBe(firstCallB.slice(0, shared.length));
  });

  test("hard-tier verifier prompt carries accept/challenge instructions, never VALID/INVALID vocabulary", () => {
    const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [{ id: "1.1", statement: "lemma one", epistemicState: "validated" }, { id: "1.2", statement: "lemma two", epistemicState: "validated" }], tier: "hard" });
    expect(turn).toContain('"outcome": "accept"');
    expect(turn).toContain('"outcome": "challenge"');
    expect(turn).toContain("Dependencies (already established) (2):");
    expect(turn).not.toContain("VALID");
  });

  // GAP 10 (RUN-REPORT-9): the verifier prompt must render each declared dependency's STATEMENT
  // (content), not just its id — node '1.7' (deps 1.4/1.5/1.6) was challenged forever because the
  // verifier was shown only ids and, fail-closed, refused to certify a step against content it never
  // saw ("the contents of dependencies 1.4, 1.5, 1.6 are not provided...").
  test("dependency section renders each dep's id, statement, and validated flag (GAP 10)", () => {
    const turn = buildVerifierTurnPrompt({
      nodeId: "1.7",
      statement: "min_i n_i <= sum_i p_i n_i",
      deps: [
        { id: "1.4", statement: "each n_i >= min_j n_j", epistemicState: "validated" },
        { id: "1.5", statement: "sum_i p_i = 1", epistemicState: "validated" },
        { id: "1.6", statement: "p_i >= 0 for all i", epistemicState: "pending" },
      ],
      tier: "hard",
    });
    expect(turn).toContain("Dependencies (already established) (3):");
    // each dependency's id AND its STATEMENT (the content the fix provides)
    expect(turn).toContain("### 1.4 [validated]");
    expect(turn).toContain("each n_i >= min_j n_j");
    expect(turn).toContain("### 1.5 [validated]");
    expect(turn).toContain("sum_i p_i = 1");
    // a not-yet-validated dep is flagged truthfully, never presented as settled
    expect(turn).toContain("### 1.6 [not yet validated — state: pending]");
    expect(turn).toContain("p_i >= 0 for all i");
    // the scope line uses the deps but must NOT invite re-validating them (validity fence)
    expect(turn.toLowerCase()).toContain("do not re-derive");
    expect(turn.toLowerCase()).toContain("re-verify the dependencies");
  });

  test("hard-tier verifier prompt requires the challenge target to be a QUOTED JSON STRING, with a concrete example (rk-qxp)", () => {
    const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [{ id: "1.1", statement: "lemma one", epistemicState: "validated" }], tier: "hard" });
    // The concrete quoted-string example a model can copy verbatim.
    expect(turn).toContain('"target": "1"');
    // And an explicit instruction that a bare number is wrong.
    expect(turn.toLowerCase()).toContain("string");
    expect(turn.toLowerCase()).toContain("number");
  });

  test("l5-tier verifier prompt carries VALID/VALID-WITH-CORRECTION/INVALID + justification instructions", () => {
    const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier: "l5" });
    expect(turn).toContain("VALID-WITH-CORRECTION");
    expect(turn).toContain('"INVALID"');
    expect(turn).toContain("justification");
    expect(turn).toContain("Dependencies (already established) (0):");
    expect(turn).toContain("(none)");
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

  // GAP 7(c): both verifier tiers instruct a BARE JSON object — no fences, no prose — the prompt-side
  // half of the exit-12 fix.
  test("verifier prompt (both tiers) forbids markdown fences / surrounding prose", () => {
    for (const tier of ["hard", "l5"] as const) {
      const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier });
      expect(turn.toLowerCase()).toContain("no markdown code fences");
      expect(turn).toContain("bare JSON object");
    }
  });

  // rk-d1n (M3.5 live debug): verbose reason/justification strings correlate with the exit-12 parse
  // deaths (a runaway free-text field runs past the output budget and truncates mid-string → invalid
  // JSON). Both tiers' verdict instructions now cap those fields and say truncation FAILS. The rule is
  // present for a normal (contentful) node and for a proofless node (the instructions block is always
  // appended).
  test("verifier prompt (both tiers) caps reason/justification to CONCISE and warns truncation FAILS", () => {
    for (const tier of ["hard", "l5"] as const) {
      const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier });
      expect(turn).toContain("CONCISE");
      expect(turn).toContain("3 sentences");
      expect(turn.toLowerCase()).toContain("truncated");
      expect(turn).toContain("FAILS");
    }
  });
  test("the conciseness cap is present even on a proofless-node prompt (instructions block always appended)", () => {
    const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier: "hard", proofless: true });
    expect(turn).toContain("CONCISE");
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
    const contentful = buildVerifierTurnPrompt({ nodeId: "1.2", statement: "S", deps: [{ id: "1.1", statement: "T", epistemicState: "validated" }], tier: "hard", proofless: false });
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

  test("a proofless HARD-tier prompt also states the challenge target must be a quoted node-id string (rk-qxp)", () => {
    const proofless = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier: "hard", proofless: true });
    expect(proofless).toContain('"challenge"');
    expect(proofless.toLowerCase()).toContain("quoted");
    expect(proofless).toContain('"1"'); // the node id, as a quoted string example
  });

  test("l5-tier proofless prompt demands INVALID (its negative verdict), not a challenge", () => {
    const proofless = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier: "l5", proofless: true });
    expect(proofless).toContain("NOTHING TO VERIFY");
    expect(proofless).toContain('"INVALID"');
  });
});

// rk-xxp (GAP 11): the attempt-11 incident. The hard-tier verifier emitted a semantically complete
// challenge and simply omitted the SIBLING `justification` key, folding its reasoning into
// `verdict.reason` — 96,066 tokens, 0 nodes applied. The fix is prompt-side (an exact literal
// skeleton the worker copies, `justification` shown as a required sibling) plus ONE bounded repair
// reprompt; the schema is NOT loosened and `verdict.reason` is NEVER coerced (PRD C3).
describe("buildVerifierTurnPrompt — mandatory top-level justification (rk-xxp / GAP 11)", () => {
  test("BOTH tiers print a literal, copyable JSON skeleton with 'justification' as a top-level sibling of 'verdict'", () => {
    for (const tier of ["hard", "l5"] as const) {
      const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier });
      expect(turn).toContain("REQUIRED OUTPUT SHAPE");
      // The literal skeleton line a model can copy verbatim — `"justification"` at top level, on its
      // own line, indented as a sibling of `"verdict"`.
      expect(turn).toContain('  "justification":');
      expect(turn).toContain('  "verdict":');
      expect(turn).toContain("REQUIRED TOP-LEVEL key");
      expect(turn).toContain("SIBLING");
    }
  });

  test("the hard tier states explicitly that verdict.reason does NOT substitute for justification", () => {
    const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier: "hard" });
    expect(turn).toContain('"verdict.reason" does NOT substitute');
    expect(turn).toContain("BOTH");
  });

  test("both tiers say an object without a top-level justification is REJECTED", () => {
    for (const tier of ["hard", "l5"] as const) {
      const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier });
      expect(turn).toContain("REJECTED");
    }
  });

  test("the rk-d1n verbosity cap (commit 891afcd) survives the hardening, on BOTH tiers", () => {
    for (const tier of ["hard", "l5"] as const) {
      const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier });
      expect(turn).toContain("CONCISE");
      expect(turn).toContain("3 sentences");
      expect(turn).toContain("FAILS");
    }
  });

  test("the hard-tier skeleton still uses no VALID/INVALID vocabulary (tier separation preserved)", () => {
    const turn = buildVerifierTurnPrompt({ nodeId: "1", statement: "S", deps: [], tier: "hard" });
    expect(turn).not.toContain("VALID");
  });
});

describe("buildRepairTurnPrompt — the ONE bounded schema-repair reprompt (rk-xxp / GAP 11)", () => {
  const bankedIssues = [
    { path: "$.justification", message: "missing required property 'justification' — it is a REQUIRED TOP-LEVEL key, a sibling of 'verdict'; 'verdict.reason' does NOT substitute for it" },
  ];

  test("echoes every CONCRETE issue verbatim (path AND message), so the worker is told exactly what to fix", () => {
    const p = buildRepairTurnPrompt("hard", bankedIssues);
    expect(p).toContain("$.justification");
    expect(p).toContain("missing required property 'justification'");
    expect(p).toContain("verdict.reason");
  });

  test("asks for the corrected object ONLY — no commentary, no re-analysis, verdict unchanged", () => {
    const p = buildRepairTurnPrompt("hard", bankedIssues);
    expect(p).toContain("REJECTED");
    expect(p.toLowerCase()).toContain("no commentary");
    expect(p).toContain("fix ONLY the shape");
  });

  test("re-states the tier's full output instructions, so the skeleton is present in the repair turn too", () => {
    const hard = buildRepairTurnPrompt("hard", bankedIssues);
    expect(hard).toContain("REQUIRED OUTPUT SHAPE");
    expect(hard).toContain('"outcome": "accept"');
    const l5 = buildRepairTurnPrompt("l5", bankedIssues);
    expect(l5).toContain("REQUIRED OUTPUT SHAPE");
    expect(l5).toContain("VALID-WITH-CORRECTION");
  });

  test("states that this is the ONLY correction — a second malformed reply ends the item (no loops)", () => {
    const p = buildRepairTurnPrompt("l5", bankedIssues);
    expect(p).toContain("ONLY correction");
  });

  test("byte-stable for the same issues", () => {
    expect(buildRepairTurnPrompt("hard", bankedIssues)).toBe(buildRepairTurnPrompt("hard", bankedIssues));
  });
});

describe("OUTPUT_SCHEMA_REF", () => {
  test("one distinct ref per tier", () => {
    expect(OUTPUT_SCHEMA_REF.l5).not.toBe(OUTPUT_SCHEMA_REF.hard);
    expect(OUTPUT_SCHEMA_REF.l5.length).toBeGreaterThan(0);
    expect(OUTPUT_SCHEMA_REF.hard.length).toBeGreaterThan(0);
  });
});
