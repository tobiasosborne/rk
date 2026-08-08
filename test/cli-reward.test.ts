// Tests for `rk reward report` (src/cli/reward.ts, rk-ptx0/S0): the SHADOW payout surface — it
// folds `.rk/reward-ledger.jsonl` through src/reward/engine.ts and prints balances, escrows, every
// diagnostic, the totals, and every malformed ledger line. Two things are load-bearing and tested
// as such: nothing the engine flags is ever summarized away, and `--strict` turns "the ledger has
// something wrong with it" into a non-zero exit a driver can act on.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { formatRewardReport, rewardDispatch } from "../src/cli/reward";
import { computePayouts } from "../src/reward/engine";
import { rewardLedgerPath } from "../src/store/reward-ledger";
import type { RewardEvent } from "../src/reward/types";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

/** A repo whose ledger holds exactly `lines` (raw text, so a test can plant a malformed one). */
function repo(text?: string): string {
  const root = mkdtempSync(join(tmpdir(), "rk-reward-cli-"));
  dirs.push(root);
  if (text !== undefined) {
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(rewardLedgerPath(root), text, "utf8");
  }
  return root;
}

function ledger(...events: RewardEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

// spentTokens 300_000 => H_real = log2(1 + 3) = 2 exactly; proved weight 1.0 => payout 2.0, and the
// single cited def earns REUSE_RATE * 2.0 = 0.2. Hand-computed, per the S0 success criterion.
const CLOSE_A: RewardEvent = {
  type: "close", nodeId: "lem-a", tier: "proved", spentTokens: 300_000,
  citedDefs: ["def-x"], citedLemmas: [],
};

describe("formatRewardReport — nothing is summarized away", () => {
  test("balances are printed sorted, with the hand-computed values", () => {
    const load = { events: [CLOSE_A], malformed: [] };
    const lines = formatRewardReport(load, computePayouts(load.events));
    const text = lines.join("\n");
    expect(text).toContain("def-x");
    expect(text).toContain("2.000000");
    expect(text).toContain("0.200000");
    expect(text.indexOf("def-x")).toBeLessThan(text.indexOf("lem-a")); // sorted by id
  });

  test("every diagnostic is listed individually, with its seq and code", () => {
    const events: RewardEvent[] = [CLOSE_A, CLOSE_A, { type: "reduce", obligation: "lem-z", children: ["lem-y"] }];
    const lines = formatRewardReport({ events, malformed: [] }, computePayouts(events));
    const text = lines.join("\n");
    expect(text).toContain("diagnostics (2)");
    expect(text).toContain("seq 1");
    expect(text).toContain("duplicate-close");
    expect(text).toContain("seq 2");
    expect(text).toContain("reduce-unpredicted");
  });

  test("escrows report obligation, total, remaining and expiry", () => {
    const events: RewardEvent[] = [
      { type: "predict", obligation: "lem-p", estimator: "w", p250k: 0.1, p1m: 0.2 },
      { type: "predict", obligation: "lem-c", estimator: "w", p250k: 0.9, p1m: 0.95 },
      { type: "reduce", obligation: "lem-p", children: ["lem-c"] },
    ];
    const lines = formatRewardReport({ events, malformed: [] }, computePayouts(events));
    const text = lines.join("\n");
    expect(text).toContain("escrows (1)");
    expect(text).toContain("lem-p");
    expect(text).toContain("remaining");
    expect(text).toContain("live"); // not expired
  });

  test("an expired escrow is named as expired", () => {
    const events: RewardEvent[] = [
      { type: "predict", obligation: "lem-p", estimator: "w", p250k: 0.1, p1m: 0.2 },
      { type: "predict", obligation: "lem-c", estimator: "w", p250k: 0.9, p1m: 0.95 },
      { type: "reduce", obligation: "lem-p", children: ["lem-c"] },
      { type: "round", n: 99 },
    ];
    const lines = formatRewardReport({ events, malformed: [] }, computePayouts(events));
    const text = lines.join("\n");
    expect(text).toContain("EXPIRED");
    expect(text).toContain("escrow-expired");
  });

  test("totals passthrough counts are printed", () => {
    const lines = formatRewardReport({ events: [CLOSE_A], malformed: [] }, computePayouts([CLOSE_A]));
    expect(lines.join("\n")).toContain("closes=1");
  });

  test("malformed lines get their own loud section, with line number and raw bytes", () => {
    const load = { events: [], malformed: [{ line: 4, raw: "{oops", error: "unparseable JSON: x" }] };
    const text = formatRewardReport(load, computePayouts(load.events)).join("\n");
    expect(text).toContain("malformed");
    expect(text).toContain("line 4");
    expect(text).toContain("{oops");
  });

  test("a clean empty ledger says so honestly rather than printing nothing", () => {
    const text = formatRewardReport({ events: [], malformed: [] }, computePayouts([])).join("\n");
    expect(text).toContain("0 event");
    expect(text).toContain("balances (0)");
  });
});

describe("rk reward report — CLI wiring and exit codes", () => {
  test("a clean ledger: exit 0, balances printed", async () => {
    const { out, lines } = capture();
    const code = await rewardDispatch(["report", "--root", repo(ledger(CLOSE_A))], out);
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("lem-a");
  });

  test("a missing ledger is a legitimate state: exit 0, empty report", async () => {
    const { out, lines } = capture();
    const code = await rewardDispatch(["report", "--root", repo()], out);
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("0 event");
  });

  test("--strict on a clean ledger still exits 0", async () => {
    const { out } = capture();
    expect(await rewardDispatch(["report", "--strict", "--root", repo(ledger(CLOSE_A))], out)).toBe(0);
  });

  test("--strict exits 1 when the engine raised a diagnostic", async () => {
    const { out, lines } = capture();
    const code = await rewardDispatch(["report", "--strict", "--root", repo(ledger(CLOSE_A, CLOSE_A))], out);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("duplicate-close");
  });

  test("--strict exits 1 on a malformed ledger line, even with no diagnostics", async () => {
    const { out, lines } = capture();
    const code = await rewardDispatch(["report", "--strict", "--root", repo("not json\n")], out);
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("line 1");
  });

  test("without --strict a malformed line is still reported, but the exit stays 0", async () => {
    const { out, lines } = capture();
    const code = await rewardDispatch(["report", "--root", repo("not json\n")], out);
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("malformed");
  });

  test("no subcommand prints help; an unknown one exits 2", async () => {
    const { out, lines } = capture();
    expect(await rewardDispatch([], out)).toBe(0);
    expect(lines.join("\n")).toContain("rk reward");
    const second = capture();
    expect(await rewardDispatch(["bogus"], second.out)).toBe(2);
    expect(second.lines.join("\n")).toContain("unknown reward subcommand");
  });

  test("registered in the top-level dispatcher, and --help is side-effect-free", async () => {
    const { out, lines } = capture();
    expect(await run(["reward", "--help"], { out })).toBe(0);
    expect(lines.join("\n")).toContain("rk reward");
  });

  test("top-level 'rk' help mentions reward", async () => {
    const { out, lines } = capture();
    await run([], { out });
    expect(lines.join("\n")).toContain("rk reward");
  });
});
