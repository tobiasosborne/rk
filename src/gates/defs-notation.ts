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
import { NOTATION_SHARD_TYPE, parseNotationShards, type NotationShard } from "./notation-shards";
import { readLockFacts } from "./refs-extraction";
import { notationExpansionFinding } from "./notation-expansion";
import { checkNotationProvenance } from "./defs-notation-provenance";

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
  const classes = profile ? new Map(profile.tracked_classes.map((c) => [c.class, c])) : undefined;
  const lock = readLockFacts(snapshot);
  let verified = 0;
  let rows = 0;

  for (const shard of shards) {
    checkShardFields(shard, classes, findings);
    checkDrift(shard, aliasOwner, findings);
    rows += shard.translations.length;
    verified += checkNotationProvenance(shard, snapshot, lock, findings);
  }

  return { findings, shards: shards.length, verified, rows };
}

function checkShardFields(
  shard: NotationShard,
  classes: ReadonlyMap<string, ConventionProfile["tracked_classes"][number]> | undefined,
  findings: Finding[],
): void {
  const expansionFinding = notationExpansionFinding(shard);
  if (expansionFinding) findings.push(expansionFinding);
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
  if (classes === undefined) return; // no profile configured: reported in the coverage line, never silently
  const trackedClass = classes.get(shard.className);
  if (trackedClass === undefined) {
    // structural: a class naming no profile entry is a BROKEN CROSS-REFERENCE (phase matrix's own
    // structural class) — the shard registers into a bucket Gate 9 never checks, so every symbol it
    // was meant to bless goes unenforced while the register looks complete.
    findings.push(
      error(
        shard.path,
        `class '${shard.className}' is not a tracked class of the configured convention profile ` +
          `(known: ${[...classes.keys()].sort().join(", ")}) — this shard registers into a class Gate 9 never checks`,
        undefined,
        true,
      ),
    );
    return;
  }
  if (shard.symbol !== undefined && shard.symbol !== trackedClass.blessed) {
    findings.push(
      error(
        shard.path,
        `symbol-not-blessed-for-class: notation shard in class '${shard.className}' declares ` +
          `'${shard.symbol}', but the convention profile blesses '${trackedClass.blessed}' — raw source ` +
          `spellings belong only in source-scoped translation rows`,
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
