import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBdSource } from "../../src/store/bd-load";

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-bd-load-test-"));
}

describe("loadBdSource", () => {
  test("reads real issue rows, skips memory rows, counts every line", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".beads"), { recursive: true });
    const lines = [
      JSON.stringify({ _type: "memory", key: "k", value: "v" }),
      JSON.stringify({ id: "rk-abc", issue_type: "task", status: "open" }),
      JSON.stringify({ id: "aism-047", issue_type: "task", status: "closed" }),
    ].join("\n");
    writeFileSync(join(root, ".beads", "issues.jsonl"), `${lines}\n`);
    const source = loadBdSource(root);
    expect(source.present).toBe(true);
    if (!source.present) throw new Error("unreachable");
    expect(source.totalRecords).toBe(3);
    expect(source.issues).toEqual([
      { id: "rk-abc", status: "open" },
      { id: "aism-047", status: "closed" },
    ]);
    rmSync(root, { recursive: true, force: true });
  });

  test("absent .beads/issues.jsonl is a distinct, visible state", () => {
    const root = tempRoot();
    const source = loadBdSource(root);
    expect(source.present).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  // LB4 (2026-08-03 M3-close review): an unparseable line used to `continue` with no record of it
  // anywhere — the registry↔bd edge vanished and the build still reported
  // `isStructurallyComplete === true`, while fr's identically-shaped defect had been first-class
  // since M2. RED before `malformedLines` existed on this reader.
  test("a truncated line is reported as a malformed line, never a silent skip (LB4)", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".beads"), { recursive: true });
    const lines = [
      JSON.stringify({ id: "rk-ok", issue_type: "task", status: "open" }),
      '{"id":"rk-trunc',
      JSON.stringify({ _type: "memory", key: "k", value: "v" }),
    ].join("\n");
    writeFileSync(join(root, ".beads", "issues.jsonl"), `${lines}\n`);
    const source = loadBdSource(root);
    expect(source.present).toBe(true);
    if (!source.present) throw new Error("unreachable");
    expect(source.malformedLines).toEqual([{ lineNo: 2, snippet: '{"id":"rk-trunc' }]);
    expect(source.issues).toEqual([{ id: "rk-ok", status: "open" }]);
    // The DELIBERATE skip (a `bd remember` memory row) stays a counted skip, never structural loss.
    expect(source.skippedNonIssueRows).toBe(1);
    rmSync(root, { recursive: true, force: true });
  });

  // LB4 made `totalRecords` load-bearing: it had been written and read by nothing. The identity
  // below is what makes it so — no line can be silently dropped into neither bucket.
  test("totalRecords === issues + skippedNonIssueRows + malformedLines (the accounting identity)", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".beads"), { recursive: true });
    const lines = [
      JSON.stringify({ id: "rk-a", issue_type: "task" }),
      JSON.stringify({ _type: "memory", key: "k" }),
      "{oops",
      JSON.stringify({ id: "rk-b", issue_type: "bug", status: "closed" }),
      "{also oops",
    ].join("\n");
    writeFileSync(join(root, ".beads", "issues.jsonl"), `${lines}\n`);
    const source = loadBdSource(root);
    if (!source.present) throw new Error("unreachable");
    expect(source.totalRecords).toBe(5);
    expect(source.issues.length + source.skippedNonIssueRows + source.malformedLines.length).toBe(source.totalRecords);
    expect(source.malformedLines.map((m) => m.lineNo)).toEqual([3, 5]);
    rmSync(root, { recursive: true, force: true });
  });
});
