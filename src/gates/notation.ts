// ROLE: Gate 9 — notation (rk-5lzf, Tier A, LB5). A LEXICAL check: every tracked macro token that
// appears in a scanned artifact must be a registered `symbol:` of a notation shard in one of the
// classes that track it. Contract: docs/gate-contracts.md "Gate 9 — notation".
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
// QUOTED SOURCE TEXT IS EXEMPT. A translation row in a notation shard, its quote anchor, and any
// standalone `"<quote>"` line in an argument shard are the SOURCE's notation, verbatim — recording
// a foreign convention is the register's whole job, and flagging it would make the register
// impossible to write. Everything else in a shard body is campaign prose and is scanned.

import type { CoverageLine, Finding, Gate, GateResult } from "./framework";
import type { GateConfig } from "./config";
import { baseName, listFilesRecursive, type RepoSnapshot } from "./snapshot";
import { enforceableSymbolIndex, unenforceableSymbols, validateConventionProfile } from "./profile";
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

interface Occurrence {
  path: string;
  line: number;
  token: string;
  /** Extra locator for a record field (`statement_blessed`), empty for a shard body. */
  where: string;
}

/** True iff this line is quoted SOURCE text rather than campaign prose: a translation row, or a
 * standalone `"<quote>"` anchor (the second line of an `rk refs quote` pair, wherever it appears). */
function isQuotedSource(trimmed: string): boolean {
  if (ROW_LINE_RE.test(trimmed)) return true;
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"');
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

function scanLine(path: string, line: number, text: string, where: string, out: Occurrence[]): void {
  const trimmed = text.trim();
  if (isQuotedSource(trimmed)) return;
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
      for (const { line, text } of bodyLines(snapshot.get(path)!)) {
        scanLine(path, line, text, "", occurrences);
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
              ? `(profile "${config.conventionProfile}" unusable, nothing enforced)`
              : "(no profile configured)",
            checked: 0,
            total: 0,
          },
        ],
      };
    }

    const tracked = enforceableSymbolIndex(profile);
    const unenforceable = unenforceableSymbols(profile);
    const registered = new Map<string, Set<string>>(); // symbol -> classes it is registered in
    for (const shard of parseNotationShards(snapshot)) {
      if (shard.symbol === undefined || shard.className === undefined) continue;
      const set = registered.get(shard.symbol);
      if (set) set.add(shard.className);
      else registered.set(shard.symbol, new Set([shard.className]));
    }

    const { occurrences, files, findings } = collectOccurrences(snapshot);
    const seen = new Set<string>();
    const reported = new Set<string>();
    let ok = 0;

    for (const occ of occurrences) {
      const classes = tracked.get(occ.token);
      if (classes === undefined) continue; // not tracked by this profile: out of scope, never an error
      const isRegistered = [...(registered.get(occ.token) ?? [])].some((c) => classes.includes(c));
      if (!seen.has(occ.token)) {
        seen.add(occ.token);
        if (isRegistered) ok++;
      }
      if (isRegistered) continue;
      const key = `${occ.path}\u0000${occ.token}`;
      if (reported.has(key)) continue; // one finding per (file, symbol) — ten usages are one defect
      reported.add(key);
      const where = occ.where ? ` in ${occ.where}` : "";
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
          `unregistered-symbol: '${occ.token}'${where} is a tracked symbol of class${classes.length === 1 ? "" : "es"} ` +
          `${classes.map((c) => `'${c}'`).join(", ")} in the convention profile, but ${detail} — ` +
          `add a definitions/**/*.md shard with shard_type: notation, symbol: ${occ.token}, and a matching class:`,
      });
    }

    const unit =
      `symbols in ${profile.tracked_classes.length} class${profile.tracked_classes.length === 1 ? "" : "es"} ` +
      `over ${files} file${files === 1 ? "" : "s"}` +
      (unenforceable.length > 0
        ? `, ${unenforceable.length} tracked token${unenforceable.length === 1 ? "" : "s"} not lexically enforceable ` +
          `(${unenforceable.slice(0, 5).join(", ")}${unenforceable.length > 5 ? ", ..." : ""})`
        : "");
    const coverage: CoverageLine[] = [{ gate: "notation", unit, checked: ok, total: seen.size }];
    return { findings, coverage };
  },
};
