// 1:1 test for src/drive/verdict-repair.ts (rk-xxp / GAP 11). The RED corpus for the ONE bounded
// schema-repair reprompt: the exact banked attempt-11 payload (a semantically complete hard-tier
// challenge with NO top-level `justification`) must be diagnosed as repairable with the CONCRETE
// issue, and a corrected reply must be accepted — while a repair that ALSO fails stays terminal,
// with the original failure representation preserved and no second repair anywhere.
//
// Evidence: ../rk-m3.5-baseline/_logs/lem-mass-split.run-B.attempt11.driver-log.jsonl (3 records)
// and lem-starvation-completion-obstruction.run-B.attempt11.driver-log.jsonl (3 records).
// `grep -c justification` over the matching run-B console logs = 0.

import { describe, expect, test } from "bun:test";
import {
  addUsage,
  diagnoseRepairableProverTurn,
  diagnoseRepairableTurn,
  mergeProverRepairTurn,
  mergeRepairTurn,
  type RepairRecord,
} from "../../src/drive/verdict-repair";
import type { DispatchedTurn } from "../../src/drive/driver-types";
import type { WorkerUsage } from "../../src/drive/worker-result";

/** THE banked attempt-11 payload, verbatim from the `parse-failed` record's `rawSnippet` (that
 * record's own 500-char cap truncated the `reason` mid-sentence; the sentence is closed here so the
 * fixture is a well-formed JSON object — the SHAPE defect under test is the missing top-level
 * `justification`, not the truncation). Semantically complete, schema-noncompliant: the model folded
 * its reasoning into `verdict.reason` and omitted the sibling `justification`. */
export const BANKED_ATTEMPT11_PAYLOAD = {
  verdict: {
    outcome: "challenge",
    target: "1",
    severity: "critical",
    category: "missing",
    reason:
      "No proof or derivation has been recorded for this statement. Node 1 carries the mass-split claim with inference 'assumption', has no sub-steps or children, and cites no dependencies (0 established deps). The ledger at proofs/lem-mass-split/ledger/ contains only proof_initialized and node_created entries — no reasoning has been written down at any point.",
  },
};

const USAGE_A: WorkerUsage = { input: 2, output: 630, cache_read: 28187, cache_creation: 1813 };
const USAGE_B: WorkerUsage = { input: 1, output: 120, cache_read: 30000, cache_creation: 0 };

function turn(o: Partial<DispatchedTurn> = {}): DispatchedTurn {
  return { raw: undefined, role: "verifier", exit: 0, usage: USAGE_A, ...o };
}

describe("diagnoseRepairableTurn — WHEN one bounded repair reprompt is warranted", () => {
  test("THE banked attempt-11 payload: exit 0, parses, but no top-level 'justification' -> repairable, issue names $.justification", () => {
    const need = diagnoseRepairableTurn("hard", turn({ raw: BANKED_ATTEMPT11_PAYLOAD }));
    expect(need.needed).toBe(true);
    if (!need.needed) return;
    expect(need.issues.map((i) => i.path)).toContain("$.justification");
    const msg = need.issues.map((i) => i.message).join(" | ");
    expect(msg).toContain("justification");
    // The echoed issue must TEACH the fix, not merely name the field: the model folded its reasoning
    // into verdict.reason, so the message has to say that is not a substitute.
    expect(msg).toContain("verdict.reason");
  });

  test("a fully valid hard-tier reply is NOT repairable (no wasted turn on a good verdict)", () => {
    const need = diagnoseRepairableTurn("hard", turn({ raw: { verdict: { outcome: "accept" }, justification: "deps validated" } }));
    expect(need.needed).toBe(false);
  });

  test("l5 tier: a reply missing 'justification' is repairable too (both tiers, per the contract)", () => {
    const need = diagnoseRepairableTurn("l5", turn({ raw: { verdict: "VALID" } }));
    expect(need.needed).toBe(true);
    if (!need.needed) return;
    expect(need.issues.map((i) => i.path)).toContain("$.justification");
  });

  test("an exit-12 parse/extraction failure carrying rawText is repairable, and the issue echoes the CONCRETE parse error + failure class", () => {
    const need = diagnoseRepairableTurn("hard", turn({ exit: 12, rawText: '{"verdict":{"outcome":"accept"}} Hope that helps!', parseError: "Unexpected token", parseClass: "trailing-content" }));
    expect(need.needed).toBe(true);
    if (!need.needed) return;
    expect(need.issues).toHaveLength(1);
    expect(need.issues[0]!.message).toContain("trailing-content");
    expect(need.issues[0]!.message).toContain("Unexpected token");
  });

  test("exit 12 with NO rawText (nothing was produced) is NOT repairable — there is no shape to correct", () => {
    expect(diagnoseRepairableTurn("hard", turn({ exit: 12, raw: undefined })).needed).toBe(false);
  });

  // The exit-code table (docs/worker-contract.md (c)): 10 = timeout, 11 = budget exceeded, 13 =
  // backend unavailable. None is a SHAPE failure, and 11 in particular must never provoke more spend.
  test("process-level failures (10 timeout / 11 budget-exceeded / 13 unavailable) are NEVER repaired", () => {
    for (const exit of [10, 11, 13]) {
      expect(diagnoseRepairableTurn("hard", turn({ exit, rawText: "whatever" })).needed).toBe(false);
    }
  });
});

