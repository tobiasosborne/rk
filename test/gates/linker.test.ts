// Unit tests for Gate 2 (linker) af-workspace ledger replay (src/gates/linker-workspace.ts).
// rk-co2: introspectWorkspace ignored `node_amended` events entirely, so a workspace whose root
// (node_id "1") was amended after creation kept reporting the stale pre-amendment statement.
// AISM's `af` CLI is event-sourced — `af get 1` replays the FULL ledger, so `node_amended` is
// authoritative over the original `node_created`. These tests pin that replay order directly
// against the real event shape found in AISM's own ledger
// (../almost-idempotent-stochastic-maps/proofs/lem-hx-financing-floor/ledger/000043.json):
// `{"type":"node_amended","node_id":"1","previous_statement":"...","new_statement":"..."}` — a
// flat `node_id` string field, not a nested `node.id` like `node_created`.
//
// corpus/linker/linker-22 and linker-23 (test/corpus.test.ts) cover the same fix end-to-end
// through checkContracts (Check 9); these tests isolate introspectWorkspace's replay logic.

import { describe, expect, test } from "bun:test";
import { introspectWorkspace } from "../../src/gates/linker-workspace";
import { parseRegistry } from "../../src/gates/linker-parse";
import { linkerGate } from "../../src/gates/linker";
import { checkGenerated } from "../../src/gates/linker-render";
import type { RepoSnapshot } from "../../src/gates/snapshot";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";

function snapshotOf(workspace: string, events: unknown[]): RepoSnapshot {
  const m = new Map<string, string>();
  events.forEach((e, i) => {
    const seq = String(i + 1).padStart(6, "0");
    m.set(`${workspace}/ledger/${seq}.json`, JSON.stringify(e));
  });
  return snapshotFromFiles(m);
}

describe("introspectWorkspace / node_amended replay (rk-co2)", () => {
  test("node_amended on node_id '1' overrides the node_created statement", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "proof_initialized", conjecture: "stale conjecture" },
      { type: "node_created", node: { id: "1", statement: "stale pre-amendment statement" } },
      { type: "node_amended", node_id: "1", previous_statement: "stale pre-amendment statement", new_statement: "amended current statement" },
    ]);
    const facts = introspectWorkspace(snapshot, "proofs/lem-x");
    expect(facts?.contract).toBe("amended current statement");
    // node_amended does not create a node — the count still reflects node_created events only.
    expect(facts?.nodes).toBe(1);
  });

  test("a later node_amended on a NON-root node_id does not touch the root statement", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "node_created", node: { id: "1", statement: "root statement" } },
      { type: "node_created", node: { id: "1.1", statement: "child statement" } },
      { type: "node_amended", node_id: "1.1", previous_statement: "child statement", new_statement: "amended child" },
    ]);
    const facts = introspectWorkspace(snapshot, "proofs/lem-x");
    expect(facts?.contract).toBe("root statement");
    expect(facts?.nodes).toBe(2);
  });

  test("a SECOND node_amended on node_id '1' wins over the first (last-write-wins replay order)", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "node_created", node: { id: "1", statement: "v0" } },
      { type: "node_amended", node_id: "1", previous_statement: "v0", new_statement: "v1" },
      { type: "node_amended", node_id: "1", previous_statement: "v1", new_statement: "v2" },
    ]);
    const facts = introspectWorkspace(snapshot, "proofs/lem-x");
    expect(facts?.contract).toBe("v2");
  });

  test("no node_amended at all falls back to node_created (pre-existing behavior unchanged)", () => {
    const snapshot = snapshotOf("proofs/lem-x", [
      { type: "proof_initialized", conjecture: "conjecture text" },
      { type: "node_created", node: { id: "1", statement: "created statement" } },
    ]);
    const facts = introspectWorkspace(snapshot, "proofs/lem-x");
    expect(facts?.contract).toBe("created statement");
  });
});

