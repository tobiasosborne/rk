// ROLE: Gate 6 — report-shards (report/main.tex + report/sections/*.tex). Contract:
// docs/gate-contracts.md "Gate 6 — report-shards", ported from
// ../almost-idempotent-stochastic-maps/scripts/check-report-shards.sh (cited per check below;
// AISM is prior art, this contract is normative — CLAUDE.md L5).
// PURITY: pure — no fs/network/clock (L3).
//
// RESOLVED (rk-399 review finding 2): check-report-shards.sh:23 also requires `report/sections/`
// itself to exist as a directory. RepoSnapshot now carries a `dirs` SnapshotFact (directory
// existence, empty ones included — src/gates/snapshot.ts), so Check 1 below enforces this via
// `dirExists`: an empty `report/sections/` (the golden empty-scaffold fixture shards-11) is
// distinguished from an absent one. The empty-directory fixture convention (a `.gitkeep`, excluded
// from shard content) lets shards-11 keep an on-disk `report/sections/` across a git clone —
// see corpus/README.md "empty-directory fixtures".
//
// KNOWN DIVERGENCE (stricter, by L5 default): check-report-shards.sh:33-36 exits 0 on the
// empty-scaffold exemption UNCONDITIONALLY, even if MASTER/README/CATALOG existence checks
// (lines 22-25) already set `failures=1` — a literal reading of the script would silently
// green-light a scaffold missing its own README/CATALOG as long as no shards exist yet. No
// fixture exercises this combination; rk's port does NOT suppress existence errors on an
// empty-scaffold tree (existence findings always surface), per L5's "default to the stricter
// validity semantics" when the contract text and the script's literal control flow disagree.
//
// PRESENCE-CONDITIONAL ON report/ ITSELF (M1, bead rk-au6; docs/memos/2026-07-18-aism-residue-
// audit.md R13). The report/ LaTeX-paper layout this whole gate scans is NOT in rk's scaffold
// (PRD.md:79-85) — rk's render target is HTML (M2.4), and M2.6's regenerate-and-diff supersedes
// this hand-maintained mirror gate entirely. A general research tool must not force every repo
// to hand-create AISM's report/ skeleton just to enter consolidation: every check in this file is
// now bound ONLY when the `report/` ROOT directory exists on disk. Absence is not a violation —
// it means the report/ convention has not been adopted yet — and is surfaced via the coverage
// line's "report/: absent (not adopted)" note (CLAUDE.md L2: never a silent skip), never a
// finding. This keys on the ROOT artifact only: `report/` existing with any deeper item missing
// (main.tex, sections/, README.md, SHARD_CATALOG.md) still ERRORs exactly as before — that
// partial-adoption case is the exact incident class this gate exists to catch (shards-13, the
// existing shards-01..12/14 fixtures). `aism_behavior: differs` — check-report-shards.sh:22-25
// requires MASTER/SECTIONS_DIR/README/CATALOG unconditionally, with no equivalent of a
// report/-absent no-op; that behavior is the AISM residue this bead removes, not a stricter
// baseline to preserve, so it is not triaged into the rk-stricter-intended / rk-bug / ambiguous
// triad — a deliberate contract amendment, same footing as F5's reversal. Fixture: shards-15.

