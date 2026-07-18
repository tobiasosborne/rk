// PURITY: pure — no fs/network/clock (L3). M1.4 (`rk upgrade` v0 stub): given the stamped repo's
// recorded template_version (or `undefined` if it never recorded one) and the binary's own
// (embedded) manifest, decides the verdict and — on a mismatch — which stamped files fall into
// which classification bucket, since the manual-diff instructions differ by class:
// `rewritten-whole` files get a concrete diff command; `authored-append-only`/`generated` files
// are NEVER overwrite candidates and are named only to say so. No merge is ever computed here —
// that machinery is explicitly deferred to M5.2 (IMPLEMENTATION_PLAN.md M1.4: "stub only").

import type { Manifest } from "./manifest-types";
import { semverEqual } from "./version";

export type UpgradeStatus = "no-record" | "up-to-date" | "mismatch";

export interface UpgradeAdvice {
  status: UpgradeStatus;
  /** The version recorded in the stamped repo's `.rk/template-version` — absent for "no-record". */
  stampedVersion?: string;
  /** The version embedded in the running `rk` binary (`templates/manifest.json`'s own
   * `template_version`). Always present. */
  currentVersion: string;
  /** Populated only for `status: "mismatch"` — every `rewritten-whole` stamped path, in manifest
   * order, a real diff candidate. */
  rewrittenWhole: string[];
  /** Populated only for `status: "mismatch"` — every `authored-append-only`/`generated` stamped
   * path (directories excluded): named so the user knows these are explicitly NOT touched. */
  neverOverwritten: string[];
}

export function computeUpgradeAdvice(stampedVersion: string | undefined, manifest: Manifest): UpgradeAdvice {
  const currentVersion = manifest.template_version;

  if (stampedVersion === undefined) {
    return { status: "no-record", currentVersion, rewrittenWhole: [], neverOverwritten: [] };
  }

  if (semverEqual(stampedVersion, currentVersion)) {
    return { status: "up-to-date", stampedVersion, currentVersion, rewrittenWhole: [], neverOverwritten: [] };
  }

  const rewrittenWhole = manifest.stamped.filter((e) => e.classification === "rewritten-whole").map((e) => e.path);
  const neverOverwritten = manifest.stamped
    .filter((e) => e.classification === "authored-append-only" || e.classification === "generated")
    .map((e) => e.path);

  return { status: "mismatch", stampedVersion, currentVersion, rewrittenWhole, neverOverwritten };
}
