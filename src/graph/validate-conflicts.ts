// PURITY: pure — no fs/network/clock (L3). Conflict recomputation — Tier A review blocker 3
// (2026-07-19, docs/memos/2026-07-19-graph-schema-v1.md's "review outcomes"): "Contradictory
// proof state can validate with an empty conflict list... have validation recompute the known
// conflicts so missing, duplicate, or inconsistent conflict records are errors." Split out of
// validate.ts to stay clear of CLAUDE.md's 280-line shard cap.
//
// SCOPE (stated honestly, not over-claimed): three triggers are recomputed here:
//   1. EVERY resolved af edge is checked for `contractMatch` — a byte-mismatched registry/root
//      join is a validity defect whatever rung the shard currently declares (rk-45dj; the campaign
//      incident was `proved-mod-audit` + `af: seeded`, so gating this on `status: proved` hid it).
//   2. `status: "proved"` nodes (PRD §5: "proved | yes | af-validated (root validated, taint
//      clean)") are additionally checked against their af flag, workspace resolution,
//      `epistemicState`, and `taintState`.
//   3. fr edges with `outcome === "banked"` (../knowledge-frontier's `Outcome`) checked against
//      `verdict`/`verdictFresh` — fr's own bank-gate ("▣ banked needs an audit verdict from an
//      oracle other than the author", ../knowledge-frontier/docs/concepts.md).
// Any OTHER status/state combination (e.g. an `open` node with a `validated` af edge) is a real
// but DIFFERENT anomaly, left to M2.3. Known limitation, documented rather than silently
// papered over: `banked-without-oracle`'s identity is `(kind, edge, nodeId)`, same as the af-side
// kinds — TWO distinct banked-without-oracle-eligible fr edges resolving to the SAME node would
// collapse under one identity. Narrow enough for M2.1 (a real occurrence needs its own WP), but
// worth flagging for M2.3, not silently inherited.

import type { ConflictKind, ConflictRecord, GraphDocument, RegistryNode } from "./types";
import { err, type GraphIssue } from "./validate-issue";

export interface ExpectedConflict {
  kind: ConflictKind;
  edge: "af" | "fr" | "retraction";
  nodeId?: string;
  registryValue?: string;
  otherValue?: string;
}

function identity(kind: ConflictKind, edge: ConflictRecord["edge"], nodeId: string | undefined): string {
  return `${kind} ${edge} ${nodeId ?? ""}`;
}

/** Exported for src/graph/assemble.ts (M2.2): the store-reader assembly boundary needs the SAME
 * recomputation this validator checks against, so a freshly-assembled `GraphDocument`'s
 * `conflicts` array is populated from one source of truth rather than a second hand-maintained
 * copy of this logic. The function body is UNCHANGED by this export — a pure visibility change,
 * not a validity-semantics edit. */
