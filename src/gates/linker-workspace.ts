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

/** M3.8 (EDIT flagged for the M3 boundary review — this is the read path Gate 2's new critical-
 * path provenance check uses): the ROOT node's ("1") identity provenance — the same three fields
 * `af export --graph json` additively exposes (`author`/`validated_by`/`validation_batch_id`,
 * ../vibefeld/docs/export-graph-v1.md) — reconstructed the same DIRECT-ledger way
 * `introspectWorkspace` above reconstructs contract/node-count, because this gate is pure (L3)
 * and may not shell out to `af export` the way the driver-side reader
 * (src/drive/driver-af.ts's `parseAfExport`) does.
 *
 * `author` comes from node "1"'s OWN `node_created` event (`node.author`, ../vibefeld
 * internal/node/node.go's `Node.Author` field) and is set once, never touched by a later
 * amendment. This is DELIBERATELY NOT `proof_initialized`'s own top-level `author` field (visible
 * on every AISM ledger, e.g. `{"type":"proof_initialized",...,"author":"orchestrator"}`) — that
 * field predates V1 entirely and records the workspace's overall creator identity, a different
 * fact from the per-node prover identity V1 added; conflating the two would be a bespoke parse
 * this module must not invent.
 *
 * `validated`/`validatedBy`/`validationBatchId` are derived from the LATEST `node_validated`
 * event for node "1", CLEARED by a later `node_unvalidated` event — mirrors af's own
 * `state.apply.go` projection (`ValidatedBy`/`ValidationBatchID` are cleared exactly as the single-
 * node unvalidate path already does, ../vibefeld/handoff.md's V1 session notes). Returns `null`
 * only when the workspace has no ledger at all (mirrors `introspectWorkspace`'s own contract).
 *
 * `validated` (a plain boolean, tracked SEPARATELY from `validatedBy`) is the fix for a real gap
 * caught building this WP's own corpus fixtures: AISM's real ledgers (all 44 workspaces,
 * pre-V1-identity) DO carry `node_validated` events with ZERO identity fields at all — the node
 * genuinely was validated, just anonymously. Collapsing "never validated" and "validated with no
 * identity recorded" into one `validatedBy === undefined` state would make Gate 2's critical-path
 * check SILENTLY SKIP exactly the population the grandfathering rule exists to warn about
 * (corpus/linker/linker-32 pins this: without `validated`, that fixture read as "not yet
 * validated, nothing to check" and produced zero findings instead of the required WARNING). */
export function introspectRootIdentity(snapshot: RepoSnapshot, workspace: string): RootIdentityFacts | null {
  const prefix = `${workspace}/ledger/`;
  const files = [...snapshot.keys()].filter((p) => p.startsWith(prefix) && p.endsWith(".json")).sort();
  if (files.length === 0) return null;

  let author: string | undefined;
  let validated = false;
  let validatedBy: string | undefined;
  let validationBatchId: string | undefined;
  for (const path of files) {
    let entry: unknown;
    try {
      entry = JSON.parse(snapshot.get(path) ?? "{}");
    } catch {
      continue;
    }
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;

    if (rec.type === "node_created") {
      const node = rec.node as Record<string, unknown> | undefined;
      if (node && node.id === "1" && typeof node.author === "string" && node.author.length > 0) {
        author = node.author;
      }
    }
    if (rec.type === "node_validated" && rec.node_id === "1") {
      validated = true;
      validatedBy = typeof rec.verified_by === "string" && rec.verified_by.length > 0 ? rec.verified_by : undefined;
      validationBatchId = typeof rec.batch_id === "string" && rec.batch_id.length > 0 ? rec.batch_id : undefined;
    }
    if (rec.type === "node_unvalidated" && rec.node_id === "1") {
      validated = false;
      validatedBy = undefined;
      validationBatchId = undefined;
    }
  }
  return { author, validated, validatedBy, validationBatchId };
}

export interface RootIdentityFacts {
  /** The root node's driver-supplied author identity, or `undefined` when none was ever recorded
   * (a pre-V1 ledger — this is AISM's real shape, all 44 workspaces; or a `--author`-less init). */
  author?: string;
  /** True iff the LATEST relevant event was `node_validated` (not superseded by a later
   * `node_unvalidated`) — i.e. the node IS currently validated, independent of whether any
   * identity was recorded for that validation. See this function's doc comment for why this is a
   * separate field from `validatedBy`, not inferred from it. */
  validated: boolean;
  /** The LATEST verifier identity that validated node "1", or `undefined` when never validated,
   * subsequently unvalidated (cleared), or validated WITHOUT a recorded identity (AISM's shape —
   * `validated` is true in that case, `validatedBy` is still `undefined`). */
  validatedBy?: string;
  /** The batch id recorded when node "1" was validated as part of a batch, or `undefined` for a
   * singly-validated node (or one never validated / since unvalidated). */
  validationBatchId?: string;
}
