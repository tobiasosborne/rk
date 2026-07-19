// PURITY: pure — no fs/network/clock (L3). Gate 2 (linker) NEW check (M3.8, deliverable 2): the
// critical-path provenance check PRD C2 names — "every node on the path to the north-star
// contract must carry cross-vendor, non-batch validation provenance — checked continuously on
// every link run, because path membership changes when edges are added, not only at
// verdict-apply time." Ground truth: docs/gate-contracts.md Gate 2's "Critical-path provenance"
// section.
//
// THIS CHECK IS DELIBERATELY MORE LENIENT than src/drive/cross-vendor.ts's apply-time half — see
// that module's own header for the split rationale. Restated here since it is THE cutover
// semantics this file encodes:
//   - a critical-path node whose root identity does not carry a PARSEABLE cross-vendor seam on
//     BOTH `author` and `validatedBy` (absent entirely, or free text that does not decode via
//     `decodeVerifierSeam`) is read as PRE-CONVENTION LEGACY DATA -> WARNING, never an ERROR. This
//     is the exact, honest shape of AISM's 44 workspaces (author/validated_by/validation_batch_id
//     are entirely absent from every ledger event across all 44 — script-verified, see this WP's
//     final report) — the standing directive is "not demoted."
//   - a critical-path node whose root identity DOES decode on both sides, and the two families
//     are EQUAL, is POST-CONVENTION same-family -> ERROR, UNLESS the shard's frontmatter
//     `provenance:` field carries the literal token `legacy-same-family` (an explicit escape
//     hatch for administratively-grandfathered data that happens to carry a parseable seam) -> WARNING.
//   - different families -> satisfied, no finding at all.
//   - a validationBatchId present on a critical-path node is ALWAYS flagged (WARNING), regardless
//     of family — C3's critical-path exclusion should have kept this node per-node; a batch id
//     here means it did not, checked retrospectively (a batch validated before this node became
//     load-bearing, or the exclusion was bypassed).
// This check never blocks the gate on its own account for legacy/unparseable data — only a
// confirmed POST-convention same-family validation is an ERROR. It is presence-conditional on
// `config.northStarId` (PRD C2's own "no default" stance, M2.5 precedent): absent -> zero
// findings, honestly named on the coverage line, never a silent guess at which id is the north
// star.

import type { Finding } from "./framework";
import type { Lemma } from "./linker-parse";
import type { RootIdentityFacts } from "./linker-workspace";
import { decodeVerifierSeam } from "../drive/identity";
import { computeCriticalPath } from "../graph/query-path";
import type { GraphDocument, RegistryNode, AfFlag } from "../graph/types";

const LEGACY_MARKER = "legacy-same-family";

/** Adapter: `Lemma[]` (Gate 2's own parse) -> the minimal `GraphDocument` shape
 * `computeCriticalPath` needs. Only `id`/`deps`/`routes` are ever read by that query (via
 * src/graph/query-shared.ts's `requiredIds`) — every other `RegistryNode` field here is a filler
 * value, never consumed. Kept local to this file (not exported) since it exists solely to satisfy
 * `computeCriticalPath`'s parameter type without duplicating its traversal logic — see this file's
 * header for why the traversal itself is reused, not reimplemented. */
function toMinimalGraphDoc(lemmas: readonly Lemma[]): GraphDocument {
  const nodes: RegistryNode[] = lemmas.map((l) => ({
    id: l.id,
    kind: "lemma",
    path: l.path,
    contract: l.contract,
    af: (l.af === "seeded" || l.af === "validated" ? l.af : "none") as AfFlag,
    deps: l.deps,
    routes: l.routes,
    defs: l.defs,
    balloons: { count: 0, classifications: [] },
  }));
  return { schema_version: "1", nodes, edges: { af: [], bd: [], fr: [], report: [] }, unresolved: [], conflicts: [] };
}

export interface CriticalPathProvenanceResult {
  findings: Finding[];
  /** Critical-path, `af: validated` nodes with an introspectable identity that this check actually
   * evaluated — the coverage line's numerator. */
  checked: number;
  /** Size of the critical path (0 when no north star is configured, or the configured id resolves
   * to no real node). */
  criticalPathSize: number;
  northStarConfigured: boolean;
  northStarFound: boolean;
}

function hasLegacyMarker(l: Lemma): boolean {
  return l.provenance !== undefined && l.provenance.includes(LEGACY_MARKER);
}

