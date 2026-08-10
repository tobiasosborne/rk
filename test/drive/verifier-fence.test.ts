// 1:1 test for src/drive/verifier-fence.ts (rk-fs8v): verifier briefs may fence an input from
// scrutiny only through a structured claimId/verdictRef pair confirmed against healthy L5 and
// retraction stores. The corpus fixture is the real Campaign-A window-3 failure class.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseL5Log } from "../../src/drive/l5-store";
import { parseRetractionLog } from "../../src/drive/retraction-store";
import {
  validateVerifierFences,
  verdictRefFor,
  type AssumedVerified,
  type VerifierFenceStoreState,
} from "../../src/drive/verifier-fence";
import type { L5StoredVerdict } from "../../src/drive/l5-record";

const FIXTURE = join(import.meta.dir, "../../corpus/drive/verifier-fence-citable-record");
const HASH = "a".repeat(64);

function record(overrides: Partial<L5StoredVerdict> = {}): L5StoredVerdict {
  return {
    schemaVersion: "1",
    ordinal: 0,
    itemId: "lem-a",
    l5ContentHash: HASH,
    verdict: "VALID",
    justification: "checked",
    verifierSeam: "gpt|codex|gpt-5.6-sol|s",
    ...overrides,
  };
}

function state(records: L5StoredVerdict[] = [record()]): VerifierFenceStoreState {
  return {
    l5: { records, issues: [] },
    retractions: { records: [], issues: [] },
    currentHashes: new Map([["lem-a", HASH]]),
  };
}

describe("validateVerifierFences", () => {
  test("the incident corpus refuses missing, stale, retracted, and wrong-claim refs; confirms only the fresh VALID ref", () => {
    const brief = JSON.parse(readFileSync(join(FIXTURE, "brief.json"), "utf8")) as { assumedVerified: AssumedVerified[] };
    const hashes = JSON.parse(readFileSync(join(FIXTURE, "current-hashes.json"), "utf8")) as Record<string, string>;
    const result = validateVerifierFences(brief.assumedVerified, {
      l5: parseL5Log(readFileSync(join(FIXTURE, "repo/.rk/l5-verdicts.jsonl"), "utf8")),
      retractions: parseRetractionLog(readFileSync(join(FIXTURE, "repo/.rk/retractions.jsonl"), "utf8")),
      currentHashes: new Map(Object.entries(hashes)),
    });

    expect(result.coverage).toEqual({ checked: 5, total: 5, confirmed: 1, refused: 4 });
    expect(result.confirmed.map((f) => f.claimId)).toEqual(["lem-valid"]);
    expect(result.refusals.map((r) => r.reason)).toEqual([
      "verdict-ref-missing",
      "stale",
      "retracted",
      "claim-not-covered",
    ]);
  });

  test("only the latest fresh plain VALID record confirms, with its hash and citable locus", () => {
    const r = record();
    const result = validateVerifierFences([{ claimId: "lem-a", verdictRef: verdictRefFor(r) }], state([r]));
    expect(result.refusals).toEqual([]);
    expect(result.confirmed[0]).toMatchObject({
      claimId: "lem-a",
      verdictRef: ".rk/l5-verdicts.jsonl#ordinal=0",
      contentHash: HASH,
      locus: ".rk/l5-verdicts.jsonl:1",
      verdict: "VALID",
    });
  });

  test("a malformed/blank verdictRef is refused, never treated as an absent optional fence", () => {
    const result = validateVerifierFences([{ claimId: "lem-a", verdictRef: " " }], state());
    expect(result.refusals[0]?.reason).toBe("verdict-ref-missing");
    const padded = validateVerifierFences([{ claimId: "lem-a", verdictRef: ` ${verdictRefFor(record())}` }], state());
    expect(padded.refusals[0]?.reason).toBe("verdict-ref-missing");
    const missingRef = validateVerifierFences([{ claimId: "lem-a" } as AssumedVerified], state());
    expect(missingRef.refusals[0]).toMatchObject({ claimId: "lem-a", verdictRef: "", reason: "verdict-ref-missing" });
    const missingClaim = validateVerifierFences([{ verdictRef: verdictRefFor(record()) } as AssumedVerified], state());
    expect(missingClaim.refusals[0]).toMatchObject({ claimId: "", reason: "claim-not-covered" });
  });

  test("a superseded cited record is refused even when its own hash still matches", () => {
    const older = record({ ordinal: 0 });
    const latest = record({ ordinal: 1, verdict: "INVALID" });
    const result = validateVerifierFences([{ claimId: "lem-a", verdictRef: verdictRefFor(older) }], state([older, latest]));
    expect(result.refusals[0]?.reason).toBe("invalid");
  });

  test("corruption in either validity ledger poisons every fence instead of silently trusting parsed prefixes", () => {
    const fence = [{ claimId: "lem-a", verdictRef: verdictRefFor(record()) }];
    const badL5 = { ...state(), l5: parseL5Log(JSON.stringify(record()) + "\n{truncated\n") };
    expect(validateVerifierFences(fence, badL5).refusals[0]?.reason).toBe("l5-store-unhealthy");
    const badRetractions = { ...state(), retractions: parseRetractionLog("{truncated\n") };
    expect(validateVerifierFences(fence, badRetractions).refusals[0]?.reason).toBe("retraction-store-unhealthy");
  });

  test("zero declared fences is explicit 0/0 coverage and needs no store", () => {
    expect(validateVerifierFences([], state())).toEqual({
      coverage: { checked: 0, total: 0, confirmed: 0, refused: 0 },
      confirmed: [],
      refusals: [],
    });
  });
});
