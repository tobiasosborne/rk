// Unit tests for Gate 4 — provenance (src/gates/provenance.ts + provenance-parse.ts +
// provenance-md.ts + provenance-sha256.ts). The 13 corpus fixtures (corpus/provenance/
// provenance-01..13, exercised end-to-end by test/corpus.test.ts) cover the gate's black-box
// behavior; this file drives the pure gate directly against hand-built RepoSnapshots to isolate
// each contract check (docs/gate-contracts.md "Gate 4 — provenance") and mutation-prove the parts
// a fixture-only harness cannot reach — in particular check 5's per-repo `provenanceStatusTableFile`
// config parameter (the provenance-11 divergence), which `test/corpus.test.ts` cannot exercise
// non-default since it always runs every fixture through `DEFAULT_GATE_CONFIG` with no per-fixture
// override mechanism (see this file's "provenance-11" describe block for the direct proof against
// the real fixture tree).

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { provenanceGate } from "../../src/gates/provenance";
import { labelsOf, parseProvenanceRegistry, texLabels, type RegistryShard } from "../../src/gates/provenance-parse";
import { parseUnwired, splitSourceTokens, statusTableRows } from "../../src/gates/provenance-md";
import { sha256Bytes } from "../../src/refs/hash";
import { DEFAULT_GATE_CONFIG, mergeGateConfig } from "../../src/gates/config";
import { loadSnapshot } from "../../src/store/snapshot-load";
import type { RepoSnapshot } from "../../src/gates/snapshot";
import { snapshotFromFiles } from "../../src/gates/snapshot";

/** First-16 sha256 of a string's UTF-8 bytes — the "sha256-16" manifest convention. Byte-exact
 * with what the edge (src/store/snapshot-load.ts, via src/refs/hash.ts) computes for a UTF-8 text file. */
function sha16(s: string): string {
  return sha256Bytes(new TextEncoder().encode(s)).slice(0, 16);
}

/** Snapshot with edge-faithful SnapshotFacts (rk-399), built through the sanctioned builder
 * `snapshotFromFiles` (M0.3 round-3 landing-blocker 2: no hand-assembled facts — construction is
 * mechanically builder-only). The builder hashes every entry from its UTF-8 bytes and marks every
 * entry `tracked` by default; `opts` overrides those facts (a raw-byte hash for a binary payload,
 * an untracked-but-present path, a bespoke tracked set / dirs). This mirrors what `loadSnapshot`
 * supplies at the real edge — the pure gate reads facts, not text. */
function snapshot(
  entries: Record<string, string>,
  opts?: { sha256?: Record<string, string>; tracked?: string[]; dirs?: string[] },
): RepoSnapshot {
  return snapshotFromFiles(entries, {
    sha256: opts?.sha256,
    tracked: opts?.tracked,
    dirs: opts?.dirs,
  });
}

