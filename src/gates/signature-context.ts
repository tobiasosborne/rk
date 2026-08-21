// PURITY: pure — no fs/network/clock (L3). Conjoined signature contexts for Gate 2 Check 17.
// Repeated predicates are conjunctions, never alternatives: each (scope,key) stores one interval
// intersection, or a loud empty/unrepresentable state that entails nothing.

import { canonicalSignature, type PredicateValue, type Signature, type SignaturePredicate } from "./signature";
import {
  intersect, intervalOf, keyEntailed, type ConventionProfile, type Interval,
  type IntervalIntersection,
} from "./signature-profile";

export const AMBIENT_SCOPE = "#ambient";

export interface EntailmentFailure {
  scope: string;
  key: string;
  required: string;
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

export interface ConjunctionIssue {
  scope: string;
  key: string;
  reason: "empty" | "unrepresentable";
  source: "pre" | "post" | "regime";
}

function asValue(iv: Interval): PredicateValue {
  return iv.lo !== null && iv.lo === iv.hi ? iv.lo : [iv.lo, iv.hi];
}

function rendered(iv: IntervalIntersection): string {
  if (iv === "empty") return "contradictory (empty intersection)";
  if (iv === "unrepresentable") return "contradictory (unrepresentable intersection)";
  const value = asValue(iv);
  return typeof value === "string" ? `'${value}'` : `[${value[0] ?? "*"}, ${value[1] ?? "*"}]`;
}

export class SignatureContext {
  private readonly held = new Map<string, Map<string, IntervalIntersection>>();
  private readonly issues: ConjunctionIssue[] = [];

  constructor(private readonly profile: ConventionProfile) {}

  add(parts: ContextParts): ConjunctionIssue[] {
    const before = this.issues.length;
    for (const p of parts.pre ?? []) this.addScope(p.obj, p.keys, "pre");
    for (const p of parts.post ?? []) this.addScope(p.obj, p.keys, "post");
    for (const r of parts.regime ?? []) this.addScope(AMBIENT_SCOPE, r, "regime");
    return this.issues.slice(before);
  }

  private addScope(scope: string, keys: Record<string, PredicateValue>, source: ConjunctionIssue["source"]): void {
    const byKey = this.held.get(scope) ?? new Map<string, IntervalIntersection>();
    this.held.set(scope, byKey);
    for (const [key, value] of Object.entries(keys)) {
      const prior = byKey.get(key);
      if (prior === undefined) {
        byKey.set(key, intervalOf(value));
        continue;
      }
      if (typeof prior === "string") continue;
      const joined = intersect(this.profile, key, prior, intervalOf(value));
      byKey.set(key, joined);
      if (typeof joined === "string") this.issues.push({ scope, key, reason: joined, source });
    }
  }

  fork(): SignatureContext {
    const copy = new SignatureContext(this.profile);
    for (const [scope, keys] of this.held) copy.held.set(scope, new Map(keys));
    copy.issues.push(...this.issues);
    return copy;
  }

  contradictions(): ConjunctionIssue[] {
    return [...this.issues];
  }

  unmet(demand: Demand): EntailmentFailure[] {
    const out: EntailmentFailure[] = [];
    const check = (scope: string, keys: Record<string, PredicateValue>): void => {
      for (const key of Object.keys(keys).sort()) {
        const required = keys[key]!;
        const available = this.held.get(scope)?.get(key);
        const entailed = keyEntailed(this.profile, key, available, required);
        if (!entailed) out.push({
          scope, key, required: rendered(intervalOf(required)),
          available: available === undefined ? [] : [rendered(available)],
        });
      }
    };
    for (const p of [...demand.pre].sort((a, b) => a.obj.localeCompare(b.obj))) check(p.obj, p.keys);
    for (const r of demand.regime) check(AMBIENT_SCOPE, r);
    return out;
  }

  objectPredicates(): SignaturePredicate[] {
    const out: SignaturePredicate[] = [];
    for (const [scope, keys] of [...this.held].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (scope === AMBIENT_SCOPE) continue;
      const values: Record<string, PredicateValue> = {};
      for (const [key, iv] of [...keys].sort((a, b) => a[0].localeCompare(b[0]))) {
        if (typeof iv !== "string") values[key] = asValue(iv);
      }
      if (Object.keys(values).length > 0) out.push({ obj: scope, keys: values });
    }
    return out;
  }

  regimePredicates(): Record<string, PredicateValue>[] {
    const values: Record<string, PredicateValue> = {};
    for (const [key, iv] of [...(this.held.get(AMBIENT_SCOPE) ?? [])].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (typeof iv !== "string") values[key] = asValue(iv);
    }
    return Object.keys(values).length === 0 ? [] : [values];
  }
}

export function buildContext(parts: readonly ContextParts[], profile: ConventionProfile): SignatureContext {
  const context = new SignatureContext(profile);
  for (const part of parts) context.add(part);
  return context;
}

export function conjoinSignature(
  sig: Signature, profile: ConventionProfile,
): { signature: Signature; issues: ConjunctionIssue[] } {
  const pre = buildContext([{ pre: sig.pre }], profile);
  const post = buildContext([{ post: sig.post }], profile);
  const regime = buildContext([{ regime: sig.regime }], profile);
  return {
    signature: canonicalSignature({
      ...sig, pre: pre.objectPredicates(), post: post.objectPredicates(), regime: regime.regimePredicates(),
    }),
    issues: [...pre.contradictions(), ...post.contradictions(), ...regime.contradictions()],
  };
}
