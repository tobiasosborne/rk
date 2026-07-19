// PURITY: pure — no fs/network/clock (L3). af-evidence requirement + rename-hazard cross-check +
// resolved-shape invariants + af unresolved-bucket accounting — Tier A review blockers 1 and 2
// (2026-07-19, docs/memos/2026-07-19-graph-schema-v1.md's "review outcomes"). Split out of
// validate.ts to stay clear of CLAUDE.md's 280-line shard cap.
//
// Blocker 1: "A node with status:'proved', af:'validated', and a workspace but no edges.af
// validates with zero issues... Require exactly one af edge for every node with af != 'none'.
// Make the edge a discriminated union: unresolved workspace requires a bucket entry; resolved
// workspace requires af schema version, root-node identity, contract-match verdict, enumerated
// epistemic/taint states, and node count." The TS union in src/graph/types.ts enforces the shape
// at compile time; this module is the RUNTIME backstop (a document assembled from untyped JSON —
// the eventual M2.2 store-reader boundary — is not automatically well-typed just because the
// interface says so) plus the CROSS-ARRAY cardinality check ("exactly one edge per node") that no
// single-object schema validator can express at all.
//
// Blocker 2: "Contract matching is explicitly allowed against a non-root af node... Require the
// unique root node... byte-match against that entry's statement, never workspace.conjecture or
// an arbitrary descendant." af's hierarchical numbering roots UNCONDITIONALLY at id "1"
// (../vibefeld/docs/export-graph-v1.md) — `ResolvedAfEdge.afRootNodeId` must equal
// `AF_ROOT_NODE_ID`, checked below.

import { AF_EPISTEMIC_STATES, AF_ROOT_NODE_ID, AF_TAINT_STATES } from "./types";
import type { AfEdge, GraphDocument, RegistryNode, ResolvedAfEdge } from "./types";
import { err, type GraphIssue } from "./validate-issue";

function checkWorkspaceCrossCheck(e: AfEdge, owner: RegistryNode, issues: GraphIssue[]): void {
  if (e.workspace.length === 0) {
    issues.push(err("af edge has an empty workspace (the join key must be a real value)", e.nodeId));
  }
  if (owner.workspace === undefined) {
    issues.push(err("af edge present for a node that declares no workspace: field", e.nodeId));
  } else if (owner.workspace !== e.workspace) {
    issues.push(
      err(
        `af edge workspace '${e.workspace}' does not match its node's own workspace field ` +
          `'${owner.workspace}' — the join key must come from workspace:, never inferred from id`,
        e.nodeId,
      ),
    );
  }
}

function checkResolvedShape(e: ResolvedAfEdge, issues: GraphIssue[]): void {
  if (e.afRootNodeId !== AF_ROOT_NODE_ID) {
    issues.push(
      err(
        `af edge contract match targets node '${e.afRootNodeId}', not the af export's root ` +
          `('${AF_ROOT_NODE_ID}') — contract byte-match must target ONLY the root node's ` +
          "statement, never an internal lemma and never workspace.conjecture",
        e.nodeId,
      ),
    );
  }
  if (typeof e.afSchemaVersion !== "string" || e.afSchemaVersion.length === 0) {
    issues.push(err("resolved af edge missing afSchemaVersion", e.nodeId));
  }
  if (typeof e.contractMatch !== "boolean") {
    issues.push(err("resolved af edge missing contractMatch", e.nodeId));
  }
  if (!(AF_EPISTEMIC_STATES as readonly string[]).includes(e.epistemicState)) {
    issues.push(
      err(`resolved af edge epistemicState '${e.epistemicState}' not in [${AF_EPISTEMIC_STATES.join(", ")}]`, e.nodeId),
    );
  }
  if (!(AF_TAINT_STATES as readonly string[]).includes(e.taintState)) {
    issues.push(err(`resolved af edge taintState '${e.taintState}' not in [${AF_TAINT_STATES.join(", ")}]`, e.nodeId));
  }
  if (typeof e.nodeCount !== "number" || e.nodeCount < 0) {
    issues.push(err("resolved af edge missing/invalid nodeCount", e.nodeId));
  }
}

/** Every structural check over `edges.af`: the af-evidence requirement (exactly one edge per
 * node with `af != "none"`, zero for a node with `af === "none"`), the rename-hazard workspace
 * cross-check, and the resolved-shape invariants. */
export function checkAfEdges(doc: GraphDocument, nodeById: ReadonlyMap<string, RegistryNode>, issues: GraphIssue[]): void {
  const seenForNode = new Set<string>();

  for (const e of doc.edges.af) {
    const node = nodeById.get(e.nodeId);
    if (!node) {
      issues.push(err(`af edge references unknown node '${e.nodeId}'`, e.nodeId));
      continue;
    }
    if (seenForNode.has(e.nodeId)) {
      issues.push(err(`duplicate af edge for node '${e.nodeId}' (exactly one is required)`, e.nodeId));
    }
    seenForNode.add(e.nodeId);

    if (node.af === "none") {
      issues.push(err("af edge present for a node with af:\"none\" (nothing declared to join against)", e.nodeId));
    }

    checkWorkspaceCrossCheck(e, node, issues);
    if (e.workspaceResolved) checkResolvedShape(e, issues);
  }

  for (const n of doc.nodes) {
    if (n.af !== "none" && !seenForNode.has(n.id)) {
      issues.push(
        err(
          `node af='${n.af}' (status='${n.status ?? "none"}') has no edges.af entry — every node ` +
            'with af != "none" must carry exactly one af-evidence edge',
          n.id,
        ),
      );
    }
  }
}

/** af's portion of the unresolved-bucket exact accounting (PRD C5: never silently dropped):
 * every `workspaceResolved:false` edge must have EXACTLY one companion `unresolved` entry keyed
 * on `(edge:"af", nodeId)`. */
export function checkAfUnresolvedBucket(doc: GraphDocument, issues: GraphIssue[]): void {
  const bucketCounts = new Map<string, number>();
  for (const u of doc.unresolved) {
    if (u.edge !== "af") continue;
    const key = u.nodeId ?? "";
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
  }
  for (const e of doc.edges.af) {
    if (e.workspaceResolved) continue;
    const count = bucketCounts.get(e.nodeId) ?? 0;
    if (count === 0) {
      issues.push(err(`unresolved af edge (workspace '${e.workspace}') has no entry in the unresolved bucket`, e.nodeId));
    } else if (count > 1) {
      issues.push(
        err(
          `unresolved af edge (workspace '${e.workspace}') has ${count} entries in the unresolved ` +
            "bucket (expected exactly 1)",
          e.nodeId,
        ),
      );
    }
  }
}
