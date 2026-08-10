// rk-45dj: a graph contract join that says contractMatch=false must be visible on the obligatory
// `rk check` surface. The fixture pins the source-supported escape: Gate 2 normalizes whitespace,
// while graph v2 deliberately byte-matches, and graph conflict recomputation formerly considered
// only status:proved (not the campaign's proved-mod-audit/af:seeded shape).

import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkCommand } from "../src/cli/check";
import { buildGraphDocument } from "../src/store/build-graph";
import { loadSnapshot } from "../src/store/snapshot-load";

const FIXTURE = join(import.meta.dir, "..", "corpus", "graph", "contract-match-check-escape");
const REPO = join(FIXTURE, "repo");
const AF_COMMAND = ["bash", join(FIXTURE, "fake-af")];
const FR_ABSENT = ["definitely-not-a-real-binary-rk-45dj"];

function capture() {
  const lines: string[] = [];
  return { out: { log: (line: string) => lines.push(line) }, lines };
}

describe("rk-45dj — graph contract conflicts on rk check", () => {
  const tempRoots: string[] = [];
  afterAll(() => {
    for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  });

  test("campaign escape is real: Gate 2 is clean while the byte-exact graph join is false and conflict-bearing", () => {
    const { doc } = buildGraphDocument(REPO, { afCommand: AF_COMMAND, frCommand: FR_ABSENT });
    const edge = doc.edges.af.find((candidate) => candidate.nodeId === "thm-k-part-ceiling");
    expect(edge?.workspaceResolved).toBe(true);
    if (edge === undefined || !edge.workspaceResolved) throw new Error("fixture af edge did not resolve");
    expect(edge.contractMatch).toBe(false);
    expect(doc.conflicts).toEqual([
      {
        kind: "contract-mismatch",
        edge: "af",
        nodeId: "thm-k-part-ceiling",
        registryValue: "proved-mod-audit",
        otherValue: "contractMatch:false",
        message: "contract-mismatch: registry='proved-mod-audit' vs other='contractMatch:false'",
      },
    ]);
  });

  test("consolidation: rk check emits the graph conflict, reports 1/1 contract joins, and exits 1", async () => {
    const { out, lines } = capture();
    const code = await checkCommand(["--root", REPO], out, loadSnapshot, {
      afCommand: AF_COMMAND,
      frCommand: FR_ABSENT,
    });
    const text = lines.join("\n");

    expect(code).toBe(1);
    expect(text).toContain(
      "ERROR argument/thm-k-part-ceiling.md:1 graph contract mismatch: 'thm-k-part-ceiling' has contractMatch=false",
    );
    expect(text).not.toContain("af root conjecture != registry contract");
    expect(text).toMatch(/^checked linker: 1\/1 lemma shards .* \(0 errors, 0 warnings\)$/m);
    expect(text).toContain("checked graph-conflicts: 1/1 contract joins (1 errors, 0 warnings)");
  });

  test("exploration: the same conflict stays visible as WARN, coverage stays 1/1, and exit remains 0", async () => {
    const root = mkdtempSync(join(tmpdir(), "rk-45dj-exploration-"));
    tempRoots.push(root);
    cpSync(REPO, root, { recursive: true });
    mkdirSync(join(root, ".rk"), { recursive: true });
    writeFileSync(join(root, ".rk", "config.json"), '{"phase":"exploration"}\n');

    const { out, lines } = capture();
    const code = await checkCommand(["--root", root], out, loadSnapshot, {
      afCommand: AF_COMMAND,
      frCommand: FR_ABSENT,
    });
    const text = lines.join("\n");

    expect(code).toBe(0);
    expect(text).toContain(
      "WARN argument/thm-k-part-ceiling.md:1 graph contract mismatch: 'thm-k-part-ceiling' has contractMatch=false",
    );
    expect(text).toContain("[advisory in exploration phase -- would ERROR in consolidation]");
    expect(text).toContain("checked graph-conflicts: 1/1 contract joins (0 errors, 1 warnings)");
  });
});
