// Graph schema v2 -> v3 (rk-8805): `registryNode` gains `signature`. Rule 10 — a schema change is a
// compat event: version field bumped, a LEGACY fixture proving a v2 document still loads, and a v3
// GOLDEN proving the new field round-trips canonically. Ground truth: schemas/graph.v1.json,
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 6 ("The graph schema gains a
// `signature` field and bumps its `schema_version` (2 -> 3) with a legacy fixture").
//
// Fixtures live under corpus/graph/, the same footing as the conflict fixtures: hand-written tests
// over repo-shaped-on-disk documents, NOT discovered by the six-gate corpus runner and not counted
// in selftest's gate-fixture line (see corpus/README.md "Graph fixtures").

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GRAPH_SCHEMA_VERSION } from "../../src/graph/types";
import { acceptGraphDocument, SUPPORTED_GRAPH_SCHEMA_VERSIONS } from "../../src/graph/schema-version";
import { canonicalizeGraphDocument, serializeGraphDocument } from "../../src/graph/serialize";
import { validateGraphDocument } from "../../src/graph/validate";
import { canonicalSignature } from "../../src/gates/signature";

const CORPUS = join(import.meta.dir, "..", "..", "corpus", "graph");
const LEGACY_V2 = join(CORPUS, "signature-legacy-v2", "graph.json");
const GOLDEN_V3 = join(CORPUS, "signature-v3", "graph.json");

function readRaw(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("the version bump itself (rule 10)", () => {
  test("GRAPH_SCHEMA_VERSION is 3", () => {
    expect(GRAPH_SCHEMA_VERSION).toBe("3");
  });

  test("schemas/graph.v1.json's const matches, and registryNode declares `signature`", () => {
    const schema = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "schemas", "graph.v1.json"), "utf8")) as {
      properties: { schema_version: { const: string } };
      $defs: { registryNode: { properties: Record<string, unknown> } };
    };
    expect(schema.properties.schema_version.const).toBe("3");
    expect(Object.keys(schema.$defs.registryNode.properties)).toContain("signature");
  });
});

describe("the LEGACY v2 fixture still loads", () => {
  const raw = readRaw(LEGACY_V2);

  test("it really is a v2 document with no signature anywhere", () => {
    expect((raw as { schema_version: string }).schema_version).toBe("2");
    expect(JSON.stringify(raw)).not.toContain("signature");
  });

  test("acceptGraphDocument reads it, reports the source version, and upgrades it in memory", () => {
    const r = acceptGraphDocument(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.sourceVersion).toBe("2");
    expect(r.upgraded).toBe(true);
    expect(r.doc.schema_version).toBe("3");
    // A v2 node has no signature — absent, never a fabricated empty one. "This shard declared no
    // signature" and "this shard declared an empty signature" are different claims.
    expect(r.doc.nodes.every((n) => n.signature === undefined)).toBe(true);
    expect(validateGraphDocument(r.doc)).toEqual([]);
  });
});

describe("the v3 GOLDEN", () => {
  const raw = readRaw(GOLDEN_V3);

  test("it loads unchanged (no upgrade) and validates clean", () => {
    const r = acceptGraphDocument(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("unreachable");
    expect(r.sourceVersion).toBe("3");
    expect(r.upgraded).toBe(false);
    expect(validateGraphDocument(r.doc)).toEqual([]);
  });

  test("it actually carries a signature (a golden that proves nothing is not a golden)", () => {
    const r = acceptGraphDocument(raw);
    if (!r.ok) throw new Error("unreachable");
    const signed = r.doc.nodes.filter((n) => n.signature !== undefined);
    expect(signed.length).toBeGreaterThan(0);
    expect(signed[0]!.signature!.pre.length + signed[0]!.signature!.post.length).toBeGreaterThan(0);
  });

  test("it serializes byte-identically to its own file bytes (canonical form)", () => {
    const r = acceptGraphDocument(raw);
    if (!r.ok) throw new Error("unreachable");
    expect(serializeGraphDocument(r.doc)).toBe(readFileSync(GOLDEN_V3, "utf8").trim());
  });

  test("canonicalisation sorts a signature's arrays and keys, so identity survives reordering", () => {
    const r = acceptGraphDocument(raw);
    if (!r.ok) throw new Error("unreachable");
    const node = r.doc.nodes.find((n) => n.signature !== undefined)!;
    const scrambled = {
      ...r.doc,
      nodes: r.doc.nodes.map((n) =>
        n.id !== node.id
          ? n
          : { ...n, signature: { ...n.signature!, pre: [...n.signature!.pre].reverse(), post: [...n.signature!.post].reverse() } },
      ),
    };
    expect(serializeGraphDocument(scrambled)).toBe(serializeGraphDocument(r.doc));
  });
});

describe("acceptGraphDocument fails CLOSED", () => {
  test.each([
    ["schema_version 1 (pre-retraction, unrepresentable here)", { schema_version: "1", nodes: [], edges: {}, unresolved: [], conflicts: [] }],
    ["a numeric schema_version", { schema_version: 3, nodes: [], edges: {}, unresolved: [], conflicts: [] }],
    ["no schema_version at all", { nodes: [], edges: {}, unresolved: [], conflicts: [] }],
    ["not an object", []],
  ])("%s is refused, never read under v3 semantics", (_label, raw) => {
    const r = acceptGraphDocument(raw);
    expect(r.ok).toBe(false);
  });

  test("a v3 document whose node signature is malformed is refused, not silently dropped", () => {
    const raw = readRaw(GOLDEN_V3) as { nodes: Record<string, unknown>[] };
    const i = raw.nodes.findIndex((n) => n.signature !== undefined);
    raw.nodes[i]!.signature = { schema_version: "1", profile: "p", pre: "not-an-array", post: [], regime: [] };
    const r = acceptGraphDocument(raw);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.why).toContain("signature");
  });

  test("the supported set is exactly {2, 3} — a widened set is a deliberate compat event", () => {
    expect([...SUPPORTED_GRAPH_SCHEMA_VERSIONS]).toEqual(["2", "3"]);
  });
});

describe("validateGraphDocument checks the signature's canonical form", () => {
  test("a node carrying a NON-canonical signature is an issue naming the node", () => {
    const r = acceptGraphDocument(readRaw(GOLDEN_V3));
    if (!r.ok) throw new Error("unreachable");
    const doc = canonicalizeGraphDocument(r.doc);
    // The node with SEVERAL pre entries — reordering a one-entry list is a no-op, so a fixture
    // that picked the first signed node would pass without the check existing at all.
    const node = doc.nodes.filter((n) => n.signature !== undefined).sort((a, b) => b.signature!.pre.length - a.signature!.pre.length)[0]!;
    expect(node.signature!.pre.length).toBeGreaterThan(1);
    // Two predicates on the same object+key, one strictly redundant: canonicalisation would have
    // produced a different array, so the document is not in canonical form.
    const broken = {
      ...doc,
      nodes: doc.nodes.map((n) =>
        n.id !== node.id ? n : { ...n, signature: { ...n.signature!, pre: [...n.signature!.pre].reverse().concat(n.signature!.pre) } },
      ),
    };
    const issues = validateGraphDocument(broken);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.nodeId === node.id)).toBe(true);
  });

  test("the golden's own signature IS already canonical (the anti-drift property)", () => {
    const r = acceptGraphDocument(readRaw(GOLDEN_V3));
    if (!r.ok) throw new Error("unreachable");
    const node = r.doc.nodes.find((n) => n.signature !== undefined)!;
    expect(canonicalSignature(node.signature!)).toEqual(node.signature!);
  });
});
