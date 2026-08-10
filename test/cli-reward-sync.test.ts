// Tests for `rk reward sync` (src/cli/reward-sync.ts, rk-ptx0/S0-2): the SHADOW EMITTER that
// reconciles registry ground truth into the append-only reward ledger. Four properties are
// load-bearing and tested as such:
//   - the CLOSE tier comes from src/reward/tier.ts's ONE mapping, never from the shard's
//     self-report (a `status: proved` + `af: none` shard gets NO close at all — the S0-1
//     laundering class, fixed by construction here);
//   - the emitter and Gate 8 agree BY CONSTRUCTION: the gate reports zero findings over a ledger
//     this command wrote;
//   - it is idempotent (a second run appends nothing) and `--dry-run` writes nothing;
//   - a structurally incomplete build, or an unreadable ledger, is a loud refusal that writes
//     NOTHING (the same refusal stance as `rk frontier`).
// Repo-tree conventions follow test/cli-frontier.test.ts (real tree on disk, af/fr pointed at a
// guaranteed-absent binary) and test/cli-reward.test.ts (raw ledger bytes).

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { planRewardSync, rewardSyncCommand } from "../src/cli/reward-sync";
import { rewardDispatch } from "../src/cli/reward";
import { rewardGate } from "../src/gates/reward";
import { DEFAULT_GATE_CONFIG } from "../src/gates/config";
import { loadSnapshot } from "../src/store/snapshot-load";
import { loadRewardLedger, rewardLedgerPath } from "../src/store/reward-ledger";
import type { RewardEvent } from "../src/reward/types";
import type { RegistryNode } from "../src/graph/types";

const ABSENT = ["definitely-not-a-real-binary-xyz"];
const DEPS = { afCommand: ABSENT, frCommand: ABSENT };

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "rk-reward-sync-"));
  dirs.push(root);
  return root;
}

function writeShard(root: string, id: string, extra: Record<string, string> = {}): void {
  mkdirSync(join(root, "argument"), { recursive: true });
  const fm = { id, kind: "lemma", contract: `${id} holds.`, af: "none", ...extra };
  const body = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
  writeFileSync(join(root, "argument", `${id}.md`), `---\n${body}\n---\n\n${id}'s narrative.\n`);
}

function writeDef(root: string, id: string): void {
  mkdirSync(join(root, "definitions"), { recursive: true });
  writeFileSync(join(root, "definitions", `${id}.md`), `---\nid: ${id}\n---\n\n${id}.\n`);
}

