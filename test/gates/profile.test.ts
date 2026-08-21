// 1:1 test file for src/gates/profile.ts — the convention profile
// (`.rk/conventions/<name>.v<n>.json`, schemas/convention-profile.v1.json) the config gate
// validates and Gate 9 checks against. Contract: docs/gate-contracts.md "Convention profile".
// rk-5lzf / LB5 of docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md.

import { describe, expect, test } from "bun:test";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { sha256Hex } from "../../src/gates/sha256";
import {
  CONVENTIONS_DIR,
  enforceableSymbolIndex,
  profileFilePath,
  trackedSymbolIndex,
  unenforceableSymbols,
  validateConventionProfile,
} from "../../src/gates/profile";

const GOOD = {
  schema_version: "1",
  name: "qpcp",
  version: 1,
  tracked_classes: [
    {
      class: "promise-gap",
      description: "the promise gap of a local-Hamiltonian promise problem",
      symbols: ["\\epsilon", "\\gamma"],
      blessed: "\\gapfrac",
      symbols_must_be_registered: true,
    },
    {
      class: "locality",
      description: "k-locality and interaction degree",
      symbols: ["\\kloc"],
      blessed: "\\locality",
      symbols_must_be_registered: true,
    },
  ],
  lattices: { gap: { kind: "chain", values: ["inv-poly", "inv-log", "const"] } },
  choices: { "promise-gap-normalisation": { canonical: "relative", allowed_translations: ["absolute"] } },
  enums: { hardness_class: ["QMA", "QMA_1", "QCMA"] },
};

function snap(files: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(files)) {
    out[k] = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  }
  return snapshotFromFiles(out);
}

function messages(findings: { message: string }[]): string {
  return findings.map((f) => f.message).join(" || ");
}

function predecessorSha(profile: unknown): string {
  return sha256Hex(new TextEncoder().encode(JSON.stringify(profile, null, 2)));
}

describe("profileFilePath", () => {
  test("maps a reference key to its file under .rk/conventions/", () => {
    expect(profileFilePath("qpcp.v1")).toBe(`${CONVENTIONS_DIR}/qpcp.v1.json`);
  });
});

describe("validateConventionProfile — unconfigured", () => {
  test("no conventionProfile configured is a legitimate 0/0 non-finding", () => {
    const r = validateConventionProfile(snap({}), undefined);
    expect(r.findings).toEqual([]);
    expect(r.checked).toBe(0);
    expect(r.total).toBe(0);
    expect(r.profile).toBeUndefined();
  });
});

describe("validateConventionProfile — reference resolution", () => {
  test("an UNKNOWN conventionProfile (no such file) is an ERROR naming the expected path", () => {
    const r = validateConventionProfile(snap({}), "qpcp.v1");
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe("ERROR");
    expect(r.findings[0]!.structural).toBe(true);
    expect(messages(r.findings)).toContain(".rk/conventions/qpcp.v1.json");
    expect(r.checked).toBe(0);
    expect(r.total).toBe(1);
  });

  test("a reference key that is not <name>.v<n> is an ERROR, never a guessed path", () => {
    const r = validateConventionProfile(snap({}), "qpcp");
    expect(messages(r.findings)).toContain("<name>.v<n>");
  });

  test("a reference key with a path separator is rejected (never escapes .rk/conventions/)", () => {
    const r = validateConventionProfile(snap({}), "../../etc/passwd.v1");
    expect(r.findings).toHaveLength(1);
    expect(messages(r.findings)).toContain("<name>.v<n>");
  });
});

