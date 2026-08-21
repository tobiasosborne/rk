// PURITY: pure — no fs/network/clock (L3). Split from linker-parse.ts (rk-c83, hard-cap-280 wave):
// the shared `Lemma` record shape + the small pure list/route grammar primitives every Gate 2
// module builds on. Ground truth: docs/gate-contracts.md "Gate 2 — argument / linker". This module
// owns the SHAPE (what a parsed shard looks like, and how its `;`-separated / `routes:` fields
// decode); `linker-parse.ts` owns the WALK (scanning `argument/**/*.md` and building these records).
//
// `parseRoutes`/`allDepIds` are ported from argument.py:68-90/98-103 (aism-3ne, OR-route grammar);
// see linker-parse.ts's own header for the full recursive-discovery / id-defaulting divergence notes
// (those are about the SCAN, not this shape, so they stayed there).

import type { BalloonCounter } from "../graph/types";
import type { SignatureBlock } from "./signature";

export interface Lemma {
  id: string;
  /** repo-relative path to this shard's own file, e.g. "argument/lemmas/lem-x.md" or
   * "argument/lem-x.md" (root-level, dogfood-1 shape) — used to
   * attribute every id-keyed finding back to a real path (AISM's console output has no path at
   * all for these; the Shared conventions' uniform SEVERITY path:line format requires one). */
  path: string;
  kind?: string;
  status?: string;
  /** Defaults to "none" only when the `af:` line is entirely ABSENT — mirrors Python's
   * `fm.get("af", "none")`, whose default applies on a missing key, never on a present-but-empty
   * value (argument.py:145). */
  af: string;
  contract: string;
  owner?: string;
  /** Freeform, "not parsed here" (Gate 4's own field — docs/gate-contracts.md Gate 2 Inputs).
   * M3.8 (EDIT flagged): Gate 2's own critical-path provenance check reads this RAW value for one
   * specific token, `legacy-same-family` — the explicit grandfathering marker
   * (docs/gate-contracts.md Gate 2's "Critical-path provenance" section) — a substring match, not
   * a grammar this module owns; Gate 4 remains the owner of `provenance:`'s "report <label>"
   * grammar. */
  provenance?: string;
  defs: string[];
  deps: string[];
  /** OR-route groups: each inner array is one route (conjunction); the outer array is the
   * disjunction (any one route suffices). [] when `routes:` is absent/blank (aism-3ne
   * backward-compat: byte-identical to a deps-only shard). */
  routes: string[][];
  workspace?: string;
  /** M3 blocker 7b: the persisted balloon counter/classification history, read back off this
   * shard's own `balloons:`/`balloon_classifications:` frontmatter (the SAME fields
   * `driver-frontmatter.ts`'s `applyBalloonMark` writes) via `readBalloonCounterFromFields`.
   * Never absent — a shard with no balloon marks parses to `{count: 0, classifications: []}`,
   * matching `RegistryNode.balloons`'s own "never undefined" invariant (graph/types.ts). */
  balloons: BalloonCounter;
  /** Parsed exactly once at the registry boundary; absent/malformed/ok are all retained so every
   * consumer sees the same block state and no graph edge reparses shard bytes. */
  signatureBlock?: SignatureBlock;
}

export const KINDS = new Set(["lemma", "proposition", "theorem", "corollary", "open-problem", "obstruction"]);
export const MATH_STATUS = new Set([
  "proved", "cited", "consensus", "open", "obstruction", "disproved", "stated",
  "proved-mod-audit", "conjecture", "heuristic", "numerical",
]);
export const AF_STATES = new Set(["none", "seeded", "validated"]);

/** Python-repr-style list rendering (`['a', 'b']`) — used only for message-text fidelity with
 * argument.py's f"... not in {sorted(SET)}" formatting; never load-bearing for a check's verdict
 * (subset-match tests only assert a message SUBSTRING, per corpus/README.md). */
export function pyListRepr(items: Iterable<string>): string {
  return `[${[...items].map((i) => `'${i}'`).join(", ")}]`;
}

/** `;`-separated list field (`deps`, `defs`) — argument.py:120-121, `LIST_FIELDS`. */
export function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** OPTIONAL `routes:` grammar (argument.py:68-90, aism-3ne): `[a; b] | [c]` — each bracketed
 * group is one route (conjunction of its members); groups are separated by `|` (disjunction).
 * Whitespace around `|`/brackets/`;` is ignored; empty groups are dropped. `""`/absent -> []. */
export function parseRoutes(raw: string | undefined): string[][] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  const routes: string[][] = [];
  for (let group of s.split("|")) {
    group = group.trim();
    if (group.startsWith("[") && group.endsWith("]")) group = group.slice(1, -1);
    const members = group
      .split(";")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    if (members.length > 0) routes.push(members);
  }
  return routes;
}

/** `deps` ∪ every route's members — the edge set for acyclicity and the (conservative,
 * union-over-routes) ancestor/descendant closures (argument.py:98-103). */
export function allDepIds(l: Lemma): string[] {
  return [...l.deps, ...l.routes.flat()];
}
