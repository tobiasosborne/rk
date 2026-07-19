// PURITY: pure — no fs/network/clock (L3). M3.4: the batch composer. Turns a caller-supplied pool
// of verification-ready candidate node ids into a deterministic set of batches, each satisfying
// every PRD C3 guardrail BY CONSTRUCTION — never a post-hoc check the caller could skip.
//
// SCOPE NOTE ("routine tier" eligibility, IMPLEMENTATION_PLAN.md M3.4): this module carries no
// tier/crux information at all. `candidateIds` is assumed already restricted, by the caller, to
// whichever tier and crux/non-crux distinction applies to this dispatch — ../vibefeld's
// `af export --graph json` v1 exposes a per-node `crux` flag (docs/export-graph-v1.md: "True if
// the node is marked critical-path ... requires a passing claim-test before acceptance") that
// rk's own `schemas/graph.v1.json` (src/graph/types-edges.ts's `AfEdge`) does not yet thread
// through as of M3.4 — a graph-schema gap, not this WP's to fix (src/graph/** is READ-ONLY here).
// Once it lands, a crux-aware caller simply omits crux ids from `candidateIds`; no interface
// change needed here. This module is reusable by both the L5 soft tier's own batch dispatch and
// the hard tier's `af verdicts apply` seam (src/drive/batch-plan.ts is the hard-tier projection).
//
// GUARDRAILS, each enforced structurally (mutation-proven, see the WP's final report):
// 1. INDEPENDENCE — no batch member depends on another, direct OR transitive, through deps AND
//    EVERY OR-route member (never only the currently-satisfied route — mirrors src/graph/
//    query-path.ts's deliberately over-inclusive reading, via the SAME `requiredIds` helper from
//    query-shared.ts, so the two modules can never silently diverge on what "depends on" means).
// 2. CAP — a batch never exceeds `config.cap` (default `DEFAULT_BATCH_CAP`): the growth loop below
//    stops the instant `members.length` would reach the cap, so no code path can overshoot it.
// 3. CRITICAL-PATH EXCLUSION — every id `computeCriticalPath` (M2.5) reports reachable from the
//    north star is filtered into `excluded` with reason "critical-path" before batching starts; it
//    can never be selected as a batch member. (An id naming no real node in `doc` is similarly
//    filtered with reason "unknown-node" — CLAUDE.md L2's "never a silent drop" applies to a
//    caller-supplied bad id exactly as it does to a gate's own findings.)
//
// SHARED-CONTEXT SCORING FORMULA (documented exactly, not a vibe — IMPLEMENTATION_PLAN.md M3.4,
// PRD C3's corrected cost model "C_shared + Σ(c_i+v)"). For candidates i, j define:
//   ancestors(n) = every node id transitively REQUIRING n — i.e. n's parents, grandparents, ...
//                  up toward (but never reaching) the north star, via the REVERSE of
//                  query-shared.ts's `requiredIds` (reverseDependents) — excluding n itself. This
//                  is the "sibling leaves of a validated subtree" relation: two leaves sharing a
//                  common parent P (P requires both) share P in their `ancestors` sets.
//   defsOf(n)    = RegistryNode.defs (definitions n itself cites directly).
//   pairScore(i, j) = ANCESTOR_WEIGHT * |ancestors(i) ∩ ancestors(j)|
//                   + DEFS_WEIGHT     * |defsOf(i) ∩ defsOf(j)|
// ANCESTOR_WEIGHT=3, DEFS_WEIGHT=1: a shared ancestor chain is the direct signal PRD C3 names
// ("sibling leaves of validated subtrees" — the C_shared term's biggest single amortizable piece);
// shared definitions are a smaller but real contributor to the same shared prompt. A batch's own
// cohesion score is the sum of `pairScore` over every unordered member pair.
//
// COMPOSITION ALGORITHM (deterministic, no Math.random, no clock): repeatedly seed a new batch
// with the LOWEST still-unbatched sorted id, then greedily add whichever still-independent
// remaining candidate maximizes its summed `pairScore` against the batch's CURRENT members (ties
// broken by lowest id, since candidates are always scanned in sorted order and only a STRICTLY
// greater score replaces the running best), until the cap is hit or no independent candidate
// remains. Same input set (any order) always sorts to the same eligible list, so the same
// batches, in the same order, with the same `batchId`s, come out every time.

import { computeCriticalPath } from "../graph/query-path";
import { closureFrom, indexNodes, requiredIds, reverseDependents } from "../graph/query-shared";
import type { GraphDocument } from "../graph/types";
import { sha256Hex } from "../gates/sha256";

export const DEFAULT_BATCH_CAP = 10;
const DEFAULT_ANCESTOR_WEIGHT = 3;
const DEFAULT_DEFS_WEIGHT = 1;

export interface BatchComposerConfig {
  cap?: number;
  ancestorWeight?: number;
  defsWeight?: number;
}

export type ExclusionReason = "critical-path" | "unknown-node";

export interface ExcludedCandidate {
  id: string;
  reason: ExclusionReason;
}

export interface ComposedBatch {
  batchId: string;
  /** Sorted ascending. Independence guarantees no member requires another, so ANY order is a
   * valid dependency order (verdicts-apply.md: "children before parent") — sorted for
   * determinism, not because order matters semantically here. */
  members: string[];
  /** Sum of `pairScore` over every unordered member pair — the batch's own cohesion; higher means
   * more shared context (siblings), never itself claimed to be a cost estimate in tokens. */
  score: number;
}

