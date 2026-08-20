// 1:1 test file for src/gates/linker-signature.ts — Gate 2 Check 17 (signature + route-scoped
// entailment) as the LINKER sees it: findings, their codes, their structural classification, and
// the coverage line. Ground truth: docs/gate-contracts.md Gate 2 Check 17,
// docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 6.
//
// Check NUMBER note (review follow-up FU1): 12 is already brittleness — this is 17.

import { describe, expect, test } from "bun:test";
import { linkerGate } from "../../src/gates/linker";
import { DEFAULT_GATE_CONFIG, mergeGateConfig } from "../../src/gates/config";
import type { GateConfig } from "../../src/gates/config";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import type { Finding } from "../../src/gates/framework";

const PROFILE_PATH = ".rk/conventions/rk-test.v1.json";
const PROFILE = JSON.stringify({
  schema_version: "1",
  name: "rk-test.v1",
  lattices: { gap: ["inv-poly", "inv-log", "const"], qdim: { kind: "chain", values: ["const", "poly"] } },
  enums: { norm: ["relative", "absolute"] },
});

const ADOPTED: Partial<GateConfig> = { conventionProfile: "rk-test.v1", signatures: "optional" };
const REQUIRED: Partial<GateConfig> = { conventionProfile: "rk-test.v1", signatures: "required" };

function block(value: unknown): string {
  return "```signature\n" + JSON.stringify(value, null, 2) + "\n```\n";
}

/** Canonical signature bytes for a shard body. Keys/entries are already sorted here — the parser
 * refuses any other encoding (`signature-noncanonical`). */
function signatureBody(parts: {
  pre?: Record<string, string>[];
  post?: Record<string, string>[];
  regime?: Record<string, string>[];
  profile?: string;
}): string {
  return block({
    post: parts.post ?? [],
    pre: parts.pre ?? [],
    profile: parts.profile ?? "rk-test.v1",
    regime: parts.regime ?? [],
    schema_version: "1",
  });
}

function shard(id: string, fm: Record<string, string>, body = ""): string {
  const lines = Object.entries({ id, kind: "lemma", ...fm })
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  return `---\n${lines}\n---\n\n${body}`;
}

const DEFS = {
  "definitions/def-promise-gap.md": "---\nid: def-promise-gap\nterm: Promise gap\nkind: original\nstatus: locked\nconsensus: x\n---\n",
  "definitions/def-local-hamiltonian.md": "---\nid: def-local-hamiltonian\nterm: Local Hamiltonian\nkind: original\nstatus: locked\nconsensus: x\n---\n",
};

/** The review's exact pair (LB2). */
const REVIEW_PAIR = {
  ...DEFS,
  [PROFILE_PATH]: PROFILE,
  "argument/lem-amp.md": shard(
    "lem-amp",
    {},
    signatureBody({ regime: [{ qdim: "poly" }], post: [{ gap: "const", obj: "def-promise-gap" }] }),
  ),
  "argument/thm-qpcp.md": shard(
    "thm-qpcp",
    { kind: "theorem", deps: "lem-amp" },
    signatureBody({
      regime: [{ qdim: "const" }],
      pre: [
        { gap: "const", obj: "def-promise-gap" },
        { obj: "def-local-hamiltonian", qdim: "const" },
      ],
      post: [{ gap: "const", obj: "def-promise-gap" }],
    }),
  ),
};

function run(files: Record<string, string>, override: Partial<GateConfig> = ADOPTED) {
  return linkerGate.run(snapshotFromFiles(files), mergeGateConfig(override));
}

function withCode(findings: Finding[], code: string): Finding[] {
  return findings.filter((f) => f.message.includes(`[${code}]`));
}

describe("Check 17 — the review's exact pair is REJECTED", () => {
  const { findings, coverage } = run(REVIEW_PAIR);

  test("one regime-unentailed ERROR, naming lem-amp and the `qdim` key", () => {
    const hits = withCode(findings, "regime-unentailed");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("ERROR");
    expect(hits[0]!.path).toBe("argument/thm-qpcp.md");
    expect(hits[0]!.message).toContain("lem-amp");
    expect(hits[0]!.message).toContain("'qdim'");
    expect(hits[0]!.message).toContain("poly");
    expect(hits[0]!.message).toContain("const");
  });

  test("it is STRUCTURAL — admission is phase-independent (memo section 2a)", () => {
    expect(withCode(findings, "regime-unentailed")[0]!.structural).toBe(true);
  });

  test("the coverage line reports shards / routes / entailments", () => {
    expect(coverage[0]!.unit).toContain("signatures: 2 shards / 2 routes / 1 entailment");
  });
});

describe("Check 17 — the same chain with the amplifier available in context", () => {
  const green = {
    ...DEFS,
    [PROFILE_PATH]: PROFILE,
    "argument/lem-amp.md": REVIEW_PAIR["argument/lem-amp.md"],
    "argument/thm-ok.md": shard(
      "thm-ok",
      { kind: "theorem", deps: "lem-amp" },
      signatureBody({
        regime: [{ qdim: "poly" }],
        pre: [{ obj: "def-local-hamiltonian", qdim: "poly" }],
        post: [{ gap: "const", obj: "def-promise-gap" }],
      }),
    ),
  };

  test("zero signature findings", () => {
    const { findings } = run(green);
    expect(findings.filter((f) => f.message.includes("[signature") || f.message.includes("[regime-unentailed"))).toEqual([]);
  });
});

