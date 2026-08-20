// PURITY: pure — no fs/network/clock (L3). ROUTE-SCOPED ENTAILMENT: the rule that replaced v1's
// atom-wise signature matching after the Tier A review broke it with a concrete pair
// (docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md LB2). Ground truth:
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 6, docs/gate-contracts.md Gate 2
// Check 17.
//
// THE RULE. For a shard P and one route R (its `deps` are the implicit route when `routes:` is
// absent, and are required under EVERY declared route — docs/gate-contracts.md Gate 2 Inputs),
// walk R's members in DEPENDENCY order. The context starts as P's own `regime` (ambient scope)
// plus P's own `pre` (object scopes) — what P is entitled to assume. A member D's ENTIRE `pre`
// AND `regime` must be entailed by the context BEFORE D's entire `post` is added to it. A member
// whose demand is unmet contributes nothing: its post never becomes available, so a failure
// cannot quietly still hand the parent what the failed dependency would have supplied.
//
// WHY ATOM-WISE MATCHING WAS UNSOUND, in one sentence: it let each required atom be satisfied by
// whatever source happened to carry it, so `thm-qpcp` (regime d=const) could consume `lem-amp`'s
// gap=const while sourcing the d=const atom from its OWN regime — never asking whether lem-amp,
// which needs d=poly, is available at all in a constant-dimension context.
//
// SCOPES. `regime` predicates live in the AMBIENT scope; `pre`/`post` predicates live in their
// object's scope, keyed by the Layer 0 id. The two never cross: an ambient `d: const` does not
// satisfy `{obj: def-local-hamiltonian, d: const}`, and vice versa. That separation IS the repair.

import type { Signature, SignaturePredicate } from "./signature";
import { keyEntailed, keyPolarity, keyValues, type ConventionProfile } from "./signature-profile";

/** The scope key for object-free (`regime`) predicates. Not a legal Layer 0 id, so it can never
 * collide with an object scope. */
export const AMBIENT_SCOPE = "#ambient";

export interface EntailmentFailure {
  /** `AMBIENT_SCOPE` for a regime predicate, else the Layer 0 object id. */
  scope: string;
  key: string;
  required: string;
  /** Everything the context holds for (scope, key) — `[]` when it holds nothing at all. Sorted,
   * so a finding's text is deterministic. */
  available: string[];
}

export interface Demand {
  pre: readonly SignaturePredicate[];
  regime: readonly Record<string, string>[];
}

export interface ContextParts {
  pre?: readonly SignaturePredicate[];
  post?: readonly SignaturePredicate[];
  regime?: readonly Record<string, string>[];
}

/** An accumulating (scope, key) -> value-SET context. A set, not a single value: two sources may
 * legitimately supply the same key, and taking a set means entailment never depends on a
 * lattice-join rule this design has not defined (a required value is met iff SOME held value
 * meets it). */
export class SignatureContext {
  private readonly held = new Map<string, Map<string, Set<string>>>();

  add(parts: ContextParts): this {
    for (const p of parts.pre ?? []) this.addScope(p.obj, p.keys);
    for (const p of parts.post ?? []) this.addScope(p.obj, p.keys);
    for (const r of parts.regime ?? []) this.addScope(AMBIENT_SCOPE, r);
    return this;
  }

  private addScope(scope: string, keys: Record<string, string>): void {
    let byKey = this.held.get(scope);
    if (!byKey) {
      byKey = new Map<string, Set<string>>();
      this.held.set(scope, byKey);
    }
    for (const [k, v] of Object.entries(keys)) {
      let values = byKey.get(k);
      if (!values) {
        values = new Set<string>();
        byKey.set(k, values);
      }
      values.add(v);
    }
  }

  /** Everything held for (scope, key), sorted. */
  valuesFor(scope: string, key: string): string[] {
    return [...(this.held.get(scope)?.get(key) ?? [])].sort();
  }

