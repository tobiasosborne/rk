// 1:1 test file for src/drive/verdict-schema.ts (shape (b), the driver-constructed verdict
// document). Ground truth: schemas/verdict.v1.json + docs/worker-contract.md's data-flow section.
//
// M3.1 REPAIR WAVE (Tier A review, 2026-07-19): this file replaces the pre-review version.
// Removed: the "mixed tiers in one document" test that USED TO ratify a two-item verdicts array
// (the review's blocker 3 flagged this as validating an impossible-under-contract shape — a
// session turn produces exactly one verdict; the batch cap limits turns, not verdicts-per-reply).
// Added: minItems:1/maxItems:1 cardinality tests, the closed `modelFamily` enum WITHOUT
// `codex`/`other` (blocker 5), and `VALID-WITH-CORRECTION`'s mandatory structured `correction`
// field (blocker 6). L1 (red-green): every rejection class was confirmed to fail before its
// corresponding branch existed; mutation-proving spot-checks are recorded in the landing commit
// message, not re-run per file per CLAUDE.md's "restore, confirm green" step already having
// happened once per check during authoring.

import { describe, expect, test } from "bun:test";
import { validateVerdictDocument, type VerdictIssue } from "../../src/drive/verdict-schema";

function validL5Doc(): Record<string, unknown> {
  return {
    schema_version: "1",
    verifier: { modelFamily: "gpt", model: "gpt-5.6-sol", backend: "codex", sessionId: "sess-abc123" },
    verdicts: [
      {
        itemId: "lem-halo-collapse",
        tier: "l5",
        contentHash: "a".repeat(64),
        justification: "Statement matches the shard's stated dependencies; checked against def-halo.",
        verdict: "INVALID",
      },
    ],
  };
}

