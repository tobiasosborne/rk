// Unit tests for Gate 7 — freshness (src/gates/freshness.ts, M2.6, docs/gate-contracts.md's
// "Gate 7 — freshness"). corpus/freshness/freshness-01..05 (test/corpus.test.ts) cover the
// gate end-to-end through the real snapshot loader; these tests isolate the pure functions
// directly (manifest parsing, the Check-11 supersession boundary, first-diff-line reporting)
// against hand-built snapshots, faster to iterate on than a fixture directory.

import { describe, expect, test } from "bun:test";
import {
  declaredGeneratorPaths,
  freshnessGate,
  freshnessSupersededPaths,
  MANIFEST_PATH,
  RENDER_SITE_GENERATOR,
  runFreshnessGate,
  type ExternalRegenResult,
} from "../../src/gates/freshness";
import { checkGenerated, renderIndex } from "../../src/gates/linker-render";
import { parseRegistry } from "../../src/gates/linker-parse";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { DEFAULT_GATE_CONFIG } from "../../src/gates/config";

const LEMMA = `---
id: lem-simple
kind: lemma
status: stated
af: none
contract: Simple contract text.
---
`;

function manifest(entries: Array<{ path: string; generator: string }>): string {
  return JSON.stringify({ schema_version: "1", entries });
}

describe("freshnessGate: manifest presence-conditional (whole-mechanism)", () => {
  test("no .rk/generated.json at all -> zero findings, coverage names non-adoption, 0/0", () => {
    const snapshot = snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([
      { gate: "freshness", unit: `generated artifacts (manifest not adopted: ${MANIFEST_PATH} absent)`, checked: 0, total: 0 },
    ]);
  });

  test("manifest present, entries: [] -> adopted-but-empty is distinct from not-adopted, still 0/0", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: manifest([]),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage[0]!.unit).not.toContain("not adopted");
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(0);
  });
});

describe("freshnessGate: regenerate-and-diff over a declared linker-index entry", () => {
  function repoWithIndex(indexContent: string) {
    return snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "argument/INDEX.md": indexContent,
      [MANIFEST_PATH]: manifest([{ path: "argument/INDEX.md", generator: "linker-index" }]),
    });
  }

  test("clean regenerate: byte-identical INDEX.md -> zero findings, checked=1/1", () => {
    const { lemmas } = parseRegistry(
      snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA }),
    );
    const fresh = renderIndex(lemmas);
    const result = freshnessGate.run(repoWithIndex(fresh), DEFAULT_GATE_CONFIG);
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([{ gate: "freshness", unit: "generated artifacts", checked: 1, total: 1 }]);
  });

  test("hand-edited INDEX.md -> ERROR naming the file and the first differing line", () => {
    const result = freshnessGate.run(repoWithIndex("hand-edited nonsense, not a real render\n"), DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("ERROR");
    expect(f.path).toBe("argument/INDEX.md");
    expect(f.message).toContain("is STALE");
    expect(f.message).toContain("first difference at line 1");
    expect(result.coverage[0]!.checked).toBe(1);
    expect(result.coverage[0]!.total).toBe(1);
  });

  test("declared but missing: manifest names a path absent from the snapshot -> ERROR", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: manifest([{ path: "argument/INDEX.md", generator: "linker-index" }]),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.path).toBe("argument/INDEX.md");
    expect(result.findings[0]!.message).toContain("declared in .rk/generated.json");
    expect(result.findings[0]!.message).toContain("absent from the repo");
  });

  // Blocker #3a (M2 boundary review): flips the old expectation. An unrecognized generator id
  // used to be a benign, non-blocking "not adopted" state (checked 0/1, zero findings) — a
  // typo'd or unregistered generator therefore green-lit an entirely unchecked artifact. It is
  // now a BLOCKING manifest ERROR: never silently exit green over an unverifiable declaration.
  test("unrecognized generator id: a BLOCKING ERROR, excluded from checked but counted in total", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "build/site/index.html": "<html></html>",
      [MANIFEST_PATH]: manifest([{ path: "build/site/index.html", generator: "render-html-v2" }]),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("ERROR");
    expect(f.path).toBe("build/site/index.html");
    expect(f.message).toContain("unrecognized generator 'render-html-v2'");
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(1);
    expect(result.coverage[0]!.unit).toContain("1 unrecognized generator");
    expect(result.coverage[0]!.unit).toContain("render-html-v2");
  });
});