export function computeExpectedConflicts(doc: GraphDocument): ExpectedConflict[] {
  const out: ExpectedConflict[] = [];
  const afByNode = new Map(doc.edges.af.map((e) => [e.nodeId, e]));

  for (const n of doc.nodes) {
    const e = afByNode.get(n.id);
    // rk-45dj: contract agreement belongs to the JOIN, not to the `proved` rung. `rk graph --focus`
    // already printed contractMatch=false for a `proved-mod-audit`/seeded campaign shard, while
    // conflict recomputation skipped it here and the obligatory `rk check` surface stayed green.
    // Keep the established registryValue vocabulary (the node's declared status), using "unset"
    // for the genuinely absent state rather than fabricating a rung.
    if (e?.workspaceResolved && !e.contractMatch) {
      out.push({
        kind: "contract-mismatch",
        edge: "af",
        nodeId: n.id,
        registryValue: n.status ?? "unset",
        otherValue: "contractMatch:false",
      });
    }

    if (n.status !== "proved") continue;
    if (n.af !== "validated" || !e) {
      out.push({ kind: "status-mismatch", edge: "af", nodeId: n.id, registryValue: "proved", otherValue: n.af });
      continue;
    }
    if (!e.workspaceResolved) {
      out.push({ kind: "status-mismatch", edge: "af", nodeId: n.id, registryValue: "proved", otherValue: "workspace-unresolved" });
      continue;
    }
    if (e.epistemicState !== "validated") {
      out.push({ kind: "status-mismatch", edge: "af", nodeId: n.id, registryValue: "proved", otherValue: e.epistemicState });
    }
    if (e.taintState !== "clean") {
      out.push({ kind: "taint-status-mismatch", edge: "af", nodeId: n.id, registryValue: "proved", otherValue: e.taintState });
    }
  }

  // M2-boundary-review blocker 7 (2026-07-19): derive the FULL set of superseded cycle ids from
  // every edge's own `supersedes` field (types-edges.ts:101-106 — a consumer derives "is this
  // cycle superseded" by scanning for another edge's `supersedes` pointing at it; there is no
  // `supersededBy` mirror stored). A superseded cycle is never promotion/conflict-bearing —
  // excluded from the computation below — but it stays fully visible in `doc.edges.fr` itself;
  // only the CONFLICT computation ignores it.
  const supersededCycles = new Set<number>();
  for (const e of doc.edges.fr) {
    if (e.supersedes !== undefined) supersededCycles.add(e.supersedes);
  }

  // M2-boundary-review blocker 8 (2026-07-19, bead rk-tns's ratified v1 semantics — the review's
  // verdict (c): "coalesce v1 conflicts at node level", no schema bump): `banked-without-oracle`'s
  // identity is (kind, edge, nodeId) — TWO distinct qualifying cycles resolving to the SAME node
  // must NOT become two recorded conflicts sharing one identity (checkConflicts would then flag
  // them as duplicates of each other on an otherwise-correct document). v1 defines this as ONE
  // node-level EXISTENTIAL defect: "this node has at least one live banked claim lacking a fresh
  // oracle verdict." Qualifying cycles are collected per node and coalesced into a single entry
  // here; every individual cycle remains fully visible in `doc.edges.fr` regardless.
  const unbackedVerdictsByNode = new Map<string, Set<string>>();
  for (const e of doc.edges.fr) {
    if (e.outcome !== "banked") continue;
    if (e.resolutionMethod === "unresolved") continue; // no node to anchor a conflict to; the
    // unresolved-bucket accounting (validate-fr.ts) already flags this cycle elsewhere.
    if (supersededCycles.has(e.cycle)) continue; // superseded — never promotion/conflict-bearing.
    // M2-boundary-review blocker 6 (2026-07-19): `verdictFresh` MUST be REQUIRED true, not merely
    // "not false" — `undefined` (the primary export path with no matching oracle verdict record
    // at all, or ANY ledger-fallback edge, which never recomputes freshness — src/store/
    // fr-load.ts's own doc comment) is NOT oracle-backed. Treating `undefined !== false` as truthy
    // let a degraded/absent freshness read silently pass the bank-gate.
    const oracleBacked = e.verdict === "banked" && e.verdictFresh === true;
    if (oracleBacked) continue;
    const verdicts = unbackedVerdictsByNode.get(e.resolvedNodeId) ?? new Set<string>();
    verdicts.add(e.verdict ?? "none");
    unbackedVerdictsByNode.set(e.resolvedNodeId, verdicts);
  }
  for (const [nodeId, verdicts] of unbackedVerdictsByNode) {
    out.push({
      kind: "banked-without-oracle",
      edge: "fr",
      nodeId,
      registryValue: "banked",
      // Deterministic even when multiple qualifying cycles on the same node disagree on verdict
      // text (e.g. one "claimed", another "audited"): every distinct value, sorted, joined — never
      // an arbitrarily-chosen single cycle's value standing in for the whole node.
      otherValue: [...verdicts].sort().join(","),
    });
  }

  // rk-0ehr / P1 (graph `schema_version: "2"`), the FIFTH kind: `retraction-vs-status`. A LIVE
  // retraction on a resolved node ALWAYS conflicts — unconditionally, whatever the node's declared
  // status happens to be. Three reasons this is not gated on a rigorous-status list:
  //   1. TRUTHFULNESS. The conflict is the mechanism by which no render surface can present a
  //      retracted item as validated/proved (src/render/styling.ts's `effectivePresentation` folds
  //      any conflict naming a node into `DEFECT_TIER_CLASS`, `rigorous: false`). A veto that
  //      depends on a status list would silently stop working the day the list drifts.
  //   2. The withdrawal is a FACT about the item, not a disagreement between two status vocabularies
  //      — a shard already demoted to `stated` is still a shard whose claim was withdrawn, and a
  //      reader deserves to see that rather than a plain "stated" node indistinguishable from one
  //      that was never claimed at all. (This is exactly what AISM's prose-only retraction lost.)
  //   3. It makes the conflict set a pure function of `edges.retraction`, so the recomputation
  //      invariant below cannot be satisfied by a document that quietly dropped a live retraction.
  // NODE-LEVEL IDENTITY (same discipline as `banked-without-oracle` above): identity is
  // `(kind, edge, nodeId)`, so several live retractions on ONE node coalesce into ONE conflict.
  // The HIGHEST-ordinal live record is the one named — deterministic, never an arbitrary pick.
  const liveByNode = new Map<string, { ordinal: number; hashDomain: string }>();
  for (const e of doc.edges.retraction) {
    if (!e.resolved || !e.live) continue;
    const prev = liveByNode.get(e.nodeId);
    if (prev === undefined || e.ordinal > prev.ordinal) liveByNode.set(e.nodeId, { ordinal: e.ordinal, hashDomain: e.hashDomain });
  }
  const statusByNode = new Map(doc.nodes.map((n) => [n.id, n.status]));
  for (const [nodeId, live] of liveByNode) {
    out.push({
      kind: "retraction-vs-status",
      edge: "retraction",
      nodeId,
      // "unset" rather than "" — an absent status is a real, distinct state (src/render/styling.ts's
      // `UNSET_STYLE`), never folded into a real status and never rendered as an empty string.
      registryValue: statusByNode.get(nodeId) ?? "unset",
      otherValue: `retracted (${live.hashDomain}, ordinal ${live.ordinal})`,
    });
  }

  return out;
}

