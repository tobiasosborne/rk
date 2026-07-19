// 1:1 test file for src/graph/serialize.ts. Ground truth: PRD C5 / IMPLEMENTATION_PLAN.md M2.1
// ("Deterministic: sorted keys, content-addressed, timestamps excluded from identity") and
// schemas/graph.v1.json's "Determinism" wording, itself modeled on
// ../vibefeld/docs/export-graph-v1.md's three determinism properties for `af export --graph
// json` (stable node order, stable key order, no export-time timestamp).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConflictRecord, GraphDocument } from "../../src/graph/types";
import { canonicalizeGraphDocument, serializeGraphDocument } from "../../src/graph/serialize";
import { buildSampleDocument } from "./fixtures";

const GOLDEN_PATH = join(import.meta.dir, "fixtures", "sample.canonical.json");

// Deterministic mulberry32 PRNG — no runtime dependency (CLAUDE.md L4), seed-reproducible,
// used only to shuffle test fixtures, never product code.
function mulberry32(seed: number): () => number {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: readonly T[], rand: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Recursively shuffles every array's element order AND every plain object's key insertion
 * order, seeded — a semantics-preserving scramble (JSON has no notion of "the 3rd property"; an
 * object with the same key/value pairs in a different insertion order is the identical value).
 * Used to prove `serializeGraphDocument` is genuinely insensitive to both axes of input order,
 * not just the one axis a hand-written single counter-example happens to probe. */
function shuffleDeep(value: unknown, rand: () => number): unknown {
  if (Array.isArray(value)) return shuffle(value.map((v) => shuffleDeep(v, rand)), rand);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const keys = shuffle(Object.keys(src), rand);
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = shuffleDeep(src[key], rand);
    return out;
  }
  return value;
}

/** Recursively reverses every array's element order AND every plain object's key insertion
 * order — the sharpest single counter-example (every axis flipped at once, not a random
 * sample of one). */
function reverseDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseDeep).reverse();
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).reverse()) out[key] = reverseDeep(src[key]);
    return out;
  }
  return value;
}

describe("serializeGraphDocument — golden-file round-trip", () => {
  test("buildSampleDocument() serializes to the byte-stable golden fixture", () => {
    const got = serializeGraphDocument(buildSampleDocument());
    const golden = readFileSync(GOLDEN_PATH, "utf8").trimEnd();
    expect(got).toBe(golden);
  });

  test("re-serializing the canonical form is a fixed point (idempotent)", () => {
    const once = canonicalizeGraphDocument(buildSampleDocument());
    const twice = canonicalizeGraphDocument(once);
    expect(serializeGraphDocument(twice)).toBe(serializeGraphDocument(once));
  });

  test("valid, parseable JSON (round-trips through JSON.parse without loss of the node count)", () => {
    const s = serializeGraphDocument(buildSampleDocument());
    const parsed = JSON.parse(s);
    expect(parsed.nodes).toHaveLength(5);
    expect(parsed.schema_version).toBe("1");
  });
});

describe("serializeGraphDocument — determinism property (key/array order independence)", () => {
  const canonical = serializeGraphDocument(buildSampleDocument());

  test("reversing every array and every object's key order everywhere in the document yields byte-identical output", () => {
    const reversed = reverseDeep(buildSampleDocument()) as GraphDocument;
    expect(serializeGraphDocument(reversed)).toBe(canonical);
  });

  for (const seed of [1, 7, 42, 1000, 99999]) {
    test(`seed ${seed}: a random-order shuffle of the same semantic document serializes identically`, () => {
      const shuffled = shuffleDeep(buildSampleDocument(), mulberry32(seed)) as GraphDocument;
      expect(serializeGraphDocument(shuffled)).toBe(canonical);
    });
  }

  test("mutation-proof: an ACTUAL content change (different contract text) is NOT masked by canonicalization", () => {
    const doc = buildSampleDocument();
    doc.nodes[1]!.contract = "A different statement entirely.";
    expect(serializeGraphDocument(doc)).not.toBe(canonical);
  });
});

describe("serializeGraphDocument — total tie-breaker over tied primary-key entries (Tier A review follow-up 1)", () => {
  // Two `bd` edges legitimately share `nodeId` in today's shape (no "exactly one bd edge per
  // node" rule exists, unlike af) — the primary sort key alone is NOT enough to order them
  // deterministically; the serializer must fall back to a total tie-breaker over the complete
  // element, not just accept whatever order the input happened to arrive in.
  function tiedBdDocument(order: "ab" | "ba"): GraphDocument {
    const a = { nodeId: "lem-x", issueId: "rk-aaa", status: "open", resolved: true };
    const b = { nodeId: "lem-x", issueId: "rk-bbb", status: "closed", resolved: false };
    return {
      schema_version: "1",
      nodes: [],
      edges: { af: [], bd: order === "ab" ? [a, b] : [b, a], fr: [], report: [] },
      unresolved: [],
      conflicts: [],
    };
  }

  test("two bd edges tied on nodeId still serialize identically regardless of input order", () => {
    expect(serializeGraphDocument(tiedBdDocument("ab"))).toBe(serializeGraphDocument(tiedBdDocument("ba")));
  });

  test("mutation-proof: the tied-bd serialization is not vacuous — changing one tied element's content changes the bytes", () => {
    const doc = tiedBdDocument("ab");
    doc.edges.bd[0]!.issueId = "rk-changed";
    expect(serializeGraphDocument(doc)).not.toBe(serializeGraphDocument(tiedBdDocument("ab")));
  });

  // Two `conflicts` records legitimately share (kind, edge, nodeId) only in an invalid document
  // (validateGraphDocument would flag the duplicate) — but the SERIALIZER must still produce a
  // deterministic order for such an in-flight/not-yet-valid document, per the review's own
  // framing ("a real duplicate is itself an ERROR validate.ts catches, but the serializer must
  // still produce one deterministic order").
  function tiedConflictDocument(order: "ab" | "ba"): GraphDocument {
    const a: ConflictRecord = {
      kind: "contract-mismatch", edge: "af", nodeId: "lem-x", registryValue: "proved", otherValue: "aaa", message: "m1",
    };
    const b: ConflictRecord = {
      kind: "contract-mismatch", edge: "af", nodeId: "lem-x", registryValue: "proved", otherValue: "bbb", message: "m2",
    };
    return {
      schema_version: "1",
      nodes: [],
      edges: { af: [], bd: [], fr: [], report: [] },
      unresolved: [],
      conflicts: order === "ab" ? [a, b] : [b, a],
    };
  }

  test("two conflicts tied on (kind, edge, nodeId) still serialize identically regardless of input order", () => {
    expect(serializeGraphDocument(tiedConflictDocument("ab"))).toBe(serializeGraphDocument(tiedConflictDocument("ba")));
  });
});