describe("Check 17 — the other failure classes", () => {
  test("(a) an object id resolving to no Layer 0 shard is dangling-object", () => {
    const { findings } = run({
      ...DEFS,
      [PROFILE_PATH]: PROFILE,
      "argument/lem-a.md": shard("lem-a", {}, signatureBody({ pre: [{ gap: "const", obj: "def-ghost" }] })),
    });
    const hits = withCode(findings, "dangling-object");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.message).toContain("def-ghost");
    expect(hits[0]!.structural).toBe(true);
  });

  test("(c) an undeclared predicate key is unknown-key", () => {
    const { findings } = run({
      ...DEFS,
      [PROFILE_PATH]: PROFILE,
      "argument/lem-a.md": shard("lem-a", {}, signatureBody({ pre: [{ bogus: "const", obj: "def-promise-gap" }] })),
    });
    expect(withCode(findings, "unknown-key")).toHaveLength(1);
  });

  test("(c) an undeclared lattice value is unknown-value", () => {
    const { findings } = run({
      ...DEFS,
      [PROFILE_PATH]: PROFILE,
      "argument/lem-a.md": shard("lem-a", {}, signatureBody({ pre: [{ gap: "enormous", obj: "def-promise-gap" }] })),
    });
    expect(withCode(findings, "unknown-value")).toHaveLength(1);
  });

  test("(d) a malformed block is signature-malformed, NEVER read as absent", () => {
    const { findings } = run({
      ...DEFS,
      [PROFILE_PATH]: PROFILE,
      "argument/lem-a.md": shard("lem-a", {}, "```signature\n{not json\n```\n"),
    });
    const hits = withCode(findings, "signature-malformed");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.structural).toBe(true);
  });

  test("a signature naming a different profile is profile-mismatch", () => {
    const { findings } = run({
      ...DEFS,
      [PROFILE_PATH]: PROFILE,
      "argument/lem-a.md": shard("lem-a", {}, signatureBody({ profile: "other.v1", pre: [{ gap: "const", obj: "def-promise-gap" }] })),
    });
    expect(withCode(findings, "profile-mismatch")).toHaveLength(1);
  });

  test("a signature present with no readable profile fails CLOSED, once", () => {
    const { findings, coverage } = run(
      { ...DEFS, "argument/lem-a.md": shard("lem-a", {}, signatureBody({ pre: [{ gap: "const", obj: "def-promise-gap" }] })) },
      ADOPTED,
    );
    const hits = withCode(findings, "profile-unreadable");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.structural).toBe(true);
    expect(coverage[0]!.unit).toContain("profile 'rk-test.v1': unreadable");
  });

  test("P's own post that the route does not supply is a WARN, not an ERROR (a proof may supply it)", () => {
    const { findings } = run({
      ...DEFS,
      [PROFILE_PATH]: PROFILE,
      "argument/lem-a.md": shard("lem-a", {}, signatureBody({ post: [{ gap: "const", obj: "def-promise-gap" }] })),
    });
    const hits = withCode(findings, "post-unsupported");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("WARN");
  });
});

describe("Check 17 — required-ness is config-driven, and never a silent skip", () => {
  const unsigned = {
    ...DEFS,
    [PROFILE_PATH]: PROFILE,
    "argument/thm-a.md": shard("thm-a", { kind: "theorem" }),
    "argument/op-a.md": shard("op-a", { kind: "open-problem" }),
  };

  test("signatures: required ⇒ a result shard with no signature is a structural ERROR", () => {
    const { findings } = run(unsigned, REQUIRED);
    const hits = withCode(findings, "signature-missing");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.path).toBe("argument/thm-a.md");
    expect(hits[0]!.severity).toBe("ERROR");
    expect(hits[0]!.structural).toBe(true);
  });

  test("signatures: optional ⇒ the same shard is a WARN (adopted, not yet enforced)", () => {
    const { findings } = run(unsigned, ADOPTED);
    const hits = withCode(findings, "signature-missing");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("WARN");
  });

  test("no `signatures` field at all ⇒ NOT ADOPTED: zero findings, said out loud on the coverage line", () => {
    const { findings, coverage } = run(unsigned, { conventionProfile: "rk-test.v1" });
    expect(withCode(findings, "signature-missing")).toEqual([]);
    expect(coverage[0]!.unit).toContain("signatures: absent (not adopted)");
  });

  test("only lemma/proposition/theorem/corollary are required to carry one", () => {
    const { findings } = run(unsigned, REQUIRED);
    expect(withCode(findings, "signature-missing").every((f) => !f.path.includes("op-a"))).toBe(true);
  });

  test("a MALFORMED signature under `required` is not ALSO reported as missing (one fault, one finding)", () => {
    const { findings } = run(
      { ...DEFS, [PROFILE_PATH]: PROFILE, "argument/thm-a.md": shard("thm-a", { kind: "theorem" }, "```signature\n{not json\n```\n") },
      REQUIRED,
    );
    expect(withCode(findings, "signature-missing")).toEqual([]);
    expect(withCode(findings, "signature-malformed")).toHaveLength(1);
  });
});

describe("Check 17 — a repo that never adopted signatures is untouched", () => {
  test("DEFAULT_GATE_CONFIG over a plain registry produces no Check 17 finding and one honest note", () => {
    const { findings, coverage } = linkerGate.run(
      snapshotFromFiles({ "argument/lem-a.md": shard("lem-a", {}) }),
      DEFAULT_GATE_CONFIG,
    );
    expect(findings).toEqual([]);
    expect(coverage[0]!.unit).toContain("signatures: absent (not adopted)");
  });
});
