// Tests for src/cli/refs-triage.ts — `rk refs triage --auto`: reads refs/triage.md, applies the
// pure autoTriage bands, writes the ledger back, prints a per-band coverage line. Authored rows
// survive; a missing ledger is a usage error, never a silent success.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refsTriage } from "../src/cli/refs-triage";
import { formatTriageDocument, parseTriageTable, type TriageRow } from "../src/refs/snowball-triage";

const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));
function tmpRoot(): string {
  const d = mkdtempSync(join(tmpdir(), "rk-triage-cli-"));
  roots.push(d);
  mkdirSync(join(d, "refs"), { recursive: true });
  return d;
}
function capture() {
  const lines: string[] = [];
  return { out: { log: (s: string) => lines.push(s) }, lines };
}
function row(p: Partial<TriageRow> & { id: string }): TriageRow {
  return { title: "", year: "", depth: "1", via: "", triage: "", reason: "", ...p };
}

describe("rk refs triage --auto", () => {
  test("bands the empty rows, preserves authored ones, prints counts, exits 0", async () => {
    const root = tmpRoot();
    writeFileSync(
      join(root, "refs", "triage.md"),
      formatTriageDocument([
        row({ id: "s", depth: "0", triage: "seed" }),
        row({ id: "a", via: "s", title: "Transmon noise" }),
        row({ id: "b", via: "s, t, u", title: "Quantum PCP" }),
        row({ id: "h", via: "s", triage: "in", reason: "core" }),
      ]),
    );
    writeFileSync(join(root, "refs", "keywords.txt"), "PCP\n");
    const { out, lines } = capture();
    const code = await refsTriage(["--auto", "--keywords", "refs/keywords.txt", "--root", root], out);
    expect(code).toBe(0);
    const rows = parseTriageTable(readFileSync(join(root, "refs", "triage.md"), "utf8"));
    expect(rows.map((r) => [r.id, r.triage])).toEqual([["s", "seed"], ["a", "out"], ["b", ""], ["h", "in"]]);
    expect(rows[2]!.reason).toMatch(/^auto: candidate \(links=3, kw=1: PCP\)/);
    expect(lines.join("\n")).toMatch(/auto-triage: 4 rows; candidate 1, review 0, out 1, untouched 2/);
  });

  test("--auto is required; a missing ledger is exit 2 with a message, not a silent pass", async () => {
    const root = tmpRoot();
    const { out, lines } = capture();
    expect(await refsTriage(["--root", root], out)).toBe(2);
    expect(lines[0]).toMatch(/usage: rk refs triage --auto/);
    const { out: out2, lines: lines2 } = capture();
    expect(await refsTriage(["--auto", "--root", root], out2)).toBe(2);
    expect(lines2.join("\n")).toMatch(/no triage ledger at refs\/triage\.md/);
  });

  test("--in-links / --out-links are validated integers", async () => {
    const root = tmpRoot();
    writeFileSync(join(root, "refs", "triage.md"), formatTriageDocument([row({ id: "a", via: "s" })]));
    const { out, lines } = capture();
    expect(await refsTriage(["--auto", "--in-links", "x", "--root", root], out)).toBe(2);
    expect(lines.join("\n")).toMatch(/--in-links/);
  });
});
