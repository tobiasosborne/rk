// Property test for the "never-auto-resolved" guarantee (M2.3, IMPLEMENTATION_PLAN.md: "conflicts
// render as defects, never auto-resolved") — driven end to end through the REAL pipeline
// (src/store/build-graph.ts -> src/graph/assemble.ts -> src/graph/validate.ts) over all four
// corpus/graph/conflict-*/ fixtures, not a hand-built GraphDocument. Each fixture's assembled
// document starts clean (`validateGraphDocument(doc) === []`); this file then tampers with the
// ASSEMBLED `conflicts` array in every shape a buggy renderer/merge step could take and asserts
// `validateGraphDocument` ERRORs every time — no tamper is allowed to pass silently:
//   - drop: the recorded conflict vanishes entirely (a renderer silently swallowing it)
//   - duplicate: the SAME conflict recorded twice (a merge step double-counting)
//   - downgrade-value: `otherValue` edited to a value that no longer matches the computed state
//     (a "smooth over the disagreement" bug)
//   - downgrade-kind: the conflict's `kind` swapped for a different closed kind (a
//     misclassification that would render the wrong defect)
// The four corpus fixtures each isolate one conflict class in isolation (single-conflict
// documents); a fifth block combines TWO fixtures' real assembled output into one document to
// prove a "merge" step cannot collapse two independently-computed conflicts into one entry either.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { canonicalizeGraphDocument } from "../../src/graph/serialize";
import { GRAPH_SCHEMA_VERSION } from "../../src/graph/types";
import type { ConflictKind, GraphDocument } from "../../src/graph/types";
import { validateGraphDocument } from "../../src/graph/validate";

const ABSENT = ["definitely-not-a-real-binary-xyz"];
const CORPUS = join(import.meta.dir, "..", "..", "corpus", "graph");

function loadFixture(name: string, opts: { af?: boolean } = {}): GraphDocument {
  const fixture = join(CORPUS, name);
  const afCommand = opts.af === false ? ABSENT : [join(fixture, "fake-af")];
  return buildGraphDocument(join(fixture, "repo"), { afCommand, frCommand: ABSENT }).doc;
}

interface Case {
  name: string;
  kind: ConflictKind;
  doc: () => GraphDocument;
}

const CASES: Case[] = [
  { name: "conflict-status-mismatch", kind: "status-mismatch", doc: () => loadFixture("conflict-status-mismatch") },
  { name: "conflict-contract-mismatch", kind: "contract-mismatch", doc: () => loadFixture("conflict-contract-mismatch") },
  { name: "conflict-taint-status", kind: "taint-status-mismatch", doc: () => loadFixture("conflict-taint-status") },
  {
    name: "conflict-banked-without-oracle",
    kind: "banked-without-oracle",
    doc: () => loadFixture("conflict-banked-without-oracle", { af: false }),
  },
];

function errorMessages(doc: GraphDocument): string[] {
  return validateGraphDocument(doc)
    .filter((i) => i.severity === "ERROR")
    .map((i) => i.message);
}

const OTHER_KIND: Record<ConflictKind, ConflictKind> = {
  "status-mismatch": "contract-mismatch",
  "contract-mismatch": "taint-status-mismatch",
  "taint-status-mismatch": "banked-without-oracle",
  "banked-without-oracle": "status-mismatch",
};

describe("never-auto-resolved property — every tamper on a real assembled conflicts[] is caught, for every class", () => {
  for (const c of CASES) {
    describe(c.name, () => {
      test("baseline: the real assembled document is clean (recorded == recomputed)", () => {
        expect(errorMessages(c.doc())).toEqual([]);
      });

      test("drop: removing the sole recorded conflict is an ERROR", () => {
        const doc = c.doc();
        const tampered = { ...doc, conflicts: [] };
        const msgs = errorMessages(tampered);
        expect(msgs.some((m) => m.includes(`missing conflict record: ${c.kind}`))).toBe(true);
      });

      test("duplicate: recording the SAME conflict twice is an ERROR", () => {
        const doc = c.doc();
        const conflict = doc.conflicts[0]!;
        const tampered = { ...doc, conflicts: [conflict, { ...conflict }] };
        const msgs = errorMessages(tampered);
        expect(msgs.some((m) => m.includes("duplicate conflict record"))).toBe(true);
      });

      test("downgrade-value: editing otherValue away from the computed value is an ERROR", () => {
        const doc = c.doc();
        const conflict = doc.conflicts[0]!;
        const tampered = { ...doc, conflicts: [{ ...conflict, otherValue: "smoothed-over" }] };
        const msgs = errorMessages(tampered);
        expect(msgs.some((m) => m.includes("inconsistent with computed state"))).toBe(true);
      });

      test("downgrade-kind: swapping the conflict's kind for a different closed kind is an ERROR", () => {
        const doc = c.doc();
        const conflict = doc.conflicts[0]!;
        const wrongKind = OTHER_KIND[c.kind];
        const tampered = { ...doc, conflicts: [{ ...conflict, kind: wrongKind }] };
        const msgs = errorMessages(tampered);
        // The real conflict (c.kind) is now missing, and the fabricated one (wrongKind) is
        // unsupported by any computed condition — BOTH must be flagged, never one silently eaten.
        expect(msgs.some((m) => m.includes(`missing conflict record: ${c.kind}`))).toBe(true);
        expect(msgs.some((m) => m.includes("is not supported by any computed conflict"))).toBe(true);
      });
    });
  }

  describe("merge: two independently-computed conflicts (from two different real fixtures) cannot collapse into one", () => {
    test("combining status-mismatch + contract-mismatch documents, then dropping ONE of the two, still ERRORs on exactly that one", () => {
      const a = loadFixture("conflict-status-mismatch");
      const b = loadFixture("conflict-contract-mismatch");
      const combined = canonicalizeGraphDocument({
        schema_version: GRAPH_SCHEMA_VERSION,
        nodes: [...a.nodes, ...b.nodes],
        edges: {
          af: [...a.edges.af, ...b.edges.af],
          bd: [...a.edges.bd, ...b.edges.bd],
          fr: [...a.edges.fr, ...b.edges.fr],
          report: [...a.edges.report, ...b.edges.report],
          retraction: [...a.edges.retraction, ...b.edges.retraction],
        },
        unresolved: [...a.unresolved, ...b.unresolved],
        conflicts: [...a.conflicts, ...b.conflicts],
      });
      expect(errorMessages(combined)).toEqual([]); // baseline: both real conflicts recorded, clean

      // Simulate a "merge" bug that collapses the two-conflict list down to just one.
      const merged = { ...combined, conflicts: [combined.conflicts[0]!] };
      const msgs = errorMessages(merged);
      const droppedKind = combined.conflicts[1]!.kind;
      expect(msgs.some((m) => m.includes(`missing conflict record: ${droppedKind}`))).toBe(true);
    });
  });
});
