// Gate 3 — refs. Contract: docs/gate-contracts.md "Gate 3 — refs"; corpus/refs/*'s 8 fixtures
// (refs-08 added by rk-6r3, M0.3 review finding 7: malformed non-object JSON externals).
//
// Two fixture-loading paths are used deliberately:
//  - "hand-built snapshot" tests construct a RepoSnapshot Map directly — these are the true unit
//    tests (extraction preference order, locus selection, skip classification, coverage split).
//  - the "corpus fixtures" describe block at the bottom loads each corpus/refs/<id>/repo/ tree
//    with a LOCAL, full-tree recursive reader defined in this file (`loadFullSnapshot`), not
//    src/gates/load.ts's `loadSnapshot`. This is intentional, not a style choice: `loadSnapshot`'s
//    INCLUDE_RULES currently has no rule for generic `refs/<source-id>/*` payload files (only
//    `refs/manifest/*`), so `test/corpus.test.ts` (which uses `loadSnapshot`) silently drops
//    refs-02/refs-03/refs-07's `refs/src-*/paper.md` payload from the snapshot and misreports
//    those three fixtures. That gap lives in a shared EDGE file outside this gate's write scope
//    (src/gates/refs.ts + this file) — see the session report for the full writeup. This file's
//    own fixture tests route around it so refs.ts's correctness is verified 8/8 regardless of
//    when/whether that shared-file gap gets fixed.

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  classifyExternal,
  extractQuote,
  longestMatchingRunLength,
  refsFilePath,
  refsGate,
} from "../../src/gates/refs";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";
import { formatCoverageLine } from "../../src/gates/framework";
import { unmatchedExpectations } from "../../src/gates/subset-match";
import type { ExpectedFinding } from "../../src/gates/subset-match";
import type { RepoSnapshot } from "../../src/gates/snapshot";
import { snapshotFromFiles } from "../../src/gates/snapshot";

function snap(entries: Record<string, string>): RepoSnapshot {
  return snapshotFromFiles(entries);
}

// ---------------------------------------------------------------------------------------------
// extractQuote — check-refs.py:63-74 port. Extraction preference order.
// ---------------------------------------------------------------------------------------------

describe("extractQuote — extraction preference order", () => {
  test("prefers the VERBATIM-anchored quote over an earlier, longer bare quote", () => {
    const src = '"a much longer bare quoted run that has nothing to do with it" then VERBATIM "short one"';
    expect(extractQuote(src)).toBe("short one");
  });

  test("VERBATIM quote may span newlines (dotall, mirrors re.S)", () => {
    const src = 'ref VERBATIM "line one\nline two" tail';
    expect(extractQuote(src)).toBe("line one\nline two");
  });

  test("falls back to the longest double-quoted run when no VERBATIM tag is present", () => {
    const src = '"short" and "the longest quoted run here" and "medium one"';
    expect(extractQuote(src)).toBe("the longest quoted run here");
  });

  test("ties on length keep the FIRST candidate (mirrors Python max's first-wins tie-break)", () => {
    const src = '"alpha" and "gamma"'; // both exactly 5 chars
    expect(extractQuote(src)).toBe("alpha");
  });

  test("fallback ignores whitespace-only quoted runs", () => {
    const src = '"   " and "the only real candidate"';
    expect(extractQuote(src)).toBe("the only real candidate");
  });

  test("returns null when source has no double-quoted text at all", () => {
    expect(extractQuote("no quotes anywhere in this freeform text")).toBeNull();
  });

  test("returns null when every quoted run is whitespace-only", () => {
    expect(extractQuote('"   " "\t"')).toBeNull();
  });

  test("an empty VERBATIM-anchored quote is returned as '' (not null) — matches Python's falsy-but-not-None quote", () => {
    expect(extractQuote('VERBATIM ""')).toBe("");
  });
});

// ---------------------------------------------------------------------------------------------
// refsFilePath — locus -> path extraction (check-refs.py:101-105's path half)
// ---------------------------------------------------------------------------------------------

