// PURITY: pure — no fs/network/clock (L3). M3.8's APPLY-TIME half of the cross-vendor rule (PRD
// §4 C9 / C2's critical-path provenance check; docs/worker-contract.md section (e)): "promotion
// to `proved` requires verifier model family != prover model family for load-bearing claims
// ... checked at verdict-apply time and continuously by the linker". This module is the
// verdict-apply-time decision core src/drive/driver-run.ts's `verifyOneNode` calls before an
// ACCEPT item is ever added to a verdict file (never after — see driver-run.ts's own comment at
// the call site). The linker's continuous half (Gate 2, src/gates/linker-crossvendor.ts) is a
// SEPARATE, differently-lenient check over ALREADY-recorded provenance — see that module's header
// for why the two enforcement points deliberately disagree on how to treat an unparseable
// identity (this module fails closed; the linker warns and grandfathers).
//
// docs/worker-contract.md section (e), restated as the one rule this module enforces: "M3.8's
// cross-vendor check MUST decode both the prover's and the verifier's recorded identity strings
// through `decodeVerifierSeam` before comparing `modelFamily` — never a bespoke parse, and a
// decode failure must be treated as 'family unknown, cross-vendor check cannot proceed,' never as
// a silent pass."

import { computeCriticalPath } from "../graph/query-path";
import type { GraphDocument } from "../graph/types";
import { decodeVerifierSeam } from "./identity";
import type { ModelFamily } from "./vocab";

export type CrossVendorReason = "cross-family" | "same-family" | "identity-unparseable";

export interface CrossVendorDecision {
  /** True iff this accept may proceed. Always true when `loadBearing` is false (PRD: "Non-
   * critical-path: same-family allowed, recorded") — `reason` still reports what was found, since
   * "recorded" means the fact is surfaced even when it does not block. When `loadBearing` is
   * true, `satisfied` is true iff `reason === "cross-family"` — both "same-family" and
   * "identity-unparseable" fail closed on a load-bearing claim, and (per the brief) they are
   * distinct reasons: an apply-time caller must never report an unparseable identity as if it
   * were a confirmed same-family violation, or vice versa. */
  satisfied: boolean;
  reason: CrossVendorReason;
  proverFamily?: ModelFamily;
  verifierFamily?: ModelFamily;
}

/** Decides the cross-vendor question for one accept: `authorRaw` is the node's recorded author
 * identity (af export's/ledger's `author`/`author` field, `undefined` when the node carries none
 * — a pre-V1 ledger, or a root node whose `--author` was never set); `verifierRaw` is the
 * candidate verifier's identity seam (driver-constructed, `src/drive/identity.ts`'s
 * `encodeVerifierSeam` output — but this function decodes it itself rather than trusting the
 * caller already validated it, so a future caller passing a raw `validated_by` string gets the
 * same honest treatment). `loadBearing` is the caller's own critical-path determination (PRD C2:
 * "every node on the path to the north-star" — computed by whoever wires this up, e.g. via
 * `src/graph/query-path.ts`'s `computeCriticalPath`; this module has no graph access of its own,
 * L3).
 *
 * Both sides must decode successfully for a family COMPARISON to happen at all — if EITHER side
 * fails to parse (or is entirely absent), the reason is `identity-unparseable`, never guessed as
 * same- or cross-family. This is the fail-closed half of the split cutover: unlike the linker's
 * continuous check (which treats "no parseable seam" as legacy and merely warns), an apply-time
 * caller is about to mint a NEW validation event, so an unresolvable identity on a load-bearing
 * claim must block, not warn. */