function shard(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\nbody\n`;
}

function run(entries: Record<string, string>, opts?: Parameters<typeof snapshot>[1]) {
  return provenanceGate.run(snapshot(entries, opts), DEFAULT_GATE_CONFIG);
}

function errors(result: ReturnType<typeof run>) {
  return result.findings.filter((f) => f.severity === "ERROR");
}
function warnings(result: ReturnType<typeof run>) {
  return result.findings.filter((f) => f.severity === "WARN");
}

// A minimal fully-consistent tree: one shard, anchored, covered, no status table — the baseline
// every check-specific test perturbs from.
function baseline(): Record<string, string> {
  return {
    "argument/lemmas/lem-x.md": shard({
      id: "lem-x",
      kind: "lemma",
      status: "stated",
      af: "none",
      provenance: "report lem:x",
    }),
    "report/sections/01_body.tex": "\\label{lem:x}\nSome text.\n",
    "report/PROVENANCE.md":
      "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n" +
      "| Report label | Source |\n|---|---|\n| lem:x | ORIGINAL |\n",
    "report/UNWIRED.md": "# UNWIRED\n```\n```\n",
  };
}

describe("provenanceGate — day-1 vacuity", () => {
  test("empty repo: zero findings, coverage 0/0 registry results, 0 claim rows, 0 tab:status rows", () => {
    const result = run({});
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([
      { gate: "provenance", checked: 0, total: 0, unit: "registry results, 0 frontmatter-invalid, 0 claim rows, 0 tab:status rows" },
    ]);
  });

  test("fully-consistent baseline tree: zero findings", () => {
    const result = run(baseline());
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([
      { gate: "provenance", checked: 1, total: 1, unit: "registry results, 0 frontmatter-invalid, 1 claim rows, 0 tab:status rows" },
    ]);
  });
});

describe("provenanceGate — rk-v18: malformed registry shards are a visible skip, never a shrunken denominator", () => {
  // Review finding 4: provenance-parse.ts used to `continue` past missing/unterminated
  // frontmatter with no finding and no count, while the coverage line derived BOTH its numerator
  // and denominator from the surviving parsed set — so one good shard + one malformed shard
  // reported a full "1/1" as if the malformed file never existed. The fix: denominator = every
  // registry file discovered under argument/lemmas/, numerator = the surviving parsed set, plus
  // an aggregate WARN naming every excluded path (Gate 2/linker still owns the frontmatter-
  // validity ERROR itself — this gate does not double-report that ERROR, only its own coverage).
  test("one good shard + one malformed shard: coverage is 1/2, not 1/1 — the lie this fixes", () => {
    const entries = baseline();
    entries["argument/lemmas/lem-bad.md"] = "not frontmatter at all\n";
    const result = run(entries);
    expect(result.coverage).toEqual([
      {
        gate: "provenance",
        checked: 1,
        total: 2,
        unit: "registry results, 1 frontmatter-invalid, 1 claim rows, 0 tab:status rows",
      },
    ]);
  });

  test("the exclusion is visible as an aggregate WARN naming the skipped path", () => {
    const entries = baseline();
    entries["argument/lemmas/lem-bad.md"] = "not frontmatter at all\n";
    const result = run(entries);
    const w = warnings(result).find((f) => f.message.includes("excluded from provenance re-parse"));
    expect(w).toBeDefined();
    expect(w!.message).toContain("argument/lemmas/lem-bad.md");
    expect(w!.message).toContain("1 registry file(s)");
  });

  test("no malformed shards: no skip WARN, coverage unit shows '0 frontmatter-invalid'", () => {
    const result = run(baseline());
    expect(warnings(result).some((f) => f.message.includes("excluded from provenance re-parse"))).toBe(false);
    expect(result.coverage[0]!.unit).toContain("0 frontmatter-invalid");
  });

  test("all-malformed registry: coverage 0/N, never a vacuous 0/0 hiding N real files", () => {
    const entries = baseline();
    delete entries["argument/lemmas/lem-x.md"];
    entries["argument/lemmas/lem-bad1.md"] = "no frontmatter\n";
    entries["argument/lemmas/lem-bad2.md"] = "---\nid: x\n"; // unterminated
    const result = run(entries);
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(2);
    const w = warnings(result).find((f) => f.message.includes("excluded from provenance re-parse"));
    expect(w!.message).toContain("argument/lemmas/lem-bad1.md");
    expect(w!.message).toContain("argument/lemmas/lem-bad2.md");
  });
});

describe("provenanceGate — rk-2t8: recursive argument/**/*.md discovery mirrors Gate 2 (linker)", () => {
  // Gate 2 (linker-parse.ts) discovers argument/**/*.md RECURSIVELY (rk-9pk), excluding
  // README.md/INDEX.md/DAG.md at any depth. Gate 4 (this gate) used to hardcode `argument/lemmas`
  // as its own registry root, so a root-level shard (the exact dogfood-1 shape: a north-star
  // theorem written at argument/*.md, not argument/lemmas/*.md) was INVISIBLE to provenance:
  // linker reported 1/1, provenance reported 0/0, and a status:open shard framed as proved in the
  // tab:status table produced NO OVERCLAIM ERROR — Gate 4's #1 guarded failure mode
  // (gate-contracts.md:875) silently defeated for any shard outside argument/lemmas/.
  test("root-level shard (argument/lem-root.md, NOT argument/lemmas/): OVERCLAIM is still caught", () => {
    const entries: Record<string, string> = {
      "argument/lem-root.md": shard({
        id: "lem-root",
        kind: "theorem",
        status: "open",
        af: "none",
        provenance: "report lem:root",
      }),
      "report/sections/01_body.tex": "\\label{lem:root}\nNorth-star theorem text.\n",
      "report/sections/13_discussion.tex":
        "\\begin{tabular}{ll}\n\\toprule\nResult & Status \\\\\n\\midrule\n" +
        "Foo \\Cref{lem:root} & proved \\\\\n\\bottomrule\n\\end{tabular}\n\\label{tab:status}\n",
      "report/PROVENANCE.md":
        "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n" +
        "| Report label | Source |\n|---|---|\n| lem:root | ORIGINAL |\n",
      "report/UNWIRED.md": "# UNWIRED\n```\n```\n",
    };
    const result = run(entries);
    const e = errors(result).find((f) => f.message.includes("OVERCLAIM lem-root"));
    expect(e).toBeDefined();
    expect(e!.path).toBe("argument/lem-root.md");
    // coverage must count the recursively-discovered shard, not report a vacuous 0/0
    expect(result.coverage[0]!.checked).toBe(1);
    expect(result.coverage[0]!.total).toBe(1);
  });

  test("a shard nested deeper than argument/lemmas/ (argument/lemmas/sub/lem-deep.md) is also discovered", () => {
    const entries = baseline();
    delete entries["argument/lemmas/lem-x.md"];
    entries["argument/lemmas/sub/lem-deep.md"] = shard({
      id: "lem-deep",
      kind: "lemma",
      status: "stated",
      af: "none",
      provenance: "report lem:x",
    });
    const result = run(entries);
    expect(result.coverage[0]!.checked).toBe(1);
    expect(result.coverage[0]!.total).toBe(1);
    expect(errors(result)).toEqual([]);
  });

  test("README.md/INDEX.md/DAG.md at any depth under argument/ are excluded from the registry universe (matches Gate 2's NON_SHARD_NAMES exactly)", () => {
    const entries = baseline();
    entries["argument/README.md"] = "not a shard\n";
    entries["argument/INDEX.md"] = "not a shard\n";
    entries["argument/DAG.md"] = "not a shard\n";
    entries["argument/lemmas/README.md"] = "not a shard\n";
    const result = run(entries);
    // Only the one real baseline shard is counted; the four non-shard names are invisible to
    // both the numerator and the denominator (never surfaced as frontmatter-invalid either).
    expect(result.coverage[0]!.checked).toBe(1);
    expect(result.coverage[0]!.total).toBe(1);
    expect(result.coverage[0]!.unit).toContain("0 frontmatter-invalid");
  });

  test("a non-.md file under argument/ is not a shard candidate", () => {
    const entries = baseline();
    entries["argument/notes.txt"] = "prose\n";
    const result = run(entries);
    expect(result.coverage[0]!.total).toBe(1);
  });
});

describe("provenanceGate — check 1: forward labels (dangling)", () => {
  test("provenance names a report label with no matching \\label{}: ERROR", () => {
    const entries = baseline();
    entries["argument/lemmas/lem-x.md"] = shard({
      id: "lem-x",
      kind: "lemma",
      status: "stated",
      af: "none",
      provenance: "report lem:dangling-target",
    });
    const result = run(entries);
    const e = errors(result).find((f) => f.message.includes("no \\label{lem:dangling-target} in sections/"));
    expect(e).toBeDefined();
    expect(e!.path).toBe("argument/lemmas/lem-x.md");
  });

  test("provenance-06 shape: a dangling forward label does NOT also fire the anchor check", () => {
    // labelsOf includes the explicit token UNCONDITIONALLY (even unresolved), so check 6 (anchor)
    // sees a non-empty label set and never fires — only check 1 (forward labels) ERRORs.
    const entries = baseline();
    entries["argument/lemmas/lem-x.md"] = shard({
      id: "lem-x",
      kind: "lemma",
      status: "stated",
      af: "none",
      provenance: "report lem:dangling-target",
    });
    const result = run(entries);
    expect(errors(result).some((f) => f.message.includes("dropped from the paper"))).toBe(false);
    expect(errors(result)).toHaveLength(1);
  });

  test("golden: label resolves, no forward-label finding", () => {
    const result = run(baseline());
    expect(errors(result).some((f) => f.message.includes("no \\label{"))).toBe(false);
  });
});

describe("provenanceGate — check 2: claim labels (dangling ledger row)", () => {
  test("a per-claim row's label with no matching \\label{}: ERROR, stale-ledger message", () => {
    const entries = baseline();
    entries["report/PROVENANCE.md"] =
      "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n" +
      "| Report label | Source |\n|---|---|\n| lem:x | ORIGINAL |\n| lem:gone | ORIGINAL |\n";
    const result = run(entries);
    const e = errors(result).find((f) => f.message.includes("lem:gone"));
    expect(e).toBeDefined();
    expect(e!.message).toContain("stale ledger row");
    expect(e!.path).toBe("report/PROVENANCE.md");
  });

  test("golden: every claim row's label resolves, no finding", () => {
    const result = run(baseline());
    expect(errors(result).some((f) => f.message.includes("stale ledger row"))).toBe(false);
  });
});

describe("provenanceGate — check 3: claim sources", () => {
  function withSourceCell(cell: string, extraRegistry = ""): Record<string, string> {
    const entries = baseline();
    entries["report/PROVENANCE.md"] =
      `# PROVENANCE\n\n## Ground-truth source registry\n\n${extraRegistry}## Per-claim ledger\n\n` +
      `| Report label | Source |\n|---|---|\n| lem:x | ${cell} |\n`;
    return entries;
  }

  test("unresolved ALL-CAPS key candidate: ERROR naming the token", () => {
    const result = run(withSourceCell("BAD-KEY"));
    const e = errors(result).find((f) => f.message.includes("Source key 'BAD-KEY' not in the source registry"));
    expect(e).toBeDefined();
    expect(e!.path).toBe("report/PROVENANCE.md");
  });

  test("SOURCE_ALLOW marker token (e.g. ORIGINAL): never flagged", () => {
    const result = run(withSourceCell("ORIGINAL"));
    expect(errors(result)).toEqual([]);
  });

  test("external citation+year pattern (ALL-CAPS + >=3 digits): treated as a citation, not flagged", () => {
    const result = run(withSourceCell("HOS2020"));
    expect(errors(result).some((f) => f.message.includes("Source key"))).toBe(false);
  });

  test("mixed-case / lowercase token (e.g. inline citation Kadison1952): never flagged, by design", () => {
    const result = run(withSourceCell("Kadison1952"));
    expect(errors(result).some((f) => f.message.includes("Source key"))).toBe(false);
  });

  test("token shorter than 2 chars: skipped, never flagged", () => {
    const result = run(withSourceCell("X"));
    expect(errors(result)).toEqual([]);
  });

  test("token already a known source-registry key: not flagged", () => {
    const registryRow = "| `R` | `refs/src-r/one.tex` | `8483115b57c040cb` | role |\n";
    const entries = withSourceCell("R", `| Key | path | sha | role |\n|---|---|---|---|\n${registryRow}`);
    entries["refs/src-r/one.tex"] = "payload r version 1\n";
    const result = run(entries);
    expect(errors(result).some((f) => f.message.includes("Source key"))).toBe(false);
  });
});

