// PURITY: pure — no fs/network/clock (L3). Gate 2 (linker) Check 8 ONLY: status propagation, the
// monotone-trust rigour ladder (ported from argument.py:197-236's `check_status`). Split out of
// src/gates/linker-graph.ts by rk-0ehr / P1 — that file reached the 280-line cap (CLAUDE.md rule 4)
// once retraction semantics landed here, and Check 8 is the one check in it whose subject matter is
// purely validity propagation, so it is the natural shard boundary (same pattern linker-graph.ts
// already uses for linker-workspace.ts). Re-exported from linker-graph.ts so every existing caller
// keeps one import surface.
//
// THE INVARIANT: an `af: validated` shard can never be satisfied by a requirement that is neither
// validated nor a ground-truth `cited` leaf. rk-0ehr / P1 adds one withdrawal path to that: a LIVE
// `af-canonical` retraction (schemas/retraction.v1.json) removes a shard from the available set
// entirely and makes its own `af: validated` claim an ERROR — "status demotes and propagation
// cascades exactly as an INVALID would" (ratified plan docs/memos/2026-08-03-rk-improvement-plan-
// from-aism.md §P1). The AISM incident this closes: a shard reading `af: validated` while a
// retraction stood against it, with three of four layers still reporting pass
// (docs/memos/2026-08-03-aism-postmortem/03-datamodel.md, "Drift & inconsistency found" item 1).

import type { Finding } from "./framework";
import type { Lemma } from "./linker-parse";
import type { RetractionRecord } from "../drive/retraction-record";

/** `['a', 'b']` — argument.py's own list repr, preserved so the finding text matches the port. */
function pyListRepr(items: Iterable<string>): string {
  return `[${[...items].map((i) => `'${i}'`).join(", ")}]`;
}

/** A dep is AVAILABLE iff its af is validated OR it is a ground-truth leaf (status=cited) — only
 * `status=='cited'` counts, never consensus/open/obstruction/disproved/proved
 * (argument.py:200-204).
 *
 * `retractedIds` (rk-0ehr / P1) are the ids carrying a LIVE `af-canonical` retraction
 * (src/gates/linker-retraction.ts's `liveAf`). A retracted dep is UNAVAILABLE unconditionally — a
 * retraction withdraws the claim itself, so there is no state of the claim left to be satisfied by,
 * which is why it is tested BEFORE the af/cited check rather than alongside it. Deliberately
 * overrides `cited` too: a ground-truth leaf found to be wrong is exactly the case where an
 * out-of-band retraction is the ONLY signal available (there is no af workspace to demote). Default
 * empty, so a caller with no retraction ledger gets the pre-P1 answer byte-for-byte. */
export function isAvailable(
  id: string,
  afOf: Map<string, string>,
  statusOf: Map<string, string | undefined>,
  retractedIds: ReadonlySet<string> = new Set(),
): boolean {
  if (retractedIds.has(id)) return false;
  return afOf.get(id) === "validated" || statusOf.get(id) === "cited";
}

/** `retractions` (rk-0ehr / P1) maps a registry id to its LIVE `af-canonical` retraction record —
 * src/gates/linker-retraction.ts's `liveAf`, threaded in by src/gates/linker.ts. Two effects, both
 * "exactly as an INVALID would": the retracted shard is unavailable to every dependent (via
 * `isAvailable`), and the retracted shard's OWN `af: validated` claim becomes an ERROR. A retracted
 * shard that claims nothing (`af: none`) gets no own-ERROR — there is nothing to demote. */
export function checkStatus(lemmas: Lemma[], retractions: ReadonlyMap<string, RetractionRecord> = new Map()): Finding[] {
  const afOf = new Map(lemmas.map((l) => [l.id, l.af]));
  const statusOf = new Map(lemmas.map((l) => [l.id, l.status]));
  const retractedIds = new Set(retractions.keys());
  const available = (id: string) => isAvailable(id, afOf, statusOf, retractedIds);

  function requirementsMet(l: Lemma): boolean {
    if (!l.deps.every(available)) return false;
    // Disjunctive OR-route generalisation: no routes -> reduces byte-for-byte to "all deps
    // available"; routes present -> ALSO needs at least one route's members ALL available.
    if (l.routes.length > 0 && !l.routes.some((r) => r.every(available))) return false;
    return true;
  }

  const errors: Finding[] = [];
  for (const l of lemmas) {
    const ownRetraction = retractions.get(l.id);
    if (ownRetraction !== undefined && l.af === "validated") {
      errors.push({
        severity: "ERROR",
        path: l.path,
        message:
          `af=validated but '${l.id}' has been retracted by ${ownRetraction.retractedBy}: ` +
          `${ownRetraction.reason} — demote (af: seeded / status off the rigorous ladder) or re-verify; ` +
          `a retraction stands until the artifact itself changes`,
      });
    }
    const met = requirementsMet(l);
    if (l.af === "validated" && !met) {
      const bad = l.deps.filter((d) => !available(d));
      if (l.routes.length > 0) {
        errors.push({
          severity: "ERROR",
          path: l.path,
          message: `af=validated but no route is fully validated/cited (unconditional bad deps: ${pyListRepr(bad)})`,
        });
      } else {
        errors.push({
          severity: "ERROR",
          path: l.path,
          message: `af=validated but dep(s) not validated: ${pyListRepr(bad)}`,
        });
      }
    }
  }
  return errors;
}
