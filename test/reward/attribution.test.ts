// Tests for src/reward/attribution.ts (rk-0ree): attribution rule v1 — the ONE rule composing
// the driver log's two usage-record conventions into per-registry-node spentTokens. Tier A payout
// math (H_real = log2(1 + spent/T0) reads this figure straight into a permanent, append-only close
// event), so every clause of the rule is asserted here:
//   1. hard-tier records (claimId NOT starting "l5:") attribute 100% to `contractId` — every turn
//      of a contract's af workspace is spend toward that contract; the af-internal `nodeId` is
//      never read;
//   2. L5 records (claimId starting "l5:") attribute member turns to `nodeId` (the registry item
//      id) and split "(session-open)" sentinel cost integer-fair across that session's dispatched
//      members, remainder to earliest in first-appearance order;
//   3. a session-open with no member turns is loudly-reported unattributable overhead, never
//      silently dropped and never smeared onto a node;
//   4. conservation: attributed + unattributed === the sum of every record's usageTokens, for any
//      input (the same property src/drive/accounting.ts's grandTotal test asserts for the rollup).

import { describe, expect, test } from "bun:test";
import { attributeSpentTokens } from "../../src/reward/attribution";
import { L5_SESSION_OPEN_NODE_ID, type UsageLogRecord } from "../../src/drive/report-parse";
import type { WorkerUsage } from "../../src/drive/worker-result";

function usage(input: number, output = 0, cache_read = 0, cache_creation = 0): WorkerUsage {
  return { input, output, cache_read, cache_creation };
}

function hardTurn(contractId: string, nodeId: string, u: WorkerUsage, over: Partial<UsageLogRecord> = {}): UsageLogRecord {
  return { kind: "usage", at: "2026-08-11T00:00:00Z", contractId, claimId: `claim-${contractId}`, nodeId, role: "verifier", sessionId: `s-${contractId}`, usage: u, ...over };
}

function l5Turn(batch: string, nodeId: string, u: WorkerUsage, sessionId = `sess-${batch}`): UsageLogRecord {
  return { kind: "usage", at: "2026-08-11T00:00:00Z", contractId: `l5:${batch}`, claimId: `l5:${batch}`, nodeId, role: "verifier", sessionId, usage: u };
}

function totalTokens(records: readonly UsageLogRecord[]): number {
  return records.reduce((s, r) => s + r.usage.input + r.usage.output + r.usage.cache_read + r.usage.cache_creation, 0);
}

describe("attribution rule v1 — hard-tier convention", () => {
  test("every workspace turn attributes to contractId, across af-internal node ids and roles", () => {
    const records: UsageLogRecord[] = [
      hardTurn("lem-a", "1", usage(100, 50)),
      hardTurn("lem-a", "1.2", usage(200, 25), { role: "prover", claimId: "claim-lem-a-prover" }),
      hardTurn("lem-a", "1.2.3", usage(10, 5, 300, 40)),
    ];
    const result = attributeSpentTokens(records);
    expect(result.spentByNode.get("lem-a")).toBe(100 + 50 + 200 + 25 + 10 + 5 + 300 + 40);
    expect(result.spentByNode.size).toBe(1);
  });

  test("the af-internal nodeId is never read as a registry id", () => {
    // A hard-tier record whose nodeId happens to collide with another registry node's id must
    // still attribute to contractId — the perturbation "attribute hard-tier by nodeId" goes RED here.
    const records: UsageLogRecord[] = [hardTurn("lem-a", "lem-b", usage(500))];
    const result = attributeSpentTokens(records);
    expect(result.spentByNode.get("lem-a")).toBe(500);
    expect(result.spentByNode.has("lem-b")).toBe(false);
  });

  test("repair turns are real spend and count like any other turn", () => {
    const records: UsageLogRecord[] = [
      hardTurn("lem-a", "1", usage(100)),
      hardTurn("lem-a", "1", usage(80), { repair: true }),
    ];
    expect(attributeSpentTokens(records).spentByNode.get("lem-a")).toBe(180);
  });

  test("distinct contracts accumulate separately", () => {
    const records: UsageLogRecord[] = [
      hardTurn("lem-a", "1", usage(100)),
      hardTurn("lem-b", "1", usage(70)),
    ];
    const result = attributeSpentTokens(records);
    expect(result.spentByNode.get("lem-a")).toBe(100);
    expect(result.spentByNode.get("lem-b")).toBe(70);
  });
});

