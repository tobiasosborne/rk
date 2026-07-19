// Unit tests for src/gates/linker-crossvendor.ts (M3.8, deliverable 2) — Gate 2's continuous
// critical-path provenance check (PRD C2/C9). See corpus/linker/linker-31..38 for the end-to-end
// fixtures through linkerGate.run; these tests isolate the pure decision logic directly against
// injected `RootIdentityFacts`, so the family-comparison branches are exercised without needing a
// real ledger tree.

import { describe, expect, test } from "bun:test";
import { checkCriticalPathProvenance } from "../../src/gates/linker-crossvendor";
import type { Lemma } from "../../src/gates/linker-parse";
import type { RootIdentityFacts } from "../../src/gates/linker-workspace";

const GPT_SEAM_A = "gpt|codex|gpt-5.6|s1";
const GPT_SEAM_B = "gpt|codex|gpt-5.6|s2";
const CLAUDE_SEAM = "claude|claude-code|opus|s3";

function lemma(id: string, o: Partial<Lemma> = {}): Lemma {
  return {
    id,
    path: `argument/${id}.md`,
    kind: "lemma",
    af: "none",
    contract: id,
    defs: [],
    deps: [],
    routes: [],
    ...o,
  };
}

/** `validated: true` by default — every scenario below is "the node WAS validated" unless a test
 * explicitly overrides it, matching the real-world default (this check only ever runs against
 * `af: validated` shards to begin with). */
function facts(o: Partial<RootIdentityFacts> = {}): RootIdentityFacts {
  return { validated: true, ...o };
}

const NORTH_STAR = "thm-main";

describe("checkCriticalPathProvenance — presence-conditional on northStarId", () => {
  test("northStarId absent -> zero findings, northStarConfigured false", () => {
    const r = checkCriticalPathProvenance([lemma(NORTH_STAR)], undefined, new Map());
    expect(r).toEqual({ findings: [], checked: 0, criticalPathSize: 0, northStarConfigured: false, northStarFound: false });
  });

  test("northStarId configured but resolves to no real node -> zero findings, northStarFound false", () => {
    const r = checkCriticalPathProvenance([lemma("lem-a")], "does-not-exist", new Map());
    expect(r.northStarConfigured).toBe(true);
    expect(r.northStarFound).toBe(false);
    expect(r.findings).toEqual([]);
  });
});

describe("checkCriticalPathProvenance — family comparison", () => {
  const lemmas = [lemma(NORTH_STAR, { deps: ["lem-x"], af: "validated" }), lemma("lem-x", { af: "validated" })];

  test("same family, both parseable, POST-convention (no legacy marker) -> ERROR", () => {
    const identityOf = new Map<string, RootIdentityFacts>([
      [NORTH_STAR, facts({ author: GPT_SEAM_A, validatedBy: GPT_SEAM_B })],
      ["lem-x", facts({ author: GPT_SEAM_A, validatedBy: GPT_SEAM_B })],
    ]);
    const r = checkCriticalPathProvenance(lemmas, NORTH_STAR, identityOf);
    expect(r.checked).toBe(2);
    expect(r.findings.length).toBe(2);
    for (const f of r.findings) {
      expect(f.severity).toBe("ERROR");
      expect(f.message).toContain("same-family");
    }
  });

  test("different families -> satisfied, zero findings", () => {
    const identityOf = new Map<string, RootIdentityFacts>([
      [NORTH_STAR, facts({ author: CLAUDE_SEAM, validatedBy: GPT_SEAM_B })],
      ["lem-x", facts({ author: CLAUDE_SEAM, validatedBy: GPT_SEAM_B })],
    ]);
    const r = checkCriticalPathProvenance(lemmas, NORTH_STAR, identityOf);
    expect(r.checked).toBe(2);
    expect(r.findings).toEqual([]);
  });

  test("no parseable seam at all (AISM's real shape: validated=true, no identity fields) -> WARNING legacy-same-family, never ERROR", () => {
    const identityOf = new Map<string, RootIdentityFacts>([
      [NORTH_STAR, facts()], // validated, but no author/validatedBy at all
      ["lem-x", facts()],
    ]);
    const r = checkCriticalPathProvenance(lemmas, NORTH_STAR, identityOf);
    expect(r.checked).toBe(2);
    expect(r.findings.length).toBe(2);
    for (const f of r.findings) {
      expect(f.severity).toBe("WARN");
      expect(f.message).toContain("legacy-same-family");
    }
  });

  test("validated=true, validatedBy is free text (undecodable) -> WARNING legacy-same-family, never ERROR", () => {
    const identityOf = new Map<string, RootIdentityFacts>([
      [NORTH_STAR, facts({ validatedBy: "orchestrator" })],
      ["lem-x", facts({ validatedBy: "orchestrator" })],
    ]);
    const r = checkCriticalPathProvenance(lemmas, NORTH_STAR, identityOf);
    expect(r.checked).toBe(2);
    for (const f of r.findings) expect(f.severity).toBe("WARN");
  });

  test("same family, both parseable, BUT explicit 'provenance: legacy-same-family' marker -> WARNING not ERROR", () => {
    const marked = [
      lemma(NORTH_STAR, { deps: ["lem-x"], af: "validated" }),
      lemma("lem-x", { af: "validated", provenance: "retrofit note; legacy-same-family" }),
    ];
    const identityOf = new Map<string, RootIdentityFacts>([
      [NORTH_STAR, facts({ author: GPT_SEAM_A, validatedBy: GPT_SEAM_B })],
      ["lem-x", facts({ author: GPT_SEAM_A, validatedBy: GPT_SEAM_B })],
    ]);
    const r = checkCriticalPathProvenance(marked, NORTH_STAR, identityOf);
    const lemXFinding = r.findings.find((f) => f.path === "argument/lem-x.md")!;
    expect(lemXFinding.severity).toBe("WARN");
    expect(lemXFinding.message).toContain("legacy-same-family");
  });
});

