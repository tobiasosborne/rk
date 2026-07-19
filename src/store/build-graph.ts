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
import type { GraphDocument } from "../graph/types";
import { loadAfSources } from "./af-load";
import { type BdAbsent, type BdSource, loadBdSource } from "./bd-load";
import { type FrAbsent, loadFrSource, type FrSource } from "./fr-load";
import { loadRegistrySource } from "./registry-load";

export interface BuildGraphOptions {
  afCommand?: readonly string[];
  frCommand?: readonly string[];
}

export interface BuildGraphResult {
  doc: GraphDocument;
  report: AssembleReport;
  registry: { total: number; ignored: string[]; parseFindings: Finding[] };
  fr: FrSource | FrAbsent;
  bd: BdSource | BdAbsent;
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

  const { doc, report } = assembleGraphDocument({
    lemmas: registrySource.lemmas,
    afRecords,
    frRecords,
    bdRecords,
  });

  return {
    doc,
    report,
    registry: { total: registrySource.total, ignored: registrySource.ignored, parseFindings: registrySource.parseFindings },
    fr: frSource,
    bd: bdSource,
  };
}
