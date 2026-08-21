// PURITY: pure — no fs/network/clock (L3). The graph document's VERSION BOUNDARY (rk-8805,
// `schema_version` "2" -> "3"): the one place a `GraphDocument` read from bytes is admitted, its
// version checked, and — for a legacy v2 document — upgraded in memory. Ground truth:
// schemas/graph.v1.json, src/graph/types.ts's `GRAPH_SCHEMA_VERSION`.
//
// WHY A LOADER EXISTS AT ALL. Before this bead, nothing in rk ever checked a graph document's
// version: producers stamped the constant and consumers cast `JSON.parse` straight to
// `GraphDocument`. That was survivable while every producer and consumer lived in this repo and
// moved together. It stops being survivable the moment a document can be missing a field a
// consumer's validity reasoning depends on — which is exactly what `signature` is. A v2 document
// read as v3 shows NO signature on any node, and "this result declared no regime" is precisely the
// blindness Gate 2 Check 17 exists to remove. So the version is now read, and the two admissible
// answers are handled explicitly:
//
//   - "3" — the current shape. Read as-is (`upgraded: false`).
//   - "2" — legacy. Read, then stamped "3" with EVERY node's signature ABSENT (`upgraded: true`).
//           Absent, never an empty signature: "declared nothing" and "declared the empty regime"
//           are different claims, and fabricating the second would make a v2 document assert a
//           regime it never stated.
//   - anything else (including "1", a number, or a missing field) — REFUSED. Never read under v3
//     semantics on the strength of a guess.
//
// This module deliberately does NOT re-implement `validateGraphDocument` (src/graph/validate.ts):
// it checks the VERSION and the one field the version bump is about, and hands the document on.
// Referential integrity, bucket accounting, conflict recomputation and canonical form stay where
// they already live, so there is one implementation of each, not two.

import type { GraphDocument, RegistryNode } from "./types";
import { GRAPH_SCHEMA_VERSION } from "./types";
import { validateParsedSignature } from "../gates/signature";

/** The versions `acceptGraphDocument` will read. Widening this set is a deliberate compat event
 * (rule 10), not a convenience — which is why it is a named constant a test pins. */
export const SUPPORTED_GRAPH_SCHEMA_VERSIONS = ["2", "3"] as const;
export type SupportedGraphSchemaVersion = (typeof SUPPORTED_GRAPH_SCHEMA_VERSIONS)[number];

export type GraphAccept =
  | { ok: true; doc: GraphDocument; sourceVersion: SupportedGraphSchemaVersion; upgraded: boolean }
  | { ok: false; why: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Admits `raw` as a `GraphDocument`, upgrading a legacy v2 document in memory. Fails closed on
 * every other input — an unrecognized version, a missing top-level array, or a node whose
 * `signature` does not satisfy schemas/signature.v1.json's shape (a malformed signature is refused
 * rather than dropped: dropping it would turn a corrupt document into a document that merely
 * declares nothing, which is the false-green direction). */
export function acceptGraphDocument(raw: unknown): GraphAccept {
  if (!isPlainObject(raw)) return { ok: false, why: "a graph document must be a JSON object" };
  const version = raw.schema_version;
  if (typeof version !== "string") {
    return {
      ok: false,
      why: `"schema_version" is ${JSON.stringify(version)} — a graph document must carry it as a string (supported: ${SUPPORTED_GRAPH_SCHEMA_VERSIONS.join(", ")})`,
    };
  }
  if (!(SUPPORTED_GRAPH_SCHEMA_VERSIONS as readonly string[]).includes(version)) {
    return {
      ok: false,
      why: `unsupported graph "schema_version" "${version}" (supported: ${SUPPORTED_GRAPH_SCHEMA_VERSIONS.join(", ")}) — refused rather than read under v${GRAPH_SCHEMA_VERSION} semantics`,
    };
  }
  for (const field of ["nodes", "unresolved", "conflicts"] as const) {
    if (!Array.isArray(raw[field])) return { ok: false, why: `"${field}" must be an array` };
  }
  if (!isPlainObject(raw.edges)) return { ok: false, why: `"edges" must be an object` };

  const nodes: RegistryNode[] = [];
  for (const [i, node] of (raw.nodes as unknown[]).entries()) {
    if (!isPlainObject(node)) return { ok: false, why: `nodes[${i}] must be an object` };
    if (node.signature === undefined) {
      nodes.push(node as unknown as RegistryNode);
      continue;
    }
    if (version === "2") {
      return { ok: false, why: `nodes[${i}] carries a "signature" but the document declares schema_version "2", which has no such field` };
    }
    const shape = validateParsedSignature(node.signature);
    if (!shape.ok) {
      return { ok: false, why: `nodes[${i}] ('${String(node.id)}') has a malformed "signature": ${shape.why}` };
    }
    nodes.push({ ...(node as unknown as RegistryNode), signature: shape.value });
  }

  const doc = { ...(raw as unknown as GraphDocument), schema_version: GRAPH_SCHEMA_VERSION, nodes };
  return { ok: true, doc, sourceVersion: version as SupportedGraphSchemaVersion, upgraded: version !== GRAPH_SCHEMA_VERSION };
}
