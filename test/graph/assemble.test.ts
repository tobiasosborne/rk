import { describe, expect, test } from "bun:test";
import type { Lemma } from "../../src/gates/linker-parse";
import type { AfSourceRecord } from "../../src/graph/from-af";
import type { BdSourceRecord } from "../../src/graph/from-bd";
import type { FrSourceRecord } from "../../src/graph/from-fr";
import { assembleGraphDocument, type RawStoreInput } from "../../src/graph/assemble";
import { serializeGraphDocument } from "../../src/graph/serialize";
import { validateGraphDocument } from "../../src/graph/validate";

function lemma(overrides: Partial<Lemma> = {}): Lemma {
  return {
    id: "lem-x",
    path: "argument/lemmas/lem-x.md",
    kind: "lemma",
    af: "none",
    contract: "X holds.",
    defs: [],
    deps: [],
    routes: [],
    // M3 blocker 7b: `balloons` is now required on `Lemma` (linker-parse.ts); the zero-valued
    // default matches every shard with no balloon marks (the case every fixture here models).
    balloons: { count: 0, classifications: [] },
    ...overrides,
  };
}

describe("assembleGraphDocument — end to end, must satisfy validateGraphDocument", () => {
  test("a clean, fully-resolved document validates with zero issues and serializes canonically", () => {
    const input: RawStoreInput = {
      lemmas: [
        lemma({
          id: "lem-halo-collapse",
          status: "proved",
          af: "validated",
          workspace: "proofs/halo-collapse-v2",
          contract: "Every halo collapses within finite time under the flow.",
        }),
      ],
      afRecords: [
        {
          workspace: "proofs/halo-collapse-v2",
          found: true,
          schemaVersion: "1",
          rootNodeId: "1",
          rootStatement: "Every halo collapses within finite time under the flow.",
          epistemicState: "validated",
          taintState: "clean",
          nodeCount: 4,
        },
      ],
      frRecords: [],
      bdRecords: [{ id: "lem-halo-collapse", status: "open" }],
    };
    const { doc, report } = assembleGraphDocument(input);
    expect(validateGraphDocument(doc)).toEqual([]);
    expect(() => serializeGraphDocument(doc)).not.toThrow();
    expect(report).toEqual({
      registrySkipped: [],
      lemmasIn: 1,
      nodesOut: 1,
      afRecordsIn: 1,
      afResolved: 1,
      afUnresolved: 0,
      frRecordsIn: 0,
      frResolved: 0,
      frUnresolved: 0,
      bdRecordsIn: 1,
      bdEdges: 1,
      // rk-0ehr / P1: the retraction ledger's own accounting, zero here (no records supplied) —
      // asserted explicitly rather than omitted, so a future reader sees the four counters exist.
      retractionRecordsIn: 0,
      retractionResolved: 0,
      retractionUnresolved: 0,
      retractionsLive: 0,
    });
  });

  test("a proved node with a contract mismatch produces a recorded conflict, still validates clean", () => {
    const input: RawStoreInput = {
      lemmas: [
        lemma({
          id: "lem-drift",
          status: "proved",
          af: "validated",
          workspace: "proofs/lem-drift",
          contract: "the registry's version",
        }),
      ],
      afRecords: [
        {
          workspace: "proofs/lem-drift",
          found: true,
          schemaVersion: "1",
          rootNodeId: "1",
          rootStatement: "a completely different af root statement",
          epistemicState: "validated",
          taintState: "clean",
          nodeCount: 1,
        },
      ],
      frRecords: [],
      bdRecords: [],
    };
    const { doc } = assembleGraphDocument(input);
    expect(validateGraphDocument(doc)).toEqual([]);
    expect(doc.conflicts).toHaveLength(1);
    expect(doc.conflicts[0]!.kind).toBe("contract-mismatch");
  });

  test("TOTAL conversion property: fr record count in == resolved + unresolved out, for every shape", () => {
    const shapes: FrSourceRecord[][] = [
      [],
      [{ cycle: 1, kind: "artifact", ref: "nowhere.md" }],
      [
        { cycle: 1, kind: "artifact", ref: "argument/lemmas/lem-a.md" },
        { cycle: 2, kind: "artifact", ref: "nowhere.md" },
        { cycle: 3, kind: "artifact", ref: "also-nowhere.md" },
        { cycle: 4, kind: "graduate", ref: "lem-a" },
        { cycle: 5, kind: "artifact", ref: "argument/lemmas/lem-a.md" }, // resolves twice, distinct cycles
      ],
    ];
    for (const frRecords of shapes) {
      const input: RawStoreInput = {
        lemmas: [lemma({ id: "lem-a", path: "argument/lemmas/lem-a.md" })],
        afRecords: [],
        frRecords,
        bdRecords: [],
      };
      const { report } = assembleGraphDocument(input);
      expect(report.frResolved + report.frUnresolved).toBe(frRecords.length);
    }
  });

  test("M2-boundary-review blocker 8: two live banked-without-oracle fr cycles resolving to the SAME node coalesce into ONE node-level conflict, document stays valid", () => {
    const input: RawStoreInput = {
      lemmas: [lemma({ id: "lem-dup", path: "argument/lemmas/lem-dup.md" })],
      afRecords: [],
      frRecords: [
        { cycle: 1, kind: "artifact", ref: "argument/lemmas/lem-dup.md", outcome: "banked", verdict: "claimed" },
        { cycle: 2, kind: "artifact", ref: "argument/lemmas/lem-dup.md", outcome: "banked", verdict: "claimed" },
      ],
      bdRecords: [],
    };
    const { doc } = assembleGraphDocument(input);
    // both cycles stay visible on edges.fr — coalescing is a CONFLICT-computation concern only.
    expect(doc.edges.fr).toHaveLength(2);
    expect(doc.conflicts).toEqual([
      {
        kind: "banked-without-oracle",
        edge: "fr",
        nodeId: "lem-dup",
        registryValue: "banked",
        otherValue: "claimed",
        message: "banked-without-oracle: registry='banked' vs other='claimed'",
      },
    ]);
    expect(validateGraphDocument(doc)).toEqual([]); // NOT flagged as a duplicate conflict record
  });

  test("registry skip accounting: lemmasIn == nodesOut + registrySkipped.length", () => {
    const input: RawStoreInput = {
      lemmas: [lemma({ id: "a" }), lemma({ id: "b", kind: undefined }), lemma({ id: "c", kind: "bogus" })],
      afRecords: [],
      frRecords: [],
      bdRecords: [],
    };
    const { report } = assembleGraphDocument(input);
    expect(report.nodesOut + report.registrySkipped.length).toBe(report.lemmasIn);
    expect(report.registrySkipped.map((s) => s.id).sort()).toEqual(["b", "c"]);
  });
});
