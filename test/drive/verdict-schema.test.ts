// 1:1 test file for src/drive/verdict-schema.ts. Ground truth: schemas/verdict.v1.json +
// docs/worker-contract.md section (c). L1 (red-green): every rejection class below was written
// against the schema's stated constraints and confirmed to fail before the corresponding branch
// in verdict-schema.ts existed (M3.1 landing commit). The "single-field corruption" suite is the
// property test the WP brief asked for: a valid document validates clean, and *every* leaf field,
// corrupted one at a time, is rejected loudly (non-empty issues) — the round-trip half of the
// same property is `JSON.parse(JSON.stringify(doc))` producing an identical clean result.

import { describe, expect, test } from "bun:test";
import { validateVerdictDocument, type VerdictIssue } from "../../src/drive/verdict-schema";

function validL5Doc(): Record<string, unknown> {
  return {
    schema_version: "1",
    verifier: { modelFamily: "codex", model: "codex-5.6-sol", backend: "codex", sessionId: "sess-abc123" },
    verdicts: [
      {
        itemId: "lem-halo-collapse",
        tier: "l5",
        contentHash: "a".repeat(64),
        justification: "Statement matches the shard's stated dependencies; checked against def-halo.",
        verdict: "VALID-WITH-CORRECTION",
      },
    ],
  };
}

function validHardAcceptDoc(): Record<string, unknown> {
  return {
    schema_version: "1",
    batchId: "batch-2026-07-19-01",
    verifier: { modelFamily: "claude", model: "claude-sonnet-5-20260115", backend: "claude", sessionId: "sess-xyz789" },
    verdicts: [
      {
        itemId: "node-14",
        tier: "hard",
        contentHash: "b".repeat(64),
        justification: "Dependency chain verified against nodes 12 and 13, both already validated.",
        verdict: { outcome: "accept", note: "Minor wording tightened, no substantive change." },
      },
    ],
  };
}

function validHardChallengeDoc(): Record<string, unknown> {
  return {
    schema_version: "1",
    verifier: { modelFamily: "gpt", model: "gpt-5.6-sol-xhigh", backend: "codex", sessionId: "sess-ch01" },
    verdicts: [
      {
        itemId: "node-22",
        tier: "hard",
        contentHash: "c".repeat(64),
        justification: "Step 3 assumes injectivity that is never established in this subtree.",
        verdict: { outcome: "challenge", target: "node-22-step-3", severity: "major", reason: "Unjustified injectivity assumption.", category: "gap" },
      },
    ],
  };
}

describe("validateVerdictDocument — valid documents", () => {
  test("l5-tier document has zero issues and round-trips through JSON unchanged", () => {
    const doc = validL5Doc();
    expect(validateVerdictDocument(doc)).toEqual([]);
    const roundTripped = JSON.parse(JSON.stringify(doc));
    expect(validateVerdictDocument(roundTripped)).toEqual([]);
  });

  test("hard-tier accept document has zero issues", () => {
    expect(validateVerdictDocument(validHardAcceptDoc())).toEqual([]);
  });

  test("hard-tier accept document is valid WITHOUT the optional note", () => {
    const doc = validHardAcceptDoc();
    const verdict = (doc.verdicts as any[])[0].verdict;
    delete verdict.note;
    expect(validateVerdictDocument(doc)).toEqual([]);
  });

  test("hard-tier challenge document has zero issues", () => {
    expect(validateVerdictDocument(validHardChallengeDoc())).toEqual([]);
  });

  test("hard-tier challenge document is valid WITHOUT the optional category", () => {
    const doc = validHardChallengeDoc();
    delete (doc.verdicts as any[])[0].verdict.category;
    expect(validateVerdictDocument(doc)).toEqual([]);
  });

  test("batchId is optional — absent is valid (l5 doc has none)", () => {
    expect(validL5Doc().batchId).toBeUndefined();
    expect(validateVerdictDocument(validL5Doc())).toEqual([]);
  });

  test("a document with multiple verdict items (mixed tiers is NOT expected in practice but the schema does not forbid it structurally) validates each independently", () => {
    const doc = validL5Doc();
    (doc.verdicts as unknown[]).push((validHardAcceptDoc().verdicts as unknown[])[0]);
    expect(validateVerdictDocument(doc)).toEqual([]);
  });
});

function messages(issues: VerdictIssue[]): string {
  return issues.map((i) => `${i.path}: ${i.message}`).join(" | ");
}

