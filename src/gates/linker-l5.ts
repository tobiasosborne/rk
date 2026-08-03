// PURITY: pure — no fs/network/clock (L3). Gate 2 (linker) NEW check (M3.8, deliverable 3): the
// L5-promotion integration src/drive/l5-promote.ts's module header names as Gate 2's job to wire
// ("wiring this into Gate 2 (src/gates/**) is EXPLICITLY M3.8's job, not this WP's"). PRD C9 / M3.7:
// "the L5 verdict store... queried by the linker for stated->proved-mod-audit promotion."
//
// PRESENCE-CONDITIONAL, per L2: `.rk/l5-verdicts.jsonl` is read straight off `snapshot`'s
// already-loaded text map — src/store/snapshot-load.ts includes `.rk` one level deep, the exact
// same mechanism src/gates/freshness.ts already relies on for `.rk/generated.json` — so this check
// stays pure (no second fs read). A campaign that has never dispatched an L5 review has no such
// file; that is a legitimate state, named explicitly on the coverage line, NEVER an ERROR (a fresh
// scaffold must not fail Gate 2 just because L5 has not run yet).
//
// The l5ContentHash domain (docs/worker-contract.md section (f): "lowercase hex SHA-256 of the RAW
// SHARD-FILE BYTES, with NO normalization") is EXACTLY `RepoSnapshot.sha256`'s own domain
// (src/gates/snapshot.ts's `SnapshotFacts.sha256` doc comment: "full 64-char lowercase sha256 of
// the file's RAW bytes") — this check reuses `fileSha256(snapshot, l.path)` rather than
// recomputing a second, possibly-differently-normalized hash.
//
// WHAT THIS CHECK DOES NOT DO: it never rewrites the registry shard's `status:` field (Gate 2 is a
// checker, not a mutator) and it never feeds into `checkStatus`'s availability predicate
// (`proved-mod-audit` is NOT `rigorous` per PRD §5's ladder table and does not count as
// `isAvailable`). For `status: stated` shards it surfaces only a non-blocking WARN naming which are
// eligible to be manually bumped to `proved-mod-audit` — an informational nudge.
//
// WHAT IT DOES ERROR ON (2026-07-19 M3 review, blocker 6): (1) a corrupt or ordinally-broken store
// (truncated line, duplicate/gapped/reordered ordinal) POISONS promotion — no shard is trusted and
// the store itself is a fail-closed ERROR, because a validity ledger that can silently hide a
// demotion is a defect, not a coverage footnote; (2) an ALREADY-promoted `proved-mod-audit` shard
// whose current L5 state is not `promotable` (edited-to-stale, INVALID, correction-pending, or no
// supporting verdict at all) is an ERROR — a promoted label the history no longer supports is a
// false validity claim (continuous re-validation + demotion, not just the `stated`→promotable nudge).