describe("mergeRepairTurn — the repaired verdict carries NO extra trust", () => {
  const issues = [{ path: "$.justification", message: "missing required property 'justification'" }];

  test("a corrected reply replaces `raw`, clears the parse-failure fields, and records repair.ok", () => {
    const first = turn({ exit: 12, rawText: "garbage", parseError: "boom", parseClass: "unterminated" });
    const repaired = { verdict: { outcome: "challenge", target: "1", severity: "critical", category: "missing", reason: "no proof recorded" }, justification: "Node 1 has no recorded derivation." };
    const out = mergeRepairTurn("hard", first, turn({ raw: repaired, usage: USAGE_B }), issues);
    expect(out.exit).toBe(0);
    expect(out.raw).toEqual(repaired);
    expect(out.rawText).toBeUndefined();
    expect(out.parseError).toBeUndefined();
    expect(out.parseClass).toBeUndefined();
    const rec = out.repair as RepairRecord;
    expect(rec.ok).toBe(true);
    expect(rec.issues).toEqual(issues);
    expect(rec.usage).toEqual(USAGE_B);
  });

  test("the repair turn's usage is accounted SEPARATELY, never folded into the first turn's usage", () => {
    const out = mergeRepairTurn("hard", turn({ raw: BANKED_ATTEMPT11_PAYLOAD }), turn({ raw: { verdict: { outcome: "accept" }, justification: "j" }, usage: USAGE_B }), issues);
    // The first turn's own record is untouched (report.ts folds one `usage` record per real turn)...
    expect(out.usage).toEqual(USAGE_A);
    // ...and the repair's own cost is carried, so the caller can accrue BOTH to the campaign total.
    expect((out.repair as RepairRecord).usage).toEqual(USAGE_B);
  });

  test("a repair reply that is ALSO shape-invalid is terminal: the ORIGINAL failure representation is preserved verbatim", () => {
    const first = turn({ exit: 12, rawText: "garbage", parseError: "boom", parseClass: "unterminated" });
    const out = mergeRepairTurn("hard", first, turn({ raw: { verdict: { outcome: "accept" } } }), issues);
    expect(out.exit).toBe(12);
    expect(out.rawText).toBe("garbage");
    expect(out.parseClass).toBe("unterminated");
    const rec = out.repair as RepairRecord;
    expect(rec.ok).toBe(false);
    expect(rec.repairIssues!.map((i) => i.path)).toContain("$.justification");
  });

  test("a bind-shape failure whose repair also fails stays a bind failure (raw preserved), never silently accepted", () => {
    const first = turn({ raw: BANKED_ATTEMPT11_PAYLOAD });
    const out = mergeRepairTurn("hard", first, turn({ raw: { verdict: { outcome: "challenge" } } }), issues);
    expect(out.exit).toBe(0);
    expect(out.raw).toEqual(BANKED_ATTEMPT11_PAYLOAD); // the ORIGINAL invalid body, not the repair's
    expect((out.repair as RepairRecord).ok).toBe(false);
  });

  test("a repair turn that fails at the PROCESS level (nonzero exit) is recorded as a failed repair, never applied", () => {
    const first = turn({ raw: BANKED_ATTEMPT11_PAYLOAD });
    const out = mergeRepairTurn("hard", first, turn({ exit: 13, raw: undefined, usage: USAGE_B }), issues);
    const rec = out.repair as RepairRecord;
    expect(rec.ok).toBe(false);
    expect(rec.repairIssues!.map((i) => i.message).join(" ")).toContain("exit 13");
    expect(out.raw).toEqual(BANKED_ATTEMPT11_PAYLOAD);
  });

  // Non-negotiable (PRD C3): the repair path must never coerce `verdict.reason` into `justification`.
  test("a repair reply that STILL only carries verdict.reason is rejected — reason is never coerced into justification", () => {
    const out = mergeRepairTurn("hard", turn({ raw: BANKED_ATTEMPT11_PAYLOAD }), turn({ raw: BANKED_ATTEMPT11_PAYLOAD }), issues);
    expect((out.repair as RepairRecord).ok).toBe(false);
    expect(out.raw).toEqual(BANKED_ATTEMPT11_PAYLOAD);
    expect((out.raw as Record<string, unknown>).justification).toBeUndefined();
  });
});