describe("refsFilePath — locus to payload-path extraction", () => {
  test("strips a single trailing line number", () => {
    expect(refsFilePath("refs/src-x/paper.md:5")).toBe("refs/src-x/paper.md");
  });

  test("strips a trailing line range", () => {
    expect(refsFilePath("refs/kitaev-2405.02434/approximate_algebras.tex:503-532")).toBe(
      "refs/kitaev-2405.02434/approximate_algebras.tex",
    );
  });

  test("strips a trailing comma-separated line list", () => {
    expect(refsFilePath("refs/hos/joa-m.md:10,12,15")).toBe("refs/hos/joa-m.md");
  });

  test("a locus with no line suffix is returned unchanged", () => {
    expect(refsFilePath("refs/src-x/paper.md")).toBe("refs/src-x/paper.md");
  });
});

// ---------------------------------------------------------------------------------------------
// classifyExternal — skip classification: skip_import vs skip_noquote, never merged/silent;
// locus selection takes only the first refs/ match.
// ---------------------------------------------------------------------------------------------

describe("classifyExternal — skip classification and locus selection", () => {
  test("proofs/ reference with no refs/ locus classifies skip_import", () => {
    const r = classifyExternal("Imports proofs/lem-other-validated; no new quote needed.");
    expect(r.verdict).toBe("skip_import");
  });

  test("a refs/ locus AND a quote classifies 'quote' (proceeds to byte-verification)", () => {
    const r = classifyExternal('See refs/src-x/paper.md:1. VERBATIM "some text" here.');
    expect(r.verdict).toBe("quote");
    expect(r.refsLocus).toBe("refs/src-x/paper.md:1");
    expect(r.quote).toBe("some text");
  });

  test("no refs/ locus and no proofs/ reference classifies skip_noquote, reason 'no refs/ locus'", () => {
    const r = classifyExternal("Numerical evidence only, nothing to cite here.");
    expect(r.verdict).toBe("skip_noquote");
    expect(r.refsLocus).toBeNull();
  });

  test("a refs/ locus but no quoted text classifies skip_noquote (quote is null)", () => {
    const r = classifyExternal("See refs/src-x/paper.md:1 for context, no quote given.");
    expect(r.verdict).toBe("skip_noquote");
    expect(r.refsLocus).toBe("refs/src-x/paper.md:1");
    expect(r.quote).toBeNull();
  });

  test("skip_import and skip_noquote are never merged: a proofs/ ref WITH a refs/ locus is 'quote', not skip_import", () => {
    const r = classifyExternal('Imports proofs/lem-other AND cites refs/src-x/paper.md:1. VERBATIM "text" here.');
    expect(r.verdict).toBe("quote");
  });

  test("locus selection: two refs/ loci in one source string — only the FIRST is selected", () => {
    const r = classifyExternal(
      'Primary: refs/src-first/paper.md:1. Secondary (ignored): refs/src-second/other.md:9. VERBATIM "quoted text" here.',
    );
    expect(r.refsLocus).toBe("refs/src-first/paper.md:1");
  });
});

// ---------------------------------------------------------------------------------------------
// longestMatchingRunLength — MESSAGE-ONLY diagnostic. Never wired to the verdict (see refsGate
// tests below for the mutation-sensitive proof that the gate's PASS/FAIL never uses this value).
// ---------------------------------------------------------------------------------------------

