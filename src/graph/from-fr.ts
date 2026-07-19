// PURITY: pure — no fs/network/clock (L3). registry↔fr join (PRD C5): builds `FrEdge[]` + the fr
// portion of the `unresolved` bucket from a `RegistryNode[]` and the raw `FrSourceRecord[]`
// src/store/fr-load.ts collected (one per fr log record that names a resolvable reference at
// all — a bare `discovery`/`orient`/`dispatch` record with no artifact and no graduate marker
// names nothing to resolve and is not part of this join surface; the AISM read-through memo
// reports total-log-record counts alongside resolved/unresolved so that exclusion is visible,
// never conflated with "dropped").
//
// TOTAL conversion (M2.2 acceptance, Tier A review blocker 4 lineage): every `FrSourceRecord`
// resolves to EXACTLY one `FrEdge`, and every unresolved one gets EXACTLY one companion bucket
// entry keyed on `(edge:"fr", sourceCycle, ref)` — never collapsed by shared artifact TEXT across
// two distinct cycles (the collapse bug M2.1's review caught). `../knowledge-frontier/docs/
// export-v1.md`'s "Verdict↔artifact join" hazard (exact string equality, no fuzzy matching) is
// honored: `resolveArtifact` below tries, in order, an exact match against a node's `path`, then
// its `id` — never a substring/fuzzy match.

import type { FrEdge, RegistryNode, UnresolvedFrRef } from "./types";

/** One fr record worth attempting to resolve — either a `progress`/`banked` pull's
 * `evidence.artifact`, or a `graduate` marker's own `graduated_to` free-text ref. `cycle` is the
 * record's OWN fr log identity (`graduates` on a graduate marker points at a DIFFERENT, earlier
 * cycle — the survivor being handed off — and is carried separately, not confused with this
 * record's own `cycle`). */
export interface FrSourceRecord {
  cycle: number;
  kind: "artifact" | "graduate";
  ref: string;
  outcome?: string;
  verdict?: string;
  verdictFresh?: boolean;
  supersedes?: number;
}

/** Exact-match resolution ONLY (../knowledge-frontier/docs/export-v1.md: "no fuzzy matching
 * anywhere in fr"). Tries the shard's own repo-relative `path` first (the common case: `evidence.
 * artifact` naming `argument/lemmas/lem-x.md`), then the registry `id` (a bare id token). */
function resolveArtifact(ref: string, byPath: ReadonlyMap<string, RegistryNode>, byId: ReadonlyMap<string, RegistryNode>) {
  const viaPath = byPath.get(ref);
  if (viaPath) return { nodeId: viaPath.id, method: "path" as const };
  const viaId = byId.get(ref);
  if (viaId) return { nodeId: viaId.id, method: "oracle" as const };
  return undefined;
}

function unresolved(rec: FrSourceRecord, reason: string): UnresolvedFrRef {
  return { edge: "fr", sourceCycle: rec.cycle, ref: rec.ref, reason };
}

/** Builds every fr edge (TOTAL over `records`) plus the fr unresolved bucket. */
export function buildFrEdges(
  nodes: readonly RegistryNode[],
  records: readonly FrSourceRecord[],
): { edges: FrEdge[]; unresolved: UnresolvedFrRef[] } {
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: FrEdge[] = [];
  const refs: UnresolvedFrRef[] = [];

  for (const rec of records) {
    const base = {
      cycle: rec.cycle,
      artifact: rec.ref,
      outcome: rec.outcome,
      verdict: rec.verdict,
      verdictFresh: rec.verdictFresh,
      supersedes: rec.supersedes,
    };
    if (rec.kind === "artifact") {
      const hit = resolveArtifact(rec.ref, byPath, byId);
      if (hit) {
        edges.push({ ...base, resolutionMethod: hit.method, resolvedNodeId: hit.nodeId });
      } else {
        edges.push({ ...base, resolutionMethod: "unresolved" });
        refs.push(unresolved(rec, `no registry node's path or id matches artifact '${rec.ref}'`));
      }
      continue;
    }
    // kind === "graduate": resolve the marker's own `graduated_to` free text the same way.
    const hit = resolveArtifact(rec.ref, byPath, byId);
    if (hit) {
      edges.push({ ...base, resolutionMethod: "graduates", resolvedNodeId: hit.nodeId });
    } else {
      edges.push({ ...base, resolutionMethod: "unresolved" });
      refs.push(unresolved(rec, `no registry node's path or id matches graduated_to ref '${rec.ref}'`));
    }
  }
  return { edges, unresolved: refs };
}
