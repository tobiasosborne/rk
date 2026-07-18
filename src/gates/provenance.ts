// ROLE: Gate 4 — provenance (report/ <-> argument/lemmas/*.md). Contract:
// docs/gate-contracts.md "Gate 4 — provenance", checks 1-9 (check 10, `--build`, is opt-in,
// needs `latexmk`/subprocess, out of scope for this pure gate — no fixture requires it). Ported
// from check-provenance.py (READ-ONLY prior art, ../almost-idempotent-stochastic-maps/scripts/
// check-provenance.py) per CLAUDE.md L5: characterized, never canon. Parsing lives in the sibling
// shards provenance-parse.ts (registry + `\label{}` + join key), provenance-md.ts (PROVENANCE.md/
// UNWIRED.md/tab:status), provenance-sha256.ts (pure hash). PURITY: pure — no fs/network/clock.
//
// Divergence [rk-stricter-intended, provenance-11]: `provenanceStatusTableFile` is a GateConfig
// parameter (default byte-identical to AISM's hardcoded `report/sections/13_discussion.tex`,
// check-provenance.py:206) instead of a literal — see docs/gate-contracts.md Gate 4 Divergences.
//
// Divergence [ambiguous -> escalate, NOT decided here]: check 4 (hash freshness) needs AISM's
// `tracked` bit (`git ls-files`, check-provenance.py:368-404,407-415) to pick ERROR-vs-WARN on a
// present-but-stale source. A pure gate (L3) cannot shell out to git; this port treats "present in
// the RepoSnapshot" as verifiable (same proxy `defs.ts` uses for cited-shard payloads) — ERROR on
// any present+mismatched file, WARN only when absent from the snapshot. STRICTER than AISM's
// tracked-only-ERROR default (a gitignored-but-present stale file ERRORs here, WARNs there);
// CLAUDE.md L5 defaults to the stricter reading when ambiguous, and the failure direction (an
// extra ERROR, never a missed OVERCLAIM-class false-green) is the safe one — flagged for
// Fable/orchestrator, not silently asserted settled, since RepoSnapshot has no git-tracked bit
// anywhere in the M0.3 architecture and this is the first check that would want one.