describe("longestMatchingRunLength — message-only n/m diagnostic", () => {
  test("returns 0 when the quote itself is shorter than minRun", () => {
    expect(longestMatchingRunLength("short", "short text present", 40)).toBe(0);
  });

  test("returns the full quote length when the whole quote is present and >= minRun", () => {
    const qn = "a".repeat(45);
    expect(longestMatchingRunLength(qn, `xx${qn}xx`, 40)).toBe(45);
  });

  test("returns the longest partial run when the whole quote does not match", () => {
    const tn = "the quick brown fox jumps over the extremely lazy dog and keeps running for a very long time";
    // qn shares a long prefix with tn's "the quick brown fox jumps over the" run, then diverges.
    const qn = "the quick brown fox jumps over the extremely lazy cat and never stops at all";
    const run = longestMatchingRunLength(qn, tn, 40);
    expect(run).toBeGreaterThanOrEqual(40);
    expect(tn.includes(qn.slice(0, run))).toBe(true);
  });

  test("returns 0 when no run of at least minRun matches anywhere", () => {
    const qn = "z".repeat(50);
    expect(longestMatchingRunLength(qn, "completely unrelated text of no relevance", 40)).toBe(0);
  });

  test("boundary: a 39-char shared run does not count, a 40-char shared run does", () => {
    const shared39 = "x".repeat(39);
    const shared40 = "x".repeat(40);
    expect(longestMatchingRunLength(`${shared39}Q`, `prefix ${shared39} suffix`, 40)).toBe(0);
    expect(longestMatchingRunLength(`${shared40}Q`, `prefix ${shared40} suffix`, 40)).toBe(40);
  });
});

// ---------------------------------------------------------------------------------------------
// refsGate — end-to-end checks 1-5 against hand-built snapshots, mirroring each corpus fixture
// class plus the split-coverage and no-laundering-channel proofs.
// ---------------------------------------------------------------------------------------------

