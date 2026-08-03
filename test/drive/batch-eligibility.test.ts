// 1:1 test file for src/drive/batch-eligibility.ts (rk-74o / M3 review follow-up 3). Ground truth:
// PRD §4 C3's guardrail list ("routine, logically independent items only ... critical-path
// exclusion ... batch cap ... batch provenance") and §10's "Batch-verification risk" paragraph
// ("shipping batching without them is a validity-barrier violation"), IMPLEMENTATION_PLAN.md
// M3.4's acceptance bar, and docs/reviews/2026-07-19-m3-milestone-review-codex.md follow-up 3
// ("make eligibility structural rather than a caller promise") plus its verdict (a) ("registry
// critical path is the primary C3 notion, with af crux/ancestry as an additional filter").
//
// Every test here is a REFUSAL test: the screen's job is to say no, name the constraint that said
// it, and distinguish a DETERMINED no from an INDETERMINATE one (the src/drive/cross-vendor.ts
// `identity-unparseable` vs `same-family` discipline, applied to eligibility).

import { describe, expect, test } from "bun:test";
import {
  afNodeKey, afProofTreeDependent, describeExclusion, EXCLUSION_DETERMINACY, screenCandidates,
  type BatchCandidate, type EligibleCandidate,
} from "../../src/drive/batch-eligibility";
import type { GraphDocument, RegistryNode } from "../../src/graph/types";
import { GRAPH_SCHEMA_VERSION } from "../../src/graph/types";

function regNode(id: string, overrides: Partial<RegistryNode> = {}): RegistryNode {
  return {
    id,
    kind: "lemma",
    path: `argument/${id}.md`,
    contract: `${id} holds.`,
    af: "none",
    deps: [],
    routes: [],
    defs: [],
    balloons: { count: 0, classifications: [] },
    ...overrides,
  };
}

function doc(nodes: RegistryNode[]): GraphDocument {
  return { schema_version: GRAPH_SCHEMA_VERSION, nodes, edges: { af: [], bd: [], fr: [], report: [], retraction: [] }, unresolved: [], conflicts: [] };
}

/** A fully-evidenced l5 candidate: the ONLY shape the screen ever lets through at that tier. */
function l5(id: string): BatchCandidate {
  return { id, tier: "l5", crux: false };
}

/** A fully-evidenced hard candidate, af-identified in workspace `ws`. */
function hard(id: string, afNodeId: string, afWorkspace = "proofs/ws"): BatchCandidate {
  return { id, tier: "hard", crux: false, afWorkspace, afNodeId };
}

const D = doc([regNode("star"), regNode("a"), regNode("b"), regNode("c")]);

function reasonFor(screen: { excluded: { id: string; reason: string }[] }, id: string): string | undefined {
  return screen.excluded.find((e) => e.id === id)?.reason;
}

describe("screenCandidates — the whole run fails closed before any candidate is considered", () => {
  test("an UNDECLARED dispatch tier refuses every candidate (no permissive default tier exists)", () => {
    const screen = screenCandidates({ doc: D, candidates: [l5("a"), l5("b")], northStarId: "star" });
    expect(screen.eligible).toEqual([]);
    expect(screen.excluded.map((e) => e.id)).toEqual(["a", "b"]);
    for (const e of screen.excluded) {
      expect(e.reason).toBe("dispatch-tier-undeclared");
      expect(e.determinacy).toBe("indeterminate");
      expect(e.constraint).toBe("dispatch-tier");
    }
  });

  test("an UNRESOLVED north star refuses every candidate (critical-path membership is unknowable)", () => {
    const screen = screenCandidates({ doc: D, candidates: [l5("a")], northStarId: "no-such-star", tier: "l5" });
    expect(screen.eligible).toEqual([]);
    expect(reasonFor(screen, "a")).toBe("north-star-unresolved");
    expect(screen.excluded[0]!.determinacy).toBe("indeterminate");
  });
});

