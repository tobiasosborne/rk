// 1:1 test file for src/gates/notation.ts — Gate 9, the lexical notation check.
// Contract: docs/gate-contracts.md "Gate 9 — notation". rk-5lzf / LB5.

import { describe, expect, test } from "bun:test";
import { notationGate } from "../../src/gates/notation";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";
import { snapshotFromFiles } from "../../src/gates/snapshot";

const PROFILE = JSON.stringify({
  schema_version: "1",
  name: "qpcp",
  version: 1,
  tracked_classes: [
    {
      class: "promise-gap",
      description: "the promise gap",
      symbols: ["\\epsilon", "\\gamma", "c"],
      blessed: "\\gapfrac",
    },
    {
      class: "spectral",
      description: "spectral gap and eigenvalues",
      symbols: ["\\Delta", "\\lambda"],
      blessed: "\\specgap",
    },
  ],
  lattices: {},
  choices: {},
  enums: {},
});

const CONFIG = { ...DEFAULT_GATE_CONFIG, conventionProfile: "qpcp.v1" };

function notationShard(id: string, symbol: string, className: string, body = ""): string {
  return (
    `---\nid: ${id}\nterm: ${id}\nshard_type: notation\nsymbol: ${symbol}\nclass: ${className}\n` +
    `kind: consensus\nconsensus: campaign\nstatus: locked\n---\n${body}`
  );
}

function run(files: Record<string, string>, config = CONFIG) {
  return notationGate.run(snapshotFromFiles({ ".rk/conventions/qpcp.v1.json": PROFILE, ...files }), config);
}