// R14 (bead rk-1rv, docs/memos/2026-07-18-aism-residue-audit.md): argument/INDEX.md and DAG.md
// are AISM's transitional markdown mirror, superseded by M2.4's HTML render + M2.6's
// regenerate-and-diff gate. corpus/linker/linker-25 covers this end-to-end through the corpus
// runner (a real lemma shard, neither mirror file present); these tests isolate checkGenerated's
// own presence guard and the coverage-line note it feeds.
describe("checkGenerated / linkerGate — R14: argument/INDEX.md + DAG.md are presence-conditional", () => {
  const LEMMA_FILES = { "argument/lemmas/lem-x.md": "---\nid: lem-x\nkind: lemma\nstatus: stated\naf: none\ncontract: c\n---\n" };

  test("both mirrors absent: zero findings from checkGenerated, mirrorStatus records both absent", () => {
    const snapshot = snapshotFromFiles(LEMMA_FILES);
    const { lemmas } = parseRegistry(snapshot);
    const { findings, mirrorStatus } = checkGenerated(snapshot, lemmas);
    expect(findings).toEqual([]);
    expect(mirrorStatus).toEqual([
      { path: "argument/INDEX.md", label: "INDEX", present: false },
      { path: "argument/DAG.md", label: "DAG", present: false },
    ]);
  });

  test("linkerGate's coverage line names both mirrors' adoption status visibly (L2: never a silent skip)", () => {
    const result = linkerGate.run(snapshotFromFiles(LEMMA_FILES), DEFAULT_GATE_CONFIG);
    expect(result.findings.filter((f) => f.path.startsWith("argument/INDEX") || f.path.startsWith("argument/DAG"))).toEqual([]);
    expect(result.coverage[0]!.unit).toContain("INDEX absent (not adopted)");
    expect(result.coverage[0]!.unit).toContain("DAG absent (not adopted)");
  });

  test("a PRESENT mirror that is stale still ERRORs exactly as before (presence-conditionality never weakens a real STALE finding)", () => {
    const snapshot = snapshotFromFiles({ ...LEMMA_FILES, "argument/INDEX.md": "hand-edited, not a real render\n" });
    const { lemmas } = parseRegistry(snapshot);
    const { findings, mirrorStatus } = checkGenerated(snapshot, lemmas);
    expect(findings).toEqual([
      { severity: "ERROR", path: "argument/INDEX.md", message: expect.stringContaining("is STALE") },
    ]);
    expect(mirrorStatus.find((m) => m.label === "INDEX")?.present).toBe(true);
    expect(mirrorStatus.find((m) => m.label === "DAG")?.present).toBe(false);
  });
});

describe("parseRegistry / required 'kind' field (rk-aft, 2026-07-18 M0.3 review finding 3)", () => {
  test("a lemma shard with no `kind:` line at all registers an ERROR, not a silent pass", () => {
    const snapshot: RepoSnapshot = snapshotFromFiles(new Map([
      [
        "argument/lemmas/lem-no-kind.md",
        "---\nid: lem-no-kind\nstatus: stated\naf: none\ncontract: no kind here\n---\n",
      ],
    ]));
    const { lemmas, errors } = parseRegistry(snapshot);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.severity).toBe("ERROR");
    expect(errors[0]?.message).toContain("missing required field 'kind'");
    // Unlike an absent `id` ([F12]), an absent `kind` does NOT exclude the shard from `lemmas` —
    // every other check (acyclicity/status/orphans/generated) must still see this shard.
    expect(lemmas).toHaveLength(1);
    expect(lemmas[0]?.kind).toBeUndefined();
  });

  test("`kind:` present but empty is treated the same as absent (falsy, not a KINDS-enum miss)", () => {
    const snapshot: RepoSnapshot = snapshotFromFiles(new Map([
      [
        "argument/lemmas/lem-empty-kind.md",
        "---\nid: lem-empty-kind\nkind:\nstatus: stated\naf: none\ncontract: c\n---\n",
      ],
    ]));
    const { errors } = parseRegistry(snapshot);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("missing required field 'kind'");
  });

  test("a valid `kind:` value registers cleanly (no regression on the golden path)", () => {
    const snapshot: RepoSnapshot = snapshotFromFiles(new Map([
      [
        "argument/lemmas/lem-ok.md",
        "---\nid: lem-ok\nkind: lemma\nstatus: stated\naf: none\ncontract: c\n---\n",
      ],
    ]));
    const { lemmas, errors } = parseRegistry(snapshot);
    expect(errors).toHaveLength(0);
    expect(lemmas[0]?.kind).toBe("lemma");
  });
});

