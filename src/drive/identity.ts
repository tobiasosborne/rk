// PURITY: pure — no fs/network/clock (L3). The verifier-identity seam encoding (M3.1 repair wave,
// Tier A review landing-blocker 5): a lossless, canonical mapping from rk's structured
// {modelFamily, backend, model, sessionId} identity into a SINGLE free-text string, because
// ../vibefeld's V1 schema addition (../vibefeld/handoff.md 2026-07-19) stores only a plain string
// on `NodeValidated.VerifiedBy` / `ChallengeRaised.RaisedBy` (`json:"verified_by"` /
// `json:"raised_by"`) — no structured identity object exists on that side, and this WP's brief is
// explicit that no vibefeld changes are in scope. THIS is the one canonical encoding M3.8's
// cross-vendor check parses back out of that free-text field; a second, competing encoding
// invented elsewhere would silently break M3.8's family comparison.

import { MODEL_FAMILIES, isNonBlankString, type ModelFamily } from "./vocab";

export interface VerifierIdentity {
  modelFamily: ModelFamily;
  backend: string;
  model: string;
  sessionId: string;
}

/** The seam delimiter. Chosen for the same reason af's own `ComputeContentHash` (../vibefeld
 * internal/node/node.go) picks `|`/`:` as field separators over commas: it is very unlikely to
 * appear inside a model id, backend name, or session id, and — critically — `encodeVerifierSeam`
 * REJECTS any component containing it rather than silently mangling the round trip, so
 * "lossless" is an enforced invariant, not a hope. */
const SEAM_DELIMITER = "|";

export type SeamEncodeResult = { ok: true; value: string } | { ok: false; reason: string };
export type SeamDecodeResult = { ok: true; identity: VerifierIdentity } | { ok: false; reason: string };

/** Encodes `identity` as `family|backend|model|sessionId` — THE canonical seam encoding for
 * ../vibefeld's free-text `verified_by`/`raised_by` fields (docs/worker-contract.md section (e)).
 * Driver-side only: nothing in ../vibefeld changes to support this: `af` just stores whatever
 * string the driver supplies, exactly as it already treats `VerifiedBy` as an opaque
 * driver-supplied identity token (../vibefeld/handoff.md: "recorded and mechanically checkable...
 * not adversary-proof"). Fails loudly (never silently truncates or escapes) if any component
 * contains the delimiter, since a silent escape scheme would be a second, undocumented encoding. */
export function encodeVerifierSeam(identity: VerifierIdentity): SeamEncodeResult {
  const parts: Array<[string, string]> = [
    ["modelFamily", identity.modelFamily],
    ["backend", identity.backend],
    ["model", identity.model],
    ["sessionId", identity.sessionId],
  ];
  for (const [name, value] of parts) {
    if (!isNonBlankString(value)) return { ok: false, reason: `${name} must be a non-blank string` };
    if (value.includes(SEAM_DELIMITER)) {
      return { ok: false, reason: `${name} ('${value}') contains the seam delimiter '${SEAM_DELIMITER}' — cannot encode losslessly` };
    }
  }
  return { ok: true, value: parts.map(([, v]) => v).join(SEAM_DELIMITER) };
}

/** The inverse of `encodeVerifierSeam` — parses a `verified_by`/`raised_by` string back into a
 * structured `VerifierIdentity`. This is what M3.8's cross-vendor check calls on both the
 * prover's and verifier's recorded identity strings before comparing `modelFamily`. Rejects
 * anything not produced by `encodeVerifierSeam` (wrong component count, unrecognized family) —
 * a string this function cannot parse is exactly the "arbitrary string parsing" the review
 * warned M3.8 must not have to do; callers must treat a decode failure as "family unknown,
 * cross-vendor check cannot proceed," never as a silent pass. */
export function decodeVerifierSeam(value: string): SeamDecodeResult {
  const parts = value.split(SEAM_DELIMITER);
  if (parts.length !== 4) {
    return { ok: false, reason: `expected exactly 4 '${SEAM_DELIMITER}'-delimited components, got ${parts.length}` };
  }
  const [modelFamily, backend, model, sessionId] = parts as [string, string, string, string];
  if (!MODEL_FAMILIES.has(modelFamily as ModelFamily)) {
    return { ok: false, reason: `unrecognized modelFamily '${modelFamily}' — not in ${[...MODEL_FAMILIES].join(", ")}` };
  }
  for (const [name, v] of [["backend", backend], ["model", model], ["sessionId", sessionId]] as const) {
    if (!isNonBlankString(v)) return { ok: false, reason: `decoded ${name} is blank` };
  }
  return { ok: true, identity: { modelFamily: modelFamily as ModelFamily, backend, model, sessionId } };
}