describe("freshnessGate: render-site-v1 (edge-supplied bytes, M2 boundary review blocker #3)", () => {
  function repoWithSite(siteContent: string | undefined) {
    return snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      ...(siteContent === undefined ? {} : { "build/site/index.html": siteContent }),
      [MANIFEST_PATH]: manifest([{ path: "build/site/index.html", generator: RENDER_SITE_GENERATOR }]),
    });
  }

  test("plain freshnessGate.run (no externalRegen supplied): render-site-v1 is recognized but ALWAYS reports 'cannot be regenerated for verification' — never a silent pass", () => {
    const snapshot = repoWithSite("<html>whatever</html>");
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).toContain("cannot be regenerated for verification");
    expect(result.findings[0]!.message).toContain("no edge-prepared expected bytes were supplied");
    // Recognized (unlike a truly unknown generator): counted in checked, not named "unrecognized".
    expect(result.coverage[0]!.checked).toBe(1);
    expect(result.coverage[0]!.total).toBe(1);
    expect(result.coverage[0]!.unit).not.toContain("unrecognized generator");
  });

  test("runFreshnessGate with externalRegen ok:true, matching bytes -> clean (the 'clean regenerated site -> green' case)", () => {
    const bytes = "<html>fresh render</html>";
    const snapshot = repoWithSite(bytes);
    const externalRegen = new Map<string, ExternalRegenResult>([
      ["build/site/index.html", { ok: true, bytes }],
    ]);
    const result = runFreshnessGate(snapshot, DEFAULT_GATE_CONFIG, externalRegen);
    expect(result.findings).toEqual([]);
    expect(result.coverage).toEqual([{ gate: "freshness", unit: "generated artifacts", checked: 1, total: 1 }]);
  });

  test("runFreshnessGate with externalRegen ok:true, mismatched bytes -> STALE ERROR (the 'hand-edited site HTML -> ERROR' case)", () => {
    const snapshot = repoWithSite("<html>hand-edited nonsense</html>");
    const externalRegen = new Map<string, ExternalRegenResult>([
      ["build/site/index.html", { ok: true, bytes: "<html>fresh render</html>" }],
    ]);
    const result = runFreshnessGate(snapshot, DEFAULT_GATE_CONFIG, externalRegen);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.path).toBe("build/site/index.html");
    expect(result.findings[0]!.message).toContain("is STALE");
    expect(result.findings[0]!.message).toContain(`regenerate via '${RENDER_SITE_GENERATOR}'`);
  });

  test("runFreshnessGate with externalRegen ok:false -> ERROR naming the edge's own reason, never a silent pass/skip", () => {
    const snapshot = repoWithSite("<html>whatever</html>");
    const externalRegen = new Map<string, ExternalRegenResult>([
      ["build/site/index.html", { ok: false, reason: "structurally incomplete build (2 registrySkipped)" }],
    ]);
    const result = runFreshnessGate(snapshot, DEFAULT_GATE_CONFIG, externalRegen);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).toContain("cannot be regenerated for verification");
    expect(result.findings[0]!.message).toContain("structurally incomplete build (2 registrySkipped)");
  });

  // rk-xbsx (2026-07-25): B2 routed `rk check`'s regeneration through `renderSiteFromRepo`, which
  // reads af/fr through live subprocesses. When one of those readers can only reach a
  // REDUCED-FIDELITY fallback, the "expected" bytes are a function of the verifier's environment
  // as much as of the repo — so a byte difference is no longer evidence of artifact drift. It is
  // still never fresh (fail closed, ERROR either way), but it must not be reported as STALE.
  test("ok:true + degraded + matching bytes -> still clean (a degraded read that agrees is no defect)", () => {
    const bytes = "<html>fresh render</html>";
    const snapshot = repoWithSite(bytes);
    const externalRegen = new Map<string, ExternalRegenResult>([
      ["build/site/index.html", { ok: true, bytes, degraded: "fr: log fallback (reduced fidelity)" }],
    ]);
    const result = runFreshnessGate(snapshot, DEFAULT_GATE_CONFIG, externalRegen);
    expect(result.findings).toEqual([]);
  });

  test("ok:true + degraded + MISMATCHED bytes -> ERROR, but explicitly NOT a STALE verdict", () => {
    const snapshot = repoWithSite("<html>hand-edited nonsense</html>");
    const externalRegen = new Map<string, ExternalRegenResult>([
      ["build/site/index.html", { ok: true, bytes: "<html>fresh render</html>", degraded: "fr: log fallback (reduced fidelity)" }],
    ]);
    const result = runFreshnessGate(snapshot, DEFAULT_GATE_CONFIG, externalRegen);
    expect(result.findings.length).toBe(1);
    const f = result.findings[0]!;
    expect(f.severity).toBe("ERROR"); // fail closed: never reported as fresh
    expect(f.path).toBe("build/site/index.html");
    expect(f.message).toContain("NOT attributable to artifact drift");
    expect(f.message).toContain("fr: log fallback (reduced fidelity)");
    // the whole point: the drift verdict is withheld, not renamed
    expect(f.message).not.toContain("is STALE");
  });

  test("declared but missing from disk, even with ok:true supplied bytes -> the ordinary declared-but-missing ERROR", () => {
    const snapshot = repoWithSite(undefined);
    const externalRegen = new Map<string, ExternalRegenResult>([
      ["build/site/index.html", { ok: true, bytes: "<html>fresh render</html>" }],
    ]);
    const result = runFreshnessGate(snapshot, DEFAULT_GATE_CONFIG, externalRegen);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.message).toContain("declared in .rk/generated.json");
    expect(result.findings[0]!.message).toContain("absent from the repo");
  });
});

