// ROLE: Gate 6 — report-shards (report/main.tex + report/sections/*.tex). Contract:
// docs/gate-contracts.md "Gate 6 — report-shards", ported from
// ../almost-idempotent-stochastic-maps/scripts/check-report-shards.sh (cited per check below;
// AISM is prior art, this contract is normative — CLAUDE.md L5).
// PURITY: pure — no fs/network/clock (L3).
//
// KNOWN GAP (documented, not silently picked): check-report-shards.sh:23 also requires
// `report/sections/` itself to exist as a directory. RepoSnapshot (src/gates/snapshot.ts) has no
// empty-directory index by design ("no gate needs a meaningfully-empty directory" — snapshot.ts
// doc comment); an empty `report/sections/` (the golden empty-scaffold fixture, shards-11, has
// exactly this on disk) is therefore indistinguishable from an absent one. This check is a no-op
// here — never emitted — rather than breaking shards-11. Flagged for the orchestrator/Fable
// review, not resolved unilaterally.
//
// KNOWN DIVERGENCE (stricter, by L5 default): check-report-shards.sh:33-36 exits 0 on the
// empty-scaffold exemption UNCONDITIONALLY, even if MASTER/README/CATALOG existence checks
// (lines 22-25) already set `failures=1` — a literal reading of the script would silently
// green-light a scaffold missing its own README/CATALOG as long as no shards exist yet. No
// fixture exercises this combination; rk's port does NOT suppress existence errors on an
// empty-scaffold tree (existence findings always surface), per L5's "default to the stricter
// validity semantics" when the contract text and the script's literal control flow disagree.

import type { Gate, GateResult, Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { hasPath } from "./snapshot";
import type { GateConfig } from "./config";

const MASTER = "report/main.tex";
const SECTIONS_DIR = "report/sections";
const README = "report/README.md";
const CATALOG = "report/SHARD_CATALOG.md";

function mkErr(path: string, line: number, message: string): Finding {
  return { severity: "ERROR", path, line, message };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

interface HeaderHit {
  value: string;
  line: number;
}

/** `sed 's/^% KEY:[[:space:]]*(.+)$/\1/p' | head -n 1` equivalent — first-wins per
 * docs/gate-contracts.md Gate 6 Inputs table ("a duplicate line within the same file is not an
 * error"). */
function firstHeader(content: string, key: string): HeaderHit | undefined {
  const re = new RegExp(`^% ${key}:\\s*(.+)$`);
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]!);
    if (m) return { value: m[1]!, line: i + 1 };
  }
  return undefined;
}

/** `mapfile` equivalent — every matching line, in order (SHARD-SUMMARY's cardinality IS checked,
 * unlike the other three headers — see Gate 6 Inputs table). */
function allHeaders(content: string, key: string): string[] {
  const re = new RegExp(`^% ${key}:\\s*(.+)$`);
  return content
    .split("\n")
    .map((line) => re.exec(line)?.[1])
    .filter((v): v is string => v !== undefined);
}

/** Every `\include{...}` target on a non-comment line of `content`, in order (check-report-
 * shards.sh:28-30). A comment line (leading `%`, after trimming) is excluded entirely. */
function parseIncludes(content: string): Array<{ target: string; line: number }> {
  const out: Array<{ target: string; line: number }> = [];
  const re = /\\include\{([^}]+)\}/g;
  content.split("\n").forEach((line, idx) => {
    if (/^\s*%/.test(line)) return;
    let m: RegExpExecArray | null;
    let last: RegExpExecArray | null = null;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) last = m;
    if (last) out.push({ target: last[1]!, line: idx + 1 });
  });
  return out;
}