function seedLedger(root: string, ...events: RewardEvent[]): void {
  mkdirSync(join(root, ".rk"), { recursive: true });
  writeFileSync(rewardLedgerPath(root), events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
}

/** One shard of every bankable/non-bankable class S0-1 named, plus two refuted nodes. */
function syncRepo(): string {
  const root = tmpRoot();
  writeDef(root, "def-x");
  writeShard(root, "lem-validated", { af: "validated", status: "conjecture", defs: "def-x" });
  writeShard(root, "lem-selfreport", { status: "proved" }); // af: none — a CLAIM, banks nothing
  writeShard(root, "lem-audit", {
    status: "proved-mod-audit",
    deps: "lem-validated",
    prover: "claude|claude|claude-opus-4-8|claim-prover",
    provenance: ".rk/provenance-lem-audit.json (hostile review)",
  });
  writeShard(root, "lem-num", { status: "numerical" });
  writeShard(root, "lem-open", { status: "open" });
  writeShard(root, "lem-dead", { status: "disproved" });
  writeShard(root, "lem-obs", { status: "obstruction" });
  mkdirSync(join(root, ".rk"), { recursive: true });
  writeFileSync(
    join(root, ".rk", "provenance-lem-audit.json"),
    JSON.stringify({
      schema_version: "1",
      claimId: "lem-audit",
      author: "gpt|codex|gpt-5.6-sol|claim-verifier",
      role: "verifier",
    }),
    "utf8",
  );
  return root;
}

const PREDICT_DEAD: RewardEvent = { type: "predict", obligation: "lem-dead", estimator: "w", p250k: 0.2, p1m: 0.5 };
const PREDICT_OBS: RewardEvent = { type: "predict", obligation: "lem-obs", estimator: "w", p250k: 0.2, p1m: 0.5 };

function node(id: string, extra: Partial<RegistryNode> = {}): RegistryNode {
  return {
    id, kind: "lemma", path: `argument/${id}.md`, contract: `${id} holds.`, af: "none",
    deps: [], routes: [], defs: [], balloons: { count: 0, classifications: [] }, ...extra,
  };
}

describe("planRewardSync — the pure emission plan", () => {
  test("the tier comes from the MAPPING: a self-reported proved/af:none node banks NOTHING", () => {
    const plan = planRewardSync([node("lem-x", { status: "proved" })], [], new Set(), false);
    expect(plan.events).toEqual([]);
  });

  test("af:validated banks 'proved' even when the shard's own status says otherwise", () => {
    const plan = planRewardSync([node("lem-x", { status: "conjecture", af: "validated" })], [], new Set(), false);
    expect(plan.events).toEqual([
      { type: "close", nodeId: "lem-x", tier: "proved", spentTokens: 0, citedDefs: [], citedLemmas: [] },
    ]);
  });

  test("citations are filtered to ids that actually exist — never a citation Gate 8 would flag", () => {
    const nodes = [node("lem-x", { status: "numerical", defs: ["def-real", "def-ghost"], deps: ["lem-y", "lem-ghost"] }), node("lem-y")];
    const plan = planRewardSync(nodes, [], new Set(["def-real"]), false);
    const close = plan.events[0] as Extract<RewardEvent, { type: "close" }>;
    expect(close.citedDefs).toEqual(["def-real"]);
    expect(close.citedLemmas).toEqual(["lem-y"]);
    expect(plan.lines.join("\n")).toContain("def-ghost");
  });

  test("a prune is WITHHELD when no predict precedes it (it would be a Gate 8 ERROR)", () => {
    const plan = planRewardSync([node("lem-d", { status: "disproved" })], [], new Set(), false);
    expect(plan.events).toEqual([]);
    expect(plan.lines.join("\n")).toContain("prune-unpredicted");
  });

  test("a prune is emitted once the node has a prediction", () => {
    const predict: RewardEvent = { type: "predict", obligation: "lem-d", estimator: "w", p250k: 0.2, p1m: 0.5 };
    const plan = planRewardSync([node("lem-d", { status: "disproved" })], [predict], new Set(), false);
    expect(plan.events).toEqual([{ type: "prune", nodeId: "lem-d", certRef: "argument/lem-d.md" }]);
  });

  test("--round numbering: 1 when the log has no round marker, else highest+1, appended LAST", () => {
    const first = planRewardSync([node("lem-x", { status: "numerical" })], [], new Set(), true);
    expect(first.events[first.events.length - 1]).toEqual({ type: "round", n: 1 });
    const later = planRewardSync([], [{ type: "round", n: 4 }, { type: "round", n: 2 }], new Set(), true);
    expect(later.events).toEqual([{ type: "round", n: 5 }]);
  });

  test("already-banked ids are skipped — the plan is empty on a synced ledger", () => {
    const nodes = [node("lem-x", { status: "numerical" }), node("lem-d", { status: "disproved" })];
    const existing: RewardEvent[] = [
      { type: "close", nodeId: "lem-x", tier: "numerical", spentTokens: 0, citedDefs: [], citedLemmas: [] },
      { type: "predict", obligation: "lem-d", estimator: "w", p250k: 0.2, p1m: 0.5 },
      { type: "prune", nodeId: "lem-d", certRef: "argument/lem-d.md" },
    ];
    expect(planRewardSync(nodes, existing, new Set(), false).events).toEqual([]);
  });
});

describe("rk reward sync — CLI wiring", () => {
  test("appends exactly the bankable closes and the predicted prune, and says what it wrote", async () => {
    const root = syncRepo();
    seedLedger(root, PREDICT_DEAD, PREDICT_OBS);
    const { out, lines } = capture();
    expect(await rewardSyncCommand(["--root", root], out, DEPS)).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("close lem-validated");
    expect(text).toContain("tier=proved");
    expect(text).toContain("close lem-audit");
    expect(text).toContain("close lem-num");
    expect(text).toContain("prune lem-dead");
    expect(text).toContain("prune lem-obs");
    expect(text).not.toContain("close lem-selfreport"); // S0-1: self-report never banks
    expect(text).not.toContain("close lem-open");
    expect(text).toContain("5 event(s) appended");

    const { events, malformed } = loadRewardLedger(root);
    expect(malformed).toEqual([]);
    expect(events.filter((e) => e.type === "close").length).toBe(3);
    expect(events.filter((e) => e.type === "prune").length).toBe(2);
  });

  test("spentTokens is 0 with a loud per-event note, never a fabricated figure", async () => {
    const root = syncRepo();
    const { out, lines } = capture();
    await rewardSyncCommand(["--root", root], out, DEPS);
    expect(lines.join("\n")).toContain("spentTokens unknown -> 0");
    const closes = loadRewardLedger(root).events.filter((e) => e.type === "close");
    expect(closes.every((e) => (e as { spentTokens: number }).spentTokens === 0)).toBe(true);
  });

  test("idempotent: a second run appends nothing and the ledger bytes are unchanged", async () => {
    const root = syncRepo();
    seedLedger(root, PREDICT_DEAD, PREDICT_OBS);
    await rewardSyncCommand(["--root", root], capture().out, DEPS);
    const after = readFileSync(rewardLedgerPath(root), "utf8");
    const { out, lines } = capture();
    expect(await rewardSyncCommand(["--root", root], out, DEPS)).toBe(0);
    expect(lines.join("\n")).toContain("ledger already in sync");
    expect(readFileSync(rewardLedgerPath(root), "utf8")).toBe(after);
  });

  test("--dry-run prints the plan and writes NOTHING", async () => {
    const root = syncRepo();
    const { out, lines } = capture();
    expect(await rewardSyncCommand(["--dry-run", "--root", root], out, DEPS)).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("close lem-num");
    expect(text).toContain("--dry-run");
    expect(existsSync(rewardLedgerPath(root))).toBe(false);
  });

  test("--round appends the next round marker, last", async () => {
    const root = syncRepo();
    seedLedger(root, { type: "round", n: 7 });
    const { out } = capture();
    expect(await rewardSyncCommand(["--round", "--root", root], out, DEPS)).toBe(0);
    const events = loadRewardLedger(root).events;
    expect(events[events.length - 1]).toEqual({ type: "round", n: 8 });
  });

  test("a structurally incomplete projection makes sync REFUSE and write NOTHING", async () => {
    const root = syncRepo();
    writeShard(root, "lem-bad", { kind: "not-a-real-kind" });
    const { out, lines } = capture();
    expect(await rewardSyncCommand(["--root", root], out, DEPS)).toBe(1);
    expect(lines.join("\n")).toContain("structurally incomplete");
    expect(existsSync(rewardLedgerPath(root))).toBe(false);
  });

  test("an unreadable ledger line makes sync REFUSE and write NOTHING (never a duplicate close)", async () => {
    const root = syncRepo();
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(rewardLedgerPath(root), "not json\n", "utf8");
    const { out, lines } = capture();
    expect(await rewardSyncCommand(["--root", root], out, DEPS)).toBe(1);
    expect(lines.join("\n")).toContain("line 1");
    expect(readFileSync(rewardLedgerPath(root), "utf8")).toBe("not json\n");
  });

  test("Gate 8 reports ZERO findings over a ledger this command wrote", async () => {
    const root = syncRepo();
    // A refuted node with NO prediction, and a close whose defs/deps do not resolve: both would be
    // Gate 8 ERRORs if the emitter wrote them. It must withhold/filter instead.
    writeShard(root, "lem-dead2", { status: "disproved" });
    writeShard(root, "lem-ghostcite", { status: "numerical", defs: "def-ghost", deps: "lem-ghost" });
    seedLedger(root, PREDICT_DEAD, PREDICT_OBS);
    await rewardSyncCommand(["--root", root], capture().out, DEPS);
    const result = rewardGate.run(loadSnapshot(root), DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage[0]!.checked).toBeGreaterThan(0);
  });

  test("an UNBACKED pma close is withheld (Check 4b agreement), and the gate stays clean", async () => {
    const root = syncRepo();
    writeShard(root, "lem-unbacked-pma", { status: "proved-mod-audit" }); // no provenance, no L5 store
    const { out, lines } = capture();
    await rewardSyncCommand(["--root", root, "--round"], out, DEPS);
    const text = lines.join("\n");
    expect(text).toContain("close lem-unbacked-pma WITHHELD");
    expect(text).toContain("reward-tier-unbacked");
    const written = readFileSync(rewardLedgerPath(root), "utf8");
    expect(written).not.toContain("lem-unbacked-pma");
    const result = rewardGate.run(loadSnapshot(root), DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
  });

  test("a fresh VALID L5 verdict backs a pma close (the other Check 4b backing)", async () => {
    const root = syncRepo();
    writeShard(root, "lem-l5-backed", { status: "proved-mod-audit" }); // no provenance
    const bytes = readFileSync(join(root, "argument", "lem-l5-backed.md"));
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(
      join(root, ".rk", "l5-verdicts.jsonl"),
      JSON.stringify({ schemaVersion: "1", ordinal: 0, itemId: "lem-l5-backed", l5ContentHash: hash,
        verdict: "VALID", justification: "test backing", verifierSeam: "test-seam" }) + "\n",
      "utf8",
    );
    const { out, lines } = capture();
    await rewardSyncCommand(["--root", root], out, DEPS);
    expect(lines.join("\n")).toContain("close lem-l5-backed tier=proved-mod-audit");
    const result = rewardGate.run(loadSnapshot(root), DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
  });

  test("review blocker 1: reward report --strict exits 1 on a hand-authored unbacked pma close", async () => {
    const root = syncRepo();
    writeShard(root, "lem-laundered", { status: "proved-mod-audit" }); // no backing
    seedLedger(root, { type: "close", nodeId: "lem-laundered", tier: "proved-mod-audit",
      spentTokens: 100_000, citedDefs: [], citedLemmas: [] });
    const { out, lines } = capture();
    expect(await run(["reward", "report", "--strict", "--root", root], { out })).toBe(1);
    expect(lines.join("\n")).toContain("reward-tier-unbacked");
  });

  test("review major 1: an unhealthy L5 store (ordinal gap) backs nothing", async () => {
    const root = syncRepo();
    writeShard(root, "lem-gap", { status: "proved-mod-audit" });
    const bytes = readFileSync(join(root, "argument", "lem-gap.md"));
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    mkdirSync(join(root, ".rk"), { recursive: true });
    // ordinal jumps 0 -> 2: broken append-only chain; the earlier VALID must not resurrect.
    writeFileSync(join(root, ".rk", "l5-verdicts.jsonl"),
      JSON.stringify({ schemaVersion: "1", ordinal: 0, itemId: "lem-gap", l5ContentHash: hash,
        verdict: "VALID", justification: "j", verifierSeam: "s" }) + "\n" +
      JSON.stringify({ schemaVersion: "1", ordinal: 2, itemId: "lem-gap", l5ContentHash: hash,
        verdict: "VALID", justification: "j", verifierSeam: "s" }) + "\n", "utf8");
    const { out, lines } = capture();
    await rewardSyncCommand(["--root", root], out, DEPS);
    expect(lines.join("\n")).toContain("close lem-gap WITHHELD");
  });

  test("review major 2: a live l5-shard-bytes retraction defeats an otherwise-fresh VALID backing", async () => {
    const root = syncRepo();
    writeShard(root, "lem-withdrawn", { status: "proved-mod-audit" });
    const bytes = readFileSync(join(root, "argument", "lem-withdrawn.md"));
    const hash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "l5-verdicts.jsonl"),
      JSON.stringify({ schemaVersion: "1", ordinal: 0, itemId: "lem-withdrawn", l5ContentHash: hash,
        verdict: "VALID", justification: "j", verifierSeam: "s" }) + "\n", "utf8");
    writeFileSync(join(root, ".rk", "retractions.jsonl"),
      JSON.stringify({ schemaVersion: "1", ordinal: 0, itemId: "lem-withdrawn", contentHash: hash,
        hashDomain: "l5-shard-bytes", retractedBy: "test:sweep", reason: "withdrawn",
        appendedAt: "2026-08-08T00:00:00.000Z" }) + "\n", "utf8");
    const { out, lines } = capture();
    await rewardSyncCommand(["--root", root], out, DEPS);
    expect(lines.join("\n")).toContain("close lem-withdrawn WITHHELD");
  });

  test("registered as a reward subcommand, and in the reward help", async () => {
    const { out, lines } = capture();
    expect(await rewardDispatch(["sync", "--dry-run", "--root", syncRepo()], out)).toBe(0);
    expect(lines.join("\n")).toContain("rk reward sync");
    const helpCap = capture();
    expect(await run(["reward", "--help"], { out: helpCap.out })).toBe(0);
    expect(helpCap.lines.join("\n")).toContain("rk reward sync");
  });
});
