// ROLE: Gate 5 — runs (runs/<YYYY-MM-DD>-<slug>/). Contract: docs/gate-contracts.md
// "Gate 5 — runs" (checks 1-6). Ported, unchanged in logic, from check-runs.py
// (../almost-idempotent-stochastic-maps/scripts/check-runs.py — characterized prior art, not
// canon per CLAUDE.md L5; docs/gate-contracts.md records ONE behavioral divergence for this gate,
// check 6's sanctioned-infrastructure allowance (rk-z93m, see SANCTIONED_RUNS_INFRASTRUCTURE
// below), plus the standard [message-only] finding-format change and the mandatory day-1 coverage
// line). Keeps "numerical evidence honestly quarantined below the rigour ladder" (check-runs.py:
// 5-7): every run bundle needs a re-run command, a checkable invariant, and an INDEX.md row.
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult, Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { listDir, hasPath, hasPrefix, childDirs, dirExists } from "./snapshot";
import type { GateConfig } from "./config";

/** Bundle dirname grammar (check-runs.py:30, docs/gate-contracts.md Gate 5 Inputs). */
const BUNDLE_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;

/** README must evidence each of these, case-insensitive substring (check-runs.py:32; Gate 5
 * Inputs). Order fixed so a multi-field-missing finding lists them in one stable order. */
const REQUIRED_FIELDS = ["hypothesis", "command", "finding", "next"] as const;

/** At least ONE of these must appear, case-insensitive substring — the checkable-invariant
 * requirement (check-runs.py:34-35; Gate 5 Inputs). "A number without an invariant is not a
 * finding." */
const INVARIANT_MARKERS = [
  "invariant",
  "certificate",
  "known value",
  "known-value",
  "independent",
  "cross-check",
  "cross check",
  "residual",
  "tolerance",
];

/** runs/README.md is the schema doc itself, not a bundle (check-runs.py:36, SKIP). */
const SKIP_TOP_LEVEL = new Set(["README.md"]);

/** DECLARED INFRASTRUCTURE (rk-z93m, a deliberate divergence from check-runs.py:46-50 — see
 * docs/gate-contracts.md Gate 5 "Divergences from AISM"). The stamped constitution's § 4b I.3
 * REQUIRES a single sanctioned, ledgered probe-execution channel, and `rk init` stamps it at
 * exactly these `runs/` top-level names (templates/manifest.json's `runs/probe-channel.sh`, which
 * owns and appends to `runs/probe-ledger.jsonl`). Both are FILES living beside the bundle
 * DIRECTORIES the channel writes, so check 6's bundles-are-dirs rule WARNed on the template's own
 * mandatory artifact — found live by campaign D.
 *
 * The allowance is deliberately the narrowest thing that fixes that: an EXACT-NAME match on these
 * two entries at the `runs/` top level only. No prefix, no extension family, no subdirectory, no
 * config-supplied additions — `probe-channel.sh.bak`, `probe-ledger-2.jsonl`, and every other
 * stray file WARN exactly as they did before. Sanctioning is never silent: whichever of these
 * names is actually present is named in the coverage line (CLAUDE.md L2).
 *
 * Order fixed (channel, then ledger) so the coverage line's text is stable.
 * `test/templates/templates.test.ts` binds this list to the manifest: a stamped file directly
 * under `runs/` that is NOT in this set fails there, so the gate and the scaffold cannot drift. */
export const SANCTIONED_RUNS_INFRASTRUCTURE = ["probe-channel.sh", "probe-ledger.jsonl"] as const;
const SANCTIONED_SET = new Set<string>(SANCTIONED_RUNS_INFRASTRUCTURE);

const RUNS_DIR = "runs";
/** Repo-root INDEX.md, NOT runs/INDEX.md (check-runs.py:28, `ROOT / "INDEX.md"`) — review
 * finding F9: this gate's reverse-lookup source lives at the repo root. */
const INDEX_PATH = "INDEX.md";

/** True iff `bundlePath` is a directory (not a leaf file). A directory either holds files
 * (file-prefix inference) or is recorded empty in the `dirs` fact — the latter is the empty run
 * bundle the old prefix-only model could not see (rk-399 review finding 2). It is a leaf file iff
 * it appears verbatim as a snapshot key. */
function isBundleDir(snapshot: RepoSnapshot, bundlePath: string): boolean {
  if (hasPath(snapshot, bundlePath)) return false;
  return hasPrefix(snapshot, bundlePath) || dirExists(snapshot, bundlePath);
}