describe("attribution rule v1 — L5 convention", () => {
  test("member turns attribute to nodeId (the registry item id), never to the l5:<batchId> claim", () => {
    const records: UsageLogRecord[] = [l5Turn("b1", "lem-a", usage(40, 10))];
    const result = attributeSpentTokens(records);
    expect(result.spentByNode.get("lem-a")).toBe(50);
    expect(result.spentByNode.has("l5:b1")).toBe(false);
  });

  test("session-open cost splits integer-fair across the session's members, remainder to earliest", () => {
    const records: UsageLogRecord[] = [
      l5Turn("b1", L5_SESSION_OPEN_NODE_ID, usage(10)),
      l5Turn("b1", "lem-a", usage(0)),
      l5Turn("b1", "lem-b", usage(0)),
      l5Turn("b1", "lem-c", usage(0)),
    ];
    const result = attributeSpentTokens(records);
    // 10 over 3 members: floor 3 each, remainder 1 to the first-appearing member.
    expect(result.spentByNode.get("lem-a")).toBe(4);
    expect(result.spentByNode.get("lem-b")).toBe(3);
    expect(result.spentByNode.get("lem-c")).toBe(3);
    expect(result.unattributedSessionOpen).toEqual([]);
  });

  test("session-open pooling is per sessionId — two batches never share a pool", () => {
    const records: UsageLogRecord[] = [
      l5Turn("b1", L5_SESSION_OPEN_NODE_ID, usage(100), "sess-1"),
      l5Turn("b1", "lem-a", usage(0), "sess-1"),
      l5Turn("b2", L5_SESSION_OPEN_NODE_ID, usage(60), "sess-2"),
      l5Turn("b2", "lem-b", usage(0), "sess-2"),
    ];
    const result = attributeSpentTokens(records);
    expect(result.spentByNode.get("lem-a")).toBe(100);
    expect(result.spentByNode.get("lem-b")).toBe(60);
  });

  test("a member dispatched twice in one session is one share, not two", () => {
    const records: UsageLogRecord[] = [
      l5Turn("b1", L5_SESSION_OPEN_NODE_ID, usage(8)),
      l5Turn("b1", "lem-a", usage(1)),
      l5Turn("b1", "lem-a", usage(1)),
      l5Turn("b1", "lem-b", usage(1)),
    ];
    const result = attributeSpentTokens(records);
    // Pool 8 over 2 DISTINCT members: 4 each. lem-a's own turns: 2.
    expect(result.spentByNode.get("lem-a")).toBe(2 + 4);
    expect(result.spentByNode.get("lem-b")).toBe(1 + 4);
  });

  test("a session-open with no member turns is unattributable overhead, reported and not smeared", () => {
    const records: UsageLogRecord[] = [l5Turn("b1", L5_SESSION_OPEN_NODE_ID, usage(123), "sess-dead")];
    const result = attributeSpentTokens(records);
    expect(result.spentByNode.size).toBe(0);
    expect(result.unattributedSessionOpen).toEqual([{ sessionId: "sess-dead", tokens: 123 }]);
  });
});

describe("attribution rule v1 — composition and conservation", () => {
  test("a node proven hard-tier AND reviewed at L5 sums both conventions", () => {
    const records: UsageLogRecord[] = [
      hardTurn("lem-a", "1", usage(1000)),
      l5Turn("b1", "lem-a", usage(200)),
    ];
    expect(attributeSpentTokens(records).spentByNode.get("lem-a")).toBe(1200);
  });

  test("conservation: attributed + unattributed equals the total of every record's tokens", () => {
    const records: UsageLogRecord[] = [
      hardTurn("lem-a", "1", usage(101, 3, 7, 11)),
      hardTurn("lem-b", "2", usage(13, 17)),
      l5Turn("b1", L5_SESSION_OPEN_NODE_ID, usage(19, 23)),
      l5Turn("b1", "lem-a", usage(29)),
      l5Turn("b1", "lem-c", usage(31)),
      l5Turn("b2", L5_SESSION_OPEN_NODE_ID, usage(37), "sess-dead"),
    ];
    const result = attributeSpentTokens(records);
    const attributed = [...result.spentByNode.values()].reduce((a, b) => a + b, 0);
    const unattributed = result.unattributedSessionOpen.reduce((a, b) => a + b.tokens, 0);
    expect(attributed + unattributed).toBe(totalTokens(records));
  });

  test("empty input yields an empty result", () => {
    const result = attributeSpentTokens([]);
    expect(result.spentByNode.size).toBe(0);
    expect(result.unattributedSessionOpen).toEqual([]);
  });
});
