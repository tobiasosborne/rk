// PURITY: pure — no fs/network/clock (L3). Canonical form + deterministic serialization of a
// `GraphDocument` (src/graph/types.ts). Ground truth: PRD C5 ("a single graph document (stable
// JSON schema)") + IMPLEMENTATION_PLAN.md M2.1 ("Deterministic: sorted keys, content-addressed,
// timestamps excluded from identity"), and schemas/graph.v1.json's "Determinism" section.
//
// Two documents describing the same PROJECTED STATE must serialize to the same bytes regardless
// of (a) the order a producer happened to push nodes/edges into its arrays, and (b) the order a
// producer happened to assign object properties in source. `canonicalizeGraphDocument` fixes (a)
// by re-sorting every array by its own natural key (never trusting input order — `deps`/`routes`/
// `defs` are semantically SETS, per src/gates/linker-graph.ts's own treatment of them, so sorting
// them changes no meaning); `serializeGraphDocument` fixes (b) by re-sorting object keys
// recursively before calling `JSON.stringify`, matching af's own convention (single-line, no
// indentation — ../vibefeld/docs/export-graph-v1.md's example) so either document can be
// re-indented with any JSON pretty-printer for human reading without affecting identity.
//
// Total-order tie-breaking (Tier A review follow-up 1, 2026-07-19): a primary sort key alone is
// not enough when two distinct records can legally share it (e.g. two `bd` edges are only
// guaranteed unique by `nodeId` in today's shape, and two `conflicts` can share `kind`+`edge`+
// `nodeId` — a real duplicate is itself an ERROR src/graph/validate.ts catches, but the
// SERIALIZER must still produce one deterministic order even while validation is in flight, or
// while inspecting a not-yet-valid document). Every sort below therefore falls back to
// `fullTiebreak`, which compares the COMPLETE canonicalized JSON text of the two elements — a
// total order over any two distinct values, with no field left unconsidered.

import type {
  AfEdge,
  BdEdge,
  ConflictRecord,
  FrEdge,
  GraphDocument,
  RegistryNode,
  ReportEdge,
  RetractionEdge,
  UnresolvedRef,
} from "./types";

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Joins a route's (or dep list's) members with a separator no real registry id can contain
 * (ids are filename stems), so the joined string is a faithful sort key for the whole group. */
function routeKey(route: readonly string[]): string {
  return [...route].sort(cmp).join(" ");
}

/** Recursively rebuilds `value` with every plain object's keys inserted in sorted order, so
 * `JSON.stringify` (which always emits string keys in insertion order, never re-sorting them
 * itself) produces the same text regardless of the source object's own property order. Arrays
 * are copied element-wise, recursing into each element (their own ORDER is a separate concern,
 * fixed upstream by `canonicalizeGraphDocument`, not touched here). Exported for
 * src/graph/validate.ts's canonical-form check, which needs the identical key-order-insensitive
 * comparison this function provides. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort(cmp)) out[key] = sortKeysDeep(src[key]);
    return out;
  }
  return value;
}

/** A total order over any two JSON-shaped values: compares their COMPLETE canonical (sorted-key)
 * text. Used only as a tie-breaker after a value's own semantic primary key(s) have already been
 * compared — see this file's header. */
function fullTiebreak(a: unknown, b: unknown): number {
  return cmp(JSON.stringify(sortKeysDeep(a)), JSON.stringify(sortKeysDeep(b)));
}

function canonicalizeNode(n: RegistryNode): RegistryNode {
  return {
    ...n,
    deps: [...n.deps].sort(cmp),
    routes: n.routes.map((r) => [...r].sort(cmp)).sort((a, b) => cmp(routeKey(a), routeKey(b))),
    defs: [...n.defs].sort(cmp),
    balloons: { count: n.balloons.count, classifications: [...n.balloons.classifications].sort(cmp) },
  };
}

function sortAf(edges: readonly AfEdge[]): AfEdge[] {
  return [...edges].sort((a, b) => cmp(a.nodeId, b.nodeId) || cmp(a.workspace, b.workspace) || fullTiebreak(a, b));
}