describe("provenanceGate — check 4: hash freshness", () => {
  function withSource(path: string, sha: string, content?: Record<string, string>) {
    const entries = baseline();
    entries["report/PROVENANCE.md"] =
      "# PROVENANCE\n\n## Ground-truth source registry\n\n" +
      `| Key | path | sha | role |\n|---|---|---|---|\n| \`Q\` | \`${path}\` | \`${sha}\` | role |\n\n` +
      "## Per-claim ledger\n\n| Report label | Source |\n|---|---|\n| lem:x | Q |\n";
    Object.assign(entries, content ?? {});
    return entries;
  }

  test("recorded sha matches actual content: no finding", () => {
    const content = "payload bytes\n";
    const sha = sha16(content);
    const result = run(withSource("refs/src-q/paper.tex", sha, { "refs/src-q/paper.tex": content }));
    expect(errors(result)).toEqual([]);
    expect(warnings(result).some((f) => f.message.includes("hash-verifiable"))).toBe(false);
  });

  test("recorded sha stale vs. edited content: ERROR 'file edited, hash stale'", () => {
    const content = "EDITED payload\n";
    const staleSha = sha16("ORIGINAL payload\n");
    const result = run(withSource("refs/src-q/paper.tex", staleSha, { "refs/src-q/paper.tex": content }));
    const e = errors(result).find((f) => f.message.includes("file edited, hash stale"));
    expect(e).toBeDefined();
    expect(e!.path).toBe("report/PROVENANCE.md");
  });

  test("malformed sha (parses as a hex run but not 16 chars long): ERROR, distinct message", () => {
    // The row-level parse regex only requires >=6 consecutive hex chars to recognize a "sha
    // cell" at all (check-provenance.py:179 `r"`?([0-9a-f]{6,})`?"`, ported unchanged) — a value
    // with NO 6-char hex run (e.g. "not-hex") fails that parse entirely and is reported as an
    // unparseable row instead (check 9), never reaching check 4's own 16-char format test. A
    // too-short-but-still-hex value like "abcdef" parses fine and lets check 4's stricter
    // SHA16_RE fire on its own.
    const result = run(withSource("refs/src-q/paper.tex", "abcdef", { "refs/src-q/paper.tex": "x\n" }));
    expect(errors(result).some((f) => f.message.includes("is not 16 lowercase hex"))).toBe(true);
  });

  test("absolute (non-refs/-relative) path: WARN, never ERROR", () => {
    const sha = sha16("irrelevant");
    const result = run(withSource("/home/researcher/paper.pdf", sha));
    expect(errors(result)).toEqual([]);
    expect(warnings(result).some((f) => f.message.includes("absolute path"))).toBe(true);
  });

  test("path absent from the snapshot: WARN 'not hash-verifiable', never ERROR", () => {
    const sha = sha16("irrelevant");
    const result = run(withSource("refs/src-q/paper.tex", sha));
    expect(errors(result)).toEqual([]);
    expect(warnings(result).some((f) => f.message.includes("not hash-verifiable"))).toBe(true);
  });

  test("duplicate key: BOTH rows are hashed independently (one stale, one fresh)", () => {
    const entries = baseline();
    const goodContent = "good\n";
    const goodSha = sha16(goodContent);
    const staleSha = sha16("something else\n");
    entries["report/PROVENANCE.md"] =
      "# PROVENANCE\n\n## Ground-truth source registry\n\n" +
      `| Key | path | sha | role |\n|---|---|---|---|\n` +
      `| \`R\` | \`refs/src-r/one.tex\` | \`${goodSha}\` | first |\n` +
      `| \`R\` | \`refs/src-r/two.tex\` | \`${staleSha}\` | reused |\n\n` +
      "## Per-claim ledger\n\n| Report label | Source |\n|---|---|\n| lem:x | R |\n";
    entries["refs/src-r/one.tex"] = goodContent;
    entries["refs/src-r/two.tex"] = "actually different content\n";
    const result = run(entries);
    expect(errors(result).some((f) => f.message.includes("file edited, hash stale"))).toBe(true);
    expect(warnings(result).some((f) => f.message.includes("defined twice"))).toBe(true);
  });

  // --- rk-399 (review finding 1) : tracking + byte-faithful facts drive ERROR vs WARN ---

  test("TRACKED source outside the loader include set, stale: ERROR (no untracked suffix)", () => {
    // `notes/data.txt` is under no INCLUDE_RULE, yet git-tracked. The old include-set proxy left
    // it absent from the snapshot => false WARN (review BLOCKER 1). The edge now hashes every
    // tracked path, so tracked+stale ⇒ ERROR (AISM parity, gate-contracts.md:743).
    const content = "EDITED bytes\n";
    const staleSha = sha16("ORIGINAL bytes\n");
    const result = run(withSource("notes/data.txt", staleSha, { "notes/data.txt": content }), {
      tracked: ["notes/data.txt"],
    });
    const e = errors(result).find((f) => f.message.includes("file edited, hash stale"));
    expect(e).toBeDefined();
    expect(e!.message).not.toContain("rk-stricter-intended");
  });

  test("present on disk but git-UNTRACKED (gitignored), stale: ERROR [rk-stricter-intended]", () => {
    // AISM WARNs an untracked stale payload; rk ERRORs it (stricter, documented in the contract).
    const content = "EDITED bytes\n";
    const staleSha = sha16("ORIGINAL bytes\n");
    const result = run(withSource("refs/src-q/paper.tex", staleSha, { "refs/src-q/paper.tex": content }), {
      tracked: [], // present (hashed) but not git-tracked
    });
    const e = errors(result).find((f) => f.message.includes("file edited, hash stale"));
    expect(e).toBeDefined();
    expect(e!.message).toContain("rk-stricter-intended");
  });

  test("binary / non-UTF-8 payload with a correct byte-faithful manifest hash: PASS", () => {
    // Bytes 0xff 0xfe ... are not valid UTF-8. The edge hashes RAW bytes; a UTF-8 round-trip (the
    // retired proxy) would have mangled them and false-ERRORed. The gate reads the byte-faithful
    // fact and passes (review finding 1 — binary-payload fixture).
    const rawBytes = new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x80, 0xa0]);
    const full = sha256Bytes(rawBytes);
    const result = run(
      withSource("refs/src-bin/blob.dat", full.slice(0, 16), { "refs/src-bin/blob.dat": "� lossy" }),
      { sha256: { "refs/src-bin/blob.dat": full } },
    );
    expect(errors(result)).toEqual([]);
    expect(warnings(result).some((f) => f.message.includes("hash-verifiable"))).toBe(false);
  });

  test("binary payload whose bytes no longer match the recorded hash: ERROR", () => {
    const recorded = sha256Bytes(new Uint8Array([0x00, 0x01, 0x02]));
    const actual = sha256Bytes(new Uint8Array([0xff, 0xee, 0xdd]));
    const result = run(
      withSource("refs/src-bin/blob.dat", recorded.slice(0, 16), { "refs/src-bin/blob.dat": "x" }),
      { sha256: { "refs/src-bin/blob.dat": actual } },
    );
    expect(errors(result).some((f) => f.message.includes("file edited, hash stale"))).toBe(true);
  });
});

