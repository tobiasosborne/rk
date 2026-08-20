// EDGE — fs (reads the repo snapshot, writes refs/cards/**, upserts .rk/generated.json).
// `rk render cards [--root <dir>]` (bead rk-nsex; docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md
// section 4, "Generated cards"): renders one card per extraction record and adopts each one in the
// Gate 7 manifest, so from that moment on a hand-edited card is a freshness ERROR rather than a
// quietly authoritative document an agent will answer from.
//
// NO RENDER LOGIC HERE. The bytes come from src/render/cards.ts's `renderCardForPath` — the SAME
// pure function Gate 7's `cards-v1` generator calls (src/gates/freshness.ts). One implementation,
// so generator and verifier cannot disagree about what a card is; this file only decides which
// records to render and where the bytes land, exactly the seam `renderSiteFromRepo` established
// for the site artifact (B2, docs/memos/2026-07-25-generality-audit.md).
//
// A RECORD WITHOUT A USABLE REVIEW STILL GETS A CARD — the refusal stub (see src/render/cards.ts).
// Skipping it would leave `refs/cards/` silently incomplete, and a manifest entry with no file is
// a worse state than a file that says, in full, that it may not be read.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { collectRecords } from "../gates/refs-records";
import { CARD_GENERATOR, cardPathForRecord, renderCardForPath } from "../render/cards";
import { loadSnapshot } from "../store/snapshot-load";
import type { Out } from "./args";
import { extractRoot } from "./args";

export interface CardsAdopter {
  /** Upserts one `.rk/generated.json` entry; returns an error message and writes nothing when the
   * existing manifest cannot be understood. Injected from src/cli/render.ts (its own manifest
   * upsert), so there is one manifest writer in the codebase, not two. */
  (root: string, entryPath: string, generator: string): string | undefined;
}

export function renderCardsCommand(args: string[], out: Out, adopt: CardsAdopter): number {
  const { root } = extractRoot(args);
  const snapshot = loadSnapshot(root);
  const records = collectRecords(snapshot);

  if (records.discoveredL1.length === 0) {
    out.log("rk render cards: 0 cards (no extraction records under refs/records/).");
    out.log("  next: author refs/records/<source-id>/L1-<n>.json (schemas/extraction-record.v1.json) and re-run.");
    return 0;
  }

  let written = 0;
  let notAdmissible = 0;
  const failures: string[] = [];

  for (const record of records.l1) {
    const cardPath = cardPathForRecord(record.path);
    if (cardPath === undefined) {
      failures.push(`${record.path}: not a card-able record path`);
      continue;
    }
    const rendered = renderCardForPath(snapshot, cardPath);
    if (!rendered.ok) {
      failures.push(`${cardPath}: ${rendered.reason}`);
      continue;
    }
    const dest = join(root, cardPath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, rendered.bytes);
    written += 1;
    if (rendered.bytes.includes("NOT ADMISSIBLE")) notAdmissible += 1;
    const adoptError = adopt(root, cardPath, CARD_GENERATOR);
    if (adoptError) {
      out.log(adoptError);
      return 1;
    }
  }

  // Records the shape validator rejected never reach `records.l1`; they are Gate 3's business, but
  // saying nothing about them here would make "3 cards" read as "3 records", which is the silent
  // undercount L2 forbids.
  const unrendered = records.discoveredL1.length - records.l1.length;
  out.log(
    `rk render cards: ${written} card(s) written to refs/cards/ from ${records.discoveredL1.length} record(s)` +
      `${notAdmissible > 0 ? `, ${notAdmissible} not admissible (no usable review — rendered as the refusal stub)` : ""}.`,
  );
  if (unrendered > 0) {
    out.log(`  ${unrendered} record(s) are not shape-valid and were NOT rendered — run 'rk check' for the [record-*] findings.`);
  }
  for (const failure of failures) out.log(`  could not render ${failure}`);
  out.log(`  adopted ${written} entr(y/ies) in .rk/generated.json (generator '${CARD_GENERATOR}') for Gate 7.`);
  out.log("  next: 'rk check' — a hand-edited card is now a freshness ERROR, and the record is the truth.");
  return failures.length > 0 ? 1 : 0;
}
