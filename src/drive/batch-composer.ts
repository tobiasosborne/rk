// PURITY: pure — no fs/clock/env/network (L3). M3.4: the batch composer. Turns a pool of candidate
// items into a deterministic set of batches, each satisfying every PRD C3 guardrail BY
// CONSTRUCTION — never a post-hoc check the caller could skip.
//
// rk-74o (M3 review follow-up 3, docs/reviews/2026-07-19-m3-milestone-review-codex.md): eligibility
// used to be a CALLER PROMISE. This module took a bare `candidateIds: string[]` and its own header
// said the pool was "assumed already restricted, by the caller, to whichever tier and crux/non-crux
// distinction applies". PRD §10 is explicit that shipping batching without the C3 guardrails is a
// validity-barrier violation, so the promise is gone: candidates now arrive as `BatchCandidate`
// evidence records and are screened by src/drive/batch-eligibility.ts's `screenCandidates` against
// real graph/af state before a single batch is seeded. Read that module's header for what
// "structural" does and does not claim, and for the determined-vs-indeterminate refusal split.
//
// GUARDRAILS, each enforced structurally (mutation-proven, see the WP's final report):
// 1. ROUTINE TIER — every member declares its own dispatch tier and it must equal the run's
//    (`config.tier`); an undeclared run tier or item tier refuses. batch-eligibility.ts.
// 2. CRITICAL-PATH EXCLUSION — computed here from the graph by M2.5's own `computeCriticalPath`
//    (inside batch-eligibility.ts), never a flag passed in. An unresolved north star refuses every
//    candidate rather than yielding an empty critical set that permits every batch (blocker 5d).
// 3. CRUX — af's own per-item crux flag refuses; an absent flag refuses as indeterminate.
// 4. INDEPENDENCE — no batch member depends on another, in EITHER structure: the REGISTRY graph
//    (direct or transitive, through deps AND every OR-route member — never only the currently
//    satisfied route, mirroring src/graph/query-path.ts's deliberately over-inclusive reading via
//    the SAME `requiredIds` helper, so the two can never silently diverge), and the AF PROOF TREE
//    (ancestor/descendant pairs, `afProofTreeDependent`) at the hard tier.
// 5. CAP — a batch never exceeds `config.cap` (default `DEFAULT_BATCH_CAP`): the growth loop stops
//    the instant `members.length` would reach the cap, so no code path can overshoot it.
// 6. ACTUAL-MEMBER PROVENANCE — `batchId` is derived from the members the batch ACTUALLY ends up
//    with (`deriveBatchId` below); downstream droppers must re-derive it (src/drive/
//    l5-dispatch-plan.ts, src/drive/l5-dispatch.ts), or `af unvalidate --batch <id>` would revoke a
//    set that was never dispatched.
//
// SHARED-CONTEXT SCORING FORMULA (documented exactly, not a vibe — IMPLEMENTATION_PLAN.md M3.4,
// PRD C3's corrected cost model "C_shared + Σ(c_i+v)"). For candidates i, j define:
//   ancestors(n) = every id transitively REQUIRING n — n's parents, grandparents, ... up toward
//                  (but never reaching) the north star, via the REVERSE of query-shared.ts's
//                  `requiredIds` (reverseDependents), excluding n itself. This is the "sibling
//                  leaves of a validated subtree" relation: two leaves sharing a common parent P
//                  (P requires both) share P in their `ancestors` sets.
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
// remains. Same input set (any order) always sorts to the same eligible list, so the same batches,
// in the same order, with the same `batchId`s, come out every time.

import { afProofTreeDependent, screenCandidates, type BatchCandidate, type EligibleCandidate, type ExcludedCandidate } from "./batch-eligibility";
import { closureFrom, indexNodes, requiredIds, reverseDependents } from "../graph/query-shared";
import type { GraphDocument } from "../graph/types";
import { sha256Hex } from "../gates/sha256";
import type { Tier } from "./vocab";

export const DEFAULT_BATCH_CAP = 10;
const DEFAULT_ANCESTOR_WEIGHT = 3;
const DEFAULT_DEFS_WEIGHT = 1;