/** Runs the critical-path provenance check. `identityOf` maps a lemma id to its af workspace's
 * root identity facts (src/gates/linker-workspace.ts's `introspectRootIdentity`) — callers build
 * this the same way `src/gates/linker.ts` already builds `wsContracts`/`nodeCounts` (skipping
 * `af: "none"` shards and unresolvable workspaces, since those are already covered by
 * `checkOrphans`/`checkContracts`). */
export function checkCriticalPathProvenance(
  lemmas: readonly Lemma[],
  northStarId: string | undefined,
  identityOf: ReadonlyMap<string, RootIdentityFacts>,
): CriticalPathProvenanceResult {
  if (northStarId === undefined) {
    return { findings: [], checked: 0, criticalPathSize: 0, northStarConfigured: false, northStarFound: false };
  }

  const path = computeCriticalPath(toMinimalGraphDoc(lemmas), northStarId);
  if (!path.found) {
    return { findings: [], checked: 0, criticalPathSize: 0, northStarConfigured: true, northStarFound: false };
  }

  const byId = new Map(lemmas.map((l) => [l.id, l] as const));
  const findings: Finding[] = [];
  let checked = 0;

  for (const id of path.nodeIds) {
    const l = byId.get(id);
    if (l === undefined || l.af !== "validated") continue; // nothing to check: not validated yet
    const facts = identityOf.get(id);
    // `facts.validated` (not `facts.validatedBy !== undefined`) is the correct skip guard: a node
    // can be genuinely validated with NO identity recorded at all (AISM's real shape, all 44
    // workspaces) — that is exactly the legacy population this check must still evaluate (and
    // warn about), not silently skip. See linker-workspace.ts's `RootIdentityFacts` doc comment.
    if (facts === undefined || !facts.validated) continue; // no introspectable workspace, or not (currently) validated — orphan/contract/status checks own those gaps

    checked++;

    if (facts.validationBatchId !== undefined) {
      findings.push({
        severity: "WARN",
        path: l.path,
        message: `critical-path node '${id}' was validated as part of batch '${facts.validationBatchId}' — batch-validated provenance on the path to the north star (checked after the fact; C3's critical-path exclusion should have forced per-node treatment here)`,
      });
    }

    // `facts.validatedBy` is itself optional (undefined exactly when the node was validated with
    // NO identity recorded at all — AISM's real shape); guard it the same way `facts.author` is
    // guarded just above, rather than handing `decodeVerifierSeam` a possibly-`undefined` value.
    const authorDecoded = facts.author !== undefined ? decodeVerifierSeam(facts.author) : undefined;
    const verifierDecoded = facts.validatedBy !== undefined ? decodeVerifierSeam(facts.validatedBy) : undefined;
    const bothParse = authorDecoded?.ok === true && verifierDecoded?.ok === true;

    if (!bothParse) {
      // Recommended cutover semantics (docs/gate-contracts.md Gate 2): absence of a parseable
      // seam on either side = legacy = WARNING. This is the AISM shape (author/validated_by
      // entirely absent from every one of its 44 workspaces' ledgers).
      findings.push({
        severity: "WARN",
        path: l.path,
        message: `critical-path node '${id}' carries no parseable cross-vendor identity (legacy-same-family: predates the verifier-identity seam convention) — re-verification recommended, prioritized by path criticality, never forced`,
      });
      continue;
    }

    const proverFamily = authorDecoded.identity.modelFamily;
    const verifierFamily = verifierDecoded.identity.modelFamily;
    if (proverFamily === verifierFamily) {
      if (hasLegacyMarker(l)) {
        findings.push({
          severity: "WARN",
          path: l.path,
          message: `critical-path node '${id}' is same-family (${proverFamily}) but explicitly marked 'provenance: ${LEGACY_MARKER}' — grandfathered, never demoted`,
        });
      } else {
        findings.push({
          severity: "ERROR",
          path: l.path,
          message: `critical-path node '${id}' validated same-family (prover=verifier=${proverFamily}) — the cross-vendor rule requires verifier model family != prover model family for load-bearing claims (PRD C9)`,
        });
      }
    }
    // different families: satisfied, no finding.
  }

  return { findings, checked, criticalPathSize: path.nodeIds.length, northStarConfigured: true, northStarFound: true };
}
