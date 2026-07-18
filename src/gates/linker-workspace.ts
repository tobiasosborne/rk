// PURITY: pure — no fs/network/clock (L3). Gate 2 (linker) af-workspace introspection, split out
// of linker-graph.ts to stay clear of CLAUDE.md's 280-line shard cap. Ground truth:
// argument.py:517-541 (`scan_workspaces`/`af_introspect`).
//
// af_introspect PURITY divergence (implementation necessity, not an L5 triage entry — no check's
// semantics or verdict changes). AISM's af_introspect() shells out to the real `af` CLI
// (`af get 1`, `af status`); src/gates/linker.ts is pure (L3) and may not. Every fact that CLI
// call would report (the root node's statement, the total node count) is already present in the
// workspace's own ledger event log under `proofs/<ws>/ledger/*.json` — `introspectWorkspace`
// below reads that log directly and reconstructs the identical two facts. Verified byte-for-byte
// against corpus fixtures built from REAL `af init`/`af refine` workspaces (linker-12, -14,
// -17..-20; corpus/README.md's Validation methodology) — the reconstructed node counts (27, 26,
// 1, 1) and root statements match what a live `af get 1`/`af status` call reported when those
// fixtures were built.

import type { RepoSnapshot } from "./snapshot";
import { hasPrefix, listDir } from "./snapshot";

/** Every `proofs/<name>` directory that has a `ledger/` subdirectory present — argument.py:517-521
 * `scan_workspaces`. Returns full `proofs/<name>` paths, sorted. */
export function scanWorkspaces(snapshot: RepoSnapshot): string[] {
  return listDir(snapshot, "proofs")
    .filter((name) => hasPrefix(snapshot, `proofs/${name}/ledger`))
    .map((name) => `proofs/${name}`)
    .sort();
}

export interface WorkspaceFacts {
  contract: string;
  nodes: number;
}

/** Reads `<workspace>/ledger/*.json` (sorted filename order = event order, zero-padded sequence
 * numbers) and reconstructs the two facts `af_introspect` reports: the root node's statement
 * (from the `node_created` event whose `node.id === "1"`, falling back to the
 * `proof_initialized` event's `conjecture` field if node "1" is somehow absent, and then
 * overridden by any later `node_amended` event whose `node_id === "1"` — see below) and the
 * total node count (`node_created` event count — `nodes_claimed` and other lifecycle events are
 * not node-creating; `node_amended` does not change the count). Returns `null` when the
 * workspace has no ledger at all (mirrors `af_introspect` returning `None` when
 * `(ws / "ledger").exists()` is false).
 *
 * `node_amended` handling (rk-co2): AISM's `af` CLI is an event-sourced store — `af get 1`
 * replays the FULL ledger, so a `node_amended` event supersedes the node's original
 * `node_created` statement. A real amendment record looks like (AISM
 * `proofs/lem-hx-financing-floor/ledger/000043.json`):
 *   {"type":"node_amended","node_id":"1","previous_statement":"...","new_statement":"..."}
 * — flat `node_id` (a string, not a nested `node.id`), plus `previous_statement`/
 * `new_statement` (no nested `node` object, unlike `node_created`). Applying `new_statement`
 * for `node_id === "1"` here makes this function mirror `af get 1`'s replay exactly, so the
 * extracted root can no longer read a stale pre-amendment statement. */
export function introspectWorkspace(snapshot: RepoSnapshot, workspace: string): WorkspaceFacts | null {
  const prefix = `${workspace}/ledger/`;
  const files = [...snapshot.keys()].filter((p) => p.startsWith(prefix) && p.endsWith(".json")).sort();
  if (files.length === 0) return null;

  let conjecture = "";
  let rootStatement = "";
  let nodes = 0;
  for (const path of files) {
    let entry: unknown;
    try {
      entry = JSON.parse(snapshot.get(path) ?? "{}");
    } catch {
      continue;
    }
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    if (rec.type === "proof_initialized" && typeof rec.conjecture === "string") {
      conjecture = rec.conjecture;
    }
    if (rec.type === "node_created") {
      nodes += 1;
      const node = rec.node as Record<string, unknown> | undefined;
      if (node && node.id === "1" && typeof node.statement === "string") {
        rootStatement = node.statement;
      }
    }
    if (rec.type === "node_amended" && rec.node_id === "1" && typeof rec.new_statement === "string") {
      rootStatement = rec.new_statement;
    }
  }
  return { contract: rootStatement || conjecture, nodes };
}
