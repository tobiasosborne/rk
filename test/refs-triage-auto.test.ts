// Tests for src/refs/triage-auto.ts — the pure mechanical pre-triage over a citation-closure
// ledger (`rk refs triage --auto`). Contract: only rows with EMPTY triage AND EMPTY reason are
// touched; seed rows never; the `out` band is the only one that writes the triage column, and
// every written reason starts with `auto:` so a human `out` and a mechanical `out` are never
// confused (CLAUDE.md rule 9, generated vs authored); counts are reported per band.

import { describe, expect, test } from "bun:test";
import type { TriageRow } from "../src/refs/snowball-triage";
import { applyTriage, autoTriage, parseApplyTsv, parseKeywordsFile } from "../src/refs/triage-auto";

function row(p: Partial<TriageRow> & { id: string }): TriageRow {
  return { title: "", year: "", depth: "1", via: "", triage: "", reason: "", ...p };
}

describe("autoTriage bands", () => {
  test("<= outLinks seed links and no keyword hit -> out, reason auto:", () => {
    const r = autoTriage([row({ id: "a", via: "s1", title: "Transmon noise" })], { keywords: ["PCP"] });
    expect(r.rows[0]!.triage).toBe("out");
    expect(r.rows[0]!.reason).toMatch(/^auto: out \(links=1, kw=0\)/);
    expect(r.counts).toEqual({ candidate: 0, review: 0, out: 1, untouched: 0 });
  });

  test(">= inLinks seed links -> candidate, triage left EMPTY for the operator", () => {
    const r = autoTriage([row({ id: "a", via: "s1, s2, s3" })], {});
    expect(r.rows[0]!.triage).toBe("");
    expect(r.rows[0]!.reason).toMatch(/^auto: candidate \(links=3, kw=0\)/);
    expect(r.counts.candidate).toBe(1);
  });

  test("2 links + a keyword hit -> candidate; 2 links no keyword -> review; 1 link + keyword -> review", () => {
    const r = autoTriage(
      [
        row({ id: "a", via: "s1, s2", title: "Quantum PCP via codes" }),
        row({ id: "b", via: "s1, s2", title: "Something else" }),
        row({ id: "c", via: "s1", title: "NLTS Hamiltonians" }),
      ],
      { keywords: ["PCP", "NLTS"] },
    );
    expect(r.rows.map((x) => x.triage)).toEqual(["", "", ""]);
    expect(r.rows[0]!.reason).toMatch(/^auto: candidate \(links=2, kw=1: PCP\)/);
    expect(r.rows[1]!.reason).toMatch(/^auto: review \(links=2, kw=0\)/);
    expect(r.rows[2]!.reason).toMatch(/^auto: review \(links=1, kw=1: NLTS\)/);
    expect(r.counts).toEqual({ candidate: 1, review: 2, out: 0, untouched: 0 });
  });

  test("keyword match is case-insensitive and whole-word (PCP does not match 'PCPs'? — it does: prefix-word); 'gap' must not match 'gapless'", () => {
    const r = autoTriage(
      [row({ id: "a", via: "s1", title: "Gapless phases" }), row({ id: "b", via: "s1", title: "quantum pcp conjecture" })],
      { keywords: ["gap", "PCP"] },
    );
    expect(r.rows[0]!.triage).toBe("out");
    expect(r.rows[1]!.triage).toBe("");
  });

  test("thresholds are configurable", () => {
    const r = autoTriage([row({ id: "a", via: "s1, s2" })], { inLinks: 2 });
    expect(r.counts.candidate).toBe(1);
    const r2 = autoTriage([row({ id: "a", via: "s1, s2" })], { outLinks: 2 });
    expect(r2.rows[0]!.triage).toBe("out");
  });
});

describe("autoTriage never touches authored or seed rows", () => {
  test("seed rows, rows with a triage value, and rows with a reason are returned byte-identical and counted untouched", () => {
    const seed = row({ id: "s", depth: "0", triage: "seed" });
    const human = row({ id: "h", via: "s1", triage: "in", reason: "core lemma" });
    const reasonOnly = row({ id: "r", via: "s1", reason: "ask TJO" });
    const r = autoTriage([seed, human, reasonOnly], {});
    expect(r.rows).toEqual([seed, human, reasonOnly]);
    expect(r.counts).toEqual({ candidate: 0, review: 0, out: 0, untouched: 3 });
  });

  test("a second run is idempotent: auto-written rows are untouched (their reason is non-empty)", () => {
    const first = autoTriage([row({ id: "a", via: "s1" })], {});
    const second = autoTriage(first.rows, {});
    expect(second.rows).toEqual(first.rows);
    expect(second.counts.untouched).toBe(1);
  });

  test("stale rows (not in the closure) with empty columns are still scored — they carry a via list", () => {
    const r = autoTriage([row({ id: "a", via: "" })], {});
    expect(r.rows[0]!.triage).toBe("out");
    expect(r.rows[0]!.reason).toMatch(/links=0/);
  });
});