// rk-i19: the PROVER half. `liveDispatchProve` had the identical exit-12 death mode with no
// correction — one malformed prover reply burned a full context-heavy turn and stalled the claim.
// The bounded path is the SAME core (one attempt ever, no extra trust, original failure preserved,
// usage accounted); only the body validator differs (src/drive/prover-raw.ts, not verdict-raw.ts).
describe("diagnoseRepairableProverTurn — WHEN a prover turn earns its ONE repair reprompt", () => {
  const pturn = (o: Partial<DispatchedTurn> = {}): DispatchedTurn => ({ raw: undefined, role: "prover", exit: 0, usage: USAGE_A, ...o });

  test("a decomposition whose child has no 'statement' is repairable, with the CONCRETE indexed path", () => {
    const need = diagnoseRepairableProverTurn(pturn({ raw: { children: [{ statement: "A" }, { justification: "modus_ponens" }] } }));
    expect(need.needed).toBe(true);
    if (!need.needed) return;
    expect(need.issues.map((i) => i.path)).toContain("$.children[1].statement");
  });

  test("a valid decomposition is NOT repairable (no wasted turn on a good proof step)", () => {
    expect(diagnoseRepairableProverTurn(pturn({ raw: { children: [{ statement: "A", depends: ["#0"] }] } })).needed).toBe(false);
  });

  test("an exit-12 parse/extraction failure carrying rawText is repairable, echoing the parse class + error", () => {
    const need = diagnoseRepairableProverTurn(pturn({ exit: 12, rawText: '{"children":[{"statement":"A"', parseError: "Unterminated string", parseClass: "unterminated" }));
    expect(need.needed).toBe(true);
    if (!need.needed) return;
    expect(need.issues).toHaveLength(1);
    expect(need.issues[0]!.message).toContain("unterminated");
    expect(need.issues[0]!.message).toContain("Unterminated string");
  });

  test("exit 12 with NO rawText is NOT repairable — nothing was produced, so there is no shape to correct", () => {
    expect(diagnoseRepairableProverTurn(pturn({ exit: 12 })).needed).toBe(false);
  });

  test("process-level failures (10 timeout / 11 budget-exceeded / 13 unavailable) are NEVER repaired", () => {
    for (const exit of [10, 11, 13]) {
      expect(diagnoseRepairableProverTurn(pturn({ exit, rawText: "whatever" })).needed).toBe(false);
    }
  });

  // THE no-laundering rule. src/drive/driver-guardrails.ts's `detectProverOverreach` DISCARDS (and
  // logs) a prover body carrying a verdict/outcome field. A repair reprompt that quietly asked the
  // worker to drop that field would turn a recorded overreach into a silently recorded proof — an
  // existing validity guard defeated by an encoding fix. The repair path must refuse it outright.
  test("an OVERREACHING prover body is never repaired — the overreach guard keeps it, discard and all", () => {
    expect(diagnoseRepairableProverTurn(pturn({ raw: { verdict: { outcome: "accept" }, children: [{ statement: "A" }] } })).needed).toBe(false);
    expect(diagnoseRepairableProverTurn(pturn({ raw: { outcome: "accept" } })).needed).toBe(false);
    expect(diagnoseRepairableProverTurn(pturn({ raw: "VALID" })).needed).toBe(false);
  });
});