/** GAP 9: picks the prover-of-record identity a cross-vendor check compares for a node. For a
 * DECOMPOSED node the prover-of-record is the DECOMPOSER — af record-proof's `proof_author` stamp
 * (../vibefeld internal/ledger NodeProofAuthored) — NOT the node's own content `author`. This
 * matters for the ROOT: its `author` is the `af init` stamp (e.g. "rk-m3.5-baseline-prep", an
 * orchestration identity that decodes to no model family), while its `proofAuthor` is the campaign
 * prover that actually proved it by decomposition — the same family stamp its now-validated
 * CHILDREN already carry. Precedence: proof-author WHEN PRESENT, else the node author (unchanged
 * pre-GAP-9 behavior), else `undefined` → `decideCrossVendor` fails closed EXACTLY as before. This
 * only chooses WHICH recorded field is the prover-of-record; it never invents an identity, so a
 * node with neither still fails closed on a load-bearing claim. The fail-closed posture for
 * genuinely unattributed proofs is untouched. */
export function proverOfRecord(proofAuthor: string | undefined, author: string | undefined): string | undefined {
  return proofAuthor ?? author;
}

export function decideCrossVendor(authorRaw: string | undefined, verifierRaw: string, loadBearing: boolean): CrossVendorDecision {
  const authorDecoded = authorRaw !== undefined ? decodeVerifierSeam(authorRaw) : undefined;
  const verifierDecoded = decodeVerifierSeam(verifierRaw);

  const proverFamily = authorDecoded?.ok ? authorDecoded.identity.modelFamily : undefined;
  const verifierFamily = verifierDecoded.ok ? verifierDecoded.identity.modelFamily : undefined;

  if (proverFamily === undefined || verifierFamily === undefined) {
    return { satisfied: !loadBearing, reason: "identity-unparseable", proverFamily, verifierFamily };
  }
  if (proverFamily === verifierFamily) {
    return { satisfied: !loadBearing, reason: "same-family", proverFamily, verifierFamily };
  }
  return { satisfied: true, reason: "cross-family", proverFamily, verifierFamily };
}

// ------------------------------------------------------------------------------------------------
// rk-bun: RESOLVING `decideCrossVendor`'s third argument from real graph state.
//
// `decideCrossVendor` above takes `loadBearing` as a caller determination and says so. In the LIVE
// hard-tier driver that determination was the hard-coded constant `isLoadBearing: () => true`
// (src/cli/verify-live.ts, merge reconciliation e69efd9): real critical-path membership was never
// computed at all. That constant points in the SAFE direction — everything load-bearing means
// cross-vendor is always required — so it was never a false green. But it also means a researcher
// with only ONE model vendor configured can promote NOTHING, ever, anywhere in the campaign
// (bead rk-id1), because PRD C9's "Non-critical-path: same-family allowed, recorded" branch is
// unreachable. Wiring REAL membership is what makes that branch, and an honest degraded path for a
// single-vendor user, possible at all.
//
// This resolver is the same seam as src/drive/batch-eligibility.ts (rk-74o): it does not accept a
// caller's summary verdict ("this node is load-bearing"); it takes the PRIMITIVE facts — the
// projected graph and the configured north-star id — and derives membership itself via M2.5's own
// `computeCriticalPath`, the identical query the batch screen uses, so the two enforcement points
// can never disagree about what "on the path" means.
//
// FAIL CLOSED, AND SAY WHICH KIND OF NO. Every resolution carries a `determinacy`: `determined`
// (membership was actually computed — on the path, or genuinely off it) vs `indeterminate` (it could
// not be computed: no north star configured, a north star naming no node, a claim naming no node).
// EVERY indeterminate answer is `loadBearing: true` — the strict direction — and is reported as
// indeterminate rather than dressed up as a determined "on the path". This is the same refusal to
// conflate an unknown with a known that makes `identity-unparseable` a distinct reason from
// `same-family` above. `off-critical-path` is the ONLY reason in the enum that ever yields
// `loadBearing: false`.
// ------------------------------------------------------------------------------------------------

export type LoadBearingReason =
  | "on-critical-path" | "off-critical-path"
  | "north-star-unconfigured" | "north-star-unresolved" | "claim-not-in-graph";

/** `determined` = membership was computed; `indeterminate` = it could not be, so the strict answer
 * stands. Mirrors src/drive/batch-eligibility.ts's `Determinacy`. */
export type LoadBearingDeterminacy = "determined" | "indeterminate";

