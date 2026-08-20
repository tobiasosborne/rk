// 1:1 test file for src/gates/profile.ts — the convention profile
// (`.rk/conventions/<name>.v<n>.json`, schemas/convention-profile.v1.json) the config gate
// validates and Gate 9 checks against. Contract: docs/gate-contracts.md "Convention profile".
// rk-5lzf / LB5 of docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md.

import { describe, expect, test } from "bun:test";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import {
  CONVENTIONS_DIR,
  profileFilePath,
  trackedSymbolIndex,
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
      symbols_must_be_registered: true,
    },
    {
      class: "locality",
      description: "k-locality and interaction degree",
      symbols: ["\\kloc"],
      symbols_must_be_registered: true,
    },
  ],
  lattices: { gap: ["inv-poly", "inv-log", "const"] },
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

  test("a symbol without a leading backslash is an ERROR (raw LaTeX macro tokens only)", () => {
    const bad = { ...GOOD, tracked_classes: [{ ...GOOD.tracked_classes[0]!, symbols: ["epsilon"] }] };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("symbols");
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

  test("the same symbol claimed by two classes is an ERROR (a symbol has one class)", () => {
    const bad = {
      ...GOOD,
      tracked_classes: [
        GOOD.tracked_classes[0]!,
        { ...GOOD.tracked_classes[1]!, symbols: ["\\epsilon"] },
      ],
    };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("\\epsilon");
  });

  test("a lattice with fewer than two values is an ERROR (nothing to order)", () => {
    const bad = { ...GOOD, lattices: { gap: ["const"] } };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("lattices");
  });

  test("a choice whose canonical is missing is an ERROR", () => {
    const bad = { ...GOOD, choices: { x: { allowed_translations: [] } } };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": bad }), "qpcp.v1");
    expect(messages(r.findings)).toContain("canonical");
  });
});

describe("validateConventionProfile — class-removed-without-bump", () => {
  const v1 = { ...GOOD, version: 1 };

  test("dropping a tracked class with NO version bump is an ERROR", () => {
    const v2 = { ...GOOD, version: 1, tracked_classes: [GOOD.tracked_classes[0]!] };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": v1, ".rk/conventions/qpcp.v2.json": v2 }),
      "qpcp.v2",
    );
    expect(messages(r.findings)).toContain("class-removed-without-bump");
    expect(messages(r.findings)).toContain("locality");
    expect(r.findings.every((f) => f.severity === "ERROR")).toBe(true);
  });

  test("dropping a tracked class WITH a version bump is permitted", () => {
    const v2 = { ...GOOD, version: 2, tracked_classes: [GOOD.tracked_classes[0]!] };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": v1, ".rk/conventions/qpcp.v2.json": v2 }),
      "qpcp.v2",
    );
    expect(r.findings).toEqual([]);
  });

  test("keeping every class needs no bump", () => {
    const v2 = { ...GOOD, version: 1 };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": v1, ".rk/conventions/qpcp.v2.json": v2 }),
      "qpcp.v2",
    );
    expect(r.findings).toEqual([]);
  });

  test("no predecessor file present: nothing to compare, no finding", () => {
    const v2 = { ...GOOD, version: 1, tracked_classes: [GOOD.tracked_classes[0]!] };
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v2.json": v2 }), "qpcp.v2");
    expect(r.findings).toEqual([]);
  });

  test("an UNPARSEABLE predecessor is a loud WARN, never a silent 'nothing was removed'", () => {
    const v2 = { ...GOOD, version: 1, tracked_classes: [GOOD.tracked_classes[0]!] };
    const r = validateConventionProfile(
      snap({ ".rk/conventions/qpcp.v1.json": "{ nope", ".rk/conventions/qpcp.v2.json": v2 }),
      "qpcp.v2",
    );
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.severity).toBe("WARN");
    expect(messages(r.findings)).toContain("qpcp.v1.json");
  });
});

describe("trackedSymbolIndex", () => {
  test("maps every tracked symbol to its class", () => {
    const r = validateConventionProfile(snap({ ".rk/conventions/qpcp.v1.json": GOOD }), "qpcp.v1");
    const index = trackedSymbolIndex(r.profile!);
    expect(index.get("\\epsilon")).toBe("promise-gap");
    expect(index.get("\\kloc")).toBe("locality");
    expect(index.size).toBe(3);
  });
});
