// PURITY: pure — no fs/network/clock (L3). Structural invariants over a `GraphDocument`
// (src/graph/types.ts) that `schemas/graph.v1.json` cannot express on its own: cross-array
// referential integrity, the first-class unresolved-reference bucket's EXACT accounting (PRD C5:
// "never silently dropped"), the rename-hazard join-key discipline (registry↔af keys on
// `workspace:`, never `id`), the af-evidence requirement + conflict recomputation added by the
// Tier A review's repair wave (2026-07-19 — see docs/memos/2026-07-19-graph-schema-v1.md's
// "review outcomes" section), and the canonical-form invariant src/graph/serialize.ts's output
// must satisfy. This is a graph-level check, not a gate: it never touches `src/gates` (the
// projection layer is its own module per IMPLEMENTATION_PLAN.md §0 — "src/graph/ PURE:
// projection join, conflict detection, path queries" — decoupled from the six M0 gates on
// purpose). af-, fr-, and conflict-specific checks are split into sibling
// validate-{af,fr,conflicts}.ts modules to stay clear of CLAUDE.md's 280-line shard cap.

import { canonicalSignature } from "../gates/signature";
import { canonicalizeGraphDocument, sortKeysDeep } from "./serialize";
import type { GraphDocument } from "./types";
import { checkAfEdges, checkAfUnresolvedBucket } from "./validate-af";
import { checkConflicts } from "./validate-conflicts";
import { checkFrEdges, checkFrUnresolvedBucket } from "./validate-fr";
import { err, warn, type GraphIssue } from "./validate-issue";

export type { GraphIssue, GraphIssueSeverity } from "./validate-issue";

/** Validates `doc` and returns every structural issue found (never throws — a consumer decides
 * severity policy, mirroring src/gates/framework.ts's `Finding` shape at the pattern level,
 * without importing it — the graph module stays decoupled from the gate layer). Returns `[]` on
 * a fully coherent document, including the trivial empty document (0 nodes, 0 edges of every
 * kind) — an empty projection is a legitimate state (a fresh `rk init`), never itself a defect. */
export function validateGraphDocument(doc: GraphDocument): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeById = new Map(doc.nodes.map((n) => [n.id, n]));

  checkDuplicateIds(doc, issues);
  checkDepReferentialIntegrity(doc, nodeById, issues);
  checkAfEdges(doc, nodeById, issues);
  checkAfUnresolvedBucket(doc, issues);
  checkBdEdges(doc, nodeById, issues);
  checkBdUnresolvedBucket(doc, issues);
  checkFrEdges(doc, nodeById, issues);
  checkFrUnresolvedBucket(doc, issues);
  checkReportEdges(doc, nodeById, issues);
  checkReportUnresolvedBucket(doc, issues);
  checkRetractionEdges(doc, nodeById, issues);
  checkRetractionUnresolvedBucket(doc, issues);
  checkConflicts(doc, nodeById, issues);
  checkNodeSignatures(doc, issues);
  checkCanonicalForm(doc, issues);

  return issues;
}

function checkDuplicateIds(doc: GraphDocument, issues: GraphIssue[]): void {
  const seen = new Set<string>();
  for (const n of doc.nodes) {
    if (seen.has(n.id)) issues.push(err(`duplicate node id '${n.id}'`, n.id));
    seen.add(n.id);
  }
}

function checkDepReferentialIntegrity(
  doc: GraphDocument,
  nodeById: ReadonlyMap<string, unknown>,
  issues: GraphIssue[],
): void {
  for (const n of doc.nodes) {
    for (const d of n.deps) {
      if (!nodeById.has(d)) issues.push(err(`dep '${d}' is not a node in this document`, n.id));
    }
    n.routes.forEach((route, ri) => {
      for (const m of route) {
        if (!nodeById.has(m)) {
          issues.push(err(`route member '${m}' (route ${ri + 1}) is not a node in this document`, n.id));
        }
      }
    });
  }
}

