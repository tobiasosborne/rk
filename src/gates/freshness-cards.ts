// PURITY: pure — no fs/network/clock (L3). Gate 7 — freshness: the `cards-v1` bijection between
// reviewed L1 extraction records, card files under refs/cards/, and manifest entries (rk-nsex
// BL4). Split out of freshness.ts (rk-tmzl, move-only).

import type { Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { CARD_GENERATOR, CARDS_PREFIX, cardPathForRecord } from "../render/cards";
import { collectRecords } from "./refs-records";
import { checkReview } from "./refs-records-binding";
import { MANIFEST_PATH, type ManifestEntry } from "./freshness-manifest";

/** The pure core of Gate 7 (M2 boundary review blockers #3/#4). `externalRegen` carries the
 * edge-prepared "expected bytes" (or a structured failure reason) for every `render-site-v1`
 * entry the manifest declares — see this file's header and `ExternalRegenResult`'s own doc
 * comment. Defaults to an empty map so `freshnessGate.run` (the plain 2-arg `Gate` interface) can
 * still be called directly (the corpus harness, `src/gates/index.ts`'s registry) — under that
 * default, ANY declared `render-site-v1` entry reports "cannot be regenerated for verification",
 * never a silent pass, because this pure function never regenerates it itself. */
/** BL4 — THE CARD BIJECTION. Regenerate-and-diff only ever verifies what the manifest DECLARES, so
 * three states slipped through it entirely: a record with a VALID review and no manifest at all, an
 * empty manifest with records present, and an undeclared file sitting under `refs/cards/`. Each is
 * an unchecked card an agent can read — the last one is literally a stale card the gate cannot see.
 *
 * The rule is a bijection between {L1 records with a hash-bound VALID review} and {cards-v1
 * manifest entries}: every such record must be declared (`[card-unadopted]`), and every file under
 * `refs/cards/` must be declared (`[card-undeclared]`). The third direction — a declared entry with
 * no record behind it — is already the per-entry "cannot be regenerated" ERROR.
 *
 * Review validity is decided by `checkReview` (src/gates/refs-records-binding.ts), the SAME
 * function Gate 3 Check 11 clause (d) uses, never a second copy of the rule: a record whose review
 * is absent, stale or not VALID renders only a refusal stub, so it is not required to be adopted.
 * Presence-conditional: a repo with no records and no `refs/cards/` files gets nothing from this. */
export function checkCardBijection(snapshot: RepoSnapshot, entries: readonly ManifestEntry[]): Finding[] {
  const declared = new Set(entries.filter((e) => e.generator === CARD_GENERATOR).map((e) => e.path));
  const cardFiles = [...snapshot.keys()].filter((k) => k.startsWith(CARDS_PREFIX) && k.endsWith(".md")).sort();
  if (cardFiles.length === 0 && !hasAnyRecord(snapshot)) return [];

  const findings: Finding[] = [];
  const records = collectRecords(snapshot);
  for (const record of records.l1) {
    if (!checkReview(record, records).valid) continue;
    const cardPath = cardPathForRecord(record.path);
    if (cardPath === undefined || declared.has(cardPath)) continue;
    findings.push({
      severity: "ERROR",
      path: record.path,
      line: 1,
      structural: true,
      message:
        `[card-unadopted] ${record.path} carries a hash-bound VALID review but ${cardPath} is not declared in ` +
        `${MANIFEST_PATH} (generator '${CARD_GENERATOR}') — an undeclared card is never regenerated and never ` +
        "diffed, so the artifact agents read is outside the freshness mechanism entirely. Run 'rk render cards', " +
        "which writes every card and adopts it",
    });
  }
  for (const cardFile of cardFiles) {
    if (declared.has(cardFile)) continue;
    findings.push({
      severity: "ERROR",
      path: cardFile,
      line: 1,
      structural: true,
      message:
        `[card-undeclared] ${cardFile} sits under ${CARDS_PREFIX} but no ${MANIFEST_PATH} entry declares it — this ` +
        "file is a card-shaped document no generator produced and no diff checks. Either adopt it with " +
        "'rk render cards' (which will overwrite it with the record's own rendering) or delete it",
    });
  }
  return findings;
}

function hasAnyRecord(snapshot: RepoSnapshot): boolean {
  for (const key of snapshot.keys()) {
    if (key.startsWith("refs/records/") && key.endsWith(".json")) return true;
  }
  return false;
}
