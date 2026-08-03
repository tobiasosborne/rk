// Pins the M1.3 structural/non-structural classification docs/gate-contracts.md "Phase matrix"
// commits to, directly against each gate's real output — not just src/gates/phase.ts's generic
// applyPhase logic (test/gates/phase.test.ts). Guards against a future gate edit silently
// reclassifying a finding (e.g. a refactor that drops `structural: true` from the cycle check)
// without anyone touching the contract doc.

import { describe, expect, test } from "bun:test";
import { defsGate } from "../../src/gates/defs";
import { linkerGate } from "../../src/gates/linker";
import { refsGate } from "../../src/gates/refs";
import { freshnessGate } from "../../src/gates/freshness";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";
import { sha256Hex } from "../../src/gates/sha256";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import type { RepoSnapshot } from "../../src/gates/snapshot";
import type { Finding } from "../../src/gates/framework";

function structuralOf(findings: Finding[], messageSubstring: string): boolean | undefined {
  return findings.find((f) => f.message.includes(messageSubstring))?.structural;
}

/** LB5: `structuralOf` returns `undefined` both for "found, non-structural" and for "no such
 * finding at all", so every non-structural assertion below is paired with this — otherwise a check
 * that stopped firing entirely would read as a passing classification test. */
function expectPresent(findings: Finding[], messageSubstring: string): void {
  expect(findings.filter((f) => f.message.includes(messageSubstring)).length).toBeGreaterThan(0);
}

describe("Gate 1 (defs) structural classification", () => {
  test("DRIFT (duplicate alias) is structural", () => {
    const snap = snapshotFromFiles({
      "definitions/a.md": "---\nid: a\nterm: Same\nkind: original\nstatus: locked\nconsensus: x\n---\n",
      "definitions/b.md": "---\nid: b\nterm: Same\nkind: original\nstatus: locked\nconsensus: x\n---\n",
    });
    const { findings } = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "DRIFT")).toBe(true);
  });

  test("missing/unterminated frontmatter is structural", () => {
    const snap = snapshotFromFiles({ "definitions/a.md": "no frontmatter here\n" });
    const { findings } = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "missing/unterminated frontmatter")).toBe(true);
  });

  test("bad kind enum value is NON-structural (schema completeness, demotable)", () => {
    const snap = snapshotFromFiles({
      "definitions/a.md": "---\nid: a\nterm: T\nkind: bogus\nstatus: locked\n---\n",
    });
    const { findings } = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "not in cited")).toBeFalsy();
  });

  test("cited shard missing source/sha256 is NON-structural (provenance)", () => {
    const snap = snapshotFromFiles({
      "definitions/a.md": "---\nid: a\nterm: T\nkind: cited\nstatus: locked\n---\n",
    });
    const { findings } = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "missing required 'source:'")).toBeFalsy();
  });
});

function linkerSnap(files: Record<string, string>): RepoSnapshot {
  return snapshotFromFiles(files);
}

describe("Gate 2 (linker) structural classification", () => {
  test("dependency cycle is structural", () => {
    const snap = linkerSnap({
      "argument/lemmas/lem-a.md": "---\nid: lem-a\nkind: lemma\ncontract: A\ndeps: lem-b\n---\n",
      "argument/lemmas/lem-b.md": "---\nid: lem-b\nkind: lemma\ncontract: B\ndeps: lem-a\n---\n",
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "cycle detected")).toBe(true);
  });

  test("unknown dep id (broken reference) is structural", () => {
    const snap = linkerSnap({
      "argument/lemmas/lem-a.md": "---\nid: lem-a\nkind: lemma\ncontract: A\ndeps: lem-nonexistent\n---\n",
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "unknown dep")).toBe(true);
  });

  test("missing 'kind:' field (schema completeness) is NON-structural", () => {
    const snap = linkerSnap({
      "argument/lemmas/lem-a.md": "---\nid: lem-a\ncontract: A\n---\n",
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "missing required field 'kind'")).toBeFalsy();
  });

  test("generated-freshness (INDEX.md/DAG.md stale) is NON-structural", () => {
    const snap = linkerSnap({
      "argument/lemmas/lem-a.md": "---\nid: lem-a\nkind: lemma\ncontract: A\n---\n",
      "argument/INDEX.md": "stale\n",
      "argument/DAG.md": "stale\n",
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "STALE")).toBeFalsy();
  });
});