export const LOAD_BEARING_DETERMINACY: Record<LoadBearingReason, LoadBearingDeterminacy> = {
  "on-critical-path": "determined",
  "off-critical-path": "determined",
  "north-star-unconfigured": "indeterminate",
  "north-star-unresolved": "indeterminate",
  "claim-not-in-graph": "indeterminate",
};

export interface LoadBearingResolution {
  /** What to pass as `decideCrossVendor`'s `loadBearing`. True for every `indeterminate` reason. */
  loadBearing: boolean;
  determinacy: LoadBearingDeterminacy;
  reason: LoadBearingReason;
  /** The north-star id membership was computed against; `undefined` iff none was configured. */
  northStarId?: string;
  /** One sentence naming what was checked and what was found — never a value the resolver did not
   * actually observe. Printed verbatim at `rk verify --live`'s preflight. */
  detail: string;
}

/** Resolves whether `claimId` (a REGISTRY node id — the `rk verify --af <id>` target) is on the
 * critical path to `northStarId`, over the projected graph `doc`. Pure; never throws.
 *
 * SCOPE, stated honestly: this answers the question at the REGISTRY-CLAIM level, which is the level
 * the critical path is defined at (PRD C2/C5 — the path runs over registry dep/route edges; an af
 * proof tree lives strictly INSIDE one registry claim). A caller driving an af workspace therefore
 * gets one answer for the whole workspace, and should treat af's own per-node `crux` flag as an
 * ADDITIONAL, strictly-stricter filter on top of it (the same "registry critical path is the primary
 * C3 notion, with af crux as an additional filter" ordering src/drive/batch-eligibility.ts uses) —
 * never as a way to relax this answer. */
export function resolveLoadBearing(doc: GraphDocument, northStarId: string | undefined, claimId: string): LoadBearingResolution {
  const strict = (reason: LoadBearingReason, detail: string, ns?: string): LoadBearingResolution =>
    ({ loadBearing: true, determinacy: LOAD_BEARING_DETERMINACY[reason], reason, ...(ns !== undefined ? { northStarId: ns } : {}), detail });

  if (northStarId === undefined || northStarId.trim() === "") {
    return strict(
      "north-star-unconfigured",
      `no north star is configured, so critical-path membership cannot be computed for any node — set "northStarId" in .rk/config.json or pass --north-star <id>`,
    );
  }
  const critical = computeCriticalPath(doc, northStarId);
  if (!critical.found) {
    // The M3-review blocker-5d / linker-40 posture, kept identical to batch-eligibility.ts's: an
    // unresolved north star yields an EMPTY critical set, which would otherwise read as "nothing is
    // on the path" and quietly make every claim non-load-bearing — the exact inversion of the rule.
    return strict("north-star-unresolved", `north star '${northStarId}' names no node in the projected graph, so critical-path membership is unknowable`, northStarId);
  }
  if (!doc.nodes.some((n) => n.id === claimId)) {
    return strict("claim-not-in-graph", `'${claimId}' names no node in the projected graph, so its path membership to north star '${northStarId}' cannot be computed`, northStarId);
  }
  if (critical.nodeIds.includes(claimId)) {
    return {
      loadBearing: true, determinacy: "determined", reason: "on-critical-path", northStarId,
      detail: `'${claimId}' is on the critical path to north star '${northStarId}' (${critical.nodeIds.length} node(s) on the path)`,
    };
  }
  return {
    loadBearing: false, determinacy: "determined", reason: "off-critical-path", northStarId,
    detail: `'${claimId}' is on no dep/route path from north star '${northStarId}' (${critical.nodeIds.length} node(s) are)`,
  };
}

/** Deterministic one-line operator text for a `resolveLoadBearing` result, stating BOTH the answer
 * and its consequence for promotion. Every reason produces a distinct sentence: an indeterminate
 * answer is never worded like a determined one. */
