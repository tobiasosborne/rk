// Unit tests for Gate 1 — defs (src/gates/defs.ts). The 15 corpus fixtures
// (corpus/defs/defs-01..15, exercised by test/corpus.test.ts) cover the gate's end-to-end
// per-fixture behavior; this file targets internal logic in isolation — the alias/term dedup
// namespace (DRIFT, check 7), the cited-shard presence checks (checks 8-9, F5 reversed M0.7),
// and coverage-line composition — per docs/gate-contracts.md "Gate 1 — defs" and the Tier-A
// boundary-review carry-forward (presence unconditional, value checks manifest-gated, '-'
// counts as missing sha256).

import { describe, expect, test } from "bun:test";
import { checkShard, dedupNames, defsGate } from "../../src/gates/defs";
import type { Finding } from "../../src/gates/framework";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import type { RepoSnapshot } from "../../src/gates/snapshot";

const EMPTY_MANIFEST = { present: true, prefix2path: new Map<string, string>(), sourceIds: new Set<string>() };
const ABSENT_MANIFEST = { present: false, prefix2path: new Map<string, string>(), sourceIds: new Set<string>() };

function shardText(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\nbody\n`;
}

describe("dedupNames", () => {
  test("term alone, no aliases", () => {
    expect(dedupNames("Alpha Hull", undefined)).toEqual(["Alpha Hull"]);
  });

  test("term plus ';'-separated aliases, trimmed", () => {
    expect(dedupNames("Alpha Hull", "shared-name; K_alpha ;  another ")).toEqual([
      "Alpha Hull",
      "shared-name",
      "K_alpha",
      "another",
    ]);
  });

  test("blank alias entries (double ';', trailing ';') are dropped, not turned into a spurious key", () => {
    expect(dedupNames("T", "a;;b;")).toEqual(["T", "a", "b"]);
  });

  test("blank term is dropped, not treated as a claimed empty-string name", () => {
    expect(dedupNames("", "only-alias")).toEqual(["only-alias"]);
    expect(dedupNames(undefined, undefined)).toEqual([]);
  });
});

describe("checkShard — DEDUP/DRIFT (dup-term and dup-alias detection)", () => {
  test("two shards claiming the identical term (no aliases involved) is DRIFT", () => {
    const owner = new Map<string, string>();
    const findings: Finding[] = [];
    checkShard(
      "definitions/def-a.md",
      { id: "def-a", term: "Shared Term", kind: "original", status: "locked", consensus: "x" },
      EMPTY_MANIFEST,
      new Map(),
      owner,
      findings,
    );
    checkShard(
      "definitions/def-b.md",
      { id: "def-b", term: "shared term", kind: "original", status: "locked", consensus: "x" },
      EMPTY_MANIFEST,
      new Map(),
      owner,
      findings,
    );
    const drift = findings.filter((f) => f.message.startsWith("DRIFT"));
    expect(drift).toHaveLength(1);
    expect(drift[0]!.path).toBe("definitions/def-b.md");
    expect(drift[0]!.message).toBe("DRIFT: name 'shared term' claimed by both definitions/def-a.md and definitions/def-b.md");
  });

  test("a term colliding with an EARLIER shard's alias is DRIFT too (one shared namespace)", () => {
    const owner = new Map<string, string>();
    const findings: Finding[] = [];
    checkShard(
      "definitions/def-a.md",
      { id: "def-a", term: "Something Else", aliases: "K_alpha", kind: "original", status: "locked", consensus: "x" },
      EMPTY_MANIFEST,
      new Map(),
      owner,
      findings,
    );
    checkShard(
      "definitions/def-b.md",
      { id: "def-b", term: "K_alpha", kind: "original", status: "locked", consensus: "x" },
      EMPTY_MANIFEST,
      new Map(),
      owner,
      findings,
    );
    expect(findings.some((f) => f.message.includes("DRIFT: name 'K_alpha'"))).toBe(true);
  });

  test("same term reused by the SAME shard (re-processed) is not DRIFT against itself", () => {
    const owner = new Map<string, string>();
    const findings: Finding[] = [];
    checkShard(
      "definitions/def-a.md",
      { id: "def-a", term: "T", aliases: "T", kind: "original", status: "locked", consensus: "x" },
      EMPTY_MANIFEST,
      new Map(),
      owner,
      findings,
    );
    expect(findings.some((f) => f.message.startsWith("DRIFT"))).toBe(false);
  });

  test("distinct terms never collide", () => {
    const owner = new Map<string, string>();
    const findings: Finding[] = [];
    checkShard(
      "definitions/def-a.md",
      { id: "def-a", term: "Alpha", kind: "original", status: "locked", consensus: "x" },
      EMPTY_MANIFEST,
      new Map(),
      owner,
      findings,
    );
    checkShard(
      "definitions/def-b.md",
      { id: "def-b", term: "Beta", kind: "original", status: "locked", consensus: "x" },
      EMPTY_MANIFEST,
      new Map(),
      owner,
      findings,
    );
    expect(findings.filter((f) => f.message.startsWith("DRIFT"))).toHaveLength(0);
  });
});

describe("checkShard — cited-shard presence (checks 8-9, F5 reversed M0.7)", () => {
  const base = { id: "def-x", term: "X", kind: "cited", status: "locked", consensus: "internal" };

  test("both source and sha256 absent: TWO presence ERRORs, unconditionally (no manifest needed)", () => {
    const findings: Finding[] = [];
    checkShard("definitions/def-x.md", base, ABSENT_MANIFEST, new Map(), new Map(), findings);
    const errors = findings.filter((f) => f.severity === "ERROR");
    expect(errors).toHaveLength(2);
    expect(errors.some((f) => f.message === "cited shard missing required 'source:'")).toBe(true);
    expect(errors.some((f) => f.message === "cited shard missing required 'sha256:'")).toBe(true);
  });

  test("sha256: '-' counts as missing, same as absence", () => {
    const findings: Finding[] = [];
    checkShard(
      "definitions/def-x.md",
      { ...base, source: "src-alpha", sha256: "-" },
      EMPTY_MANIFEST,
      new Map(),
      new Map(),
      findings,
    );
    expect(findings.some((f) => f.severity === "ERROR" && f.message.includes("missing required 'sha256:'"))).toBe(true);
    // source WAS supplied — no source-presence ERROR.
    expect(findings.some((f) => f.message.includes("missing required 'source:'"))).toBe(false);
  });

  test("both present: zero presence ERRORs", () => {
    const findings: Finding[] = [];
    const manifest = { present: true, prefix2path: new Map([["abcdef0123456789", "src-alpha/paper.tex"]]), sourceIds: new Set(["src-alpha"]) };
    checkShard(
      "definitions/def-x.md",
      { ...base, source: "src-alpha", sha256: "abcdef0123456789" },
      manifest,
      new Map([["refs/src-alpha/paper.tex", "..."]]),
      new Map(),
      findings,
    );
    expect(findings.filter((f) => f.severity === "ERROR")).toHaveLength(0);
  });

  test("presence check fires even when a value-check would otherwise be manifest-gated-off (empty manifest, fabricated fields still required)", () => {
    const findings: Finding[] = [];
    checkShard("definitions/def-x.md", base, ABSENT_MANIFEST, new Map(), new Map(), findings);
    // Absent manifest never suppresses the presence requirement — only the value-validation
    // sub-checks (source-is-a-known-id / sha-resolves) are manifest-gated.
    expect(findings.filter((f) => f.severity === "ERROR")).toHaveLength(2);
  });

  test("value checks are manifest-gated: a fabricated source/sha are NOT flagged when the manifest is empty/absent", () => {
    const findings: Finding[] = [];
    checkShard(
      "definitions/def-x.md",
      { ...base, source: "src-fabricated", sha256: "fabricated0000000" },
      ABSENT_MANIFEST,
      new Map(),
      new Map(),
      findings,
    );
    expect(findings.some((f) => f.message.includes("not a refs/ source-id"))).toBe(false);
    expect(findings.some((f) => f.message.includes("not in refs manifest"))).toBe(false);
  });

  test("value checks DO fire once the manifest is non-empty", () => {
    const findings: Finding[] = [];
    const manifest = { present: true, prefix2path: new Map([["abcdef0123456789", "src-alpha/paper.tex"]]), sourceIds: new Set(["src-alpha"]) };
    checkShard(
      "definitions/def-x.md",
      { ...base, source: "src-nonexistent", sha256: "deadbeefdeadbeef" },
      manifest,
      new Map(),
      new Map(),
      findings,
    );
    expect(findings.some((f) => f.message.includes("cited source 'src-nonexistent' not a refs/ source-id"))).toBe(true);
    expect(findings.some((f) => f.message.includes("sha256 prefix 'deadbeefdeadbeef' not in refs manifest"))).toBe(true);
  });

  test("hashVerified is true only when the sha256 prefix actually resolves in the manifest", () => {
    const manifest = { present: true, prefix2path: new Map([["abcdef0123456789", "src-alpha/paper.tex"]]), sourceIds: new Set(["src-alpha"]) };
    const resolved = checkShard(
      "definitions/def-x.md",
      { ...base, source: "src-alpha", sha256: "abcdef0123456789" },
      manifest,
      new Map([["refs/src-alpha/paper.tex", "..."]]),
      new Map(),
      [],
    );
    expect(resolved.cited).toBe(true);
    expect(resolved.hashVerified).toBe(true);

    const unresolved = checkShard(
      "definitions/def-y.md",
      { ...base, id: "def-y", source: "src-alpha", sha256: "0000000000000000" },
      manifest,
      new Map(),
      new Map(),
      [],
    );
    expect(unresolved.hashVerified).toBe(false);
  });
});

describe("defsGate.run — coverage line composition", () => {
  function snapshot(files: Record<string, string>): RepoSnapshot {
    return snapshotFromFiles(files);
  }

  test("no cited shards at all: unit is bare 'shards', no sub-count", () => {
    const snap = snapshot({
      "definitions/def-a.md": shardText({ id: "def-a", term: "A", kind: "original", status: "locked", consensus: "x" }),
    });
    const result = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(result.coverage).toEqual([{ gate: "defs", unit: "shards", checked: 1, total: 1 }]);
  });

  test("cited shards present, manifest present: C/K hash-verified sub-count", () => {
    const snap = snapshot({
      "definitions/def-a.md": shardText({
        id: "def-a",
        term: "A",
        kind: "cited",
        status: "locked",
        source: "src-alpha",
        sha256: "d256a94773479bb2",
        consensus: "x",
      }),
      "refs/manifest/checksums.sha256": "d256a94773479bb2d03c6e1a5e45c271f4719ca70bb7c4b0b21a2605d48064a1  ./src-alpha/paper.tex\n",
    });
    const result = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(result.coverage).toEqual([
      { gate: "defs", unit: "shards, 1/1 cited shards hash-verified", checked: 1, total: 1 },
    ]);
  });

  test("cited shards present, manifest absent: 0/K sub-count with the 'manifest absent' suffix", () => {
    const snap = snapshot({
      "definitions/def-a.md": shardText({
        id: "def-a",
        term: "A",
        kind: "cited",
        status: "locked",
        source: "src-fab",
        sha256: "fabricated000001",
        consensus: "x",
      }),
    });
    const result = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(result.coverage).toEqual([
      { gate: "defs", unit: "shards, 0/1 cited shards hash-verified — manifest absent", checked: 1, total: 1 },
    ]);
    expect(result.findings.some((f) => f.severity === "WARN" && f.message.includes("manifest absent"))).toBe(true);
  });

  test("README.md and INDEX.md are excluded from the glob (SKIP set)", () => {
    const snap = snapshot({
      "definitions/README.md": "not a shard, prose only\nkind: cited (documentation example, not real)\n",
      "definitions/INDEX.md": "<!-- generated -->\n",
      "definitions/def-a.md": shardText({ id: "def-a", term: "A", kind: "original", status: "locked", consensus: "x" }),
    });
    const result = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(result.coverage).toEqual([{ gate: "defs", unit: "shards", checked: 1, total: 1 }]);
    expect(result.findings.filter((f) => f.path.includes("README") || f.path.includes("INDEX"))).toHaveLength(0);
  });

  test("a fully-empty definitions/ tree is a legitimate 0/0 pass, not an error", () => {
    const result = defsGate.run(snapshotFromFiles({}), DEFAULT_GATE_CONFIG);
    expect(result.coverage).toEqual([{ gate: "defs", unit: "shards", checked: 0, total: 0 }]);
    expect(result.findings.filter((f) => f.severity === "ERROR")).toHaveLength(0);
  });

  test("gate reports notImplemented: undefined once real (never true) — corpus.test.ts's stub probe flips on this", () => {
    const result = defsGate.run(snapshotFromFiles({}), DEFAULT_GATE_CONFIG);
    expect(result.notImplemented).toBeUndefined();
  });
});

describe("defsGate.run — frontmatter presence/termination gates the rest of the shard's checks", () => {
  function snapshot(files: Record<string, string>): RepoSnapshot {
    return snapshotFromFiles(files);
  }

  test("missing frontmatter: exactly one ERROR, no downstream field checks attempted", () => {
    const snap = snapshot({ "definitions/def-a.md": "no frontmatter here at all\n" });
    const result = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    const errors = result.findings.filter((f) => f.severity === "ERROR");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ severity: "ERROR", path: "definitions/def-a.md", message: "missing/unterminated frontmatter" });
  });

  test("unterminated frontmatter: same single ERROR, malformed-line scan never runs (mirrors check-defs.py's early None return)", () => {
    const snap = snapshot({ "definitions/def-a.md": "---\nid: def-a\nthis has no colon\n" });
    const result = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    const errors = result.findings.filter((f) => f.severity === "ERROR");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe("missing/unterminated frontmatter");
  });
});
