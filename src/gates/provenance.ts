// ROLE: Gate 4 — provenance (report/ <-> argument/lemmas/*.md). Contract:
// docs/gate-contracts.md "Gate 4 — provenance", checks 1-9 (check 10, `--build`, is opt-in,
// needs `latexmk`/subprocess, out of scope for this pure gate — no fixture requires it). Ported
// from check-provenance.py (READ-ONLY prior art, ../almost-idempotent-stochastic-maps/scripts/
// check-provenance.py) per CLAUDE.md L5: characterized, never canon. Parsing lives in the sibling
// shards provenance-parse.ts (registry + `\label{}` + join key + the rk-v18 visible-skip report),
// provenance-md.ts (PROVENANCE.md/UNWIRED.md/tab:status), provenance-checks.ts (checks 4-5, hash
// freshness + status drift — the pure-hash accessors these checks consume now live in
// snapshot.ts's fileSha256/isTracked, not a dedicated provenance-sha256.ts shard). PURITY: pure —
// no fs/network/clock.
//
// Divergence [rk-stricter-intended, provenance-11]: `provenanceStatusTableFile` is a GateConfig
// parameter (default byte-identical to AISM's hardcoded `report/sections/13_discussion.tex`,
// check-provenance.py:206) instead of a literal — see docs/gate-contracts.md Gate 4 Divergences.
//
// Check 4 (hash freshness) boundary [SETTLED — M0.3 review rk-399, was "ambiguous -> escalate"]:
// the ERROR/WARN decision needs AISM's `tracked` bit (`git ls-files`, check-provenance.py:368-404,
// 407-415) plus a byte-faithful hash. A pure gate (L3) cannot shell out to git or read raw bytes,
// so both are now measured at the edge (src/store/snapshot-load.ts) and supplied as SnapshotFacts: this
// gate CONSUMES `snapshot.sha256` (byte-faithful, correct for binary payloads) and `isTracked`,
// it never re-hashes snapshot text. Policy, per docs/gate-contracts.md Gate 4 check 4:
//   - present on disk + hash mismatch => ERROR, whether the file is git-tracked (AISM parity) OR
//     gitignored-but-present ([rk-stricter-intended], review provenance below);
//   - absent from disk (no hash measured) => WARN "not hash-verifiable", never ERROR;
//   - absolute path / malformed sha handled as before.
// The old "present in RepoSnapshot" proxy is retired: it could not see a tracked source row OUTSIDE
// the loader's include set (false WARN) and could not hash binary payloads (UTF-8 round-trip);
// both were BLOCKERs in the review (findings 1 + Check-4 ruling).
//
// CHECK 6 (anchor) IS PRESENCE-CONDITIONAL ON THE report/ ROOT [B1, docs/memos/
// 2026-07-25-generality-audit.md; extends bead rk-au6 / the 2026-07-18 residue audit's R13].
// Gate 6 was bound to the `report/` root at M1 (src/gates/shards.ts:63, fixture shards-15); Gate 4
// never was, and the 2026-07-18 audit's "Gate 4 correctly no-ops on a fresh rk repo" call was
// VACUOUS — it holds only while the registry is empty. The moment a campaign has one shard,
// checkAnchor fires per shard, demanding either a `\label{}` in `report/sections/*.tex` or a row in
// `report/UNWIRED.md`. rk's scaffold stamps NEITHER and, per templates/manifest.json:5, deliberately
// never will, so consolidation phase — the phase this tool is designed for — was unusable on a repo
// rk itself produced (PRD SC7's stated bar).
//
// WHAT THE ANCHOR CHECK MEANS WITH NO REPORT. Check 6 asks, of every registry result, a question
// ABOUT THE PAPER: "does the report cite you?" Its precondition is that a report exists. PRD §4 C6
// / IMPLEMENTATION_PLAN M2 defer LaTeX generation and make the report OPTIONAL — rk's own render
// target is HTML — so "no report/ tree" is a legitimate, common, PERMANENT campaign state, not a
// not-yet. In that state every result is "unanchored" forever, and the remedy the finding names
// (anchor it, or whitelist it in report/UNWIRED.md) is unreachable from inside the campaign: both
// require hand-creating AISM's paper skeleton. A check whose only remedy is adopting a convention
// the tool declines to stamp is coercion, not a validity check. So: `report/` ROOT absent ⇒ check 6
// emits NOTHING (neither the per-shard ERROR nor the whitelist aggregate WARN), and the coverage
// line says so out loud (`report/: absent (not adopted)` — CLAUDE.md L2, never a silent skip).
// The reciprocal is preserved exactly: `report/` present ⇒ every check runs unchanged, including
// the partial-adoption case (report/ present, sections/ or UNWIRED.md missing), which is the
// incident class this check exists to catch — root-level presence-conditionality never blurs into
// deeper-item leniency (same rule Gate 6's shards-13 fixture pins).
//
// SCOPE OF THE GUARD — deliberately check 6 ONLY, not a whole-gate early return (Gate 6's shape):
//   - checks 2, 3, 4, 9 read `report/PROVENANCE.md`, check 5 reads the configured tab:status file
//     and check 7/8 read `report/sections/*.tex` labels: with report/ absent all of those inputs
//     are empty, so those checks are vacuous BY CONSTRUCTION and need no guard. Guarding them would
//     be dead code that reads as if it suppressed something real.
//   - check 1 (forward labels) is deliberately NOT guarded. Its trigger is not the report's
//     existence but an AUTHORED claim in the shard's own `provenance:` field — a shard naming
//     `report lem:foo` has adopted the convention for itself and declared something unsatisfiable.
//     Swallowing that would be the false-green direction. Its message names the absence instead.
//   - the registry bookkeeping (coverage denominator, rk-v18's frontmatter-invalid aggregate WARN)
//     is about `argument/**`, not about report/, and stays truthful either way. A whole-gate early
//     return would have reported a pass-shaped `0/0` and dropped that WARN — a new silent skip
//     introduced while removing a false ERROR.
// `aism_behavior: differs` (fixture provenance-21) — check-provenance.py:349-365 runs the anchor
// check unconditionally; that is the residue this guard removes, a deliberate contract amendment
// on the same footing as R13/F5, not an rk-stricter/rk-bug/ambiguous triage.

