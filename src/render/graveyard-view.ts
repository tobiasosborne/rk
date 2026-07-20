// PURITY: pure — no fs/network/clock (L3). The dead-route graveyard (PRD C6): fr's own
// died/refuted outcomes (../knowledge-frontier/src/types.ts's `Outcome`), rendered from
// `GraphDocument.edges.fr` directly — this data already crosses the M2.2 join (src/graph/from-fr.ts),
// so this view needs no new store reader.
//
// Truthfulness invariant (this module's whole reason to exist): a dead route another fr cycle has
// SUPERSEDED (types-edges.ts's `FrEdgeBase.supersedes` doc comment: "a consumer derives 'is this
// cycle superseded' by scanning for another edge's `supersedes` pointing at it") must be visibly
// marked superseded and must NEVER be presented in the live/current section — an obsolete death is
// still a fact (never dropped, CLAUDE.md L2) but it must not read as the CURRENT state of that
// route. See corpus/render/rigour-ladder (cycle 1 superseded by cycle 2, both targeting
// n-obstruction) and test/render/graveyard-view.test.ts's red case.
//
// A residual/death-certificate string (fr's own `LogRecord.residual` /
// ../knowledge-frontier/src/types.ts) is NOT part of `FrEdge` — the M2.2 reader carries only what
// the registry<->fr join needs (cycle/artifact/outcome/verdict/supersedes), per PRD C5's per-edge
// table. This view says so plainly rather than fabricating or omitting the field silently.
//
// rk-50v RENDER-EDGE option (orchestrator-pinned; NO graph-schema change): `renderGraveyard`
// optionally takes a `residuals` map — src/render/fr-edge.ts's `FrResidualData.byCycle`, keyed by
// the SAME cycle number as a `DeadRouteEntry.cycle` — and decorates a matching row with fr's own
// residual/reason/killedByWave text. This module itself stays PURE (L3): the map is data handed
// in by the caller (src/render/site.ts), never fetched here. Omitting the argument (or passing an
// empty map) renders BYTE-IDENTICAL to before this option existed — see
// test/render/graveyard-view.test.ts's "byte-identical" cases — so a campaign without fr export
// reachable, or a render that never threads `frResiduals`, sees exactly today's disclaim-only view
// (no new failure mode, CLAUDE.md L2).

import type { FrEdge, GraphDocument } from "../graph/types";
import type { DeadRouteResidual } from "./fr-edge";
import { esc } from "./html";
import { nodePanelId } from "./node-view";

/** fr's own dead-route vocabulary (../knowledge-frontier/src/types.ts's `Outcome`) — the two
 * outcomes that mark an arm-pull as a graveyard entry, not a live/pending one. Kept as a literal
 * set here (not imported — fr's `Outcome` type is not part of rk's graph schema surface, only the
 * open-string `FrEdge.outcome` field is). */
const DEAD_OUTCOMES = new Set(["died", "refuted"]);

export interface DeadRouteEntry {
  cycle: number;
  artifact: string;
  outcome: string;
  resolutionMethod: FrEdge["resolutionMethod"];
  resolvedNodeId?: string;
  verdict?: string;
  verdictFresh?: boolean;
  /** true iff some OTHER fr edge's `supersedes` names this entry's own cycle. */
  superseded: boolean;
  /** The cycle that superseded this one, when `superseded` — named so a reader can follow the
   * chain forward, never left as a bare boolean. */
  supersededByCycle?: number;
}

/** Every died/refuted fr edge, TOTAL over `doc.edges.fr` (never a silent drop) — supersession is
 * derived, not stored, per `FrEdgeBase.supersedes`'s own doc comment. Sorted by cycle, ascending,
 * for deterministic rendering. */
export function computeGraveyard(doc: GraphDocument): DeadRouteEntry[] {
  const supersededBy = new Map<number, number>();
  for (const e of doc.edges.fr) {
    if (e.supersedes !== undefined) supersededBy.set(e.supersedes, e.cycle);
  }
  return doc.edges.fr
    .filter((e) => e.outcome !== undefined && DEAD_OUTCOMES.has(e.outcome))
    .map((e) => {
      const byCycle = supersededBy.get(e.cycle);
      return {
        cycle: e.cycle,
        artifact: e.artifact,
        outcome: e.outcome!,
        resolutionMethod: e.resolutionMethod,
        resolvedNodeId: e.resolutionMethod === "unresolved" ? undefined : e.resolvedNodeId,
        verdict: e.verdict,
        verdictFresh: e.verdictFresh,
        superseded: byCycle !== undefined,
        supersededByCycle: byCycle,
      };
    })
    .sort((a, b) => a.cycle - b.cycle);
}

