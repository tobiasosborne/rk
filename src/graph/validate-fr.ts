// PURITY: pure — no fs/network/clock (L3). fr-edge structural checks — Tier A review blocker 4
// (2026-07-19, docs/memos/2026-07-19-graph-schema-v1.md's "review outcomes"): "Distinct unresolved
// fr references collapse, and resolved fr edges need not target a node... Key fr unresolved
// entries by (edge, sourceCycle, ref), require sourceCycle for fr, enforce exact one-to-one
// accounting, and check resolvedNodeId referential integrity. Also forbid resolvedNodeId on
// unresolved edges." Split out of validate.ts to stay clear of CLAUDE.md's 280-line shard cap.
//
// The TS union (`UnresolvedFrEdge` / `ResolvedFrEdge` in src/graph/types.ts) already forbids
// `resolvedNodeId` on an unresolved edge and requires it on a resolved one at compile time; this
// module is the runtime backstop (a document assembled from untyped JSON is not automatically
// well-typed) plus the CROSS-ARRAY exact-accounting check no single-object schema validator can
// express.

import type { GraphDocument, RegistryNode } from "./types";
import { err, type GraphIssue } from "./validate-issue";

export function checkFrEdges(doc: GraphDocument, nodeById: ReadonlyMap<string, RegistryNode>, issues: GraphIssue[]): void {
  const seenCycles = new Set<number>();
  for (const e of doc.edges.fr) {
    if (seenCycles.has(e.cycle)) issues.push(err(`duplicate fr edge for cycle ${e.cycle}`));
    seenCycles.add(e.cycle);

    if (e.resolutionMethod === "unresolved") {
      const anyE = e as Record<string, unknown>;
      if (anyE.resolvedNodeId !== undefined) {
        issues.push(err(`unresolved fr edge (cycle ${e.cycle}) must not carry resolvedNodeId`));
      }
      continue;
    }
    if (!e.resolvedNodeId) {
      issues.push(err(`fr edge (cycle ${e.cycle}) claims resolution '${e.resolutionMethod}' but names no resolvedNodeId`));
    } else if (!nodeById.has(e.resolvedNodeId)) {
      issues.push(err(`fr edge (cycle ${e.cycle}) resolvedNodeId '${e.resolvedNodeId}' is not a node in this document`));
    }
  }
}

/** Exact one-to-one accounting keyed on `(edge:"fr", sourceCycle, ref:artifact)` — the collapse
 * bug the review caught (two distinct unresolved cycles naming the same artifact TEXT satisfied
 * by only one bucket entry, silently dropping the second). Also flags an orphan bucket entry
 * (recorded but naming no real unresolved fr edge in this document) — a phantom record is as
 * dishonest as a missing one on a validity surface. */
export function checkFrUnresolvedBucket(doc: GraphDocument, issues: GraphIssue[]): void {
  const bucketCounts = new Map<string, number>();
  for (const u of doc.unresolved) {
    if (u.edge !== "fr") continue;
    const key = `${u.sourceCycle} ${u.ref}`;
    bucketCounts.set(key, (bucketCounts.get(key) ?? 0) + 1);
  }

  const edgeKeys = new Set<string>();
  for (const e of doc.edges.fr) {
    if (e.resolutionMethod !== "unresolved") continue;
    const key = `${e.cycle} ${e.artifact}`;
    edgeKeys.add(key);
    const count = bucketCounts.get(key) ?? 0;
    if (count === 0) {
      issues.push(err(`unresolved fr edge (cycle ${e.cycle}, artifact '${e.artifact}') has no entry in the unresolved bucket`));
    } else if (count > 1) {
      issues.push(
        err(
          `unresolved fr edge (cycle ${e.cycle}, artifact '${e.artifact}') has ${count} entries ` +
            "in the unresolved bucket (expected exactly 1)",
        ),
      );
    }
  }

  for (const u of doc.unresolved) {
    if (u.edge !== "fr") continue;
    const key = `${u.sourceCycle} ${u.ref}`;
    if (!edgeKeys.has(key)) {
      issues.push(
        err(`unresolved bucket entry (fr cycle ${u.sourceCycle}, ref '${u.ref}') matches no unresolved fr edge in this document`),
      );
    }
  }
}
