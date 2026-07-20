// PURITY: pure — no fs/network/clock (L3). M3.6 hard-tier driver guardrails, each a standalone
// DECISION FUNCTION the impure driver loop (src/drive/driver-run.ts) consults but never inlines —
// so every guardrail is unit-testable in isolation with a red fixture (CLAUDE.md L1/L2), never a
// behavior buried inside a spawn-heavy loop where only an integration test could reach it.
//
// The four guardrails PRD C9 / IMPLEMENTATION_PLAN.md M3.6 name (prover-overreach abort, stuck
// guard, retry/churn cap, burst budgets). Burst budgets are NOT re-implemented here — the driver
// respects src/drive/scheduler.ts's own burst/effort decisions (that module owns them, M3.3); this
// file covers the three guardrails scheduler.ts does not: prover-overreach, stuck, and per-node
// retry cap. Each returns a structured decision {abort/discard, reason} — a named reason string, so
// an abort is never silent and the driver log (.rk/driver-log.jsonl) records WHY a claim died.

import type { Role } from "./vocab";

/** Named machine-readable abort/discard reasons — the closed vocabulary the driver log and any
 * board consumer key off, so "why did this claim stop" is never free-text a reader must interpret.
 * `balloon-abort` is emitted by the balloon path (src/drive/driver-balloon.ts) after the signal is
 * routed — the abort AUGMENTS the balloon feedback, never replaces it (PRD C9). */
export type DriverStopReason =
  | "prover-overreach"
  | "stuck-no-progress"
  | "retry-cap-exhausted"
  | "balloon-abort"
  // M3 blocker 2: the frontier emptied (no verification-ready node) but the claim's ROOT was not
  // af-validated — a challenged/blocked/unproven root that must never be reported as convergence.
  | "root-unvalidated";

export const DEFAULT_MAX_STUCK_ROUNDS = 3;
export const DEFAULT_NODE_RETRY_CAP = 3;

// --- Prover-overreach abort -------------------------------------------------------------------

export interface OverreachDecision {
  /** True iff this response must be DISCARDED (never applied, never turned into a verdict) and the
   * event logged — provers prove, only verifiers produce verdicts (PRD C9). */
  discard: boolean;
  reason?: string;
}

const NO_OVERREACH: OverreachDecision = { discard: false };

/** A prover turn's output must NEVER carry a verdict/acceptance. Detects overreach STRUCTURALLY on
 * the parsed worker body: a `verdict` field (the exact shape a verifier's raw output uses,
 * src/drive/verdict-raw.ts — l5 string or hard `{outcome}` object), or a bare acceptance verdict
 * string. A verifier or reviewer role is EXEMPT — those roles legitimately produce verdicts, so
 * this guard only ever fires for `role === "prover"`. Structural, not a fuzzy prose scan: a prover
 * that merely mentions the word "valid" inside a proof narrative is fine; a prover that emits a
 * verdict-SHAPED object is the overreach this discards. */
export function detectProverOverreach(role: Role, parsed: unknown): OverreachDecision {
  if (role !== "prover") return NO_OVERREACH;
  if (typeof parsed === "string") {
    const s = parsed.trim().toUpperCase();
    if (s === "VALID" || s === "VALID-WITH-CORRECTION" || s === "INVALID" || s === "ACCEPT" || s === "CHALLENGE") {
      return { discard: true, reason: `prover response is a bare verdict string '${parsed.trim()}' — provers prove, only verifiers produce verdicts` };
    }
    return NO_OVERREACH;
  }
  if (parsed !== null && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if ("verdict" in obj) {
      return { discard: true, reason: "prover response carries a 'verdict' field — a prover attempted to render a verifier verdict; discarded" };
    }
    if ("outcome" in obj) {
      return { discard: true, reason: "prover response carries an 'outcome' field — a prover attempted to accept/challenge a node; discarded" };
    }
  }
  return NO_OVERREACH;
}

// --- Stuck guard ------------------------------------------------------------------------------

export interface StuckDecision {
  abort: boolean;
  reason?: string;
}

/** No progress after N consecutive dispatch rounds (a "round" = one bottom-up-ready dispatch wave
 * that applied ZERO new verdicts) aborts the claim with a named reason. `roundsWithoutProgress` is
 * the driver's own running count; `maxStuckRounds` its ceiling (default 3). At the ceiling the
 * claim is declared stuck — continuing to re-dispatch a workspace that has stopped advancing only
 * burns tokens (PRD C9 token-efficiency), so the driver stops and reports rather than looping. */
export function evaluateStuckGuard(roundsWithoutProgress: number, maxStuckRounds: number = DEFAULT_MAX_STUCK_ROUNDS): StuckDecision {
  if (roundsWithoutProgress >= maxStuckRounds) {
    return { abort: true, reason: `no verdict progress in ${roundsWithoutProgress} consecutive dispatch round(s) (cap ${maxStuckRounds}) — claim declared stuck` };
  }
  return { abort: false };
}

// --- Per-node retry / churn cap ---------------------------------------------------------------

export interface RetryDecision {
  /** True iff this node has exhausted its per-node attempt ceiling and must not be re-dispatched —
   * it is reported (never silently dropped) and the claim moves on / aborts per the loop's policy. */
  exhausted: boolean;
  reason?: string;
}

/** Per-node attempt ceiling: a node re-dispatched `attemptsSoFar` times (each a fresh verifier turn
 * that failed to produce an applicable verdict — rejection, timeout, or a challenge that left it
 * pending) is refused a further attempt once `attemptsSoFar >= cap`. Guards the churn case where one
 * pathological node would otherwise absorb unbounded retries. `attemptsSoFar` counts attempts
 * ALREADY made; the decision is whether a NEXT attempt is allowed. */
export function checkRetryCap(attemptsSoFar: number, cap: number = DEFAULT_NODE_RETRY_CAP): RetryDecision {
  if (attemptsSoFar >= cap) {
    return { exhausted: true, reason: `node exhausted its per-node retry cap (${attemptsSoFar}/${cap} attempts) — no further dispatch` };
  }
  return { exhausted: false };
}
