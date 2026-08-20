// PURITY: pure — no fs/network/clock (L3). The MECHANICAL half of the BITE admission criterion:
// canonical identity, the partial order on signatures, spectator exclusion, redundancy stripping,
// and the advance clause. Ground truth: docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md
// section 8, repairing Tier A review LB3 ("the bite criterion is both prose-only and trivially
// gameable" — docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md).
//
// NOT WIRED INTO ANY GATE, deliberately. Bite is a Gate C admission check, and Gates C/D are A1/N2
// work (beads rk-ptx0 / rk-lmtr; phase 3 does not open until they are green on the S0 smoke slice
// — memo section 2a). INTENDED CALL SITE: Gate C's per-candidate admission transaction, which runs
// `advanceClause` together with `spectatorConsumes` over the candidate's declared decomposition,
// and admits only on a mechanical pass AND a hash-bound VALID hostile-review record (the JUDGED
// half, memo section 8 — neither half admits alone). Exported and tested now so that when Gate C
// lands it consumes a tested function rather than re-deriving one in a hurry.
//
// THE FOUR GAMEABLE MOVES LB3 NAMED, and what stops each here:
//   alias renaming                — canonical identity compares Layer 0 OBJECT IDS, never names, so
//                                   renaming a shard or a symbol changes nothing.
//   spectator consume             — `spectatorConsumes`: a `pre` object occurring neither in the
//                                   blessed statement nor in the declared decomposition.
//   redundant-predicate inflation — `stripRedundant`, applied before EVERY comparison, so adding
//                                   implied atoms cannot change a verdict.
//   signature-only inflation      — `advanceClause` demands a STRICT strengthening, never merely a
//                                   difference.
//
// RESIDUAL, recorded rather than hidden (carried on bead rk-8805 from the review's own residuals
// list): `spectatorConsumes`'s statement test is LEXICAL — an id that occurs anywhere in
// `statement_blessed`, even in a sentence saying it is NOT used, counts as an occurrence. The
// mechanical core cannot tell mention from use; that is exactly what the judged half is for.

import type { Signature, SignaturePredicate } from "../gates/signature";
import { canonicalSignature, canonicalSignatureText } from "../gates/signature";
import {
  intervalEntails,
  intervalOf,
  type ConventionProfile,
} from "../gates/signature-profile";
import { AMBIENT_SCOPE, buildContext, type ContextParts } from "../gates/signature-entail";

export { canonicalSignature, canonicalSignatureText } from "../gates/signature";

/** True iff `ctx` (as a context) entails every predicate of `demand`. Thin wrapper over the ONE
 * entailment engine (src/gates/signature-entail.ts) so bite and Check 17 can never disagree about
 * what "entails" means. */
function entails(ctx: ContextParts, demand: { pre: SignaturePredicate[]; regime: Record<string, unknown>[] }, profile: ConventionProfile): boolean {
  return (
    buildContext([ctx]).unmet(profile, {
      pre: demand.pre,
      regime: demand.regime as Signature["regime"],
    }).length === 0
  );
}

/** THE PARTIAL ORDER (memo section 8, item 2). `s1` is at least as strong as `s2` iff it NEEDS NO
 * MORE (s1.pre is entailed by s2.pre), GIVES NO LESS (s1.post entails s2.post), and HOLDS NO LESS
 * WIDELY (s1.regime is entailed by s2.regime). Both sides are stripped first, so redundant atoms
 * cannot move a signature in the order. Reflexive and transitive by construction; antisymmetric on
 * stripped signatures (mutual strength ⇒ byte-identical canonical text), which is what makes
 * "the same claim" mechanically decidable. */
export function strongerOrEqual(s1: Signature, s2: Signature, profile: ConventionProfile): boolean {
  const a = stripRedundant(s1, profile);
  const b = stripRedundant(s2, profile);
  return (
    entails({ pre: b.pre }, { pre: a.pre, regime: [] }, profile) &&
    entails({ post: a.post }, { pre: b.post, regime: [] }, profile) &&
    entails({ regime: b.regime }, { pre: [], regime: a.regime }, profile)
  );
}

/** Strictly stronger: at least as strong, and not mutually so. Belt-and-braces with the
 * subsumption gate in `advanceClause` — by antisymmetry, two mutually-strong signatures have the
 * same canonical text and subsumption already refuses them, so this predicate and `strongerOrEqual`
 * agree on every input that reaches a clause. It stays because the clause's CONTRACT is "strictly
 * stronger", and a future edit to the subsumption gate must not silently turn the clauses into
 * "no weaker". */
