// rk-tlwb: the provenance-record producer contract. Check 4b v2's independence route (route (i),
// docs/gate-contracts.md Gate 8 Check 4) has always CONSUMED a `.rk/<name>.json` authorship record
// and nothing in rk ever PRODUCED one — campaign A wrote prose reports instead and drew 12
// [reward-tier-unbacked] errors. These tests pin the producer: schemas/provenance-record.v1.json
// is the normative shape, src/reward/provenance-record.ts is its runtime validator, and the last
// describe-block is the ANTI-DRIFT guard — every record the producer accepts must actually back a
// close through the consumer (src/reward/pma-backing.ts), and every seam the producer rejects must
// fail there too. Two modules implementing "canonical identity seam" separately is exactly the
// divergence that would make the writer emit records the gate refuses.
//
// L1 red-green: written before src/reward/provenance-record.ts existed (import error = RED); each
// assertion below was then re-reddened by perturbing the implementation (see the wave report).

import { describe, expect, test } from "bun:test";
import schema from "../../schemas/provenance-record.v1.json";
import {
  PROVENANCE_RECORD_OPTIONAL_KEYS,
  PROVENANCE_RECORD_REQUIRED_KEYS,
  PROVENANCE_RECORD_ROLES,
  PROVENANCE_RECORD_SCHEMA_VERSION,
  PROVENANCE_RECORD_VERDICT,
  buildProvenanceRecord,
  parseProvenanceRecord,
  provenanceRecordPath,
  serializeProvenanceRecord,
  validateProvenanceRecord,
} from "../../src/reward/provenance-record";
import { parseRegistry } from "../../src/gates/linker-parse";
import { pmaBackingDecision } from "../../src/reward/pma-backing";
import { fileSha256, snapshotFromFiles } from "../../src/gates/snapshot";

const PROVER = "claude|claude|claude-opus-4-8|claim-session";
const VERIFIER = "gpt|codex|gpt-5.6-sol|019fe0f0-f003-7eb0-b754-3a856f591a8c";

const SHARD_TEXT = [
  "---",
  "id: lem-a",
  "kind: lemma",
  "status: proved-mod-audit",
  "af: none",
  `prover: ${PROVER}`,
  "provenance: .rk/provenance-lem-a.json",
  "contract: A claim attested by an independent verifier.",
  "---",
  "",
  "Body.",
].join("\n");

/** The claim shard's own byte hash — rk-io5l's content binding pins every record to it. */
const SHARD_SHA = fileSha256(snapshotFromFiles({ "argument/lem-a.md": SHARD_TEXT }), "argument/lem-a.md")!;

const input = (over: Record<string, unknown> = {}) => ({
  claimId: "lem-a",
  claimSha256: SHARD_SHA,
  author: VERIFIER,
  role: "verifier" as const,
  reason: "Independent hostile verification survived; two constants corrected.",
  ...over,
});

describe("schemas/provenance-record.v1.json is normative for the runtime validator", () => {
  test("the schema's required/optional key sets are exactly the validator's", () => {
    expect([...schema.required].sort()).toEqual([...PROVENANCE_RECORD_REQUIRED_KEYS].sort());
    const optional = Object.keys(schema.properties).filter((k) => !schema.required.includes(k as never));
    expect(optional.sort()).toEqual([...PROVENANCE_RECORD_OPTIONAL_KEYS].sort());
    expect(schema.additionalProperties).toBe(false);
  });

  test("the schema pins the version, the role vocabulary, and the single backing verdict", () => {
    expect(schema.properties.schema_version.const).toBe(PROVENANCE_RECORD_SCHEMA_VERSION);
    expect([...schema.properties.role.enum].sort()).toEqual([...PROVENANCE_RECORD_ROLES].sort());
    expect(schema.properties.verdict.const).toBe(PROVENANCE_RECORD_VERDICT);
  });
});

