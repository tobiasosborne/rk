// PURITY: pure — no fs/network/clock (L3). The top-level M2.2 assembly boundary: raw store
// records (src/store/*-load.ts's typed output, already read off a real repo by the impure edges)
// in, a canonical `GraphDocument` (schemas/graph.v1.json) out. Composes the four per-edge
// converters (./from-{registry,af,fr,bd}.ts) and recomputes `conflicts` via
// ./validate-conflicts.ts's `computeExpectedConflicts` — the SAME recomputation
// src/graph/validate.ts checks a document against, so an assembled document's conflicts and the
// validator's expectations can never drift apart into two hand-maintained copies. The returned
// document is canonicalized (src/graph/serialize.ts) before being handed back, so
// `validateGraphDocument`'s canonical-form check passes on it directly.

import type { Lemma } from "../gates/linker-parse";
import type { AfSourceRecord } from "./from-af";
import { buildAfEdges } from "./from-af";
import type { BdSourceRecord } from "./from-bd";
import { buildBdEdges } from "./from-bd";
import type { FrSourceRecord } from "./from-fr";
import { buildFrEdges } from "./from-fr";
import { buildRetractionEdges, type RetractionSourceRecord } from "./from-retraction";
import { convertRegistry, type RegistrySkip } from "./from-registry";
import { canonicalizeGraphDocument } from "./serialize";
import { GRAPH_SCHEMA_VERSION, type ConflictRecord, type GraphDocument, type UnresolvedRef } from "./types";
import { computeExpectedConflicts } from "./validate-conflicts";

export interface RawStoreInput {
  lemmas: readonly Lemma[];
  afRecords: readonly AfSourceRecord[];
  frRecords: readonly FrSourceRecord[];
  bdRecords: readonly BdSourceRecord[];
  /** rk-0ehr / P1 (graph `schema_version: "2"`). Optional so every pre-P1 caller keeps compiling
   * and producing the identical document minus an empty array — a repo with no
   * `.rk/retractions.jsonl` and a caller that does not read it are the same projected state. */
  retractionRecords?: readonly RetractionSourceRecord[];
}

/** Every input/output count, so a caller (the AISM read-through, a future `rk graph` CLI) can
 * report the TOTAL-conversion accounting honestly rather than asserting resolution rates without
 * evidence (M2.2 acceptance bar: "fr-record resolution rate ... measured and reported, not
 * assumed 100%"). */
export interface AssembleReport {
  registrySkipped: RegistrySkip[];
  lemmasIn: number;
  nodesOut: number;
  afRecordsIn: number;
  afResolved: number;
  afUnresolved: number;
  frRecordsIn: number;
  frResolved: number;
  frUnresolved: number;
  bdRecordsIn: number;
  bdEdges: number;
  /** rk-0ehr / P1: the retraction ledger's own total-conversion accounting. `retractionsLive` is
   * the subset still BINDING (the ones that produce a conflict and veto rendering) — reported
   * separately because "N retractions on file" and "N claims currently withdrawn" are different
   * numbers the moment anything has been edited since. */
  retractionRecordsIn: number;
  retractionResolved: number;
  retractionUnresolved: number;
  retractionsLive: number;
}

function conflictMessage(kind: string, registryValue: string | undefined, otherValue: string | undefined): string {
  return `${kind}: registry='${registryValue ?? ""}' vs other='${otherValue ?? ""}'`;
}

export function assembleGraphDocument(input: RawStoreInput): { doc: GraphDocument; report: AssembleReport } {
  const { nodes, skipped } = convertRegistry(input.lemmas);
  const af = buildAfEdges(nodes, input.afRecords);
  const fr = buildFrEdges(nodes, input.frRecords);
  const bd = buildBdEdges(nodes, input.bdRecords);
  const retraction = buildRetractionEdges(nodes, input.retractionRecords ?? []);

  const unresolved: UnresolvedRef[] = [...af.unresolved, ...fr.unresolved, ...retraction.unresolved];

  const preConflicts: GraphDocument = {
    schema_version: GRAPH_SCHEMA_VERSION,
    nodes,
    edges: { af: af.edges, bd, fr: fr.edges, report: [], retraction: retraction.edges },
    unresolved,
    conflicts: [],
  };
  const conflicts: ConflictRecord[] = computeExpectedConflicts(preConflicts).map((e) => ({
    kind: e.kind,
    edge: e.edge,
    nodeId: e.nodeId,
    registryValue: e.registryValue,
    otherValue: e.otherValue,
    message: conflictMessage(e.kind, e.registryValue, e.otherValue),
  }));

  const doc = canonicalizeGraphDocument({ ...preConflicts, conflicts });

  const report: AssembleReport = {
    registrySkipped: skipped,
    lemmasIn: input.lemmas.length,
    nodesOut: nodes.length,
    afRecordsIn: input.afRecords.length,
    afResolved: af.edges.filter((e) => e.workspaceResolved).length,
    afUnresolved: af.edges.filter((e) => !e.workspaceResolved).length,
    frRecordsIn: input.frRecords.length,
    frResolved: fr.edges.filter((e) => e.resolutionMethod !== "unresolved").length,
    frUnresolved: fr.edges.filter((e) => e.resolutionMethod === "unresolved").length,
    bdRecordsIn: input.bdRecords.length,
    bdEdges: bd.length,
    retractionRecordsIn: (input.retractionRecords ?? []).length,
    retractionResolved: retraction.edges.filter((e) => e.resolved).length,
    retractionUnresolved: retraction.edges.filter((e) => !e.resolved).length,
    retractionsLive: retraction.edges.filter((e) => e.resolved && e.live).length,
  };
  return { doc, report };
}
