// PURITY: pure — no fs/network/clock (L3). M2 boundary review, landing-blocker #2 (consumer
// side): a structurally incomplete or degraded projection must never render as a complete report.
// src/store/build-graph.ts's `BuildGraphResult.diagnostics` (the join lane's landed producer-side
// contract) carries two DISTINCT concerns this module renders:
//   1. STRUCTURAL LOSS (`structuralLoss`: registry shards skipped for a structural parse reason,
//      malformed raw fr log lines) — this is not a degraded-but-usable read, it is DATA MISSING
//      from the projection entirely. `rk render`/`rk graph` (src/cli/render.ts, src/cli/graph.ts)
//      REFUSE to emit any output when `isStructurallyComplete` is false, naming every entry here.
//   2. SOURCE STATUS (`sources`: was af/fr/bd read via its authoritative export, a reduced-fidelity
//      fallback reader, or not present at all) — THREE distinct states, never conflated:
//        - authoritative ("export"/"read"): the source was engaged and read for real.
//        - fallback ("ledger-fallback"/"log-fallback"): the source WAS engaged, but only a
//          reduced-fidelity reader could reach it (e.g. the af/fr binary was unavailable) — real
//          degradation, loud enough to warrant a site-level banner.
//        - absent: the source was never engaged at all (no af-tracked node, no `.frontier/`, no
//          `.beads/`) — a legitimate, presence-conditional non-adoption (same stance
//          src/gates/freshness.ts takes on a missing manifest), named on every surface but NOT
//          alarm-worthy on its own, so it never triggers the loud banner by itself.
//
// Kept in src/render/ (not src/cli/) so the exact wording is shared, testable in isolation, and
// identical between the CLI's terminal output and the HTML surfaces — a truthfulness surface,
// same discipline as src/render/styling.ts's single-source-of-truth stance.

import { esc } from "./html";

export interface RegistrySkip {
  path: string;
  reason: string;
}
export interface FrMalformedLine {
  lineNo: number;
  snippet: string;
}
/** Same shape as `FrMalformedLine`, kept as its own named type so the two never get spliced into
 * one array and lose which FILE a line number belongs to (LB4). */
export interface BdMalformedLine {
  lineNo: number;
  snippet: string;
}
/** The FOUR structural-loss classes `src/store/build-graph.ts` produces. Every one of them must be
 * enumerable by `structuralLossLines` below: `rk render`/`rk graph`/`rk verify` promise to name
 * EVERY entry when they refuse, and a class present in the producer but absent here makes that
 * promise false — the build refuses while enumerating zero entries (LB4, the defect this shape
 * fixes for `retractionStoreProblems`; `bdMalformedLines` joined at the same time). Adding a fifth
 * class to `BuildDiagnostics.structuralLoss` without adding it here is therefore a truthfulness
 * bug, not an omission. */
export interface StructuralLoss {
  registrySkips: RegistrySkip[];
  frMalformedLines: FrMalformedLine[];
  /** rk-0ehr / P1: one entry per problem that makes `.rk/retractions.jsonl` untrustworthy. The
   * ledger recording which claims are WITHDRAWN cannot be read, so the projection's silence about
   * retraction is unearned. */
  retractionStoreProblems: string[];
  /** LB4: an unparseable `.beads/issues.jsonl` line — a dropped registry↔bd edge. */
  bdMalformedLines: BdMalformedLine[];
}
export type AfSourceStatus = "export" | "ledger-fallback" | "absent";
export type FrSourceStatus = "export" | "log-fallback" | "absent";
export type BdSourceStatus = "read" | "absent";
export interface SourceStatuses {
  af: AfSourceStatus;
  fr: FrSourceStatus;
  bd: BdSourceStatus;
}
/** Mirrors src/store/build-graph.ts's exported `BuildDiagnostics` (structural typing, not a shared
 * import — src/render/ stays decoupled from src/store/, same stance src/graph/query-shared.ts's
 * module doc takes on not importing src/gates/ types).
 *
 * LB4: the mirror is field-for-field on `structuralLoss` and MUST STAY SO — that is the whole
 * safety property of a structural mirror, and it silently stopped holding once
 * `retractionStoreProblems` was added producer-side and not here (see `StructuralLoss` above).
 * `sources` is deliberately NARROWER, not a mirror: the producer also carries a fourth source
 * (`retraction: read|corrupt|absent`) whose corrupt state is already reported as structural loss,
 * so surfacing it a second time in the af/fr/bd fidelity row would double-count one fault. */
export interface BuildDiagnostics {
  structuralLoss: StructuralLoss;
  sources: SourceStatuses;
  isStructurallyComplete: boolean;
}

/** One line per structural-loss entry — the exact text a refusing `rk render`/`rk graph` prints,
 * naming every entry (never a bare "something's wrong", CLAUDE.md L2: no silent skip). */
