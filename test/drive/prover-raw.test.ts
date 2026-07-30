// 1:1 test for src/drive/prover-raw.ts (rk-i19). The RED corpus for the PROVER body's shape
// validator — the missing half that blocked the prover from reusing GAP 11's bounded schema repair
// (`{children:[...]}` had no `RawIssue[]`-producing validator, so there were no concrete issues to
// echo back to the worker).
//
// The schema under test is NOT invented: every rule below is derived from code that already
// requires it —
//   - `children` non-empty array          : src/drive/driver-prove-node.ts:48 (`!Array.isArray(kids)
//                                            || kids.length === 0` -> undefined) + the prompt's
//                                            "Provide at least one child."
//   - child.statement non-blank string     : driver-prove-node.ts:53 + af's `childSpec.statement`
//                                            (../vibefeld/cmd/af/refine.go)
//   - child.justification non-blank string : driver-prove-node.ts:55 (`length > 0`), mapped to af's
//                                            `inference` by src/drive/driver-af.ts:242
//   - child.depends string[]               : driver-prove-node.ts:56 + driver-af.ts's
//                                            `buildRecordProofChildren` (`#N` / absolute id)
// The two places this validator is deliberately STRICTER than `extractProofContent` (unknown keys,
// non-string `depends` entries) are called out in their own tests: both are silent-drop paths there,
// and this validator's job is to make the worker fix them rather than lose the content.

import { describe, expect, test } from "bun:test";
import { validateRawProverOutput } from "../../src/drive/prover-raw";
import { extractProofContent } from "../../src/drive/driver-prove-node";

const paths = (raw: unknown) => validateRawProverOutput(raw).map((i) => i.path);
const messages = (raw: unknown) => validateRawProverOutput(raw).map((i) => i.message).join(" | ");

describe("validateRawProverOutput — the shapes a prover body MUST have", () => {
  test("a minimal valid body ({children:[{statement}]}) has NO issues", () => {
    expect(validateRawProverOutput({ children: [{ statement: "Step A holds." }] })).toEqual([]);
  });

  test("a full valid body (justification + depends, both forms) has NO issues", () => {
    expect(
      validateRawProverOutput({
        children: [
          { statement: "Step A", justification: "by_definition" },
          { statement: "Step B", justification: "modus_ponens", depends: ["#0", "1.3"] },
        ],
      }),
    ).toEqual([]);
  });

  test("an empty depends array is fine (af omits it) — never a spurious issue", () => {
    expect(validateRawProverOutput({ children: [{ statement: "A", depends: [] }] })).toEqual([]);
  });
});

describe("validateRawProverOutput — every rejection names a CONCRETE path", () => {
  test("a non-object body (string / array / null / number) is refused at $", () => {
    for (const bad of ["just prose", [{ statement: "A" }], null, 7, true]) {
      expect(paths(bad)).toEqual(["$"]);
    }
  });

  test("a missing 'children' key is named at $.children", () => {
    expect(paths({})).toContain("$.children");
    expect(messages({})).toContain("children");
  });

  test("'children' present but not an array is named at $.children", () => {
    expect(paths({ children: { statement: "A" } })).toEqual(["$.children"]);
  });

  test("an EMPTY children array is refused — an empty decomposition records nothing", () => {
    expect(paths({ children: [] })).toEqual(["$.children"]);
    expect(messages({ children: [] })).toContain("AT LEAST ONE");
  });

  test("a non-object child is named at its INDEX", () => {
    expect(paths({ children: [{ statement: "A" }, "step two"] })).toEqual(["$.children[1]"]);
  });

  test("a missing / blank / non-string statement is named at that child's .statement", () => {
    expect(paths({ children: [{}] })).toEqual(["$.children[0].statement"]);
    expect(paths({ children: [{ statement: "   " }] })).toEqual(["$.children[0].statement"]);
    expect(paths({ children: [{ statement: 12 }] })).toEqual(["$.children[0].statement"]);
  });

  test("a blank / non-string justification is named — it is optional, but never blank when present", () => {
    expect(paths({ children: [{ statement: "A", justification: "" }] })).toEqual(["$.children[0].justification"]);
    expect(paths({ children: [{ statement: "A", justification: "  " }] })).toEqual(["$.children[0].justification"]);
    expect(paths({ children: [{ statement: "A", justification: 3 }] })).toEqual(["$.children[0].justification"]);
    // omitted entirely is fine — it is genuinely optional
    expect(validateRawProverOutput({ children: [{ statement: "A" }] })).toEqual([]);
  });

  test("a non-array 'depends' is named at that child's .depends", () => {
    expect(paths({ children: [{ statement: "A", depends: "1.3" }] })).toEqual(["$.children[0].depends"]);
  });

  test("EVERY defect is reported, not just the first — a repair prompt must list them all", () => {
    const out = validateRawProverOutput({ children: [{ justification: "" }, { statement: "B", depends: 4 }] });
    expect(out.map((i) => i.path).sort()).toEqual([
      "$.children[0].justification",
      "$.children[0].statement",
      "$.children[1].depends",
    ]);
  });

  test("never throws on hostile input (deeply nested, exotic values)", () => {
    expect(() => validateRawProverOutput({ children: [{ statement: { a: { b: [1, 2] } } }] })).not.toThrow();
    expect(() => validateRawProverOutput(undefined)).not.toThrow();
  });
});