describe("validateVerdictDocument — rejection classes", () => {
  test("non-object input (array) is rejected", () => {
    const issues = validateVerdictDocument([1, 2, 3]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.path).toBe("$");
  });

  test("non-object input (null) is rejected", () => {
    expect(validateVerdictDocument(null).length).toBeGreaterThan(0);
  });

  test("non-object input (string) is rejected", () => {
    expect(validateVerdictDocument("not a document").length).toBeGreaterThan(0);
  });

  test("missing schema_version is rejected", () => {
    const doc = validL5Doc();
    delete doc.schema_version;
    const issues = validateVerdictDocument(doc);
    expect(messages(issues)).toContain("schema_version");
  });

  test("wrong schema_version value is rejected (e.g. a future version string)", () => {
    const doc = validL5Doc();
    doc.schema_version = "2";
    expect(messages(validateVerdictDocument(doc))).toContain("schema_version");
  });

  test("wrong schema_version type (number instead of string) is rejected", () => {
    const doc = validL5Doc();
    doc.schema_version = 1;
    expect(messages(validateVerdictDocument(doc))).toContain("schema_version");
  });

  test("unknown top-level property is rejected", () => {
    const doc = validL5Doc();
    (doc as any).extraField = "not in the schema";
    expect(messages(validateVerdictDocument(doc))).toContain("unknown property 'extraField'");
  });

  test("missing verifier is rejected", () => {
    const doc = validL5Doc();
    delete doc.verifier;
    expect(messages(validateVerdictDocument(doc))).toContain("verifier");
  });

  test("verifier missing a required field is rejected", () => {
    const doc = validL5Doc();
    delete (doc.verifier as any).sessionId;
    expect(messages(validateVerdictDocument(doc))).toContain("verifier.sessionId");
  });

  test("verifier with an unknown property is rejected", () => {
    const doc = validL5Doc();
    (doc.verifier as any).extra = "nope";
    expect(messages(validateVerdictDocument(doc))).toContain("unknown property 'extra'");
  });

  test("verifier.modelFamily outside the closed enum is rejected", () => {
    const doc = validL5Doc();
    (doc.verifier as any).modelFamily = "mistral";
    expect(messages(validateVerdictDocument(doc))).toContain("verifier.modelFamily");
  });

  test("verifier.sessionId blank is rejected", () => {
    const doc = validL5Doc();
    (doc.verifier as any).sessionId = "";
    expect(messages(validateVerdictDocument(doc))).toContain("verifier.sessionId");
  });

  test("missing verdicts is rejected", () => {
    const doc = validL5Doc();
    delete doc.verdicts;
    expect(messages(validateVerdictDocument(doc))).toContain("verdicts");
  });

  test("verdicts not an array is rejected", () => {
    const doc = validL5Doc();
    doc.verdicts = { not: "an array" };
    expect(messages(validateVerdictDocument(doc))).toContain("$.verdicts");
  });

  test("verdict item with an unrecognized tier is rejected", () => {
    const doc = validL5Doc();
    (doc.verdicts as any[])[0].tier = "medium";
    expect(messages(validateVerdictDocument(doc))).toContain("tier");
  });

  test("verdict item missing itemId is rejected", () => {
    const doc = validL5Doc();
    delete (doc.verdicts as any[])[0].itemId;
    expect(messages(validateVerdictDocument(doc))).toContain("itemId");
  });

  test("verdict item with an unknown property is rejected", () => {
    const doc = validL5Doc();
    (doc.verdicts as any[])[0].extra = "nope";
    expect(messages(validateVerdictDocument(doc))).toContain("unknown property 'extra'");
  });

  test("contentHash with the wrong length is rejected", () => {
    const doc = validL5Doc();
    (doc.verdicts as any[])[0].contentHash = "abc123";
    expect(messages(validateVerdictDocument(doc))).toContain("contentHash");
  });

  test("contentHash with uppercase hex is rejected (lowercase-only per schema)", () => {
    const doc = validL5Doc();
    (doc.verdicts as any[])[0].contentHash = "A".repeat(64);
    expect(messages(validateVerdictDocument(doc))).toContain("contentHash");
  });

  test("blank justification is rejected (PRD C3: mandatory per-item justification)", () => {
    const doc = validL5Doc();
    (doc.verdicts as any[])[0].justification = "";
    expect(messages(validateVerdictDocument(doc))).toContain("justification");
  });

  test("whitespace-only justification is rejected (minLength:1 alone would accept this)", () => {
    const doc = validL5Doc();
    (doc.verdicts as any[])[0].justification = "   \n\t  ";
    expect(messages(validateVerdictDocument(doc))).toContain("justification");
  });

  test("l5 verdict value outside the closed enum is rejected", () => {
    const doc = validL5Doc();
    (doc.verdicts as any[])[0].verdict = "MOSTLY-VALID";
    expect(messages(validateVerdictDocument(doc))).toContain("verdict");
  });

  test("hard verdict missing outcome is rejected", () => {
    const doc = validHardAcceptDoc();
    delete (doc.verdicts as any[])[0].verdict.outcome;
    expect(messages(validateVerdictDocument(doc))).toContain("outcome");
  });

  test("hard verdict with an invalid outcome value is rejected", () => {
    const doc = validHardAcceptDoc();
    (doc.verdicts as any[])[0].verdict.outcome = "maybe";
    expect(messages(validateVerdictDocument(doc))).toContain("outcome");
  });

  test("hard accept with an unknown property is rejected", () => {
    const doc = validHardAcceptDoc();
    (doc.verdicts as any[])[0].verdict.extra = "nope";
    expect(messages(validateVerdictDocument(doc))).toContain("unknown property 'extra'");
  });

  test("hard challenge missing target is rejected", () => {
    const doc = validHardChallengeDoc();
    delete (doc.verdicts as any[])[0].verdict.target;
    expect(messages(validateVerdictDocument(doc))).toContain("target");
  });

  test("hard challenge missing severity is rejected", () => {
    const doc = validHardChallengeDoc();
    delete (doc.verdicts as any[])[0].verdict.severity;
    expect(messages(validateVerdictDocument(doc))).toContain("severity");
  });

  test("hard challenge missing reason is rejected", () => {
    const doc = validHardChallengeDoc();
    delete (doc.verdicts as any[])[0].verdict.reason;
    expect(messages(validateVerdictDocument(doc))).toContain("reason");
  });

  test("hard challenge severity outside {critical,major,minor,note} is rejected", () => {
    const doc = validHardChallengeDoc();
    (doc.verdicts as any[])[0].verdict.severity = "urgent";
    expect(messages(validateVerdictDocument(doc))).toContain("severity");
  });

  test("hard challenge category outside the closed enum is rejected", () => {
    const doc = validHardChallengeDoc();
    (doc.verdicts as any[])[0].verdict.category = "vibes";
    expect(messages(validateVerdictDocument(doc))).toContain("category");
  });

  test("hard challenge with an unknown property is rejected", () => {
    const doc = validHardChallengeDoc();
    (doc.verdicts as any[])[0].verdict.extra = "nope";
    expect(messages(validateVerdictDocument(doc))).toContain("unknown property 'extra'");
  });

  test("blank batchId is rejected", () => {
    const doc = validHardAcceptDoc();
    doc.batchId = "";
    expect(messages(validateVerdictDocument(doc))).toContain("batchId");
  });
});

