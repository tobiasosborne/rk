// Regression test for M2 boundary review follow-up 7 (bead rk-d2v): src/store/snapshot-load.ts
// gained a one-level `.rk/` include rule (M2.6) so freshnessGate (Gate 7) can read
// `.rk/generated.json`. The bead's premise was "current gate consumers are prefix-scoped so
// nothing appears affected" — this test PROVES that mechanically rather than trusting the prose,
// using the same pure `snapshotFromFiles` builder every gate unit test in test/gates/ already
// uses (CLAUDE.md L3: pure core, no fs).
//
// IMPORTANT FINDING (see the second describe block below): the premise is no longer fully true.
// M3.7/M3.8 wired `linkerGate` (Gate 2) to ALSO read a `.rk/` file directly — `.rk/l5-verdicts.jsonl`
// (src/gates/linker-l5.ts's `checkL5Promotion`, Check 14) — deliberately reusing the SAME M2.6
// one-level `.rk/` include mechanism this bead is about ("`.rk/l5-verdicts.jsonl` is read straight
// off `snapshot`'s already-loaded text map ... the exact same mechanism src/gates/freshness.ts
// already relies on for `.rk/generated.json`", linker-l5.ts's own header comment). This is NOT a
// bug — it is presence-conditional, documented, and already reviewed as its own M3.8 deliverable —
// but it means "nothing besides freshness reads `.rk/`" is now false for one of the seven prior
// gates. This test pins BOTH facts precisely: the six gates that truly have zero `.rk/`
// dependency, and linker's narrowly-scoped, single-named-file exception.

import { describe, expect, test } from "bun:test";
import { mergeGateConfig } from "../../src/gates/config";
import { snapshotFromFiles } from "../../src/gates/snapshot";
// Deliberately import each gate directly from its OWN module rather than through the shared
// `GATES` registry singleton (src/gates/index.ts). test/cli-check.test.ts's last test
// (`mock.module("../src/gates/index", ...)`) patches that module's live binding for the rest of
// the whole `bun test` process with no restore -- by its own comment, safe only for readers
// WITHIN that one file, run last there. This file is discovered later in the suite (test/store/,
// after top-level test/*.ts), so a static `import { GATES } from "../../src/gates/index"` here
// observes the POISONED post-mock value process-wide (verified: it silently loses "linker" and
// gains a "defs" whose `.run` unconditionally throws). Importing the real per-gate exports
// directly sidesteps that shared, mutable singleton entirely -- these modules are never touched
// by that mock.
import { configGate } from "../../src/gates/config";
import { defsGate } from "../../src/gates/defs";
import { refsGate } from "../../src/gates/refs";
import { linkerGate } from "../../src/gates/linker";
import { runsGate } from "../../src/gates/runs";
import { provenanceGate } from "../../src/gates/provenance";
import { shardsGate } from "../../src/gates/shards";
import type { Gate } from "../../src/gates/framework";

/** The seven gates that existed BEFORE M2.6 added the synthetic eighth (freshness) — the exact
 * "seven prior gates" the bead names, in src/gates/index.ts's own GATES composition order. */
const PRIOR_GATES: readonly Gate[] = [configGate, defsGate, refsGate, linkerGate, runsGate, provenanceGate, shardsGate];

/** Of the seven, the six with NO direct `.rk/` snapshot read at all — every OTHER reference to
 * ".rk/config.json" in these gates' own source (config.ts, shards.ts, phase.ts) is a FINDING
 * MESSAGE string pointing a user at the file, never a `snapshot.get`/prefix scan; GateConfig
 * itself already arrives pre-parsed from the edge (src/store/config-load.ts), never read from the
 * snapshot text map. Verified by `grep -n "snapshot.get(\".rk" src/gates/*.ts` during this WP's
 * investigation: linker.ts is the only match outside freshness.ts. */
const RK_AGNOSTIC_GATES: readonly Gate[] = [configGate, defsGate, refsGate, runsGate, provenanceGate, shardsGate];