describe("provenanceGate — check 5: status OVERCLAIM / underclaim", () => {
  function withStatusTable(status: string, tableStatusCell: string): Record<string, string> {
    const entries = baseline();
    entries["argument/lemmas/lem-x.md"] = shard({
      id: "lem-x",
      kind: "lemma",
      status,
      af: "none",
      provenance: "report lem:x",
    });
    entries["report/sections/13_discussion.tex"] =
      "\\begin{tabular}{ll}\n\\toprule\nResult & Status \\\\\n\\midrule\n" +
      `Foo \\Cref{lem:x} & ${tableStatusCell} \\\\\n\\bottomrule\n\\end{tabular}\n\\label{tab:status}\n`;
    return entries;
  }

  test("OVERCLAIM: status=open framed as proved -> ERROR", () => {
    const result = run(withStatusTable("open", "proved"));
    const e = errors(result).find((f) => f.message.includes("OVERCLAIM lem-x"));
    expect(e).toBeDefined();
    expect(e!.path).toBe("argument/lemmas/lem-x.md");
  });

  test("underclaim: status=proved framed only 'open' -> WARN, never ERROR", () => {
    const result = run(withStatusTable("proved", "open"));
    expect(errors(result)).toEqual([]);
    expect(warnings(result).some((f) => f.message.includes("frames it only 'open'"))).toBe(true);
  });

  test("golden: status=open correctly framed 'open' -> no finding", () => {
    const result = run(withStatusTable("open", "open"));
    expect(errors(result)).toEqual([]);
    expect(warnings(result).some((f) => f.message.includes("frames it only"))).toBe(false);
  });

  test("consistency form: a result Cref'd by two rows (one 'open', one not) is fine if ANY row is consistent", () => {
    const entries = baseline();
    entries["argument/lemmas/lem-x.md"] = shard({
      id: "lem-x",
      kind: "lemma",
      status: "open",
      af: "none",
      provenance: "report lem:x",
    });
    entries["report/sections/13_discussion.tex"] =
      "\\begin{tabular}{ll}\n\\toprule\nResult & Status \\\\\n\\midrule\n" +
      "A \\Cref{lem:x} & open \\\\\n" +
      "B \\Cref{lem:x} & proved, cond. \\\\\n" +
      "\\bottomrule\n\\end{tabular}\n\\label{tab:status}\n";
    const result = run(entries);
    expect(errors(result)).toEqual([]);
  });
});

