// 1:1 test file for src/store/reward-ledger.ts (rk-ptx0 / S0) — the fs edge over the append-only
// reward event log `.rk/reward-ledger.jsonl`. Two properties carry the weight here:
//   (a) APPEND-ONLY round trip: what went in comes back out, in order, one line per event, and an
//       earlier event survives a later append (the engine's fold is order-sensitive — ORDER IS
//       MEANING, src/reward/types.ts).
//   (b) MALFORMED LINES ARE FIRST-CLASS DATA (CLAUDE.md L2, the LB4 lesson): a garbage line, a
//       blank line, an unknown `type`, or a line missing a required field for its type is NEVER
//       silently dropped — it comes back in `malformed` with its 1-based line number and raw text.

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendRewardEvent,
  appendRewardEvents,
  loadRewardLedger,
  parseRewardLedger,
  rewardLedgerPath,
} from "../../src/store/reward-ledger";
import type { RewardEvent } from "../../src/reward/types";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function repo(ledger?: string): string {
  const root = mkdtempSync(join(tmpdir(), "rk-reward-ledger-"));
  dirs.push(root);
  if (ledger !== undefined) {
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(rewardLedgerPath(root), ledger, "utf8");
  }
  return root;
}

const CLOSE: RewardEvent = {
  type: "close", nodeId: "lem-a", tier: "proved", spentTokens: 300_000,
  citedDefs: ["def-x"], citedLemmas: [],
};

describe("reward ledger — absence and emptiness", () => {
  test("no ledger file at all: empty log, no malformed lines, never an exception", () => {
    const load = loadRewardLedger(repo());
    expect(load.events).toEqual([]);
    expect(load.malformed).toEqual([]);
  });

  test("an empty ledger file reads as an empty log", () => {
    const load = loadRewardLedger(repo(""));
    expect(load.events).toEqual([]);
    expect(load.malformed).toEqual([]);
  });
});

describe("reward ledger — append/load round trip", () => {
  test("appending into a repo with no .rk dir creates it and the file", () => {
    const root = repo();
    expect(existsSync(rewardLedgerPath(root))).toBe(false);
    appendRewardEvent(root, { type: "round", n: 1 });
    expect(existsSync(rewardLedgerPath(root))).toBe(true);
    expect(loadRewardLedger(root).events).toEqual([{ type: "round", n: 1 }]);
  });

  test("one append writes exactly one newline-terminated line", () => {
    const root = repo();
    appendRewardEvent(root, CLOSE);
    const text = readFileSync(rewardLedgerPath(root), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    expect(text.split("\n").filter((l) => l.length > 0)).toHaveLength(1);
  });

  test("every event kind round-trips unchanged, in append order", () => {
    const root = repo();
    const events: RewardEvent[] = [
      { type: "round", n: 0 },
      { type: "predict", obligation: "lem-a", estimator: "worker-1", p250k: 0.3, p1m: 0.7 },
      { type: "reduce", obligation: "lem-a", children: ["lem-b", "lem-c"] },
      CLOSE,
      { type: "prune", nodeId: "lem-c", certRef: "cert-1", wildcard: true },
      { type: "compress", nodeId: "lem-a", useSites: ["lem-d", "lem-e"] },
    ];
    for (const e of events) appendRewardEvent(root, e);
    expect(loadRewardLedger(root).events).toEqual(events);
  });

  test("APPEND-ONLY: a second append never disturbs the earlier records", () => {
    const root = repo();
    appendRewardEvent(root, { type: "round", n: 1 });
    appendRewardEvents(root, [CLOSE, { type: "round", n: 2 }]);
    expect(loadRewardLedger(root).events).toEqual([{ type: "round", n: 1 }, CLOSE, { type: "round", n: 2 }]);
  });

  test("a serialized event carries no timestamp and no extra keys (determinism stance)", () => {
    const root = repo();
    appendRewardEvent(root, { ...CLOSE, extra: "nope", timestamp: "2026-08-08" } as unknown as RewardEvent);
    const parsed = JSON.parse(readFileSync(rewardLedgerPath(root), "utf8").trim()) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["citedDefs", "citedLemmas", "nodeId", "spentTokens", "tier", "type"]);
  });

  test("appending an event that would not survive a reload is refused, not written", () => {
    const root = repo();
    expect(() => appendRewardEvent(root, { type: "close", nodeId: "lem-a" } as unknown as RewardEvent)).toThrow();
    expect(loadRewardLedger(root).events).toEqual([]);
  });
});

describe("reward ledger — malformed lines are first-class data, never dropped", () => {
  test("a garbage line surfaces with its 1-based line number and raw text; good lines still load", () => {
    const good = JSON.stringify({ type: "round", n: 1 });
    const load = loadRewardLedger(repo(`${good}\nnot json at all\n${good}\n`));
    expect(load.events).toHaveLength(2);
    expect(load.malformed).toHaveLength(1);
    expect(load.malformed[0]!.line).toBe(2);
    expect(load.malformed[0]!.raw).toBe("not json at all");
    expect(load.malformed[0]!.error.length).toBeGreaterThan(0);
  });

  test("an unknown event type is malformed, not an ignored no-op", () => {
    const load = parseRewardLedger(JSON.stringify({ type: "teleport", nodeId: "lem-a" }) + "\n");
    expect(load.events).toEqual([]);
    expect(load.malformed).toHaveLength(1);
    expect(load.malformed[0]!.error).toContain("teleport");
  });

  test("a known type missing a required field is malformed", () => {
    const load = parseRewardLedger(JSON.stringify({ type: "close", nodeId: "lem-a", tier: "proved" }) + "\n");
    expect(load.events).toEqual([]);
    expect(load.malformed).toHaveLength(1);
    expect(load.malformed[0]!.error).toContain("spentTokens");
  });

  test("a close with an unregistered tier is malformed (weights are pre-registered)", () => {
    const load = parseRewardLedger(JSON.stringify({ ...CLOSE, tier: "vibes" }) + "\n");
    expect(load.malformed).toHaveLength(1);
  });

  test("a blank line inside the log is reported, not silently skipped", () => {
    const good = JSON.stringify({ type: "round", n: 1 });
    const load = parseRewardLedger(`${good}\n\n${good}\n`);
    expect(load.events).toHaveLength(2);
    expect(load.malformed).toHaveLength(1);
    expect(load.malformed[0]!.line).toBe(2);
  });

  test("the file's own trailing newline is a format artifact, not a malformed line", () => {
    const load = parseRewardLedger(JSON.stringify({ type: "round", n: 1 }) + "\n");
    expect(load.malformed).toEqual([]);
  });

  test("a JSON line that is not an object (array, number, null) is malformed", () => {
    const load = parseRewardLedger("[1,2]\n7\nnull\n");
    expect(load.events).toEqual([]);
    expect(load.malformed).toHaveLength(3);
  });

  test("a truncated final line (crash mid-append) is reported, earlier lines survive", () => {
    const good = JSON.stringify({ type: "round", n: 1 });
    const load = parseRewardLedger(`${good}\n{"type":"clo`);
    expect(load.events).toHaveLength(1);
    expect(load.malformed).toHaveLength(1);
    expect(load.malformed[0]!.line).toBe(2);
  });
});