/** Recomputes the conflict set the raw node/edge data implies and ERRORs on: a computed conflict
 * with no matching recorded entry (missing); more than one recorded entry sharing an identity
 * (duplicate); a recorded entry whose `registryValue`/`otherValue` disagree with the computed
 * values (inconsistent); or a recorded entry whose identity matches no computed conflict at all
 * (unsupported — the underlying condition does not actually hold). */
export function checkConflicts(doc: GraphDocument, nodeById: ReadonlyMap<string, RegistryNode>, issues: GraphIssue[]): void {
  const expected = computeExpectedConflicts(doc);

  const recordedByKey = new Map<string, ConflictRecord[]>();
  for (const c of doc.conflicts) {
    if (c.nodeId !== undefined && !nodeById.has(c.nodeId)) {
      issues.push(err(`conflict (${c.kind}) references unknown node '${c.nodeId}'`, c.nodeId));
    }
    const key = identity(c.kind, c.edge, c.nodeId);
    const list = recordedByKey.get(key) ?? [];
    list.push(c);
    recordedByKey.set(key, list);
  }

  const expectedKeys = new Set<string>();
  for (const e of expected) {
    const key = identity(e.kind, e.edge, e.nodeId);
    expectedKeys.add(key);
    const recorded = recordedByKey.get(key);
    const label = `${e.kind} (${e.edge}${e.nodeId ? `, node '${e.nodeId}'` : ""})`;
    if (!recorded || recorded.length === 0) {
      issues.push(err(`missing conflict record: ${label} — registry='${e.registryValue}' vs other='${e.otherValue}'`, e.nodeId));
      continue;
    }
    if (recorded.length > 1) {
      issues.push(err(`duplicate conflict record: ${label} recorded ${recorded.length} times`, e.nodeId));
    }
    for (const c of recorded) {
      if (c.registryValue !== e.registryValue || c.otherValue !== e.otherValue) {
        issues.push(
          err(
            `conflict record ${label} inconsistent with computed state: recorded registry=` +
              `'${c.registryValue}'/other='${c.otherValue}', computed registry='${e.registryValue}'/other='${e.otherValue}'`,
            e.nodeId,
          ),
        );
      }
    }
  }

  for (const [key, recorded] of recordedByKey) {
    if (expectedKeys.has(key)) continue;
    for (const c of recorded) {
      issues.push(
        err(`conflict record ${c.kind} (${c.edge}${c.nodeId ? `, node '${c.nodeId}'` : ""}) is not supported by any computed conflict`, c.nodeId),
      );
    }
  }
}
