// 1:1 test for src/drive/cross-vendor.ts (M3.8 deliverable 1) — the apply-time half of the
// cross-vendor rule (PRD C9 / docs/worker-contract.md section (e)). See driver-run.test.ts for the
// end-to-end wiring proof (same-family critical-path apply REJECTED before the verdict file is
// ever written).

import { describe, expect, test } from "bun:test";
import { crossVendorRejectionMessage, decideCrossVendor, proverOfRecord } from "../../src/drive/cross-vendor";

const CLAUDE_A = "claude|claude-code|opus|s1";
const CLAUDE_B = "claude|claude-code|opus|s2";
const GPT_A = "gpt|codex|gpt-5.6|s3";
const INIT_STAMP = "rk-m3.5-baseline-prep"; // an `af init` author — decodes to no model family

describe("decideCrossVendor — load-bearing (critical-path) claims", () => {
  test("cross-family: satisfied, reason cross-family", () => {
    const d = decideCrossVendor(CLAUDE_A, GPT_A, true);
    expect(d).toEqual({ satisfied: true, reason: "cross-family", proverFamily: "claude", verifierFamily: "gpt" });
  });

  test("same-family (both decode, same family): REJECTED", () => {
    const d = decideCrossVendor(CLAUDE_A, CLAUDE_B, true);
    expect(d.satisfied).toBe(false);
    expect(d.reason).toBe("same-family");
    expect(d.proverFamily).toBe("claude");
    expect(d.verifierFamily).toBe("claude");
  });

  test("author absent entirely: fails closed, reason identity-unparseable (never same-family)", () => {
    const d = decideCrossVendor(undefined, GPT_A, true);
    expect(d.satisfied).toBe(false);
    expect(d.reason).toBe("identity-unparseable");
    expect(d.proverFamily).toBeUndefined();
    expect(d.verifierFamily).toBe("gpt");
  });

  test("author present but unparseable free text: fails closed, identity-unparseable", () => {
    const d = decideCrossVendor("codex", GPT_A, true);
    expect(d.satisfied).toBe(false);
    expect(d.reason).toBe("identity-unparseable");
    expect(d.proverFamily).toBeUndefined();
  });

  test("verifier seam itself unparseable: identity-unparseable (defensive — driver always supplies an encodable seam, but this function never trusts that)", () => {
    const d = decideCrossVendor(CLAUDE_A, "not-a-seam", true);
    expect(d.satisfied).toBe(false);
    expect(d.reason).toBe("identity-unparseable");
  });
});

describe("decideCrossVendor — non-critical-path claims (loadBearing=false)", () => {
  test("same-family is ALLOWED but still RECORDED (satisfied true, reason same-family)", () => {
    const d = decideCrossVendor(CLAUDE_A, CLAUDE_B, false);
    expect(d.satisfied).toBe(true);
    expect(d.reason).toBe("same-family");
  });

  test("identity-unparseable is likewise allowed off the critical path", () => {
    const d = decideCrossVendor(undefined, GPT_A, false);
    expect(d.satisfied).toBe(true);
    expect(d.reason).toBe("identity-unparseable");
  });

  test("cross-family stays satisfied", () => {
    const d = decideCrossVendor(CLAUDE_A, GPT_A, false);
    expect(d.satisfied).toBe(true);
    expect(d.reason).toBe("cross-family");
  });
});

describe("proverOfRecord — GAP 9 proof-author precedence", () => {
  test("proof-author present takes precedence over the node author", () => {
    expect(proverOfRecord(CLAUDE_A, INIT_STAMP)).toBe(CLAUDE_A);
  });
  test("no proof-author falls back to the node author (unchanged pre-GAP-9)", () => {
    expect(proverOfRecord(undefined, INIT_STAMP)).toBe(INIT_STAMP);
  });
  test("neither recorded stays undefined (still fails closed downstream)", () => {
    expect(proverOfRecord(undefined, undefined)).toBeUndefined();
  });
});

describe("GAP 9: decomposed-root cross-vendor via proof-author (the apply gate's precedence)", () => {
  // The exact RUN-REPORT-8 shape: a root whose `af init` author is unparseable, decomposed by the
  // codex/gpt prover (proof_author), re-verified by the claude verifier. Before GAP 9 the gate read
  // node.author (INIT_STAMP) → prover=unknown → fails closed. Now it reads proof_author first.
  test("unparseable init-author + gpt proof-author + claude verifier → PASSES (cross-family)", () => {
    const d = decideCrossVendor(proverOfRecord(GPT_A, INIT_STAMP), CLAUDE_A, true);
    expect(d.satisfied).toBe(true);
    expect(d.reason).toBe("cross-family");
    expect(d.proverFamily).toBe("gpt");
    expect(d.verifierFamily).toBe("claude");
  });

  test("same-family proof-author/verifier → STILL REJECTED (proof-author does not bypass the rule)", () => {
    const d = decideCrossVendor(proverOfRecord(CLAUDE_A, INIT_STAMP), CLAUDE_B, true);
    expect(d.satisfied).toBe(false);
    expect(d.reason).toBe("same-family");
  });

  test("NO proof-author + unparseable author → STILL fails closed (fail-closed posture untouched)", () => {
    const d = decideCrossVendor(proverOfRecord(undefined, INIT_STAMP), CLAUDE_A, true);
    expect(d.satisfied).toBe(false);
    expect(d.reason).toBe("identity-unparseable");
  });
});

