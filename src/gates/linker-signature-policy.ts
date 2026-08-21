// PURITY: pure — no fs/network/clock (L3). Required-signature and kind/status coherence policy for
// Gate 2 Check 17. Kept separate from linker-signature.ts's parsing/entailment wiring.

import type { Lemma } from "./linker-lemma";

export const SIGNED_KINDS = new Set(["lemma", "proposition", "theorem", "corollary"]);
export const SIGNED_STATUSES = new Set(["proved", "cited", "consensus", "proved-mod-audit"]);
export const SIGNED_AF = new Set(["seeded", "validated"]);

/** Optional adoption preserves the gradual kind-scoped warning. Required adoption cannot be
 * evaded through an exempt kind when status or af still claims signed-result semantics. */
export function signatureDemanded(l: Lemma, mode: "required" | "optional" | undefined): boolean {
  if (mode === undefined) return false;
  if (mode === "optional") return l.kind !== undefined && SIGNED_KINDS.has(l.kind);
  return (l.kind !== undefined && SIGNED_KINDS.has(l.kind)) ||
    (l.status !== undefined && SIGNED_STATUSES.has(l.status)) || SIGNED_AF.has(l.af);
}

/** Ruling: this coherence rule starts only once signatures are ADOPTED (optional or required).
 * Before adoption, the pre-existing independent kind/status enum contract is unchanged. */
export function kindStatusIncoherent(l: Lemma, adopted: boolean): boolean {
  return adopted && (l.kind === "open-problem" || l.kind === "obstruction") &&
    l.status !== undefined && SIGNED_STATUSES.has(l.status);
}