/** One representative repo tree touching every prefix a non-freshness gate reads: definitions/
 * (defs), argument/lemmas (linker + provenance), proofs/ + refs-claim externals (refs), runs/ +
 * root INDEX.md (runs), report/ (provenance + shards). Content is drawn verbatim from real corpus
 * fixtures (corpus/defs/defs-02, corpus/provenance/provenance-01, corpus/refs/refs-01,
 * corpus/runs/runs-01) so the tree exercises genuine gate logic (a real per-line frontmatter
 * ERROR, a real OVERCLAIM, real ABSENT-externals ERRORs) rather than a content-free scaffold —
 * deliberately NOT an "everything passes" tree, since a stronger invariant proof compares
 * non-empty findings/coverage across both variants, not just a trivial 0/0 day-1 pass. Whether
 * this tree's gates individually PASS or FAIL is irrelevant to what this test asserts: it is
 * about A-vs-B agreement, never about gate correctness (that is corpus/'s job). The single lemma
 * shard's `status: open` is deliberate — neither "stated" nor "proved-mod-audit", so it is a
 * legitimate case for `checkL5Promotion` to skip entirely regardless of L5-store presence,
 * isolating the ONE fact the second describe block below is about: presence alone (not this
 * lemma's status) is what flips linker's coverage line.
 */
const REPO_FILES: Record<string, string> = {
  // Gate 1 (defs) — corpus/defs/defs-02: a per-line frontmatter ERROR (no ':' on one line).
  "definitions/def-bad-line.md": `---
id: def-bad-line
term: bad line term
this line has no colon in it at all
kind: original
status: locked
consensus: team agreed 2026-07-02
---

**Bad line term.** A definition whose frontmatter block contains one line with no \`:\`
separator, testing check-defs.py:45-46's per-line ERROR.
`,

  // Gate 2 (linker) + Gate 4 (provenance) — corpus/provenance/provenance-01: an OVERCLAIM (status
  // 'open' but the report's tab:status marks the corresponding claim 'proved').
  "argument/lemmas/lem-open-claim.md": `---
id: lem-open-claim
kind: lemma
status: open
af: none
provenance: report lem:open-claim
---

Registry shard \`lem-open-claim\` for a provenance-gate fixture.
`,

  // Gate 6 (shards) scaffold + Gate 4 (provenance) inputs, corpus/provenance/provenance-01 +
  // corpus/shards/shards-01 shapes, condensed.
  "report/main.tex": "\\documentclass{article}\n\\begin{document}\n\\include{sections/01_body}\n\\include{sections/13_discussion}\n\\end{document}\n",
  "report/README.md": "# report/ map\n\n- `report/sections/01_body.tex` (`TEST-01-BODY`)\n- `report/sections/13_discussion.tex` (`TEST-02-DISCUSSION`)\n",
  "report/SHARD_CATALOG.md": "# SHARD_CATALOG\n\n## TEST-01-BODY\n\nFile: report/sections/01_body.tex\nTitle: Body\nKeywords: body\n\nBody summary.\n\n## TEST-02-DISCUSSION\n\nFile: report/sections/13_discussion.tex\nTitle: Discussion\nKeywords: discussion\n\nDiscussion summary.\n",
  "report/PROVENANCE.md": `# PROVENANCE

## Ground-truth source registry

## Per-claim ledger

| Report label | Source |
|---|---|
`,
  "report/UNWIRED.md": "# UNWIRED\n```\n```\n",
  "report/sections/01_body.tex": "% SHARD-ID: TEST-01-BODY\n% SHARD-TITLE: Body\n% SHARD-KEYWORDS: body\n% SHARD-SUMMARY: Body summary.\n\\label{lem:open-claim}\nSome theorem text.\n",
  "report/sections/13_discussion.tex": "% SHARD-ID: TEST-02-DISCUSSION\n% SHARD-TITLE: Discussion\n% SHARD-KEYWORDS: discussion\n% SHARD-SUMMARY: Discussion summary.\n\\begin{table}\n\\begin{tabular}{ll}\n\\toprule\nResult & Status \\\\\n\\midrule\nFoo bar \\Cref{lem:open-claim} & proved \\\\\n\\bottomrule\n\\end{tabular}\n\\label{tab:status}\n\\end{table}\n",

  // Gate 3 (refs) — corpus/refs/refs-01: three claimed externals, all with locally-ABSENT
  // refs/ payloads (the "19/19 false-green" regression probe -- must all FAIL, never skip).
  "proofs/lem-alpha/externals/GT-alpha-1.json": `{
  "name": "GT-alpha-1",
  "source": "Claim depends on refs/src-alpha/paper.md:5. VERBATIM \\"some verbatim quoted text asserted here\\" is what the argument relies on."
}
`,
  "proofs/lem-alpha/externals/GT-alpha-2.json": `{
  "name": "GT-alpha-2",
  "source": "Claim depends on refs/src-beta/notes.md:10-12. VERBATIM \\"some verbatim quoted text asserted here\\" is what the argument relies on."
}
`,
  "proofs/lem-beta/externals/GT-beta-1.json": `{
  "name": "GT-beta-1",
  "source": "Claim depends on refs/src-gamma/book.txt:200. VERBATIM \\"some verbatim quoted text asserted here\\" is what the argument relies on."
}
`,

  // Gate 5 (runs) — corpus/runs/runs-01: an orphan bundle (not mentioned in root INDEX.md).
  "INDEX.md": "# INDEX\n\nNo mention of the orphan bundle anywhere in this file.\n",
  "runs/2026-07-15-orphan-example/README.md": `# 2026-07-15-orphan-example

**Hypothesis.** A test hypothesis for the 2026-07-15-orphan-example run bundle.

**Command.** \`python3 scripts/example.py --seed 1 --out 2026-07-15-orphan-example/\`

**Finding.** The headline finding, with honest scope limits noted.

**Invariant.** A checkable invariant / known-value cross-check confirms the numbers above.

**Next.** Next steps for this line of numerical evidence.
`,
};

