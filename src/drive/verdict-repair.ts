// PURITY: pure — no fs/network/clock (L3). rk-xxp (GAP 11): the DECISION half of the ONE bounded
// schema-repair reprompt. `diagnoseRepairableTurn` decides whether a worker turn failed in a way a
// single corrective reprompt could fix (and with exactly WHICH concrete issues to echo back);
// `mergeRepairTurn` folds the repair turn's reply back into the dispatched turn. The DISPATCH half —
// actually sending the repair on the same session — is the edge's job (src/drive/driver-live.ts),
// which calls these two functions and nothing else, so the whole policy is pure and unit-testable.
//
// THE INCIDENT (../rk-m3.5-baseline/_logs/lem-{mass-split,starvation-completion-obstruction}.run-B
// .attempt11.driver-log.jsonl, six records): the claude-opus hard-tier verifier returned
// {"verdict":{"outcome":"challenge","target":"1","severity":"critical","category":"missing",
// "reason":"<long prose>"}} with NO top-level `justification`. `grep -c justification` over the
// run-B console logs = 0. Semantically complete, schema-noncompliant: the model folded its reasoning
// into `verdict.reason` and omitted the sibling. 96,066 tokens, 0 nodes applied, run aborted stuck
// after 3 identical dispatch rounds, prover never dispatched. The same verifier on lem-weighted-min
// emitted the field correctly — pure output variance, not a parser bug and not corruption.
//
// FOUR INVARIANTS, none of them negotiable:
// 1. AT MOST ONE repair per dispatch, ever. Enforced STRUCTURALLY, not by a counter: `mergeRepairTurn`
//    is a terminal fold (it never re-enters `diagnoseRepairableTurn`), and driver-live.ts's
//    `repairVerifierTurnOnce` calls `dispatcher.dispatch` directly rather than recursing through
//    itself, so no second repair can be reached from any code path. A repair that also fails is a
//    normal terminal outcome.
// 2. THE REPAIRED VERDICT CARRIES NO EXTRA TRUST. `mergeRepairTurn` runs the repair reply through the
//    identical `validateRawWorkerOutput` the first reply faced, and the accepted body then re-enters
//    the unchanged pipeline downstream (bindVerdicts, hash re-confirmation, cross-vendor gate). There
//    is no bypass and no "it was repaired, so be lenient" branch anywhere in this module.
// 3. THE SCHEMA IS NOT LOOSENED and `verdict.reason` is NEVER coerced into `justification`. Mandatory
//    per-item justification is PRD C3's no-blanket-accepts guarantee; a coercion here would silently
//    convert "the worker explained the target's defect" into "the worker justified its verdict",
//    which are different claims. This module contains no field-copying of any kind.
// 4. THE REPAIR TURN'S TOKENS ARE REAL AND ARE ACCOUNTED. `RepairRecord.usage` carries the repair
//    turn's OWN usage, kept SEPARATE from the first turn's `DispatchedTurn.usage` so the driver logs
//    one honest `usage` record per real backend turn (src/drive/report.ts folds them) and accrues
//    BOTH to the campaign budget total (src/drive/driver-verify-node.ts's `spentTokens`).

import { validateRawWorkerOutput, type RawIssue } from "./verdict-raw";
import type { DispatchedTurn } from "./driver-types";
import type { WorkerUsage } from "./worker-result";
import type { Tier } from "./vocab";

/** The record of a repair attempt, attached to the dispatched turn it belongs to. Present ONLY when
 * a repair was actually dispatched — its absence means the first reply was fine (or the failure was
 * not shape-shaped), never that a repair silently succeeded. */
export interface RepairRecord {
  /** True iff the repair reply passed the SAME raw-shape validation and is now the turn's `raw`. */
  ok: boolean;
  /** The concrete issues that triggered the repair — exactly what was echoed to the worker. */
  issues: RawIssue[];
  /** Why the repair reply itself was refused. Absent iff `ok`. */
  repairIssues?: RawIssue[];
  /** The repair turn's OWN token usage (NOT summed with the first turn's — see invariant 4). */
  usage?: WorkerUsage;
}

export type RepairNeed = { needed: false } | { needed: true; issues: RawIssue[] };

