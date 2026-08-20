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
import { applyPhase } from "../../src/gates/phase";
import { sha256Hex } from "../../src/gates/sha256";
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

  // rk-5lzf (LB5): `definitions/` discovery is RECURSIVE. Before this bead a shard under
  // `definitions/notation/` was never listed, so every check below (id/stem, DRIFT, cited
  // provenance) silently never ran on it — `checked defs: 1/1 shards` over a tree holding two.
  test("NESTED shards are discovered and checked (definitions/**/*.md, rk-5lzf)", () => {
    const snap = snapshotFromFiles({
      "definitions/def-a.md": shardText({ id: "def-a", term: "A", kind: "original", status: "locked", consensus: "x" }),
      "definitions/notation/sym-eps.md": shardText({ id: "sym-eps", term: "eps", kind: "cited", status: "locked" }),
    });
    const result = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(result.coverage[0]!.checked).toBe(2);
    expect(
      result.findings.filter((f) => f.path === "definitions/notation/sym-eps.md" && f.severity === "ERROR").length,
    ).toBeGreaterThan(0);
  });

  test("id must equal the filename STEM, not the nested path (rk-5lzf)", () => {
    const snap = snapshotFromFiles({
      "definitions/notation/sym-eps.md": shardText({ id: "sym-eps", term: "eps", kind: "original", status: "locked", consensus: "x" }),
    });
    const result = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(result.findings.filter((f) => f.message.includes("filename stem"))).toHaveLength(0);
  });

  test("README.md/INDEX.md are skipped at ANY depth (rk-5lzf)", () => {
    const snap = snapshotFromFiles({
      "definitions/notation/README.md": "not a shard\n",
      "definitions/notation/INDEX.md": "not a shard\n",
      "definitions/def-a.md": shardText({ id: "def-a", term: "A", kind: "original", status: "locked", consensus: "x" }),
    });
    const result = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(result.coverage[0]!.checked).toBe(1);
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

// rk-5lzf (Tier A, LB5): the notation register. `shard_type: notation` is ORTHOGONAL to `kind` —
// `kind` keeps its provenance meaning, so the MEANING is what gets provenanced, not merely the
// symbol's occurrence. Contract: docs/gate-contracts.md Gate 1, "Notation shards".
describe("defsGate.run — notation shards (rk-5lzf)", () => {
  const PROFILE = JSON.stringify({
    schema_version: "1",
    name: "qpcp",
    version: 1,
    tracked_classes: [
      { class: "promise-gap", description: "the promise gap", symbols: ["\\epsilon"], blessed: "\\gapfrac", symbols_must_be_registered: true },
    ],
    lattices: {},
    choices: {},
    enums: {},
  });
  const CONFIG = { ...DEFAULT_GATE_CONFIG, conventionProfile: "qpcp.v1" };

  function notationShard(fields: Record<string, string>, body = ""): string {
    const all = { shard_type: "notation", kind: "consensus", consensus: "campaign", status: "locked", ...fields };
    return `---\n${Object.entries(all).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n${body}`;
  }

  function errorsFor(files: Record<string, string>, config = CONFIG) {
    const snap = snapshotFromFiles({ ".rk/conventions/qpcp.v1.json": PROFILE, ...files });
    return defsGate.run(snap, config).findings.filter((f) => f.severity === "ERROR");
  }

  test("an unknown shard_type value is an ERROR (v1 admits only 'notation')", () => {
    const errs = errorsFor({
      "definitions/notation/sym-a.md": notationShard({ id: "sym-a", term: "a", shard_type: "glossary", symbol: "\\epsilon", class: "promise-gap" }),
    });
    expect(errs.some((e) => e.message.includes("shard_type"))).toBe(true);
  });

  test("a notation shard without symbol: or class: is an ERROR — it registers nothing", () => {
    const errs = errorsFor({ "definitions/notation/sym-a.md": notationShard({ id: "sym-a", term: "a" }) });
    expect(errs.some((e) => e.message.includes("'symbol:'"))).toBe(true);
    expect(errs.some((e) => e.message.includes("'class:'"))).toBe(true);
  });

  test("a symbol without its leading backslash is an ERROR", () => {
    const errs = errorsFor({
      "definitions/notation/sym-a.md": notationShard({ id: "sym-a", term: "a", symbol: "epsilon", class: "promise-gap" }),
    });
    expect(errs.some((e) => e.message.includes("LaTeX macro token"))).toBe(true);
  });

  test("a class not in the configured profile is a STRUCTURAL ERROR (broken cross-reference)", () => {
    const errs = errorsFor({
      "definitions/notation/sym-a.md": notationShard({ id: "sym-a", term: "a", symbol: "\\epsilon", class: "no-such-class" }),
    });
    const hit = errs.find((e) => e.message.includes("no-such-class"));
    expect(hit).toBeDefined();
    expect(hit!.structural).toBe(true);
  });

  test("with NO profile configured the class cannot be checked — and the coverage line says so", () => {
    const snap = snapshotFromFiles({
      "definitions/notation/sym-a.md": notationShard({ id: "sym-a", term: "a", symbol: "\\epsilon", class: "anything" }),
    });
    const result = defsGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(result.findings.filter((f) => f.severity === "ERROR")).toEqual([]);
    expect(result.coverage[0]!.unit).toContain("no convention profile");
  });

  test("DRIFT: two shards claiming the same symbol is a structural ERROR", () => {
    const errs = errorsFor({
      "definitions/notation/sym-a.md": notationShard({ id: "sym-a", term: "a", symbol: "\\epsilon", class: "promise-gap" }),
      "definitions/notation/sym-b.md": notationShard({ id: "sym-b", term: "b", symbol: "\\epsilon", class: "promise-gap" }),
    });
    const hit = errs.find((e) => e.message.includes("DRIFT: symbol"));
    expect(hit).toBeDefined();
    expect(hit!.structural).toBe(true);
  });

  test("translation-collision: two shards claiming the SAME (source-id, their-symbol) pair", () => {
    const row = '- kit-1: \\eps @ refs/kit-1/p.tex:3\n  "q"\n';
    const errs = errorsFor({
      "definitions/notation/sym-a.md": notationShard({ id: "sym-a", term: "a", symbol: "\\epsilon", class: "promise-gap" }, row),
      "definitions/notation/sym-b.md": notationShard({ id: "sym-b", term: "b", symbol: "\\gamma", class: "promise-gap" }, row),
    });
    const hit = errs.find((e) => e.message.includes("translation-collision"));
    expect(hit).toBeDefined();
    expect(hit!.structural).toBe(true);
  });

  test("the SAME pair twice in ONE shard is also a collision (no self-exemption)", () => {
    const row = '- kit-1: \\eps @ refs/kit-1/p.tex:3\n  "q"\n- kit-1: \\eps @ refs/kit-1/p.tex:9\n  "q2"\n';
    const errs = errorsFor({
      "definitions/notation/sym-a.md": notationShard({ id: "sym-a", term: "a", symbol: "\\epsilon", class: "promise-gap" }, row),
    });
    expect(errs.some((e) => e.message.includes("translation-collision"))).toBe(true);
  });

  test("a DIFFERENT symbol from the same source is not a collision", () => {
    const errs = errorsFor({
      "definitions/notation/sym-a.md": notationShard(
        { id: "sym-a", term: "a", symbol: "\\epsilon", class: "promise-gap" },
        '- kit-1: \\eps @ refs/kit-1/p.tex:3\n  "q"\n- kit-1: \\gam @ refs/kit-1/p.tex:4\n  "q2"\n',
      ),
    });
    expect(errs.some((e) => e.message.includes("translation-collision"))).toBe(false);
  });

  test("a translation row with no quote anchor is an ERROR naming the row", () => {
    const errs = errorsFor({
      "definitions/notation/sym-a.md": notationShard(
        { id: "sym-a", term: "a", symbol: "\\epsilon", class: "promise-gap" },
        "- kit-1: \\eps @ refs/kit-1/p.tex:3\nordinary prose, not an anchor\n",
      ),
    });
    const hit = errs.find((e) => e.message.includes("translation-anchor-missing"));
    expect(hit).toBeDefined();
    expect(hit!.line).toBeGreaterThan(0);
  });

  test("an anchored row whose payload is absent is an ERROR from the SHARED refs verifier", () => {
    const errs = errorsFor({
      "definitions/notation/sym-a.md": notationShard(
        { id: "sym-a", term: "a", symbol: "\\epsilon", class: "promise-gap" },
        '- kit-1: \\eps @ refs/kit-1/p.tex:3\n  "the promise gap"\n',
      ),
    });
    expect(errs.some((e) => e.message.includes("ABSENT"))).toBe(true);
  });

  test("translations: in the FRONTMATTER is an ERROR — the rows would vanish silently", () => {
    const snap = snapshotFromFiles({
      ".rk/conventions/qpcp.v1.json": PROFILE,
      "definitions/notation/sym-a.md":
        "---\nid: sym-a\nterm: a\nshard_type: notation\nsymbol: \\epsilon\nclass: promise-gap\n" +
        "kind: consensus\nconsensus: c\nstatus: locked\ntranslations:\n- kit-1: \\eps @ refs/kit-1/p.tex:3\n---\nbody\n",
    });
    const errs = defsGate.run(snap, CONFIG).findings.filter((f) => f.severity === "ERROR");
    expect(errs.some((e) => e.message.includes("translations-in-frontmatter"))).toBe(true);
  });

  test("kind stays orthogonal: a cited notation shard still needs source:/sha256:", () => {
    const errs = errorsFor({
      "definitions/notation/sym-a.md": notationShard({ id: "sym-a", term: "a", symbol: "\\epsilon", class: "promise-gap", kind: "cited" }),
    });
    expect(errs.some((e) => e.message.includes("missing required 'source:'"))).toBe(true);
    expect(errs.some((e) => e.message.includes("missing required 'sha256:'"))).toBe(true);
  });

  test("the coverage line reports the notation sub-counts", () => {
    const snap = snapshotFromFiles({
      ".rk/conventions/qpcp.v1.json": PROFILE,
      "definitions/notation/sym-a.md": notationShard({ id: "sym-a", term: "a", symbol: "\\epsilon", class: "promise-gap" }),
    });
    const result = defsGate.run(snap, CONFIG);
    expect(result.coverage[0]!.unit).toContain("1 notation shard");
    expect(result.coverage[0]!.unit).toContain("0/0 translations verified");
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

// ===========================================================================================
// rk-5lzf repair wave, blocker B1 (Tier A review 2026-08-20, finding 1): CITED MEANINGS ARE
// PROVENANCED. The review's exploit: "wrong meaning with verified translation anchors passes".
// A notation shard could carry `kind: cited` with a shard-level source/sha256 pair and say the
// symbol means anything at all — the legacy Layer 0 checks bind the SHARD to a source, never the
// MEANING to a passage. Translation rows had the mirror hole: a genuine quote from a genuine
// paper that neither contains the symbol being translated nor comes from the source the row names.
// ===========================================================================================
describe("Gate 1 — cited notation meanings are byte-bound (rk-5lzf B1)", () => {
  const PAYLOAD = "line one\nWe write $\\eps$ for the promise gap, a fraction of $m$.\nline three\n";

  function repo(shardBody: string, fm: Record<string, string> = {}): Record<string, string> {
    const fields = {
      id: "sym-gapfrac",
      term: "relative promise gap",
      shard_type: "notation",
      symbol: "\\gapfrac",
      class: "promise-gap",
      kind: "cited",
      source: "aav",
      sha256: "0000000000000000",
      status: "locked",
      ...fm,
    };
    const shard = `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n${shardBody}`;
    return {
      "definitions/notation/sym-gapfrac.md": shard,
      "refs/aav/paper.tex": PAYLOAD,
      "refs/manifest/sources.lock.json": JSON.stringify({
        files: [{ path: "aav/paper.tex", sha256: sha256Hex(new TextEncoder().encode(PAYLOAD)), source_id: "aav" }],
      }),
    };
  }

  function errorsFor(files: Record<string, string>) {
    return defsGate.run(snapshotFromFiles(files), DEFAULT_GATE_CONFIG).findings.filter((f) => f.severity === "ERROR");
  }

  const GOOD_MEANING =
    "meaning-anchor:\nrefs/aav/paper.tex:2\n\"We write $\\eps$ for the promise gap, a fraction of $m$.\"\n";

  test("kind: cited with NO meaning: is a structural ERROR", () => {
    const errs = errorsFor(repo(GOOD_MEANING));
    const hit = errs.find((e) => e.message.includes("meaning-missing"));
    expect(hit).toBeDefined();
    expect(hit!.structural).toBe(true);
  });

  test("kind: cited with a meaning but NO meaning anchor is a structural ERROR", () => {
    const errs = errorsFor(repo("Body with no anchor at all.\n", { meaning: "the relative promise gap" }));
    const hit = errs.find((e) => e.message.includes("meaning-anchor-missing"));
    expect(hit).toBeDefined();
    expect(hit!.structural).toBe(true);
  });

  test("a meaning anchor whose quote is not at the recorded locus is a structural ERROR", () => {
    const body = 'meaning-anchor:\nrefs/aav/paper.tex:1\n"We write $\\eps$ for the promise gap"\n';
    const errs = errorsFor(repo(body, { meaning: "the relative promise gap" }));
    const hit = errs.find((e) => e.message.includes("notation meaning"));
    expect(hit).toBeDefined();
    expect(hit!.structural).toBe(true);
  });

  test("a well-anchored cited meaning passes", () => {
    const errs = errorsFor(repo(GOOD_MEANING, { meaning: "the relative promise gap" }));
    expect(errs).toEqual([]);
  });

  test("a NON-cited notation shard needs no meaning anchor (nothing is claimed of a source)", () => {
    const errs = errorsFor(
      repo("Just prose.\n", { kind: "consensus", consensus: "campaign", source: "", sha256: "" }),
    );
    expect(errs.filter((e) => e.message.includes("meaning"))).toEqual([]);
  });
});

describe("Gate 1 — translation rows bind symbol and source (rk-5lzf B1)", () => {
  const PAYLOAD = "line one\nWe write $\\eps$ for the promise gap.\nA sentence with no symbol at all.\n";

  function repo(row: string, lockSourceId = "aav"): Record<string, string> {
    const fields = {
      id: "sym-gapfrac",
      term: "relative promise gap",
      shard_type: "notation",
      symbol: "\\gapfrac",
      class: "promise-gap",
      kind: "consensus",
      consensus: "campaign",
      status: "locked",
    };
    const shard = `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n${row}`;
    return {
      "definitions/notation/sym-gapfrac.md": shard,
      "refs/aav/paper.tex": PAYLOAD,
      "refs/manifest/sources.lock.json": JSON.stringify({
        files: [{ path: "aav/paper.tex", sha256: sha256Hex(new TextEncoder().encode(PAYLOAD)), source_id: lockSourceId }],
      }),
    };
  }

  function errorsFor(files: Record<string, string>) {
    return defsGate.run(snapshotFromFiles(files), DEFAULT_GATE_CONFIG).findings.filter((f) => f.severity === "ERROR");
  }

  test("a row whose quote does NOT contain theirSymbol is a structural ERROR", () => {
    const row = '- aav: \\eps @ refs/aav/paper.tex:3\n  "A sentence with no symbol at all."\n';
    const errs = errorsFor(repo(row));
    const hit = errs.find((e) => e.message.includes("translation-symbol-not-in-quote"));
    expect(hit).toBeDefined();
    expect(hit!.structural).toBe(true);
    expect(hit!.message).toContain("\\eps");
  });

  test("a row whose source-id does not own the anchored path is a structural ERROR", () => {
    const row = '- bmvz: \\eps @ refs/aav/paper.tex:2\n  "We write $\\eps$ for the promise gap."\n';
    const errs = errorsFor(repo(row));
    const hit = errs.find((e) => e.message.includes("translation-source-path-mismatch"));
    expect(hit).toBeDefined();
    expect(hit!.structural).toBe(true);
    expect(hit!.message).toContain("bmvz");
  });

  test("a lock entry with NO source_id cannot establish ownership — fail closed", () => {
    const files = repo('- aav: \\eps @ refs/aav/paper.tex:2\n  "We write $\\eps$ for the promise gap."\n');
    files["refs/manifest/sources.lock.json"] = JSON.stringify({
      files: [{ path: "aav/paper.tex", sha256: sha256Hex(new TextEncoder().encode(PAYLOAD)) }],
    });
    const errs = errorsFor(files);
    expect(errs.some((e) => e.message.includes("translation-source-path-mismatch"))).toBe(true);
  });

  test("a row that is byte-verified, symbol-bearing and source-owned passes", () => {
    const row = '- aav: \\eps @ refs/aav/paper.tex:2\n  "We write $\\eps$ for the promise gap."\n';
    expect(errorsFor(repo(row))).toEqual([]);
  });

  test("every notation provenance failure survives exploration (structural)", () => {
    const row = '- aav: \\eps @ refs/aav/paper.tex:3\n  "A sentence with no symbol at all."\n';
    const { findings } = defsGate.run(snapshotFromFiles(repo(row)), DEFAULT_GATE_CONFIG);
    const demoted = applyPhase(findings, "exploration");
    const hit = demoted.find((f) => f.message.includes("translation-symbol-not-in-quote"));
    expect(hit!.severity).toBe("ERROR");
  });
});