const RK_CONFIG_JSON = JSON.stringify({ shardsPrefix: "TEST" });

/** Variant A: the representative tree plus ONLY `.rk/config.json` — the pre-M2.6-equivalent
 * shape (the one file every gate's Inputs already assumed `.rk/` might hold). */
function filesBaseline(): Record<string, string> {
  return { ...REPO_FILES, ".rk/config.json": RK_CONFIG_JSON };
}

/** Variant B (partial): baseline plus `.rk/` content beyond config.json that NO prior gate names
 * as an input by path — a generated-artifact manifest and a driver log, the shapes a real `rk
 * render`/`rk verify` run leaves behind under `.rk/`. Deliberately EXCLUDES
 * `.rk/l5-verdicts.jsonl` — isolates the "generic extra `.rk/` content" variable from linker's one
 * specifically-named exception (see the second describe block). */
function filesWithGenericRkExtra(): Record<string, string> {
  return {
    ...filesBaseline(),
    ".rk/generated.json": JSON.stringify({
      schema_version: "1",
      entries: [{ path: "build/site/index.html", generator: "render-site-v1" }],
    }),
    ".rk/driver.log": "2026-07-19T00:00:00Z driver started\n2026-07-19T00:00:01Z driver finished ok\n",
  };
}

/** A single well-formed `.rk/l5-verdicts.jsonl` record (schema per src/drive/l5-record.ts,
 * mirrors test/gates/linker-l5.test.ts's own `l5Line` fixture shape) — a HEALTHY store, not a
 * corrupt one, so this isolates "presence changes linker's coverage line" from "a malformed store
 * is a fail-closed ERROR" (a separate, already-tested concern, src/gates/linker-l5.ts's blocker-6
 * logic). `itemId` deliberately names no shard in this tree's registry (harmless — see
 * `checkL5Promotion`: a record for an unknown id is simply never matched by any lemma). */
