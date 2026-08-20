// PURITY: pure — no fs/network/clock (L3). ROUTE-SCOPED ENTAILMENT: the rule that replaced v1's
// atom-wise signature matching after the Tier A review broke it with a concrete pair
// (docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md LB2). Ground truth:
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 6, the codex Tier A review of the
// convention-profile draft (findings 10-13), docs/gate-contracts.md Gate 2 Check 17.
//
// THE RULE, as a FIXED POINT (review finding 13 — the earlier "post of dependencies EARLIER on the
// route" wording made the verdict depend on the order the author happened to list members in,
// which is not a fact about the mathematics). For a shard P and one route R:
//
//     context := P.regime ∪ P.pre                       // what P is entitled to assume
//     repeat until nothing changes:
//         for each member D of R not yet AVAILABLE:
//             if context entails D.pre ∪ D.regime:  mark D available; context := context ∪ D.post
//     every member never marked available  ⇒  regime-unentailed
//
// Listing order cannot change the outcome (the loop runs to a fixed point), and a mutual
// dependency cannot bootstrap itself, because availability is only ever granted from the
// ALREADY-available context — two members that each need the other's post are both refused.
//
// WHY ATOM-WISE MATCHING WAS UNSOUND, in one sentence: it let each required atom be satisfied by
// whatever source happened to carry it, so `thm-qpcp` (regime qdim=const) could consume `lem-amp`'s
// gap=const while sourcing the qdim=const atom from its OWN regime — never asking whether lem-amp,
// which needs qdim=poly, is available at all in a constant-dimension context.
//
// SCOPES. `regime` predicates live in the AMBIENT scope; `pre`/`post` predicates live in their
// object's scope, keyed by the Layer 0 id. The two never cross: an ambient `qdim: const` does not
// satisfy `{obj: def-local-hamiltonian, qdim: const}`, and vice versa. That separation IS the
// repair. Values are INTERVALS and entailment is containment — see src/gates/signature-profile.ts.

import type { PredicateValue, Signature, SignaturePredicate } from "./signature";
import {
  intervalConsistent,
  intervalOf,
  keyEntailed,
  keySpec,
  keyValues,
  type ConventionProfile,
} from "./signature-profile";

/** The scope key for object-free (`regime`) predicates. Not a legal Layer 0 id, so it can never
 * collide with an object scope. */
export const AMBIENT_SCOPE = "#ambient";

export interface EntailmentFailure {
  /** `AMBIENT_SCOPE` for a regime predicate, else the Layer 0 object id. */
  scope: string;
  key: string;
  /** The required interval, rendered for a finding. */
  required: string;
  /** Everything the context holds for (scope, key), rendered and sorted — `[]` when it holds
   * nothing at all. */
  available: string[];
}

export interface Demand {
  pre: readonly SignaturePredicate[];
  regime: readonly Record<string, PredicateValue>[];
}

export interface ContextParts {
  pre?: readonly SignaturePredicate[];
  post?: readonly SignaturePredicate[];
  regime?: readonly Record<string, PredicateValue>[];
}

/** Renders an interval the way a signature spells it: a point interval as its bare value, an
 * unbounded endpoint as `*`. */
export function renderValue(value: PredicateValue): string {
  const iv = intervalOf(value);
  if (iv.lo !== null && iv.lo === iv.hi) return `'${iv.lo}'`;
  return `[${iv.lo ?? "*"}, ${iv.hi ?? "*"}]`;
}

/** An accumulating (scope, key) -> value-SET context. A set, not a single interval: two sources may
 * legitimately supply the same key, and keeping them separate means entailment never depends on an
 * interval-join rule this design has not defined (a requirement is met iff SOME held interval is
 * contained in it). */
export class SignatureContext {
  private readonly held = new Map<string, Map<string, PredicateValue[]>>();

  add(parts: ContextParts): this {
    for (const p of parts.pre ?? []) this.addScope(p.obj, p.keys);
    for (const p of parts.post ?? []) this.addScope(p.obj, p.keys);
    for (const r of parts.regime ?? []) this.addScope(AMBIENT_SCOPE, r);
    return this;
  }

  private addScope(scope: string, keys: Record<string, PredicateValue>): void {
    let byKey = this.held.get(scope);
    if (!byKey) {
      byKey = new Map<string, PredicateValue[]>();
      this.held.set(scope, byKey);
    }
    for (const [k, v] of Object.entries(keys)) {
      const values = byKey.get(k) ?? [];
      if (!values.some((x) => JSON.stringify(x) === JSON.stringify(v))) values.push(v);
      byKey.set(k, values);
    }
  }

  /** Everything held for (scope, key). */
  valuesFor(scope: string, key: string): PredicateValue[] {
    return [...(this.held.get(scope)?.get(key) ?? [])];
  }

  /** Every predicate of `demand` this context does NOT entail, in deterministic order. `[]` means
   * fully entailed. */
  unmet(profile: ConventionProfile, demand: Demand): EntailmentFailure[] {
    const out: EntailmentFailure[] = [];
    const check = (scope: string, keys: Record<string, PredicateValue>): void => {
      for (const key of Object.keys(keys).sort()) {
        const required = keys[key]!;
        const available = this.valuesFor(scope, key);
        if (!keyEntailed(profile, key, available, required)) {
          out.push({ scope, key, required: renderValue(required), available: available.map(renderValue).sort() });
        }
      }
    };
    for (const p of [...demand.pre].sort((a, b) => (a.obj < b.obj ? -1 : a.obj > b.obj ? 1 : 0))) {
      check(p.obj, p.keys);
    }
    for (const r of demand.regime) check(AMBIENT_SCOPE, r);
    return out;
  }
}

