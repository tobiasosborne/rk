// ROLE: Gate 9 — notation (rk-5lzf, Tier A, LB5). A LEXICAL check: campaign prose uses each
// class's registered blessed macro; raw source tokens stay inside source-scoped quote evidence.
// Contract: docs/gate-contracts.md "Gate 9 — notation".
// PURITY: pure — no fs/network/clock (L3).
//
// STRUCTURAL, never demoted (campaign plan section 2a): admission of a cited result or a conjecture
// is a transaction over one candidate, and its notation must be ERROR-free at admission regardless
// of phase. A notation check that softens exactly when admission happens is the LB4 shape.
//
// WHAT IT CAN AND CANNOT SEE, stated rather than implied. The profile's tracked tokens are raw
// literature notation: some are plain macro tokens (`\epsilon`), some are bare identifiers (`c`,
// `k`) or brace/subscript forms (`\lambda_{\min}`). Only the macro-token subset can be scanned for
// reliably — searching prose for a bare `c` produces noise, not signal. So this gate enforces that
// subset and COUNTS the rest in its coverage line (L2: a skip is always visible with a count),
// rather than pretending to a reach it does not have.
//
// QUOTED SOURCE TEXT IS EXEMPT only as an adjacent strict evidence pair. A translation row or
// refs/<path>:<line> pointer followed immediately by its `"<quote>"` anchor is source notation;
// quotation marks by themselves prove nothing and never exempt campaign prose.

import type { CoverageLine, Finding, Gate, GateResult } from "./framework";
import type { GateConfig } from "./config";
import { baseName, listFilesRecursive, type RepoSnapshot } from "./snapshot";
import {
  blessedSymbolIndex,
  enforceableRawSymbolIndex,
  MACRO_TOKEN_RE,
  profileFilePath,
  validateConventionProfile,
} from "./profile";
// rk-5lzf B6: ONE shared non-shard policy, applied to definitions/ and argument/ alike, at any
// depth. Before the repair wave Gate 1 skipped README/INDEX while Gate 9 skipped README/INDEX/DAG,
// so the same file was a shard to one gate and not the other.
import { isNonShardBasename } from "./definitions-scan";
import { parseNotationShards } from "./notation-shards";

const RECORDS_DIR = "refs/records";
/** A plain LaTeX macro token as it appears in running text. */
const MACRO_SCAN_RE = /\\[A-Za-z]+/g;
/** A translation row (src/gates/notation-shards.ts's own grammar) — source notation, exempt. */
const ROW_LINE_RE = /^-\s+[A-Za-z0-9][A-Za-z0-9._-]*:\s*\S+\s+@\s+refs\/[A-Za-z0-9_./-]+:[0-9]+$/;
/** Gate 3's strict standalone source pointer, restricted to a positive line locus. */
const POINTER_LINE_RE = /^refs\/[A-Za-z0-9_./-]+:[1-9][0-9]*$/;

interface Occurrence {
  path: string;
  line: number;
  token: string;
  /** Extra locator for a record field (`statement_blessed`), empty for a shard body. */
  where: string;
}

function isQuotedLine(trimmed: string): boolean {
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"');
}

/** True only for a strict translation row itself, or its/pointer's immediately adjacent quote. */
function isVerifiedQuoteSyntax(lines: readonly { text: string }[], index: number): boolean {
  const current = lines[index]!.text.trim();
  if (ROW_LINE_RE.test(current)) return true;
  if (!isQuotedLine(current) || index === 0) return false;
  const previous = lines[index - 1]!.text.trim();
  return ROW_LINE_RE.test(previous) || POINTER_LINE_RE.test(previous);
}

/** Body lines of a shard (everything after the frontmatter's closing `---`), 1-indexed against the
 * whole file. A file with no well-formed frontmatter is scanned whole — the fail-LOUD direction. */
function bodyLines(content: string): { line: number; text: string }[] {
  const lines = content.split(/\r?\n/);
  let start = 0;
  let seen = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === "---") {
      seen++;
      if (seen === 2) {
        start = i + 1;
        break;
      }
    }
  }
  return lines.slice(start).map((text, i) => ({ line: start + i + 1, text }));
}