/** Decides whether ONE bounded repair reprompt is warranted for `turn`, and with which concrete
 * issues. Two repairable failure modes, both of them "the worker had something to say and said it in
 * the wrong shape":
 *
 * - **exit 0, body present, raw-shape invalid** (the attempt-11 case): the issues are
 *   `verdict-raw.ts`'s own `RawIssue[]`, echoed verbatim.
 * - **exit 12 with `rawText`** (single-object extraction failed — fences, trailing prose, an
 *   unterminated string): there is no `RawIssue[]` to echo, so the parse diagnosis
 *   (`DispatchedTurn.parseError`/`parseClass`, src/drive/parse-diag.ts) is rendered as one issue so
 *   the repair prompt still names something CONCRETE rather than "that was invalid".
 *   This mode matters because the banked attempt-11 records are `parse-failed`, not `bind-failed`:
 *   gating repair on raw-shape validation alone would not have fired on the incident itself.
 *
 * Everything else is refused, deliberately. exit 10 (timeout), 11 (budget exceeded) and 13 (backend
 * unavailable) are PROCESS-level failures (docs/worker-contract.md's exit-code table) that no
 * reprompt can fix, and 11 in particular must never provoke more spend. exit 12 with no `rawText`
 * means nothing usable was produced — there is no shape to correct. */
export function diagnoseRepairableTurn(tier: Tier, turn: DispatchedTurn): RepairNeed {
  if (turn.exit === 0) {
    const issues = validateRawWorkerOutput(tier, turn.raw);
    return issues.length === 0 ? { needed: false } : { needed: true, issues };
  }
  if (turn.exit === 12 && turn.rawText !== undefined) {
    const cls = turn.parseClass ?? "other";
    const detail = turn.parseError !== undefined && turn.parseError.length > 0 ? `: ${turn.parseError}` : "";
    return {
      needed: true,
      issues: [{
        path: "$",
        message: `the reply was not exactly one bare JSON object (failure mode: ${cls})${detail} — emit ONE raw JSON object, with no code fences, no prose before or after it, and every string closed`,
      }],
    };
  }
  return { needed: false };
}

/** Folds a repair turn's reply back into the original dispatched turn. TERMINAL by construction: it
 * never asks for another repair, whatever the reply looks like.
 *
 * On success the repaired body BECOMES the turn's `raw` at exit 0, and the first attempt's
 * parse-failure fields are cleared (they described output that is no longer what this turn carries;
 * leaving them would make the `parse-failed` evidence record fire on a turn that did not fail).
 *
 * On failure the ORIGINAL failure representation is preserved verbatim — the same `exit`, `raw`,
 * `rawText`, `parseError` and `parseClass` the turn would have carried had no repair been attempted.
 * The downstream terminal outcome is therefore exactly what it was before this feature existed (a
 * `parse-failed` stays parse-failed, a bind-shape failure stays a bind failure); the only difference
 * is the attached `RepairRecord`, which is evidence, never a verdict. */
export function mergeRepairTurn(tier: Tier, first: DispatchedTurn, repair: DispatchedTurn, issues: readonly RawIssue[]): DispatchedTurn {
  const triggered = [...issues];
  if (repair.exit !== 0) {
    return withRepair(first, { ok: false, issues: triggered, repairIssues: [{ path: "$", message: `the repair turn itself failed at the process level: worker exit ${repair.exit} (docs/worker-contract.md's exit-code table)` }], usage: repair.usage });
  }
  // The SAME validation the first reply faced. No leniency, no coercion (invariants 2 and 3).
  const repairIssues = validateRawWorkerOutput(tier, repair.raw);
  if (repairIssues.length > 0) {
    return withRepair(first, { ok: false, issues: triggered, repairIssues, usage: repair.usage });
  }
  return {
    raw: repair.raw,
    role: first.role,
    exit: 0,
    usage: first.usage,
    repair: { ok: true, issues: triggered, usage: repair.usage },
  };
}

function withRepair(first: DispatchedTurn, record: RepairRecord): DispatchedTurn {
  return { ...first, repair: record };
}

/** Adds two turns' usage, treating `undefined` as "not reported" rather than as zero, so a
 * dispatcher that reports no usage at all is never silently credited with a zero-cost turn. Used by
 * src/drive/driver-verify-node.ts to accrue the repair turn's real cost to the campaign total. */
export function addUsage(a: WorkerUsage | undefined, b: WorkerUsage | undefined): WorkerUsage | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cache_read: a.cache_read + b.cache_read,
    cache_creation: a.cache_creation + b.cache_creation,
  };
}