function sortBd(edges: readonly BdEdge[]): BdEdge[] {
  return [...edges].sort((a, b) => cmp(a.nodeId, b.nodeId) || fullTiebreak(a, b));
}

function sortFr(edges: readonly FrEdge[]): FrEdge[] {
  return [...edges].sort((a, b) => a.cycle - b.cycle || cmp(a.artifact, b.artifact) || fullTiebreak(a, b));
}

function sortReport(edges: readonly ReportEdge[]): ReportEdge[] {
  return [...edges].sort((a, b) => cmp(a.nodeId, b.nodeId) || cmp(a.anchor, b.anchor) || fullTiebreak(a, b));
}

/** rk-0ehr / P1. Primary key is `ordinal` — the ledger position, which is unique in a healthy
 * `.rk/retractions.jsonl` by construction (src/drive/retraction-store.ts's chain check) and is the
 * order a human reading the ledger expects. `nodeId` then `fullTiebreak` keep the order total even
 * on a document assembled from a corrupt ledger with duplicate ordinals (the serializer must
 * produce ONE order even while validation is in flight — see this file's header). */
function sortRetraction(edges: readonly RetractionEdge[]): RetractionEdge[] {
  return [...edges].sort((a, b) => a.ordinal - b.ordinal || cmp(a.nodeId, b.nodeId) || fullTiebreak(a, b));
}

/** fr's own cycle number when `u.edge === "fr"` (required on that variant), else a sentinel of
 * -1 — fr cycles are non-negative (../knowledge-frontier's 1-based monotone index), so -1 never
 * collides with a real cycle and non-fr entries all sort before any fr entry at this key. */
function sourceCycleOf(u: UnresolvedRef): number {
  return u.edge === "fr" ? u.sourceCycle : -1;
}

function sortUnresolved(refs: readonly UnresolvedRef[]): UnresolvedRef[] {
  return [...refs].sort(
    (a, b) =>
      cmp(a.edge, b.edge) || (sourceCycleOf(a) - sourceCycleOf(b)) || cmp(a.ref, b.ref) || fullTiebreak(a, b),
  );
}

function sortConflicts(conflicts: readonly ConflictRecord[]): ConflictRecord[] {
  return [...conflicts].sort(
    (a, b) => cmp(a.kind, b.kind) || cmp(a.edge, b.edge) || cmp(a.nodeId ?? "", b.nodeId ?? "") || fullTiebreak(a, b),
  );
}

/** Produces the canonical form of `doc`: every array re-sorted by its own natural key (with a
 * full-value tie-breaker for ties), every node's internal set-valued fields
 * (`deps`/`routes`/`defs`/`balloons.classifications`) sorted too. Object property order is NOT
 * addressed here — `serializeGraphDocument` handles that at the stringify boundary, so this
 * function's return value is still a plain, key-order-agnostic `GraphDocument`, useful on its
 * own to callers that want a canonical in-memory value (e.g. src/graph/validate.ts's
 * canonical-form check) without paying for a stringify round-trip. */
export function canonicalizeGraphDocument(doc: GraphDocument): GraphDocument {
  return {
    schema_version: doc.schema_version,
    nodes: [...doc.nodes].map(canonicalizeNode).sort((a, b) => cmp(a.id, b.id) || fullTiebreak(a, b)),
    edges: {
      af: sortAf(doc.edges.af),
      bd: sortBd(doc.edges.bd),
      fr: sortFr(doc.edges.fr),
      report: sortReport(doc.edges.report),
      retraction: sortRetraction(doc.edges.retraction),
    },
    unresolved: sortUnresolved(doc.unresolved),
    conflicts: sortConflicts(doc.conflicts),
  };
}

/** The single source of truth for a `GraphDocument`'s identity bytes: canonicalize, then
 * stringify with recursively sorted object keys, compact (no indentation) — matching af's own
 * export convention. Byte-identical across two calls describing the same projected state,
 * regardless of input array order or input object property order (see this file's header and
 * test/graph/serialize.test.ts's determinism property test). */
export function serializeGraphDocument(doc: GraphDocument): string {
  return JSON.stringify(sortKeysDeep(canonicalizeGraphDocument(doc)));
}