describe("validateConventionProfile — schema enforcement", () => {
  test("a well-formed profile validates clean", () => {
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": GOOD }), "qpcp.v1");
    expect(r.findings).toEqual([]);
    expect(r.checked).toBe(r.total);
    expect(r.profile?.name).toBe("qpcp");
    expect(r.profile?.tracked_classes).toHaveLength(2);
    expect(r.profile?.notation).toBe("draft");
  });

  test("notation defaults to draft and admits only draft or complete", () => {
    const complete = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, notation: "complete" } }),
      "qpcp.v1",
    );
    expect(complete.profile?.notation).toBe("complete");
    const bad = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, notation: "done" } }),
      "qpcp.v1",
    );
    expect(messages(bad.findings)).toContain('"notation"');
  });

  test("unparseable JSON is one loud ERROR and no profile", () => {
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": "{ nope" }), "qpcp.v1");
    expect(messages(r.findings)).toContain("not valid JSON");
    expect(r.profile).toBeUndefined();
  });

  test("wrong schema_version never silently runs under v1 semantics", () => {
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, schema_version: "2" } }),
      "qpcp.v1",
    );
    expect(messages(r.findings)).toContain("schema_version");
    expect(r.profile).toBeUndefined();
  });

  test("an unrecognized top-level key is an ERROR (additionalProperties:false)", () => {
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, extra: 1 } }),
      "qpcp.v1",
    );
    expect(messages(r.findings)).toContain('"extra"');
  });

  test("declared name must equal the filename's <name> part", () => {
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, name: "other" } }),
      "qpcp.v1",
    );
    expect(messages(r.findings)).toContain("name");
    expect(r.profile).toBeUndefined();
  });

  test("empty tracked_classes is an ERROR — a profile that tracks nothing checks nothing", () => {
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, tracked_classes: [] } }),
      "qpcp.v1",
    );
    expect(messages(r.findings)).toContain("tracked_classes");
  });

  test("a symbol containing whitespace is an ERROR (a token is one lexical unit)", () => {
    const bad = { ...GOOD, tracked_classes: [{ ...GOOD.tracked_classes[0]!, symbols: ["\\epsilon or \\gamma"] }] };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("symbols");
  });

  test("a bare identifier is an ADMITTED tracked token (the literature writes `c`, `n`, `QMA`)", () => {
    const ok = { ...GOOD, tracked_classes: [{ ...GOOD.tracked_classes[0]!, symbols: ["\\epsilon", "c", "QMA", "\\lambda_{\\min}"] }, GOOD.tracked_classes[1]!] };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": ok }), "qpcp.v1");
    expect(r.findings).toEqual([]);
  });

  test("blessed is REQUIRED and must be a plain macro token", () => {
    for (const blessed of [undefined, "", "gapfrac", "\\gap frac"]) {
      const tc: Record<string, unknown> = { ...GOOD.tracked_classes[0]! };
      if (blessed === undefined) delete tc.blessed;
      else tc.blessed = blessed;
      const bad = { ...GOOD, tracked_classes: [tc] };
      const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
      expect(messages(r.findings)).toContain("blessed");
    }
  });

  test("symbols_must_be_registered is OPTIONAL but must be true when present", () => {
    const tc: Record<string, unknown> = { ...GOOD.tracked_classes[0]! };
    delete tc.symbols_must_be_registered;
    const omitted = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, tracked_classes: [tc, GOOD.tracked_classes[1]!] } }),
      "qpcp.v1",
    );
    expect(omitted.findings).toEqual([]);
  });

  test("symbols_must_be_registered: false is a malformed profile, never a quiet Gate 9 opt-out", () => {
    const bad = {
      ...GOOD,
      tracked_classes: [{ ...GOOD.tracked_classes[0]!, symbols_must_be_registered: false }],
    };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("symbols_must_be_registered");
    expect(r.profile).toBeUndefined();
  });

  test("a duplicate class id is an ERROR", () => {
    const bad = { ...GOOD, tracked_classes: [GOOD.tracked_classes[0]!, GOOD.tracked_classes[0]!] };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("duplicate");
  });

  test("the same RAW symbol in two classes is ADMITTED — that overlap is what the register resolves", () => {
    const ok = {
      ...GOOD,
      tracked_classes: [GOOD.tracked_classes[0]!, { ...GOOD.tracked_classes[1]!, symbols: ["\\epsilon"] }],
    };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": ok }), "qpcp.v1");
    expect(r.findings).toEqual([]);
    expect(trackedSymbolIndex(r.profile!).get("\\epsilon")).toEqual(["locality", "promise-gap"]);
  });

  test("the same BLESSED macro in two classes is an ERROR (one canonical form per class)", () => {
    const bad = {
      ...GOOD,
      tracked_classes: [GOOD.tracked_classes[0]!, { ...GOOD.tracked_classes[1]!, blessed: "\\gapfrac" }],
    };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("blessed macro \\gapfrac");
  });

  test("a lattice with fewer than two values is an ERROR (nothing to order)", () => {
    const bad = { ...GOOD, lattices: { gap: { kind: "chain", values: ["const"] } } };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("lattices");
  });

  test("a BARE-ARRAY lattice is an ERROR — the shape is tagged, never inferred", () => {
    const bad = { ...GOOD, lattices: { gap: ["inv-poly", "const"] } };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("never a bare array");
  });

  test("a missing or unknown kind is an ERROR (a list cannot say whether its middle is comparable)", () => {
    for (const kind of [undefined, "lattice"]) {
      const lat: Record<string, unknown> = { values: ["inv-poly", "const"] };
      if (kind !== undefined) lat.kind = kind;
      const r = validateConventionProfile(
        snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, lattices: { gap: lat } } }),
        "qpcp.v1",
      );
      expect(messages(r.findings)).toContain("kind");
    }
  });

  test("a chain validates and keeps its weakest-first order", () => {
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, lattices: { k: { kind: "chain", values: ["const", "log", "poly"] } } } }),
      "qpcp.v1",
    );
    expect(r.findings).toEqual([]);
    expect(r.profile!.lattices.k).toEqual({ kind: "chain", values: ["const", "log", "poly"] });
  });

  test("a chain may not carry edges (that is a poset)", () => {
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, lattices: { k: { kind: "chain", values: ["a", "b"], edges: [["a", "b"]] } } } }),
      "qpcp.v1",
    );
    expect(messages(r.findings)).toContain('"edges"');
  });

  test("a poset validates with explicit covering edges", () => {
    const reduction = {
      kind: "poset",
      values: ["turing", "quasi-poly", "quantum-poly", "karp"],
      edges: [
        ["turing", "quantum-poly"],
        ["turing", "quasi-poly"],
        ["quantum-poly", "karp"],
        ["quasi-poly", "karp"],
      ],
    };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, lattices: { reduction } } }),
      "qpcp.v1",
    );
    expect(r.findings).toEqual([]);
    // The point of admitting posets: quasi-poly and quantum-poly stay INCOMPARABLE instead of
    // being linearised into a chain that silently accepts one for the other.
    expect(r.profile!.lattices.reduction!.kind).toBe("poset");
  });

  test("a poset edge naming an undeclared value is an ERROR", () => {
    const bad = { kind: "poset", values: ["a", "b"], edges: [["a", "zzz"]] };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, lattices: { k: bad } } }),
      "qpcp.v1",
    );
    expect(messages(r.findings)).toContain('"zzz"');
  });

  test("a malformed edge pair is an ERROR", () => {
    const bad = { kind: "poset", values: ["a", "b"], edges: [["a"]] };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, lattices: { k: bad } } }),
      "qpcp.v1",
    );
    expect(messages(r.findings)).toContain("[weaker, stronger] pair");
  });

  test("a CYCLE in the poset edges is an ERROR — not an order at all", () => {
    const bad = { kind: "poset", values: ["a", "b", "c"], edges: [["a", "b"], ["b", "c"], ["c", "a"]] };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, lattices: { k: bad } } }),
      "qpcp.v1",
    );
    expect(messages(r.findings)).toContain("cycle");
  });

  test("a SELF-LOOP is the length-1 cycle and is caught by the same walk", () => {
    const bad = { kind: "poset", values: ["a", "b"], edges: [["a", "a"]] };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, lattices: { k: bad } } }),
      "qpcp.v1",
    );
    expect(messages(r.findings)).toContain("cycle");
  });

  test("a poset with NO edges is a legitimate antichain (everything incomparable)", () => {
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": { ...GOOD, lattices: { k: { kind: "poset", values: ["a", "b"], edges: [] } } } }),
      "qpcp.v1",
    );
    expect(r.findings).toEqual([]);
  });

  test("choices admits ORTHOGONAL keys — a term convention is several independent axes", () => {
    const orthogonal = {
      ...GOOD,
      choices: {
        term_positivity: { canonical: "psd", allowed_translations: ["hermitian-norm-bounded"] },
        term_weighting: { canonical: "unweighted", allowed_translations: ["weighted"] },
        term_total_normalisation: { canonical: "per-term", allowed_translations: ["normalised-total"] },
        term_shift: { canonical: "none", allowed_translations: ["psd-shift"] },
      },
    };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": orthogonal }), "qpcp.v1");
    expect(r.findings).toEqual([]);
    expect(Object.keys(r.profile!.choices)).toHaveLength(4);
  });

  test("a choice whose canonical is missing is an ERROR", () => {
    const bad = { ...GOOD, choices: { x: { allowed_translations: [] } } };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("canonical");
  });

  test("allowed_translations enforces schema uniqueItems at runtime", () => {
    const bad = {
      ...GOOD,
      choices: { x: { canonical: "relative", allowed_translations: ["absolute", "absolute"] } },
    };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("distinct values");
  });
});