import type { CoverageLine, Finding, Gate, GateResult } from "./framework";
import { dirExists, type RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";
import {
  forwardTokens,
  labelsOf,
  parseProvenanceRegistry,
  registrySkipReport,
  texLabels,
  type RegistryShard,
  type TexLabels,
} from "./provenance-parse";
import {
  parseProvenanceMd,
  parseUnwired,
  splitSourceTokens,
  statusTableRows,
  type ClaimRow,
} from "./provenance-md";
import { checkSourceHashes, checkStatusDrift } from "./provenance-checks";

const PROVENANCE_PATH = "report/PROVENANCE.md";
/** The ROOT artifact check 6's presence guard keys on — the SAME key Gate 6 uses
 * (src/gates/shards.ts's `REPORT_ROOT`), so the two gates can never disagree about whether a repo
 * has adopted the report/ convention. */
const REPORT_ROOT = "report";
const RESULT_KINDS = new Set(["thm", "lem", "prop", "cor", "op", "obs", "ex"]);
const SOURCE_ALLOW = new Set(["ORIGINAL", "OPEN", "ELEMENTARY", "EXTRACT", "PDF", "CONSENSUS", "MODEL", "V", "I", "O"]);
const KEY_TOKEN_RE = /^[A-Z0-9][A-Z0-9-]*$/;
const EXTERN_YEAR_RE = /^[A-Z]+[0-9]{3,}$/;

function pyListRepr(items: Iterable<string>): string {
  return `[${[...items].map((i) => `'${i}'`).join(", ")}]`;
}

// check 1 — forward labels (ERROR): check-provenance.py:242-248. NOT bound by the report/-root
// guard (see the file header): the trigger is the shard's OWN authored `report <label>` token, so
// the finding survives report/'s absence — only the message changes, to name the absence rather
// than blame an empty sections/ directory the campaign never created.
function checkForwardLabels(
  shards: RegistryShard[],
  tex: TexLabels,
  findings: Finding[],
  reportAdopted: boolean,
): void {
  const suffix = reportAdopted
    ? ""
    : ` (report/ is absent entirely — this shard declares a paper anchor in a campaign that has ` +
      `not adopted the report/ convention; drop the 'report <label>' token or adopt report/)`;
  for (const s of shards) {
    for (const lab of forwardTokens(s)) {
      if (!tex.labels.has(lab)) {
        findings.push({
          severity: "ERROR",
          path: s.path,
          message: `provenance names report '${lab}' but no \\label{${lab}} in sections/${suffix}`,
        });
      }
    }
  }
}

// check 2 — claim labels (ERROR): check-provenance.py:262-267.
function checkClaimLabels(claimRows: ClaimRow[], tex: TexLabels, findings: Finding[]): void {
  for (const { label } of claimRows) {
    if (!tex.labels.has(label)) {
      findings.push({
        severity: "ERROR",
        path: PROVENANCE_PATH,
        message: `PROVENANCE per-claim row '${label}' has no \\label{${label}} in sections/ (stale ledger row)`,
      });
    }
  }
}

// check 3 — claim sources (ERROR): check-provenance.py:270-280.
function checkClaimSources(
  claimRows: ClaimRow[],
  sourceRegistry: Map<string, { path: string; sha: string }>,
  findings: Finding[],
): void {
  for (const { label, sourceCell } of claimRows) {
    for (const tok of splitSourceTokens(sourceCell)) {
      if (tok.length < 2 || SOURCE_ALLOW.has(tok) || sourceRegistry.has(tok)) continue;
      if (KEY_TOKEN_RE.test(tok) && !EXTERN_YEAR_RE.test(tok)) {
        findings.push({
          severity: "ERROR",
          path: PROVENANCE_PATH,
          message: `PROVENANCE row '${label}': Source key '${tok}' not in the source registry`,
        });
      }
    }
  }
}

// check 6 — anchor (ERROR) / whitelisted-unanchored (WARN): check-provenance.py:349-365.
// The whitelisted-unanchored advisory WARNs are AGGREGATED into a single finding (ruling f,
// overturned in re-review): a per-item WARN per whitelisted shard produced 96/118/138 WARNs on
// real historical AISM trees — an unusable flood under the contract's own >25 threshold
// (docs/gate-contracts.md "Finding-flood"). This mirrors the ratified frontmatter-invalid aggregate
// (ruling b, provenance-parse.ts registrySkipReport): ONE WARN naming the count and the ids, the
// denominator unchanged. Non-whitelisted (real, actionable) unanchored shards stay per-item ERRORs.
// PRESENCE-CONDITIONAL on the `report/` ROOT (B1 — see the file header for the full reasoning):
// with no report/ tree the question this check asks ("does the paper cite you?") has no subject and
// its remedy is unreachable from inside the campaign, so it emits nothing at all. The coverage line
// states the non-adoption; it is never a silent skip.
function checkAnchor(
  shards: RegistryShard[],
  tex: TexLabels,
  whitelist: Set<string>,
  findings: Finding[],
  reportAdopted: boolean,
): void {
  if (!reportAdopted) return;
  const whitelisted: RegistryShard[] = [];
  for (const s of shards) {
    if (labelsOf(s, tex).size > 0) continue;
    if (whitelist.has(s.id)) {
      whitelisted.push(s);
    } else {
      findings.push({
        severity: "ERROR",
        path: s.path,
        message:
          `${s.id}: maps to NO report label and is NOT in report/UNWIRED.md ` +
          `(dropped from the paper, or never wired in — anchor it or whitelist it)`,
      });
    }
  }
  if (whitelisted.length > 0) {
    const sorted = [...whitelisted].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const ids = sorted.map((s) => s.id);
    findings.push({
      severity: "WARN",
      path: sorted[0]!.path,
      message:
        `${whitelisted.length} registry result(s) unanchored but whitelisted in report/UNWIRED.md ` +
        `(off paper-track): ${ids.join(", ")}`,
    });
  }
}

// check 7 — reverse labels (WARN): check-provenance.py:251-259.
function checkReverseLabels(shards: RegistryShard[], tex: TexLabels, findings: Finding[]): void {
  const linked = new Set<string>();
  for (const s of shards) for (const lab of labelsOf(s, tex)) linked.add(lab);
  for (const lab of [...tex.labels].sort()) {
    const prefix = lab.split(":")[0]!;
    if (RESULT_KINDS.has(prefix) && !linked.has(lab)) {
      findings.push({
        severity: "WARN",
        path: tex.definedIn.get(lab) ?? "report/sections",
        message: `report \\label{${lab}} has no registry result backing it (orphan statement?)`,
      });
    }
  }
}

// check 8 — coverage (WARN): check-provenance.py:283-290.
function checkCoverage(shards: RegistryShard[], claimRows: ClaimRow[], tex: TexLabels, findings: Finding[]): void {
  const claimLabels = new Set(claimRows.map((r) => r.label));
  for (const s of shards) {
    const labs = labelsOf(s, tex);
    if (labs.size > 0 && ![...labs].some((l) => claimLabels.has(l))) {
      findings.push({
        severity: "WARN",
        path: s.path,
        message: `${s.id} (report ${pyListRepr([...labs].sort())}): no per-claim PROVENANCE row`,
      });
    }
  }
}

export const provenanceGate: Gate = {
  name: "provenance",
  run(snapshot: RepoSnapshot, config: GateConfig): GateResult {
    const findings: Finding[] = [];
    const { shards, skipped } = parseProvenanceRegistry(snapshot);
    const tex = texLabels(snapshot);
    const prov = parseProvenanceMd(snapshot);
    const whitelist = parseUnwired(snapshot);
    const statusRows = statusTableRows(snapshot, config.provenanceStatusTableFile);
    // B1: the ONE report/-convention adoption bit this gate reads — the same ROOT-directory fact
    // Gate 6 keys on (src/gates/shards.ts). Measured at the edge (`dirs`), so an EMPTY report/
    // directory counts as adopted, exactly like Gate 6's partial-adoption case.
    const reportAdopted = dirExists(snapshot, REPORT_ROOT);

    checkForwardLabels(shards, tex, findings, reportAdopted);
    checkClaimLabels(prov.claimRows, tex, findings);
    checkClaimSources(prov.claimRows, prov.sourceRegistry, findings);
    checkSourceHashes(prov.sourceRows, snapshot, findings, PROVENANCE_PATH);
    checkStatusDrift(statusRows, shards, tex, findings);
    checkAnchor(shards, tex, whitelist, findings, reportAdopted);
    checkReverseLabels(shards, tex, findings);
    checkCoverage(shards, prov.claimRows, tex, findings);
    // check 9 — parse integrity (WARN): a recognized-but-unparseable data row, a duplicate source
    // key, or a malformed per-claim label — surfaced, never a silent drop (check-provenance.py:
    // 180-181,185-186,200,489).
    for (const w of prov.parseWarnings) {
      findings.push({ severity: "WARN", path: PROVENANCE_PATH, message: w });
    }

    // rk-v18 (review finding 4): a registry file this gate declined to re-parse (missing/
    // unterminated frontmatter) must not silently shrink the coverage denominator around it —
    // see provenance-parse.ts's registrySkipReport for the WARN-vs-ERROR reasoning.
    const { checked, total, warning } = registrySkipReport(shards, skipped);
    if (warning) findings.push(warning);

    const coverage: CoverageLine[] = [
      {
        gate: "provenance",
        checked,
        total,
        unit:
          `registry results, ${skipped.length} frontmatter-invalid, ${prov.claimRows.length} ` +
          `claim rows, ${statusRows.length} tab:status rows; ` +
          // B1: the report/-adoption bit is rendered on EVERY path, present or absent (Gate 6's
          // own convention, src/gates/shards.ts) — a reader can always tell whether check 6 ran.
          `report/: ${reportAdopted ? "present" : "absent (not adopted)"}`,
      },
    ];

    return { findings, coverage };
  },
};
