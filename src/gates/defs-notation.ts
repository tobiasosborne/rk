// ROLE: Gate 1's notation-register checks (rk-5lzf, Tier A, LB5). Split out of src/gates/defs.ts
// to keep both shards under the ~200-line rule; `defsGate` calls `checkNotationRegister` once per
// run and folds its findings and sub-counts into its own. Contract: docs/gate-contracts.md Gate 1,
// "Notation shards".
// PURITY: pure — no fs/network/clock (L3).
//
// The DRIFT namespace this file extends is Gate 1's own (`aliasOwner`, src/gates/defs.ts): one map,
// three keyspaces — `term:` (term + aliases, the pre-existing one), `symbol:` (a blessed macro),
// and `xlat:` (a (source-id, their-symbol) pair). All three are STRUCTURAL on collision, the
// "duplicate ids/aliases" class of the phase matrix: a name owned by two shards is not a
// completeness problem, it is a register that can no longer answer "which definition is this".

import type { Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { MACRO_TOKEN_RE, type ConventionProfile } from "./profile";
import { NOTATION_SHARD_TYPE, parseNotationShards, type NotationShard, type TranslationRow } from "./notation-shards";
import { LOCK_PATH, readLockFacts, type LockFacts } from "./refs-extraction";
import { verifyCitationClaim } from "./refs-shard-citations";

export interface NotationRegisterResult {
  findings: Finding[];
  /** Notation shards seen. */
  shards: number;
  /** Translation rows that VERIFIED byte-for-byte. */
  verified: number;
  /** Translation rows attempted (rows present, anchored or not). */
  rows: number;
}

function error(path: string, message: string, line?: number, structural = false): Finding {
  return { severity: "ERROR", path, ...(line !== undefined ? { line } : {}), message, structural };
}

/** rk-5lzf B1: EVERY notation-admission provenance failure is STRUCTURAL, including the ones the
 * shared refs verifier produces. The register is what a `status: cited` claim's meaning rests on;
 * a provenance hole there that softens to WARN in exploration is unenforced in exactly the phase
 * where conjectures are admitted (campaign plan section 2a, review finding 1's second half). */
function asStructural(finding: Finding): Finding {
  return { ...finding, structural: true };
}

/** Checks every `shard_type: notation` shard, and every OTHER shard's `shard_type` value (an
 * unknown one is an ERROR — v1 admits exactly `notation`, and a typo must never make a notation
 * shard invisible to this whole check).
 *
 * `aliasOwner` is Gate 1's shared DRIFT map, threaded in so symbol/translation collisions live in
 * the SAME namespace as term/alias collisions rather than in a private one that could disagree. */
export function checkNotationRegister(
  snapshot: RepoSnapshot,
  profile: ConventionProfile | undefined,
  shardTypes: ReadonlyMap<string, string>,
  aliasOwner: Map<string, string>,
): NotationRegisterResult {
  const findings: Finding[] = [];

  for (const [path, value] of shardTypes) {
    if (value === NOTATION_SHARD_TYPE) continue;
    findings.push(
      error(
        path,
        `shard_type '${value}' not in ${NOTATION_SHARD_TYPE} — v1 admits exactly one shard_type, and a ` +
          `typo here silently exempts the shard from every notation check`,
      ),
    );
  }

  const shards = parseNotationShards(snapshot);
  const classNames = profile ? new Set(profile.tracked_classes.map((c) => c.class)) : undefined;
  const lock = readLockFacts(snapshot);
  let verified = 0;
  let rows = 0;

  for (const shard of shards) {
    checkShardFields(shard, classNames, findings);
    checkDrift(shard, aliasOwner, findings);
    checkMeaningProvenance(shard, snapshot, lock, findings);
    for (const row of shard.translations) {
      rows++;
      if (row.anchorQuote === undefined) {
        findings.push(
          error(
            shard.path,
            `translation-anchor-missing: row '${row.sourceId}: ${row.theirSymbol}' at ` +
              `${row.sourcePath}:${row.locusText} is not followed by a byte-verbatim "<quote>" anchor line — ` +
              `an unanchored translation claims a source says something and offers no bytes for it`,
            row.line,
            true,
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
      if (finding) {
        findings.push(asStructural(finding));
        continue;
      }
      // rk-5lzf B1: byte-verification alone does not make a TRANSLATION true. Two further binds,
      // both structural, both fail-closed.
      const bound = checkTranslationBinding(shard.path, row, lock, findings);
      if (bound) verified++;
    }
  }

  return { findings, shards: shards.length, verified, rows };
}

/** rk-5lzf B1, the review's own exploit: "wrong meaning with verified translation anchors passes".
 * A `kind: cited` notation shard used to satisfy Layer 0 with a shard-level `source:`/`sha256:`
 * pair, which binds the SHARD to a source and says nothing about what the symbol MEANS. The shard
 * could then declare any meaning at all and every check was green. Two requirements close it, both
 * STRUCTURAL, and only for `kind: cited` (a `consensus`/`original` shard claims nothing of a
 * source, so there is nothing to anchor):
 *   - `meaning:` is REQUIRED and non-empty; and
 *   - a `meaning-anchor:` block whose pointer+quote is byte-verified by the SAME verifier Gate 3
 *     uses for every other quote in the repo.
 * The anchor proves the source contains the passage; a human reviewer still owns whether the
 * passage says what `meaning:` says. That residual is named in the contract, not papered over. */
function checkMeaningProvenance(
  shard: NotationShard,
  snapshot: RepoSnapshot,
  lock: LockFacts,
  findings: Finding[],
): void {
  if (shard.fields.kind?.trim() !== "cited") return;

  const meaning = shard.fields.meaning?.trim();
  if (!meaning) {
    findings.push(
      error(
        shard.path,
        "meaning-missing: a kind: cited notation shard must state 'meaning:' — the shard-level " +
          "source:/sha256: pair binds this FILE to a source, never the symbol's meaning to a passage",
        undefined,
        true,
      ),
    );
  }

  const anchor = shard.meaningAnchor;
  if (anchor === undefined) {
    findings.push(
      error(
        shard.path,
        "meaning-anchor-missing: a kind: cited notation shard must carry a 'meaning-anchor:' line " +
          "followed by refs/<path>:<line> and its byte-verbatim \"<quote>\" — without it the declared " +
          "meaning rests on nothing a gate can read",
        undefined,
        true,
      ),
    );
    return;
  }
  if (anchor.sourcePath === undefined || anchor.quote === undefined) {
    findings.push(
      error(
        shard.path,
        "meaning-anchor-malformed: 'meaning-anchor:' must be followed by a standalone " +
          "refs/<path>:<line> pointer and then its \"<quote>\" line",
        anchor.line,
        true,
      ),
    );
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
  if (finding) findings.push(asStructural(finding));
}

/** rk-5lzf B1: the two binds a byte-verified translation row still needs. Both fail closed.
 *
 * (1) SYMBOL-IN-QUOTE. The row says "this source writes <theirSymbol> for our symbol". A quote
 * that does not contain `theirSymbol` verbatim proves the source contains SOME sentence, not that
 * it uses that token — the reviewer's "one genuine but irrelevant quote" shape, applied to
 * notation.
 *
 * (2) SOURCE-OWNS-PATH. The row names a source-id AND a payload path; nothing tied them together,
 * so a genuine quote from paper A could be filed under paper B's name with every byte check
 * passing. Ownership comes from the lock's own `files[].source_id`. A lock entry with no
 * `source_id` cannot establish ownership and is REFUSED rather than assumed: unproven ownership
 * is not ownership.
 *
 * Returns true iff the row is fully bound (so the caller counts it as verified). */
function checkTranslationBinding(
  path: string,
  row: TranslationRow,
  lock: LockFacts,
  findings: Finding[],
): boolean {
  let ok = true;
  if (!row.anchorQuote!.includes(row.theirSymbol)) {
    findings.push(
      error(
        path,
        `translation-symbol-not-in-quote: the anchor quote for '${row.sourceId}: ${row.theirSymbol}' ` +
          `does not contain '${row.theirSymbol}' verbatim — it shows the source contains SOME sentence, ` +
          `not that the source writes this token for this object`,
        row.line,
        true,
      ),
    );
    ok = false;
  }
  const refsRelative = row.sourcePath.slice("refs/".length);
  const pins = lock.entries.filter((e) => e.path === refsRelative);
  const owner = pins.length === 1 ? pins[0]!.sourceId : undefined;
  if (owner !== row.sourceId) {
    findings.push(
      error(
        path,
        `translation-source-path-mismatch: row names source '${row.sourceId}' but ${row.sourcePath} is ` +
          `${owner === undefined ? "owned by no source_id in " + LOCK_PATH : `owned by '${owner}'`} — ` +
          `a quote's bytes say nothing about which paper the row is attributing them to`,
        row.line,
        true,
      ),
    );
    ok = false;
  }
  return ok;
}

function checkShardFields(shard: NotationShard, classNames: ReadonlySet<string> | undefined, findings: Finding[]): void {
  if (shard.translationsInFrontmatter) {
    findings.push(
      error(
        shard.path,
        `translations-in-frontmatter: 'translations:' belongs in the shard BODY, one ` +
          `'- <source-id>: <their symbol> @ refs/<path>:<line>' row per line, each followed by its ` +
          `"<quote>" anchor. The flat frontmatter grammar cannot carry an anchor line at all, so rows ` +
          `written there are silently dropped — the whole check would then pass on zero rows`,
      ),
    );
  }
  if (shard.symbol === undefined) {
    findings.push(error(shard.path, "notation shard missing required 'symbol:' — it registers nothing"));
  } else if (!MACRO_TOKEN_RE.test(shard.symbol)) {
    findings.push(
      error(
        shard.path,
        `symbol '${shard.symbol}' is not a plain LaTeX macro token (\\name, letters only) — the register's ` +
          `blessed forms are what Gate 9 scans for and what definitions/notation/macros.tex declares`,
      ),
    );
  }
  if (shard.className === undefined) {
    findings.push(error(shard.path, "notation shard missing required 'class:' — it belongs to no tracked class"));
    return;
  }
  if (classNames === undefined) return; // no profile configured: reported in the coverage line, never silently
  if (!classNames.has(shard.className)) {
    // structural: a class naming no profile entry is a BROKEN CROSS-REFERENCE (phase matrix's own
    // structural class) — the shard registers into a bucket Gate 9 never checks, so every symbol it
    // was meant to bless goes unenforced while the register looks complete.
    findings.push(
      error(
        shard.path,
        `class '${shard.className}' is not a tracked class of the configured convention profile ` +
          `(known: ${[...classNames].sort().join(", ")}) — this shard registers into a class Gate 9 never checks`,
        undefined,
        true,
      ),
    );
  }
}

function checkDrift(shard: NotationShard, aliasOwner: Map<string, string>, findings: Finding[]): void {
  if (shard.symbol !== undefined) {
    const key = `symbol:${shard.symbol}`;
    const owner = aliasOwner.get(key);
    if (owner !== undefined && owner !== shard.path) {
      findings.push(
        error(shard.path, `DRIFT: symbol '${shard.symbol}' claimed by both ${owner} and ${shard.path}`, undefined, true),
      );
    }
    aliasOwner.set(key, shard.path);
  }
  for (const row of shard.translations) {
    // The pair is scoped BY SOURCE: two campaigns symbols may share a source, and one source symbol
    // may recur across sources — only (source-id, their-symbol) is a claim about what a specific
    // paper's specific token means, and two shards claiming it disagree about that paper.
    const key = `xlat:${row.sourceId}\u0000${row.theirSymbol}`;
    const owner = aliasOwner.get(key);
    if (owner !== undefined) {
      // No self-exemption: the same pair twice inside ONE shard is the same contradiction, so the
      // owner comparison is against presence, not against a different path.
      findings.push(
        error(
          shard.path,
          `translation-collision: source '${row.sourceId}' symbol '${row.theirSymbol}' is claimed by both ` +
            `${owner} and ${shard.path} — one source symbol translates to exactly one campaign symbol`,
          row.line,
          true,
        ),
      );
    }
    aliasOwner.set(key, shard.path);
  }
}
