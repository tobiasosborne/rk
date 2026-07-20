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