describe("provenanceGate — check 6: anchor", () => {
  test("unanchored, not whitelisted: ERROR 'dropped from the paper'", () => {
    const entries: Record<string, string> = {
      "argument/lemmas/lem-dropped.md": shard({ id: "lem-dropped", kind: "lemma", status: "stated", af: "none" }),
      "report/PROVENANCE.md": "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n",
      "report/UNWIRED.md": "# UNWIRED\n```\n```\n",
    };
    const result = run(entries);
    const e = errors(result).find((f) => f.message.includes("dropped from the paper, or never wired in"));
    expect(e).toBeDefined();
    expect(e!.path).toBe("argument/lemmas/lem-dropped.md");
  });

  test("unanchored, whitelisted in UNWIRED.md: WARN, never ERROR", () => {
    const entries: Record<string, string> = {
      "argument/lemmas/lem-offtrack.md": shard({ id: "lem-offtrack", kind: "lemma", status: "stated", af: "none" }),
      "report/PROVENANCE.md": "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n",
      "report/UNWIRED.md": "# UNWIRED\n```\nlem-offtrack\n```\n",
    };
    const result = run(entries);
    expect(errors(result)).toEqual([]);
    expect(warnings(result).some((f) => f.message.includes("whitelisted in report/UNWIRED.md"))).toBe(true);
  });

  test("golden: anchored shard fires neither the ERROR nor the WARN", () => {
    const result = run(baseline());
    expect(errors(result).some((f) => f.message.includes("dropped from the paper"))).toBe(false);
    expect(warnings(result).some((f) => f.message.includes("whitelisted"))).toBe(false);
  });

  // ruling f (overturned in re-review): 100+ per-item whitelist advisory WARNs on a real tree
  // (AISM historical trees: 96/118/138) are an unusable flood under the contract's own >25
  // threshold. Apply the ratified aggregate-WARN pattern (ruling b, frontmatter-invalid): collapse
  // the whitelist WARNs into ONE aggregate carrying the count + ids. Non-whitelisted (real ERROR)
  // findings stay per-item; the denominator is unchanged.
  test("multiple whitelisted-unanchored shards collapse into ONE aggregate WARN, not N per-item WARNs (ruling f)", () => {
    const entries: Record<string, string> = {
      "argument/lemmas/lem-a.md": shard({ id: "lem-a", kind: "lemma", status: "stated", af: "none" }),
      "argument/lemmas/lem-b.md": shard({ id: "lem-b", kind: "lemma", status: "stated", af: "none" }),
      "argument/lemmas/lem-c.md": shard({ id: "lem-c", kind: "lemma", status: "stated", af: "none" }),
      "report/PROVENANCE.md": "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n",
      "report/UNWIRED.md": "# UNWIRED\n```\nlem-a\nlem-b\nlem-c\n```\n",
    };
    const result = run(entries);
    const wl = warnings(result).filter((f) => f.message.includes("whitelisted in report/UNWIRED.md"));
    expect(wl).toHaveLength(1); // ONE aggregate, not three per-item
    expect(wl[0]!.message).toContain("3"); // the count
    for (const id of ["lem-a", "lem-b", "lem-c"]) expect(wl[0]!.message).toContain(id);
    // Attributed to the first (sorted-by-id) shard's own path, mirroring ruling b's aggregate.
    expect(wl[0]!.path).toBe("argument/lemmas/lem-a.md");
    expect(errors(result)).toEqual([]);
  });

  test("a non-whitelisted unanchored shard stays a per-item ERROR even amid whitelisted ones (ruling f)", () => {
    const entries: Record<string, string> = {
      "argument/lemmas/lem-a.md": shard({ id: "lem-a", kind: "lemma", status: "stated", af: "none" }),
      "argument/lemmas/lem-real.md": shard({ id: "lem-real", kind: "lemma", status: "stated", af: "none" }),
      "report/PROVENANCE.md": "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n",
      "report/UNWIRED.md": "# UNWIRED\n```\nlem-a\n```\n",
    };
    const result = run(entries);
    // lem-real is NOT whitelisted -> per-item ERROR (unchanged); lem-a -> the aggregate WARN.
    const e = errors(result).filter((f) => f.message.includes("dropped from the paper, or never wired in"));
    expect(e).toHaveLength(1);
    expect(e[0]!.path).toBe("argument/lemmas/lem-real.md");
    expect(warnings(result).filter((f) => f.message.includes("whitelisted in report/UNWIRED.md"))).toHaveLength(1);
  });
});