// rk-9pk (dogfood-1, real user, 2026-07-18): the linker used to glob argument/lemmas/*.md ONLY,
// so a shard written directly at argument/*.md (the shape rk's own stamped scaffold produces —
// PRD.md:79-85 creates argument/, never a lemmas/ subdirectory) silently registered 0/0 with zero
// findings and a green `rk check` over an entirely unvalidated registry, including the campaign's
// north-star theorem. corpus/linker/linker-26 and linker-27 cover this end-to-end through the
// corpus runner; these tests isolate parseRegistry's recursive-scan + exclusion logic and
// linkerGate's coverage-line note directly, independent of any fixture.
describe("parseRegistry / recursive argument/**/*.md discovery (rk-9pk)", () => {
  test("a root-level shard (argument/*.md, the dogfood-1 shape) is discovered and parsed", () => {
    const snapshot = snapshotFromFiles({
      "argument/lem-root.md": "---\nid: lem-root\nkind: lemma\nstatus: stated\naf: none\ncontract: c\n---\n",
    });
    const { lemmas, errors, total, ignored } = parseRegistry(snapshot);
    expect(errors).toHaveLength(0);
    expect(lemmas).toHaveLength(1);
    expect(lemmas[0]?.id).toBe("lem-root");
    expect(lemmas[0]?.path).toBe("argument/lem-root.md");
    expect(total).toBe(1);
    expect(ignored).toEqual([]);
  });

  test("a shard nested two levels deep (argument/lemmas/sub/lem-y.md) is discovered", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/sub/lem-y.md": "---\nid: lem-y\nkind: lemma\nstatus: stated\naf: none\ncontract: c\n---\n",
    });
    const { lemmas, errors } = parseRegistry(snapshot);
    expect(errors).toHaveLength(0);
    expect(lemmas).toHaveLength(1);
    expect(lemmas[0]?.id).toBe("lem-y");
    expect(lemmas[0]?.path).toBe("argument/lemmas/sub/lem-y.md");
  });

  test("README.md/INDEX.md/DAG.md are excluded at ANY depth, named relative to argument/, and " +
    "never counted as shard candidates", () => {
    const snapshot = snapshotFromFiles({
      "argument/README.md": "prose",
      "argument/INDEX.md": "generated",
      "argument/DAG.md": "generated",
      "argument/lemmas/README.md": "prose, nested",
      "argument/lem-x.md": "---\nid: lem-x\nkind: lemma\nstatus: stated\naf: none\ncontract: c\n---\n",
    });
    const { lemmas, errors, total, ignored } = parseRegistry(snapshot);
    expect(errors).toHaveLength(0);
    expect(lemmas).toHaveLength(1);
    expect(total).toBe(1);
    expect(ignored).toEqual(["DAG.md", "INDEX.md", "README.md", "lemmas/README.md"]);
  });

  test("a frontmatter-less stray .md under argument/ (not README/INDEX/DAG) is a parse ERROR, " +
    "never a silent skip", () => {
    const snapshot = snapshotFromFiles({
      "argument/stray.md": "just some prose, no frontmatter block at all\n",
    });
    const { lemmas, errors, total, ignored } = parseRegistry(snapshot);
    expect(lemmas).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.severity).toBe("ERROR");
    expect(errors[0]?.path).toBe("argument/stray.md");
    expect(errors[0]?.message).toContain("missing/unterminated frontmatter");
    // The stray file is a considered CANDIDATE (it counts toward the coverage denominator) — it
    // is emphatically not in `ignored` (that set is exact-name-only: README/INDEX/DAG).
    expect(total).toBe(1);
    expect(ignored).toEqual([]);
  });

  test("argument/lemmas/*.md (the pre-rk-9pk AISM-compatible layout) still discovers cleanly " +
    "under the recursive scan — no regression on the legacy shape", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-a.md": "---\nid: lem-a\nkind: lemma\nstatus: stated\naf: none\ncontract: c\n---\n",
      "argument/lemmas/README.md": "prose",
      "argument/lemmas/INDEX.md": "generated",
    });
    const { lemmas, errors, total, ignored } = parseRegistry(snapshot);
    expect(errors).toHaveLength(0);
    expect(lemmas).toHaveLength(1);
    expect(total).toBe(1);
    expect(ignored).toEqual(["lemmas/INDEX.md", "lemmas/README.md"]);
  });
});

describe("linkerGate coverage line / ignored-file count (rk-9pk)", () => {
  test("the coverage line names the ignored-file count and their names, even when zero " +
    "(never a silent omission, CLAUDE.md L2)", () => {
    const zeroSnapshot = snapshotFromFiles({
      "argument/lem-only.md": "---\nid: lem-only\nkind: lemma\nstatus: stated\naf: none\ncontract: c\n---\n",
    });
    const zeroResult = linkerGate.run(zeroSnapshot, DEFAULT_GATE_CONFIG);
    expect(zeroResult.coverage[0]!.unit).toContain("0 non-shard files ignored");

    const twoIgnoredSnapshot = snapshotFromFiles({
      "argument/lem-only.md": "---\nid: lem-only\nkind: lemma\nstatus: stated\naf: none\ncontract: c\n---\n",
      "argument/README.md": "prose",
      "argument/INDEX.md": "generated",
    });
    const twoResult = linkerGate.run(twoIgnoredSnapshot, DEFAULT_GATE_CONFIG);
    expect(twoResult.coverage[0]!.unit).toContain("2 non-shard files ignored: INDEX.md, README.md");
    // Coverage checked/total counts shard CANDIDATES only — the two ignored files never inflate
    // the denominator.
    expect(twoResult.coverage[0]!.checked).toBe(1);
    expect(twoResult.coverage[0]!.total).toBe(1);
  });
});
