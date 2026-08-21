// ROLE: Gate 1 notation meaning/translation provenance and semantic binds.
// PURITY: pure — no fs/network/clock (L3).

import type { Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { NotationShard, TranslationRow } from "./notation-shards";
import { LOCK_PATH, type LockFacts } from "./refs-extraction";
import { verifyCitationClaim } from "./refs-shard-citations";

function error(path: string, message: string, line?: number): Finding {
  return { severity: "ERROR", path, ...(line === undefined ? {} : { line }), message, structural: true };
}

function structural(finding: Finding): Finding {
  return { ...finding, structural: true };
}

function checkMeaning(shard: NotationShard, snapshot: RepoSnapshot, lock: LockFacts, findings: Finding[]): void {
  if (shard.fields.kind?.trim() !== "cited") return;
  if (!shard.fields.meaning?.trim()) {
    findings.push(
      error(
        shard.path,
        "meaning-missing: a kind: cited notation shard must state 'meaning:' — source:/sha256: " +
          "binds the file, not the symbol's meaning to a passage",
      ),
    );
  }
  const anchor = shard.meaningAnchor;
  if (!anchor) {
    findings.push(error(shard.path, "meaning-anchor-missing: a kind: cited notation shard must carry a meaning-anchor: pointer+quote block"));
    return;
  }
  if (!anchor.sourcePath || !anchor.quote) {
    findings.push(error(shard.path, "meaning-anchor-malformed: meaning-anchor: must be followed by refs/<path>:<line> and its quoted line", anchor.line));
    return;
  }
  const finding = verifyCitationClaim(
    {
      shardPath: shard.path,
      line: anchor.line,
      sourcePath: anchor.sourcePath,
      locusText: anchor.locusText,
      quote: anchor.quote,
      kindLabel: "notation meaning",
    },
    snapshot,
    lock,
  );
  if (finding) findings.push(structural(finding));
}

function translationBound(path: string, row: TranslationRow, lock: LockFacts, findings: Finding[]): boolean {
  let ok = true;
  if (!row.anchorQuote!.includes(row.theirSymbol)) {
    findings.push(
      error(
        path,
        `translation-symbol-not-in-quote: the anchor quote for '${row.sourceId}: ${row.theirSymbol}' ` +
          `does not contain '${row.theirSymbol}' verbatim`,
        row.line,
      ),
    );
    ok = false;
  }
  const relative = row.sourcePath.slice("refs/".length);
  const pins = lock.entries.filter((entry) => entry.path === relative);
  const owner = pins.length === 1 ? pins[0]!.sourceId : undefined;
  if (owner !== row.sourceId) {
    findings.push(
      error(
        path,
        `translation-source-path-mismatch: row names source '${row.sourceId}' but ${row.sourcePath} is ` +
          `${owner === undefined ? `owned by no source_id in ${LOCK_PATH}` : `owned by '${owner}'`}`,
        row.line,
      ),
    );
    ok = false;
  }
  return ok;
}

/** Appends structural findings and returns the number of fully verified translation rows. */
export function checkNotationProvenance(
  shard: NotationShard,
  snapshot: RepoSnapshot,
  lock: LockFacts,
  findings: Finding[],
): number {
  checkMeaning(shard, snapshot, lock, findings);
  let verified = 0;
  for (const row of shard.translations) {
    if (row.anchorQuote === undefined) {
      findings.push(
        error(
          shard.path,
          `translation-anchor-missing: row '${row.sourceId}: ${row.theirSymbol}' at ` +
            `${row.sourcePath}:${row.locusText} is not followed by a byte-verbatim "<quote>" anchor line — ` +
            "an unanchored translation claims a source says something and offers no bytes for it",
          row.line,
        ),
      );
      continue;
    }
    const finding = verifyCitationClaim(
      {
        shardPath: shard.path,
        line: row.line,
        sourcePath: row.sourcePath,
        locusText: row.locusText,
        quote: row.anchorQuote,
        kindLabel: "notation translation",
      },
      snapshot,
      lock,
    );
    if (finding) findings.push(structural(finding));
    else if (translationBound(shard.path, row, lock, findings)) verified++;
  }
  return verified;
}
