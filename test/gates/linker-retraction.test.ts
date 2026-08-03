// Unit tests for src/gates/linker-retraction.ts (rk-0ehr / P1) — Gate 2's presence-conditional
// read of `.rk/retractions.jsonl` off the snapshot, and the two per-domain live-retraction views
// the linker's L5-promotion check (l5-shard-bytes) and monotone-trust check (af-canonical) consume.
// End-to-end fixture: corpus/linker/linker-44.

import { describe, expect, test } from "bun:test";
import {
  RETRACTION_STORE_PATH,
  checkRetractionVeto,
  readRetractionFacts,
  retractionStoreFindings,
} from "../../src/gates/linker-retraction";
import type { Lemma } from "../../src/gates/linker-parse";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { sha256Hex } from "../../src/gates/sha256";

const SHARD_PATH = "argument/lem-x.md";
const SHARD_BODY = "---\nid: lem-x\nkind: lemma\nstatus: stated\naf: none\ncontract: c\n---\n";
const SHARD_HASH = sha256Hex(new TextEncoder().encode(SHARD_BODY));
const OTHER_HASH = "b".repeat(64);

function lemma(o: Partial<Lemma> = {}): Lemma {
  return { id: "lem-x", path: SHARD_PATH, kind: "lemma", af: "none", contract: "c", defs: [], deps: [], routes: [], status: "stated", ...o };
}

function line(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: "1",
    ordinal: 0,
    itemId: "lem-x",
    contentHash: SHARD_HASH,
    hashDomain: "l5-shard-bytes",
    retractedBy: "audit:2026-07-28-independent-sweep",
    reason: "independent sweep found the step-3 approximation unjustified",
    ...overrides,
  });
}

describe("readRetractionFacts — presence-conditional", () => {
  test("no .rk/retractions.jsonl at all -> present:false, healthy, nothing live, zero findings", () => {
    const facts = readRetractionFacts(snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY }), [lemma()]);
    expect(facts.present).toBe(false);
    expect(facts.healthy).toBe(true);
    expect(facts.liveL5.size).toBe(0);
    expect(facts.liveAf.size).toBe(0);
    expect(retractionStoreFindings(facts)).toEqual([]);
  });

  test("an empty (but present) ledger is a legitimate state, never an ERROR", () => {
    const facts = readRetractionFacts(snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: "" }), [lemma()]);
    expect(facts.present).toBe(true);
    expect(facts.healthy).toBe(true);
    expect(retractionStoreFindings(facts)).toEqual([]);
  });
});

describe("readRetractionFacts — the l5-shard-bytes domain binds to the shard's current bytes", () => {
  test("a retraction pinned to the shard's CURRENT hash is live", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: line() + "\n" });
    const facts = readRetractionFacts(snapshot, [lemma()]);
    expect(facts.liveL5.get("lem-x")!.reason).toContain("step-3");
    expect(facts.liveAf.size).toBe(0); // the other domain is untouched
  });

  test("editing the shard releases the binding — ordinary staleness takes over", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY + "edited\n", [RETRACTION_STORE_PATH]: line() + "\n" });
    expect(readRetractionFacts(snapshot, [lemma()]).liveL5.size).toBe(0);
  });

  test("a retraction pinned to some other hash never binds to these bytes", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: line({ contentHash: OTHER_HASH }) + "\n" });
    expect(readRetractionFacts(snapshot, [lemma()]).liveL5.size).toBe(0);
  });
});

describe("readRetractionFacts — the af-canonical domain fails closed", () => {
  test("an af-canonical retraction is live regardless of the shard's raw bytes (its hash is unobservable)", () => {
    const snapshot = snapshotFromFiles({
      [SHARD_PATH]: SHARD_BODY + "edited since\n",
      [RETRACTION_STORE_PATH]: line({ hashDomain: "af-canonical", contentHash: OTHER_HASH }) + "\n",
    });
    const facts = readRetractionFacts(snapshot, [lemma({ af: "validated", workspace: "proofs/ws" })]);
    expect(facts.liveAf.get("lem-x")).toBeDefined();
    expect(facts.liveL5.size).toBe(0); // never leaks into the other domain
  });

  test("the highest-ordinal af-canonical record for an item wins", () => {
    const text = [
      line({ hashDomain: "af-canonical", contentHash: OTHER_HASH, reason: "first" }),
      line({ ordinal: 1, hashDomain: "af-canonical", contentHash: OTHER_HASH, reason: "second" }),
    ].join("\n") + "\n";
    const facts = readRetractionFacts(snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: text }), [lemma()]);
    expect(facts.liveAf.get("lem-x")!.reason).toBe("second");
  });
});

describe("readRetractionFacts — fail-closed on a corrupt store", () => {
  test("a truncated line poisons the whole store: unhealthy, nothing live, one ERROR per problem", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: line() + "\n{truncated\n" });
    const facts = readRetractionFacts(snapshot, [lemma()]);
    expect(facts.healthy).toBe(false);
    expect(facts.liveL5.size).toBe(0);
    expect(facts.liveAf.size).toBe(0);
    const findings = retractionStoreFindings(facts);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.severity === "ERROR")).toBe(true);
    expect(findings[0]!.path).toBe(RETRACTION_STORE_PATH);
    expect(findings[0]!.message).toContain("retraction store integrity compromised");
  });

  test("a broken ordinal chain (a deleted line leaving a gap) is equally fatal", () => {
    const text = [line(), line({ ordinal: 2, itemId: "lem-y" })].join("\n") + "\n";
    const facts = readRetractionFacts(snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: text }), [lemma()]);
    expect(facts.healthy).toBe(false);
    expect(retractionStoreFindings(facts).length).toBeGreaterThan(0);
  });
});