describe("declaredGeneratorPaths: the edge-discovery helper for externally-regenerated entries", () => {
  test("returns exactly the well-formed paths declared under the given generator", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: manifest([
        { path: "argument/INDEX.md", generator: "linker-index" },
        { path: "build/site/index.html", generator: RENDER_SITE_GENERATOR },
      ]),
    });
    expect(declaredGeneratorPaths(snapshot, RENDER_SITE_GENERATOR)).toEqual(["build/site/index.html"]);
    expect(declaredGeneratorPaths(snapshot, "linker-index")).toEqual(["argument/INDEX.md"]);
  });

  test("a malformed manifest contributes no paths", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: "{ not json ,,, }",
    });
    expect(declaredGeneratorPaths(snapshot, RENDER_SITE_GENERATOR)).toEqual([]);
  });

  test("manifest absent contributes no paths", () => {
    const snapshot = snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA });
    expect(declaredGeneratorPaths(snapshot, RENDER_SITE_GENERATOR)).toEqual([]);
  });
});

describe("freshnessGate: manifest schema enforcement (M2 boundary review blocker #4)", () => {
  test("missing schema_version -> ERROR, never silently accepted", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: JSON.stringify({ entries: [] }),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.message).toContain('missing required "schema_version"');
  });

  test('wrong schema_version ("2") -> ERROR, never silently run under v1 semantics', () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: JSON.stringify({ schema_version: "2", entries: [] }),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.message).toContain('"schema_version" is "2"');
    expect(result.findings[0]!.message).toContain('expected exactly "1"');
  });

  test("extra top-level property -> ERROR, additionalProperties:false enforced", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: JSON.stringify({ schema_version: "1", entries: [], extra_top: "nope" }),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.message).toContain("unrecognized top-level property");
    expect(result.findings[0]!.message).toContain('"extra_top"');
  });

  test("extra per-entry property -> per-entry ERROR, well-formed siblings still checked", () => {
    const { lemmas } = parseRegistry(snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA }));
    const fresh = renderIndex(lemmas);
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "argument/INDEX.md": fresh,
      [MANIFEST_PATH]: JSON.stringify({
        schema_version: "1",
        entries: [{ path: "argument/INDEX.md", generator: "linker-index", extra_entry: "nope" }],
      }),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.message).toContain("unrecognized property");
    expect(result.findings[0]!.message).toContain('"extra_entry"');
    // The malformed entry is dropped entirely (never partially trusted) -- checked=0/0.
    expect(result.coverage[0]!.checked).toBe(0);
    expect(result.coverage[0]!.total).toBe(0);
  });
});