function checkBdEdges(doc: GraphDocument, nodeById: ReadonlyMap<string, unknown>, issues: GraphIssue[]): void {
  for (const e of doc.edges.bd) {
    if (!nodeById.has(e.nodeId)) issues.push(err(`bd edge references unknown node '${e.nodeId}'`, e.nodeId));
  }
}

/** bd's portion of the unresolved-bucket EXACT accounting, keyed on `(edge:"bd", nodeId)` — the
 * same shape as af's (validate-af.ts), since a bd edge also names exactly one node. */
function checkBdUnresolvedBucket(doc: GraphDocument, issues: GraphIssue[]): void {
  const counts = new Map<string, number>();
  for (const u of doc.unresolved) {
    if (u.edge !== "bd") continue;
    const key = u.nodeId ?? "";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const e of doc.edges.bd) {
    if (e.resolved) continue;
    const count = counts.get(e.nodeId) ?? 0;
    if (count === 0) issues.push(err("unresolved bd edge has no entry in the unresolved bucket", e.nodeId));
    else if (count > 1) {
      issues.push(err(`unresolved bd edge has ${count} entries in the unresolved bucket (expected exactly 1)`, e.nodeId));
    }
  }
}

function checkReportEdges(doc: GraphDocument, nodeById: ReadonlyMap<string, unknown>, issues: GraphIssue[]): void {
  for (const e of doc.edges.report) {
    if (!nodeById.has(e.nodeId)) issues.push(err(`report edge references unknown node '${e.nodeId}'`, e.nodeId));
  }
}

/** report's portion of the bucket accounting, keyed on `(edge:"report", nodeId, ref:anchor)` — a
 * node may in principle carry more than one report anchor, so `ref` joins `nodeId` in the key.
 * WARN, not ERROR: report anchors are the least-hazardous edge (PRD C5 lists no known hazard for
 * it), and an un-anchored shard is common in an early-consolidation report. */