describe("provenanceGate — check 7: reverse labels (orphan)", () => {
  test("a thm/lem/... labeled result with no registry backref: WARN, path is the defining .tex file", () => {
    const entries: Record<string, string> = {
      "report/sections/01_body.tex": "\\label{lem:orphan-label}\nA result with no registry backref.\n",
      "report/PROVENANCE.md": "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n",
      "report/UNWIRED.md": "# UNWIRED\n```\n```\n",
    };
    const result = run(entries);
    const w = warnings(result).find((f) => f.message.includes("no registry result backing it"));
    expect(w).toBeDefined();
    expect(w!.path).toBe("report/sections/01_body.tex");
  });

  test("a non-result-kind label prefix (e.g. fig:) is never flagged as an orphan", () => {
    const entries: Record<string, string> = {
      "report/sections/01_body.tex": "\\label{fig:diagram}\nA figure, not a result.\n",
      "report/PROVENANCE.md": "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n",
      "report/UNWIRED.md": "# UNWIRED\n```\n```\n",
    };
    const result = run(entries);
    expect(warnings(result).some((f) => f.message.includes("orphan"))).toBe(false);
  });

  test("golden: a result backed by a registry shard is not an orphan", () => {
    const result = run(baseline());
    expect(warnings(result).some((f) => f.message.includes("orphan"))).toBe(false);
  });
});