describe("Gate 9 — no profile configured", () => {
  test("reports a VISIBLE WARN and failed profile prerequisite, never a silent 0/0 pass", () => {
    const result = notationGate.run(
      snapshotFromFiles({ "argument/lem-a.md": "---\nid: lem-a\n---\nThe gap \\epsilon is constant.\n" }),
      DEFAULT_GATE_CONFIG,
    );
    expect(result.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
    expect(result.findings.filter((f) => f.severity === "WARN")).toHaveLength(1);
    expect(result.coverage[0]).toMatchObject({ gate: "notation", checked: 0, total: 1 });
    expect(result.coverage[0]!.unit).toContain("no profile configured");
  });

  test("a CONFIGURED but unusable profile is reported distinctly from an unconfigured one", () => {
    const result = notationGate.run(
      snapshotFromFiles({ ".rk/conventions/qpcp.v1.json": "{ not json" }),
      CONFIG,
    );
    const warn = result.findings.find((f) => f.severity === "WARN");
    expect(warn).toBeDefined();
    expect(warn!.message).toContain("qpcp.v1");
    expect(result.coverage[0]!.unit).not.toContain("no profile configured");
  });
});

describe("Gate 9 — unregistered tracked symbols", () => {
  test("a raw tracked macro used in campaign prose is a structural ERROR", () => {
    const result = run({ "argument/lem-a.md": "---\nid: lem-a\n---\nThe promise gap \\epsilon is constant.\n" });
    const hit = result.findings.find((f) => f.message.includes("unblessed-source-symbol"));
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("ERROR");
    expect(hit!.structural).toBe(true);
    expect(hit!.path).toBe("argument/lem-a.md");
    expect(hit!.line).toBe(4);
    expect(hit!.message).toContain("\\epsilon");
    expect(hit!.message).toContain("promise-gap");
  });

  test("registering a raw source symbol in a claiming class does not clear campaign prose", () => {
    const result = run({
      "argument/lem-a.md": "---\nid: lem-a\n---\nThe promise gap \\epsilon is constant.\n",
      "definitions/notation/sym-eps.md": notationShard("sym-eps", "\\epsilon", "promise-gap"),
    });
    expect(result.findings.some((f) => f.message.includes("unblessed-source-symbol"))).toBe(true);
    expect(result.coverage[0]).toMatchObject({ checked: 0, total: 2 });
  });

  test("registering a blessed macro in the WRONG class does not clear it", () => {
    const result = run({
      "argument/lem-a.md": "---\nid: lem-a\n---\nThe promise gap \\gapfrac is constant.\n",
      "definitions/notation/sym-gap.md": notationShard("sym-gap", "\\gapfrac", "spectral"),
    });
    expect(result.findings.some((f) => f.message.includes("unregistered-symbol"))).toBe(true);
  });

  test("a token claimed by TWO classes is never cleared by a register entry in either", () => {
    const profile = JSON.parse(PROFILE);
    profile.tracked_classes[1].symbols.push("\\epsilon");
    const snap = snapshotFromFiles({
      ".rk/conventions/qpcp.v1.json": JSON.stringify(profile),
      "argument/lem-a.md": "---\nid: lem-a\n---\nThe gap \\epsilon is constant.\n",
      "definitions/notation/sym-eps.md": notationShard("sym-eps", "\\epsilon", "spectral"),
    });
    expect(notationGate.run(snap, CONFIG).findings.some((f) => f.message.includes("unblessed-source-symbol"))).toBe(true);
  });

  test("an UNtracked macro is never an error — the profile bounds the check", () => {
    const result = run({ "argument/lem-a.md": "---\nid: lem-a\n---\nWe write \\alpha for the angle.\n" });
    expect(result.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
    expect(result.coverage[0]).toMatchObject({ checked: 0, total: 2 });
  });

  test("the blessed macro itself is tracked and must be registered", () => {
    const result = run({ "argument/lem-a.md": "---\nid: lem-a\n---\nThe gap \\gapfrac is constant.\n" });
    expect(result.findings.some((f) => f.message.includes("\\gapfrac"))).toBe(true);
  });

  test("the blessed macro registered in its own class clears campaign prose", () => {
    const result = run({
      "argument/lem-a.md": "---\nid: lem-a\n---\nThe gap \\gapfrac is constant.\n",
      "definitions/notation/sym-gap.md": notationShard("sym-gap", "\\gapfrac", "promise-gap"),
    });
    expect(result.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
    expect(result.coverage[0]).toMatchObject({ checked: 1, total: 2 });
  });
});

describe("Gate 9 — scan scope", () => {
  test("Layer 0 definition shard bodies are scanned", () => {
    const result = run({ "definitions/def-a.md": "---\nid: def-a\n---\nWritten \\Delta here.\n" });
    expect(result.findings.some((f) => f.path === "definitions/def-a.md")).toBe(true);
  });

  test("refs/records/**/*.json statement_blessed is scanned when present", () => {
    const result = run({
      "refs/records/aav-thm-1.json": JSON.stringify({ statement_blessed: "The gap \\epsilon is constant." }),
    });
    const hit = result.findings.find((f) => f.path === "refs/records/aav-thm-1.json");
    expect(hit).toBeDefined();
    expect(hit!.message).toContain("statement_blessed");
  });

  test("a record with no statement_blessed, or an unparseable one, is not a false pass", () => {
    const result = run({
      "refs/records/a.json": JSON.stringify({ note: "\\epsilon appears only outside statement_blessed" }),
      "refs/records/b.json": "{ not json",
    });
    expect(result.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
    expect(result.findings.some((f) => f.severity === "WARN" && f.path === "refs/records/b.json")).toBe(true);
  });

  test("README/INDEX/DAG mirrors are not shards and are not scanned", () => {
    const result = run({
      "argument/INDEX.md": "\\epsilon\n",
      "argument/DAG.md": "\\epsilon\n",
      "definitions/README.md": "\\epsilon\n",
    });
    expect(result.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
  });

  test("frontmatter is not body: a `symbol:` line does not itself count as a usage", () => {
    const result = run({ "definitions/notation/sym-eps.md": notationShard("sym-eps", "\\epsilon", "promise-gap") });
    expect(result.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
  });

  test("a translation row and its quote anchor are SOURCE notation, never campaign usage", () => {
    // \Delta here is what the SOURCE writes. Flagging it would make recording a foreign convention
    // impossible — which is the register's entire job.
    const body = '- aav-1309.7495: \\Delta @ refs/aav-1309.7495/p.tex:3\n  "the spectral gap \\Delta"\n';
    const result = run({ "definitions/notation/sym-sg.md": notationShard("sym-sg", "\\specgap", "spectral", body) });
    expect(result.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
  });

  test("a standalone quote anchor in an ARGUMENT shard is likewise quoted source text", () => {
    const result = run({
      "argument/lem-a.md": '---\nid: lem-a\n---\nrefs/aav-1309.7495/p.tex:3\n"the promise gap \\epsilon"\n',
    });
    expect(result.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
  });

  test("an unpaired fully quoted line is campaign prose and is scanned", () => {
    const result = run({
      "argument/lem-a.md": '---\nid: lem-a\n---\n"the promise gap \\epsilon is constant"\n',
    });
    expect(result.findings.some((f) => f.message.includes("unblessed-source-symbol"))).toBe(true);
  });

  test("quotation marks do not exempt statement_blessed", () => {
    const result = run({
      "refs/records/a.json": JSON.stringify({ statement_blessed: '"the promise gap \\epsilon is constant"' }),
    });
    expect(result.findings.some((f) => f.path === "refs/records/a.json" && f.message.includes("unblessed-source-symbol"))).toBe(true);
  });
});

describe("Gate 9 — coverage line", () => {
  test("states symbols, classes and files", () => {
    const result = run({
      "argument/lem-a.md": "---\nid: lem-a\n---\n\\gapfrac and \\Delta.\n",
      "definitions/notation/sym-gap.md": notationShard("sym-gap", "\\gapfrac", "promise-gap"),
    });
    expect(result.coverage[0]!.unit).toMatch(/classes \(notation draft; .*\) over \d+ files/);
    expect(result.coverage[0]).toMatchObject({ checked: 1, total: 2 });
  });

  test("tracked tokens that cannot be scanned for lexically are counted, never hidden", () => {
    // `c` is a tracked token of promise-gap and is not a macro token: no lexical scan can find it
    // reliably. The coverage line says so rather than implying it was checked.
    const result = run({ "argument/lem-a.md": "---\nid: lem-a\n---\nnothing tracked here.\n" });
    expect(result.coverage[0]!.unit).toContain("promise-gap: registered 0/1, enforceable 3, encountered 0, skipped 1 [c]");
  });

  test("one ERROR per (file, symbol) — a symbol used ten times in one file is one finding", () => {
    const result = run({
      "argument/lem-a.md": "---\nid: lem-a\n---\n\\epsilon \\epsilon \\epsilon\nand \\epsilon again\n",
    });
    expect(result.findings.filter((f) => f.message.includes("\\epsilon"))).toHaveLength(1);
  });
});