describe("screenCandidates — registry identity", () => {
  test("an id naming no registry node is refused as unknown-node, never silently dropped", () => {
    const screen = screenCandidates({ doc: D, candidates: [l5("a"), l5("ghost")], northStarId: "star", tier: "l5" });
    expect(screen.eligible.map((e) => e.id)).toEqual(["a"]);
    expect(reasonFor(screen, "ghost")).toBe("unknown-node");
    expect(screen.excluded[0]!.determinacy).toBe("indeterminate");
  });

  test("two candidate records for the SAME id with CONFLICTING evidence refuse that id outright", () => {
    const screen = screenCandidates({
      doc: D,
      candidates: [{ id: "a", tier: "l5", crux: false }, { id: "a", tier: "l5", crux: true }],
      northStarId: "star",
      tier: "l5",
    });
    expect(screen.eligible).toEqual([]);
    expect(reasonFor(screen, "a")).toBe("conflicting-evidence");
    expect(screen.excluded[0]!.determinacy).toBe("indeterminate");
  });

  test("two IDENTICAL candidate records for the same id are the same fact stated twice, and dedupe", () => {
    const screen = screenCandidates({ doc: D, candidates: [l5("a"), l5("a")], northStarId: "star", tier: "l5" });
    expect(screen.eligible.map((e) => e.id)).toEqual(["a"]);
    expect(screen.excluded).toEqual([]);
  });
});

describe("screenCandidates — tier (PRD C3 'routine ... items only')", () => {
  test("a candidate declaring NO tier is refused (indeterminate), never assumed to match the dispatch", () => {
    const screen = screenCandidates({ doc: D, candidates: [{ id: "a", crux: false }], northStarId: "star", tier: "l5" });
    expect(screen.eligible).toEqual([]);
    expect(reasonFor(screen, "a")).toBe("tier-undeclared");
    expect(screen.excluded[0]!.determinacy).toBe("indeterminate");
  });

  test("a hard-tier item smuggled into an l5 dispatch is refused as a DETERMINED tier-mismatch", () => {
    const screen = screenCandidates({ doc: D, candidates: [l5("a"), hard("b", "1.1")], northStarId: "star", tier: "l5" });
    expect(screen.eligible.map((e) => e.id)).toEqual(["a"]);
    expect(reasonFor(screen, "b")).toBe("tier-mismatch");
    expect(screen.excluded[0]!.determinacy).toBe("determined");
    expect(screen.excluded[0]!.constraint).toBe("item-tier");
  });
});

describe("screenCandidates — registry critical path (M2.5's real query, never a caller flag)", () => {
  test("a node on the path to the north star is refused, computed by the screen itself", () => {
    const d = doc([regNode("star", { deps: ["crit"] }), regNode("crit"), regNode("routine")]);
    const screen = screenCandidates({ doc: d, candidates: [l5("crit"), l5("routine")], northStarId: "star", tier: "l5" });
    expect(screen.eligible.map((e) => e.id)).toEqual(["routine"]);
    expect(reasonFor(screen, "crit")).toBe("critical-path");
    expect(screen.excluded[0]!.determinacy).toBe("determined");
    expect(screen.excluded[0]!.constraint).toBe("critical-path");
  });

  test("an UNSATISFIED OR-route member is still on the path (query-path.ts's over-inclusive reading)", () => {
    const d = doc([regNode("star", { routes: [["r1"], ["r2"]] }), regNode("r1"), regNode("r2")]);
    const screen = screenCandidates({ doc: d, candidates: [l5("r1"), l5("r2")], northStarId: "star", tier: "l5" });
    expect(screen.eligible).toEqual([]);
    expect(reasonFor(screen, "r1")).toBe("critical-path");
    expect(reasonFor(screen, "r2")).toBe("critical-path");
  });
});

