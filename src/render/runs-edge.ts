// EDGE — fs. Reads `runs/**` + repo-root `INDEX.md` for the run-bundle gallery (PRD C6:
// "run-bundle gallery with embedded figures/demos"). Uses `src/store/snapshot-load.ts`'s
// `loadSnapshot` (read-only import — this file does not modify src/store/) to build the SAME
// `RepoSnapshot` `rk check` reads, then hands it straight to Gate 5's OWN `runsGate`
// (src/gates/runs.ts, read-only import) so the gallery's per-bundle validity verdict can never
// drift from `rk check`'s own — a bundle the gate would ERROR on is flagged with that EXACT
// finding here, not a second, independently-derived notion of "valid".
//
// The bundle-name enumeration below (union of `listDir` + `childDirs`, `README.md` excluded)
// mirrors `runsGate`'s own top-level scan (src/gates/runs.ts's `SKIP_TOP_LEVEL`/`topLevel`
// construction) but is NOT imported from it — those constants are gate-local (unexported), and
// this is a second, independent enumeration for DISPLAY purposes only (never for the validity
// verdict itself, which stays the gate's alone). Same "independent re-parse" precedent as
// src/gates/provenance-parse.ts's own `NON_SHARD_NAMES` duplication.

import { DEFAULT_GATE_CONFIG } from "../gates/config";
import type { Finding } from "../gates/framework";
import { runsGate } from "../gates/runs";
import { childDirs, listDir } from "../gates/snapshot";
import { loadSnapshot } from "../store/snapshot-load";

const RUNS_DIR = "runs";
const INDEX_PATH = "INDEX.md";
/** `runs/README.md` is the bundle grammar's own schema doc, never a bundle — same exclusion
 * src/gates/runs.ts's `SKIP_TOP_LEVEL` applies. */
const SKIP_TOP_LEVEL = new Set(["README.md"]);
/** How much of a bundle's README to surface as a gallery-card excerpt — enough to show the
 * hypothesis/finding shape without inlining the whole file. */
const EXCERPT_LENGTH = 320;

export interface RunBundleSummary {
  name: string;
  path: string;
  readmePresent: boolean;
  readmeExcerpt?: string;
  referencedInIndex: boolean;
}

export interface RunGalleryData {
  bundles: RunBundleSummary[];
  /** Gate 5's OWN findings, reused VERBATIM — never a second, drifting validity notion. */
  findings: Finding[];
  coverage: { checked: number; total: number };
}

/** Loads `root`'s run-bundle gallery data. Day-1 vacuity (no `runs/` at all) degrades to an empty
 * bundle list + a `0/0` coverage line, never a crash or a silent "nothing to show" — the gate's
 * own coverage line already states this the same way (docs/gate-contracts.md Gate 5 "Day-1
 * vacuity"). */
export function loadRunGallery(root: string): RunGalleryData {
  const snapshot = loadSnapshot(root);
  const gateResult = runsGate.run(snapshot, DEFAULT_GATE_CONFIG);
  const indexText = snapshot.get(INDEX_PATH) ?? "";

  const names = [...new Set([...listDir(snapshot, RUNS_DIR), ...childDirs(snapshot, RUNS_DIR)])]
    .filter((n) => !SKIP_TOP_LEVEL.has(n))
    .sort();

  const bundles: RunBundleSummary[] = names.map((name) => {
    const path = `${RUNS_DIR}/${name}`;
    const readme = snapshot.get(`${path}/README.md`);
    return {
      name,
      path,
      readmePresent: readme !== undefined,
      readmeExcerpt: readme !== undefined ? readme.slice(0, EXCERPT_LENGTH) : undefined,
      referencedInIndex: indexText.includes(name),
    };
  });

  const cov = gateResult.coverage.find((c) => c.gate === "runs");
  return {
    bundles,
    findings: gateResult.findings,
    coverage: { checked: cov?.checked ?? 0, total: cov?.total ?? 0 },
  };
}