export function describeLoadBearing(r: LoadBearingResolution): string {
  if (r.determinacy === "indeterminate") {
    return `critical-path membership: INDETERMINATE (${r.reason}) — ${r.detail}. Failing closed: every node is treated as load-bearing, so EVERY accept requires a verifier of a different model family than the prover (PRD C9).`;
  }
  if (r.reason === "on-critical-path") {
    return `critical-path membership: LOAD-BEARING (${r.detail}) — every accept requires a verifier of a different model family than the prover (PRD C9).`;
  }
  return `critical-path membership: off the critical path (${r.detail}) — PRD C9 allows same-family accepts here, recorded as such; af-crux nodes inside this claim still get cross-vendor treatment.`;
}

/** rk-id1: the honest SINGLE-VENDOR statement, said at preflight rather than discovered as a wall of
 * per-node rejections mid-run. PRD C9 requires "verifier model family != prover model family for
 * load-bearing claims", so a roster carrying ONE model family (claude-only or codex-only — the
 * common academic case) can promote NOTHING on a load-bearing claim. That was already true before
 * this bead; what was missing was the tool ever SAYING so before the user spends. Pure: the caller
 * (src/cli/verify-live.ts) logs the lines.
 *
 * Deliberately does NOT refuse the run, and weakens nothing: prover turns still record real proof
 * structure and verifier challenges still land, and an OFF-critical-path claim can still promote
 * same-family (PRD C9's own "Non-critical-path: same-family allowed, recorded" branch — reachable at
 * all only because rk-bun wired REAL membership). It states the consequence; the operator decides. */
export function crossVendorPreflightLines(proverFamily: ModelFamily, verifierFamily: ModelFamily, loadBearing: boolean): string[] {
  if (proverFamily !== verifierFamily) {
    return [`cross-vendor: prover family '${proverFamily}' != verifier family '${verifierFamily}' — accepts on this claim can satisfy PRD C9.`];
  }
  if (loadBearing) {
    return [
      `cross-vendor: prover and verifier are BOTH family '${proverFamily}' — SINGLE-VENDOR ROSTER.`,
      `  Consequence, before you spend: NO node in this claim can be promoted to proved. PRD C9 requires a`,
      `  verifier of a different model family than the prover on every load-bearing claim, so every accept`,
      `  this run produces will be refused (same-family). Prover turns and challenges still do real work.`,
      `  To promote: configure a second vendor (.rk/config.json workers.assignments.verifier.hard.backend,`,
      `  e.g. 'codex' against a 'claude' prover), or work this claim at the l5 soft tier instead.`,
    ];
  }
  return [
    `cross-vendor: prover and verifier are BOTH family '${proverFamily}' — single-vendor roster, but this claim is`,
    `  OFF the critical path, so PRD C9 permits same-family accepts here and they are recorded as same-family.`,
    `  Any af-crux node inside this claim is still treated as load-bearing and will be refused same-family.`,
  ];
}

/** Human-readable, deterministic explanation for a rejected `decideCrossVendor` result — the
 * message `src/drive/driver-run.ts` logs as the node's skip reason. Never called when
 * `decision.satisfied` is true (callers gate on that first); asserts loudly (throws) rather than
 * fabricate a message for a satisfied decision, since a skip reason that describes a PASS would
 * be a silent-lie risk this codebase's L2 discipline forbids. */
export function crossVendorRejectionMessage(nodeId: string, decision: CrossVendorDecision): string {
  if (decision.satisfied) {
    throw new Error(`crossVendorRejectionMessage called on a satisfied decision for node '${nodeId}' — this is a caller bug, not a reportable rejection`);
  }
  if (decision.reason === "identity-unparseable") {
    return `cross-vendor: identity-unparseable on load-bearing node '${nodeId}' (prover=${decision.proverFamily ?? "unknown"}, verifier=${decision.verifierFamily ?? "unknown"}) — fails closed, never conflated with a confirmed same-family violation`;
  }
  return `cross-vendor: same-family on load-bearing node '${nodeId}' (prover=verifier=${decision.proverFamily}) — promotion to proved requires verifier family != prover family (PRD C9)`;
}