  /** Every predicate of `demand` this context does NOT entail, in deterministic order. `[]` means
   * fully entailed. */
  unmet(profile: ConventionProfile, demand: Demand): EntailmentFailure[] {
    const out: EntailmentFailure[] = [];
    const check = (scope: string, keys: Record<string, string>): void => {
      for (const key of Object.keys(keys).sort()) {
        const required = keys[key]!;
        const available = this.valuesFor(scope, key);
        if (!keyEntailed(profile, key, available, required)) {
          out.push({ scope, key, required, available });
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

export type VocabularyCode = "unknown-key" | "unknown-value";

export interface VocabularyIssue {
  code: VocabularyCode;
  scope: string;
  key: string;
  value: string;
  message: string;
}

/** Check 17(c) — CLOSED vocabulary: every predicate key and value (and `hardness`, when present)
 * must come from the profile. Reported separately from entailment: a key the profile never
 * declared is an authoring error, not a weaker claim, and must never read as either satisfied or
 * merely unmet. */
export function validateSignatureVocabulary(sig: Signature, profile: ConventionProfile): VocabularyIssue[] {
  const out: VocabularyIssue[] = [];
  const check = (scope: string, keys: Record<string, string>): void => {
    for (const key of Object.keys(keys).sort()) {
      const value = keys[key]!;
      const polarity = keyPolarity(profile, key);
      if (polarity === undefined) {
        out.push({
          code: "unknown-key",
          scope,
          key,
          value,
          message: `predicate key '${key}' on ${scopeLabel(scope)} is not declared by convention profile '${profile.name}'`,
        });
        continue;
      }
      const declared = keyValues(profile, key) ?? [];
      if (!declared.includes(value)) {
        out.push({
          code: "unknown-value",
          scope,
          key,
          value,
          message:
            `value '${value}' for key '${key}' on ${scopeLabel(scope)} is not in profile ` +
            `'${profile.name}' (${polarity} key '${key}': ${declared.join(polarity === "equality" ? " | " : " < ")})`,
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

/** Deterministic topological order of `members` under `depsOf`, restricted to edges BETWEEN
 * members. Kahn's algorithm with a sorted-id tie-break, so the walk order is a function of the
 * data alone. A cycle among members cannot be ordered; the remaining members are appended in
 * sorted id order so this function is TOTAL (Gate 2 Check 6 owns reporting the cycle — this one
 * must not also crash or silently drop members). */
export function topoOrderMembers(members: readonly string[], depsOf: (id: string) => readonly string[]): string[] {
  const set = new Set(members);
  const remaining = new Set(members);
  const out: string[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining]
      .filter((id) => depsOf(id).every((d) => !set.has(d) || !remaining.has(d)))
      .sort();
    if (ready.length === 0) {
      out.push(...[...remaining].sort());
      break;
    }
    for (const id of ready) {
      out.push(id);
      remaining.delete(id);
    }
  }
  return out;
}

export interface RouteCheckInput {
  shardId: string;
  signature: Signature;
  /** The route's member ids (declaration order; this function orders them). */
  route: readonly string[];
  signatureOf: ReadonlyMap<string, Signature>;
  profile: ConventionProfile;
  /** Registry dependency lookup, used only to order members. Defaults to "no edges between
   * members", which is correct for the common flat route. */
  depsOf?: (id: string) => readonly string[];
}

export interface RouteCheckResult {
  /** The dependency order the walk actually used. */
  order: string[];
  /** Every member demand the context failed to entail, in walk order. */
  failures: { memberId: string; failure: EntailmentFailure }[];
  /** The shard's OWN post predicates the final context (plus its own `pre`) does not support.
   * WARN, not ERROR: a proof can legitimately supply what no dependency does. */
  postUnsupported: EntailmentFailure[];
  /** Route members carrying no signature — counted, never silently skipped (L2). */
  membersWithoutSignature: string[];
  /** How many member demands were evaluated (one per signed member) — the coverage numerator. */
  entailmentsChecked: number;
}

/** Walks ONE route of one shard under the entailment rule in this file's header. */
export function checkRoute(input: RouteCheckInput): RouteCheckResult {
  const depsOf = input.depsOf ?? (() => []);
  const order = topoOrderMembers(input.route, depsOf);
  const ctx = buildContext([{ regime: input.signature.regime, pre: input.signature.pre }]);
  const failures: { memberId: string; failure: EntailmentFailure }[] = [];
  const membersWithoutSignature: string[] = [];
  let entailmentsChecked = 0;

  for (const memberId of order) {
    const dep = input.signatureOf.get(memberId);
    if (!dep) {
      membersWithoutSignature.push(memberId);
      continue;
    }
    entailmentsChecked++;
    const unmet = ctx.unmet(input.profile, { pre: dep.pre, regime: dep.regime });
    if (unmet.length > 0) {
      for (const failure of unmet) failures.push({ memberId, failure });
      // Its post does NOT become available: an unavailable result supplies nothing.
      continue;
    }
    ctx.add({ post: dep.post });
  }

  const postUnsupported = ctx.unmet(input.profile, { pre: input.signature.post, regime: [] });
  return { order, failures, postUnsupported, membersWithoutSignature, entailmentsChecked };
}
