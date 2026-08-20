// ROLE: Gate 3 argument-shard citation verification (rk-uqxh). A cited result is available to
// Gate 2's rigour propagation, so Gate 3 must re-check the bytes that justify that rung on every
// run. The recognized grammar is the adjacent two-line output of `rk refs quote` embedded in an
// argument shard: `refs/<path>:<line>` followed by `"<exact quote>"`.
// The bytes a claim is matched against are resolved by ./refs-extraction.ts, never read straight
// from the payload: a PDF source is matched against its chained extraction layer (rk-we5i), a text
// source against itself, and every broken chain is one counted ERROR, never a fallback to raw bytes.
// PURITY: pure — no fs/network/clock (L3). Payload text and raw-byte hashes come from RepoSnapshot.

import type { Finding } from "./framework";
import { fileSha256, parseFrontmatter, type RepoSnapshot } from "./snapshot";
import { normalizeQuoteText } from "../refs/quote";
import { LOCK_PATH, readLockFacts, resolveQuotableText, type LockFacts } from "./refs-extraction";

const NON_SHARD_NAMES = new Set(["README.md", "INDEX.md", "DAG.md"]);
const POINTER_RE = /^\s*(refs\/[A-Za-z0-9_./-]+)(?::([^\s]+))?\s*$/;
const FULL_SHA256_RE = /^[0-9a-fA-F]{64}$/;

/** One `refs/<path>:<line>` + `"<quote>"` pair claimed somewhere in a shard. Exported (rk-5lzf)
 * so Gate 1's notation-translation rows can be verified by the SAME code path, byte-for-byte:
 * a translation row is a `rk refs quote` pair like any other, and a second quote semantics is
 * exactly the kind of drift a shared verifier exists to prevent. */
export interface CitationClaim {
  shardPath: string;
  line: number;
  sourcePath: string;
  locusText?: string;
  quote?: string;
  decorated?: boolean;
  /** What to call this claim in a finding. Defaults to `"shard citation"` (Gate 3's own wording);
   * Gate 1 passes `"notation translation"` so a reader can tell which check spoke. */
  kindLabel?: string;
}

export interface ShardCitationResult {
  findings: Finding[];
  checked: number;
  total: number;
}

function shardPaths(snapshot: RepoSnapshot): string[] {
  return [...snapshot.keys()]
    .filter((path) => {
      if (!path.startsWith("argument/") || !path.endsWith(".md")) return false;
      const base = path.slice(path.lastIndexOf("/") + 1);
      return !NON_SHARD_NAMES.has(base);
    })
    .sort();
}

function quotedLine(line: string | undefined): string | undefined {
  if (line === undefined) return undefined;
  const trimmed = line.trim();
  if (trimmed.length < 2 || !trimmed.startsWith('"') || !trimmed.endsWith('"')) return undefined;
  return trimmed.slice(1, -1);
}

/** Removes only the Markdown/path decorations named by Gate 3 Check 8's permissive detector.
 * The result must still match POINTER_RE as a whole line; arbitrary prose containing `refs/`
 * therefore does not become a citation unit. Four-space indentation remains strict grammar. */
