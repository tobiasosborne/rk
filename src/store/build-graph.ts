// EDGE — composes every src/store/*-load.ts edge into one "repo root -> GraphDocument" pipeline.
// This is the entry point the M2.2 corpus harness (test/graph/corpus-rename-hazard.test.ts) and
// the AISM live-fire read-through drive; a future `rk graph` CLI (M2.5) is expected to call this
// same function rather than re-deriving the wiring.
//
// Workspace discovery: every DISTINCT `workspace:` value named by a lemma with `af != "none"` —
// read directly off the RAW `Lemma[]` (never off the already-converted `RegistryNode[]`, which
// would be a needless second pass since src/graph/assemble.ts's `convertRegistry` runs again
// inside `assembleGraphDocument` anyway). This is also where the rename-hazard discipline starts:
// the workspace LIST fed to `loadAfSources` comes from `lemma.workspace`, never `lemma.id`.

import type { Finding } from "../gates/framework";
import { assembleGraphDocument, type AssembleReport } from "../graph/assemble";
import type { AfSourceRecord } from "../graph/from-af";
import type { GraphDocument } from "../graph/types";
import { loadAfSources } from "./af-load";
import { type BdAbsent, type BdSource, loadBdSource } from "./bd-load";
import { type FrAbsent, loadFrSource, type FrSource } from "./fr-load";
import { loadRegistrySource } from "./registry-load";
import { loadRetractionSource, type RetractionSource } from "./retraction-load";

export interface BuildGraphOptions {
  afCommand?: readonly string[];
  frCommand?: readonly string[];
}

/** M2-boundary-review blocker 2 (2026-07-19, producer side): structural parse/conversion loss and
 * degraded/absent optional stores must be FIRST-CLASS build diagnostics, never silently absorbed
 * into a smaller-but-still-exit-0 report. `structuralLoss` names every place raw input was
 * rejected rather than projected (never a count alone — always the concrete path/line so a
 * consumer can point at it); `sources` distinguishes an authoritative empty read from a degraded
 * fallback from a store that was never engaged at all — three DIFFERENT states a renderer must
 * never conflate. `isStructurallyComplete` is `true` iff EVERY `structuralLoss` array is empty —
 * this module does not decide what a caller does with that (blocking render/graph output on it is
 * the consumer lane's job, per the review's own resolution), it only makes the fact visible. */
export interface BuildDiagnostics {
  structuralLoss: {
    registrySkips: { path: string; reason: string }[];
    frMalformedLines: { lineNo: number; snippet: string }[];
    /** rk-0ehr / P1: a corrupt `.rk/retractions.jsonl` is structural loss of the loudest kind —
     * the ledger that records which claims are WITHDRAWN cannot be read, so the graph's silence
     * about retraction is unearned. One entry per problem; empty when the ledger is healthy or
     * absent. */
    retractionStoreProblems: string[];
  };
  sources: {
    af: "export" | "ledger-fallback" | "absent";
    fr: "export" | "log-fallback" | "absent";
    bd: "read" | "absent";
    /** `corrupt` is deliberately a THIRD state, never folded into `absent`: "nothing was ever
     * retracted" and "we cannot tell what was retracted" are opposite claims. */
    retraction: "read" | "corrupt" | "absent";
  };
  isStructurallyComplete: boolean;
}

export interface BuildGraphResult {
  doc: GraphDocument;
  report: AssembleReport;
  registry: { total: number; ignored: string[]; parseFindings: Finding[] };
  fr: FrSource | FrAbsent;
  bd: BdSource | BdAbsent;
  retraction: RetractionSource;
  diagnostics: BuildDiagnostics;
}

/** `af` has no single "present/absent" flag of its own (src/store/af-load.ts issues one
 * `AfSourceRecord` per DISTINCT workspace named by a node with `af != "none"`) — degradation is a
 * binary-availability decision made once per build (the af binary is either on `$PATH` or it
 * is not), so any `degraded: true` record means every record this build read came via the
 * ledger fallback. Zero records at all means no node named an af workspace this run — af was
 * never engaged, not silently empty. */
function afSourceStatus(records: readonly AfSourceRecord[]): "export" | "ledger-fallback" | "absent" {
  if (records.length === 0) return "absent";
  return records.some((r) => r.degraded === true) ? "ledger-fallback" : "export";
}

function frSourceStatus(source: FrSource | FrAbsent): "export" | "log-fallback" | "absent" {
  if (!source.present) return "absent";
  return source.degraded ? "log-fallback" : "export";
}

function bdSourceStatus(source: BdSource | BdAbsent): "read" | "absent" {
  return source.present ? "read" : "absent";
}

export function buildGraphDocument(root: string, options: BuildGraphOptions = {}): BuildGraphResult {
  const registrySource = loadRegistrySource(root);

  const workspaces = [
    ...new Set(
      registrySource.lemmas
        .filter((l) => l.af !== "none" && l.workspace !== undefined)
        .map((l) => l.workspace as string),
    ),
  ].sort();
  const afRecords = loadAfSources(root, registrySource.snapshot, workspaces, options.afCommand ?? ["af"]);

  const frSource = loadFrSource(root, options.frCommand ?? ["fr"]);
  const frRecords = frSource.present ? frSource.records : [];

  const bdSource = loadBdSource(root);
  const bdRecords = bdSource.present ? bdSource.issues : [];

  // rk-0ehr / P1: the `l5-shard-bytes` liveness comparison needs each shard's CURRENT raw-bytes
  // sha256, which the snapshot already measured (`SnapshotFacts.sha256` — the exact domain
  // `l5ContentHash` pins, docs/worker-contract.md section (f)). Keyed by registry id, since that
  // is the retraction ledger's own join key; a shard the snapshot did not hash simply has no
  // entry, and the reader then fails closed rather than guessing.
  const currentHashes = new Map<string, string>();
  for (const l of registrySource.lemmas) {
    const hash = registrySource.snapshot.sha256.get(l.path);
    if (hash !== undefined) currentHashes.set(l.id, hash);
  }
  const retractionSource = loadRetractionSource(root, currentHashes);

  const { doc, report } = assembleGraphDocument({
    lemmas: registrySource.lemmas,
    afRecords,
    frRecords,
    bdRecords,
    retractionRecords: retractionSource.records,
  });

  const registrySkips = report.registrySkipped.map((s) => ({ path: s.path, reason: s.reason }));
  const frMalformedLines = frSource.present ? frSource.malformedLines : [];
  const retractionStoreProblems = retractionSource.problems;
  const diagnostics: BuildDiagnostics = {
    structuralLoss: { registrySkips, frMalformedLines, retractionStoreProblems },
    sources: {
      af: afSourceStatus(afRecords),
      fr: frSourceStatus(frSource),
      bd: bdSourceStatus(bdSource),
      retraction: !retractionSource.present ? "absent" : retractionSource.healthy ? "read" : "corrupt",
    },
    isStructurallyComplete:
      registrySkips.length === 0 && frMalformedLines.length === 0 && retractionStoreProblems.length === 0,
  };

  return {
    doc,
    report,
    registry: { total: registrySource.total, ignored: registrySource.ignored, parseFindings: registrySource.parseFindings },
    fr: frSource,
    bd: bdSource,
    retraction: retractionSource,
    diagnostics,
  };
}