describe("mergeProverRepairTurn — the repaired decomposition carries NO extra trust", () => {
  const pturn = (o: Partial<DispatchedTurn> = {}): DispatchedTurn => ({ raw: undefined, role: "prover", exit: 0, usage: USAGE_A, ...o });
  const issues = [{ path: "$.children[0].statement", message: "missing required property 'statement'" }];
  const GOOD = { children: [{ statement: "Step A", justification: "by_definition" }] };

  test("a corrected reply replaces `raw`, clears the parse-failure fields, keeps role 'prover', records repair.ok", () => {
    const first = pturn({ exit: 12, rawText: "garbage", parseError: "boom", parseClass: "unterminated" });
    const out = mergeProverRepairTurn(first, pturn({ raw: GOOD, usage: USAGE_B }), issues);
    expect(out.exit).toBe(0);
    expect(out.role).toBe("prover");
    expect(out.raw).toEqual(GOOD);
    expect(out.rawText).toBeUndefined();
    expect(out.parseError).toBeUndefined();
    expect(out.parseClass).toBeUndefined();
    expect(out.usage).toEqual(USAGE_A);
    expect((out.repair as RepairRecord).ok).toBe(true);
    expect((out.repair as RepairRecord).usage).toEqual(USAGE_B);
  });

  test("a repair reply that is ALSO malformed is terminal: the ORIGINAL failure representation survives verbatim", () => {
    const first = pturn({ exit: 12, rawText: "garbage", parseError: "boom", parseClass: "unterminated" });
    const out = mergeProverRepairTurn(first, pturn({ raw: { children: [] } }), issues);
    expect(out.exit).toBe(12);
    expect(out.rawText).toBe("garbage");
    expect(out.parseClass).toBe("unterminated");
    expect(out.raw).toBeUndefined();
    const r = out.repair as RepairRecord;
    expect(r.ok).toBe(false);
    expect(r.repairIssues!.map((i) => i.path)).toContain("$.children");
  });

  test("a repair reply that smuggles a verdict field is REFUSED — a repair can never launder an overreach in", () => {
    const out = mergeProverRepairTurn(pturn({ raw: { children: [{}] } }), pturn({ raw: { children: [{ statement: "A" }], verdict: "VALID" } }), issues);
    expect((out.repair as RepairRecord).ok).toBe(false);
    expect(out.raw).toEqual({ children: [{}] });
  });

  test("a repair turn that fails at the PROCESS level is recorded as a failed repair, never applied", () => {
    const out = mergeProverRepairTurn(pturn({ raw: { children: [{}] } }), pturn({ exit: 13, raw: undefined, usage: USAGE_B }), issues);
    const r = out.repair as RepairRecord;
    expect(r.ok).toBe(false);
    expect(r.repairIssues!.map((i) => i.message).join(" ")).toContain("exit 13");
    expect(r.usage).toEqual(USAGE_B);
    expect(out.raw).toEqual({ children: [{}] });
  });
});

describe("addUsage — repair-turn accounting arithmetic", () => {
  test("sums every field; undefined operands pass the other through; both undefined stays undefined", () => {
    expect(addUsage(USAGE_A, USAGE_B)).toEqual({ input: 3, output: 750, cache_read: 58187, cache_creation: 1813 });
    expect(addUsage(USAGE_A, undefined)).toEqual(USAGE_A);
    expect(addUsage(undefined, USAGE_B)).toEqual(USAGE_B);
    expect(addUsage(undefined, undefined)).toBeUndefined();
  });
});
