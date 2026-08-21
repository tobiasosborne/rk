// Tests for src/refs/triage-auto.ts — the pure mechanical pre-triage over a citation-closure
// ledger (`rk refs triage --auto`). Contract: only rows with EMPTY triage AND EMPTY reason are
// touched; seed rows never; the `out` band is the only one that writes the triage column, and
// every written reason starts with `auto:` so a human `out` and a mechanical `out` are never
// confused (CLAUDE.md rule 9, generated vs authored); counts are reported per band.

import { describe, expect, test } from "bun:test";
import type { TriageRow } from "../src/refs/snowball-triage";
import { autoTriage, parseKeywordsFile } from "../src/refs/triage-auto";

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