import type { Gate, GateResult, Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { hasPath, dirExists } from "./snapshot";
import type { GateConfig } from "./config";
import { DEFAULT_GATE_CONFIG } from "./config";
import { escapeRegExp, firstHeader, allHeaders, parseIncludes } from "./shards-parse";

const MASTER = "report/main.tex";
const SECTIONS_DIR = "report/sections";
const README = "report/README.md";
const CATALOG = "report/SHARD_CATALOG.md";
const REPORT_ROOT = "report";
// R13 (bead rk-au6): base coverage unit text, always suffixed with the report/-root adoption
// status ("present" or "absent (not adopted)") — visible on every code path, never a silent skip.
const SHARDS_UNIT = "shard(s) fully conforming (included, labeled, cataloged)";

function mkErr(path: string, line: number, message: string): Finding {
  return { severity: "ERROR", path, line, message };
}

function run(snapshot: RepoSnapshot, config: GateConfig): GateResult {
  // R13 (bead rk-au6): the report/ ROOT directory gates every check in this file. Its absence is
  // "convention not adopted", not a violation — see the header comment above.
  if (!dirExists(snapshot, REPORT_ROOT)) {
    return {
      findings: [],
      coverage: [{ gate: "shards", unit: `${SHARDS_UNIT}; report/: absent (not adopted)`, checked: 0, total: 0 }],
    };
  }

  const findings: Finding[] = [];

  // Check 1 (check-report-shards.sh:22-25). SECTIONS_DIR existence is now enforced via the `dirs`
  // fact (rk-399 finding 2) — surfaced before the empty-scaffold exemption so an absent sections/
  // directory never green-lights as a clean empty scaffold.
  if (!hasPath(snapshot, MASTER)) findings.push(mkErr(MASTER, 1, `missing master ${MASTER}`));
  if (!dirExists(snapshot, SECTIONS_DIR)) findings.push(mkErr(SECTIONS_DIR, 1, `missing sections directory ${SECTIONS_DIR}/`));
  if (!hasPath(snapshot, README)) findings.push(mkErr(README, 1, `missing report map ${README}`));
  if (!hasPath(snapshot, CATALOG)) findings.push(mkErr(CATALOG, 1, `missing shard catalog ${CATALOG}`));

  const masterContent = snapshot.get(MASTER) ?? "";
  const includes = parseIncludes(masterContent);
  const shardFiles = [...snapshot.keys()].filter((p) => p.startsWith(`${SECTIONS_DIR}/`) && p.endsWith(".tex")).sort();

  // Check 2 — empty-scaffold exemption (check-report-shards.sh:31-36).
  if (includes.length === 0 && shardFiles.length === 0) {
    return {
      findings,
      coverage: [{ gate: "shards", unit: `${SHARDS_UNIT}; report/: present`, checked: 0, total: 0 }],
    };
  }

  // Check 3 (check-report-shards.sh:37-39).
  if (includes.length === 0) {
    findings.push(mkErr(MASTER, 1, `${MASTER} has no \\include statements but ${SECTIONS_DIR} has ${shardFiles.length} shard(s)`));
  }

  // R12 (bead rk-psm): shardsPrefix has NO default (src/gates/config.ts) — required-when-consumed.
  // idFormatRe is built only when a prefix is actually configured; the first shard that needs
  // SHARD-ID format/prefix validation without one gets ONE loud, counted config-missing ERROR
  // (below) instead of silently adopting AISM's own campaign name or crashing.
  const prefixConfigured = typeof config.shardsPrefix === "string" && config.shardsPrefix.length > 0;
  const idFormatRe = prefixConfigured
    ? new RegExp(`^${escapeRegExp(config.shardsPrefix!)}-[0-9]{2}[A-Z]?-[A-Z0-9-]+$`)
    : undefined;
  let shardsPrefixErrorEmitted = false;

  // rk-xbm (M1 review B1): defense-in-depth against a malformed `config.shardsMaxLines` reaching
  // Check 7's `>` comparison below. `.rk/config.json`'s untyped JSON used to be cast straight to
  // `Partial<GateConfig>` with no runtime check (src/store/config-load.ts, fixed by this same
  // bead) -- `shardsMaxLines: "garbage"` made `lineCount > config.shardsMaxLines` a string/number
  // comparison that is ALWAYS false (JS coerces the string to NaN; every comparison against NaN
  // is false), so an over-length shard silently passed -- a false-green on the per-shard line-cap
  // check, the exact incident this bead names. `src/gates/config.ts`'s `validateConfigOverrides`
  // now sanitizes this at the `.rk/config.json`-loading edge, so a caller going through
  // `loadGateConfig` never hands this gate a malformed value at all; this check is redundant
  // defense for any caller that constructs a `GateConfig` directly (tests, corpus fixtures). A
  // malformed value here gets ONE loud, counted config ERROR (mirroring the `shardsPrefix`
  // config-missing pattern immediately above) and the check itself still runs, against the
  // strict default, rather than silently skipping the line-cap check for the whole repo.
  const shardsMaxLinesValid =
    typeof config.shardsMaxLines === "number" && Number.isFinite(config.shardsMaxLines) && config.shardsMaxLines > 0;
  const effectiveMaxLines = shardsMaxLinesValid ? config.shardsMaxLines : DEFAULT_GATE_CONFIG.shardsMaxLines;
  let shardsMaxLinesErrorEmitted = false;
  const seenFiles = new Set<string>();
  const seenIds = new Set<string>();
  const readmeContent = snapshot.get(README) ?? "";
  const catalogContent = snapshot.get(CATALOG) ?? "";
  // rk-1tt (review finding 5): coverage numerator means FULLY CONFORMING — included, labeled, AND
  // cataloged — so every shard with ANY finding against it must be excluded, even when that
  // finding's own `path` is a cross-file document (README/CATALOG/MASTER) rather than the shard
  // file itself. Tracked directly at each check site below instead of reverse-matching
  // finding.path afterward, which missed cross-file findings entirely (shards-08/09: a CATALOG/
  // README finding never matched `f.path === file`) and even missed a wholly nonexistent shard
  // (check 6's ERROR names MASTER, not the missing file).
  const nonConforming = new Set<string>();
  // Identities named by an \include whose target is NOT under sections/ (review N3): they can never
  // resolve to a `sections/X.tex` path, so they never enter `seenFiles`, but the contract counts
  // every identity an \include names in the denominator. Each is itself a non-conforming identity.
  const invalidIncludes = new Set<string>();

  for (const { target, line } of includes) {
    // Check 4 (check-report-shards.sh:45-48).
    if (!target.startsWith("sections/")) {
      findings.push(mkErr(MASTER, line, `\\include{${target}} should point under sections/ (relative to report/)`));
      invalidIncludes.add(target);
      nonConforming.add(target);
      continue;
    }
    const file = `${SECTIONS_DIR}/${target.slice("sections/".length)}.tex`;

    // Check 5 (check-report-shards.sh:50) — duplicate include, attributed to the shard file
    // itself (script-verified, shards-06: not a master-purity finding).
    if (seenFiles.has(file)) {
      findings.push(mkErr(file, 1, `${file} is included more than once`));
      nonConforming.add(file);
    }
    seenFiles.add(file);

    // Check 6 (check-report-shards.sh:52). The ERROR is attributed to MASTER (the offending
    // \include line), but the nonexistent file is unambiguously not "included, labeled, cataloged"
    // — mark it non-conforming here, not by later matching finding.path against `file`.
    if (!hasPath(snapshot, file)) {
      findings.push(mkErr(MASTER, line, `\\include{${target}} points to missing ${file}`));
      nonConforming.add(file);
      continue;
    }

    const content = snapshot.get(file)!;
    // Check 7 — wc -l semantics: count of '\n' bytes, not split().length (check-report-shards.sh:54-57).
    const lineCount = (content.match(/\n/g) ?? []).length;
    if (!shardsMaxLinesValid && !shardsMaxLinesErrorEmitted) {
      findings.push(
        mkErr(
          ".rk/config.json",
          1,
          `shardsMaxLines is not a positive number (got ${JSON.stringify(config.shardsMaxLines)}) -- ` +
            `set "shardsMaxLines" to a positive integer in .rk/config.json (docs/gate-contracts.md ` +
            `Gate 6); using the strict default ${DEFAULT_GATE_CONFIG.shardsMaxLines} for this run's ` +
            `line-count check rather than silently passing every shard (rk-xbm)`,
        ),
      );
      shardsMaxLinesErrorEmitted = true;
    }
    if (lineCount > effectiveMaxLines) {
      findings.push(mkErr(file, 1, `${file} has ${lineCount} lines; target is about 200 and hard guard is ${effectiveMaxLines}`));
      nonConforming.add(file);
    }
    // Check 8 (check-report-shards.sh:58-59) — cross-file finding, attributed to README.
    if (!readmeContent.includes(`\`${file}\``)) {
      findings.push(mkErr(README, 1, `${README} does not list ${file}`));
      nonConforming.add(file);
    }

    const idHit = firstHeader(content, "SHARD-ID");
    const titleHit = firstHeader(content, "SHARD-TITLE");
    const keywordsHit = firstHeader(content, "SHARD-KEYWORDS");
    const summaries = allHeaders(content, "SHARD-SUMMARY");

    // Checks 9-12 — elif chain (check-report-shards.sh:67-78): missing / invalid / duplicate /
    // prefix-mismatch are mutually exclusive per shard (shards-02: duplicate wins over the
    // prefix-mismatch that would otherwise also apply to the second shard).
    if (!idHit) {
      findings.push(mkErr(file, 1, `${file} is missing SHARD-ID header`));
      nonConforming.add(file);
    } else if (!prefixConfigured) {
      // R12: config-missing is a repo-level condition, not a per-shard one — emit it ONCE (loud,
      // visible, counted per L2 — never a silent skip), not once per shard that would trigger it.
      if (!shardsPrefixErrorEmitted) {
        findings.push(
          mkErr(
            ".rk/config.json",
            1,
            "shardsPrefix is not configured (required to validate SHARD-ID headers, e.g. 'PROJ-01-INTRO') " +
              "-- set \"shardsPrefix\" in .rk/config.json (docs/gate-contracts.md Gate 6)",
          ),
        );
        shardsPrefixErrorEmitted = true;
      }
      nonConforming.add(file);
    } else if (!idFormatRe!.test(idHit.value)) {
      findings.push(mkErr(file, idHit.line, `${file} has invalid SHARD-ID '${idHit.value}'`));
      nonConforming.add(file);
    } else if (seenIds.has(idHit.value)) {
      findings.push(mkErr(file, idHit.line, `duplicate SHARD-ID ${idHit.value}`));
      nonConforming.add(file);
    } else {
      seenIds.add(idHit.value);
      const filePrefix = file.split("/").pop()!.slice(0, 2);
      const expectedPrefix = `${config.shardsPrefix}-${filePrefix}-`;
      if (!idHit.value.startsWith(expectedPrefix)) {
        findings.push(mkErr(file, idHit.line, `${file} has SHARD-ID ${idHit.value}, expected prefix ${expectedPrefix}`));
        nonConforming.add(file);
      }
    }

    // Checks 13-15 (check-report-shards.sh:81-84).
    if (!titleHit) {
      findings.push(mkErr(file, 1, `${file} is missing SHARD-TITLE header`));
      nonConforming.add(file);
    }
    if (!keywordsHit) {
      findings.push(mkErr(file, 1, `${file} is missing SHARD-KEYWORDS header`));
      nonConforming.add(file);
    }
    if (summaries.length < 2 || summaries.length > 3) {
      findings.push(mkErr(file, 1, `${file} must have 2-3 SHARD-SUMMARY lines; found ${summaries.length}`));
      nonConforming.add(file);
    }

    const id = idHit?.value;
    const title = titleHit?.value;
    const keywords = keywordsHit?.value;

    // Check 16 (check-report-shards.sh:87-88) — cross-file finding, attributed to README.
    if (id && !readmeContent.includes(`\`${id}\``)) {
      findings.push(mkErr(README, 1, `${README} does not list shard label ${id}`));
      nonConforming.add(file);
    }
    // Check 17 (check-report-shards.sh:90-95) — cross-file finding, attributed to CATALOG.
    for (const value of [id, file, title, keywords]) {
      if (value && !catalogContent.includes(value)) {
        findings.push(mkErr(CATALOG, 1, `${CATALOG} does not list '${value}' from ${file}`));
        nonConforming.add(file);
      }
    }
    // Check 18 (check-report-shards.sh:96-99) — cross-file finding, attributed to CATALOG.
    for (const summary of summaries) {
      if (!catalogContent.includes(summary)) {
        findings.push(mkErr(CATALOG, 1, `${CATALOG} does not mirror summary from ${file}: ${summary}`));
        nonConforming.add(file);
      }
    }
  }

  // Check 19 — orphan scan (check-report-shards.sh:104-109).
  for (const file of shardFiles) {
    if (!seenFiles.has(file)) {
      findings.push(mkErr(file, 1, `${file} exists but is not included by ${MASTER}`));
      nonConforming.add(file);
    }
  }

  // Check 20 — master purity (check-report-shards.sh:111-115).
  const bodyRe = /^\s*\\(section|subsection|subsubsection|paragraph)\{/;
  masterContent.split("\n").forEach((line, idx) => {
    if (bodyRe.test(line)) {
      findings.push(mkErr(MASTER, idx + 1, `${MASTER} contains body sectioning commands; move prose to report/sections/`));
    }
  });

  // `checked` = fully conforming (zero findings against it, from ANY check above, regardless of
  // which file that check attributed its finding to — rk-1tt); `total` = every shard identity this
  // run examined (named by an \include — INCLUDING one whose target lies outside sections/, itself
  // non-conforming, review N3 — or physically present under sections/). The unit string says
  // exactly that: "fully conforming", not merely "examined" (review finding 5).
  const shardIdentities = new Set<string>([...seenFiles, ...shardFiles, ...invalidIncludes]);
  const checked = [...shardIdentities].filter((id) => !nonConforming.has(id)).length;

  return {
    findings,
    coverage: [
      {
        gate: "shards",
        unit: `${SHARDS_UNIT}; report/: present`,
        checked,
        total: shardIdentities.size,
      },
    ],
  };
}

export const shardsGate: Gate = { name: "shards", run };
