// EDGE — subprocess (`fr export`). RENDER-EDGE option for rk-50v: the dead-route graveyard
// (src/render/graveyard-view.ts) can show fr's OWN residual/death-certificate text per dead route
// when this edge is invoked and `fr export` is reachable — WITHOUT a graph-schema change. `FrEdge`
// (src/graph/types.ts) carries only what the registry<->fr join needs (PRD C5's per-edge table:
// cycle/artifact/outcome/verdict/supersedes); the fuller `derived.deadRoutes[]` residual/reason/
// killedByWave text stays OUT of the graph projection, batched with the other graph-v2 candidates
// (rk-rgp, rk-tns) per the orchestrator's pinned decision on rk-50v. This edge instead reads
// `derived.deadRoutes` from the SAME `fr export` document src/store/fr-load.ts's `loadFrSource`
// reads (../knowledge-frontier/docs/export-v1.md) — a second, independent, DISPLAY-ONLY read of
// that document, same "independent re-parse" precedent as src/render/runs-edge.ts /
// src/render/defs-edge.ts (never a second, drifting validity notion — this data carries no
// pass/fail verdict of its own, only presentation text).
//
// `derived.deadRoutes[].killedAtCycle` is the SAME cycle number as the killing log record's own
// `cycle` — i.e. `FrEdge.cycle` / `DeadRouteEntry.cycle` (src/graph/from-fr.ts's `buildFrEdges`
// sets `base.cycle = rec.cycle`) — so a residual entry keys directly onto a graveyard row by
// cycle, no re-derivation needed.
//
// Absence/error posture (never a new failure mode, CLAUDE.md L2/L5): the `fr` binary missing,
// `fr export` exiting non-zero (`.frontier/` missing/corrupt — export-v1.md's own loud-absence
// contract), or unparseable/malformed JSON all degrade to `EMPTY_FR_RESIDUALS` — the graveyard
// then renders EXACTLY as it did before this edge existed (disclaim-only, see
// src/render/graveyard-view.ts). A malformed INDIVIDUAL `deadRoutes[]` row (wrong field types) is
// skipped on its own, never aborting the whole read — one bad row must not blank out every other
// route's residual text. `derived` is fr's own throwaway, recomputed-per-export view (never
// persisted to `.frontier/log.jsonl`, per export-v1.md's "derived" section), so unlike
// src/store/fr-load.ts there is no ledger-fallback path here: an unreachable `fr` binary means no
// residual text is available for this render, full stop — never a crash, never a fabricated value.

export interface DeadRouteResidual {
  /** fr's own death-certificate/residual text (`derived.deadRoutes[].residual`). */
  residual: string;
  /** fr's own reason string (`derived.deadRoutes[].reason`). */
  reason: string;
  /** The wave that killed the route, when fr recorded one; `null` when it didn't. */
  killedByWave: string | null;
}

/** LB7 (2026-08-03 M3-close review): whether this read actually reached fr, and if not, why.
 *
 * The degradation itself is unchanged (still an empty result, still no ledger fallback, still never
 * a crash) — what changed is that it is now OBSERVABLE. Before this, a binary failure or a shape
 * mismatch degraded silently and DETERMINISTICALLY, so `rk check`'s reproducibility probe saw two
 * identical regenerations, found no fidelity loss in `buildGraphDocument`'s af/fr statuses (this is
 * a SECOND, independent `fr export` read), and reported DRIFT — advising a re-render that would
 * re-pin the artifact to degraded output. That is the exact harm `unattributableFinding` exists to
 * prevent, arriving through the one door it did not watch.
 *
 * The type lives in src/render/diagnostics-view.ts (the module that owns the wording every surface
 * shares) and is re-exported here so consumers of this reader have one import surface. */
import type { FrResidualFidelity } from "./diagnostics-view";
export type { FrResidualFidelity };

export interface FrResidualData {
  /** Keyed by `killedAtCycle` (== `FrEdge.cycle` / `DeadRouteEntry.cycle` — see file header). */
  byCycle: ReadonlyMap<number, DeadRouteResidual>;
  /** LB7. `{ok:true}` means fr answered and its `derived.deadRoutes` was read whole (possibly
   * empty — an authoritative empty is NOT a degradation). Consumers decide what to DO with a
   * degraded read; this module only reports it. NOTE the consumer's own duty: whether fr was
   * ENGAGED at all is `buildGraphDocument`'s `sources.fr`, not this field — on a repo with no
   * `.frontier/` the binary is legitimately unreachable and that must never read as degradation
   * (the same stance src/cli/check-regen.ts's `fidelityLosses` already takes on `absent`). */
  fidelity: FrResidualFidelity;
}

