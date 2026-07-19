// PURITY: pure — no fs/network/clock (L3). M3.3: the driver-side IMMUTABLE session record STORE
// docs/worker-contract.md section (a) needs on top of src/drive/session.ts's per-request
// VALIDATION function. session.ts's `validateSessionRequest` answers "is this one request legal,
// given a record I already looked up somewhere"; this module answers the two questions that
// surround it: where does that record come from (`createSession` — create-once, by construction,
// not by caller discipline) and how do I look it up correctly for a resume (`resumeSession`).
//
// The core guarantee this module gives every caller FOR FREE, never by discipline: a `sessionId`
// can be registered under AT MOST ONE isolation tuple, ever. `createSession` refuses a second
// registration under a conflicting tuple, so the lookup `resumeSession` performs before delegating
// to `validateSessionRequest` can never itself hand back a record for the wrong role/claim/tier —
// there is no code path where two different tuples both claim the same sessionId, so the M3.1
// review's core failure scenario ("a verifier request resumes a prover session... nothing binds
// sessionId to (backend/model, role, tier, claim)") is impossible to construct a passing case for,
// not merely rejected after the fact.

import {
  sessionIsolationKey,
  validateSessionRequest,
  type SessionIssue,
  type SessionRecord,
  type WorkerRequestIdentity,
} from "./session";
import type { DispatchModel } from "./vocab";

export interface SessionManagerState {
  readonly bySessionId: ReadonlyMap<string, SessionRecord>;
  /** Only ever populated for `dispatchModel: "session"` records — a `"flat"` backend's synthetic
   * per-turn id is EXPECTED to be minted fresh for the same tuple on every turn (that IS the flat
   * dispatch model, docs/worker-contract.md section (a)), so the create-once check below is only
   * enforced where the contract actually requires it. */
  readonly byTuple: ReadonlyMap<string, string>;
}

export function emptySessionManagerState(): SessionManagerState {
  return { bySessionId: new Map(), byTuple: new Map() };
}

export type CreateSessionOutcome =
  | { ok: true; state: SessionManagerState; record: SessionRecord; reused: boolean }
  | { ok: false; issues: SessionIssue[] };

function blank(name: string, value: string, issues: SessionIssue[]): void {
  if (value.trim().length === 0) issues.push({ path: name, message: "must be a non-blank string" });
}

/** Registers a new session record, or — for a `dispatchModel:"session"` backend re-announcing the
 * SAME sessionId for the SAME tuple (an idempotent retry, not a fresh session) — returns the
 * existing record unchanged (`reused: true`). Rejects, by construction:
 * 1. any `dispatchModel:"session"` tuple that already holds a DIFFERENT sessionId — create-once:
 *    a second real session for one (backend, model, role, tier, claim) is a driver bug, never
 *    silently allowed to shadow or replace the first.
 * 2. any sessionId already registered under a DIFFERENT tuple, REGARDLESS of dispatchModel — the
 *    global-uniqueness invariant `resumeSession` depends on: one sessionId, one tuple, forever.
 * `dispatchModel:"flat"` records skip check 1 (repeat creation under the same tuple is the norm
 * for a backend with no continuation primitive) but never skip check 2. */
export function createSession(state: SessionManagerState, spec: SessionRecord): CreateSessionOutcome {
  const issues: SessionIssue[] = [];
  blank("sessionId", spec.sessionId, issues);
  blank("backend", spec.backend, issues);
  blank("model", spec.model, issues);
  blank("claimId", spec.claimId, issues);
  if (issues.length > 0) return { ok: false, issues };

  const key = sessionIsolationKey(spec);
  const existingSessionIdForTuple = state.byTuple.get(key);

  if (spec.dispatchModel === "session" && existingSessionIdForTuple !== undefined) {
    if (existingSessionIdForTuple === spec.sessionId) {
      return { ok: true, state, record: state.bySessionId.get(spec.sessionId)!, reused: true };
    }
    return {
      ok: false,
      issues: [
        {
          path: "sessionId",
          message:
            `isolation tuple (backend=${spec.backend}, model=${spec.model}, role=${spec.role}, ` +
            `tier=${spec.tier}, claimId=${spec.claimId}) already has session '${existingSessionIdForTuple}' ` +
            `— create-once forbids registering a second session '${spec.sessionId}' for the same tuple`,
        },
      ],
    };
  }

  const conflictingRecord = state.bySessionId.get(spec.sessionId);
  if (conflictingRecord !== undefined && sessionIsolationKey(conflictingRecord) !== key) {
    return {
      ok: false,
      issues: [
        {
          path: "sessionId",
          message:
            `sessionId '${spec.sessionId}' is already registered under a different isolation tuple ` +
            `(backend=${conflictingRecord.backend}, model=${conflictingRecord.model}, role=${conflictingRecord.role}, ` +
            `tier=${conflictingRecord.tier}, claimId=${conflictingRecord.claimId}) — sessionIds must be ` +
            `globally unique across tuples`,
        },
      ],
    };
  }

  const bySessionId = new Map(state.bySessionId);
  bySessionId.set(spec.sessionId, spec);
  const byTuple = new Map(state.byTuple);
  if (spec.dispatchModel === "session") byTuple.set(key, spec.sessionId);
  return { ok: true, state: { bySessionId, byTuple }, record: spec, reused: false };
}

/** Looks up the record a resume request names by `sessionId` — NEVER by the request's own claimed
 * tuple, which would defeat the whole point of the check — and delegates to
 * `validateSessionRequest` (src/drive/session.ts) for the actual tuple-match validation. Because
 * `createSession` above guarantees a `sessionId` maps to AT MOST ONE tuple ever, this lookup can
 * never itself hand back an ambiguous or mismatched record: whatever tuple was recorded at
 * creation is the only tuple this sessionId will ever compare against. */
export function resumeSession(
  state: SessionManagerState,
  request: WorkerRequestIdentity,
  backendDispatchModel: DispatchModel,
): SessionIssue[] {
  const sessionId = request.session.mode === "resume" ? request.session.sessionId : undefined;
  const record = sessionId !== undefined ? state.bySessionId.get(sessionId) : undefined;
  return validateSessionRequest(request, backendDispatchModel, record);
}

/** Read-only lookup by sessionId, for edge/accounting code that needs the record without going
 * through the resume-validation path (e.g. to attribute a turn's usage to the right claim). */
export function lookupSession(state: SessionManagerState, sessionId: string): SessionRecord | undefined {
  return state.bySessionId.get(sessionId);
}
