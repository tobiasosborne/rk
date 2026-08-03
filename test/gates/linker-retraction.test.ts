// Unit tests for src/gates/linker-retraction.ts (rk-0ehr / P1) — Gate 2's presence-conditional
// read of `.rk/retractions.jsonl` off the snapshot, and the two per-domain live-retraction views
// the linker's L5-promotion check (l5-shard-bytes) and monotone-trust check (af-canonical) consume.
// End-to-end fixture: corpus/linker/linker-44.

import { describe, expect, test } from "bun:test";
import { RETRACTION_STORE_PATH, readRetractionFacts, retractionStoreFindings } from "../../src/gates/linker-retraction";
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

describe("readRetractionFacts — a retraction naming no registry shard is never silently dropped", () => {
  test("an unknown itemId is reported as unmatched, and binds to nothing", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [RETRACTION_STORE_PATH]: line({ itemId: "lem-ghost" }) + "\n" });
    const facts = readRetractionFacts(snapshot, [lemma()]);
    expect(facts.unmatchedItemIds).toEqual(["lem-ghost"]);
    expect(facts.liveL5.size).toBe(0);
  });
});