export interface BatchComposerResult {
  northStarId: string;
  cap: number;
  batches: ComposedBatch[];
  excluded: ExcludedCandidate[];
}

/** THE batchId derivation: `"batch-" + sha256Hex(utf8("batch|northStar:<id>|members:<sorted,
 * comma-joined>")).slice(0, 16)`. Content-addressed (mirrors src/graph/serialize.ts's own
 * "content-addressed, timestamps excluded from identity" discipline) — the SAME member set under
 * the SAME north star always derives the SAME id; changing membership changes it. Exported so
 * src/drive/batch-plan.ts (and any future re-deriver, e.g. a test asserting id stability) never
 * hand-rolls a second, competing formula. */
export function deriveBatchId(northStarId: string, members: readonly string[]): string {
  const sortedMembers = [...members].sort();
  const canonical = `batch|northStar:${northStarId}|members:${sortedMembers.join(",")}`;
  const hash = sha256Hex(new TextEncoder().encode(canonical));
  return `batch-${hash.slice(0, 16)}`;
}

function transitiveRequirementClosures(doc: GraphDocument, ids: readonly string[]): Map<string, Set<string>> {
  const byId = indexNodes(doc);
  const next = (id: string): readonly string[] => {
    const n = byId.get(id);
    return n ? requiredIds(n) : [];
  };
  const out = new Map<string, Set<string>>();
  for (const id of ids) {
    const closure = closureFrom([id], next);
    closure.delete(id);
    out.set(id, closure);
  }
  return out;
}

function transitiveAncestorClosures(doc: GraphDocument, ids: readonly string[]): Map<string, Set<string>> {
  const reverse = reverseDependents(doc);
  const next = (id: string): readonly string[] => [...(reverse.get(id) ?? [])];
  const out = new Map<string, Set<string>>();
  for (const id of ids) {
    const closure = closureFrom([id], next);
    closure.delete(id);
    out.set(id, closure);
  }
  return out;
}

function intersectionSize<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  let count = 0;
  for (const x of a) if (b.has(x)) count++;
  return count;
}

function overlapCount(a: readonly string[], b: readonly string[]): number {
  const setB = new Set(b);
  let count = 0;
  for (const x of a) if (setB.has(x)) count++;
  return count;
}

function cohesionScore(members: readonly string[], pairScore: (a: string, b: string) => number): number {
  let total = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) total += pairScore(members[i]!, members[j]!);
  }
  return total;
}

/** Composes batches over `candidateIds` (verification-ready node ids the caller wants
 * dispatched), excluding anything unresolvable or on the critical path to `northStarId`. Never
 * throws: an unknown id or a critical-path id is reported in `excluded`, never dropped silently. */
export function composeBatches(
  doc: GraphDocument,
  candidateIds: readonly string[],
  northStarId: string,
  config: BatchComposerConfig = {},
): BatchComposerResult {
  const cap = Math.max(1, Math.floor(config.cap ?? DEFAULT_BATCH_CAP));
  const ancestorWeight = config.ancestorWeight ?? DEFAULT_ANCESTOR_WEIGHT;
  const defsWeight = config.defsWeight ?? DEFAULT_DEFS_WEIGHT;

  const byId = indexNodes(doc);
  const criticalSet = new Set(computeCriticalPath(doc, northStarId).nodeIds);

  const excluded: ExcludedCandidate[] = [];
  const eligible: string[] = [];
  for (const id of [...new Set(candidateIds)].sort()) {
    if (!byId.has(id)) {
      excluded.push({ id, reason: "unknown-node" });
    } else if (criticalSet.has(id)) {
      excluded.push({ id, reason: "critical-path" });
    } else {
      eligible.push(id);
    }
  }

  const requirementClosures = transitiveRequirementClosures(doc, eligible);
  const ancestorClosures = transitiveAncestorClosures(doc, eligible);
  const defsById = new Map(eligible.map((id) => [id, byId.get(id)!.defs] as const));

  const independent = (a: string, b: string): boolean =>
    !requirementClosures.get(a)!.has(b) && !requirementClosures.get(b)!.has(a);

  const pairScore = (a: string, b: string): number =>
    ancestorWeight * intersectionSize(ancestorClosures.get(a)!, ancestorClosures.get(b)!) +
    defsWeight * overlapCount(defsById.get(a)!, defsById.get(b)!);

  const remaining = new Set(eligible);
  const batches: ComposedBatch[] = [];

  while (remaining.size > 0) {
    const sortedRemaining = [...remaining].sort();
    const seed = sortedRemaining[0]!;
    const members: string[] = [seed];
    remaining.delete(seed);

    while (members.length < cap) {
      let bestId: string | undefined;
      let bestScore = -Infinity;
      for (const candidate of [...remaining].sort()) {
        if (!members.every((m) => independent(candidate, m))) continue;
        const total = members.reduce((sum, m) => sum + pairScore(candidate, m), 0);
        if (total > bestScore) {
          bestScore = total;
          bestId = candidate;
        }
      }
      if (bestId === undefined) break;
      members.push(bestId);
      remaining.delete(bestId);
    }

    members.sort();
    batches.push({ batchId: deriveBatchId(northStarId, members), members, score: cohesionScore(members, pairScore) });
  }

  return { northStarId, cap, batches, excluded };
}