// The two STRICTER-than-extractProofContent rules. Both are silent-drop paths in
// `extractProofContent`: the content is discarded and the turn still counts as usable, so the worker
// is never told and the proof DAG quietly loses information. The validator makes them repairable.
describe("validateRawProverOutput — no silent smuggling, no silent drops (checkNoExtraKeys discipline)", () => {
  // rk-xfzg: extractProofContent now DEFERS to this validator (calls it internally and returns
  // `undefined` on any issue) — a body this validator refuses is now a REJECTION at extraction time
  // too, never a silent partial acceptance. These three were previously asserting the OLD
  // silent-drop behavior (the content vanished, the turn still counted as usable); they now assert
  // the closed gap instead.
  test("an unknown TOP-LEVEL key is refused outright — driver-owned fields never belong in worker output", () => {
    const out = validateRawProverOutput({ children: [{ statement: "A" }], itemId: "1.2", contentHash: "f".repeat(64) });
    expect(out.map((i) => i.path).sort()).toEqual(["$.contentHash", "$.itemId"]);
    // ...and `extractProofContent` now rejects the very same body outright, rather than silently
    // accepting it with the unknown keys dropped.
    expect(extractProofContent({ children: [{ statement: "A" }], itemId: "1.2" })).toBeUndefined();
  });

  test("an unknown CHILD key is refused — af's own 'inference' spelling would otherwise be silently dropped", () => {
    // A prover writing af's field name instead of the prompt's `justification` would have lost its
    // derivation label entirely under the old extractProofContent (it copied only the three known
    // keys); now the whole body is rejected instead, so the loss is never silent.
    expect(paths({ children: [{ statement: "A", inference: "modus_ponens" }] })).toEqual(["$.children[0].inference"]);
    expect(extractProofContent({ children: [{ statement: "A", inference: "modus_ponens" }] })).toBeUndefined();
  });

  test("a non-string 'depends' ENTRY is refused at its own index — extractProofContent rejects it, never drops it", () => {
    expect(paths({ children: [{ statement: "A", depends: ["#0", 1, null] }] })).toEqual([
      "$.children[0].depends[1]",
      "$.children[0].depends[2]",
    ]);
    // The silent-drop this guards against: a mis-wired dependency vanishing while the proof is
    // recorded anyway. Now the whole body is rejected instead of silently losing the bad entry.
    expect(extractProofContent({ children: [{ statement: "A", depends: ["#0", 1] }] })).toBeUndefined();
  });

  test("a blank 'depends' entry is refused too (af would receive an empty reference)", () => {
    expect(paths({ children: [{ statement: "A", depends: ["  "] }] })).toEqual(["$.children[0].depends[0]"]);
  });
});

// These messages are echoed VERBATIM to the prover by the repair reprompt, so they are part of a
// prover prompt's bytes. src/drive/driver-guardrails.ts's `detectProverOverreach` depends on a prover
// never being ASKED for a verdict; the same word ban that governs `buildProverTurnPrompt`
// (test/drive/driver-prompts.test.ts) therefore governs every message this validator can emit.
describe("validateRawProverOutput — messages are self-teaching AND free of verdict vocabulary", () => {
  const FORBIDDEN = ["verdict", "accept", "challenge", "valid", "invalid", "outcome"];
  const EVERY_DEFECT = {
    children: [
      { justification: "", depends: [1, "  "] },
      { statement: "  ", inference: "x" },
      "not an object",
    ],
    itemId: "smuggled",
  };

  test("no message anywhere uses verdict vocabulary (the overreach guard's precondition)", () => {
    const all = [
      messages(EVERY_DEFECT),
      messages("prose"),
      messages({}),
      messages({ children: [] }),
      messages({ children: [{ statement: "A", depends: "x" }] }),
    ].join(" ").toLowerCase();
    for (const word of FORBIDDEN) expect(all).not.toContain(word);
  });

  test("the statement message TEACHES the fix, not merely the field name", () => {
    expect(messages({ children: [{}] })).toContain("non-blank string");
    expect(messages({ children: [{}] })).toContain("statement");
  });

  test("the depends message teaches BOTH reference forms (absolute id and the #N sibling ref)", () => {
    const m = messages({ children: [{ statement: "A", depends: [1] }] });
    expect(m).toContain("#0");
    expect(m).toContain("#N");
  });

  test("the unknown-key message names the offending key so the worker can remove exactly it", () => {
    expect(messages({ children: [{ statement: "A" }], itemId: "x" })).toContain("'itemId'");
  });
});