describe("provenanceGate — check 8: coverage", () => {
  test("report-facing shard with no per-claim row: WARN", () => {
    const entries: Record<string, string> = {
      "argument/lemmas/lem-uncovered.md": shard({
        id: "lem-uncovered",
        kind: "lemma",
        status: "stated",
        af: "none",
        provenance: "report lem:uncovered",
      }),
      "report/sections/01_body.tex": "\\label{lem:uncovered}\nSome text.\n",
      "report/PROVENANCE.md": "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n",
      "report/UNWIRED.md": "# UNWIRED\n```\n```\n",
    };
    const result = run(entries);
    const w = warnings(result).find((f) => f.message.includes("no per-claim PROVENANCE row"));
    expect(w).toBeDefined();
    expect(w!.path).toBe("argument/lemmas/lem-uncovered.md");
  });

  test("golden: a covered shard fires no coverage WARN", () => {
    const result = run(baseline());
    expect(warnings(result).some((f) => f.message.includes("no per-claim PROVENANCE row"))).toBe(false);
  });

  test("an unanchored shard (zero labels) is excluded from check 8 entirely", () => {
    const entries: Record<string, string> = {
      "argument/lemmas/lem-dropped.md": shard({ id: "lem-dropped", kind: "lemma", status: "stated", af: "none" }),
      "report/PROVENANCE.md": "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n",
      "report/UNWIRED.md": "# UNWIRED\n```\nlem-dropped\n```\n",
    };
    const result = run(entries);
    expect(warnings(result).some((f) => f.message.includes("no per-claim PROVENANCE row"))).toBe(false);
  });
});

describe("provenanceGate — check 9: parse integrity", () => {
  test("duplicate source key (different path/sha): WARN 'defined twice', pass verdict (never ERROR by itself)", () => {
    const entries = baseline();
    entries["report/PROVENANCE.md"] =
      "# PROVENANCE\n\n## Ground-truth source registry\n\n" +
      "| Key | path | sha | role |\n|---|---|---|---|\n" +
      "| `R` | `refs/src-r/one.tex` | `8483115b57c040cb` | first |\n" +
      "| `R` | `refs/src-r/two.tex` | `1605eec98cb0e770` | reused |\n\n" +
      "## Per-claim ledger\n\n| Report label | Source |\n|---|---|\n| lem:x | R |\n";
    const result = run(entries);
    expect(warnings(result).some((f) => f.message.includes("source key 'R' is defined twice"))).toBe(true);
  });

  test("malformed per-claim label (not label grammar): WARN, row skipped (not pushed as a claim row)", () => {
    const entries = baseline();
    entries["report/PROVENANCE.md"] =
      "# PROVENANCE\n\n## Ground-truth source registry\n\n## Per-claim ledger\n\n" +
      "| Report label | Source |\n|---|---|\n| not-a-label! | ORIGINAL |\n";
    const result = run(entries);
    expect(warnings(result).some((f) => f.message.includes("per-claim row label not a clean label"))).toBe(true);
  });

  test("unparseable source-registry row (no backtick-quoted key/path/sha): WARN, row dropped", () => {
    const entries = baseline();
    entries["report/PROVENANCE.md"] =
      "# PROVENANCE\n\n## Ground-truth source registry\n\n" +
      "| Key | path | sha | role |\n|---|---|---|---|\n| garbage row with no backticks | x | y | z |\n\n" +
      "## Per-claim ledger\n\n| Report label | Source |\n|---|---|\n| lem:x | ORIGINAL |\n";
    const result = run(entries);
    expect(warnings(result).some((f) => f.message.includes("unparseable source-registry row"))).toBe(true);
  });
});

describe("provenanceGate — coverage line", () => {
  test("tab:status row count is always shown, even at zero (silent-skip surface made loud)", () => {
    // provenance-13 shape: 13_discussion.tex present but has neither \label{tab:status} nor
    // \midrule -> statusTableRows returns [], and the coverage line must say '0 tab:status rows'
    // rather than omitting the count or folding it into a generic warning.
    const entries = baseline();
    entries["report/sections/13_discussion.tex"] = "This section discusses results informally.\n";
    const result = run(entries);
    expect(result.coverage[0]!.unit).toContain("0 tab:status rows");
    expect(result.findings).toEqual([]);
  });

  test("tab:status row count reflects a real parsed table", () => {
    const entries = baseline();
    entries["argument/lemmas/lem-x.md"] = shard({
      id: "lem-x",
      kind: "lemma",
      status: "open",
      af: "none",
      provenance: "report lem:x",
    });
    entries["report/sections/13_discussion.tex"] =
      "\\begin{tabular}{ll}\n\\toprule\nResult & Status \\\\\n\\midrule\n" +
      "Foo \\Cref{lem:x} & open \\\\\n\\bottomrule\n\\end{tabular}\n\\label{tab:status}\n";
    const result = run(entries);
    expect(result.coverage[0]!.unit).toContain("1 tab:status rows");
  });
});