describe("validateConventionProfile — class-removed-without-bump", () => {
  const v1 = { ...GOOD, version: 1 };

  test("dropping a tracked class with NO version bump is an ERROR", () => {
    const v2 = {
      ...GOOD,
      version: 1,
      predecessor_sha256: predecessorSha(v1),
      tracked_classes: [GOOD.tracked_classes[0]!],
    };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": v1, ".rk/conventions/qpcp.v2.json": v2 }),
      "qpcp.v2",
    );
    expect(messages(r.findings)).toContain("class-removed-without-bump");
    expect(messages(r.findings)).toContain("locality");
    expect(r.findings.every((f) => f.severity === "ERROR")).toBe(true);
  });

  test("dropping a tracked class WITH a version bump is permitted", () => {
    const v2 = {
      ...GOOD,
      version: 2,
      predecessor_sha256: predecessorSha(v1),
      tracked_classes: [GOOD.tracked_classes[0]!],
    };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": v1, ".rk/conventions/qpcp.v2.json": v2 }),
      "qpcp.v2",
    );
    expect(r.findings).toEqual([]);
  });

  test("keeping every class needs no bump", () => {
    const v2 = { ...GOOD, version: 1, predecessor_sha256: predecessorSha(v1) };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": v1, ".rk/conventions/qpcp.v2.json": v2 }),
      "qpcp.v2",
    );
    expect(r.findings).toEqual([]);
  });

  test("no predecessor file present is a structural ERROR", () => {
    const v2 = {
      ...GOOD,
      version: 1,
      predecessor_sha256: predecessorSha(v1),
      tracked_classes: [GOOD.tracked_classes[0]!],
    };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v2.json": v2 }), "qpcp.v2");
    expect(messages(r.findings)).toContain("predecessor-missing");
    expect(r.findings[0]!.structural).toBe(true);
    expect(r.profile).toBeUndefined();
  });

  test("an UNPARSEABLE but hash-matching predecessor is a structural ERROR", () => {
    const badPredecessor = "{ nope";
    const v2 = {
      ...GOOD,
      version: 1,
      predecessor_sha256: sha256Hex(new TextEncoder().encode(badPredecessor)),
      tracked_classes: [GOOD.tracked_classes[0]!],
    };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": badPredecessor, ".rk/conventions/qpcp.v2.json": v2 }),
      "qpcp.v2",
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe("ERROR");
    expect(r.findings[0]!.structural).toBe(true);
    expect(messages(r.findings)).toContain("qpcp.v1.json");
    expect(r.profile).toBeUndefined();
  });

  test("a rewritten predecessor fails its pinned hash before shrink comparison", () => {
    const rewritten = { ...GOOD, tracked_classes: [GOOD.tracked_classes[0]!] };
    const v2 = { ...GOOD, version: 2, predecessor_sha256: predecessorSha(v1) };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": rewritten, ".rk/conventions/qpcp.v2.json": v2 }),
      "qpcp.v2",
    );
    expect(messages(r.findings)).toContain("predecessor-hash-mismatch");
    expect(r.profile).toBeUndefined();
  });
});