describe("checkCriticalPathProvenance — batch-validation flag", () => {
  test("validationBatchId present on a critical-path node -> WARNING, independent of family", () => {
    const lemmas = [lemma(NORTH_STAR, { deps: ["lem-x"], af: "validated" }), lemma("lem-x", { af: "validated" })];
    const identityOf = new Map<string, RootIdentityFacts>([
      [NORTH_STAR, facts({ author: CLAUDE_SEAM, validatedBy: GPT_SEAM_B })],
      ["lem-x", facts({ author: CLAUDE_SEAM, validatedBy: GPT_SEAM_B, validationBatchId: "batch-7" })],
    ]);
    const r = checkCriticalPathProvenance(lemmas, NORTH_STAR, identityOf);
    const batchFindings = r.findings.filter((f) => f.message.includes("batch"));
    expect(batchFindings.length).toBe(1);
    expect(batchFindings[0]!.severity).toBe("WARN");
    expect(batchFindings[0]!.path).toBe("argument/lem-x.md");
  });
});

describe("checkCriticalPathProvenance — scope: only validated, introspectable, critical-path nodes", () => {
  test("a node NOT on the critical path is never checked, even if same-family", () => {
    const lemmas = [lemma(NORTH_STAR, { af: "validated" }), lemma("lem-off-path", { af: "validated" })];
    const identityOf = new Map<string, RootIdentityFacts>([
      [NORTH_STAR, facts({ author: GPT_SEAM_A, validatedBy: GPT_SEAM_B })],
      ["lem-off-path", facts({ author: GPT_SEAM_A, validatedBy: GPT_SEAM_B })], // same-family, but irrelevant: off-path
    ]);
    const r = checkCriticalPathProvenance(lemmas, NORTH_STAR, identityOf);
    expect(r.checked).toBe(1); // only the north star itself
    expect(r.findings.length).toBe(1);
    expect(r.findings[0]!.path).toBe(`argument/${NORTH_STAR}.md`);
  });

  test("a critical-path node whose af is not 'validated' is skipped (nothing to check yet)", () => {
    const lemmas = [lemma(NORTH_STAR, { deps: ["lem-x"], af: "validated" }), lemma("lem-x", { af: "seeded" })];
    const identityOf = new Map<string, RootIdentityFacts>([[NORTH_STAR, facts({ author: GPT_SEAM_A, validatedBy: GPT_SEAM_B })]]);
    const r = checkCriticalPathProvenance(lemmas, NORTH_STAR, identityOf);
    expect(r.checked).toBe(1);
  });

  test("a critical-path node with no introspectable identity at all is skipped (orphan/contract checks own that gap)", () => {
    const lemmas = [lemma(NORTH_STAR, { deps: ["lem-x"], af: "validated" }), lemma("lem-x", { af: "validated" })];
    const identityOf = new Map<string, RootIdentityFacts>([[NORTH_STAR, facts({ author: GPT_SEAM_A, validatedBy: GPT_SEAM_B })]]);
    const r = checkCriticalPathProvenance(lemmas, NORTH_STAR, identityOf);
    expect(r.checked).toBe(1);
    expect(r.findings.every((f) => f.path !== "argument/lem-x.md")).toBe(true);
  });

  test("a node never itself validated (facts present, validated: false) is skipped, never conflated with 'validated but anonymous'", () => {
    const lemmas = [lemma(NORTH_STAR, { af: "validated" })];
    const identityOf = new Map<string, RootIdentityFacts>([[NORTH_STAR, { author: GPT_SEAM_A, validated: false }]]);
    const r = checkCriticalPathProvenance(lemmas, NORTH_STAR, identityOf);
    expect(r.checked).toBe(0);
    expect(r.findings).toEqual([]);
  });
});
