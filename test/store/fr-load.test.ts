import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFrSource } from "../../src/store/fr-load";

const FAKE_FR = [Bun.which("bun")!, join(import.meta.dir, "fixtures", "fake-fr.ts")];

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), "rk-fr-load-test-"));
}

describe("loadFrSource (edge: primary path via a fake fr binary)", () => {
  test("log records with evidence.artifact resolve, verdicts cross-referenced by exact claim match", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "fake-fr-response.json"),
      JSON.stringify({
        schema_version: "1",
        log: [
          { cycle: 1, outcome: "orient", evidence: null },
          { cycle: 2, outcome: "banked", evidence: { artifact: "argument/lemmas/lem-x.md", verdict: "banked" } },
          { cycle: 3, outcome: "graduate", graduated_to: "lem-y", evidence: null },
        ],
        verdicts: [{ claim: "argument/lemmas/lem-x.md", fresh: true }],
      }),
    );
    const source = loadFrSource(root, FAKE_FR);
    expect(source.present).toBe(true);
    if (!source.present) throw new Error("unreachable");
    expect(source.degraded).toBe(false);
    expect(source.totalLogRecords).toBe(3);
    // the bare `orient` record names nothing resolvable — excluded from the join surface entirely
    expect(source.records).toEqual([
      { cycle: 2, kind: "artifact", ref: "argument/lemmas/lem-x.md", outcome: "banked", verdict: "banked", verdictFresh: true },
      { cycle: 3, kind: "graduate", ref: "lem-y", outcome: "graduate" },
    ]);
    rmSync(root, { recursive: true, force: true });
  });

  test("absence (.frontier missing/corrupt) is reported distinctly, never as an empty portfolio", () => {
    const root = tempRoot();
    writeFileSync(join(root, "fake-fr-exit-code"), "1");
    const source = loadFrSource(root, FAKE_FR);
    expect(source.present).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("loadFrSource (edge: direct .frontier/log.jsonl fallback when the fr binary is unavailable)", () => {
  test("reconstructs artifact/graduate records from raw log.jsonl, degraded, no verdict-freshness recompute", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".frontier"), { recursive: true });
    const lines = [
      JSON.stringify({ cycle: 1, outcome: "progress", evidence: { artifact: "argument/lemmas/lem-z.md", verdict: "claimed" } }),
      JSON.stringify({ cycle: 2, outcome: "orient" }),
    ].join("\n");
    writeFileSync(join(root, ".frontier", "log.jsonl"), `${lines}\n`);
    const source = loadFrSource(root, ["definitely-not-a-real-fr-binary-xyz"]);
    expect(source.present).toBe(true);
    if (!source.present) throw new Error("unreachable");
    expect(source.degraded).toBe(true);
    expect(source.totalLogRecords).toBe(2);
    expect(source.records).toEqual([
      { cycle: 1, kind: "artifact", ref: "argument/lemmas/lem-z.md", outcome: "progress", verdict: "claimed", verdictFresh: undefined },
    ]);
    rmSync(root, { recursive: true, force: true });
  });

  test("no .frontier/ at all is absence, not an empty portfolio", () => {
    const root = tempRoot();
    const source = loadFrSource(root, ["definitely-not-a-real-fr-binary-xyz"]);
    expect(source.present).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  test("M2-boundary-review blocker 9: a malformed nonblank line is counted in totalLogRecords and surfaced as a structural diagnostic, never silently dropped from accounting", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".frontier"), { recursive: true });
    const lines = [
      JSON.stringify({ cycle: 1, outcome: "banked", evidence: { artifact: "argument/lemmas/lem-corrupt.md", verdict: "claimed" } }),
      "{not valid json at all",
      JSON.stringify({ cycle: 3, outcome: "orient" }),
    ].join("\n");
    writeFileSync(join(root, ".frontier", "log.jsonl"), `${lines}\n`);
    const source = loadFrSource(root, ["definitely-not-a-real-fr-binary-xyz"]);
    expect(source.present).toBe(true);
    if (!source.present) throw new Error("unreachable");
    // three RAW nonblank rows total — the malformed one must not vanish from the count.
    expect(source.totalLogRecords).toBe(3);
    expect(source.records).toHaveLength(1); // cycle 1 resolves; cycle 3 (orient) names nothing
    expect(source.malformedLines).toEqual([{ lineNo: 2, snippet: "{not valid json at all" }]);
  });

  test("accounting property: totalLogRecords == raw nonblank line count == successfully-parsed lines + malformedLines.length, for every shape", () => {
    const shapes: string[][] = [
      [], // no lines at all
      [JSON.stringify({ cycle: 1, outcome: "orient" })], // one valid line, nothing malformed
      ["}}} not json", "{{{ also not json"], // every line malformed
      [
        JSON.stringify({ cycle: 1, outcome: "banked", evidence: { artifact: "a.md", verdict: "claimed" } }),
        "not json",
        JSON.stringify({ cycle: 3, outcome: "orient" }),
        "still not json",
        JSON.stringify({ cycle: 5, outcome: "graduate", graduated_to: "b" }),
      ],
    ];
    for (const lines of shapes) {
      const root = tempRoot();
      mkdirSync(join(root, ".frontier"), { recursive: true });
      const rawNonblankCount = lines.filter((l) => l.trim().length > 0).length;
      let independentlyParsed = 0;
      for (const l of lines) {
        if (l.trim().length === 0) continue;
        try {
          JSON.parse(l);
          independentlyParsed++;
        } catch {
          // counted via malformedLines instead
        }
      }
      writeFileSync(join(root, ".frontier", "log.jsonl"), lines.length > 0 ? `${lines.join("\n")}\n` : "");
      const source = loadFrSource(root, ["definitely-not-a-real-fr-binary-xyz"]);
      expect(source.present).toBe(true);
      if (!source.present) throw new Error("unreachable");
      expect(source.totalLogRecords).toBe(rawNonblankCount);
      expect(source.totalLogRecords).toBe(independentlyParsed + source.malformedLines.length);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