describe("trackedSymbolIndex", () => {
  test("maps every tracked symbol — and each class's blessed macro — to its class", () => {
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": GOOD }), "qpcp.v1");
    const index = trackedSymbolIndex(r.profile!);
    expect(index.get("\\epsilon")).toEqual(["promise-gap"]);
    expect(index.get("\\gapfrac")).toEqual(["promise-gap"]);
    expect(index.get("\\kloc")).toEqual(["locality"]);
    expect(index.get("\\locality")).toEqual(["locality"]);
    expect(index.size).toBe(5);
  });

  test("enforceableSymbolIndex keeps only plain macro tokens; the rest are counted, not dropped", () => {
    const withBare = {
      ...GOOD,
      tracked_classes: [{ ...GOOD.tracked_classes[0]!, symbols: ["\\epsilon", "c", "\\lambda_{\\min}"] }],
    };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": withBare }), "qpcp.v1");
    expect([...enforceableSymbolIndex(r.profile!).keys()].sort()).toEqual(["\\epsilon", "\\gapfrac"]);
    expect(unenforceableSymbols(r.profile!)).toEqual(["\\lambda_{\\min}", "c"]);
  });
});

// The campaign's own profile draft (rk-campaign-E docs/conventions-qpcp-v1-draft.md section 10),
// transcribed here as a fixture so the schema is validated against REAL content and not only
// against hand-made minimal objects. See this test's own comments for the three shape divergences
// between the draft's proposed block and this schema — all three are the DRAFT's to close, and the
// transform applied below is exactly the mechanical rewrite that closes them.
describe("validateConventionProfile — the qPCP campaign profile draft", () => {
  // Divergence 1: the draft writes `lattices` as BARE ARRAYS and parks direction in a separate
  // top-level `key_polarity` map. The schema requires a TAGGED object per lattice — `{kind:
  // "chain", values}` or `{kind: "poset", values, edges}` — and has no polarity field at all
  // (direction is expressed on the signature side, where a parameter is an interval over these
  // values; rk-8805). Transform: tag each list as a chain, and give the draft's own D3 example
  // (`reduction`, whose middle is genuinely incomparable) the poset shape it asks for.
  // Divergence 2: the draft has no per-class `blessed`; it carries a separate top-level `macros`
  // map holding a LIST of blessed macros per class. The schema requires exactly one `blessed`
  // macro per class. Transform: take the first, which is how the draft's own prose reads them
  // (the canonical form of the class, with the rest secondary).
  // Divergence 3: the draft's `key_polarity` names nine keys with no lattice at all (norm, terms,
  // geometry, product, circuit_model, trivial_approx, frustration, commuting, layered). Every one
  // has an `enums` entry, and with polarity gone they need no lattice: an unordered value set IS
  // an enum. The transform below simply leaves them in `enums`.
  const DRAFT_CLASSES = [
    { class: "promise-gap", description: "Thresholds and the gap between them.", symbols: ["\\epsilon", "\\varepsilon", "\\gamma", "\\Gamma", "\\delta", "\\Delta", "\\alpha", "\\beta", "c", "a", "b", "A", "B"], macros: ["\\gapfrac", "\\gapabs", "\\thrlo", "\\thrhi"] },
    { class: "energy-density", description: "Expected energy per term or per qudit.", symbols: ["\\epsilon", "\\varepsilon", "e", "\\bar{E}", "\\mathrm{QUNSAT}"], macros: ["\\edens", "\\edensq"] },
    { class: "spectral", description: "Eigenvalues of one operator, and the spectral gap.", symbols: ["\\Delta", "\\lambda_{\\min}", "\\lambda_0", "\\lambda_1", "E_0", "\\epsilon_0"], macros: ["\\specgap", "\\lmin", "\\lone", "\\gsdens"] },
    { class: "locality", description: "Number of qudits a term or check touches.", symbols: ["k", "q", "r", "w"], macros: ["\\locality", "\\query", "\\checkwt"] },
    { class: "qudit-dimension", description: "Local Hilbert-space dimension.", symbols: ["d", "D", "q", "\\Sigma"], macros: ["\\qdim"] },
  ];

  const DRAFT_LATTICES: Record<string, string[]> = {
    gap: ["inv-poly", "inv-polylog", "inv-log", "const"],
    qdim: ["const", "polylog", "poly"],
    qdim_cap: ["poly", "polylog", "const"],
    reduction: ["turing", "quasi-poly", "quantum-poly", "randomised-poly", "karp"],
  };
  const DRAFT_POLARITY: Record<string, string> = { gap: "afforded", qdim: "afforded", qdim_cap: "capped", reduction: "afforded", norm: "equality" };
  const DRAFT_ENUMS: Record<string, string[]> = {
    hardness: ["QMA-hard", "QMA-complete", "open", "no-go"],
    norm: ["relative", "absolute", "energy-density-term", "energy-density-qudit", "normalised-total"],
  };

  function transcribedProfile() {
    const lattices: Record<string, unknown> = {};
    for (const [key, values] of Object.entries(DRAFT_LATTICES)) {
      lattices[key] = { kind: "chain", values };
    }
    // The draft's own D3: `reduction`'s middle is NOT honestly totally ordered (quasi-poly vs
    // quantum-poly, quasi-poly vs turing), and it says so. As a poset that is expressible.
    lattices.reduction = {
      kind: "poset",
      values: ["turing", "quasi-poly", "quantum-poly", "randomised-poly", "karp"],
      edges: [
        ["turing", "quasi-poly"],
        ["turing", "quantum-poly"],
        ["quasi-poly", "randomised-poly"],
        ["quantum-poly", "randomised-poly"],
        ["randomised-poly", "karp"],
      ],
    };
    return {
      schema_version: "1",
      name: "qpcp",
      version: 1,
      tracked_classes: DRAFT_CLASSES.map((c) => ({
        class: c.class,
        description: c.description,
        symbols: c.symbols,
        blessed: c.macros[0]!, // Divergence 2's transform
      })),
      lattices,
      choices: {
        promise_gap_normalisation: {
          canonical: "relative",
          allowed_translations: ["absolute", "energy-density-term", "energy-density-qudit", "normalised-total"],
          notes: "gapfrac := (B-A)/m, dimensionless in [0,1].",
        },
      },
      enums: DRAFT_ENUMS,
    };
  }

  test("the transcribed campaign draft validates clean", () => {
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": transcribedProfile() }), "qpcp.v1");
    expect(r.findings).toEqual([]);
    expect(r.profile!.tracked_classes).toHaveLength(5);
  });

  test("the draft's classes carry symbols Gate 9 CANNOT scan for — counted, never silently dropped", () => {
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": transcribedProfile() }), "qpcp.v1");
    const unenforceable = unenforceableSymbols(r.profile!);
    // Bare identifiers (`c`, `k`, `d`, `q`) and brace/subscript forms (`\lambda_{\min}`) are real
    // tracked tokens in the literature and real holes in a LEXICAL check. Both are visible.
    expect(unenforceable).toContain("c");
    expect(unenforceable).toContain("\\lambda_{\\min}");
    // `\epsilon` is a promise gap in one source and an energy density in another — both classes
    // claim it, and the register (not the profile) is what disambiguates a given occurrence.
    expect(enforceableSymbolIndex(r.profile!).get("\\epsilon")).toEqual(["energy-density", "promise-gap"]);
    expect(enforceableSymbolIndex(r.profile!).get("\\gapfrac")).toEqual(["promise-gap"]);
  });

  test("the draft's own bare-array lattices are REJECTED (divergence 1, the draft's to close)", () => {
    const asDrafted = { ...transcribedProfile(), lattices: DRAFT_LATTICES };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": asDrafted }), "qpcp.v1");
    expect(messages(r.findings)).toContain("never a bare array");
  });

  test("the draft's top-level `macros`/`key_polarity` keys are REJECTED (divergences 2-3)", () => {
    const asDrafted = { ...transcribedProfile(), macros: {}, key_polarity: DRAFT_POLARITY };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": asDrafted }), "qpcp.v1");
    expect(messages(r.findings)).toContain('"macros"');
    expect(messages(r.findings)).toContain('"key_polarity"');
  });
});
