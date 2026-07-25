// PURITY: pure — no fs/network/clock (L3). rk-74o (M3 review follow-up 3, docs/reviews/
// 2026-07-19-m3-milestone-review-codex.md): STRUCTURAL batch eligibility. Batch membership used to
// be a CALLER PROMISE — src/drive/batch-composer.ts took a bare id list and trusted that whoever
// assembled it had already restricted it to routine-tier, non-crux, off-critical-path,
// mutually-independent items. PRD §10's "Batch-verification risk" paragraph is explicit that the
// §4 C3 guardrails "are part of the feature's definition of done, not follow-ups; shipping
// batching without them is a validity-barrier violation", and the correlated-bad-verifier failure
// mode (one bad session wrongly validating N items at once) is exactly what a promise cannot
// contain. This module is the refusal core: it screens candidates against REAL graph/af state and
// returns, per candidate, either eligibility with the facts the composer needs, or a refusal naming
// the constraint that said no.
//
// WHAT "STRUCTURAL" MEANS HERE, stated honestly (PRD C3's own stance on identity: "recorded and
// mechanically checkable ... provenance, not adversary-proof enforcement"). This module is PURE
// (L3): it cannot read af or the file system. So it never accepts a caller's SUMMARY VERDICT ("this
// pool is eligible", "these are independent"); it accepts only PRIMITIVE RECORDED FACTS — declared
// dispatch tier, af crux flag, af workspace/id, af parent edges — and derives every conclusion
// itself: critical-path membership via M2.5's own `computeCriticalPath`, af ancestry via its own
// upward closure, registry independence (in the composer) via the graph's own requirement closures.
// Same seam as src/drive/cross-vendor.ts, which takes raw identity STRINGS and decodes them itself
// rather than trusting a caller-computed "these are cross-vendor" boolean. The trust anchor for the
// primitive facts stays the edge that read af (src/drive/driver-af.ts) — but no single
// caller-supplied boolean can any longer wave a batch through.
//
// FAIL CLOSED, AND SAY WHICH KIND OF NO. Every refusal carries a `determinacy`: `determined` (we
// KNOW this one is ineligible — crux, on the critical path, wrong tier) vs `indeterminate` (we
// could not find out — no tier, no af identity, unclosable ancestry, an id naming no registry
// node). Both refuse, and must never be conflated in a report — exactly as cross-vendor.ts refuses
// to report `identity-unparseable` as a confirmed `same-family` violation.

import { computeCriticalPath } from "../graph/query-path";
import { indexNodes } from "../graph/query-shared";
import type { GraphDocument } from "../graph/types";
import { TIERS, type Tier } from "./vocab";

/** The primitive recorded facts one batch candidate brings. Every field beyond `id` is OPTIONAL in
 * the TYPE and REQUIRED in effect: an absent field is an indeterminate answer, which refuses. There
 * is deliberately no field a caller can set to assert eligibility directly. */
export interface BatchCandidate {
  /** The registry (graph spine) id the composer batches and `deriveBatchId` records. */
  id: string;
  /** The dispatch tier this item was drawn from, cross-checked against the run's own dispatch tier
   * so a hard-tier item can never be smuggled into an l5 batch (or the reverse). */
  tier?: Tier;
  /** af's per-item `crux` flag (../vibefeld/docs/export-graph-v1.md: "True if the node is marked
   * critical-path ... requires a passing claim-test before acceptance"), read raw off the af export
   * by the edge (bead rk-mnp: rk's graph schema does not thread it). `true` refuses; `undefined`
   * refuses as indeterminate. */
  crux?: boolean;
  /** af workspace this item's proof tree lives in (the registry↔af join key,
   * `RegistryNode.workspace` shape). With `afNodeId` it forms `afNodeKey`, so two workspaces
   * reusing the same af id (they all start at "1") can never collide. */
  afWorkspace?: string;
  /** This item's af proof-tree id within `afWorkspace` (e.g. "1.2.1"). Required at the hard tier. */
  afNodeId?: string;
}

/** Which guardrail refused — carried alongside `reason` so a log line or report row can group
 * refusals by constraint without string-matching reason names. */
export type EligibilityConstraint =
  | "dispatch-tier" | "north-star" | "registry-identity" | "item-tier" | "critical-path" | "crux" | "af-proof-tree";

export type ExclusionReason =
  | "dispatch-tier-undeclared" | "north-star-unresolved" | "unknown-node" | "conflicting-evidence"
  | "tier-undeclared" | "tier-mismatch" | "critical-path" | "crux-undeclared" | "crux"
  | "af-identity-undeclared" | "af-ancestry-unclosable";

/** `determined` = established ineligible; `indeterminate` = unestablishable, so refused anyway. */
export type Determinacy = "determined" | "indeterminate";

export const EXCLUSION_DETERMINACY: Record<ExclusionReason, Determinacy> = {
  "dispatch-tier-undeclared": "indeterminate",
  "north-star-unresolved": "indeterminate",
  "unknown-node": "indeterminate",
  "conflicting-evidence": "indeterminate",
  "tier-undeclared": "indeterminate",
  "tier-mismatch": "determined",
  "critical-path": "determined",
  "crux-undeclared": "indeterminate",
  "crux": "determined",
  "af-identity-undeclared": "indeterminate",
  "af-ancestry-unclosable": "indeterminate",
};