import type { CoverageLine, Finding, Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";
import {
  forwardTokens,
  labelsOf,
  parseProvenanceRegistry,
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
  type SourceRow,
} from "./provenance-md";
import { sha256Hex16 } from "./provenance-sha256";

const PROVENANCE_PATH = "report/PROVENANCE.md";
const RESULT_KINDS = new Set(["thm", "lem", "prop", "cor", "op", "obs", "ex"]);
const SOURCE_ALLOW = new Set(["ORIGINAL", "OPEN", "ELEMENTARY", "EXTRACT", "PDF", "CONSENSUS", "MODEL", "V", "I", "O"]);
const KEY_TOKEN_RE = /^[A-Z0-9][A-Z0-9-]*$/;
const EXTERN_YEAR_RE = /^[A-Z]+[0-9]{3,}$/;
const SHA16_RE = /^[0-9a-f]{16}$/;

function pyListRepr(items: Iterable<string>): string {
  return `[${[...items].map((i) => `'${i}'`).join(", ")}]`;
}

// check 1 — forward labels (ERROR): check-provenance.py:242-248.
function checkForwardLabels(shards: RegistryShard[], tex: TexLabels, findings: Finding[]): void {
  for (const s of shards) {
    for (const lab of forwardTokens(s)) {
      if (!tex.labels.has(lab)) {
        findings.push({
          severity: "ERROR",
          path: s.path,
          message: `provenance names report '${lab}' but no \\label{${lab}} in sections/`,
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

// check 4 — hash freshness (ERROR/WARN): check-provenance.py:368-404. See the file-header
// Divergence note on the tracked/present proxy this pure port uses in place of `git ls-files`.
function checkSourceHashes(sourceRows: SourceRow[], snapshot: RepoSnapshot, findings: Finding[]): void {
  const unverifiable = new Set<string>();
  for (const { key, path, sha } of sourceRows) {
    if (!SHA16_RE.test(sha)) {
      findings.push({ severity: "ERROR", path: PROVENANCE_PATH, message: `source '${key}': sha '${sha}' is not 16 lowercase hex` });
      continue;
    }
    if (path.startsWith("/")) {
      findings.push({
        severity: "WARN",
        path: PROVENANCE_PATH,
        message: `source '${key}': absolute path '${path}' (not refs/-relative); hash unverifiable`,
      });
      continue;
    }
    const content = snapshot.get(path);
    if (content === undefined) {
      unverifiable.add(key);
      continue;
    }
    const actual = sha256Hex16(content);
    if (actual !== sha) {
      findings.push({
        severity: "ERROR",
        path: PROVENANCE_PATH,
        message: `source '${key}': recorded ${sha} != actual ${actual} (${path}) — file edited, hash stale`,
      });
    }
  }
  if (unverifiable.size > 0) {
    findings.push({
      severity: "WARN",
      path: PROVENANCE_PATH,
      message:
        `${unverifiable.size} source payload(s) not hash-verifiable here (untracked/absent from this ` +
        `snapshot): ${[...unverifiable].sort().join(", ")}`,
    });
  }
}

// check 5 — status OVERCLAIM (ERROR) / underclaim (WARN): check-provenance.py:293,317-321.
function checkStatusDrift(
  statusRows: { statusCell: string; labels: string[] }[],
  shards: RegistryShard[],
  tex: TexLabels,
  findings: Finding[],
): void {
  const idOfLabel = new Map<string, string>();
  for (const s of shards) for (const lab of labelsOf(s, tex)) idOfLabel.set(lab, s.id);
  const shardOf = new Map(shards.map((s) => [s.id, s]));
  const cellsOf = new Map<string, Set<string>>();
  for (const { statusCell, labels } of statusRows) {
    for (const lab of labels) {
      const rid = idOfLabel.get(lab);
      if (!rid) continue;
      if (!cellsOf.has(rid)) cellsOf.set(rid, new Set());
      cellsOf.get(rid)!.add(statusCell);
    }
  }
  for (const [rid, cells] of cellsOf) {
    const shard = shardOf.get(rid)!;
    const anyOpen = [...cells].some((c) => c === "open");
    const anyNonopen = [...cells].some((c) => c !== "open");
    if (shard.status === "open" && !anyOpen) {
      findings.push({
        severity: "ERROR",
        path: shard.path,
        message:
          `OVERCLAIM ${rid}: registry status=open but tab:status frames it ${pyListRepr([...cells].sort())} ` +
          `(never 'open') — the paper claims an open result is settled`,
      });
    }
    if ((shard.af === "validated" || shard.status === "proved") && !anyNonopen) {
      findings.push({
        severity: "WARN",
        path: shard.path,
        message: `${rid}: registry ${shard.status}/${shard.af} but tab:status frames it only 'open'`,
      });
    }
  }
}

// check 6 — anchor (ERROR) / whitelisted-unanchored (WARN): check-provenance.py:349-365.
function checkAnchor(shards: RegistryShard[], tex: TexLabels, whitelist: Set<string>, findings: Finding[]): void {
  for (const s of shards) {
    if (labelsOf(s, tex).size > 0) continue;
    if (whitelist.has(s.id)) {
      findings.push({
        severity: "WARN",
        path: s.path,
        message: `${s.id}: unanchored but whitelisted in report/UNWIRED.md (off paper-track)`,
      });
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
    const shards = parseProvenanceRegistry(snapshot);
    const tex = texLabels(snapshot);
    const prov = parseProvenanceMd(snapshot);
    const whitelist = parseUnwired(snapshot);
    const statusRows = statusTableRows(snapshot, config.provenanceStatusTableFile);

    checkForwardLabels(shards, tex, findings);
    checkClaimLabels(prov.claimRows, tex, findings);
    checkClaimSources(prov.claimRows, prov.sourceRegistry, findings);
    checkSourceHashes(prov.sourceRows, snapshot, findings);
    checkStatusDrift(statusRows, shards, tex, findings);
    checkAnchor(shards, tex, whitelist, findings);
    checkReverseLabels(shards, tex, findings);
    checkCoverage(shards, prov.claimRows, tex, findings);
    // check 9 — parse integrity (WARN): a recognized-but-unparseable data row, a duplicate source
    // key, or a malformed per-claim label — surfaced, never a silent drop (check-provenance.py:
    // 180-181,185-186,200,489).
    for (const w of prov.parseWarnings) {
      findings.push({ severity: "WARN", path: PROVENANCE_PATH, message: w });
    }

    const n = shards.length;
    const coverage: CoverageLine[] = [
      {
        gate: "provenance",
        checked: n,
        total: n,
        unit: `registry results, ${prov.claimRows.length} claim rows, ${statusRows.length} tab:status rows`,
      },
    ];

    return { findings, coverage };
  },
};