describe("screenCandidates — af crux (the additional filter of review verdict (a))", () => {
  test("a candidate whose crux flag is UNDECLARED is refused as indeterminate, never assumed non-crux", () => {
    const screen = screenCandidates({ doc: D, candidates: [{ id: "a", tier: "l5" }], northStarId: "star", tier: "l5" });
    expect(screen.eligible).toEqual([]);
    expect(reasonFor(screen, "a")).toBe("crux-undeclared");
    expect(screen.excluded[0]!.determinacy).toBe("indeterminate");
  });

  test("a crux candidate is refused as a DETERMINED no (per-item cross-vendor treatment, never batched)", () => {
    const screen = screenCandidates({ doc: D, candidates: [{ id: "a", tier: "l5", crux: true }], northStarId: "star", tier: "l5" });
    expect(screen.eligible).toEqual([]);
    expect(reasonFor(screen, "a")).toBe("crux");
    expect(screen.excluded[0]!.determinacy).toBe("determined");
    expect(screen.excluded[0]!.constraint).toBe("crux");
  });
});

describe("screenCandidates — af proof-tree ancestry evidence (hard tier)", () => {
  const afParents = new Map<string, readonly string[]>([
    [afNodeKey("proofs/ws", "1"), []],
    [afNodeKey("proofs/ws", "1.1"), [afNodeKey("proofs/ws", "1")]],
    [afNodeKey("proofs/ws", "1.2"), [afNodeKey("proofs/ws", "1")]],
  ]);

  test("a hard candidate with no af identity is refused — af independence cannot be determined", () => {
    const screen = screenCandidates({ doc: D, candidates: [{ id: "a", tier: "hard", crux: false }], northStarId: "star", tier: "hard", afParents });
    expect(screen.eligible).toEqual([]);
    expect(reasonFor(screen, "a")).toBe("af-identity-undeclared");
    expect(screen.excluded[0]!.determinacy).toBe("indeterminate");
    expect(screen.excluded[0]!.constraint).toBe("af-proof-tree");
  });

  test("a hard candidate whose af ancestry cannot be CLOSED (a parent id absent from the map) is refused", () => {
    const partial = new Map<string, readonly string[]>([[afNodeKey("proofs/ws", "1.1"), [afNodeKey("proofs/ws", "1")]]]);
    const screen = screenCandidates({ doc: D, candidates: [hard("a", "1.1")], northStarId: "star", tier: "hard", afParents: partial });
    expect(screen.eligible).toEqual([]);
    expect(reasonFor(screen, "a")).toBe("af-ancestry-unclosable");
    expect(screen.excluded[0]!.determinacy).toBe("indeterminate");
  });

  test("a hard dispatch with NO afParents map at all refuses every candidate", () => {
    const screen = screenCandidates({ doc: D, candidates: [hard("a", "1.1")], northStarId: "star", tier: "hard" });
    expect(screen.eligible).toEqual([]);
    expect(reasonFor(screen, "a")).toBe("af-ancestry-unclosable");
  });

  test("a closable hard candidate is eligible and carries its TRANSITIVE af ancestor closure", () => {
    const deep = new Map<string, readonly string[]>([
      [afNodeKey("proofs/ws", "1"), []],
      [afNodeKey("proofs/ws", "1.1"), [afNodeKey("proofs/ws", "1")]],
      [afNodeKey("proofs/ws", "1.1.1"), [afNodeKey("proofs/ws", "1.1")]],
    ]);
    const screen = screenCandidates({ doc: D, candidates: [hard("a", "1.1.1")], northStarId: "star", tier: "hard", afParents: deep });
    expect(screen.excluded).toEqual([]);
    expect(screen.eligible).toHaveLength(1);
    expect([...screen.eligible[0]!.afAncestors].sort()).toEqual([afNodeKey("proofs/ws", "1"), afNodeKey("proofs/ws", "1.1")].sort());
  });

  test("an l5 candidate needs NO af evidence: the registry DAG is its whole dependency structure", () => {
    const screen = screenCandidates({ doc: D, candidates: [l5("a")], northStarId: "star", tier: "l5" });
    expect(screen.excluded).toEqual([]);
    expect(screen.eligible[0]!.afKey).toBeUndefined();
    expect([...screen.eligible[0]!.afAncestors]).toEqual([]);
  });
});