/** The honest empty result: no residual text available for any cycle. A graveyard rendered with
 * this (or with no `frResiduals` at all) is byte-identical to today's disclaim-only output — see
 * src/render/graveyard-view.ts's `renderGraveyard`. `fidelity: {ok:true}` because this constant is
 * the "no residual data was ASKED for" default (renderSite's own fallback), not the record of a
 * failed read — `loadFrResiduals` never returns this object, it builds its own. */
export const EMPTY_FR_RESIDUALS: FrResidualData = { byCycle: new Map(), fidelity: { ok: true } };

interface RawDeadRouteRow {
  residual: string;
  reason: string;
  killedAtCycle: number;
  killedByWave?: string | null;
}

function isDeadRouteRow(v: unknown): v is RawDeadRouteRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.residual === "string" &&
    typeof r.reason === "string" &&
    typeof r.killedAtCycle === "number" &&
    (r.killedByWave === undefined || r.killedByWave === null || typeof r.killedByWave === "string")
  );
}

/** Best-effort extraction of `derived.deadRoutes` from a parsed `fr export` document — any shape
 * mismatch (missing `derived`, `deadRoutes` not an array, ...) degrades to `[]`, never a throw. */
function extractDeadRoutes(doc: unknown): unknown[] {
  if (typeof doc !== "object" || doc === null) return [];
  const derived = (doc as Record<string, unknown>).derived;
  if (typeof derived !== "object" || derived === null) return [];
  const deadRoutes = (derived as Record<string, unknown>).deadRoutes;
  return Array.isArray(deadRoutes) ? deadRoutes : [];
}

/** Loads `root`'s fr dead-route residual text via `fr export` (`frCommand`, default `["fr"]`,
 * overridable so a test can point at a fake binary deterministically — same convention as
 * src/store/fr-load.ts's `loadFrSource`). Degrades to `EMPTY_FR_RESIDUALS` on ANY failure: binary
 * unavailable, non-zero exit, unparseable JSON, or a `derived`/`deadRoutes` shape mismatch — see
 * this file's header for why that is the honest, no-new-failure-mode choice here. An individual
 * malformed row (present but wrong field types) is skipped on its own; every other row still
 * lands. */
export function loadFrResiduals(root: string, frCommand: readonly string[] = ["fr"]): FrResidualData {
  const degraded = (reason: string): FrResidualData => ({ byCycle: new Map(), fidelity: { ok: false, reason } });

  let proc: ReturnType<typeof Bun.spawnSync>;
  try {
    proc = Bun.spawnSync([...frCommand, "export"], { cwd: root });
  } catch {
    return degraded(`the '${frCommand.join(" ")}' binary could not be spawned`);
  }
  if (proc.exitCode !== 0) return degraded(`'${frCommand.join(" ")} export' exited ${proc.exitCode}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(proc.stdout.toString());
  } catch {
    return degraded(`'${frCommand.join(" ")} export' output was not parseable JSON`);
  }

  const byCycle = new Map<number, DeadRouteResidual>();
  let skipped = 0;
  for (const row of extractDeadRoutes(parsed)) {
    if (!isDeadRouteRow(row)) {
      skipped++; // malformed row -- skip it alone, never abort the read; LB7: but never silently
      continue;
    }
    byCycle.set(row.killedAtCycle, {
      residual: row.residual,
      reason: row.reason,
      killedByWave: row.killedByWave ?? null,
    });
  }
  // LB7: a skipped row IS a fidelity loss — this render is missing death-certificate text fr has.
  // An EMPTY `derived.deadRoutes` (or an absent `derived`) is NOT: fr answered, and "no dead routes"
  // is a real, authoritative answer.
  if (skipped > 0) {
    return {
      byCycle,
      fidelity: {
        ok: false,
        reason: `${skipped} dead-route row(s) in '${frCommand.join(" ")} export' were malformed and skipped`,
      },
    };
  }
  return { byCycle, fidelity: { ok: true } };
}
