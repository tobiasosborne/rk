// EDGE — fs. `rk upgrade` (M1.4, stub only — IMPLEMENTATION_PLAN.md M1.4: "detect template-
// version mismatch, print manual-diff instructions. No three-way merge (deferred to M5.2, when a
// second template version actually exists)"). Reads the stamped repo's `.rk/template-version`
// (the storage location `rk init`, src/cli/init.ts, writes — a plain text file rather than a
// GateConfig key, kept deliberately OUT of `.rk/config.json` so the gate-config schema never has
// to carry a non-gate concern; flagged for the M1 boundary review per this WP's brief), compares
// it against the running binary's embedded `templates/manifest.json` version
// (src/scaffold/templates-embed.ts) via src/scaffold/upgrade-plan.ts's pure `computeUpgradeAdvice`,
// and prints the verdict. NOTHING is ever written by this command.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Out } from "./args";
import { extractRoot } from "./args";
import { computeUpgradeAdvice } from "../scaffold/upgrade-plan";
import { TEMPLATE_MANIFEST } from "../scaffold/templates-embed";

// rk-czv: `rewritten-whole` is a template-machinery classification (this file's whole content is
// re-stamped, never appended to) — it is NOT a claim that overwriting the live file is safe. These
// four hold campaign-authored content a scratch `rk init` preview necessarily renders as
// placeholder slots; naming the slot per file so a user knows exactly what a literal overwrite
// would destroy (dogfood-2 finding: HANDOFF.md's preview is a blank scaffold, not the campaign's
// real session-state narrative).
const CAMPAIGN_SLOT_HINTS: Record<string, string> = {
  "CLAUDE.md": "goal, north-star contract, shard-id prefix (and any filled compute-budget / model-policy / audit-cadence / brittleness-cap slots)",
  "AGENTS.md": "same campaign-owned slots as CLAUDE.md — the two are byte-identical",
  "PRD.md": "goal, north-star contract, phase, compute-budget, model-policy (the same values restated for the PRD)",
  "HANDOFF.md": "the State / Current work / Next steps sections, plus the audit cycle counter and audit log — the scratch preview renders these as a BLANK scaffold, not your campaign's real narrative",
};

function readStampedVersion(root: string): string | undefined {
  const path = join(root, ".rk", "template-version");
  if (!existsSync(path)) return undefined;
  const raw = readFileSync(path, "utf8").trim();
  return raw.length > 0 ? raw : undefined;
}

export async function upgradeCommand(argv: string[], out: Out): Promise<number> {
  const { root } = extractRoot(argv);
  const stampedVersion = readStampedVersion(root);
  const advice = computeUpgradeAdvice(stampedVersion, TEMPLATE_MANIFEST);

  if (advice.status === "no-record") {
    out.log(
      `rk upgrade: pre-1.0 or hand-rolled repo, cannot advise — no .rk/template-version found at ` +
        `${root} (rk init, M1.2, always writes one; a repo without it was never stamped by rk, or ` +
        `predates this WP).`,
    );
    out.log("  next: if this repo should be tracked, record its template version by hand, or re-stamp with 'rk init'.");
    return 1;
  }

  if (advice.status === "up-to-date") {
    out.log(`rk upgrade: up to date (template_version ${advice.stampedVersion}).`);
    return 0;
  }

  out.log(`rk upgrade: MISMATCH — stamped repo carries template_version ${advice.stampedVersion}, this binary carries ${advice.currentVersion}.`);
  out.log("  Nothing is auto-merged (M1.4 is a stub; three-way merge lands at M5.2). Manual diff, per file:");
  out.log("");
  out.log("  rewritten-whole files (structural diff — preserve your filled slots; NEVER a safe overwrite):");
  if (advice.rewrittenWhole.length === 0) {
    out.log("    (none in this template set)");
  } else {
    out.log("    these mix template boilerplate with campaign-authored content; a scratch preview renders");
    out.log("    every campaign-owned slot as a placeholder, so copying the preview over the live file");
    out.log("    would destroy that content. Diff, then hand-merge only the structural/template parts:");
    out.log('    rk init "<placeholder north star>" --root /tmp/rk-upgrade-preview');
    for (const path of advice.rewrittenWhole) {
      out.log(`    diff ${join(root, path)} /tmp/rk-upgrade-preview/${path}`);
      const hint = CAMPAIGN_SLOT_HINTS[path];
      out.log(hint ? `      campaign-owned, PRESERVE: ${hint}` : "      pure template mirror — no campaign-authored content to preserve");
    }
  }
  out.log("");
  out.log("  authored / generated files (NEVER overwrite candidates — untouched by upgrade, ever):");
  if (advice.neverOverwritten.length === 0) {
    out.log("    (none in this template set)");
  } else {
    for (const path of advice.neverOverwritten) out.log(`    ${path}`);
  }
  out.log("");
  out.log("  next: after hand-merging the rewritten-whole files, update .rk/template-version to the new value.");
  return 1;
}