export function strictlyStronger(s1: Signature, s2: Signature, profile: ConventionProfile): boolean {
  return strongerOrEqual(s1, s2, profile) && !strongerOrEqual(s2, s1, profile);
}

/** REDUNDANCY STRIPPING (memo section 8, item 3). Within one scope and key, an interval that
 * strictly CONTAINS another says strictly less than it and is dropped — the minimal elements under
 * containment survive. Two intervals neither of which contains the other are BOTH kept: that is a
 * genuine conjunction this model does not merge, and silently intersecting them would invent a
 * claim the author did not make. Idempotent, and applied before every comparison, so inflation by
 * implied atoms changes nothing. */
export function stripRedundant(sig: Signature, profile: ConventionProfile): Signature {
  const strip = (entries: readonly SignaturePredicate[]): SignaturePredicate[] => {
    const byScope = new Map<string, Record<string, unknown>[]>();
    for (const p of entries) {
      const list = byScope.get(p.obj) ?? [];
      list.push(p.keys);
      byScope.set(p.obj, list);
    }
    const out: SignaturePredicate[] = [];
    for (const [obj, maps] of [...byScope].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      for (const keys of minimalPerKey(obj, maps as Record<string, Signature["pre"][number]["keys"][string]>[], profile)) {
        out.push({ obj, keys });
      }
    }
    return out;
  };
  const regimeMaps = minimalPerKey(AMBIENT_SCOPE, sig.regime, profile);
  return canonicalSignature({ ...sig, pre: strip(sig.pre), post: strip(sig.post), regime: regimeMaps });
}

/** Reduces a list of key->interval maps for ONE scope to the minimal set: per key, keep only the
 * intervals no other interval for that key is contained in. The result is re-assembled into as few
 * maps as possible (one map per "row" of surviving intervals), so a scope whose keys all reduce to
 * one interval yields exactly one predicate. */
function minimalPerKey(
  _scope: string,
  maps: readonly Record<string, Signature["pre"][number]["keys"][string]>[],
  profile: ConventionProfile,
): Record<string, Signature["pre"][number]["keys"][string]>[] {
  const perKey = new Map<string, Signature["pre"][number]["keys"][string][]>();
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) {
      const list = perKey.get(k) ?? [];
      if (!list.some((x) => JSON.stringify(x) === JSON.stringify(v))) list.push(v);
      perKey.set(k, list);
    }
  }
  const survivors = new Map<string, Signature["pre"][number]["keys"][string][]>();
  for (const [key, values] of perKey) {
    const kept = values.filter(
      (v) =>
        !values.some(
          (w) =>
            JSON.stringify(w) !== JSON.stringify(v) &&
            intervalEntails(profile, key, intervalOf(w), intervalOf(v)) &&
            !intervalEntails(profile, key, intervalOf(v), intervalOf(w)),
        ),
    );
    // A key whose values are mutually equivalent collapses to one representative.
    const unique: typeof kept = [];
    for (const v of kept) {
      if (!unique.some((u) => JSON.stringify(u) === JSON.stringify(v))) unique.push(v);
    }
    survivors.set(key, unique);
  }
  const rows = Math.max(0, ...[...survivors.values()].map((v) => v.length));
  const out: Record<string, Signature["pre"][number]["keys"][string]>[] = [];
  for (let i = 0; i < rows; i++) {
    const row: Record<string, Signature["pre"][number]["keys"][string]> = {};
    for (const [key, values] of survivors) {
      const v = values[Math.min(i, values.length - 1)];
      if (v !== undefined) row[key] = v;
    }
    if (Object.keys(row).length > 0) out.push(row);
  }
  return out;
}

/** SPECTATOR EXCLUSION (memo section 8, item 3). Every `pre` object must occur in the candidate's
 * blessed statement or in its declared decomposition; one occurring nowhere is a "spectator
 * consume" — a dependency the claim does not actually use, which is how clause (iii) below was
 * gameable ("passes after adding a fresh but irrelevant `def-spectator-register`", LB3).
 * KNOWN WEAKNESS, stated not hidden: the statement test is LEXICAL occurrence. An id named in a
 * sentence that says it is NOT used still counts. The mechanical core cannot separate mention from
 * use; the hash-bound hostile review (the judged half of bite) is what can. */
