// ROLE: validation for a notation shard's generated LaTeX replacement text (`expansion:`).
// Gate 1 owns the finding; src/render/macros-tex.ts consumes only entries that this contract makes
// valid.
// PURITY: pure — no fs/network/clock (L3).

import type { Finding } from "./framework";
import type { NotationShard } from "./notation-shards";

const PREFIX = "\\ensuremath{";
const FORBIDDEN_PRIMITIVE_RE =
  /\\(?:newcommand|renewcommand|providecommand|def|gdef|edef|xdef|input|include|openout|write|read|catcode)\b|#/;

function bracesBalanced(value: string): boolean {
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "\\") {
      i++;
      continue;
    }
    if (value[i] === "{") depth++;
    if (value[i] === "}") depth--;
    if (depth < 0) return false;
  }
  return depth === 0;
}

/** Returns Gate 1's one structural finding, or undefined for a safe replacement body. */
export function notationExpansionFinding(shard: NotationShard): Finding | undefined {
  const expansion = shard.fields.expansion?.trim();
  if (!expansion) {
    return {
      severity: "ERROR",
      path: shard.path,
      structural: true,
      message:
        "expansion-missing: notation shard must declare a non-empty expansion: for the generated " +
        "canonical macro; renderer placeholders are defense-in-depth, not valid notation",
    };
  }
  const wrapped = expansion.startsWith(PREFIX) && expansion.endsWith("}") && bracesBalanced(expansion);
  if (!wrapped || expansion === `${PREFIX}}` || FORBIDDEN_PRIMITIVE_RE.test(expansion)) {
    return {
      severity: "ERROR",
      path: shard.path,
      structural: true,
      message:
        `expansion-unsafe: '${expansion}' must be one non-empty, balanced \\ensuremath{...} replacement ` +
        "body with no TeX definition, file-I/O, write/read, catcode, or parameter-marker primitives",
    };
  }
  return undefined;
}
