// ROLE: Gate 3 argument-shard citation verification (rk-uqxh). A cited result is available to
// Gate 2's rigour propagation, so Gate 3 must re-check the bytes that justify that rung on every
// run. The recognized grammar is the adjacent two-line output of `rk refs quote` embedded in an
// argument shard: `refs/<path>:<line>` followed by `"<exact quote>"`.
// PURITY: pure — no fs/network/clock (L3). Payload text and raw-byte hashes come from RepoSnapshot.

import type { Finding } from "./framework";
import { fileSha256, parseFrontmatter, type RepoSnapshot } from "./snapshot";

const LOCK_PATH = "refs/manifest/sources.lock.json";
const NON_SHARD_NAMES = new Set(["README.md", "INDEX.md", "DAG.md"]);
const POINTER_RE = /^\s*(refs\/[A-Za-z0-9_./-]+)(?::([^\s]+))?\s*$/;
const FULL_SHA256_RE = /^[0-9a-fA-F]{64}$/;

interface HashPin {
  path: string;
  sha256: string;
}

interface LockFacts {
  pins: HashPin[];
  error?: string;
}

interface CitationClaim {
  shardPath: string;
  line: number;
  sourcePath: string;
  locusText?: string;
  quote?: string;
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

function claimsInShard(shardPath: string, content: string): CitationClaim[] {
  const lines = content.split(/\r?\n/);
  const claims: CitationClaim[] = [];
  for (let i = 0; i < lines.length; i++) {
    const pointer = POINTER_RE.exec(lines[i]!);
    if (!pointer) continue;
    claims.push({
      shardPath,
      line: i + 1,
      sourcePath: pointer[1]!,
      ...(pointer[2] !== undefined ? { locusText: pointer[2] } : {}),
      ...(quotedLine(lines[i + 1]) !== undefined ? { quote: quotedLine(lines[i + 1]) } : {}),
    });
  }
  return claims;
}

function readLock(snapshot: RepoSnapshot): LockFacts {
  const raw = snapshot.get(LOCK_PATH);
  if (raw === undefined) return { pins: [], error: `${LOCK_PATH} absent` };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || !Array.isArray((parsed as { files?: unknown }).files)) {
      return { pins: [], error: `${LOCK_PATH} malformed (expected an object with files[])` };
    }
    const pins: HashPin[] = [];
    for (const entry of (parsed as { files: unknown[] }).files) {
      if (entry === null || typeof entry !== "object") {
        return { pins: [], error: `${LOCK_PATH} malformed (non-object files[] entry)` };
      }
      const row = entry as { path?: unknown; sha256?: unknown };
      if (typeof row.path !== "string" || typeof row.sha256 !== "string") {
        return { pins: [], error: `${LOCK_PATH} malformed (each entry needs string path and sha256)` };
      }
      pins.push({ path: row.path, sha256: row.sha256 });
    }
    return { pins };
  } catch (error) {
    return { pins: [], error: `${LOCK_PATH} unparseable: ${(error as Error).message}` };
  }
}

function safeSourcePath(path: string): boolean {
  const parts = path.split("/");
  return path.startsWith("refs/") && parts.every((part) => part !== "" && part !== "." && part !== "..");
}

function claimError(claim: CitationClaim, message: string): Finding {
  return { severity: "ERROR", path: claim.shardPath, line: claim.line, message };
}

function verifyClaim(claim: CitationClaim, snapshot: RepoSnapshot, lock: LockFacts): Finding | undefined {
  const label = `shard citation ${claim.sourcePath}${claim.locusText ? `:${claim.locusText}` : ""}`;
  if (!safeSourcePath(claim.sourcePath)) return claimError(claim, `${label} has an unsafe/unresolvable refs source path`);
  if (claim.locusText === undefined || !/^[1-9]\d*$/.test(claim.locusText)) {
    return claimError(claim, `${label} has no resolvable positive line locus (rk refs quote emits path:line)`);
  }
  const recordedLine = Number(claim.locusText);
  if (!Number.isSafeInteger(recordedLine)) return claimError(claim, `${label} has an unresolvable line locus`);
  if (claim.quote === undefined || claim.quote.length === 0) {
    return claimError(claim, `${label} is not followed by a recognizable double-quoted byte-verbatim line`);
  }

  const sourceText = snapshot.get(claim.sourcePath);
  if (sourceText === undefined) return claimError(claim, `source payload ${claim.sourcePath} ABSENT — ${label} cannot be byte-verified`);
  if (lock.error !== undefined) return claimError(claim, `${label} is not hash-pinned: ${lock.error}`);

  const refsRelative = claim.sourcePath.slice("refs/".length);
  const pins = lock.pins.filter((pin) => pin.path === refsRelative);
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

  const sourceLine = sourceText.split(/\r?\n/)[recordedLine - 1];
  if (sourceLine === undefined || !sourceLine.includes(claim.quote)) {
    return claimError(
      claim,
      `${label} quote NOT found byte-for-byte at recorded locus line ${recordedLine} (exact substring / grep -F semantics)`,
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

  const lock = readLock(snapshot);
  let checked = 0;
  for (const claim of claims) {
    const error = verifyClaim(claim, snapshot, lock);
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