describe("parseKeywordsFile", () => {
  test("one term per line, '#' comments, blank lines dropped, order kept", () => {
    expect(parseKeywordsFile("# header\nPCP\n\nlocal Hamiltonian  # k-local\nNLTS\n")).toEqual(["PCP", "local Hamiltonian", "NLTS"]);
  });
});

describe("redoAuto: re-banding after tuning keywords/thresholds", () => {
  test("with redoAuto, rows whose reason starts with 'auto:' are re-banded (including auto 'out'); human rows still untouched", () => {
    const first = autoTriage([row({ id: "a", via: "s1", title: "Quantum PCP" }), row({ id: "h", via: "s1", triage: "out", reason: "human: junk" })], {});
    expect(first.rows[0]!.triage).toBe("out"); // no keywords on the first pass
    const second = autoTriage(first.rows, { keywords: ["PCP"], redoAuto: true });
    expect(second.rows[0]!.triage).toBe("");
    expect(second.rows[0]!.reason).toMatch(/^auto: review \(links=1, kw=1: PCP\)/);
    expect(second.rows[1]).toEqual(first.rows[1]);
    expect(second.counts).toEqual({ candidate: 0, review: 1, out: 0, untouched: 1 });
  });

  test("without redoAuto an auto row stays untouched (idempotent default)", () => {
    const first = autoTriage([row({ id: "a", via: "s1", title: "Quantum PCP" })], {});
    const second = autoTriage(first.rows, { keywords: ["PCP"] });
    expect(second.rows).toEqual(first.rows);
  });

  test("an auto row whose triage a human later changed (e.g. auto out -> in) is NOT re-banded even with redoAuto", () => {
    const edited = row({ id: "a", via: "s1", triage: "in", reason: "auto: out (links=1, kw=0)" });
    const r = autoTriage([edited], { redoAuto: true });
    expect(r.rows[0]).toEqual(edited);
    expect(r.counts.untouched).toBe(1);
  });
});

describe("applyTriage: guarded application of external (model/human) verdicts", () => {
  const updates = [
    { id: "a", triage: "in", reason: "llm: ox-alpha 2/2 — qLDPC hardness" },
    { id: "h", triage: "out", reason: "llm: ox-alpha 2/2 — junk" },
    { id: "s", triage: "out", reason: "llm: nonsense" },
    { id: "zzz", triage: "in", reason: "llm: unknown id" },
    { id: "b", triage: "maybe", reason: "llm: bad label" },
  ];
  const rows = [
    row({ id: "s", depth: "0", triage: "seed" }),
    row({ id: "a", via: "s", reason: "auto: review (links=1, kw=1: PCP)" }),
    row({ id: "h", via: "s", triage: "in", reason: "human: core lemma" }),
    row({ id: "b", via: "s", triage: "out", reason: "auto: out (links=1, kw=0)" }),
  ];
  test("applies onto empty/auto rows only; never over a seed or a human value; rejects unknown ids and labels", () => {
    const r = applyTriage(rows, updates);
    expect(r.rows.map((x) => [x.id, x.triage])).toEqual([["s", "seed"], ["a", "in"], ["h", "in"], ["b", "out"]]);
    expect(r.rows[1]!.reason).toBe("llm: ox-alpha 2/2 — qLDPC hardness");
    expect(r.counts).toEqual({ applied: 1, skippedHuman: 1, skippedSeed: 1, unknownId: 1, invalidLabel: 1 });
  });
  test("an auto 'out' row CAN be overridden by an external verdict (auto is not authored)", () => {
    const r = applyTriage(rows, [{ id: "b", triage: "context", reason: "llm: background" }]);
    expect(r.rows[3]!.triage).toBe("context");
    expect(r.counts.applied).toBe(1);
  });
  test("a row already holding an external (non-auto, non-empty) verdict is treated as authored", () => {
    const once = applyTriage(rows, [{ id: "a", triage: "in", reason: "llm: first" }]).rows;
    const twice = applyTriage(once, [{ id: "a", triage: "out", reason: "llm: second" }]);
    expect(twice.rows[1]!.triage).toBe("in");
    expect(twice.counts.skippedHuman).toBe(1);
  });
  test("parseApplyTsv: id<TAB>label<TAB>reason per line, blank/# lines ignored", () => {
    expect(parseApplyTsv("# c\na\tin\tr1\n\nb\tout\t\n")).toEqual([{ id: "a", triage: "in", reason: "r1" }, { id: "b", triage: "out", reason: "" }]);
  });
});
