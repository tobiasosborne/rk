// Gate 8 Check 4b v2 (rk-ne3a): the provenance-file route banks only an independently
// authored verification record. These are banking-site semantics; the L5-verdict route has its
// own driver-owned verifier identity and is unchanged.

import { describe, expect, test } from "bun:test";
import { pmaBacked } from "../../src/gates/reward";
import { pmaBackingDecision } from "../../src/reward/pma-backing";
import type { Lemma } from "../../src/gates/linker-parse";
import { snapshotFromFiles } from "../../src/gates/snapshot";

const CLAIM_PATH = "argument/lem-claim.md";
const RECORD_PATH = ".rk/provenance-lem-claim.json";
const PROVER = "claude|claude|claude-opus-4-8|prover-session";
const VERIFIER = "gpt|codex|gpt-5.6-sol|verifier-session";

function claim(): Lemma {
  return {
    id: "lem-claim",
    path: CLAIM_PATH,
    kind: "lemma",
    status: "proved-mod-audit",
    af: "none",
    contract: "The claim under review.",
    provenance: RECORD_PATH,
    defs: [],
    deps: [],
    routes: [],
    balloons: { count: 0, classifications: [] },
  };
}

function shard(): string {
  return [
    "---",
    "id: lem-claim",
    "kind: lemma",
    "status: proved-mod-audit",
    "af: none",
    `prover: ${PROVER}`,
    `provenance: ${RECORD_PATH}`,
    "contract: The claim under review.",
    "---",
    "",
  ].join("\n");
}

function record(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: "1",
    claimId: "lem-claim",
    author: VERIFIER,
    role: "verifier",
    ...overrides,
  });
}

describe("Gate 8 Check 4b v2 — provenance-record independence", () => {
  test("the claim prover's own record never backs its proved-mod-audit close", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record({ author: PROVER }),
    });
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
    const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
    expect(decision.backed).toBe(false);
    if (!decision.backed) expect(decision.reason).toContain("same recorded identity seam");
  });

  test("the same model with a different session remains self-review and never backs", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record({ author: "claude|claude|claude-opus-4-8|review-session" }),
    });
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
  });

  test("case-shifting backend/model components cannot disguise the same model", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record({ author: "claude|CLAUDE|CLAUDE-OPUS-4-8|review-session" }),
    });
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
  });

  test("leading or trailing whitespace makes a recorded seam non-canonical", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record({ author: "gpt| codex|gpt-5.6-sol|review-session" }),
    });
    const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
    expect(decision.backed).toBe(false);
    if (!decision.backed) expect(decision.reason).toContain("leading or trailing whitespace");
  });

  test("an authorless record never backs its proved-mod-audit close", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: JSON.stringify({ schema_version: "1", claimId: "lem-claim", role: "verifier" }),
    });
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
  });

  test("an independent verifier's recorded identity backs the claim", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record(),
    });
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(true);
  });

  test("a hash-visible out-of-tree record names the canonical text-record location", () => {
    const outside = "docs/worker-output/review.json";
    const target = { ...claim(), provenance: outside };
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard().replace(`provenance: ${RECORD_PATH}`, `provenance: ${outside}`),
      [outside]: record(),
    });
    (snapshot as Map<string, string>).delete(outside);
    const decision = pmaBackingDecision(snapshot, target, [target]);
    expect(decision.backed).toBe(false);
    if (!decision.backed) {
      expect(decision.reason).toContain("outside the snapshot text-record boundary");
      expect(decision.reason).toContain(".rk/<name>.json");
    }
  });
});