describe("afProofTreeDependent", () => {
  function elig(id: string, afKey: string | undefined, ancestors: string[]): EligibleCandidate {
    return { id, tier: afKey === undefined ? "l5" : "hard", afKey, afAncestors: new Set(ancestors) };
  }

  test("an ancestor/descendant pair is dependent in BOTH argument orders", () => {
    const parent = elig("p", "k1", []);
    const child = elig("c", "k2", ["k1"]);
    expect(afProofTreeDependent(parent, child)).toBe(true);
    expect(afProofTreeDependent(child, parent)).toBe(true);
  });

  test("two siblings sharing an ancestor are INDEPENDENT (this is the batchable shape C3 wants)", () => {
    expect(afProofTreeDependent(elig("x", "k2", ["k1"]), elig("y", "k3", ["k1"]))).toBe(false);
  });

  test("two candidates resolving to the SAME af node are dependent (they are one node, twice)", () => {
    expect(afProofTreeDependent(elig("x", "k2", ["k1"]), elig("y", "k2", ["k1"]))).toBe(true);
  });

  test("a mixed pair (one af-identified, one not) fails CLOSED as dependent", () => {
    expect(afProofTreeDependent(elig("x", "k2", ["k1"]), elig("y", undefined, []))).toBe(true);
  });

  test("two l5 candidates (neither af-identified) are not af-dependent — registry independence governs", () => {
    expect(afProofTreeDependent(elig("x", undefined, []), elig("y", undefined, []))).toBe(false);
  });
});

describe("refusal reporting", () => {
  test("every exclusion reason is classified determined-or-indeterminate, with no gaps", () => {
    const reasons = Object.keys(EXCLUSION_DETERMINACY);
    expect(reasons.length).toBeGreaterThan(0);
    for (const r of reasons) expect(["determined", "indeterminate"]).toContain(EXCLUSION_DETERMINACY[r as keyof typeof EXCLUSION_DETERMINACY]);
    // The two halves must both be populated: a scheme where everything is "determined" would erase
    // exactly the distinction cross-vendor.ts exists to preserve.
    const values = Object.values(EXCLUSION_DETERMINACY);
    expect(values).toContain("determined");
    expect(values).toContain("indeterminate");
  });

  test("describeExclusion names the id, the constraint, the reason and the determinacy", () => {
    const screen = screenCandidates({ doc: D, candidates: [{ id: "a", tier: "l5", crux: true }], northStarId: "star", tier: "l5" });
    const line = describeExclusion(screen.excluded[0]!);
    expect(line).toContain("a");
    expect(line).toContain("crux");
    expect(line).toContain("determined");
  });

  test("a DETERMINED crux refusal and an INDETERMINATE crux-undeclared refusal never read the same", () => {
    const determined = screenCandidates({ doc: D, candidates: [{ id: "a", tier: "l5", crux: true }], northStarId: "star", tier: "l5" }).excluded[0]!;
    const indeterminate = screenCandidates({ doc: D, candidates: [{ id: "a", tier: "l5" }], northStarId: "star", tier: "l5" }).excluded[0]!;
    expect(describeExclusion(determined)).not.toBe(describeExclusion(indeterminate));
    expect(describeExclusion(indeterminate)).toContain("indeterminate");
  });

  test("exclusions are sorted by id — the report and the driver log get a deterministic order", () => {
    const screen = screenCandidates({ doc: D, candidates: [{ id: "c", tier: "l5" }, { id: "a", tier: "l5" }, { id: "b", tier: "l5" }], northStarId: "star", tier: "l5" });
    expect(screen.excluded.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });
});