export interface BatchComposerConfig {
  /** The run's dispatch tier. REQUIRED in effect: absent refuses every candidate (there is no
   * default tier — a default is exactly the permissive path rk-74o removes). */
  tier?: Tier;
  cap?: number;
  ancestorWeight?: number;
  defsWeight?: number;
  /** af proof-tree parent edges (see batch-eligibility.ts's `EligibilityInput.afParents`).
   * Required at the hard tier; without it no hard candidate's ancestry can be closed and nothing
   * composes. */
  afParents?: ReadonlyMap<string, readonly string[]>;
}

export interface ComposedBatch {
  batchId: string;
  /** The dispatch tier every member was screened against — a batch is tier-homogeneous by
   * construction, and downstream (src/drive/batch-plan.ts) reads it here rather than being told
   * again by a caller who could say something different. */
  tier: Tier;
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
  /** The run's dispatch tier, or `undefined` when it was never declared (in which case `batches`
   * is empty and every candidate is excluded). */
  tier?: Tier;
  cap: number;
  batches: ComposedBatch[];
  excluded: ExcludedCandidate[];
}

/** THE batchId derivation: `"batch-" + sha256Hex(utf8("batch|northStar:<id>|members:<sorted,
 * comma-joined>")).slice(0, 16)`. Content-addressed (mirrors src/graph/serialize.ts's own
 * "content-addressed, timestamps excluded from identity" discipline) — the SAME member set under
 * the SAME north star always derives the SAME id; changing membership changes it. Exported so
 * every downstream re-deriver (src/drive/batch-plan.ts, l5-dispatch-plan.ts, l5-dispatch.ts) uses
 * ONE formula: any stage that DROPS a member must re-derive through this function, because the
 * recorded id is what `af unvalidate --batch <id>` revokes. */
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

/** Composes batches over `candidates` (evidence records for the items the caller wants dispatched).
 * Never throws: every item that cannot be batched appears in `excluded` with the constraint that
 * refused it and whether that refusal was determined or indeterminate. Every candidate id lands in
 * exactly one of `batches`/`excluded` — nothing is silently dropped (CLAUDE.md L2). */
export function composeBatches(
  doc: GraphDocument,
  candidates: readonly BatchCandidate[],
  northStarId: string,
  config: BatchComposerConfig,
): BatchComposerResult {
  const cap = Math.max(1, Math.floor(config.cap ?? DEFAULT_BATCH_CAP));
  const ancestorWeight = config.ancestorWeight ?? DEFAULT_ANCESTOR_WEIGHT;
  const defsWeight = config.defsWeight ?? DEFAULT_DEFS_WEIGHT;

  const screen = screenCandidates({ doc, candidates, northStarId, tier: config.tier, afParents: config.afParents });
  if (screen.tier === undefined || screen.eligible.length === 0) {
    return { northStarId, tier: screen.tier, cap, batches: [], excluded: screen.excluded };
  }
  const tier = screen.tier;

  const byId = indexNodes(doc);
  const eligible = screen.eligible.map((e) => e.id).sort();
  const evidenceById = new Map<string, EligibleCandidate>(screen.eligible.map((e) => [e.id, e] as const));

  const requirementClosures = transitiveRequirementClosures(doc, eligible);
  const ancestorClosures = transitiveAncestorClosures(doc, eligible);
  const defsById = new Map(eligible.map((id) => [id, byId.get(id)!.defs] as const));

  // Guardrail 4: BOTH structures must clear the pair. The registry closure catches "b's contract
  // cites a"; the af check catches "b's proof step sits under a in the same proof tree" — a
  // relation the registry graph, which lives one level up at claim granularity, cannot see.
  const independent = (a: string, b: string): boolean =>
    !requirementClosures.get(a)!.has(b) &&
    !requirementClosures.get(b)!.has(a) &&
    !afProofTreeDependent(evidenceById.get(a)!, evidenceById.get(b)!);

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
    batches.push({ batchId: deriveBatchId(northStarId, members), tier, members, score: cohesionScore(members, pairScore) });
  }

  return { northStarId, tier, cap, batches, excluded: screen.excluded };
}
