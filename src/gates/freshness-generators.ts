// PURITY: pure — no fs/network/clock (L3). Gate 7 — freshness: the PURE generator table this gate
// regenerates itself, and the structural-generator classification (rk-nsex BL4). Split out of
// freshness.ts (rk-tmzl, move-only); see freshness.ts's header for the pure/edge-supplied split.

import type { RepoSnapshot } from "./snapshot";
import { parseRegistry } from "./linker-parse";
import { renderDag, renderIndex } from "./linker-render";
import { CARD_GENERATOR, renderCardForPath } from "../render/cards";
import { MACROS_GENERATOR, renderMacros } from "../render/macros-tex";
import type { PureRegenResult } from "./freshness-manifest";

/** rk-nsex widened the signature from `(snapshot) => string` to `(snapshot, path) => PureRegenResult`.
 * The two AISM-mirror generators are functions of the snapshot alone (one manifest entry, one
 * artifact); `cards-v1` is one generator over MANY artifacts — `refs/cards/<source-id>/L1-<n>.md`,
 * one per extraction record — so it must see which card it is being asked for. */
export const GENERATORS: Record<string, (snapshot: RepoSnapshot, path: string) => PureRegenResult> = {
  "linker-index": (snapshot) => ({ ok: true, bytes: renderIndex(parseRegistry(snapshot).lemmas) }),
  "linker-dag": (snapshot) => ({ ok: true, bytes: renderDag(parseRegistry(snapshot).lemmas) }),
  [CARD_GENERATOR]: (snapshot, path) => renderCardForPath(snapshot, path),
  // rk-5lzf (LB5): `definitions/notation/macros.tex`, one \newcommand per notation-register shard,
  // PURE (src/render/macros-tex.ts reads the snapshot and nothing else), so a hand-edited macro
  // file is a blocking ERROR, not a silent divergence between the register and the LaTeX.
  [MACROS_GENERATOR]: (snapshot) => ({ ok: true, bytes: renderMacros(snapshot) }),
};

/** rk-nsex / BL4: a `cards-v1` finding is STRUCTURAL, unlike every other Gate 7 finding. Gate 7 is
 * classified whole-gate non-structural because a stale build output is a completeness-class defect
 * over a repo's own adopted convention — but a CARD is the artifact agents answer from, and its
 * freshness is the only thing standing between an edited card and a claim about the literature.
 * Demoting it in exploration would mean `rk check` exits green on a hand-edited card during the
 * exact phase in which admission happens (Tier A review BL4; campaign memo section 2a). */
export function isStructuralGenerator(generatorId: string): boolean {
  return generatorId === CARD_GENERATOR;
}