export function structuralLossLines(loss: StructuralLoss): string[] {
  const lines: string[] = [];
  for (const skip of loss.registrySkips) lines.push(`registry: ${skip.path} skipped -- ${skip.reason}`);
  for (const m of loss.frMalformedLines) lines.push(`fr log: line ${m.lineNo} malformed -- ${m.snippet}`);
  // LB4: the third and fourth classes. Before this, a refusing `rk render`/`rk graph`/`rk verify`
  // printed its "naming every entry" preamble and then enumerated NOTHING when the only loss was a
  // corrupt retraction ledger — the refusal was correct and its explanation was empty.
  for (const p of loss.retractionStoreProblems) lines.push(`retraction store: ${p}`);
  for (const m of loss.bdMalformedLines) lines.push(`bd issues: line ${m.lineNo} malformed -- ${m.snippet}`);
  return lines;
}

/** Total structural-loss ENTRIES across all four classes — the one place the count is derived, so
 * a consumer that prints "N structural-loss entries" and a consumer that prints the entries
 * themselves can never disagree about N (LB4: `src/cli/check-regen.ts` summed two of the four and
 * reported "0 structural-loss entries: see rk render for detail" on a build that refused). */
export function structuralLossCount(loss: StructuralLoss): number {
  return (
    loss.registrySkips.length +
    loss.frMalformedLines.length +
    loss.retractionStoreProblems.length +
    loss.bdMalformedLines.length
  );
}

const AF_LABELS: Record<AfSourceStatus, string> = {
  export: "export",
  "ledger-fallback": "ledger fallback (reduced fidelity)",
  absent: "absent",
};
const FR_LABELS: Record<FrSourceStatus, string> = {
  export: "export",
  "log-fallback": "log fallback (reduced fidelity)",
  absent: "absent",
};
const BD_LABELS: Record<BdSourceStatus, string> = { read: "read", absent: "absent" };

type SourceKind = "af" | "fr" | "bd";
type SourceState = "ok" | "fallback" | "absent";

/** The three-way state a source is actually in — "ok" (authoritative), "fallback" (engaged but
 * reduced-fidelity), or "absent" (never engaged). `bd` has no fallback reader (src/store/bd-load.ts
 * either reads `.beads/issues.jsonl` or it is absent), so it is only ever "ok"/"absent". */
function sourceState(kind: SourceKind, sources: SourceStatuses): SourceState {
  if (kind === "af") return sources.af === "export" ? "ok" : sources.af === "absent" ? "absent" : "fallback";
  if (kind === "fr") return sources.fr === "export" ? "ok" : sources.fr === "absent" ? "absent" : "fallback";
  return sources.bd === "read" ? "ok" : "absent";
}

function sourceLabel(kind: SourceKind, sources: SourceStatuses): string {
  if (kind === "af") return AF_LABELS[sources.af];
  if (kind === "fr") return FR_LABELS[sources.fr];
  return BD_LABELS[sources.bd];
}

/** One `"<kind>: <label>"` line per source, e.g. `"af: ledger fallback (reduced fidelity)"` vs
 * `"af: absent"` vs `"af: export"` — the exact wording blocker #2 names, shared verbatim between
 * the terminal output (`out.log`) and the HTML banner/dashboard so the two surfaces never
 * disagree. */
export function sourceStatusLines(sources: SourceStatuses): string[] {
  return (["af", "fr", "bd"] as const).map((k) => `${k}: ${sourceLabel(k, sources)}`);
}

/** True iff any source is a genuine reduced-fidelity FALLBACK (never true for a merely-absent
 * source, which is a legitimate non-adoption, not degradation) — drives whether the HTML
 * site-level banner renders at all. */
export function hasDegradedSource(sources: SourceStatuses): boolean {
  return (["af", "fr", "bd"] as const).some((k) => sourceState(k, sources) === "fallback");
}

const STATE_CSS: Record<SourceState, string> = { ok: "rk-ok", fallback: "rk-defect", absent: "rk-muted" };

/** The dashboard's "evidence sources" section — always rendered (even when every source is
 * authoritative) so a reader never has to guess; a fallback row carries `rk-defect`, an absent row
 * `rk-muted` (informational, not alarming), an authoritative row `rk-ok`. */
export function renderSourcesBlock(sources: SourceStatuses): string {
  const rows = (["af", "fr", "bd"] as const)
    .map((kind) => {
      const cls = STATE_CSS[sourceState(kind, sources)];
      return `<li class="${cls}">${esc(kind)}: ${esc(sourceLabel(kind, sources))}</li>`;
    })
    .join("");
  return `<section class="rk-sources"><h2>evidence sources</h2><ul>${rows}</ul></section>`;
}

/** The site-level banner (rendered near the top of the page, before the dashboard) — visible on
 * every view, not just the dashboard, so a genuine degradation is never missed by a reader who
 * jumps straight to a node panel or the DAG. Empty string (renders nothing) when no source is a
 * fallback — a merely-absent source is legitimate and does not warrant a loud banner on its own
 * (it is still named, un-alarmingly, in the "evidence sources" section). */
export function renderDegradedBanner(sources: SourceStatuses): string {
  if (!hasDegradedSource(sources)) return "";
  const bits = (["af", "fr", "bd"] as const)
    .filter((k) => sourceState(k, sources) === "fallback")
    .map((k) => `${k}: ${sourceLabel(k, sources)}`);
  return (
    `<div class="rk-banner rk-defect">reduced-fidelity build -- ${esc(bits.join("; "))} ` +
    `-- see "evidence sources" on the dashboard.</div>`
  );
}
