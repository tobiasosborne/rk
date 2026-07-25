// PURITY: pure — no fs/network/clock (L3). M1.4 (`rk upgrade` v0 stub): given the stamped repo's
// recorded template_version (or `undefined` if it never recorded one) and the binary's own
// (embedded) manifest, decides the verdict and — on a mismatch — which stamped files fall into
// which classification bucket, since the manual-diff instructions differ by class:
// `rewritten-whole` files get a concrete diff command; `authored-append-only`/`generated` files
// are NEVER overwrite candidates and are named only to say so. No merge is ever computed here —
// that machinery is explicitly deferred to M5.2 (IMPLEMENTATION_PLAN.md M1.4: "stub only").

import type { ChangelogEntry, Manifest } from "./manifest-types";
import { compareSemver, parseSemver, semverEqual } from "./version";

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
  /** Populated only for `status: "mismatch"` — every `authored-append-only`/`generated`/
   * `campaign-seed` stamped path (directories excluded): named so the user knows these are
   * explicitly NOT touched. */
  neverOverwritten: string[];
  /** Populated only for `status: "mismatch"` — every changelog entry strictly newer than the
   * stamped version, newest first. This is the ONLY channel for a change the per-file diff plan
   * cannot show (a stamped path that does not exist in the old repo; a `.rk/config.json` key,
   * which is not a stamped file at all). An UNPARSEABLE stamped version yields the WHOLE log
   * rather than none: "I cannot tell how old you are" must over-inform, never silently omit a
   * migration note. */
  changesSince: ChangelogEntry[];
}

const NEVER_OVERWRITTEN_CLASSES = new Set(["authored-append-only", "generated", "campaign-seed"]);

/** Changelog entries strictly newer than `stampedVersion`, newest first. An unparseable entry
 * version is kept (never silently dropped — a malformed note is still a note the user must see);
 * an unparseable `stampedVersion` keeps everything. */
function changesSince(stampedVersion: string, manifest: Manifest): ChangelogEntry[] {
  const log = manifest.changelog ?? [];
  const from = parseSemver(stampedVersion);
  const kept = from === null ? [...log] : log.filter((e) => {
    const v = parseSemver(e.version);
    return v === null || compareSemver(v, from) > 0;
  });
  return kept.sort((a, b) => {
    const pa = parseSemver(a.version);
    const pb = parseSemver(b.version);
    if (pa === null || pb === null) return 0;
    return -compareSemver(pa, pb);
  });
}

export function computeUpgradeAdvice(stampedVersion: string | undefined, manifest: Manifest): UpgradeAdvice {
  const currentVersion = manifest.template_version;

  if (stampedVersion === undefined) {
    return { status: "no-record", currentVersion, rewrittenWhole: [], neverOverwritten: [], changesSince: [] };
  }

  if (semverEqual(stampedVersion, currentVersion)) {
    return { status: "up-to-date", stampedVersion, currentVersion, rewrittenWhole: [], neverOverwritten: [], changesSince: [] };
  }

  const rewrittenWhole = manifest.stamped.filter((e) => e.classification === "rewritten-whole").map((e) => e.path);
  const neverOverwritten = manifest.stamped
    .filter((e) => NEVER_OVERWRITTEN_CLASSES.has(e.classification))
    .map((e) => e.path);

  return {
    status: "mismatch",
    stampedVersion,
    currentVersion,
    rewrittenWhole,
    neverOverwritten,
    changesSince: changesSince(stampedVersion, manifest),
  };
}
