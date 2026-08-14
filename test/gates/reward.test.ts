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

/** A schema-complete record. `verdict`/`reason` are present because the schema requires them and
 * (since the 2026-08-12 repair wave, bead rk-xrgn) the banking site reads them: the green controls
 * here stay green by carrying HONEST fields, never by the check being lenient. */
function record(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: "1",
    claimId: "lem-claim",
    claimSha256: claimBytesHash(),
    author: VERIFIER,
    role: "verifier",
    verdict: "VALID",
    reason: "Independent hostile verification of the statement and its proof survived.",
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
      // Complete but for the author, so the refusal isolates anonymity.
      [RECORD_PATH]: (() => {
        const bare = JSON.parse(record()) as Record<string, unknown>;
        delete bare.author;
        return JSON.stringify(bare);
      })(),
    });
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
  });

  // REPAIR WAVE 2026-08-12, Tier A finding 2 (bead rk-xrgn). The banking site checked WHO wrote
  // the record, for WHICH claim, and against WHICH bytes — but never what the record SAID. A
  // hand-authored record carrying `verdict: "REFUTED"`, no verdict at all, or a blank reason
  // reached the success return and banked a proved-mod-audit close. The schema
  // (schemas/provenance-record.v1.json) had been normative for producers only; it is now enforced
  // where the money moves, fail-closed, with a distinct refusal per field.
  test("a REFUTED record never backs — a refutation is not an endorsement (rk-xrgn)", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record({ verdict: "REFUTED" }),
    });
    const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
    expect(decision.backed).toBe(false);
    if (!decision.backed) expect(decision.reason).toContain("REFUTED");
  });

  test("a record with no verdict at all never backs, and says so distinctly", () => {
    const bare = JSON.parse(record()) as Record<string, unknown>;
    delete bare.verdict;
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: JSON.stringify(bare),
    });
    const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
    expect(decision.backed).toBe(false);
    if (!decision.backed) expect(decision.reason).toContain("records no 'verdict'");
  });

  test("VALID-WITH-CORRECTION never backs route (i), exactly as it never backs route (ii)", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record({ verdict: "VALID-WITH-CORRECTION" }),
    });
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
  });

  test("a blank or missing reason never backs — an unexplained attestation is not auditable", () => {
    for (const reason of ["", "   ", undefined, 7]) {
      const bare = JSON.parse(record()) as Record<string, unknown>;
      if (reason === undefined) delete bare.reason;
      else bare.reason = reason;
      const snapshot = snapshotFromFiles({
        [CLAIM_PATH]: shard(),
        [RECORD_PATH]: JSON.stringify(bare),
      });
      const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
      expect(decision.backed).toBe(false);
      if (!decision.backed) expect(decision.reason).toContain("'reason'");
    }
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
    // Every OTHER clause is satisfied (honest verdict and reason included, per rk-xrgn) so the
    // refusal isolates the missing content binding rather than tripping an earlier check.
    const bare = JSON.parse(record()) as Record<string, unknown>;
    delete bare.claimSha256;
    const withoutBinding = JSON.stringify(bare);
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
    const selfBound = record({ claimSha256: claimBytesHash(record()) });
    const snapshot = snapshotFromFiles({ [CLAIM_PATH]: shard(), [RECORD_PATH]: selfBound });
    const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
    expect(decision.backed).toBe(false);
    // Refused as STALE — every other clause passes, so the binding is what is under test.
    if (!decision.backed) expect(decision.reason).toContain("stale");
  });
});

// Gate 8 Check 4b's WITHDRAWAL PRECONDITION (bead rk-yic3, P1 Tier A). Route (ii) refused backing
// on a live retraction in either hash domain and on an unhealthy retraction ledger; route (i) read
// neither, and `pmaBackingDecision` tried route (i) FIRST and returned the moment it backed. So a
// claim whose L5 verdict had been retracted still banked proved-mod-audit through a hand-written
// `.rk/` provenance record — route (i) was the weaker sibling of a rule route (ii) already
// enforced. The retraction facts now bind BOTH routes, ahead of either. Red corpus:
// corpus/reward/reward-27 (live retraction) and corpus/reward/reward-28 (poisoned ledger).
describe("Gate 8 Check 4b — a withdrawn claim is unbacked by EITHER route (rk-yic3)", () => {
  const RETRACTIONS = ".rk/retractions.jsonl";

  function retraction(overrides: Record<string, unknown> = {}): string {
    return `${JSON.stringify({
      schemaVersion: "1",
      ordinal: 0,
      itemId: "lem-claim",
      contentHash: claimBytesHash(),
      hashDomain: "l5-shard-bytes",
      retractedBy: "audit:2026-08-14-independent-sweep",
      reason: "the endorsed argument reuses the very bound it is meant to establish",
      ...overrides,
    })}\n`;
  }

  test("a live l5-shard-bytes retraction refuses the PROVENANCE route, not merely the L5 route", () => {
    // Everything route (i) ever looked at is impeccable: this record backs the identical claim in
    // the sibling test above ("an independent verifier's recorded identity backs the claim").
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record(),
      [RETRACTIONS]: retraction(),
    });
    const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
    expect(decision.backed).toBe(false);
    if (!decision.backed) {
      expect(decision.reason).toContain("live retraction");
      expect(decision.reason).toContain("l5-shard-bytes");
      expect(decision.reason).toContain("audit:2026-08-14-independent-sweep");
    }
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
  });

  test("a live af-canonical retraction refuses the provenance route too — both domains bind", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record(),
      // af-canonical liveness is fail-closed: rk cannot observe an item's current af-canonical
      // hash, so the value below never has to match anything (src/gates/linker-retraction.ts).
      [RETRACTIONS]: retraction({ hashDomain: "af-canonical", contentHash: "a".repeat(64) }),
    });
    const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
    expect(decision.backed).toBe(false);
    if (!decision.backed) expect(decision.reason).toContain("af-canonical");
  });

  test("an unhealthy retraction ledger refuses backing on the provenance route, fail closed", () => {
    // A poisoned store yields ZERO live retractions by construction, so this failure mode is NOT
    // reachable through the live-retraction tests above — it needs its own assertion, exactly as
    // it needs its own corpus fixture (reward-28).
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record(),
      [RETRACTIONS]: `${retraction().trim().slice(0, 80)}\n`,
    });
    const decision = pmaBackingDecision(snapshot, claim(), [claim()]);
    expect(decision.backed).toBe(false);
    if (!decision.backed) expect(decision.reason).toContain("retraction ledger is unhealthy");
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(false);
  });

  test("a retraction whose hash no longer binds releases the claim — the veto is a real comparison", () => {
    // The green control. An edit releases the binding (src/drive/retraction-record.ts's header):
    // this must NOT degrade into "any retraction record for this id ever refuses backing", which
    // would make the fixtures above pass for the wrong reason.
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record(),
      [RETRACTIONS]: retraction({ contentHash: claimBytesHash(`${shard()}an earlier revision\n`) }),
    });
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(true);
  });

  test("a retraction naming a DIFFERENT claim never refuses this one's backing", () => {
    const snapshot = snapshotFromFiles({
      [CLAIM_PATH]: shard(),
      [RECORD_PATH]: record(),
      [RETRACTIONS]: retraction({ itemId: "lem-some-other-claim" }),
    });
    expect(pmaBacked(snapshot, claim(), [claim()])).toBe(true);
  });
});
