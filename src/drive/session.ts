// PURITY: pure — no fs/network/clock (L3). Session/claim isolation invariants (M3.1 repair wave,
// Tier A review landing-blocker 2): "role/claim isolation is prose-only and `claimId` is absent
// from the request" — this module is the runtime enforcement docs/worker-contract.md section (a)
// needed but did not have. Q4 ruling: no second JSON Schema for requests while they stay internal
// (never cross a process boundary the way a verdict document does), but "TypeScript types alone
// are insufficient — add runtime request/session invariant validation and property tests," which
// is exactly what `validateSessionRequest` below is.

import { DISPATCH_MODELS, ROLES, TIERS, isNonBlankString, type DispatchModel, type Role, type Tier } from "./vocab";

/** The driver's own immutable record of a session it created, keyed by the full isolation tuple
 * (review blocker 2: "maintain an immutable driver-side session record keyed by at least
 * (backend, model, role, tier, claimId, dispatchModel)"). Immutable: once created for a claim, a
 * session record is never edited — a change to any of these fields means a NEW claim/session, not
 * an update to this one. `sessionId` is the backend's own session/conversation id for a
 * `dispatchModel: "session"` backend, or a driver-generated synthetic per-turn id for
 * `dispatchModel: "flat"` (docs/worker-contract.md section (a): "a flat backend must reject
 * resume mode and receive a fresh synthetic attempt/session ID"). */
export interface SessionRecord {
  backend: string;
  model: string;
  role: Role;
  tier: Tier;
  claimId: string;
  dispatchModel: DispatchModel;
  sessionId: string;
}

/** The identity portion of a `WorkerRequest` (docs/worker-contract.md section (b)) relevant to
 * session/claim isolation — `claimId` and `turnId` are the review's required additions.
 * `turnId` is an idempotency key for retry (Q3 ruling: "ambiguous timeout retries require a new
 * session or idempotent turnId, never blind resume") — this module only validates its presence
 * and non-blankness; retry deduplication logic itself is out of this WP's scope (Q3: retries are
 * a shared driver responsibility, not specified further here). */
export interface WorkerRequestIdentity {
  backend: string;
  model: string;
  role: Role;
  tier: Tier;
  claimId: string;
  turnId: string;
  session: { mode: "new" } | { mode: "resume"; sessionId: string };
}

export interface SessionIssue {
  path: string;
  message: string;
}

/** The isolation tuple's canonical string key (M3.3 extension): `(backend, model, role, tier,
 * claimId, dispatchModel)` joined on a single-space separator (backend/model/role/tier/claimId/
 * dispatchModel are all single-token strings in practice; a space is a legible, low-risk join —
 * unlike identity.ts's seam encoding, this key is never parsed back apart, only compared for
 * equality, so lossless round-tripping is not a requirement here). Exported so
 * src/drive/session-manager.ts's create-once/global-uniqueness store can key its maps on EXACTLY
 * the same tuple this module already treats as the isolation boundary — one definition of "the
 * tuple," never two independently-maintained ones that could silently drift apart. */
export function sessionIsolationKey(
  r: Pick<SessionRecord, "backend" | "model" | "role" | "tier" | "claimId" | "dispatchModel">,
): string {
  return [r.backend, r.model, r.role, r.tier, r.claimId, r.dispatchModel].join(" ");
}

function validateIdentityShape(request: WorkerRequestIdentity, issues: SessionIssue[]): void {
  if (!isNonBlankString(request.backend)) issues.push({ path: "backend", message: "must be a non-blank string" });
  if (!isNonBlankString(request.model)) issues.push({ path: "model", message: "must be a non-blank string" });
  if (!ROLES.has(request.role)) issues.push({ path: "role", message: `must be one of ${[...ROLES].join(", ")}` });
  if (!TIERS.has(request.tier)) issues.push({ path: "tier", message: `must be one of ${[...TIERS].join(", ")}` });
  if (!isNonBlankString(request.claimId)) issues.push({ path: "claimId", message: "must be a non-blank string" });
  if (!isNonBlankString(request.turnId)) issues.push({ path: "turnId", message: "must be a non-blank string" });
}

/** Validates one `WorkerRequest`'s session directive against the backend's declared dispatch
 * capability and (when resuming) the driver's own immutable record of the session being resumed.
 * Pure: `existingRecord` is supplied by the caller (an in-memory lookup the driver's edge code
 * performs — the lookup itself is IO-adjacent bookkeeping, not this function's job).
 *
 * Enforces, in order:
 * 1. Request identity fields are well-formed (non-blank strings, closed enums).
 * 2. A `dispatchModel: "flat"` backend must never request `session.mode: "resume"` — flat
 *    backends have no continuation primitive by definition (docs/worker-contract.md section (a)).
 * 3. A `"resume"` request must name a `sessionId` for which `existingRecord` was found (a caller
 *    passing `undefined` here is asserting "no record for this sessionId exists").
 * 4. The existing record's FULL isolation tuple (backend, model, role, tier, claimId,
 *    dispatchModel) must match the request's own — a mismatch on ANY field, especially `role`, is
 *    exactly the cross-role/cross-claim session reuse the C9 law forbids, restated here as a
 *    mechanical check rather than prose alone. */
export function validateSessionRequest(
  request: WorkerRequestIdentity,
  backendDispatchModel: DispatchModel,
  existingRecord: SessionRecord | undefined,
): SessionIssue[] {
  const issues: SessionIssue[] = [];
  validateIdentityShape(request, issues);
  if (!DISPATCH_MODELS.has(backendDispatchModel)) {
    issues.push({ path: "backendDispatchModel", message: `must be one of ${[...DISPATCH_MODELS].join(", ")}` });
  }

  if (request.session.mode === "resume") {
    if (backendDispatchModel === "flat") {
      issues.push({
        path: "session.mode",
        message: "backend declares dispatchModel:'flat' (no continuation primitive) — resume is forbidden; issue session.mode:'new' with a fresh synthetic id",
      });
      return issues;
    }
    if (!isNonBlankString(request.session.sessionId)) {
      issues.push({ path: "session.sessionId", message: "must be a non-blank string" });
    }
    if (existingRecord === undefined) {
      issues.push({ path: "session.sessionId", message: `no session record found for sessionId '${request.session.sessionId}'` });
      return issues;
    }
    const tupleMismatches: Array<[string, unknown, unknown]> = [
      ["backend", existingRecord.backend, request.backend],
      ["model", existingRecord.model, request.model],
      ["role", existingRecord.role, request.role],
      ["tier", existingRecord.tier, request.tier],
      ["claimId", existingRecord.claimId, request.claimId],
      ["dispatchModel", existingRecord.dispatchModel, backendDispatchModel],
    ];
    for (const [field, recorded, requested] of tupleMismatches) {
      if (recorded !== requested) {
        issues.push({
          path: `session.resume.${field}`,
          message: `session '${request.session.sessionId}' was created with ${field}='${recorded}', request claims '${requested}' — cross-role/claim session reuse forbidden (C9 law)`,
        });
      }
    }
    if (existingRecord.sessionId !== request.session.sessionId) {
      issues.push({ path: "session.sessionId", message: "resume sessionId does not match the record it was looked up by (caller bug)" });
    }
  }

  return issues;
}
