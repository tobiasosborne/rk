// Gate 8 Check 4b v2 (rk-ne3a): the provenance-file route banks only an independently
// authored verification record. These are banking-site semantics; the L5-verdict route has its
// own driver-owned verifier identity and is unchanged.

import { describe, expect, test } from "bun:test";
import { pmaBacked } from "../../src/gates/reward";
import { pmaBackingDecision } from "../../src/reward/pma-backing";
import type { Lemma } from "../../src/gates/linker-parse";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { sha256Hex } from "../../src/gates/sha256";

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

/** The sha256 of the exact claim-shard bytes `shard()` produces — what an honest verifier
 * records after reading them, and what `snapshotFromFiles` hashes them to (test/gates/
 * sha256.test.ts proves that hasher is byte-identical to the edge's). */
function claimBytesHash(text: string = shard()): string {
  return sha256Hex(new TextEncoder().encode(text));
}

function record(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: "1",
    claimId: "lem-claim",
    claimSha256: claimBytesHash(),
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

  test("an uppercase-hex content binding is compared case-insensitively, not rejected", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record({ claimSha256: claimBytesHash().toUpperCase() }),
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

// Gate 8 Check 4b(i) content binding (rk-io5l). Ported from campaign C's convergently-invented
// record-integrity oracle (../rk-campaign-C/scripts/oracle-record-integrity.py:45-55): a bank
// verdict is only worth what it is BOUND to. The L5 route (ii) has had this property since M3.7
// (src/drive/l5-store.ts: fresh iff the current shard bytes hash to the recorded
// `l5ContentHash`); the provenance route (i) did not, so a record written against one revision
// of a shard kept backing every later rewrite of it. Recorded-and-checkable only: an author who
// forges the current hash is not detected here (the V1/V2 honesty stance), staleness is.
describe("Gate 8 Check 4b(i) — the backing record binds to the claim bytes it reviewed", () => {
  test("a record that names no reviewed claim bytes never backs", () => {
    const withoutBinding = JSON.stringify({
      schema_version: "1", claimId: "lem-claim", author: VERIFIER, role: "verifier",
    });
    const snapshot = snapshotFromFiles({ [CLAIM_PATH]: shard(), [RECORD_PATH]: withoutBinding });
    const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
    expect(decision.backed).toBe(false);
    if (!decision.backed) expect(decision.reason).toContain("claimSha256");
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
  });

  test("a record bound to superseded claim bytes is stale and never backs", () => {
    // The exact campaign shape: verifier endorses revision 1, the shard is then edited (campaign
    // C's "ENDORSE WITH REVISIONS applied"), and the record must not silently carry over.
    const reviewed = shard();
    const rewritten = `${reviewed}A materially different claim body landed after the review.\n`;
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: rewritten,
      [RECORD_PATH]: record({ claimSha256: claimBytesHash(reviewed) }),
    });
    const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
    expect(decision.backed).toBe(false);
    if (!decision.backed) {
      expect(decision.reason).toContain("stale");
      expect(decision.reason).toContain(claimBytesHash(reviewed).slice(0, 12));
      expect(decision.reason).toContain(claimBytesHash(rewritten).slice(0, 12));
    }
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
  });

  test("a malformed content binding is refused, never coerced into a match", () => {
    for (const bad of ["deadbeef", "", claimBytesHash().slice(0, 63), `${claimBytesHash()} `, "zz"]) {
      const snapshot = snapshotFromFiles({
        [CLAIM_PATH]: shard(),
        [RECORD_PATH]: record({ claimSha256: bad }),
      });
      expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
    }
    const nonString = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record({ claimSha256: 12345 }),
    });
    expect(pmaBacked(nonString, claim(), [claim()])).toBe(false);
  });

  test("binding to the record's own bytes is not binding to the claim", () => {
    const selfBound = JSON.stringify({
      schema_version: "1", claimId: "lem-claim", author: VERIFIER, role: "verifier",
      claimSha256: claimBytesHash(record()),
    });
    const snapshot = snapshotFromFiles({ [CLAIM_PATH]: shard(), [RECORD_PATH]: selfBound });
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
  });
});
