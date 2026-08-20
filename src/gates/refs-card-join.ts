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
// TWO MODES, because a migration setting and a validity barrier are different things (Tier A
// review 2026-08-20, landing-blocker BL3: "Check 12 remains optional at the exact promotion
// boundary it is meant to protect"). `.rk/config.json`'s `records`:
//
//   "legacy" (the DEFAULT) — a `status: cited` shard with NO `record:` keeps exactly the
//     pre-record behavior (Checks 8/9 alone) and draws a WARN `[record-absent]`. Every rk campaign
//     predates records; making their absence an ERROR on day one is how a gate gets switched off.
//     This is a MIGRATION setting and the WARN is the campaign's visible backlog — not a resting
//     state, and documented as such in the Gate 3 contract.
//   "required" — the state a campaign that has adopted records runs in. A cited shard with no
//     valid join is a structural ERROR `[record-required]`; every `proved-mod-audit` shard must
//     declare `origin: literature | campaign` (`[origin-required]`), and `origin: literature`
//     requires the join too.
//
// THE ORIGIN DISCRIMINATOR (BL3). rk cannot mechanically tell a literature PMA claim (which the
// memo says must join) from a campaign's own proof-mod-audit (which has no record to join to).
// The pre-repair code inferred nothing and therefore checked nothing — a PMA shard with neither a
// record nor a citation produced no finding at all. The repair does not invent a proxy: it makes
// the campaign SAY which it is, in one required frontmatter field, and holds the literature answer
// to the full join. An undeclared or unrecognized `origin:` is an ERROR, never a guess.
//
// THE DENOMINATOR counts every cited shard and every literature-PMA shard, whether or not it names
// a record — before this, a cited shard with no `record:` was excluded from `0/0`, so the coverage
// line's own numbers hid exactly the population the check exists for.

import type { Finding } from "./framework";
import type { RecordsMode } from "./config";
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

const SHA256_RE = /^[0-9a-fA-F]{64}$/;
const ORIGINS = new Set(["literature", "campaign"]);

function joinError(path: string, code: string, message: string): Finding {
  // Structural: admission of a cited claim is phase-independent (campaign memo section 2a).
  return { severity: "ERROR", path, line: 1, message: `[${code}] ${message}`, structural: true };
}

/** Which shards this check holds to the join, and why. `cited` always; `proved-mod-audit` only
 * when the campaign has declared it a LITERATURE claim. In required mode an undeclared origin on a
 * PMA shard is itself the finding — the one thing that must never happen is silently deciding the
 * shard is a campaign proof because nobody said otherwise. */
function originOf(fields: Record<string, string>): string | undefined {
  const raw = fields.origin;
  return raw !== undefined && raw !== "" ? raw : undefined;
}

export function checkCardJoin(
  snapshot: RepoSnapshot,
  usable: Map<string, L1Record>,
  known: Set<string>,
  mode: RecordsMode,
): CardJoinResult {
  const findings: Finding[] = [];
  let joined = 0;
  let declared = 0;

  for (const path of shardPaths(snapshot)) {
    const fm = parseFrontmatter(snapshot.get(path)!);
    const status = fm.fields.status;
    if (status !== "cited" && status !== "proved-mod-audit") continue;

    // BL3: does this shard have to join at all? `cited` always does. `proved-mod-audit` does when
    // the campaign declares it a literature claim — and in required mode it must make that
    // declaration, because "nobody said" is exactly how the pre-repair silence arose.
    const origin = originOf(fm.fields);
    let mustJoin = status === "cited";
    if (status === "proved-mod-audit") {
      if (origin === undefined) {
        if (mode === "required") {
          findings.push(
            joinError(
              path,
              "origin-required",
              "status: proved-mod-audit shard declares no origin: — under .rk/config.json records: \"required\" every " +
                "proved-mod-audit claim must say whether it is a LITERATURE claim (origin: literature, which must join " +
                "to an extraction record exactly like a cited claim) or the campaign's own proof (origin: campaign, " +
                "which has no record to join to). rk cannot tell them apart mechanically, and inferring 'campaign' " +
                "from silence is what let a literature claim through with no citation at all",
            ),
          );
        }
      } else if (!ORIGINS.has(origin)) {
        if (mode === "required") {
          findings.push(
            joinError(
              path,
              "origin-required",
              `status: proved-mod-audit shard declares origin: ${JSON.stringify(origin)}, which is neither ` +
                '"literature" nor "campaign" — an unrecognized origin is never read as either one',
            ),
          );
        }
      } else if (origin === "literature") {
        mustJoin = true;
      }
    }

    const recordPath = fm.fields.record;
    const recordSha = fm.fields.record_sha256;
    if (recordPath === undefined || recordPath === "") {
      if (recordSha !== undefined && recordSha !== "") {
        if (mustJoin) declared += 1;
        findings.push(
          joinError(path, "record-missing", `shard declares record_sha256: but no record: path — the digest names nothing`),
        );
        continue;
      }
      if (!mustJoin) continue;
      // BL3: counted in the denominator whether or not it names a record — the pre-repair `0/0`
      // hid exactly the population this check exists for.
      declared += 1;
      if (mode === "required") {
        findings.push(
          joinError(
            path,
            "record-required",
            `status: ${status} shard names no extraction record (record: + record_sha256: frontmatter) and ` +
              '.rk/config.json sets records: "required". Its contract is byte-verified against nothing: Checks 8/9 ' +
              "confirm a quote occurs where it claims, never that the contract is what the paper proves. File an " +
              `extraction record under ${RECORDS_PREFIX}<source-id>/, have it reviewed, and join it by canonical hash`,
          ),
        );
        continue;
      }
      findings.push({
        severity: "WARN",
        path,
        line: 1,
        message:
          `[record-absent] status: ${status} shard names no extraction record (record: + record_sha256: frontmatter). ` +
          "Its contract is byte-verified against nothing: Checks 8/9 confirm the quote occurs where it claims, not " +
          "that the contract is what the paper proves. This is the pre-record LEGACY path, kept green only because " +
          '.rk/config.json leaves records: "legacy" — a migration setting, not a resting state. File an extraction ' +
          `record under ${RECORDS_PREFIX}<source-id>/ and join it, then set records: "required"`,
      });
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
