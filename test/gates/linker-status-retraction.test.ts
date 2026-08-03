// rk-0ehr / P1: Gate 2 Check 8 (status propagation, the monotone-trust rigour ladder) under a live
// `af-canonical` retraction. Ratified semantics (docs/memos/2026-08-03-rk-improvement-plan-from-
// aism.md §P1): "status demotes and propagation cascades exactly as an INVALID would". Concretely
// — a retracted `af: validated` shard is no longer AVAILABLE to its dependents, and the retracted
// shard's own `af: validated` claim is itself an ERROR (the AISM headline defect: the shard still
// read validated while a retraction stood against it).

import { describe, expect, test } from "bun:test";
import { checkStatus, isAvailable } from "../../src/gates/linker-graph";
import type { Lemma } from "../../src/gates/linker-parse";
import type { RetractionRecord } from "../../src/drive/retraction-record";

function lemma(overrides: Partial<Lemma> = {}): Lemma {
  return {
    id: "lem-x", path: "argument/lemmas/lem-x.md", kind: "lemma", status: "proved", af: "validated",
    contract: "X holds.", defs: [], deps: [], routes: [], balloons: { count: 0, classifications: [] },
    ...overrides,
  };
}

function retraction(itemId: string): RetractionRecord {
  return {
    schemaVersion: "1", ordinal: 0, itemId, contentHash: "a".repeat(64), hashDomain: "af-canonical",
    retractedBy: "audit:2026-07-28-independent-sweep", reason: "independent sweep found the proof defective",
  };
}

const BASE: [Lemma, Lemma] = [
  lemma({ id: "lem-dep", path: "argument/lemmas/lem-dep.md" }),
  lemma({ id: "lem-user", path: "argument/lemmas/lem-user.md", deps: ["lem-dep"] }),
];

describe("isAvailable — a retracted dep is not available", () => {
  const afOf = new Map([["lem-dep", "validated"]]);
  const statusOf = new Map<string, string | undefined>([["lem-dep", "proved"]]);

  test("baseline: an af-validated dep is available", () => {
    expect(isAvailable("lem-dep", afOf, statusOf, new Set())).toBe(true);
  });

  test("a live af-canonical retraction makes it unavailable, exactly as if it were unvalidated", () => {
    expect(isAvailable("lem-dep", afOf, statusOf, new Set(["lem-dep"]))).toBe(false);
  });

  test("even a ground-truth `cited` leaf is unavailable once retracted", () => {
    const cited = new Map<string, string | undefined>([["lem-dep", "cited"]]);
    expect(isAvailable("lem-dep", new Map([["lem-dep", "none"]]), cited, new Set())).toBe(true);
    expect(isAvailable("lem-dep", new Map([["lem-dep", "none"]]), cited, new Set(["lem-dep"]))).toBe(false);
  });
});

describe("checkStatus — propagation cascades from a retraction", () => {
  test("baseline: no retractions -> the validated chain is clean", () => {
    expect(checkStatus([...BASE])).toEqual([]);
  });

  test("retracting the dep makes the DEPENDENT's af=validated claim an ERROR", () => {
    const findings = checkStatus([...BASE], new Map([["lem-dep", retraction("lem-dep")]]));
    const dependent = findings.filter((f) => f.path === "argument/lemmas/lem-user.md");
    expect(dependent).toHaveLength(1);
    expect(dependent[0]!.severity).toBe("ERROR");
    expect(dependent[0]!.message).toContain("dep(s) not validated");
    expect(dependent[0]!.message).toContain("lem-dep");
  });

  test("the RETRACTED shard's own af=validated claim is itself an ERROR naming who and why", () => {
    const findings = checkStatus([...BASE], new Map([["lem-dep", retraction("lem-dep")]]));
    const own = findings.filter((f) => f.path === "argument/lemmas/lem-dep.md");
    expect(own).toHaveLength(1);
    expect(own[0]!.severity).toBe("ERROR");
    expect(own[0]!.message).toContain("retracted");
    expect(own[0]!.message).toContain("audit:2026-07-28-independent-sweep");
    expect(own[0]!.message).toContain("independent sweep found the proof defective");
  });

  test("a retracted shard that does NOT claim af: validated produces no own-ERROR (nothing to demote)", () => {
    const lemmas = [lemma({ id: "lem-dep", path: "argument/lemmas/lem-dep.md", af: "none", status: "stated" })];
    expect(checkStatus(lemmas, new Map([["lem-dep", retraction("lem-dep")]]))).toEqual([]);
  });

  test("a route is no longer satisfied once one of its members is retracted", () => {
    const lemmas = [
      lemma({ id: "lem-a", path: "argument/lemmas/lem-a.md" }),
      lemma({ id: "lem-b", path: "argument/lemmas/lem-b.md" }),
      lemma({ id: "lem-r", path: "argument/lemmas/lem-r.md", routes: [["lem-a"], ["lem-b"]] }),
    ];
    expect(checkStatus(lemmas)).toEqual([]);
    const bothRetracted = new Map([["lem-a", retraction("lem-a")], ["lem-b", retraction("lem-b")]]);
    const findings = checkStatus(lemmas, bothRetracted);
    expect(findings.some((f) => f.path === "argument/lemmas/lem-r.md" && f.message.includes("no route is fully validated"))).toBe(true);
  });
});
