// Tests for `rk frontier <root-id>` (src/cli/frontier.ts, rk-ptx0/S0): the terminal surface over
// src/graph/query-frontier.ts's GOAL frontier — the obligations the goal actually needs, and the
// attached/unattached admission boundary the allocator reads. Builds a real repo tree and drives
// the command end to end through src/store/build-graph.ts, with af/fr pointed at a guaranteed-absent
// binary (same pattern as test/cli-graph.test.ts) so it never depends on a real install.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli";
import { frontierCommand, formatFrontierReport } from "../src/cli/frontier";

const ABSENT = ["definitely-not-a-real-binary-xyz"];

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}

function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "rk-frontier-cli-"));
  dirs.push(root);
  return root;
}

function writeShard(root: string, id: string, extra: Record<string, string> = {}): void {
  mkdirSync(join(root, "argument"), { recursive: true });
  const fm = { id, kind: "lemma", contract: `${id} holds.`, af: "none", ...extra };
  const body = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
  writeFileSync(join(root, "argument", `${id}.md`), `---\n${body}\n---\n\n${id}'s narrative.\n`);
}

/** goal -> lem-a (open) and lem-b (cited, i.e. settled); pool-x hangs off nothing. */
function goalRepo(): string {
  const root = tmpRoot();
  writeShard(root, "lem-a", { status: "open" });
  writeShard(root, "lem-b", { status: "cited" });
  writeShard(root, "lem-root", { deps: "lem-a; lem-b", status: "conjecture" });
  writeShard(root, "pool-x", { status: "open" });
  return root;
}

describe("formatFrontierReport — the frontier as text", () => {
  test("an unknown root is reported as not found, with no fabricated counts", () => {
    const text = formatFrontierReport({
      rootId: "ghost", found: false, obligations: [], attachedIds: [], unattachedIds: [],
    }).join("\n");
    expect(text).toContain("ghost");
    expect(text).toContain("names no node");
    expect(text).not.toContain("attached=");
  });

  test("a dead-end obligation is flagged as such, not just as non-actionable", () => {
    const text = formatFrontierReport({
      rootId: "g", found: true, attachedIds: ["g", "x"], unattachedIds: [],
      obligations: [{ id: "x", status: "open", kind: "lemma", actionable: false, deadEnd: true }],
    }).join("\n");
    expect(text).toContain("dead-end");
    expect(text).toContain("not actionable");
  });
});

describe("rk frontier — CLI wiring", () => {
  test("no root-id argument: exit 2, self-teaching message", async () => {
    const { out, lines } = capture();
    const code = await frontierCommand(["--root", tmpRoot()], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(2);
    expect(lines.join("\n")).toContain("no goal id");
  });

  test("an unknown root id: exit 1, honest message, never a crash", async () => {
    const root = goalRepo();
    const { out, lines } = capture();
    const code = await frontierCommand(["ghost", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("names no node");
  });

  test("obligations, their flags, the counts, and the unattached ids", async () => {
    const root = goalRepo();
    const { out, lines } = capture();
    const code = await frontierCommand(["lem-root", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("goal frontier for lem-root");
    // lem-b is cited => settled, never an obligation; lem-a and lem-root are.
    expect(text).toContain("2 obligation(s)");
    expect(text).toContain("lem-a");
    expect(text).toContain("actionable");
    expect(text).toContain("attached=3");
    expect(text).toContain("unattached=1");
    expect(text).toContain("pool-x"); // the prospecting pool is listed by id
  });

  test("a settled dependency is counted as satisfied, not as an obligation", async () => {
    const root = goalRepo();
    const { out, lines } = capture();
    await frontierCommand(["lem-root", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    const text = lines.join("\n");
    expect(text).toContain("satisfied=1"); // attached(3) - obligations(2) = lem-b
    expect(text).not.toContain("lem-b (");
  });

  test("a structurally incomplete projection makes rk frontier REFUSE, never a partial report", async () => {
    const root = goalRepo();
    writeShard(root, "lem-bad", { kind: "not-a-real-kind" });
    const { out, lines } = capture();
    const code = await frontierCommand(["lem-root", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).not.toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("structurally incomplete");
    expect(text).not.toContain("goal frontier for lem-root");
  });

  test("registered in the top-level dispatcher, and --help is side-effect-free", async () => {
    const { out, lines } = capture();
    expect(await run(["frontier", "--help"], { out })).toBe(0);
    expect(lines.join("\n")).toContain("rk frontier");
  });

  test("top-level 'rk' help mentions frontier", async () => {
    const { out, lines } = capture();
    await run([], { out });
    expect(lines.join("\n")).toContain("rk frontier");
  });
});
