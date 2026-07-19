// Unit tests for src/gates/linker-l5.ts (M3.8, deliverable 3) — Gate 2's L5-promotion
// integration over `.rk/l5-verdicts.jsonl` (src/drive/l5-promote.ts's `promotionStateFor`). See
// corpus/linker/linker-34..37 for the end-to-end fixtures through linkerGate.run.

import { describe, expect, test } from "bun:test";
import { checkL5Promotion, L5_STORE_PATH } from "../../src/gates/linker-l5";
import type { Lemma } from "../../src/gates/linker-parse";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { sha256Hex } from "../../src/gates/sha256";

const SHARD_PATH = "argument/lem-x.md";
const SHARD_BODY = "---\nid: lem-x\nkind: lemma\nstatus: stated\naf: none\ncontract: c\n---\n";
const SHARD_HASH = sha256Hex(new TextEncoder().encode(SHARD_BODY));

function lemma(o: Partial<Lemma> = {}): Lemma {
  return { id: "lem-x", path: SHARD_PATH, kind: "lemma", af: "none", contract: "c", defs: [], deps: [], routes: [], status: "stated", ...o };
}

function l5Line(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: "1",
    ordinal: 0,
    itemId: "lem-x",
    l5ContentHash: SHARD_HASH,
    verdict: "VALID",
    justification: "checked, sound",
    verifierSeam: "gpt|codex|gpt-5.6|s1",
    ...overrides,
  });
}

describe("checkL5Promotion — presence-conditional", () => {
  test("no .rk/l5-verdicts.jsonl at all -> present:false, zero findings, never an ERROR", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY });
    const r = checkL5Promotion(snapshot, [lemma()]);
    expect(r).toEqual({ findings: [], present: false, checked: 0, promotable: 0 });
  });
});

describe("checkL5Promotion — fresh VALID promotes", () => {
  test("a fresh VALID verdict for a 'stated' shard -> WARN 'L5 promotable'", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [L5_STORE_PATH]: l5Line() + "\n" });
    const r = checkL5Promotion(snapshot, [lemma()]);
    expect(r.present).toBe(true);
    expect(r.checked).toBe(1);
    expect(r.promotable).toBe(1);
    expect(r.findings.length).toBe(1);
    expect(r.findings[0]!.severity).toBe("WARN");
    expect(r.findings[0]!.message).toContain("L5 promotable");
    expect(r.findings[0]!.path).toBe(SHARD_PATH);
  });

  test("a shard whose status is NOT 'stated' is never queried (nothing to promote)", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [L5_STORE_PATH]: l5Line() + "\n" });
    const r = checkL5Promotion(snapshot, [lemma({ status: "proved-mod-audit" })]);
    expect(r.checked).toBe(0);
    expect(r.findings).toEqual([]);
  });
});

describe("checkL5Promotion — stale does not promote", () => {
  test("shard bytes changed since the verdict was recorded (hash mismatch) -> no promotion, no finding", () => {
    const editedBody = SHARD_BODY + "\nedited after verification\n";
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: editedBody, [L5_STORE_PATH]: l5Line() + "\n" }); // l5Line's hash is still the OLD body's hash
    const r = checkL5Promotion(snapshot, [lemma()]);
    expect(r.checked).toBe(1);
    expect(r.promotable).toBe(0);
    expect(r.findings).toEqual([]);
  });
});

describe("checkL5Promotion — INVALID does not promote", () => {
  test("a fresh INVALID verdict -> no promotion, no finding", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [L5_STORE_PATH]: l5Line({ verdict: "INVALID", justification: "wrong" }) + "\n" });
    const r = checkL5Promotion(snapshot, [lemma()]);
    expect(r.checked).toBe(1);
    expect(r.promotable).toBe(0);
    expect(r.findings).toEqual([]);
  });
});

describe("checkL5Promotion — correction-pending does not promote", () => {
  test("a fresh VALID-WITH-CORRECTION verdict never promotes on the flagged bytes (rule (g))", () => {
    const line = l5Line({
      verdict: "VALID-WITH-CORRECTION",
      justification: "mostly right, one fix needed",
      correction: { description: "fix the constant", correctedContentHash: "b".repeat(64) },
    });
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [L5_STORE_PATH]: line + "\n" });
    const r = checkL5Promotion(snapshot, [lemma()]);
    expect(r.checked).toBe(1);
    expect(r.promotable).toBe(0);
    expect(r.findings).toEqual([]);
  });
});

describe("checkL5Promotion — corrupted store lines are surfaced (WARN), never silently dropped", () => {
  test("a malformed JSONL line produces a WARN naming the line number", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [L5_STORE_PATH]: "not json at all\n" });
    const r = checkL5Promotion(snapshot, [lemma()]);
    expect(r.present).toBe(true);
    expect(r.findings.some((f) => f.severity === "WARN" && f.path === L5_STORE_PATH && f.line === 1)).toBe(true);
  });
});