function scanLine(path: string, line: number, text: string, where: string, out: Occurrence[], exempt = false): void {
  if (exempt) return;
  for (const m of text.matchAll(MACRO_SCAN_RE)) out.push({ path, line, token: m[0]!, where });
}

/** Every Layer 0/1 shard body plus every `refs/records/**\/*.json` `statement_blessed` field.
 * Conjecture shards need no special case: they are argument shards and are already in scope. */
function collectOccurrences(snapshot: RepoSnapshot): { occurrences: Occurrence[]; files: number; findings: Finding[] } {
  const occurrences: Occurrence[] = [];
  const findings: Finding[] = [];
  let files = 0;

  for (const prefix of ["definitions", "argument"]) {
    for (const path of listFilesRecursive(snapshot, prefix, ".md")) {
      if (isNonShardBasename(baseName(path))) continue;
      files++;
      const body = bodyLines(snapshot.get(path)!);
      for (let i = 0; i < body.length; i++) {
        const { line, text } = body[i]!;
        scanLine(path, line, text, "", occurrences, isVerifiedQuoteSyntax(body, i));
      }
    }
  }

  // Extraction records (rk-nsex) may not exist yet — the whole directory being absent is a
  // legitimate state, discovered rather than required.
  for (const path of listFilesRecursive(snapshot, RECORDS_DIR, ".json")) {
    files++;
    let parsed: unknown;
    try {
      parsed = JSON.parse(snapshot.get(path)!);
    } catch (e) {
      findings.push({
        severity: "WARN",
        path,
        line: 1,
        message:
          `extraction record is not valid JSON (${e instanceof Error ? e.message : String(e)}) — its ` +
          `statement_blessed could not be scanned for tracked symbols; this is a skipped check, not a clean bill`,
      });
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
    const statement = (parsed as Record<string, unknown>).statement_blessed;
    if (typeof statement !== "string") continue;
    statement.split(/\r?\n/).forEach((text, i) => scanLine(path, i + 1, text, "statement_blessed", occurrences));
  }

  return { occurrences, files, findings };
}

export const notationGate: Gate = {
  name: "notation",
  run(snapshot: RepoSnapshot, config: GateConfig): GateResult {
    const { profile } = validateConventionProfile(snapshot, config.conventionProfile);

    if (profile === undefined) {
      // Two DIFFERENT states, reported differently — never collapsed into one silent pass. The
      // config gate already ERRORs on a configured-but-unusable profile; this gate's job here is
      // to say, in its own voice, that it checked nothing and why.
      const configured = config.conventionProfile !== undefined;
      const message = configured
        ? `convention profile "${config.conventionProfile}" is configured but unusable (see the config gate's ` +
          `own ERROR) — Gate 9 checked NOTHING this run; every tracked symbol is unenforced until it parses`
        : "no convention profile configured (.rk/config.json 'conventionProfile') — Gate 9 has nothing to " +
          "check against, so no symbol is enforced; this is a visible zero, not a pass";
      return {
        findings: [{ severity: "WARN", path: ".rk/config.json", line: 1, message }],
        coverage: [
          {
            gate: "notation",
            unit: configured
              ? `profile prerequisite (profile "${config.conventionProfile}" unusable; zero classes tracked)`
              : "profile prerequisite (no profile configured; zero classes tracked)",
            checked: 0,
            total: 1,
          },
        ],
      };
    }

    const rawTracked = enforceableRawSymbolIndex(profile);
    const blessed = blessedSymbolIndex(profile);
    const notationShards = parseNotationShards(snapshot);
    const registered = new Map<string, Set<string>>(); // symbol -> classes it is registered in
    for (const shard of notationShards) {
      if (shard.symbol === undefined || shard.className === undefined) continue;
      const set = registered.get(shard.symbol);
      if (set) set.add(shard.className);
      else registered.set(shard.symbol, new Set([shard.className]));
    }

    const { occurrences, files, findings } = collectOccurrences(snapshot);
    const encounteredTokens = new Set(occurrences.map((occ) => occ.token));
    const reported = new Set<string>();

    for (const occ of occurrences) {
      const rawClasses = rawTracked.get(occ.token);
      const blessedClass = blessed.get(occ.token);
      if (rawClasses === undefined && blessedClass === undefined) continue;
      const isRegistered = blessedClass !== undefined && registered.get(occ.token)?.has(blessedClass) === true;
      const key = `${occ.path}\u0000${occ.token}`;
      if (reported.has(key)) continue; // one finding per (file, symbol) — ten usages are one defect
      reported.add(key);
      const where = occ.where ? ` in ${occ.where}` : "";
      if (rawClasses !== undefined && blessedClass === undefined) {
        findings.push({
          severity: "ERROR",
          path: occ.path,
          line: occ.line,
          structural: true,
          message:
            `unblessed-source-symbol: '${occ.token}'${where} is raw source notation tracked by class` +
            `${rawClasses.length === 1 ? "" : "es"} ${rawClasses.map((c) => `'${c}'`).join(", ")}; ` +
            `campaign prose cannot identify its intended class lexically — use that class's blessed macro, ` +
            `and record '${occ.token}' only in a source-scoped translation row`,
        });
        continue;
      }
      if (isRegistered) continue;
      const registeredIn = registered.get(occ.token);
      const detail = registeredIn
        ? `it is registered only in class${registeredIn.size === 1 ? "" : "es"} ${[...registeredIn].sort().map((c) => `'${c}'`).join(", ")}`
        : "no notation shard registers it at all";
      findings.push({
        severity: "ERROR",
        path: occ.path,
        line: occ.line,
        // structural (campaign plan section 2a): admission is phase-independent, so this never
        // demotes to WARN in exploration.
        structural: true,
        message:
          `unregistered-symbol: blessed macro '${occ.token}'${where} is the canonical symbol of class ` +
          `'${blessedClass}' in the convention profile, but ${detail} — add a definitions/**/*.md shard ` +
          `with shard_type: notation, symbol: ${occ.token}, and class: ${blessedClass}`,
      });
    }

    const classClauses: string[] = [];
    let registeredClasses = 0;
    for (const trackedClass of [...profile.tracked_classes].sort((a, b) =>
      a.class < b.class ? -1 : a.class > b.class ? 1 : 0,
    )) {
      const canonicalCount = notationShards.filter(
        (shard) => shard.className === trackedClass.class && shard.symbol === trackedClass.blessed,
      ).length;
      if (canonicalCount === 1) registeredClasses++;
      if (profile.notation === "complete" && canonicalCount !== 1) {
        const kind = canonicalCount === 0 ? "canonical-shard-missing" : "canonical-shard-duplicate";
        findings.push({
          severity: "ERROR",
          path: profileFilePath(config.conventionProfile!),
          line: 1,
          structural: true,
          message:
            `${kind}: class '${trackedClass.class}' blesses '${trackedClass.blessed}' but has ` +
            `${canonicalCount} matching notation shards; notation: complete requires exactly one canonical ` +
            `shard per tracked class`,
        });
      }
      const enforceable = [...new Set([...trackedClass.symbols, trackedClass.blessed])]
        .filter((token) => MACRO_TOKEN_RE.test(token))
        .sort();
      const encountered = enforceable.filter((token) => encounteredTokens.has(token));
      const skipped = [...new Set(trackedClass.symbols.filter((token) => !MACRO_TOKEN_RE.test(token)))].sort();
      classClauses.push(
        `${trackedClass.class}: registered ${canonicalCount}/1, enforceable ${enforceable.length}, ` +
        `encountered ${encountered.length}, skipped ${skipped.length} [${skipped.join(", ")}]`,
      );
    }

    const unit =
      `classes (notation ${profile.notation}; ${classClauses.join("; ")}) over ` +
      `${files} file${files === 1 ? "" : "s"}`;
    const coverage: CoverageLine[] = [
      { gate: "notation", unit, checked: registeredClasses, total: profile.tracked_classes.length },
    ];
    return { findings, coverage };
  },
};