function checkReportUnresolvedBucket(doc: GraphDocument, issues: GraphIssue[]): void {
  const counts = new Map<string, number>();
  for (const u of doc.unresolved) {
    if (u.edge !== "report") continue;
    const key = `${u.nodeId ?? ""} ${u.ref}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const e of doc.edges.report) {
    if (e.resolved) continue;
    const key = `${e.nodeId} ${e.anchor}`;
    const count = counts.get(key) ?? 0;
    if (count === 0) {
      issues.push(warn(`unresolved report edge (anchor '${e.anchor}') has no entry in the unresolved bucket`, e.nodeId));
    }
  }
}

/** rk-0ehr / P1: `edges.retraction`'s referential integrity, in BOTH directions. A `resolved: true`
 * edge must name a real node (a retraction that claims to bind to a node that is not here is a
 * broken join, not a withdrawn claim); a `resolved: false` edge must NOT name a real node (it
 * should have resolved — silently leaving a live retraction unattached to the very node it
 * withdraws is the exact failure this whole edge kind exists to prevent). */
function checkRetractionEdges(doc: GraphDocument, nodeById: ReadonlyMap<string, unknown>, issues: GraphIssue[]): void {
  for (const e of doc.edges.retraction) {
    if (e.resolved && !nodeById.has(e.nodeId)) {
      issues.push(err(`retraction edge references unknown node '${e.nodeId}' while claiming to be resolved`, e.nodeId));
    }
    if (!e.resolved && nodeById.has(e.nodeId)) {
      issues.push(err(`retraction edge for '${e.nodeId}' is marked unresolved, but a node with that id IS in this document`, e.nodeId));
    }
  }
}

/** retraction's portion of the unresolved-bucket EXACT accounting, keyed on
 * `(edge:"retraction", ref)` — `ref` is the record's `itemId`, and the COUNT must match, not
 * merely be non-zero: two distinct retraction records naming the same unknown id are two distinct
 * bucket rows, never collapsed into one (the same discipline the Tier A review's blocker 4 imposed
 * on fr). Keyed on `ref` rather than `nodeId` because an unresolved retraction has no node — the
 * id it names is precisely the thing that failed to resolve. */
function checkRetractionUnresolvedBucket(doc: GraphDocument, issues: GraphIssue[]): void {
  const bucketCounts = new Map<string, number>();
  for (const u of doc.unresolved) {
    if (u.edge !== "retraction") continue;
    bucketCounts.set(u.ref, (bucketCounts.get(u.ref) ?? 0) + 1);
  }
  const edgeCounts = new Map<string, number>();
  for (const e of doc.edges.retraction) {
    if (e.resolved) continue;
    edgeCounts.set(e.nodeId, (edgeCounts.get(e.nodeId) ?? 0) + 1);
  }
  for (const [ref, expected] of edgeCounts) {
    const actual = bucketCounts.get(ref) ?? 0;
    if (actual !== expected) {
      issues.push(err(`unresolved retraction edge(s) for '${ref}': ${expected} on the edge array but ${actual} in the unresolved bucket (exact accounting, never a silent drop)`));
    }
  }
  for (const [ref, actual] of bucketCounts) {
    if (!edgeCounts.has(ref)) {
      issues.push(err(`unresolved bucket has ${actual} retraction entr${actual === 1 ? "y" : "ies"} for '${ref}' with no matching unresolved retraction edge`));
    }
  }
}

/** The identity-bearing determinism invariant (PRD C5 / M2.1 acceptance: "Deterministic: sorted
 * keys ... stable node ordering"). Compares EVERY array in `doc` (nodes, all four edge arrays,
 * unresolved, conflicts) against its own canonical order — src/graph/serialize.ts's
 * `canonicalizeGraphDocument` is the single source of truth for what "canonical" means, so this
 * check can never silently drift from what the serializer actually produces (Tier A review
 * follow-up 2: "either validate all canonical ordering or narrow the stated contract" — this
 * validates ALL of it, not nodes alone). A document that has NOT been canonicalized is still
 * structurally valid by every OTHER check in this file; only this one names where the
 * determinism contract itself is violated. */
/** rk-8805 (v3): a node's `signature` must be in CANONICAL form. The generic canonical-form check
 * below would notice the same defect, but only as an anonymous "nodes not in canonical order" —
 * this one names the NODE, because a signature is the field an author hand-writes and therefore the
 * one a person has to go and fix. Canonicalisation runs through src/gates/signature.ts's single
 * canonicaliser, so a graph document's signature bytes and a shard's block bytes can never disagree
 * about what canonical means. */
function checkNodeSignatures(doc: GraphDocument, issues: GraphIssue[]): void {
  for (const n of doc.nodes) {
    if (n.signature === undefined) continue;
    if (JSON.stringify(sortKeysDeep(n.signature)) !== JSON.stringify(sortKeysDeep(canonicalSignature(n.signature)))) {
      issues.push(err(`signature is not in canonical form (sorted keys, sorted entries — src/gates/signature.ts)`, n.id));
    }
  }
}

function checkCanonicalForm(doc: GraphDocument, issues: GraphIssue[]): void {
  const canonical = canonicalizeGraphDocument(doc);
  const arrayOrder = (label: string, actual: unknown, expected: unknown) => {
    if (JSON.stringify(sortKeysDeep(actual)) !== JSON.stringify(sortKeysDeep(expected))) {
      issues.push(err(`${label} not in canonical order (src/graph/serialize.ts's sort)`));
    }
  };
  arrayOrder("nodes", doc.nodes, canonical.nodes);
  arrayOrder("edges.af", doc.edges.af, canonical.edges.af);
  arrayOrder("edges.bd", doc.edges.bd, canonical.edges.bd);
  arrayOrder("edges.fr", doc.edges.fr, canonical.edges.fr);
  arrayOrder("edges.report", doc.edges.report, canonical.edges.report);
  arrayOrder("edges.retraction", doc.edges.retraction, canonical.edges.retraction);
  arrayOrder("unresolved", doc.unresolved, canonical.unresolved);
  arrayOrder("conflicts", doc.conflicts, canonical.conflicts);
}