// LB3 (2026-08-03 M3-close batched Tier A review): Check 16's UNCONDITIONAL veto. The hole this
// pins closed is that enforcement used to live only inside two consumers, each reachable only
// through a precondition of its own (Check 14's L5-store presence + its two status branches; Check
// 8's `af: validated`). docs/gate-contracts.md Gate 2 Check 16, "THE VETO IS UNCONDITIONAL".
// End-to-end fixtures: corpus/linker/linker-45 (store-absent hole), linker-44, linker-46.
describe("checkRetractionVeto — enforcement independent of status vocabulary and of every other store", () => {
  // The four statuses below are chosen so NONE of them is a status Check 14 branches on
  // (`stated`/`proved-mod-audit`) except the one that is, and none carries `af: validated` (what
  // Check 8 branches on) — so every ERROR here comes from the veto alone.
  for (const status of ["proved", "consensus", "open", undefined]) {
    test(`a live l5-shard-bytes retraction ERRORs on a shard whose status is ${status ?? "unset"}`, () => {
      const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: line() + "\n" });
      const lemmas = [lemma({ status })];
      const report = checkRetractionVeto(lemmas, readRetractionFacts(snapshot, lemmas));
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0]!.severity).toBe("ERROR");
      expect(report.findings[0]!.path).toBe(SHARD_PATH);
      expect(report.findings[0]!.message).toContain("retraction veto: 'lem-x' carries a LIVE retraction (l5-shard-bytes, ordinal 0)");
      // domain, ordinal, issuer, reason, and the shard's OWN declared status are all named.
      expect(report.findings[0]!.message).toContain("audit:2026-07-28-independent-sweep");
      expect(report.findings[0]!.message).toContain("step-3 approximation unjustified");
      expect(report.findings[0]!.message).toContain(`the registry still declares status: ${status ?? "unset"}, af: none`);
    });
  }

  test("an af-canonical retraction ERRORs on the same terms (either domain, never only one)", () => {
    const snapshot = snapshotFromFiles({
      [SHARD_PATH]: SHARD_BODY,
      [RETRACTION_STORE_PATH]: line({ hashDomain: "af-canonical", contentHash: OTHER_HASH }) + "\n",
    });
    const lemmas = [lemma({ status: "proved", af: "seeded" })];
    const report = checkRetractionVeto(lemmas, readRetractionFacts(snapshot, lemmas));
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.message).toContain("(af-canonical, ordinal 0)");
  });

  test("a shard retracted in BOTH domains gets one ERROR per domain, l5-shard-bytes first (deterministic order)", () => {
    const text = [line(), line({ ordinal: 1, hashDomain: "af-canonical", contentHash: OTHER_HASH })].join("\n") + "\n";
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: text });
    const lemmas = [lemma({ status: "proved" })];
    const report = checkRetractionVeto(lemmas, readRetractionFacts(snapshot, lemmas));
    expect(report.findings).toHaveLength(2);
    expect(report.findings[0]!.message).toContain("(l5-shard-bytes, ordinal 0)");
    expect(report.findings[1]!.message).toContain("(af-canonical, ordinal 1)");
    expect(report.live).toBe(2);
    expect(report.driven).toBe(2);
  });

  test("a released (edited-since) retraction drives nothing — the veto is not a presence check", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY + "edited\n", [RETRACTION_STORE_PATH]: line() + "\n" });
    const lemmas = [lemma({ status: "proved" })];
    const report = checkRetractionVeto(lemmas, readRetractionFacts(snapshot, lemmas));
    expect(report.findings).toEqual([]);
    expect(report.live).toBe(0);
    expect(report.driven).toBe(0);
  });

  test("a CORRUPT store drives no veto (fail-closed and veto are never two descriptions of one fault)", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: line() + "\n{truncated\n" });
    const lemmas = [lemma({ status: "proved-mod-audit" })];
    const facts = readRetractionFacts(snapshot, lemmas);
    expect(checkRetractionVeto(lemmas, facts).findings).toEqual([]);
    expect(retractionStoreFindings(facts).length).toBeGreaterThan(0);
  });

  // The rk-lkeh S/J discipline: `live` and `driven` are a PAIR, so a future conditional shows up
  // as `driven < live` on the coverage line instead of being silent.
  test("coverage accounting: `driven` counts findings actually emitted, never the live count restated", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: line() + "\n" });
    const lemmas = [lemma({ status: "proved" })];
    const report = checkRetractionVeto(lemmas, readRetractionFacts(snapshot, lemmas));
    expect(report.driven).toBe(report.findings.length);
    expect(report.live).toBe(1);
  });
});

describe("readRetractionFacts — a retraction naming no registry shard is never silently dropped", () => {
  test("an unknown itemId is reported as unmatched, and binds to nothing", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: line({ itemId: "lem-ghost" }) + "\n" });
    const facts = readRetractionFacts(snapshot, [lemma()]);
    expect(facts.unmatchedItemIds).toEqual(["lem-ghost"]);
    expect(facts.liveL5.size).toBe(0);
  });
});