const WELL_FORMED_L5_LINE = JSON.stringify({
  schemaVersion: "1",
  ordinal: 0,
  itemId: "lem-unrelated",
  l5ContentHash: "0".repeat(64),
  verdict: "VALID",
  justification: "checked, sound",
  verifierSeam: "gpt|codex|gpt-5.6|s1",
});

/** Variant B (full): the generic extra content above PLUS `.rk/l5-verdicts.jsonl` — the exact
 * M3.7/M3.8 file linkerGate's Check 14 (src/gates/linker-l5.ts) is documented to consume. */
function filesWithFullRkExtra(): Record<string, string> {
  return { ...filesWithGenericRkExtra(), ".rk/l5-verdicts.jsonl": `${WELL_FORMED_L5_LINE}\n` };
}

/** Config held FIXED across every variant in this file — isolates the ONE variable under test
 * (`.rk/` snapshot content), never config drift. `_configValidation` is deliberately left unset:
 * no variant here goes through the real `.rk/config.json`-parsing edge
 * (src/store/config-load.ts), so configGate degrades to its documented zero-summary state
 * identically on every side. */
const CONFIG = mergeGateConfig({ shardsPrefix: "TEST" });

describe("M2.6 .rk/ include-rule widening vs the seven prior gates (rk-d2v)", () => {
  test("the 7-prior-gates / 6-.rk/-agnostic-gates lists this file maintains are the expected sizes", () => {
    // NOTE: deliberately NOT asserting against the shared src/gates/index.ts `GATES` registry
    // here (see the import-site comment above) — that singleton is not safe to read process-wide
    // once test/cli-check.test.ts's un-restored `mock.module` call has run earlier in the same
    // `bun test` invocation. src/gates/index.ts's own composition (8 entries, this order) is that
    // module's concern, exercised elsewhere (test/cli-check.test.ts, test/corpus.test.ts); this
    // file only needs its OWN direct-import gate lists to be complete and correctly partitioned.
    expect(PRIOR_GATES.length).toBe(7);
    expect(RK_AGNOSTIC_GATES.length).toBe(6);
    expect(PRIOR_GATES.map((g) => g.name)).toEqual(["config", "defs", "refs", "linker", "runs", "provenance", "shards"]);
    expect(RK_AGNOSTIC_GATES.map((g) => g.name)).toEqual(["config", "defs", "refs", "runs", "provenance", "shards"]);
  });

  describe("the 6 gates with zero direct .rk/ snapshot dependency (config, defs, refs, runs, provenance, shards)", () => {
    test("byte-identical GateResult (findings + coverage) regardless of ANY .rk/ content beyond config.json — including .rk/l5-verdicts.jsonl itself", () => {
      const snapBaseline = snapshotFromFiles(filesBaseline());
      const snapFullExtra = snapshotFromFiles(filesWithFullRkExtra());

      // Sanity: the two snapshots really do differ (otherwise this test would trivially pass for
      // the wrong reason) — the extra .rk/ keys are present in one and absent in the other.
      expect(snapFullExtra.has(".rk/l5-verdicts.jsonl")).toBe(true);
      expect(snapBaseline.has(".rk/l5-verdicts.jsonl")).toBe(false);
      expect(snapFullExtra.has(".rk/generated.json")).toBe(true);
      expect(snapBaseline.has(".rk/generated.json")).toBe(false);
      expect(snapFullExtra.has(".rk/driver.log")).toBe(true);
      expect(snapBaseline.has(".rk/driver.log")).toBe(false);

      const divergences: string[] = [];
      for (const gate of RK_AGNOSTIC_GATES) {
        const resultBaseline = gate.run(snapBaseline, CONFIG);
        const resultFullExtra = gate.run(snapFullExtra, CONFIG);

        const serializedBaseline = JSON.stringify(resultBaseline);
        const serializedFullExtra = JSON.stringify(resultFullExtra);

        if (serializedBaseline !== serializedFullExtra) {
          // Do NOT throw here and do NOT fix the gate — record the raw divergence as data so the
          // single expect() below reports every offending gate at once, not just the first.
          divergences.push(
            `gate '${gate.name}':\n  baseline:   ${serializedBaseline}\n  full extra: ${serializedFullExtra}`,
          );
        }

        // Granular assertions (findings, coverage) in addition to the byte-identical
        // serialization above — kept even though JSON.stringify equality already subsumes them,
        // since a future reader diffing a failure wants the structural (not just string) shape.
        expect(resultFullExtra.findings).toEqual(resultBaseline.findings);
        expect(resultFullExtra.coverage).toEqual(resultBaseline.coverage);
      }

      expect(divergences).toEqual([]);
    });
  });

  describe("linker's .rk/ dependency (M3.7/M3.8 Check 14) is scoped EXACTLY to .rk/l5-verdicts.jsonl, never a general .rk/ leak", () => {
    test("byte-identical to baseline when .rk/ carries OTHER extra content (.rk/generated.json, .rk/driver.log) but NOT .rk/l5-verdicts.jsonl", () => {
      const snapBaseline = snapshotFromFiles(filesBaseline());
      const snapGenericExtra = snapshotFromFiles(filesWithGenericRkExtra());
      expect(snapGenericExtra.has(".rk/l5-verdicts.jsonl")).toBe(false); // the one path that WOULD matter, absent here

      // `linkerGate` here is the direct import (top of file), not a PRIOR_GATES lookup.
      const resultBaseline = linkerGate.run(snapBaseline, CONFIG);
      const resultGenericExtra = linkerGate.run(snapGenericExtra, CONFIG);

      expect(JSON.stringify(resultGenericExtra)).toBe(JSON.stringify(resultBaseline));
    });

    // NOT a bug: src/gates/linker-l5.ts's `checkL5Promotion` is explicitly presence-conditional on
    // `.rk/l5-verdicts.jsonl` (M3.7/M3.8, Check 14) and reuses the same M2.6 one-level `.rk/`
    // include rule this bead is about — its own header names this reuse directly. This test PINS
    // that documented exception precisely: adding a HEALTHY (non-corrupt) store changes ONLY the
    // linker coverage line's "L5 store: ..." clause (absent -> present, 0/0 for this tree's single
    // `status: open` lemma, which `checkL5Promotion` never queries either way), never `findings`
    // (both sides are `[]` here) and never any OTHER gate. If this assertion ever starts failing
    // because the coverage text stopped changing, that is itself worth investigating (it would
    // mean the presence-conditional L5 wiring silently stopped reacting to the store's presence).
    test("adding .rk/l5-verdicts.jsonl (well-formed) changes ONLY linker's coverage 'L5 store' clause -- documented, not a regression", () => {
      const snapGenericExtra = snapshotFromFiles(filesWithGenericRkExtra());
      const snapFullExtra = snapshotFromFiles(filesWithFullRkExtra());

      const resultGenericExtra = linkerGate.run(snapGenericExtra, CONFIG);
      const resultFullExtra = linkerGate.run(snapFullExtra, CONFIG);

      // findings: identical (both empty for this tree's single non-'stated' lemma).
      expect(resultFullExtra.findings).toEqual(resultGenericExtra.findings);
      expect(resultFullExtra.findings).toEqual([]);

      // coverage: differs ONLY in the "L5 store: ..." clause of the single coverage line's unit
      // string; checked/total counts (the shard-scan denominator) are unaffected.
      expect(resultGenericExtra.coverage[0]!.unit).toContain("L5 store: absent (no promotions)");
      expect(resultFullExtra.coverage[0]!.unit).toContain("L5 store: 0/0 'stated' shards promotable");
      expect(resultFullExtra.coverage[0]!.checked).toBe(resultGenericExtra.coverage[0]!.checked);
      expect(resultFullExtra.coverage[0]!.total).toBe(resultGenericExtra.coverage[0]!.total);
    });
  });
});
