// Tests for `rk verify` (src/cli/verify.ts, M3.6): argument handling, the --dry-run plan (ready set,
// dispatch plan, balloon tripwire status) with an INJECTED af workspace reader (never a real af
// binary), and the honest live-run gate. Same small-real-repo + injected-edge pattern as
// test/cli-graph.test.ts.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyCommand } from "../src/cli/verify";
import type { AfParseResult, AfWorkspaceView } from "../src/drive/driver-af";

const ABSENT = ["definitely-not-a-real-binary-xyz"];

function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}
function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-verify-cli-"));
}
function writeShard(root: string, id: string, extra: Record<string, string> = {}): void {
  mkdirSync(join(root, "argument"), { recursive: true });
  const fm = { id, kind: "lemma", contract: `${id} holds.`, af: "none", ...extra };
  const body = Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n");
  writeFileSync(join(root, "argument", `${id}.md`), `---\n${body}\n---\n\n${id}'s narrative.\n`);
}

function fakeWorkspace(nodeCount: number): (a: string, id: string) => AfParseResult<AfWorkspaceView> {
  return (_a, id) => ({
    ok: true,
    value: {
      workspaceId: id,
      rootStatement: "P",
      nodeCount,
      nodes: Array.from({ length: nodeCount }, (_, i) => ({
        id: i === 0 ? "1" : `1.${i}`,
        epistemicState: "pending",
        workflowState: i === 0 ? "blocked" : "available",
        crux: i === 1,
        contentHash: "a".repeat(64),
      })),
    },
  });
}

describe("rk verify — CLI wiring", () => {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

  test("no --af: exit 2, self-teaching message", async () => {
    const root = tmpRoot(); dirs.push(root);
    const { out, lines } = capture();
    const code = await verifyCommand(["--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(2);
    expect(lines.join("\n")).toContain("no target selected");
  });

  test("--af on an unknown id: exit 1, honest message", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a");
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "nope", "--root", root, "--dry-run"], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(1);
    expect(lines.join("\n")).toContain("no node 'nope'");
  });

  test("--dry-run plans a workspace: ready set, per-node plan, tripwire clear, nothing written", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root, "--dry-run"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: fakeWorkspace(4),
    });
    expect(code).toBe(0);
    const text = lines.join("\n");
    expect(text).toContain("DRY RUN");
    expect(text).toContain("4 node(s)");
    expect(text).toContain("balloon tripwire: 4 <= cap");
    expect(text).toContain("verification-ready now (3): 1.1, 1.2, 1.3");
    expect(text).toContain("crux (per-node cross-vendor, never batched): 1.1");
    expect(text).toContain("token usage: 0");
  });

  test("--dry-run shows the BALLOON tripwire firing when node count exceeds the cap", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-big", { af: "seeded", workspace: "proofs/lem-big" });
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-big", "--root", root, "--dry-run"], out, {
      afCommand: ABSENT, frCommand: ABSENT, readWorkspace: fakeWorkspace(99),
    });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("BALLOON TRIPWIRE");
  });

  test("live run (no --dry-run): honest gate, points at --dry-run, exit 3", async () => {
    const root = tmpRoot(); dirs.push(root);
    writeShard(root, "lem-a", { af: "seeded", workspace: "proofs/lem-a" });
    const { out, lines } = capture();
    const code = await verifyCommand(["--af", "lem-a", "--root", root], out, { afCommand: ABSENT, frCommand: ABSENT });
    expect(code).toBe(3);
    expect(lines.join("\n")).toContain("live dispatch is not wired");
  });
});
