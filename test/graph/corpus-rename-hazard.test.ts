// Harness for corpus/graph/rename-hazard/repo/ (bead rk-bsj, IMPLEMENTATION_PLAN.md M2.1
// acceptance row: "the rename hazard (id != workspace dir, e.g. lem-halo-collapse) is a corpus
// fixture"). test/graph/fixtures.ts's `buildRenameHazardDocument` (M2.1) already proves the
// SCHEMA/VALIDATOR catch a rename-hazard edge once one exists as a hand-built `GraphDocument` —
// it cannot catch a READER that derives the af join key from `id` instead of copying `workspace:`
// (M2.1 review follow-up 5, this bead). This harness drives the REAL M2.2 pipeline
// (src/store/build-graph.ts) end to end over a real repo tree on disk: a shard whose id
// (`lem-halo-collapse`) names one directory (`proofs/lem-halo-collapse/`, deliberately present
// with a DECOY ledger carrying the wrong contract/node-count) while its `workspace:` field names
// a DIFFERENT, real directory (`proofs/halo-collapse-v2/`, the correct ledger). Only a reader
// that copies `workspace:` verbatim (never re-deriving it from `id`) resolves against the correct
// ledger; a reader that fell back to `id` would resolve against the decoy and this test would
// catch the divergence directly (wrong nodeCount, wrong contractMatch, wrong workspace string on
// the edge) rather than silently passing.
//
// `afCommand`/`frCommand` point at guaranteed-absent binaries so this test exercises the
// direct-ledger fallback deterministically (CI-portable, no dependency on a real af/fr install) —
// the fallback path (src/store/af-load.ts's `introspectWorkspace` reuse) is exactly where the
// join-key discipline under test lives.

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildGraphDocument } from "../../src/store/build-graph";
import { validateGraphDocument } from "../../src/graph/validate";

const REPO = join(import.meta.dir, "..", "..", "corpus", "graph", "rename-hazard", "repo");
const ABSENT = ["definitely-not-a-real-binary-xyz"];

describe("corpus/graph/rename-hazard — end-to-end reader join-key discipline", () => {
  test("resolves against the REAL workspace (proofs/halo-collapse-v2), never the id-shaped decoy", () => {
    const { doc, report } = buildGraphDocument(REPO, { afCommand: ABSENT, frCommand: ABSENT });

    const node = doc.nodes.find((n) => n.id === "lem-halo-collapse");
    expect(node?.workspace).toBe("proofs/halo-collapse-v2");

    const afEdges = doc.edges.af.filter((e) => e.nodeId === "lem-halo-collapse");
    expect(afEdges).toHaveLength(1);
    const edge = afEdges[0]!;
    expect(edge.workspace).toBe("proofs/halo-collapse-v2"); // never "proofs/lem-halo-collapse"
    expect(edge.workspaceResolved).toBe(true);
    if (!edge.workspaceResolved) throw new Error("unreachable");
    expect(edge.contractMatch).toBe(true); // the decoy's statement would NOT match
    expect(edge.nodeCount).toBe(2); // the real ledger has 2 node_created events; the decoy has 1

    // The decoy is never referenced anywhere in the assembled document.
    expect(doc.edges.af.some((e) => e.workspace === "proofs/lem-halo-collapse")).toBe(false);
    expect(doc.unresolved.some((u) => u.ref === "proofs/lem-halo-collapse")).toBe(false);

    expect(validateGraphDocument(doc)).toEqual([]);
    expect(report.afResolved).toBe(1);
    expect(report.afUnresolved).toBe(0);
  });
});