export const runsGate: Gate = {
  name: "runs",
  run(snapshot: RepoSnapshot, _config: GateConfig): GateResult {
    const findings: Finding[] = [];
    const indexText = snapshot.get(INDEX_PATH) ?? "";

    // Check 6: classify every runs/ top-level entry as a bundle dir or a stray file
    // (check-runs.py:46-50). SKIP_TOP_LEVEL's own README.md is silently excluded from both.
    // Entries come from BOTH file-prefix inference (`listDir`, catches file-backed bundles and
    // stray files) AND the `dirs` fact (`childDirs`, catches a genuinely-empty bundle directory
    // that has no files under it — rk-399 finding 2); the union is de-duplicated and sorted.
    const topLevel = [...new Set([...listDir(snapshot, RUNS_DIR), ...childDirs(snapshot, RUNS_DIR)])].sort();
    const bundleNames: string[] = [];
    /** Which sanctioned-infrastructure names were actually present as FILES this run — reported in
     * the coverage line below, so an allowance is always visible with what it covered (L2). */
    const sanctioned: string[] = [];
    for (const name of topLevel) {
      const bundlePath = `${RUNS_DIR}/${name}`;
      if (isBundleDir(snapshot, bundlePath)) {
        // A DIRECTORY carrying a sanctioned name is not the sanctioned file — it is a (malformed)
        // bundle, and stays one. The allowance never reclassifies a directory.
        bundleNames.push(name);
      } else if (SANCTIONED_SET.has(name)) {
        sanctioned.push(name);
      } else if (!SKIP_TOP_LEVEL.has(name)) {
        findings.push({
          severity: "WARN",
          path: bundlePath,
          message: "stray file at runs/ top level (bundles are dirs)",
        });
      }
    }

    for (const name of bundleNames) {
      const bundlePath = `${RUNS_DIR}/${name}`;

      // Check 1: bundle dirname grammar. Does NOT skip the remaining per-bundle checks
      // (check-runs.py has no `continue` here — only the missing-README check below does).
      if (!BUNDLE_RE.test(name)) {
        findings.push({
          severity: "ERROR",
          path: bundlePath,
          message: "bad bundle name — must be <YYYY-MM-DD>-<kebab-slug>",
        });
      }

      // Check 2: README.md exists; its absence skips checks 3-5 for this bundle
      // (check-runs.py:57-59, `continue`).
      const readmePath = `${bundlePath}/README.md`;
      const readme = snapshot.get(readmePath);
      if (readme === undefined) {
        findings.push({
          severity: "ERROR",
          path: bundlePath,
          message: "missing README.md (hypothesis/command/finding/next)",
        });
        continue;
      }

      const text = readme.toLowerCase();

      // Check 3: all four required-field substrings present.
      const missing = REQUIRED_FIELDS.filter((f) => !text.includes(f));
      if (missing.length > 0) {
        findings.push({
          severity: "ERROR",
          path: readmePath,
          message: `missing required field(s): ${missing.join(", ")}`,
        });
      }

      // Check 4: at least one invariant-marker substring present.
      if (!INVARIANT_MARKERS.some((m) => text.includes(m))) {
        findings.push({
          severity: "ERROR",
          path: readmePath,
          message:
            "no checkable invariant/certificate/known-value declared " +
            "(a number without an invariant is not a finding — L3)",
        });
      }

      // Check 5: bundle dirname appears as a substring of the repo-root INDEX.md text.
      if (!indexText.includes(name)) {
        findings.push({
          severity: "ERROR",
          path: bundlePath,
          message: "not referenced in INDEX.md (add a reverse-lookup row)",
        });
      }
    }

    // Day-1 vacuity: an empty (or README-only) runs/ is a legitimate green state, and the
    // coverage line states "0/0 run bundle(s)" explicitly rather than omitting it
    // (docs/gate-contracts.md Gate 5 "Day-1 vacuity"; check-runs.py:16).
    const n = bundleNames.length;
    // Sanctioned infrastructure is named in the SAME single coverage line every gate emits (the
    // harness asserts exactly one — src/corpus/run.ts's `assertCoverageLine`), in the sorted order
    // of SANCTIONED_RUNS_INFRASTRUCTURE. Absent entirely, the unit text is byte-identical to what
    // it always was: nothing was skipped, so there is nothing to report (day-1 vacuity unchanged).
    const present = SANCTIONED_RUNS_INFRASTRUCTURE.filter((name) => sanctioned.includes(name));
    const unit =
      present.length > 0 ? `run bundle(s); sanctioned runs/ infrastructure: ${present.join(", ")}` : "run bundle(s)";
    return {
      findings,
      coverage: [{ gate: "runs", unit, checked: n, total: n }],
    };
  },
};