// --- Property test: single-field corruption is always rejected loudly -----------------------
//
// No fast-check dependency (CLAUDE.md L4, zero runtime deps) — this is a deterministic
// enumeration over every leaf field a valid document has, corrupting exactly one at a time
// (delete it, or replace it with an obviously-wrong-typed/valued alternative) and asserting the
// corrupted document is rejected. This is the "any single-field corruption is rejected loudly"
// property the WP brief asked for; the companion "a valid document round-trips" half is the
// `toEqual([])` assertions in the "valid documents" describe block above.

type Corruption = { label: string; apply: (doc: Record<string, unknown>) => void };

function deleteAt(doc: Record<string, unknown>, path: string[]): void {
  let cur: any = doc;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]!];
  delete cur[path[path.length - 1]!];
}

function setAt(doc: Record<string, unknown>, path: string[], value: unknown): void {
  let cur: any = doc;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]!];
  cur[path[path.length - 1]!] = value;
}

const L5_CORRUPTIONS: Corruption[] = [
  { label: "delete schema_version", apply: (d) => deleteAt(d, ["schema_version"]) },
  { label: "corrupt schema_version", apply: (d) => setAt(d, ["schema_version"], "0") },
  { label: "delete verifier", apply: (d) => deleteAt(d, ["verifier"]) },
  { label: "delete verifier.modelFamily", apply: (d) => deleteAt(d, ["verifier", "modelFamily"]) },
  { label: "corrupt verifier.modelFamily", apply: (d) => setAt(d, ["verifier", "modelFamily"], "llama") },
  { label: "delete verifier.model", apply: (d) => deleteAt(d, ["verifier", "model"]) },
  { label: "delete verifier.backend", apply: (d) => deleteAt(d, ["verifier", "backend"]) },
  { label: "delete verifier.sessionId", apply: (d) => deleteAt(d, ["verifier", "sessionId"]) },
  { label: "delete verdicts", apply: (d) => deleteAt(d, ["verdicts"]) },
  { label: "corrupt verdicts to non-array", apply: (d) => setAt(d, ["verdicts"], "nope") },
  { label: "delete verdicts[0].itemId", apply: (d) => deleteAt(d, ["verdicts", "0", "itemId"]) },
  { label: "delete verdicts[0].tier", apply: (d) => deleteAt(d, ["verdicts", "0", "tier"]) },
  { label: "corrupt verdicts[0].tier", apply: (d) => setAt(d, ["verdicts", "0", "tier"], "soft") },
  { label: "delete verdicts[0].contentHash", apply: (d) => deleteAt(d, ["verdicts", "0", "contentHash"]) },
  { label: "corrupt verdicts[0].contentHash", apply: (d) => setAt(d, ["verdicts", "0", "contentHash"], "xyz") },
  { label: "delete verdicts[0].justification", apply: (d) => deleteAt(d, ["verdicts", "0", "justification"]) },
  { label: "blank verdicts[0].justification", apply: (d) => setAt(d, ["verdicts", "0", "justification"], "") },
  { label: "delete verdicts[0].verdict", apply: (d) => deleteAt(d, ["verdicts", "0", "verdict"]) },
  { label: "corrupt verdicts[0].verdict", apply: (d) => setAt(d, ["verdicts", "0", "verdict"], "SOMEWHAT-VALID") },
];

