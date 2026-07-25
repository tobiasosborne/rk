// 1:1 test for src/drive/driver-prompts-verifier.ts (rk-tbg shard-cap split of driver-prompts.ts,
// 370 -> two files: this file's VERIFIER-role prompt assembly, and driver-prompts.ts's shared pieces
// + PROVER-role prompt assembly). These tests moved out of test/drive/driver-prompts.test.ts
// byte-for-byte -- same assertions, only the import path and physical location changed (the mixed
// "buildVerifierTurnPrompt / buildProverTurnPrompt" describe block there was split along the same
// verifier/prover seam as the source, into this file's first describe below and that file's
// remaining prover-only block). The PROVER-role and shared (buildSharedContext/OUTPUT_SCHEMA_REF/
// buildProverRepairTurnPrompt) tests stay in driver-prompts.test.ts, unmodified.

import { describe, expect, test } from "bun:test";
import { buildRepairTurnPrompt, buildVerifierTurnPrompt } from "../../src/drive/driver-prompts-verifier";
import { buildSharedContext } from "../../src/drive/driver-prompts";

const SHARED_INPUT = {
  conjecture: "sqrt(2) is irrational.",
  definitions: [
    { id: "d-rational", text: "A number is rational iff it can be written p/q, q != 0." },
    { id: "d-coprime", text: "Two integers are coprime iff their gcd is 1." },
  ],
  contractGuidance: "Judge each node strictly against its own stated dependencies.",
};

describe("buildVerifierTurnPrompt — shared-prefix-first, item-only turns", () => {
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