export function spectatorConsumes(
  sig: Signature,
  statementBlessed: string,
  decompositionIds: readonly string[],
): string[] {
  const declared = new Set(decompositionIds);
  const out = new Set<string>();
  for (const p of sig.pre) {
    if (declared.has(p.obj) || statementBlessed.includes(p.obj)) continue;
    out.add(p.obj);
  }
  return [...out].sort();
}

export interface BiteCandidate {
  id: string;
  signature: Signature;
  /** The candidate's blessed statement text — the lexical haystack for spectator exclusion. */
  statementBlessed: string;
  /** The decomposition the candidate declares it advances, when it declares one. */
  decomposition?: { targetId: string; memberIds: readonly string[] };
}

export interface BiteDag {
  /** Every ADMITTED shard's canonical signature, by id. */
  admitted: ReadonlyMap<string, Signature>;
  /** Every Layer 0 object id currently in the DAG's closure. */
  objectClosure: ReadonlySet<string>;
  profile: ConventionProfile;
}

export type BiteClause = "i" | "ii" | "iii" | "none";

export interface BiteVerdict {
  ok: boolean;
  clause: BiteClause;
  reason: string;
}

function postObjects(sig: Signature): string {
  return [...new Set(sig.post.map((p) => p.obj))].sort().join(",");
}

/** THE ADVANCE CLAUSE (memo section 8, item 4). A candidate advances iff at least one of:
 *   (i)   DECOMPOSITION — it is declared a route member of an ADMITTED target and is strictly
 *         stronger than that target;
 *   (ii)  STRENGTHENING — it is strictly stronger than some admitted shard with the SAME post
 *         objects;
 *   (iii) NEW TOOL — it consumes a NON-SPECTATOR `pre` object outside the DAG's current closure.
 * Checked before any of them: SUBSUMPTION (canonical equality with an admitted signature — the
 * same claim under a new name is not an advance) and SPECTATOR CONSUME (an unused `pre` object,
 * which would otherwise manufacture clause (iii) out of nothing).
 * Mechanical pass is NECESSARY, never SUFFICIENT: admission additionally requires the hash-bound
 * VALID hostile-review record (memo section 8's judged half). */
export function advanceClause(candidate: BiteCandidate, dag: BiteDag): BiteVerdict {
  const { profile } = dag;
  const canonical = canonicalSignatureText(stripRedundant(candidate.signature, profile));

  for (const [id, admitted] of [...dag.admitted].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (canonicalSignatureText(stripRedundant(admitted, profile)) === canonical) {
      return {
        ok: false,
        clause: "none",
        reason: `subsumption: '${candidate.id}' has the same canonical signature as the admitted '${id}' — renaming is not an advance`,
      };
    }
  }

  const spectators = spectatorConsumes(candidate.signature, candidate.statementBlessed, candidate.decomposition?.memberIds ?? []);
  if (spectators.length > 0) {
    return {
      ok: false,
      clause: "none",
      reason:
        `spectator consume: pre object(s) ${spectators.join(", ")} occur neither in the blessed statement ` +
        `nor in the declared decomposition — a dependency the claim does not use cannot make it new`,
    };
  }

  if (candidate.decomposition) {
    const target = dag.admitted.get(candidate.decomposition.targetId);
    if (!target) {
      return {
        ok: false,
        clause: "none",
        reason: `declared decomposition target '${candidate.decomposition.targetId}' is not an admitted shard`,
      };
    }
    if (strictlyStronger(candidate.signature, target, profile)) {
      return { ok: true, clause: "i", reason: `decomposition: strictly stronger than the admitted target '${candidate.decomposition.targetId}'` };
    }
  }

  const objects = postObjects(candidate.signature);
  for (const [id, admitted] of [...dag.admitted].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (postObjects(admitted) !== objects) continue;
    if (strictlyStronger(candidate.signature, admitted, profile)) {
      return { ok: true, clause: "ii", reason: `strengthening: strictly stronger than the admitted '${id}', which has the same post objects` };
    }
  }

  const newObjects = [...new Set(candidate.signature.pre.map((p) => p.obj))].filter((o) => !dag.objectClosure.has(o)).sort();
  if (newObjects.length > 0) {
    return { ok: true, clause: "iii", reason: `new tool: non-spectator pre object(s) outside the DAG's closure: ${newObjects.join(", ")}` };
  }

  return {
    ok: false,
    clause: "none",
    reason:
      `no advance: '${candidate.id}' is not strictly stronger than any admitted shard with the same post ` +
      `objects, declares no decomposition it strengthens, and consumes no object outside the DAG's closure`,
  };
}