// LB5 (2026-08-03 M3-close review): the four NEWEST phase-matrix rows had no classification test
// at all — Checks 13/14/16 and Gate 7 — which is exactly where the contract's own three-way
// mutation-proof rule (doc + `structural` flag + this file, same commit) mattered most. The ruling
// this pins: ledger/parse-integrity faults on the retraction and L5 stores are STRUCTURAL (block in
// both phases, same class as a linker/defs/refs parse fault); the STATUS SEMANTICS those same
// checks compute over a READABLE store stay non-structural. docs/gate-contracts.md "Phase matrix",
// Gate 2 row.
const L5_SHARD_BODY = "---\nid: lem-l5\nkind: lemma\nstatus: proved-mod-audit\naf: none\ncontract: c\n---\n";
const L5_SHARD_HASH = sha256Hex(new TextEncoder().encode(L5_SHARD_BODY));

function l5Line(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: "1",
    ordinal: 0,
    itemId: "lem-l5",
    l5ContentHash: L5_SHARD_HASH,
    verdict: "VALID",
    justification: "checked end to end, sound",
    verifierSeam: "gpt|codex|gpt-5.6|s1",
    ...overrides,
  });
}

function retractionLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: "1",
    ordinal: 0,
    itemId: "lem-l5",
    contentHash: L5_SHARD_HASH,
    hashDomain: "l5-shard-bytes",
    retractedBy: "audit:2026-08-03",
    reason: "withdrawn by an independent sweep",
    ...overrides,
  });
}

describe("Gate 2 Check 14 (L5 promotion) structural classification [LB5]", () => {
  test("STORE-INTEGRITY half: a corrupt .rk/l5-verdicts.jsonl is STRUCTURAL (blocks in both phases)", () => {
    const snap = linkerSnap({
      "argument/lem-l5.md": L5_SHARD_BODY,
      ".rk/l5-verdicts.jsonl": `${l5Line()}\n{truncated\n`,
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "L5 store integrity compromised")).toBe(true);
    // Its one shard-attributed consequence carries the same class: it exists ONLY because the
    // ledger could not be read.
    expect(structuralOf(findings, "so its promotion can no longer be confirmed")).toBe(true);
  });

  test("PROMOTION-SEMANTICS half: a promoted shard a READABLE store no longer supports is NON-structural", () => {
    const snap = linkerSnap({
      "argument/lem-l5.md": L5_SHARD_BODY,
      ".rk/l5-verdicts.jsonl": `${l5Line({ verdict: "INVALID" })}\n`,
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expectPresent(findings, "the L5 history no longer supports promotion");
    expect(structuralOf(findings, "the L5 history no longer supports promotion")).toBeFalsy();
  });
});

describe("Gate 2 Check 16 (retraction) structural classification [LB5]", () => {
  test("STORE-INTEGRITY half: a corrupt .rk/retractions.jsonl is STRUCTURAL (blocks in both phases)", () => {
    const snap = linkerSnap({
      "argument/lem-l5.md": L5_SHARD_BODY,
      ".rk/retractions.jsonl": `${retractionLine()}\n{truncated\n`,
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "retraction store integrity compromised")).toBe(true);
  });

  test("RETRACTION-STATUS half: the unconditional veto over a READABLE ledger is NON-structural", () => {
    const snap = linkerSnap({
      "argument/lem-l5.md": L5_SHARD_BODY,
      ".rk/retractions.jsonl": `${retractionLine()}\n`,
    });
    const { findings } = linkerGate.run(snap, DEFAULT_GATE_CONFIG);
    expectPresent(findings, "retraction veto:");
    expect(structuralOf(findings, "retraction veto:")).toBeFalsy();
  });
});

describe("Gate 2 Check 13 (critical-path provenance) structural classification [LB5]", () => {
  // A validated critical-path root with NO parseable cross-vendor identity and no explicit
  // `legacy-same-family` marker => ERROR (2026-07-19 M3 review blocker 5a; fixture linker-32).
  // Consolidation-weight validity over an af-validated claim, NOT DAG coherence => non-structural.
  test("an unresolvable identity on the critical path is NON-structural (consolidation-weight)", () => {
    const snap = linkerSnap({
      "argument/thm-main.md":
        "---\nid: thm-main\nkind: theorem\nstatus: stated\naf: validated\ncontract: C\nworkspace: proofs/thm-main\n---\n",
      "proofs/thm-main/ledger/000001.json": JSON.stringify({ type: "proof_initialized", conjecture: "C" }),
      "proofs/thm-main/ledger/000002.json": JSON.stringify({ type: "node_created", node: { id: "1", statement: "C" } }),
      "proofs/thm-main/ledger/000003.json": JSON.stringify({ type: "node_validated", node_id: "1" }),
    });
    const { findings } = linkerGate.run(snap, { ...DEFAULT_GATE_CONFIG, northStarId: "thm-main" });
    expectPresent(findings, "carries no parseable cross-vendor identity");
    expect(structuralOf(findings, "carries no parseable cross-vendor identity")).toBeFalsy();
  });
});

describe("Gate 7 (freshness) structural classification [LB5]", () => {
  // WHOLE-GATE non-structural, for the same reason Gates 4-6 are: the subject matter (a repo's own
  // adopted generated-output convention) is consolidation-shaped by construction. All three finding
  // classes the phase-matrix row names are asserted, not just one.
  test("manifest malformation is NON-structural", () => {
    const snap = linkerSnap({ ".rk/generated.json": '{"schema_version": "1", "entries": "not-an-array"}' });
    const { findings } = freshnessGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => !f.structural)).toBe(true);
  });

  test("a declared-but-missing artifact is NON-structural", () => {
    const snap = linkerSnap({
      ".rk/generated.json": JSON.stringify({
        schema_version: "1",
        entries: [{ path: "argument/INDEX.md", generator: "linker-index" }],
      }),
    });
    const { findings } = freshnessGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => !f.structural)).toBe(true);
  });

  test("a per-entry STALE is NON-structural", () => {
    const snap = linkerSnap({
      "argument/lem-a.md": "---\nid: lem-a\nkind: lemma\ncontract: A\n---\n",
      "argument/INDEX.md": "definitely not the rendered index\n",
      ".rk/generated.json": JSON.stringify({
        schema_version: "1",
        entries: [{ path: "argument/INDEX.md", generator: "linker-index" }],
      }),
    });
    const { findings } = freshnessGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => !f.structural)).toBe(true);
  });
});