describe("refsGate — checks 1-5", () => {
  test("check 2 (payload existence): absent refs/ payload is FAIL 'ABSENT', never a skip (aism-dbq)", () => {
    const s = snap({
      "proofs/lem-alpha/externals/GT-1.json": JSON.stringify({
        name: "GT-1",
        source: 'Claim depends on refs/src-alpha/paper.md:5. VERBATIM "some quoted text" is relied on.',
      }),
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).toContain("ABSENT");
    expect(result.findings[0]!.path).toBe("proofs/lem-alpha/externals/GT-1.json");
  });

  test("check 4, >=40 char fabrication with no matching run: FAIL 'NOT found', no run-length in the message", () => {
    const s = snap({
      "proofs/lem-x/externals/GT-x-1.json": JSON.stringify({
        name: "GT-x-1",
        source: 'See refs/src-x/paper.md:1. VERBATIM "This sentence was never written anywhere in the source at all" here.',
      }),
      "refs/src-x/paper.md": "The always-tight hulls are disjoint whenever the L1 distance is strictly positive.",
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).toContain("NOT found");
    expect(result.findings[0]!.message).not.toContain("best matched run");
  });

  test("check 4, <40 char fabrication: FAIL 'NOT found' (exact-match-required branch)", () => {
    const s = snap({
      "proofs/lem-y/externals/GT-y-1.json": JSON.stringify({
        name: "GT-y-1",
        source: 'See refs/src-y/paper.md:1. VERBATIM "totally invented short quote" here.',
      }),
      "refs/src-y/paper.md": "The always-tight hulls are disjoint whenever the L1 distance is strictly positive.",
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.message).toContain("NOT found");
  });

  test("check 1a, IMPORT golden case: skip_import, zero findings, exit clean", () => {
    const s = snap({
      "proofs/lem-z/externals/GT-z-1.json": JSON.stringify({
        name: "GT-z-1",
        source: "Imports the already-validated result at proofs/lem-other-validated; no new quote needed.",
      }),
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(0);
  });

  test("check 1b, no-quote golden case: WARN skip_noquote, never blocks the gate", () => {
    const s = snap({
      "proofs/lem-w/externals/GT-w-1.json": JSON.stringify({
        name: "GT-w-1",
        source: "Numerical evidence only; no refs/ locus or quoted text is claimed here.",
      }),
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("WARN");
    const hasError = result.findings.some((f) => f.severity === "ERROR");
    expect(hasError).toBe(false);
  });

  test("check 5: unparseable external JSON is a hard FAIL, never a skip", () => {
    const s = snap({
      "proofs/lem-v/externals/GT-v-1.json": '{"name": "GT-v-1", "source": "truncated and invalid json',
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).toContain("unparseable JSON");
  });

  test("check 5b (rk-6r3, M0.3 review finding 7): a syntactically-valid `null` external is a hard FAIL 'malformed external', never a throw", () => {
    const s = snap({
      "proofs/lem-n/externals/GT-n-null.json": "null",
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).toContain("malformed external");
    expect(result.findings[0]!.message).toContain("null");
  });

  test("check 5b: a JSON array external is a hard FAIL 'malformed external', never a throw", () => {
    const s = snap({
      "proofs/lem-n/externals/GT-n-array.json": "[1, 2]",
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).toContain("malformed external");
    expect(result.findings[0]!.message).toContain("array");
  });

  test("check 5b: a bare JSON string external is a hard FAIL 'malformed external', never a throw", () => {
    const s = snap({
      "proofs/lem-n/externals/GT-n-string.json": '"just a string"',
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).toContain("malformed external");
    expect(result.findings[0]!.message).toContain("string");
  });

  test("check 5b: coverage still counts a malformed external in `total`/`failed`, never a silent drop", () => {
    const s = snap({
      "proofs/lem-n/externals/GT-n-null.json": "null",
      "proofs/lem-n/externals/GT-n-1.json": JSON.stringify({
        name: "GT-n-1",
        source: "Imports the already-validated result at proofs/lem-other-validated; no new quote needed.",
      }),
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.coverage).toHaveLength(1);
    expect(formatCoverageLine(result.coverage[0]!)).toBe(
      "checked refs: 0/2 externals byte-verified, 1 failed, 1 import-skipped, 0 no-quote-skipped",
    );
  });

  test("check 4, ruling #3: a >=40-char verbatim core wrapped in paraphrase FAILs whole-quote-match with the n/m diagnostic", () => {
    const s = snap({
      "proofs/lem-p/externals/GT-p-1.json": JSON.stringify({
        name: "GT-p-1",
        source:
          'See refs/src-p/paper.md:1. VERBATIM "In our own words, the convex hull of displacement vectors under ' +
          'the exposedness LP at u is what we later call the actor hull." for the definition.',
      }),
      "refs/src-p/paper.md":
        "We now define K_T(u) as the convex hull of displacement vectors under the exposedness LP at u, " +
        "restricted to the tight constraint family T(u).",
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).toMatch(/best matched run: \d+\/\d+ chars/);
  });

  test("golden PASS: whole normalized quote matches -> zero findings, exit clean", () => {
    const s = snap({
      "proofs/lem-g/externals/GT-g-1.json": JSON.stringify({
        name: "GT-g-1",
        source: 'See refs/src-g/paper.md:1. VERBATIM "the map is idempotent on X" here.',
      }),
      "refs/src-g/paper.md": "Recall that the map is idempotent on X, by the earlier lemma.",
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(0);
  });

  test("empty-normalized-quote guard propagates: a quote of pure asterisks never matches, FAILs generic (no run-length)", () => {
    const s = snap({
      "proofs/lem-e/externals/GT-e-1.json": JSON.stringify({
        name: "GT-e-1",
        source: 'See refs/src-e/paper.md:1. VERBATIM "***" here.',
      }),
      "refs/src-e/paper.md": "Any arbitrary source text at all, long enough to contain nothing meaningful.",
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).not.toContain("best matched run");
  });

  test("locus selection at gate level: a second, unresolvable refs/ locus in the source is never consulted", () => {
    const s = snap({
      "proofs/lem-f/externals/GT-f-1.json": JSON.stringify({
        name: "GT-f-1",
        source:
          'Primary: refs/src-first/paper.md:1. Also mentions refs/does-not-exist/anywhere.md:9. ' +
          'VERBATIM "the map is idempotent on X" here.',
      }),
      "refs/src-first/paper.md": "Recall that the map is idempotent on X, by the earlier lemma.",
      // note: refs/does-not-exist/anywhere.md is deliberately absent from the snapshot.
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.findings).toHaveLength(0); // PASS via the FIRST locus; the absent second locus is never checked
  });
});

// ---------------------------------------------------------------------------------------------
// Coverage line — the four-way split (checked/total, failed, import-skipped, no-quote-skipped)
// must never collapse two skip reasons into one number (Gate 3 Divergences, message-only).
// ---------------------------------------------------------------------------------------------

describe("refsGate — coverage line (four-way split, never merged)", () => {
  test("empty repo (day-1 state): 0/0, all-zero breakdown, still emitted (never a silent skip)", () => {
    const result = refsGate.run(snap({}), DEFAULT_GATE_CONFIG);
    expect(result.coverage).toHaveLength(1);
    expect(formatCoverageLine(result.coverage[0]!)).toBe(
      "checked refs: 0/0 externals byte-verified, 0 failed, 0 import-skipped, 0 no-quote-skipped",
    );
  });

  test("one external of each of the four verdict classes: every count is independently visible", () => {
    const s = snap({
      "proofs/ws/externals/pass.json": JSON.stringify({
        name: "pass",
        source: 'See refs/src/paper.md:1. VERBATIM "the map is idempotent on X" here.',
      }),
      "refs/src/paper.md": "Recall that the map is idempotent on X, by the earlier lemma.",
      "proofs/ws/externals/fail.json": JSON.stringify({
        name: "fail",
        source: 'See refs/src/paper.md:1. VERBATIM "totally invented short quote" here.',
      }),
      "proofs/ws/externals/import.json": JSON.stringify({
        name: "import",
        source: "Imports proofs/lem-other-validated; no new quote needed.",
      }),
      "proofs/ws/externals/noquote.json": JSON.stringify({
        name: "noquote",
        source: "Numerical evidence only, nothing to cite here.",
      }),
    });
    const result = refsGate.run(s, DEFAULT_GATE_CONFIG);
    expect(result.coverage).toHaveLength(1);
    const c = result.coverage[0]!;
    expect(c.checked).toBe(1); // exactly one PASS
    expect(c.total).toBe(4); // all four externals counted
    expect(formatCoverageLine(c)).toBe(
      "checked refs: 1/4 externals byte-verified, 1 failed, 1 import-skipped, 1 no-quote-skipped",
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Corpus fixtures — corpus/refs/refs-01..07, loaded directly (see file header: this bypasses
// src/gates/load.ts's current refs/<source-id>/* payload gap so refs.ts's own correctness is
// verified 7/7 independent of that shared-file issue).
// ---------------------------------------------------------------------------------------------

function loadFullSnapshot(root: string): RepoSnapshot {
  const out = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        walk(abs);
      } else {
        out.set(relative(root, abs).split(sep).join("/"), readFileSync(abs, "utf8"));
      }
    }
  };
  walk(root);
  return snapshotFromFiles(out);
}

interface ExpectedJson {
  gate: string;
  verdict: "pass" | "fail";
  findings: ExpectedFinding[];
  exit_code: number;
}

describe("corpus fixtures — refs-01..08 (direct-load)", () => {
  const CORPUS_REFS = join(import.meta.dir, "..", "..", "corpus", "refs");
  const FIXTURE_IDS = [
    "refs-01",
    "refs-02",
    "refs-03",
    "refs-04",
    "refs-05",
    "refs-06",
    "refs-07",
    "refs-08",
  ];

  for (const id of FIXTURE_IDS) {
    test(id, () => {
      const dir = join(CORPUS_REFS, id);
      const expected: ExpectedJson = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8"));
      const snapshot = loadFullSnapshot(join(dir, "repo"));
      const result = refsGate.run(snapshot, DEFAULT_GATE_CONFIG);

      const missing = unmatchedExpectations(result.findings, expected.findings);
      expect(missing).toEqual([]);

      const hasError = result.findings.some((f) => f.severity === "ERROR");
      expect(hasError).toBe(expected.verdict === "fail");
      expect(hasError ? 1 : 0).toBe(expected.exit_code);
    });
  }
});