describe("property: every single-field corruption of a valid l5 document is rejected", () => {
  for (const corruption of L5_CORRUPTIONS) {
    test(corruption.label, () => {
      const doc = validL5Doc();
      // The generic `path: string[]` walker above indexes arrays by their stringified index
      // ("0"), which works identically to a real array index in JS property access.
      corruption.apply(doc as any);
      const issues = validateVerdictDocument(doc);
      expect(issues.length).toBeGreaterThan(0);
    });
  }
});

const HARD_CHALLENGE_CORRUPTIONS: Corruption[] = [
  { label: "delete verdict.outcome", apply: (d) => deleteAt(d, ["verdicts", "0", "verdict", "outcome"]) },
  { label: "corrupt verdict.outcome", apply: (d) => setAt(d, ["verdicts", "0", "verdict", "outcome"], "reject") },
  { label: "delete verdict.target", apply: (d) => deleteAt(d, ["verdicts", "0", "verdict", "target"]) },
  { label: "blank verdict.target", apply: (d) => setAt(d, ["verdicts", "0", "verdict", "target"], "") },
  { label: "delete verdict.severity", apply: (d) => deleteAt(d, ["verdicts", "0", "verdict", "severity"]) },
  { label: "corrupt verdict.severity", apply: (d) => setAt(d, ["verdicts", "0", "verdict", "severity"], "blocker") },
  { label: "delete verdict.reason", apply: (d) => deleteAt(d, ["verdicts", "0", "verdict", "reason"]) },
  { label: "blank verdict.reason", apply: (d) => setAt(d, ["verdicts", "0", "verdict", "reason"], "") },
  { label: "corrupt verdict.category", apply: (d) => setAt(d, ["verdicts", "0", "verdict", "category"], "vibes") },
  { label: "add unknown key to verdict payload", apply: (d) => setAt(d, ["verdicts", "0", "verdict", "bogus"], true) },
];

describe("property: every single-field corruption of a valid hard-tier challenge document is rejected", () => {
  for (const corruption of HARD_CHALLENGE_CORRUPTIONS) {
    test(corruption.label, () => {
      const doc = validHardChallengeDoc();
      corruption.apply(doc as any);
      const issues = validateVerdictDocument(doc);
      expect(issues.length).toBeGreaterThan(0);
    });
  }
});
