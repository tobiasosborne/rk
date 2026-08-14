// PURITY: pure — no fs/network/clock (L3). Gate 8 Check 4b's WITHDRAWAL PRECONDITION (rk-yic3,
// P1 Tier A): the retraction facts, resolved ONCE and applied ahead of BOTH backing routes by
// src/reward/pma-backing.ts's `pmaBackingDecision`.
//
// THE BUG THIS CLOSES. Until 2026-08-14 the two routes were asymmetric about withdrawal:
// `l5Decision` refused backing when the retraction ledger was unhealthy or the shard carried a
// live retraction in either hash domain, `provenanceDecision` consulted neither, and
// `pmaBackingDecision` tried the PROVENANCE route FIRST and returned the instant it backed. Net: a
// claim whose L5 verdict had been retracted still banked proved-mod-audit through a hand-written
// `.rk/<name>.json` record — route (i) was the weaker sibling of a rule route (ii) already
// enforced, and the weaker sibling is the one an unbounded writer reaches for.
//
// WHY A PRECONDITION AND NOT A CLAUSE IN EACH ROUTE. A retraction is a fact about the CLAIM, not
// about either kind of evidence for it (src/gates/linker-retraction.ts's Check-16 rationale): it
// withdraws the thing being endorsed, so no endorsement can stand over it. One shared precondition
// — rather than the same rule copied per route — is also what stops a THIRD route from later being
// added that quietly lacks it.
//
// FAIL CLOSED, and why that clause needs its OWN red fixture. `readRetractionFacts` empties BOTH
// live maps on a poisoned store, so a live-retraction fixture is structurally blind to the
// health clause's removal: deleting it leaves corpus/reward/reward-27 green and turns only
// corpus/reward/reward-28 red (mutation-proven, 2026-08-14). Unknowable retraction status is never
// read as "nothing is retracted" at the site where credit is banked.

import type { Lemma } from "../gates/linker-parse";
import { readRetractionFacts } from "../gates/linker-retraction";
import type { RetractionFacts } from "../gates/linker-retraction";
import type { RepoSnapshot } from "../gates/snapshot";

/** The domains, in the fixed order refusals are reported in — deterministic reasons, never a Map
 * iteration order leaking into a validity message (the discipline
 * src/gates/linker-retraction.ts's `VETO_DOMAINS` already applies to its findings). */
const DOMAINS = [
  { domain: "l5-shard-bytes", view: (f: RetractionFacts) => f.liveL5 },
  { domain: "af-canonical", view: (f: RetractionFacts) => f.liveAf },
] as const;

/** The refusal reason when `target` is withdrawn — or when withdrawal status is unknowable —
 * `undefined` when no route is barred on withdrawal grounds. Never a boolean: the reason names the
 * domain, ordinal, issuer and stated cause, so a banking refusal is legible without
 * cross-referencing `.rk/retractions.jsonl` by hand. */
export function retractionRefusal(
  snapshot: RepoSnapshot,
  target: Lemma,
  lemmas: readonly Lemma[],
): string | undefined {
  const retractions = readRetractionFacts(snapshot, lemmas);
  if (!retractions.healthy) {
    return (
      `the retraction ledger is unhealthy, so no claim can be confirmed un-retracted and no ` +
      `route backs (fail closed): ${retractions.problems.join("; ")}`
    );
  }
  for (const { domain, view } of DOMAINS) {
    const r = view(retractions).get(target.id);
    if (r === undefined) continue;
    return (
      `claim '${target.id}' has a live retraction (${domain}, ordinal ${r.ordinal}) issued by ` +
      `${r.retractedBy}: ${r.reason} — a withdrawn claim is backed by NEITHER route; demote the ` +
      `shard, or edit the artifact and re-verify (an edit releases the hash binding)`
    );
  }
  return undefined;
}