function validL5CorrectionDoc(): Record<string, unknown> {
  return {
    schema_version: "1",
    verifier: { modelFamily: "gpt", model: "gpt-5.6-sol", backend: "codex", sessionId: "sess-corr01" },
    verdicts: [
      {
        itemId: "lem-halo-collapse",
        tier: "l5",
        contentHash: "a".repeat(64),
        justification: "Statement is correct once the sign in step 2 is flipped.",
        verdict: "VALID-WITH-CORRECTION",
        correction: { description: "Flipped the sign in step 2's inequality.", correctedContentHash: "d".repeat(64) },
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
    verifier: { modelFamily: "gemini", model: "gemini-3-pro", backend: "codex", sessionId: "sess-ch01" },
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

function messages(issues: VerdictIssue[]): string {
  return issues.map((i) => `${i.path}: ${i.message}`).join(" | ");
}

describe("validateVerdictDocument — valid documents", () => {
  test("l5-tier plain document has zero issues and round-trips through JSON unchanged", () => {
    const doc = validL5Doc();
    expect(validateVerdictDocument(doc)).toEqual([]);
    expect(validateVerdictDocument(JSON.parse(JSON.stringify(doc)))).toEqual([]);
  });

  test("l5-tier VALID-WITH-CORRECTION document (with structured correction) has zero issues", () => {
    expect(validateVerdictDocument(validL5CorrectionDoc())).toEqual([]);
  });

  test("hard-tier accept document has zero issues", () => {
    expect(validateVerdictDocument(validHardAcceptDoc())).toEqual([]);
  });

  test("hard-tier accept document is valid WITHOUT the optional note", () => {
    const doc = validHardAcceptDoc();
    delete (doc.verdicts as any[])[0].verdict.note;
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
});

describe("validateVerdictDocument — rejection classes", () => {
  test("non-object input (array) is rejected", () => {
    const issues = validateVerdictDocument([1, 2, 3]);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.path).toBe("$");
  });

  test("non-object input (null) is rejected", () => {
    expect(validateVerdictDocument(null).length).toBeGreaterThan(0);
  });

  test("missing schema_version is rejected", () => {
    const doc = validL5Doc();
    delete doc.schema_version;
    expect(messages(validateVerdictDocument(doc))).toContain("schema_version");
  });

  test("wrong schema_version value is rejected", () => {
    const doc = validL5Doc();
    doc.schema_version = "2";
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

  test("verifier.modelFamily 'codex' is rejected (blocker 5: codex is a backend, not a family)", () => {
    const doc = validL5Doc();
    (doc.verifier as any).modelFamily = "codex";
    expect(messages(validateVerdictDocument(doc))).toContain("verifier.modelFamily");
  });

  test("verifier.modelFamily 'other' is rejected (blocker 5: catch-all removed, closed enum only)", () => {
    const doc = validL5Doc();
    (doc.verifier as any).modelFamily = "other";
    expect(messages(validateVerdictDocument(doc))).toContain("verifier.modelFamily");
  });

  test("verifier.modelFamily outside the closed enum entirely is rejected", () => {
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

  test("empty verdicts array is rejected (minItems:1 — blocker 3)", () => {
    const doc = validL5Doc();
    doc.verdicts = [];
    expect(messages(validateVerdictDocument(doc))).toContain("minItems:1");
  });

  test("verdicts array with two entries is rejected (maxItems:1 — blocker 3, one verdict per call)", () => {
    const doc = validL5Doc();
    (doc.verdicts as unknown[]).push((validHardAcceptDoc().verdicts as unknown[])[0]);
    expect(messages(validateVerdictDocument(doc))).toContain("maxItems:1");
  });

  test("verdicts array with two entries sharing the same itemId is rejected (duplicate-itemId class, caught by the same maxItems bound)", () => {
    const doc = validL5Doc();
    const first = (doc.verdicts as any[])[0];
    (doc.verdicts as unknown[]).push({ ...first }); // identical itemId, duplicated
    const issues = validateVerdictDocument(doc);
    expect(issues.length).toBeGreaterThan(0);
    expect(messages(issues)).toContain("$.verdicts");
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

  test("whitespace-only justification is rejected", () => {
    const doc = validL5Doc();
    (doc.verdicts as any[])[0].justification = "   \n\t  ";
    expect(messages(validateVerdictDocument(doc))).toContain("justification");
  });

  test("l5 verdict value outside the closed enum is rejected", () => {
    const doc = validL5Doc();
    (doc.verdicts as any[])[0].verdict = "MOSTLY-VALID";
    expect(messages(validateVerdictDocument(doc))).toContain("verdict");
  });

  test("VALID-WITH-CORRECTION without a correction field is rejected (blocker 6)", () => {
    const doc = validL5CorrectionDoc();
    delete (doc.verdicts as any[])[0].correction;
    expect(messages(validateVerdictDocument(doc))).toContain("correction");
  });

  test("correction field present on a plain VALID verdict is rejected (forbidden except on VALID-WITH-CORRECTION)", () => {
    const doc = validL5Doc(); // verdict: INVALID
    (doc.verdicts as any[])[0].verdict = "VALID";
    (doc.verdicts as any[])[0].correction = { description: "x", correctedContentHash: "e".repeat(64) };
    expect(messages(validateVerdictDocument(doc))).toContain("correction");
  });

  test("correction.description missing is rejected", () => {
    const doc = validL5CorrectionDoc();
    delete (doc.verdicts as any[])[0].correction.description;
    expect(messages(validateVerdictDocument(doc))).toContain("correction.description");
  });

  test("correction.correctedContentHash malformed is rejected", () => {
    const doc = validL5CorrectionDoc();
    (doc.verdicts as any[])[0].correction.correctedContentHash = "not-a-hash";
    expect(messages(validateVerdictDocument(doc))).toContain("correction.correctedContentHash");
  });

  test("correction with an unknown property is rejected", () => {
    const doc = validL5CorrectionDoc();
    (doc.verdicts as any[])[0].correction.extra = "nope";
    expect(messages(validateVerdictDocument(doc))).toContain("unknown property 'extra'");
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
// No fast-check dependency (CLAUDE.md L4) — deterministic enumeration over every leaf field a
// valid document has, corrupting exactly one at a time, asserting rejection. Companion to the
// "valid documents" describe block's `toEqual([])` round-trip assertions above.

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
  { label: "corrupt verifier.modelFamily to codex", apply: (d) => setAt(d, ["verifier", "modelFamily"], "codex") },
  { label: "delete verifier.model", apply: (d) => deleteAt(d, ["verifier", "model"]) },
  { label: "delete verifier.backend", apply: (d) => deleteAt(d, ["verifier", "backend"]) },
  { label: "delete verifier.sessionId", apply: (d) => deleteAt(d, ["verifier", "sessionId"]) },
  { label: "delete verdicts", apply: (d) => deleteAt(d, ["verdicts"]) },
  { label: "corrupt verdicts to non-array", apply: (d) => setAt(d, ["verdicts"], "nope") },
  { label: "empty verdicts array", apply: (d) => setAt(d, ["verdicts"], []) },
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
      corruption.apply(doc as any);
      expect(validateVerdictDocument(doc).length).toBeGreaterThan(0);
    });
  }
});

const L5_CORRECTION_CORRUPTIONS: Corruption[] = [
  { label: "delete correction entirely", apply: (d) => deleteAt(d, ["verdicts", "0", "correction"]) },
  { label: "delete correction.description", apply: (d) => deleteAt(d, ["verdicts", "0", "correction", "description"]) },
  { label: "blank correction.description", apply: (d) => setAt(d, ["verdicts", "0", "correction", "description"], "") },
  { label: "delete correction.correctedContentHash", apply: (d) => deleteAt(d, ["verdicts", "0", "correction", "correctedContentHash"]) },
  { label: "corrupt correction.correctedContentHash", apply: (d) => setAt(d, ["verdicts", "0", "correction", "correctedContentHash"], "short") },
  { label: "add unknown key to correction", apply: (d) => setAt(d, ["verdicts", "0", "correction", "bogus"], true) },
];

describe("property: every single-field corruption of a valid l5 VALID-WITH-CORRECTION document is rejected", () => {
  for (const corruption of L5_CORRECTION_CORRUPTIONS) {
    test(corruption.label, () => {
      const doc = validL5CorrectionDoc();
      corruption.apply(doc as any);
      expect(validateVerdictDocument(doc).length).toBeGreaterThan(0);
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
      expect(validateVerdictDocument(doc).length).toBeGreaterThan(0);
    });
  }
});