describe("Gate 3 (refs) structural classification", () => {
  test("unparseable external JSON is structural", () => {
    const snap = linkerSnap({ "proofs/ws/externals/ext.json": "{ not json" });
    const { findings } = refsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "unparseable JSON")).toBe(true);
  });

  test("refs payload absent (byte-verification / provenance) is NON-structural", () => {
    const snap = linkerSnap({
      "proofs/ws/externals/ext.json": JSON.stringify({ source: 'VERBATIM "hello world" at refs/x.md' }),
    });
    const { findings } = refsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(structuralOf(findings, "ABSENT")).toBeFalsy();
  });

  // rk-wkzh / P2: both new checks join the NON-STRUCTURAL column, the same column Checks 2-4
  // already occupy (docs/gate-contracts.md "Phase matrix", Gate 3 row). They are byte-verification
  // /attribution claims about a quote, not "this file cannot be reasoned about at all" faults.
  test("check 6 (quote matched OUTSIDE the claimed locus) is NON-structural", () => {
    const payload = ["alpha", "beta", "the map is idempotent on X", "gamma"].join("\n");
    const snap = linkerSnap({
      "proofs/ws/externals/ext.json": JSON.stringify({
        source: 'See refs/src/paper.md:900. VERBATIM "the map is idempotent on X" here.',
      }),
      "refs/src/paper.md": payload,
    });
    const { findings } = refsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(findings).toHaveLength(1);
    expect(structuralOf(findings, "OUTSIDE the claimed locus")).toBeFalsy();
  });

  test("check 7 (refs locus named, no extractable quote) is NON-structural", () => {
    const snap = linkerSnap({
      "proofs/ws/externals/ext.json": JSON.stringify({ source: "See refs/src/paper.md:12 for the bound." }),
    });
    const { findings } = refsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(findings).toHaveLength(1);
    expect(structuralOf(findings, "no double-quoted verbatim text")).toBeFalsy();
  });
});