describe("crossVendorRejectionMessage", () => {
  test("distinguishes same-family from identity-unparseable in the message text", () => {
    const same = decideCrossVendor(CLAUDE_A, CLAUDE_B, true);
    const unknown = decideCrossVendor(undefined, GPT_A, true);
    const msgSame = crossVendorRejectionMessage("1.2", same);
    const msgUnknown = crossVendorRejectionMessage("1.2", unknown);
    expect(msgSame).toContain("same-family");
    expect(msgSame).not.toContain("identity-unparseable");
    expect(msgUnknown).toContain("identity-unparseable");
    expect(msgUnknown).not.toContain("same-family on load-bearing");
  });

  test("throws on a satisfied decision (never fabricates a rejection message for a pass)", () => {
    const ok = decideCrossVendor(CLAUDE_A, GPT_A, true);
    expect(() => crossVendorRejectionMessage("1.2", ok)).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// rk-bun: `resolveLoadBearing` — the INPUT resolver for `decideCrossVendor`'s third argument.
// Ground truth: PRD C2 ("every node on the path to the north-star contract"; the check runs
// "continuously ... because path membership changes when edges are added, not only at verdict-apply
// time") and PRD C9's cross-vendor paragraph ("Non-critical-path: same-family allowed, recorded").
// Before this bead the live driver hard-coded `isLoadBearing: () => true`, so real path membership
// was never computed at all.
import { LOAD_BEARING_DETERMINACY, describeLoadBearing, resolveLoadBearing, type LoadBearingReason } from "../../src/drive/cross-vendor";
import { GRAPH_SCHEMA_VERSION, type GraphDocument, type RegistryNode } from "../../src/graph/types";

function regNode(id: string, overrides: Partial<RegistryNode> = {}): RegistryNode {
  return { id, kind: "lemma", path: `argument/${id}.md`, contract: `${id} holds.`, af: "none", deps: [], routes: [], defs: [], balloons: { count: 0, classifications: [] }, ...overrides };
}
function doc(nodes: RegistryNode[]): GraphDocument {
  return { schema_version: GRAPH_SCHEMA_VERSION, nodes, edges: { af: [], bd: [], fr: [], report: [] }, unresolved: [], conflicts: [] };
}

// star --dep--> mid --dep--> deep ; star --route--> alt-a | alt-b ; island is reachable from nothing.
const CAMPAIGN = doc([
  regNode("star", { deps: ["mid"], routes: [["alt-a"], ["alt-b"]] }),
  regNode("mid", { deps: ["deep"] }),
  regNode("deep"),
  regNode("alt-a"),
  regNode("alt-b"),
  regNode("island"),
]);

describe("resolveLoadBearing — DETERMINED membership (a north star that resolves)", () => {
  test("the north star itself is on the path: load-bearing, determined", () => {
    const r = resolveLoadBearing(CAMPAIGN, "star", "star");
    expect(r).toMatchObject({ loadBearing: true, determinacy: "determined", reason: "on-critical-path" });
  });

  test("a transitive AND-dep is on the path: load-bearing, determined", () => {
    expect(resolveLoadBearing(CAMPAIGN, "star", "deep")).toMatchObject({ loadBearing: true, reason: "on-critical-path" });
  });

  test("an OR-route member is on the path even though its route is not the satisfied one (query-path.ts's over-inclusive reading)", () => {
    expect(resolveLoadBearing(CAMPAIGN, "star", "alt-b")).toMatchObject({ loadBearing: true, reason: "on-critical-path" });
  });

  // THE case rk-bun exists to make expressible: a node GENUINELY off the path. This is the only
  // reason in the whole enum that ever yields loadBearing:false.
  test("a node reachable from the north star by no dep/route path at all: NOT load-bearing, DETERMINED", () => {
    const r = resolveLoadBearing(CAMPAIGN, "star", "island");
    expect(r).toMatchObject({ loadBearing: false, determinacy: "determined", reason: "off-critical-path" });
    expect(r.detail).toContain("island");
    expect(r.detail).toContain("star");
  });
});

describe("resolveLoadBearing — INDETERMINATE membership always fails CLOSED (load-bearing)", () => {
  test("no north star configured at all: load-bearing, INDETERMINATE, and the detail SAYS which kind of unknown", () => {
    const r = resolveLoadBearing(CAMPAIGN, undefined, "island");
    expect(r).toMatchObject({ loadBearing: true, determinacy: "indeterminate", reason: "north-star-unconfigured" });
    expect(r.detail).toContain("northStarId");
    expect(r.detail).toContain("--north-star");
  });

  test("a blank/whitespace north star is the same as none (never treated as an id)", () => {
    expect(resolveLoadBearing(CAMPAIGN, "   ", "island").reason).toBe("north-star-unconfigured");
    expect(resolveLoadBearing(CAMPAIGN, "", "island").reason).toBe("north-star-unconfigured");
  });

  test("a configured north star naming NO registry node: load-bearing, INDETERMINATE, distinct reason from 'unconfigured'", () => {
    const r = resolveLoadBearing(CAMPAIGN, "typo-star", "island");
    expect(r).toMatchObject({ loadBearing: true, determinacy: "indeterminate", reason: "north-star-unresolved" });
    expect(r.detail).toContain("typo-star");
    expect(r.reason).not.toBe("north-star-unconfigured");
  });

  test("the CLAIM itself names no registry node: load-bearing, INDETERMINATE (never silently 'off the path')", () => {
    const r = resolveLoadBearing(CAMPAIGN, "star", "ghost");
    expect(r).toMatchObject({ loadBearing: true, determinacy: "indeterminate", reason: "claim-not-in-graph" });
    expect(r.reason).not.toBe("off-critical-path");
  });

  test("an EMPTY graph with a north star: unresolved, not 'off the path' (the linker-40 posture)", () => {
    expect(resolveLoadBearing(doc([]), "star", "star").reason).toBe("north-star-unresolved");
    expect(resolveLoadBearing(doc([]), "star", "star").loadBearing).toBe(true);
  });
});

describe("resolveLoadBearing — the fail-closed invariants, stated as properties", () => {
  test("coverage: every reason in the enum has a determinacy (checked N/N, no silent skip)", () => {
    const reasons = Object.keys(LOAD_BEARING_DETERMINACY) as LoadBearingReason[];
    expect(reasons.length).toBe(5);
    for (const r of reasons) expect(["determined", "indeterminate"]).toContain(LOAD_BEARING_DETERMINACY[r]);
  });

  test("INDETERMINATE is never the permissive answer: every indeterminate reason is load-bearing", () => {
    const indeterminate = (Object.keys(LOAD_BEARING_DETERMINACY) as LoadBearingReason[]).filter((r) => LOAD_BEARING_DETERMINACY[r] === "indeterminate");
    expect(indeterminate.sort()).toEqual(["claim-not-in-graph", "north-star-unconfigured", "north-star-unresolved"]);
    // and every resolver path that reports one actually carries loadBearing:true
    expect(resolveLoadBearing(CAMPAIGN, undefined, "island").loadBearing).toBe(true);
    expect(resolveLoadBearing(CAMPAIGN, "typo-star", "island").loadBearing).toBe(true);
    expect(resolveLoadBearing(CAMPAIGN, "star", "ghost").loadBearing).toBe(true);
  });

  test("`off-critical-path` is the ONLY reason that ever yields loadBearing:false", () => {
    const inputs: [string | undefined, string][] = [[undefined, "island"], ["typo-star", "island"], ["star", "ghost"], ["star", "island"], ["star", "deep"], ["star", "star"]];
    for (const [ns, claim] of inputs) {
      const r = resolveLoadBearing(CAMPAIGN, ns, claim);
      if (!r.loadBearing) expect(r.reason).toBe("off-critical-path");
      if (r.determinacy === "indeterminate") expect(r.loadBearing).toBe(true);
    }
  });

  test("describeLoadBearing distinguishes all five reasons in its text (an unknown is never worded as a known)", () => {
    const texts = new Set([
      describeLoadBearing(resolveLoadBearing(CAMPAIGN, "star", "star")),
      describeLoadBearing(resolveLoadBearing(CAMPAIGN, "star", "island")),
      describeLoadBearing(resolveLoadBearing(CAMPAIGN, undefined, "island")),
      describeLoadBearing(resolveLoadBearing(CAMPAIGN, "typo-star", "island")),
      describeLoadBearing(resolveLoadBearing(CAMPAIGN, "star", "ghost")),
    ]);
    expect(texts.size).toBe(5);
    // the two DETERMINED answers say so; the three unknowns say they are unknown and fail closed.
    expect(describeLoadBearing(resolveLoadBearing(CAMPAIGN, "star", "island"))).toContain("off the critical path");
    expect(describeLoadBearing(resolveLoadBearing(CAMPAIGN, undefined, "island"))).toContain("INDETERMINATE");
    expect(describeLoadBearing(resolveLoadBearing(CAMPAIGN, undefined, "island"))).toContain("every node is treated as load-bearing");
  });
});