export function buildContext(parts: readonly ContextParts[]): SignatureContext {
  const ctx = new SignatureContext();
  for (const p of parts) ctx.add(p);
  return ctx;
}

export type VocabularyCode = "unknown-key" | "unknown-value" | "signature-malformed";

export interface VocabularyIssue {
  code: VocabularyCode;
  scope: string;
  key: string;
  message: string;
}

/** Check 17(c) — CLOSED vocabulary: every predicate key and every interval endpoint (and
 * `hardness`, when present) must come from the profile, and every interval must be CONSISTENT in
 * its key's order. Reported separately from entailment: a key the profile never declared is an
 * authoring error, not a weaker claim, and must never read as either satisfied or merely unmet. An
 * inconsistent interval (`lo` above `hi`, or endpoints incomparable on a poset) is reported under
 * `signature-malformed` — it is a broken value, not a substantive regime clash — matching the
 * review's own classification (finding 10). */
export function validateSignatureVocabulary(sig: Signature, profile: ConventionProfile): VocabularyIssue[] {
  const out: VocabularyIssue[] = [];
  const check = (scope: string, keys: Record<string, PredicateValue>): void => {
    for (const key of Object.keys(keys).sort()) {
      const value = keys[key]!;
      const spec = keySpec(profile, key);
      if (spec === undefined) {
        out.push({
          code: "unknown-key",
          scope,
          key,
          message: `predicate key '${key}' on ${scopeLabel(scope)} is not declared by convention profile '${profile.name}'`,
        });
        continue;
      }
      const declared = keyValues(profile, key) ?? [];
      const iv = intervalOf(value);
      let unknown = false;
      // Deduplicated: a point interval has lo === hi, and one bad value is one finding.
      for (const end of [...new Set([iv.lo, iv.hi])]) {
        if (end === null || declared.includes(end)) continue;
        unknown = true;
        out.push({
          code: "unknown-value",
          scope,
          key,
          message:
            `value '${end}' for key '${key}' on ${scopeLabel(scope)} is not in profile ` +
            `'${profile.name}' (${spec.kind} '${key}': ${declared.join(spec.kind === "chain" ? " < " : ", ")})`,
        });
      }
      if (!unknown && !intervalConsistent(profile, key, iv)) {
        out.push({
          code: "signature-malformed",
          scope,
          key,
          message:
            `interval ${renderValue(value)} for key '${key}' on ${scopeLabel(scope)} is inconsistent in ` +
            `profile '${profile.name}': its lower endpoint is not at or below its upper endpoint` +
            (spec.kind === "poset" ? " (on a poset, incomparable endpoints name no interval at all)" : ""),
        });
      }
    }
  };
  for (const p of [...sig.pre, ...sig.post].sort((a, b) => (a.obj < b.obj ? -1 : a.obj > b.obj ? 1 : 0))) {
    check(p.obj, p.keys);
  }
  for (const r of sig.regime) check(AMBIENT_SCOPE, r);
  if (sig.hardness !== undefined) check(AMBIENT_SCOPE, { hardness: sig.hardness });
  return out;
}

export function scopeLabel(scope: string): string {
  return scope === AMBIENT_SCOPE ? "the ambient regime" : `object '${scope}'`;
}

export interface RouteCheckInput {
  shardId: string;
  signature: Signature;
  /** The route's member ids. Listing ORDER IS IRRELEVANT (see the fixed point in the header). */
  route: readonly string[];
  signatureOf: ReadonlyMap<string, Signature>;
  profile: ConventionProfile;
}

export interface RouteCheckResult {
  /** Members whose demand the context satisfied, sorted — their post is in the final context. */
  available: string[];
  /** For each member never made available: the FIRST unmet predicate against the final context. */
  failures: { memberId: string; failure: EntailmentFailure }[];
  /** The shard's OWN post predicates the final context does not support. WARN, not ERROR: a proof
   * can legitimately supply what no dependency does. */
  postUnsupported: EntailmentFailure[];
  /** Route members carrying no signature — counted, never silently skipped (L2). */
  membersWithoutSignature: string[];
  /** How many member demands were evaluated (one per signed member) — the coverage numerator. */
  entailmentsChecked: number;
}

/** Walks ONE route of one shard to the fixed point described in this file's header. */
export function checkRoute(input: RouteCheckInput): RouteCheckResult {
  const members = [...new Set(input.route)].sort();
  const signed = members.filter((id) => input.signatureOf.has(id));
  const membersWithoutSignature = members.filter((id) => !input.signatureOf.has(id));
  const ctx = buildContext([{ regime: input.signature.regime, pre: input.signature.pre }]);
  const available = new Set<string>();

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of signed) {
      if (available.has(id)) continue;
      const dep = input.signatureOf.get(id)!;
      if (ctx.unmet(input.profile, { pre: dep.pre, regime: dep.regime }).length > 0) continue;
      available.add(id);
      ctx.add({ post: dep.post });
      changed = true;
    }
  }

  // Re-evaluated against the FINAL context, so the reason reported is the one that still stands
  // after everything that could become available did.
  const failures: { memberId: string; failure: EntailmentFailure }[] = [];
  for (const id of signed) {
    if (available.has(id)) continue;
    const unmet = ctx.unmet(input.profile, {
      pre: input.signatureOf.get(id)!.pre,
      regime: input.signatureOf.get(id)!.regime,
    });
    if (unmet.length > 0) failures.push({ memberId: id, failure: unmet[0]! });
  }

  const postUnsupported = ctx.unmet(input.profile, { pre: input.signature.post, regime: [] });
  return {
    available: [...available].sort(),
    failures,
    postUnsupported,
    membersWithoutSignature,
    entailmentsChecked: signed.length,
  };
}