import type { Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { fileSha256 } from "./snapshot";
import type { Lemma } from "./linker-parse";
import { l5StoreHealthy, parseL5Log } from "../drive/l5-store";
import { promotionStateFor } from "../drive/l5-promote";
import { RETRACTION_STORE_PATH, type RetractionFacts } from "./linker-retraction";

export const L5_STORE_PATH = ".rk/l5-verdicts.jsonl";

const NO_RETRACTIONS: RetractionFacts = {
  present: false, healthy: true, problems: [], records: [], liveL5: new Map(), liveAf: new Map(), unmatchedItemIds: [],
};

export interface L5PromotionResult {
  findings: Finding[];
  /** False iff `.rk/l5-verdicts.jsonl` is entirely absent from the repo — presence-conditional,
   * never an ERROR on its own (see file header). */
  present: boolean;
  /** `status: "stated"` shards this check actually queried the store for (only meaningful when
   * `present`). */
  checked: number;
  /** Of `checked`, how many came back `{status:"promotable"}`. */
  promotable: number;
}

const ABSENT: L5PromotionResult = { findings: [], present: false, checked: 0, promotable: 0 };

/** `retractions` (rk-0ehr / P1) is src/gates/linker-retraction.ts's already-resolved facts — only
 * its `l5-shard-bytes` view (`liveL5`) is read here, never the `af-canonical` one (the two pinned
 * hash domains are never cross-compared; the af-canonical view drives Check 8 instead). Omitting
 * the argument reproduces the pre-P1 behavior exactly. A CORRUPT retraction store poisons promotion
 * for the same reason a corrupt L5 store does: an unreadable line's own `itemId` is unknowable, so
 * no shard can be confirmed un-retracted, and confirming a promotion against an unreadable
 * withdrawal is the false-validity direction. */
export function checkL5Promotion(
  snapshot: RepoSnapshot,
  lemmas: readonly Lemma[],
  retractions: RetractionFacts = NO_RETRACTIONS,
): L5PromotionResult {
  const text = snapshot.get(L5_STORE_PATH);
  if (text === undefined) return ABSENT;

  const parsed = parseL5Log(text);
  const findings: Finding[] = [];

  // BLOCKER 6 (M3-review): a corrupt or ordinally-broken store POISONS promotion. A truncated tail
  // line, a duplicate/gapped/reordered ordinal — any of these means the true latest verdict for
  // SOME shard is unknowable (the corrupt line's own itemId cannot be read), so no promotion can be
  // trusted and no already-promoted shard can be confirmed. This is no longer a WARN that merely
  // degrades coverage: a validity ledger that can silently hide a demotion is a fail-closed ERROR.
  const health = l5StoreHealthy(parsed);
  if (!health.healthy) {
    for (const p of health.problems) {
      findings.push({ severity: "ERROR", path: L5_STORE_PATH, message: `L5 store integrity compromised — promotion poisoned, fail closed: ${p}` });
    }
  }
  // rk-0ehr / P1: a corrupt RETRACTION store poisons promotion identically. Its own per-problem
  // ERRORs are emitted once by `retractionStoreFindings` (wired in src/gates/linker.ts); what this
  // check adds is the consequence — no promotion is trusted and no promoted shard is confirmable.
  const poisoned = !health.healthy || !retractions.healthy;
  if (poisoned) {
    const store = !health.healthy ? "L5 store" : "retraction store";
    for (const l of lemmas) {
      if (l.status === "proved-mod-audit") {
        findings.push({
          severity: "ERROR",
          path: l.path,
          message: `'${l.id}' is labeled 'proved-mod-audit' but the ${store} is corrupt, so its promotion can no longer be confirmed — repair ${!health.healthy ? L5_STORE_PATH : RETRACTION_STORE_PATH} or demote`,
        });
      }
    }
    return { findings, present: true, checked: 0, promotable: 0 };
  }

  const records = parsed.records;
  let checked = 0;
  let promotable = 0;
  for (const l of lemmas) {
    const currentHash = fileSha256(snapshot, l.path);
    if (currentHash === undefined) continue; // shard file present but unhashed should not happen; skip rather than guess

    const liveRetraction = retractions.liveL5.get(l.id);

    if (l.status === "stated") {
      checked++;
      const decision = promotionStateFor(records, l.id, currentHash, liveRetraction);
      if (decision.status === "promotable") {
        promotable++;
        findings.push({
          severity: "WARN",
          path: l.path,
          message: `L5 promotable: '${l.id}' has a fresh VALID L5 verdict (ordinal ${decision.record.ordinal}) while registry frontmatter still reads 'status: stated' — consider bumping to 'proved-mod-audit'`,
        });
      }
    } else if (l.status === "proved-mod-audit") {
      // BLOCKER 6b (M3-review): continuously re-validate ALREADY-promoted shards, not just `stated`
      // ones. A shard bumped to 'proved-mod-audit' can later be edited (its verdict goes stale), get
      // a fresh INVALID / VALID-WITH-CORRECTION verdict, or never have had any supporting L5 verdict
      // at all — in every such case the label is a false validity claim. When the store is present,
      // a 'proved-mod-audit' shard whose current L5 state is anything other than `promotable` is an
      // ERROR: demote or re-verify. (`no-verdict` is included deliberately — 'proved modulo audit'
      // is the L5 soft-tier outcome, so a promoted shard with no L5 backing at all is unsupported;
      // stricter reading per CLAUDE.md L5. Presence-conditional: a repo with NO L5 store cannot be
      // checked this way — see the candidate-bead note in the repair report.)
      const decision = promotionStateFor(records, l.id, currentHash, liveRetraction);
      if (decision.status === "not-promotable" && decision.reason === "retracted") {
        const r = decision.retraction!;
        findings.push({
          severity: "ERROR",
          path: l.path,
          message:
            `'${l.id}' is labeled 'proved-mod-audit' but has been retracted by ${r.retractedBy}: ${r.reason} — ` +
            `demote to 'stated' or re-verify (the retraction is bound to the shard's CURRENT bytes, so no edit has ` +
            `released it and no L5 verdict overrides it)`,
        });
      } else if (decision.status !== "promotable") {
        findings.push({
          severity: "ERROR",
          path: l.path,
          message: `'${l.id}' is labeled 'proved-mod-audit' but the L5 history no longer supports promotion (${decision.reason}) — demote to 'stated' or re-verify (a promoted shard that was edited, invalidated, or has a correction pending is a false validity claim)`,
        });
      }
    }
  }

  return { findings, present: true, checked, promotable };
}