function run(snapshot: RepoSnapshot, config: GateConfig): GateResult {
  const findings: Finding[] = [];

  // Check 1 (check-report-shards.sh:22-25) — SECTIONS_DIR is a known no-op, see file header.
  if (!hasPath(snapshot, MASTER)) findings.push(mkErr(MASTER, 1, `missing master ${MASTER}`));
  if (!hasPath(snapshot, README)) findings.push(mkErr(README, 1, `missing report map ${README}`));
  if (!hasPath(snapshot, CATALOG)) findings.push(mkErr(CATALOG, 1, `missing shard catalog ${CATALOG}`));

  const masterContent = snapshot.get(MASTER) ?? "";
  const includes = parseIncludes(masterContent);
  const shardFiles = [...snapshot.keys()].filter((p) => p.startsWith(`${SECTIONS_DIR}/`) && p.endsWith(".tex")).sort();

  // Check 2 — empty-scaffold exemption (check-report-shards.sh:31-36).
  if (includes.length === 0 && shardFiles.length === 0) {
    return { findings, coverage: [{ gate: "shards", unit: "shard(s) included, labeled, cataloged", checked: 0, total: 0 }] };
  }

  // Check 3 (check-report-shards.sh:37-39).
  if (includes.length === 0) {
    findings.push(mkErr(MASTER, 1, `${MASTER} has no \\include statements but ${SECTIONS_DIR} has ${shardFiles.length} shard(s)`));
  }

  const idFormatRe = new RegExp(`^${escapeRegExp(config.shardsPrefix)}-[0-9]{2}[A-Z]?-[A-Z0-9-]+$`);
  const seenFiles = new Set<string>();
  const seenIds = new Set<string>();
  const readmeContent = snapshot.get(README) ?? "";
  const catalogContent = snapshot.get(CATALOG) ?? "";

  for (const { target, line } of includes) {
    // Check 4 (check-report-shards.sh:45-48).
    if (!target.startsWith("sections/")) {
      findings.push(mkErr(MASTER, line, `\\include{${target}} should point under sections/ (relative to report/)`));
      continue;
    }
    const file = `${SECTIONS_DIR}/${target.slice("sections/".length)}.tex`;

    // Check 5 (check-report-shards.sh:50) — duplicate include, attributed to the shard file
    // itself (script-verified, shards-06: not a master-purity finding).
    if (seenFiles.has(file)) findings.push(mkErr(file, 1, `${file} is included more than once`));
    seenFiles.add(file);

    // Check 6 (check-report-shards.sh:52).
    if (!hasPath(snapshot, file)) {
      findings.push(mkErr(MASTER, line, `\\include{${target}} points to missing ${file}`));
      continue;
    }

    const content = snapshot.get(file)!;
    // Check 7 — wc -l semantics: count of '\n' bytes, not split().length (check-report-shards.sh:54-57).
    const lineCount = (content.match(/\n/g) ?? []).length;
    if (lineCount > config.shardsMaxLines) {
      findings.push(mkErr(file, 1, `${file} has ${lineCount} lines; target is about 200 and hard guard is ${config.shardsMaxLines}`));
    }
    // Check 8 (check-report-shards.sh:58-59).
    if (!readmeContent.includes(`\`${file}\``)) findings.push(mkErr(README, 1, `${README} does not list ${file}`));

    const idHit = firstHeader(content, "SHARD-ID");
    const titleHit = firstHeader(content, "SHARD-TITLE");
    const keywordsHit = firstHeader(content, "SHARD-KEYWORDS");
    const summaries = allHeaders(content, "SHARD-SUMMARY");

    // Checks 9-12 — elif chain (check-report-shards.sh:67-78): missing / invalid / duplicate /
    // prefix-mismatch are mutually exclusive per shard (shards-02: duplicate wins over the
    // prefix-mismatch that would otherwise also apply to the second shard).
    if (!idHit) {
      findings.push(mkErr(file, 1, `${file} is missing SHARD-ID header`));
    } else if (!idFormatRe.test(idHit.value)) {
      findings.push(mkErr(file, idHit.line, `${file} has invalid SHARD-ID '${idHit.value}'`));
    } else if (seenIds.has(idHit.value)) {
      findings.push(mkErr(file, idHit.line, `duplicate SHARD-ID ${idHit.value}`));
    } else {
      seenIds.add(idHit.value);
      const filePrefix = file.split("/").pop()!.slice(0, 2);
      const expectedPrefix = `${config.shardsPrefix}-${filePrefix}-`;
      if (!idHit.value.startsWith(expectedPrefix)) {
        findings.push(mkErr(file, idHit.line, `${file} has SHARD-ID ${idHit.value}, expected prefix ${expectedPrefix}`));
      }
    }

    // Checks 13-15 (check-report-shards.sh:81-84).
    if (!titleHit) findings.push(mkErr(file, 1, `${file} is missing SHARD-TITLE header`));
    if (!keywordsHit) findings.push(mkErr(file, 1, `${file} is missing SHARD-KEYWORDS header`));
    if (summaries.length < 2 || summaries.length > 3) {
      findings.push(mkErr(file, 1, `${file} must have 2-3 SHARD-SUMMARY lines; found ${summaries.length}`));
    }

    const id = idHit?.value;
    const title = titleHit?.value;
    const keywords = keywordsHit?.value;

    // Check 16 (check-report-shards.sh:87-88).
    if (id && !readmeContent.includes(`\`${id}\``)) {
      findings.push(mkErr(README, 1, `${README} does not list shard label ${id}`));
    }
    // Check 17 (check-report-shards.sh:90-95).
    for (const value of [id, file, title, keywords]) {
      if (value && !catalogContent.includes(value)) {
        findings.push(mkErr(CATALOG, 1, `${CATALOG} does not list '${value}' from ${file}`));
      }
    }
    // Check 18 (check-report-shards.sh:96-99).
    for (const summary of summaries) {
      if (!catalogContent.includes(summary)) {
        findings.push(mkErr(CATALOG, 1, `${CATALOG} does not mirror summary from ${file}: ${summary}`));
      }
    }
  }

  // Check 19 — orphan scan (check-report-shards.sh:104-109).
  for (const file of shardFiles) {
    if (!seenFiles.has(file)) findings.push(mkErr(file, 1, `${file} exists but is not included by ${MASTER}`));
  }

  // Check 20 — master purity (check-report-shards.sh:111-115).
  const bodyRe = /^\s*\\(section|subsection|subsubsection|paragraph)\{/;
  masterContent.split("\n").forEach((line, idx) => {
    if (bodyRe.test(line)) {
      findings.push(mkErr(MASTER, idx + 1, `${MASTER} contains body sectioning commands; move prose to report/sections/`));
    }
  });

  const shardIdentities = new Set<string>([...seenFiles, ...shardFiles]);
  const checked = [...shardIdentities].filter(
    (id) => !findings.some((f) => f.severity === "ERROR" && f.path === id),
  ).length;

  return {
    findings,
    coverage: [
      { gate: "shards", unit: "shard(s) included, labeled, cataloged", checked, total: shardIdentities.size },
    ],
  };
}

export const shardsGate: Gate = { name: "shards", run };