export interface ExcludedCandidate {
  id: string;
  constraint: EligibilityConstraint;
  reason: ExclusionReason;
  determinacy: Determinacy;
  /** One sentence naming what was checked and what was found — the text a driver log line and the
   * SC4 report carry verbatim. Never mentions a value the screen did not actually observe. */
  detail: string;
}

/** A candidate that survived every screen, plus the facts the composer derives pairwise
 * independence from. Constructed ONLY by `screenCandidates`, so a composer can never be handed a
 * hand-rolled "eligible" record that skipped these checks. */
export interface EligibleCandidate {
  id: string;
  tier: Tier;
  /** `afNodeKey(afWorkspace, afNodeId)`; `undefined` at the l5 tier, where the item is a registry
   * shard with no af proof-tree identity of its own. */
  afKey?: string;
  /** The TRANSITIVE af ancestor closure of `afKey`, derived here from the parent edges (never
   * supplied pre-closed by a caller). Empty at the l5 tier. */
  afAncestors: ReadonlySet<string>;
}

export interface EligibilityInput {
  doc: GraphDocument;
  candidates: readonly BatchCandidate[];
  northStarId: string;
  /** The run's dispatch tier. Absent refuses EVERY candidate: there is no default, because a
   * default would be precisely the permissive path this module exists to remove. */
  tier?: Tier;
  /** af proof-tree parent edges, keyed by `afNodeKey`, each mapping to its DIRECT parents' keys (a
   * root maps to `[]`). The screen walks this itself to close each candidate's ancestry; a key
   * missing mid-walk refuses the candidate. Required at the hard tier; ignored at l5. */
  afParents?: ReadonlyMap<string, readonly string[]>;
}

export interface EligibilityScreen {
  tier?: Tier;
  /** Sorted by id. */
  eligible: EligibleCandidate[];
  /** Sorted by id. Every candidate id appears in exactly one of the two lists — nothing is ever
   * silently dropped (CLAUDE.md L2). */
  excluded: ExcludedCandidate[];
}

/** The globally unique key for one af proof-tree item. af ids restart at "1" in every workspace, so
 * a bare af id is NOT unique campaign-wide; the edge building `afParents` must use this same helper
 * for keys AND parent values. The NUL separator cannot occur in an af id or a workspace path. */
export function afNodeKey(afWorkspace: string, afNodeId: string): string {
  return `${afWorkspace}\u0000${afNodeId}`;
}

/** Whether two eligible candidates are related in the af proof tree — one an ancestor of the other,
 * or both the same item. Accepting a descendant biases its ancestors (PRD C3: "never a chain where
 * accepting item k biases item k+1"), so a related pair must never share a verifier session. FAILS
 * CLOSED on a MIXED pair (one af-identified, one not): that should be impossible (a batch is
 * tier-homogeneous by construction), and the honest answer is "cannot rule out a relation". Two l5
 * candidates are not af-related at all — an l5 item is a whole registry shard, and the registry
 * DAG's requirement closure (src/drive/batch-composer.ts) is its complete dependency structure. */
export function afProofTreeDependent(a: EligibleCandidate, b: EligibleCandidate): boolean {
  if (a.afKey === undefined && b.afKey === undefined) return false;
  if (a.afKey === undefined || b.afKey === undefined) return true;
  if (a.afKey === b.afKey) return true;
  return a.afAncestors.has(b.afKey) || b.afAncestors.has(a.afKey);
}

/** Deterministic one-line refusal text for a driver log line / report row. */
export function describeExclusion(ex: ExcludedCandidate): string {
  return `batch-eligibility: '${ex.id}' refused by the ${ex.constraint} guardrail (${ex.reason}, ${ex.determinacy}) — ${ex.detail}`;
}

function exclude(id: string, constraint: EligibilityConstraint, reason: ExclusionReason, detail: string): ExcludedCandidate {
  return { id, constraint, reason, determinacy: EXCLUSION_DETERMINACY[reason], detail };
}

/** Canonical form of one candidate's evidence, for the duplicate-record comparison below. */
function evidenceKey(c: BatchCandidate): string {
  return JSON.stringify([c.tier ?? null, c.crux ?? null, c.afWorkspace ?? null, c.afNodeId ?? null]);
}

/** The upward closure of `key` over `parents`. A cycle reaching `key` again legitimately puts it in
 * its own ancestor set (a cyclic proof tree is already broken; "related to itself" is the honest
 * report, never a silent trim). Returns `undefined` the moment a visited key has no entry at all:
 * the tree cannot be closed, so no independence claim over it would be sound. */
function afAncestorClosure(key: string, parents: ReadonlyMap<string, readonly string[]>): Set<string> | undefined {
  const ancestors = new Set<string>();
  const stack = [key];
  const visited = new Set<string>([key]);
  while (stack.length > 0) {
    const current = stack.pop()!;
    const direct = parents.get(current);
    if (direct === undefined) return undefined;
    for (const p of direct) {
      ancestors.add(p);
      if (!visited.has(p)) {
        visited.add(p);
        stack.push(p);
      }
    }
  }
  return ancestors;
}