/** fr's own residual/reason/wave text for one row, when the caller supplied it (rk-50v
 * RENDER-EDGE option) — `undefined` renders nothing extra, the pre-existing behavior. */
function residualBlock(r: DeadRouteResidual | undefined): string {
  if (!r) return "";
  const wave = r.killedByWave ? ` <span class="rk-tier">(wave ${esc(r.killedByWave)})</span>` : "";
  return `<div class="rk-residual">died at: <em>${esc(r.residual)}</em> — ${esc(r.reason)}${wave}</div>`;
}

function entryLine(e: DeadRouteEntry, residual?: DeadRouteResidual): string {
  const target = e.resolvedNodeId
    ? `<a href="#${esc(nodePanelId(e.resolvedNodeId))}">${esc(e.resolvedNodeId)}</a>`
    : `<span class="rk-none">unresolved (no registry node matched <code>${esc(e.artifact)}</code>)</span>`;
  const verdictBits: string[] = [];
  if (e.verdict) verdictBits.push(`verdict=${esc(e.verdict)}${e.verdictFresh === false ? " (STALE)" : ""}`);
  const verdict = verdictBits.length > 0 ? ` — ${verdictBits.join(", ")}` : "";
  return (
    `<li>cycle ${e.cycle}<code class="rk-tier"> [${esc(e.outcome)}]</code> — ${target}` +
    `<span class="rk-muted"> (${esc(e.artifact)})</span>${verdict}${residualBlock(residual)}</li>`
  );
}

/** Renders the full graveyard section. `superseded` entries render in their OWN subsection
 * (`#rk-graveyard-superseded`) so a reader can never mistake one for a live route — see this
 * module's header for why that distinction is load-bearing, not cosmetic.
 *
 * `residuals` (rk-50v RENDER-EDGE option, src/render/fr-edge.ts's `FrResidualData.byCycle`) is
 * OPTIONAL, keyed by cycle: a matching entry decorates that row with fr's own residual/reason/
 * wave text, superseded rows included (a residual is never dropped just because its route was
 * superseded — CLAUDE.md L2). Omitted, or an empty map, renders BYTE-IDENTICAL to a call with no
 * residual data at all — see this file's header. */
export function renderGraveyard(doc: GraphDocument, residuals?: ReadonlyMap<number, DeadRouteResidual>): string {
  const entries = computeGraveyard(doc);
  const live = entries.filter((e) => !e.superseded);
  const superseded = entries.filter((e) => e.superseded);
  const hasResiduals = residuals !== undefined && entries.some((e) => residuals.has(e.cycle));

  const note =
    `<p class="rk-muted">fr's own residual/death-certificate text (the "died at" invariant) is ` +
    `NOT carried into rk's graph projection — only cycle/artifact/outcome/verdict/supersedes cross ` +
    `the registry&harr;fr join (PRD C5). Consult <code>fr export</code> directly for the residual.</p>` +
    (hasResiduals
      ? `<p class="rk-ok">fr export data was supplied to this render — residual/reason text is ` +
        `shown per-entry below where fr recorded one.</p>`
      : "");

  if (entries.length === 0) {
    return (
      `<div class="rk-graveyard"><h2>dead-route graveyard</h2>` +
      `<p class="rk-none">no dead routes (no fr cycle recorded died/refuted).</p>${note}</div>`
    );
  }

  const liveBlock =
    live.length === 0
      ? `<p class="rk-none">none currently live (every dead route on record has been superseded).</p>`
      : `<ul>${live.map((e) => entryLine(e, residuals?.get(e.cycle))).join("")}</ul>`;

  const supersededBlock =
    superseded.length === 0
      ? `<p class="rk-ok">none.</p>`
      : `<ul>${superseded
          .map(
            (e) =>
              `<li class="rk-defect">${entryLine(e, residuals?.get(e.cycle)).replace("<li>", "")
                .replace("</li>", "")} — <strong>superseded by cycle ${e.supersededByCycle}</strong></li>`,
          )
          .join("")}</ul>`;

  return (
    `<div class="rk-graveyard"><h2>dead-route graveyard (${entries.length})</h2>` +
    note +
    `<h3>live (${live.length})</h3>${liveBlock}` +
    `<h3 id="rk-graveyard-superseded">superseded — never presented as current (${superseded.length})</h3>${supersededBlock}` +
    `</div>`
  );
}