describe("provenance-11: the config-parameter divergence (hardcoded-filename regression)", () => {
  // test/corpus.test.ts always runs every corpus fixture through DEFAULT_GATE_CONFIG uniformly —
  // it has no per-fixture GateConfig override mechanism, so it cannot itself exercise a config
  // value other than the default. This describe block loads the REAL provenance-11 fixture tree
  // (the ledger renamed to 14_discussion.tex, simulating a future rename beyond AISM's own
  // hardcoded-then-manually-fixed 13_discussion.tex) and proves the mechanism both ways, matching
  // corpus/provenance/provenance-11/expected.json's own validation note: "script-verified BOTH
  // ways (harness run with tab_status_file='13_discussion.tex' reproduces AISM's miss; with
  // '14_discussion.tex' reproduces rk's catch)".
  const FIXTURE_REPO = join(import.meta.dir, "..", "..", "corpus", "provenance", "provenance-11", "repo");

  test("with the byte-identical-to-AISM default (13_discussion.tex, absent here): OVERCLAIM is MISSED", () => {
    const snap = loadSnapshot(FIXTURE_REPO);
    const result = provenanceGate.run(snap, DEFAULT_GATE_CONFIG);
    expect(errors(result).some((f) => f.message.includes("OVERCLAIM"))).toBe(false);
  });

  test("with provenanceStatusTableFile reconfigured to 14_discussion.tex: OVERCLAIM is CAUGHT", () => {
    const snap = loadSnapshot(FIXTURE_REPO);
    const config = mergeGateConfig({ provenanceStatusTableFile: "report/sections/14_discussion.tex" });
    const result = provenanceGate.run(snap, config);
    const e = errors(result).find((f) => f.message.includes("OVERCLAIM lem-open-claim2"));
    expect(e).toBeDefined();
    expect(e!.path).toBe("argument/lemmas/lem-open-claim2.md");
  });
});

describe("provenance-parse helpers — direct unit tests", () => {
  test("parseProvenanceRegistry: id defaults to filename stem when 'id:' is absent (check-provenance.py:130)", () => {
    const snap = snapshot({
      "argument/lemmas/lem-noid.md": "---\nkind: lemma\nstatus: stated\naf: none\n---\nbody\n",
    });
    const { shards, skipped } = parseProvenanceRegistry(snap);
    expect(shards).toHaveLength(1);
    expect(shards[0]!.id).toBe("lem-noid");
    expect(skipped).toEqual([]);
  });

  test("parseProvenanceRegistry: missing/unterminated frontmatter excludes the shard from `shards` but names it in `skipped` (rk-v18 — never a bare drop)", () => {
    const snap = snapshot({ "argument/lemmas/lem-bad.md": "not frontmatter at all\n" });
    const { shards, skipped } = parseProvenanceRegistry(snap);
    expect(shards).toEqual([]);
    expect(skipped).toEqual(["argument/lemmas/lem-bad.md"]);
  });

  test("labelsOf: explicit report tokens are included UNCONDITIONALLY, even when unresolved", () => {
    const s: RegistryShard = { id: "lem-x", path: "argument/lemmas/lem-x.md", af: "none", provenance: "report lem:missing" };
    const tex = texLabels(snapshotFromFiles({}));
    expect(labelsOf(s, tex).has("lem:missing")) .toBe(true);
  });

  test("labelsOf: id-transform fallback only fires when the candidate label exists in texlabels", () => {
    const s: RegistryShard = { id: "lem-P-properties", path: "argument/lemmas/lem-P-properties.md", af: "none", provenance: "" };
    const withLabel = texLabels(snapshot({ "report/sections/01.tex": "\\label{lem:P-properties}\n" }));
    expect(labelsOf(s, withLabel).has("lem:P-properties")).toBe(true);
    const withoutLabel = texLabels(snapshotFromFiles({}));
    expect(labelsOf(s, withoutLabel).size).toBe(0);
  });

  test("texLabels: a \\label{} inside a %-comment does not count as live", () => {
    const tex = texLabels(snapshot({ "report/sections/01.tex": "% \\label{lem:commented-out}\nreal text\n" }));
    expect(tex.labels.has("lem:commented-out")).toBe(false);
  });

  test("texLabels: an escaped \\% does not start a comment", () => {
    const tex = texLabels(snapshot({ "report/sections/01.tex": "100\\% \\label{lem:visible}\n" }));
    expect(tex.labels.has("lem:visible")).toBe(true);
  });

  test("parseUnwired: reads ids only inside fenced blocks, ignores prose/comments", () => {
    const snap = snapshot({
      "report/UNWIRED.md": "# UNWIRED\nSome prose mentioning lem-not-a-real-entry.\n```\n# comment\nlem-a\n\nlem-b\n```\nmore prose\n",
    });
    expect(parseUnwired(snap)).toEqual(new Set(["lem-a", "lem-b"]));
  });

  test("splitSourceTokens: splits on whitespace/comma/semicolon/parens/pipe and strips backticks", () => {
    expect(splitSourceTokens("`HOS`; GHOST, (V) | ORIGINAL")).toEqual(["HOS", "GHOST", "V", "ORIGINAL"]);
  });

  test("statusTableRows: absent configured file returns [] silently", () => {
    expect(statusTableRows(snapshotFromFiles({}), "report/sections/13_discussion.tex")).toEqual([]);
  });

  test("statusTableRows: present but missing \\midrule/\\label{tab:status} returns [] silently", () => {
    const snap = snapshot({ "report/sections/13_discussion.tex": "no table markers here\n" });
    expect(statusTableRows(snap, "report/sections/13_discussion.tex")).toEqual([]);
  });

  test("statusTableRows: an unescaped '&' splits columns but an escaped '\\&' does not", () => {
    const snap = snapshot({
      "report/sections/13_discussion.tex":
        "\\midrule\nA \\& B \\Cref{lem:x} & open \\\\\n\\bottomrule\n\\label{tab:status}\n",
    });
    const rows = statusTableRows(snap, "report/sections/13_discussion.tex");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.statusCell).toBe("open");
    expect(rows[0]!.labels).toEqual(["lem:x"]);
  });
});
