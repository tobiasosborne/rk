// Gate 8 demotion validity semantics (rk-4317): only a real compensating event, backed by a
// present evidence record and an honestly downgraded shard, may neutralize the original close's
// tier-consistency finding.

import { describe, expect, test } from "bun:test";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";
import { rewardGate } from "../../src/gates/reward";
import { snapshotFromFiles } from "../../src/gates/snapshot";

const LEDGER = ".rk/reward-ledger.jsonl";
const EVIDENCE = ".rk/refuting-verdict.json";

function shard(status: string, af: string): string {
  return `---\nid: lem-a\nkind: lemma\nstatus: ${status}\naf: ${af}\ncontract: A.\n---\n\nA.\n`;
}

function close(): Record<string, unknown> {
  return {
    type: "close", nodeId: "lem-a", tier: "proved", spentTokens: 300_000,
    citedDefs: [], citedLemmas: [],
  };
}

function demote(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: "2",
    type: "demote",
    targetCloseSeq: 0,
    reason: "A later independent verdict refuted the proof.",
    evidenceRef: EVIDENCE,
    resultingStatus: "stated",
    resultingAf: "none",
    ...overrides,
  };
}

function run(
  currentStatus: string,
  currentAf: string,
  events: Record<string, unknown>[],
  includeEvidence = true,
) {
  const files: Record<string, string> = {
    "argument/lem-a.md": shard(currentStatus, currentAf),
    [LEDGER]: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
  };
  if (includeEvidence) files[EVIDENCE] = JSON.stringify({ verdict: "INVALID", itemId: "lem-a" });
  return rewardGate.run(snapshotFromFiles(files), DEFAULT_GATE_CONFIG);
}

describe("Gate 8 honest demotion", () => {
  test("a valid demotion plus an honestly downgraded shard is green", () => {
    const result = run("stated", "none", [close(), demote()]);
    expect(result.findings).toEqual([]);
    expect(result.coverage[0]).toMatchObject({ checked: 2, total: 2 });
  });

  test("a demotion referencing no previously banked close is red", () => {
    const result = run("proved", "validated", [close(), demote({ targetCloseSeq: 9 })]);
    expect(result.findings.some((f) => f.message.includes("reward-demote-unbanked-close"))).toBe(true);
  });

  test("demotion-without-downgrade is red even when the event mirrors the lying shard", () => {
    const result = run("proved", "validated", [
      close(), demote({ resultingStatus: "proved", resultingAf: "validated" }),
    ]);
    expect(result.findings.some((f) => f.message.includes("reward-demotion-without-downgrade"))).toBe(true);
  });

  test("the recorded resulting state must exactly match the shard's current state", () => {
    const result = run("stated", "none", [close(), demote({ resultingStatus: "open" })]);
    expect(result.findings.some((f) => f.message.includes("reward-demotion-without-downgrade"))).toBe(true);
    expect(result.findings.some((f) => f.message.includes("registry currently says status='stated', af='none'"))).toBe(true);
  });

  test("an evidence path that does not exist is red and cannot neutralize the close", () => {
    const result = run("stated", "none", [close(), demote()], false);
    expect(result.findings.some((f) => f.message.includes("reward-demote-evidence-missing"))).toBe(true);
    expect(result.findings.some((f) => f.message.includes("reward-tier-unsupported"))).toBe(true);
  });
});