describe("freshnessGate: malformed manifest is a loud ERROR, never a crash and never silent-absent", () => {
  test("not valid JSON -> ERROR at .rk/generated.json:1, never treated as 'manifest absent'", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: "{ not json ,,, }",
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.severity).toBe("ERROR");
    expect(result.findings[0]!.path).toBe(MANIFEST_PATH);
    expect(result.findings[0]!.message).toContain("not valid JSON");
    // Must NOT read as the presence-conditional golden pass — that would silently swallow a
    // real, visible defect (a malformed manifest) into the "never adopted" green state.
    expect(result.coverage[0]!.unit).not.toContain("not adopted:");
  });

  test("valid JSON, wrong top-level shape (no 'entries' array) -> ERROR", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: JSON.stringify({ schema_version: "1" }),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    expect(result.findings.length).toBe(1);
    expect(result.findings[0]!.message).toContain('expected a JSON object with an "entries" array');
  });

  test("one malformed entry (missing 'generator') is a per-entry ERROR; well-formed siblings still check", () => {
    const { lemmas } = parseRegistry(snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA }));
    const fresh = renderIndex(lemmas);
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "argument/INDEX.md": fresh,
      [MANIFEST_PATH]: JSON.stringify({
        schema_version: "1",
        entries: [{ path: "argument/INDEX.md", generator: "linker-index" }, { path: "argument/DAG.md" }],
      }),
    });
    const result = freshnessGate.run(snapshot, DEFAULT_GATE_CONFIG);
    const shapeErrors = result.findings.filter((f) => f.message.includes("entries[1]"));
    expect(shapeErrors.length).toBe(1);
    // The well-formed sibling entry (INDEX.md) is still individually checked and clean.
    expect(result.coverage[0]!.checked).toBe(1);
  });
});

describe("freshnessSupersededPaths: the Gate 2 Check 11 boundary", () => {
  test("empty/absent manifest supersedes nothing", () => {
    const snapshot = snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA });
    expect(freshnessSupersededPaths(snapshot).size).toBe(0);
  });

  test("a declared entry with a RECOGNIZED generator supersedes exactly its path", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: manifest([{ path: "argument/INDEX.md", generator: "linker-index" }]),
    });
    const superseded = freshnessSupersededPaths(snapshot);
    expect(superseded.has("argument/INDEX.md")).toBe(true);
    expect(superseded.has("argument/DAG.md")).toBe(false);
  });

  test("a declared entry with an UNRECOGNIZED generator supersedes nothing (no silent gap)", () => {
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      [MANIFEST_PATH]: manifest([{ path: "argument/INDEX.md", generator: "future-html-render" }]),
    });
    expect(freshnessSupersededPaths(snapshot).size).toBe(0);
  });

  test("checkGenerated (Gate 2 Check 11) skips a superseded path entirely, even when it is stale", () => {
    const { lemmas } = parseRegistry(snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA }));
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "argument/INDEX.md": "definitely stale, not a real render\n",
    });
    const superseded = new Set(["argument/INDEX.md"]);
    const { findings, mirrorStatus } = checkGenerated(snapshot, lemmas, superseded);
    expect(findings).toEqual([]);
    const indexStatus = mirrorStatus.find((m) => m.path === "argument/INDEX.md")!;
    expect(indexStatus.superseded).toBe(true);
  });

  test("checkGenerated's default (no superseded set) is byte-identical to pre-M2.6 behavior — a stale mirror still ERRORs", () => {
    const { lemmas } = parseRegistry(snapshotFromFiles({ "argument/lemmas/lem-simple.md": LEMMA }));
    const snapshot = snapshotFromFiles({
      "argument/lemmas/lem-simple.md": LEMMA,
      "argument/INDEX.md": "definitely stale, not a real render\n",
    });
    const { findings } = checkGenerated(snapshot, lemmas);
    expect(findings.length).toBe(1);
    expect(findings[0]!.message).toContain("STALE");
  });
});
