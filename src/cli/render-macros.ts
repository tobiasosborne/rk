// EDGE — fs. `rk render macros [--root <dir>]`: writes `definitions/notation/macros.tex` from the
// notation register and adopts it in `.rk/generated.json` under generator `notation-macros`, so
// Gate 7 byte-diffs it from then on. The rendering itself is the PURE `renderMacros`
// (src/render/macros-tex.ts) that Gate 7 calls too — generator and verifier are the same function,
// which is the whole reason a hand-edited macros.tex is detectable at all (the B2 lesson from
// `rk render`'s own site path, docs/memos/2026-07-25-generality-audit.md).
// Contract: docs/gate-contracts.md Gate 1 "Notation shards" + Gate 7. rk-5lzf / LB5.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadSnapshot } from "../store/snapshot-load";
import { MACROS_GENERATOR, MACROS_PATH, renderMacros } from "../render/macros-tex";
import { adoptGeneratedEntry } from "./generated-manifest";
import type { Out } from "./args";
import { extractRoot } from "./args";

export async function renderMacrosCommand(args: string[], out: Out): Promise<number> {
  const { root } = extractRoot(args);
  const snapshot = loadSnapshot(root);
  const contents = renderMacros(snapshot);

  const dest = join(root, ...MACROS_PATH.split("/"));
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, contents);

  const adoptError = adoptGeneratedEntry(root, MACROS_PATH, MACROS_GENERATOR, "rk render macros");
  if (adoptError) {
    out.log(adoptError);
    return 1;
  }

  const macroCount = contents.split("\n").filter((l) => l.startsWith("\\newcommand")).length;
  const undeclared = contents.split("\n").filter((l) => l.includes("no expansion:")).length;
  out.log(`rk render macros: wrote ${MACROS_PATH} (${macroCount} macro${macroCount === 1 ? "" : "s"}).`);
  out.log(`  adopted ${MACROS_PATH} in .rk/generated.json (generator '${MACROS_GENERATOR}') for Gate 7.`);
  if (undeclared > 0) {
    out.log(
      `  ${undeclared} shard(s) declare no 'expansion:' — rendered with a placeholder body and marked in ` +
        `the file; set 'expansion:' in the shard to replace it.`,
    );
  }
  if (macroCount === 0) {
    out.log("  the notation register is empty (no definitions/**/*.md shard has shard_type: notation).");
  }
  out.log("  next: \\input this file from the campaign's LaTeX preamble, and never hand-edit it.");
  return 0;
}