/** Screens `candidates` against real graph/af state. Never throws: every rejection is a reported
 * `ExcludedCandidate`. Deterministic — lists sorted by id, checks in a fixed order, so the FIRST
 * constraint to refuse is the one reported: identity, tier, critical path, crux, af ancestry.
 * Registry critical path leads the substantive checks because the M3 review's verdict (a) makes it
 * "the primary C3 notion, with af crux/ancestry as an additional filter". */
export function screenCandidates(input: EligibilityInput): EligibilityScreen {
  const ids = [...new Set(input.candidates.map((c) => c.id))].sort();
  const tier = input.tier !== undefined && TIERS.has(input.tier) ? input.tier : undefined;
  const refuseAll = (t: Tier | undefined, con: EligibilityConstraint, reason: ExclusionReason, detail: string): EligibilityScreen =>
    ({ tier: t, eligible: [], excluded: ids.map((id) => exclude(id, con, reason, detail)) });

  if (tier === undefined) {
    return refuseAll(undefined, "dispatch-tier", "dispatch-tier-undeclared", "the run declared no dispatch tier, so no item's tier could be cross-checked");
  }
  const critical = computeCriticalPath(input.doc, input.northStarId);
  if (!critical.found) {
    // The M3-review blocker-5d posture, kept here: an unresolved north star yields an EMPTY critical
    // set, which would otherwise exclude nothing and permit every batch. Unknowable path membership
    // means every candidate is treated as load-bearing.
    return refuseAll(tier, "north-star", "north-star-unresolved", `north star '${input.northStarId}' names no registry node, so critical-path membership is unknowable`);
  }
  const criticalSet = new Set(critical.nodeIds);
  const byId = indexNodes(input.doc);
  const afParents = input.afParents ?? new Map<string, readonly string[]>();

  const byCandidateId = new Map<string, BatchCandidate[]>();
  for (const c of input.candidates) byCandidateId.set(c.id, [...(byCandidateId.get(c.id) ?? []), c]);

  const eligible: EligibleCandidate[] = [];
  const excluded: ExcludedCandidate[] = [];

  for (const id of ids) {
    const records = byCandidateId.get(id)!;
    if (new Set(records.map(evidenceKey)).size > 1) {
      excluded.push(exclude(id, "registry-identity", "conflicting-evidence", `${records.length} candidate records disagree about this item's own evidence; which one is true cannot be established here`));
      continue;
    }
    const c = records[0]!;

    if (!byId.has(id)) {
      excluded.push(exclude(id, "registry-identity", "unknown-node", "names no registry node in the projected graph, so neither its dependencies nor its path membership can be computed"));
      continue;
    }
    if (c.tier === undefined || !TIERS.has(c.tier)) {
      excluded.push(exclude(id, "item-tier", "tier-undeclared", `declares no dispatch tier of its own; it is never assumed to match the run's '${tier}'`));
      continue;
    }
    if (c.tier !== tier) {
      excluded.push(exclude(id, "item-tier", "tier-mismatch", `is a '${c.tier}'-tier item in a '${tier}'-tier dispatch`));
      continue;
    }
    if (criticalSet.has(id)) {
      excluded.push(exclude(id, "critical-path", "critical-path", `is on the registry critical path to north star '${input.northStarId}' (PRD C3: path items always get per-item, cross-vendor treatment)`));
      continue;
    }
    if (c.crux === undefined) {
      excluded.push(exclude(id, "crux", "crux-undeclared", "carries no recorded af crux flag; crux status is never assumed false"));
      continue;
    }
    if (c.crux) {
      excluded.push(exclude(id, "crux", "crux", "is marked crux in af and requires per-item treatment"));
      continue;
    }

    if (tier === "l5") {
      // An l5 item IS a registry shard: it has no af proof-tree identity, and the registry
      // requirement closure the composer computes is its complete dependency structure. This is a
      // determined "not applicable", not an assumption that af independence holds.
      eligible.push({ id, tier, afAncestors: new Set<string>() });
      continue;
    }

    const workspace = c.afWorkspace;
    const afId = c.afNodeId;
    if (workspace === undefined || workspace.trim() === "" || afId === undefined || afId.trim() === "") {
      excluded.push(exclude(id, "af-proof-tree", "af-identity-undeclared", "declares no af workspace/id pair, so its position in the proof tree — and therefore its independence from the other members — cannot be determined"));
      continue;
    }
    const key = afNodeKey(workspace, afId);
    const ancestors = afAncestorClosure(key, afParents);
    if (ancestors === undefined) {
      excluded.push(exclude(id, "af-proof-tree", "af-ancestry-unclosable", `af ancestry for '${afId}' in workspace '${workspace}' could not be closed over the supplied parent edges`));
      continue;
    }
    eligible.push({ id, tier, afKey: key, afAncestors: ancestors });
  }

  return { tier, eligible, excluded };
}
