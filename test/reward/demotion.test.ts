// rk-4317: a demotion is an append-only compensation for a close that did not survive
// validity review. These tests pin the pure parser/fold/calibration semantics independently of
// Gate 8's registry/evidence checks.

import { describe, expect, test } from "bun:test";
import rewardSchema from "../../schemas/reward-ledger.v1.json";
import { computeCalibration } from "../../src/reward/calibration";
import { computePayouts } from "../../src/reward/engine";
import { parseRewardLedger, REWARD_LEDGER_SCHEMA_VERSION } from "../../src/reward/parse";
import type { RewardEvent } from "../../src/reward/types";
import { serializeRewardEvent } from "../../src/store/reward-ledger";

const close = (nodeId = "lem-a"): RewardEvent => ({
  type: "close",
  nodeId,
  tier: "proved",
  spentTokens: 300_000,
  citedDefs: ["def-x"],
  citedLemmas: ["lem-b"],
});

const demote = (targetCloseSeq = 0): RewardEvent => ({
  type: "demote",
  targetCloseSeq,
  reason: "Independent review refuted the banked claim.",
  evidenceRef: ".rk/refuting-verdict.json",
  resultingStatus: "stated",
  resultingAf: "none",
});

describe("reward-ledger schema v2 compatibility", () => {
  test("legacy unversioned v1 events remain readable while demote is a v2-only event", () => {
    const legacy = JSON.stringify(close());
    const explicitV1 = JSON.stringify({ schemaVersion: "1", ...close("lem-v1") });
    const v2Demote = JSON.stringify({ schemaVersion: "2", ...demote() });
    const parsed = parseRewardLedger(`${legacy}\n${explicitV1}\n${v2Demote}\n`);
    expect(parsed.malformed).toEqual([]);
    expect(parsed.events).toEqual([close(), close("lem-v1"), demote()]);

    const unversionedDemote = parseRewardLedger(`${JSON.stringify(demote())}\n`);
    expect(unversionedDemote.events).toEqual([]);
    expect(unversionedDemote.malformed[0]!.error).toContain("schemaVersion");
    expect(unversionedDemote.malformed[0]!.error).toContain("'2'");
  });

  test("new writes carry schemaVersion 2 and the checked-in schema const agrees", () => {
    expect(REWARD_LEDGER_SCHEMA_VERSION).toBe("2");
    expect(JSON.parse(serializeRewardEvent(close())).schemaVersion).toBe("2");
    expect(rewardSchema.properties.schemaVersion.const).toBe("2");
  });

  test("demote requires a non-blank reason and evidence reference", () => {
    const missingReason = parseRewardLedger(JSON.stringify({
      schemaVersion: "2", ...demote(), reason: "   ",
    }) + "\n");
    expect(missingReason.malformed[0]!.error).toContain("reason");

    const missingEvidence = parseRewardLedger(JSON.stringify({
      schemaVersion: "2", ...demote(), evidenceRef: "",
    }) + "\n");
    expect(missingEvidence.malformed[0]!.error).toContain("evidenceRef");
  });
});

describe("computePayouts demotion compensation", () => {
  test("reverses the close payout and every reuse credit without editing history", () => {
    const result = computePayouts([close(), demote()]);
    expect(result.balances).toEqual({});
    expect(result.diagnostics).toEqual([]);
    expect(result.totals.closes).toBe(1);
    expect(result.totals.demotions).toBe(1);
  });

  test("reverses compression credit causally minted by the target close", () => {
    const result = computePayouts([
      close(),
      { type: "compress", nodeId: "lem-a", useSites: ["use-a", "use-b"] },
      demote(),
    ]);
    expect(result.balances).toEqual({});
    expect(result.diagnostics).toEqual([]);
  });

  test("reverses a child close's escrow vesting and restores the unvested share", () => {
    const hSlow = Math.log2(7.25);
    const hFast = Math.log2(2.25);
    const value = hSlow - hFast;
    const events: RewardEvent[] = [
      { type: "predict", obligation: "goal", estimator: "e", p250k: 0, p1m: 1 },
      { type: "predict", obligation: "child", estimator: "e", p250k: 1, p1m: 1 },
      { type: "reduce", obligation: "goal", children: ["child"] },
      { ...close("child"), citedDefs: [], citedLemmas: [] },
      demote(3),
    ];
    const result = computePayouts(events);
    expect(result.balances["goal"]).toBeCloseTo(0.25 * value, 6);
    expect(result.balances["child"] ?? 0).toBe(0);
    expect(result.escrows[0]!.remaining).toBeCloseTo(0.75 * value, 6);
  });

  test("a dangling or repeated demotion never creates negative credit", () => {
    const dangling = computePayouts([demote(99)]);
    expect(dangling.balances).toEqual({});
    expect(dangling.diagnostics[0]!.code).toBe("demote-unbanked-close");

    const repeated = computePayouts([close(), demote(), demote()]);
    expect(repeated.balances).toEqual({});
    expect(repeated.diagnostics.some((d) => d.code === "demote-unbanked-close")).toBe(true);
  });
});

describe("demoted-close calibration", () => {
  test("scores the original prediction against false, not against the withdrawn close", () => {
    const events: RewardEvent[] = [
      { type: "predict", obligation: "lem-a", estimator: "overconfident", p250k: 1, p1m: 1 },
      close(),
      demote(1),
    ];
    const result = computeCalibration(events);
    expect(result.unresolved).toBe(0);
    expect(result.estimators).toEqual([
      { estimator: "overconfident", resolved: 1, brier: 1, weight: 0.5 },
    ]);
  });
});
