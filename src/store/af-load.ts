// EDGE — subprocess (`af export --graph json`) + fs (direct-ledger fallback, via the already-
// loaded `RepoSnapshot`). Reads af's projection of every workspace a registry node names via its
// `workspace:` field. Primary path: invoke the real `af export --graph json --dir <abs>` (V4,
// ../vibefeld/docs/export-graph-v1.md) per workspace — deterministic, authoritative, and the only
// path that can report `epistemic_state`/`taint_state` faithfully. Fallback path (af binary
// unavailable — `Bun.spawnSync` throws "Executable not found in $PATH"): reuse
// src/gates/linker-workspace.ts's PURE `introspectWorkspace` (already reads `proofs/<ws>/
// ledger/*.json` off the SAME snapshot src/store/registry-load.ts built, no second fs walk) to
// reconstruct the root statement + node count.
//
// The fallback is deliberately REDUCED FIDELITY, not a reimplementation of af's engine: af's
// three-axis state (workflow/epistemic/taint) is derived from ledger event types
// (`node_validated`, taint bookkeeping, etc.) whose full state-machine semantics live only in
// af's own Go source — reimplementing that in TS would be a second, drift-prone copy of af's
// engine, not a store reader. When the primary path is unavailable, the fallback reports
// `epistemicState: "pending"`, `taintState: "unresolved"` — af's OWN initial-state defaults for a
// freshly-created, not-yet-validated node (the least-claiming honest answer, never a fabricated
// "validated"/"clean") — and sets `degraded: true` so a caller can surface the reduced-fidelity
// note rather than silently presenting it as equivalent to a real export. This is a deliberate,
// documented scope line (see the M2.2 AISM read-through memo), not a TODO.

import { join } from "node:path";
import { introspectWorkspace } from "../gates/linker-workspace";
import type { RepoSnapshot } from "../gates/snapshot";
import type { AfSourceRecord } from "../graph/from-af";

interface AfExportNode {
  id: string;
  statement?: string;
  epistemic_state?: string;
  taint_state?: string;
}
interface AfExportDoc {
  schema_version?: string;
  nodes?: AfExportNode[];
  validation?: { total_nodes?: number };
}

function runAfExport(absWorkspace: string, afCommand: readonly string[]): AfSourceRecord | "unavailable" {
  let proc: ReturnType<typeof Bun.spawnSync>;
  try {
    proc = Bun.spawnSync([...afCommand, "export", "--graph", "json", "--dir", absWorkspace]);
  } catch {
    return "unavailable"; // the af binary itself is not on PATH — caller falls back
  }
  if (proc.exitCode !== 0) {
    const stderr = proc.stderr.toString().trim();
    return { workspace: "", found: false, reason: stderr.length > 0 ? stderr : `af export exited ${proc.exitCode}` };
  }
  let doc: AfExportDoc;
  try {
    doc = JSON.parse(proc.stdout.toString());
  } catch {
    return { workspace: "", found: false, reason: "af export produced unparseable JSON" };
  }
  const root = (doc.nodes ?? []).find((n) => n.id === "1");
  return {
    workspace: "",
    found: true,
    schemaVersion: doc.schema_version,
    rootNodeId: root?.id,
    rootStatement: root?.statement,
    epistemicState: root?.epistemic_state,
    taintState: root?.taint_state,
    nodeCount: doc.validation?.total_nodes,
  };
}

function runLedgerFallback(snapshot: RepoSnapshot, workspace: string): AfSourceRecord {
  const facts = introspectWorkspace(snapshot, workspace);
  if (facts === null) {
    return { workspace, found: false, reason: "af binary unavailable and no ledger/ found at this workspace" };
  }
  return {
    workspace,
    found: true,
    degraded: true,
    schemaVersion: "ledger-fallback",
    rootNodeId: "1",
    rootStatement: facts.contract,
    epistemicState: "pending",
    taintState: "unresolved",
    nodeCount: facts.nodes,
  };
}

/** One `AfSourceRecord` per distinct workspace in `workspaces` (repo-relative `proofs/<name>`
 * paths — typically every DISTINCT `workspace:` value named by a registry node with
 * `af != "none"`). `root` is the repo root (workspaces are resolved relative to it);
 * `afCommand` defaults to `["af"]` and exists so a test can point at a binary guaranteed absent,
 * exercising the fallback deterministically without touching `$PATH`. */
export function loadAfSources(
  root: string,
  snapshot: RepoSnapshot,
  workspaces: readonly string[],
  afCommand: readonly string[] = ["af"],
): AfSourceRecord[] {
  return workspaces.map((workspace) => {
    const abs = join(root, ...workspace.split("/"));
    const viaExport = runAfExport(abs, afCommand);
    const record = viaExport === "unavailable" ? runLedgerFallback(snapshot, workspace) : viaExport;
    return { ...record, workspace };
  });
}