describe("buildProvenanceRecord — a record is refused before it can lie", () => {
  test("a well-formed input round-trips through serialize/parse unchanged", () => {
    const built = buildProvenanceRecord(input(), "2026-08-12T00:00:00Z");
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.schema_version).toBe("1");
    expect(built.record.verdict).toBe("VALID");
    expect(built.record.recordedAt).toBe("2026-08-12T00:00:00Z");
    const parsed = parseProvenanceRecord(serializeProvenanceRecord(built.record));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.record).toEqual(built.record);
  });

  test("an author seam that is not a canonical driver identity is refused", () => {
    for (const author of ["", "   ", "codex", "gpt|codex|gpt-5.6-sol", "wizard|codex|m|s", "gpt|codex| m |s"]) {
      const built = buildProvenanceRecord(input({ author }));
      expect(built.ok).toBe(false);
      if (built.ok) throw new Error(`accepted non-canonical seam '${author}'`);
      expect(built.reason).toContain("author");
    }
  });

  test("role is closed to verifier/reviewer; a prover cannot attest to independence", () => {
    expect(buildProvenanceRecord(input({ role: "prover" })).ok).toBe(false);
    expect(buildProvenanceRecord(input({ role: "reviewer" })).ok).toBe(true);
  });

  test("a blank reason or blank cited source is refused (an unexplained attestation is not auditable)", () => {
    expect(buildProvenanceRecord(input({ reason: "  " })).ok).toBe(false);
    expect(buildProvenanceRecord(input({ sourceRef: "" })).ok).toBe(false);
    expect(buildProvenanceRecord(input({ sourceRef: "docs/worker-output/w2-verifier-codex.log" })).ok).toBe(true);
  });

  test("claimSha256 must be a full 64-hex digest — a prefix or a non-hex value is refused, not coerced", () => {
    for (const claimSha256 of ["", SHARD_SHA.slice(0, 12), `${SHARD_SHA} `, "z".repeat(64), 1 as unknown as string]) {
      const built = buildProvenanceRecord(input({ claimSha256 }));
      expect(built.ok).toBe(false);
      if (built.ok) throw new Error(`accepted claimSha256 '${String(claimSha256)}'`);
      expect(built.reason).toContain("claimSha256");
    }
    expect(buildProvenanceRecord(input({ claimSha256: SHARD_SHA.toUpperCase() })).ok).toBe(true);
  });

  test("claimId is restricted to the id charset, so a record path can never escape .rk/", () => {
    for (const claimId of ["", "  ", "../../etc/passwd", "lem/a", "lem a", ".hidden"]) {
      expect(buildProvenanceRecord(input({ claimId })).ok).toBe(false);
      expect(provenanceRecordPath(claimId).ok).toBe(false);
    }
    const path = provenanceRecordPath("lem-a");
    expect(path.ok).toBe(true);
    if (path.ok) expect(path.path).toBe(".rk/provenance-lem-a.json");
  });
});

describe("validateProvenanceRecord — the consumer-facing shape check", () => {
  const good = () => JSON.parse(serializeProvenanceRecord((buildProvenanceRecord(input()) as { record: unknown }).record as never)) as Record<string, unknown>;

  test("a numeric schema_version is refused — the hand-authoring mistake no tool would make", () => {
    const bad = { ...good(), schema_version: 1 };
    const result = validateProvenanceRecord(bad);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("schema_version");
  });

  test("unknown fields are refused (schema is additionalProperties:false)", () => {
    const result = validateProvenanceRecord({ ...good(), backdoor: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("backdoor");
  });

  test("a non-VALID verdict is refused: a refutation is recorded by a demote event, never here", () => {
    for (const verdict of ["REFUTED", "INVALID", "VALID-WITH-CORRECTION", undefined]) {
      const bad: Record<string, unknown> = { ...good() };
      if (verdict === undefined) delete bad.verdict;
      else bad.verdict = verdict;
      expect(validateProvenanceRecord(bad).ok).toBe(false);
    }
  });

  test("non-JSON text and non-object JSON are refused, never thrown", () => {
    expect(parseProvenanceRecord("not json").ok).toBe(false);
    expect(parseProvenanceRecord("[]").ok).toBe(false);
  });
});

describe("ANTI-DRIFT: the producer and Gate 8's consumer agree on every seam", () => {
  function repoWith(recordText: string): ReturnType<typeof snapshotFromFiles> {
    return snapshotFromFiles({
      "argument/lem-a.md": SHARD_TEXT,
      ".rk/provenance-lem-a.json": recordText,
    });
  }

  function backs(recordText: string): boolean {
    const snap = repoWith(recordText);
    const { lemmas } = parseRegistry(snap);
    const target = lemmas.find((l) => l.id === "lem-a")!;
    return pmaBackingDecision(snap, target, lemmas).backed;
  }

  test("every record the producer emits actually backs the close", () => {
    for (const role of PROVENANCE_RECORD_ROLES) {
      const built = buildProvenanceRecord(input({ role }), "2026-08-12T00:00:00Z");
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(backs(serializeProvenanceRecord(built.record))).toBe(true);
    }
  });

  test("every seam the producer refuses is also refused by the consumer", () => {
    for (const author of ["codex", "gpt|codex|gpt-5.6-sol", "wizard|codex|m|s", "gpt|codex| m |s", PROVER]) {
      const hand = JSON.stringify({
        schema_version: "1", claimId: "lem-a", claimSha256: SHARD_SHA, author, role: "verifier",
        verdict: "VALID", reason: "hand-written record",
      });
      expect(backs(hand)).toBe(false);
    }
  });

  test("a record naming bytes the shard no longer has is emitted truthfully and refused by the gate", () => {
    // The honest backfill case: an attestation of historical bytes. The producer must not silently
    // re-hash to the current shard to make it pass — that would forge the reviewed-bytes claim.
    const historical = "a".repeat(64);
    const built = buildProvenanceRecord(input({ claimSha256: historical }));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.record.claimSha256).toBe(historical);
    expect(backs(serializeProvenanceRecord(built.record))).toBe(false);
  });

  test("the producer refuses the same-model seam the consumer refuses (independence is not the producer's job to assert)", () => {
    // The producer cannot see the claim, so it accepts a same-model seam as a TRUTHFUL record;
    // the gate is what refuses to bank it. This asymmetry is deliberate and is tested, not assumed.
    const sameModel = "claude|claude|claude-opus-4-8|review-session";
    const built = buildProvenanceRecord(input({ author: sameModel }));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(backs(serializeProvenanceRecord(built.record))).toBe(false);
  });
});
