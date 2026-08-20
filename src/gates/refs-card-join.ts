// PURITY: pure — no fs/network/clock (L3). Gate 3 Check 12 — THE CARD -> SHARD HASH JOIN (bead
// rk-nsex; docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 4; docs/gate-contracts.md
// Gate 3 Check 12).
//
// THE HOLE THIS CLOSES (review finding LB1, docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md):
// "A `status: cited` shard can carry one genuine but irrelevant quote and an arbitrary contract."
// Check 8 verifies that the shard's quote occurs where it says it does — it says nothing at all
// about whether the CONTRACT, the thing every downstream consumer reads and the linker propagates
// rigour through, is what the paper proves. This check supplies the missing edge: a shard naming a
// record must name it by canonical hash, that record must carry a hash-bound VALID review, and the
// shard's `contract:` must byte-equal the record's `statement_blessed` under Gate 2 Check 9's
// whitespace normalization (imported, never re-derived).
//
// WHY IT LIVES IN GATE 3 AND NOT THE LINKER. It is a citation check: it asks whether a claim about
// the literature is backed by verified source bytes. Gate 2 owns the DAG's internal coherence and
// has no access to the refs/ payloads, the lock, or the records; putting the join there would mean
// a second, weaker copy of "is this record usable".
//
// THE MIGRATION PATH, DELIBERATELY SOFT. A `status: cited` shard with NO `record:` keeps exactly
// today's behavior (Checks 8/9 alone) and draws a WARN `[record-absent]`. Every rk campaign
// predates records; making their absence an ERROR would turn every existing cited shard red on the
// day this lands, which is how a gate gets switched off. The WARN is the campaign's visible
// backlog. A shard that DOES name a record is held to the full join — opting in is total.
//
// `proved-mod-audit` joins on the same terms WHEN it names a record. It is not required to name
// one, because rk cannot mechanically tell a literature PMA claim (which the memo says must join)
// from a campaign's own proof-mod-audit (which has no record to join to); that distinction lives
// in the campaign's own review, and inventing a proxy for it here would produce confident nonsense.

import type { Finding } from "./framework";
import { normalizeContract } from "./linker-graph";
import type { L1Record } from "./refs-records";
import { RECORDS_PREFIX } from "./refs-records";
import { shardPaths } from "./refs-shard-citations";
import { parseFrontmatter, type RepoSnapshot } from "./snapshot";
import { canonicalRecordSha256 } from "./canonical-json";

export interface CardJoinResult {
  findings: Finding[];
  /** Shards whose declared record joined completely. */
  joined: number;
  /** Shards that declared a record at all (the denominator). */
  declared: number;
}

const JOINING_STATUSES = new Set(["cited", "proved-mod-audit"]);
const SHA256_RE = /^[0-9a-fA-F]{64}$/;

function joinError(path: string, code: string, message: string): Finding {
  // Structural: admission of a cited claim is phase-independent (campaign memo section 2a).
  return { severity: "ERROR", path, line: 1, message: `[${code}] ${message}`, structural: true };
}

/** Joins every `status: cited` / `proved-mod-audit` shard to the extraction record it names.
 * `usable` holds ONLY records that passed every Check 11 clause — a record with any defect is not
 * a weaker record here, it is no record at all. */
export function checkCardJoin(snapshot: RepoSnapshot, usable: Map<string, L1Record>, known: Set<string>): CardJoinResult {
  const findings: Finding[] = [];
  let joined = 0;
  let declared = 0;

  for (const path of shardPaths(snapshot)) {
    const fm = parseFrontmatter(snapshot.get(path)!);
    const status = fm.fields.status;
    if (status === undefined || !JOINING_STATUSES.has(status)) continue;

    const recordPath = fm.fields.record;
    const recordSha = fm.fields.record_sha256;
    if (recordPath === undefined || recordPath === "") {
      if (recordSha !== undefined && recordSha !== "") {
        declared += 1;
        findings.push(
          joinError(path, "record-missing", `shard declares record_sha256: but no record: path — the digest names nothing`),
        );
        continue;
      }
      if (status === "cited") {
        findings.push({
          severity: "WARN",
          path,
          line: 1,
          message:
            "[record-absent] status: cited shard names no extraction record (record: + record_sha256: frontmatter). " +
            "Its contract is byte-verified against nothing: Checks 8/9 confirm the quote occurs where it claims, not " +
            "that the contract is what the paper proves. This is the pre-record legacy path — file an extraction " +
            `record under ${RECORDS_PREFIX}<source-id>/ and join it (docs/gate-contracts.md Gate 3 Check 12)`,
        });
      }
      continue;
    }

    declared += 1;
    if (recordSha === undefined || !SHA256_RE.test(recordSha)) {
      findings.push(
        joinError(
          path,
          "record-sha-absent",
          `shard names record: ${recordPath} with no valid 64-hex record_sha256: — an unhashed pointer cannot ` +
            "distinguish the record that was reviewed from whatever now sits at that path",
        ),
      );
      continue;
    }
    const record = usable.get(recordPath);
    if (!record) {
      if (known.has(recordPath)) {
        findings.push(
          joinError(
            path,
            "record-review-unusable",
            `record ${recordPath} exists but did not pass Gate 3 Check 11 (see this run's [review-*]/[stale-*]/` +
              "[statement-*] findings on that record) — a shard may hold cited status only against a record that " +
              "verified against its source AND carries a hash-bound VALID review",
          ),
        );
      } else {
        findings.push(
          joinError(path, "record-missing", `shard names record: ${recordPath}, which does not exist in this repo`),
        );
      }
      continue;
    }
    const digest = canonicalRecordSha256(record.value);
    if (digest.toLowerCase() !== recordSha.toLowerCase()) {
      findings.push(
        joinError(
          path,
          "record-sha-mismatch",
          `shard names record_sha256: ${recordSha} but ${recordPath}'s canonical bytes hash ${digest} — the shard is ` +
            "pinned to a version of the record that is not the one on disk (the record moved, or the shard was " +
            "copied from another claim)",
        ),
      );
      continue;
    }
    const contract = fm.fields.contract ?? "";
    if (normalizeContract(contract) !== normalizeContract(record.statementBlessed)) {
      findings.push(
        joinError(
          path,
          "contract-mismatch",
          `shard contract does not match the joined record's statement_blessed (${recordPath}). Shard says ` +
            `${JSON.stringify(contract.slice(0, 100))}; the record's blessed statement is ` +
            `${JSON.stringify(record.statementBlessed.slice(0, 100))}. A cited claim states what the SOURCE states — ` +
            "this is the check a genuine-but-irrelevant quote plus an invented contract fails",
        ),
      );
      continue;
    }
    joined += 1;
  }

  return { findings, joined, declared };
}