function stripCitationDecorations(line: string): string {
  let candidate = line.trim();
  while (true) {
    const before = candidate;
    if (/^>\s*/.test(candidate)) candidate = candidate.replace(/^>\s*/, "").trim();
    else if (/^[-*]\s+/.test(candidate)) candidate = candidate.replace(/^[-*]\s+/, "").trim();
    else if (candidate.startsWith("./")) candidate = candidate.slice(2).trim();
    else if (candidate.startsWith("**") && candidate.endsWith("**")) candidate = candidate.slice(2, -2).trim();
    else {
      const backticks = /^(`+)(.*)\1$/.exec(candidate);
      if (backticks) candidate = backticks[2]!.trim();
      else if (candidate.startsWith("(") && candidate.endsWith(")")) candidate = candidate.slice(1, -1).trim();
    }
    if (candidate === before) return candidate;
  }
}

function claimsInShard(shardPath: string, content: string): CitationClaim[] {
  const lines = content.split(/\r?\n/);
  const claims: CitationClaim[] = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const pointer = POINTER_RE.exec(rawLine);
    const permissivePointer = pointer ?? POINTER_RE.exec(stripCitationDecorations(rawLine));
    if (!permissivePointer) continue;
    const decorated = pointer === null;
    claims.push({
      shardPath,
      line: i + 1,
      sourcePath: permissivePointer[1]!,
      ...(permissivePointer[2] !== undefined ? { locusText: permissivePointer[2] } : {}),
      ...(decorated ? { decorated: true } : {}),
      ...(!decorated && quotedLine(lines[i + 1]) !== undefined ? { quote: quotedLine(lines[i + 1]) } : {}),
    });
  }
  return claims;
}

function safeSourcePath(path: string): boolean {
  const parts = path.split("/");
  return path.startsWith("refs/") && parts.every((part) => part !== "" && part !== "." && part !== "..");
}

function claimError(claim: CitationClaim, message: string): Finding {
  return { severity: "ERROR", path: claim.shardPath, line: claim.line, message };
}

/** Gate 3 Checks 8-9's verification of ONE claim, in full: strict grammar, safe path, resolvable
 * positive line locus, a recognizable quote, payload present, hash-pinned to the ADOPTED lock
 * entry, and the quote found byte-for-byte at the recorded locus in whichever layer that locus
 * indexes (payload, or a PDF's chained extraction). Exported under this name (rk-5lzf) as the ONE
 * quote-verification path in the codebase: Gate 1's notation-translation rows call it directly
 * rather than forking a second, quietly divergent semantics. Returns `undefined` on success. */
export function verifyCitationClaim(claim: CitationClaim, snapshot: RepoSnapshot, lock: LockFacts): Finding | undefined {
  const label = `${claim.kindLabel ?? "shard citation"} ${claim.sourcePath}${claim.locusText ? `:${claim.locusText}` : ""}`;
  if (claim.decorated) {
    return claimError(
      claim,
      `${label} is a citation-shaped refs pointer outside the strict standalone path:line grammar and cannot be byte-verified; use the two-line output of rk refs quote without Markdown or ./ decoration`,
    );
  }
  if (!safeSourcePath(claim.sourcePath)) return claimError(claim, `${label} has an unsafe/unresolvable refs source path`);
  if (claim.locusText === undefined || !/^[1-9]\d*$/.test(claim.locusText)) {
    return claimError(claim, `${label} has no resolvable positive line locus (rk refs quote emits path:line)`);
  }
  const recordedLine = Number(claim.locusText);
  if (!Number.isSafeInteger(recordedLine)) return claimError(claim, `${label} has an unresolvable line locus`);
  if (claim.quote === undefined || normalizeQuoteText(claim.quote) === "") {
    return claimError(claim, `${label} is not followed by a recognizable double-quoted byte-verbatim line`);
  }

  const sourceText = snapshot.get(claim.sourcePath);
  if (sourceText === undefined) return claimError(claim, `source payload ${claim.sourcePath} ABSENT — ${label} cannot be byte-verified`);
  if (lock.error !== undefined) return claimError(claim, `${label} is not hash-pinned: ${lock.error}`);

  const refsRelative = claim.sourcePath.slice("refs/".length);
  const pins = lock.entries.filter((pin) => pin.path === refsRelative);
  if (pins.length !== 1) {
    const reason = pins.length === 0 ? "has no entry" : `has ${pins.length} ambiguous entries`;
    return claimError(claim, `${label} is not hash-pinned: ${LOCK_PATH} ${reason} for ${refsRelative}`);
  }
  const pin = pins[0]!;
  if (!FULL_SHA256_RE.test(pin.sha256)) return claimError(claim, `${label} is not hash-pinned by a valid full sha256`);
  const actualSha = fileSha256(snapshot, claim.sourcePath);
  if (actualSha === undefined) return claimError(claim, `${label} payload is present but has no raw-byte sha256 fact`);
  if (actualSha.toLowerCase() !== pin.sha256.toLowerCase()) {
    return claimError(claim, `${label} sha256 ${actualSha} does not match adopted pin ${pin.sha256}`);
  }

  // rk-we5i: WHICH bytes the recorded line locus indexes. For an ordinary text payload, the payload
  // itself (unchanged). For a PDF payload, the chained extraction layer — the payload's own bytes
  // are compressed streams containing none of the document's sentences, so `includes` there can
  // only ever produce a false NOT-FOUND. Any break in the extraction chain resolves to `ok: false`
  // and lands here as one counted ERROR: the claim is in the denominator, never the numerator.
  const resolved = resolveQuotableText(snapshot, lock, claim.sourcePath);
  if (!resolved.ok) return claimError(claim, `${label} cannot be byte-verified: ${resolved.reason}`);

  const sourceLine = resolved.text.split(/\r?\n/)[recordedLine - 1];
  if (sourceLine === undefined || !sourceLine.includes(claim.quote)) {
    const where = resolved.layer === "extraction" ? ` of extraction layer ${resolved.path}` : "";
    return claimError(
      claim,
      `${label} quote NOT found byte-for-byte at recorded locus line ${recordedLine}${where} (exact substring / grep -F semantics)`,
    );
  }
  return undefined;
}

/** Checks every recognized quote pair, regardless of shard status. A `status: cited` shard with no
 * pair contributes one expected-but-unchecked unit and ERRORs; if the whole cited population
 * verifies zero citations, a separate zero-coverage guard ERROR makes that state unmistakable. */
export function checkShardCitations(snapshot: RepoSnapshot): ShardCitationResult {
  const findings: Finding[] = [];
  const claims: CitationClaim[] = [];
  const citedWithoutClaims: string[] = [];
  const citedPaths: string[] = [];

  for (const path of shardPaths(snapshot)) {
    const content = snapshot.get(path)!;
    const shardClaims = claimsInShard(path, content);
    claims.push(...shardClaims);
    if (parseFrontmatter(content).fields.status !== "cited") continue;
    citedPaths.push(path);
    if (shardClaims.length === 0) citedWithoutClaims.push(path);
  }

  for (const path of citedWithoutClaims) {
    findings.push({
      severity: "ERROR",
      path,
      message: "argument shard claims status cited but has no recognizable rk refs quote path:line + quoted-text pair",
    });
  }

  const lock = readLockFacts(snapshot);
  let checked = 0;
  for (const claim of claims) {
    const error = verifyCitationClaim(claim, snapshot, lock);
    if (error) findings.push(error);
    else checked++;
  }

  const total = claims.length + citedWithoutClaims.length;
  if (citedPaths.length > 0 && checked === 0) {
    findings.push({
      severity: "ERROR",
      path: citedPaths[0]!,
      message: `zero byte-verified shard citations across ${citedPaths.length} status cited shard(s) (checked 0/${total})`,
    });
  }
  return { findings, checked, total };
}
