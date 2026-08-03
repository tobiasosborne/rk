// Unit tests for src/gates/linker-l5.ts (M3.8, deliverable 3) — Gate 2's L5-promotion
// integration over `.rk/l5-verdicts.jsonl` (src/drive/l5-promote.ts's `promotionStateFor`). See
// corpus/linker/linker-34..37 for the end-to-end fixtures through linkerGate.run.

import { describe, expect, test } from "bun:test";
import { checkL5Promotion, L5_STORE_PATH } from "../../src/gates/linker-l5";
import { RETRACTION_STORE_PATH, readRetractionFacts } from "../../src/gates/linker-retraction";
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

describe("checkL5Promotion — BLOCKER 6: a corrupt store POISONS promotion (ERROR, not a WARN nudge)", () => {
  test("a malformed store line -> ERROR on the store, and NO promotion is trusted", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [L5_STORE_PATH]: "not json at all\n" });
    const r = checkL5Promotion(snapshot, [lemma()]);
    expect(r.present).toBe(true);
    expect(r.findings.some((f) => f.severity === "ERROR" && f.path === L5_STORE_PATH)).toBe(true);
  });

  test("a fresh VALID record is NOT promoted when the store also carries a corrupt line (an earlier VALID must not survive a later unreadable record)", () => {
    // Line 0 = the shard's fresh VALID; line 1 = a truncated/garbage record whose itemId is unknowable.
    const store = l5Line({ ordinal: 0 }) + "\n" + '{"schemaVersion":"1","ordinal":1,"itemId":"lem-x"' + "\n";
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [L5_STORE_PATH]: store });
    const r = checkL5Promotion(snapshot, [lemma()]);
    expect(r.promotable).toBe(0);
    expect(r.findings.some((f) => f.message.includes("L5 promotable"))).toBe(false);
    expect(r.findings.some((f) => f.severity === "ERROR")).toBe(true);
  });

  test("a duplicate-ordinal chain break poisons promotion", () => {
    const store = l5Line({ ordinal: 0 }) + "\n" + l5Line({ ordinal: 0 }) + "\n";
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [L5_STORE_PATH]: store });
    const r = checkL5Promotion(snapshot, [lemma()]);
    expect(r.promotable).toBe(0);
    expect(r.findings.some((f) => f.severity === "ERROR")).toBe(true);
  });
});

describe("checkL5Promotion — BLOCKER 6b: already-promoted shards are continuously re-validated", () => {
  const PMA_BODY = "---\nid: lem-x\nkind: lemma\nstatus: proved-mod-audit\naf: none\ncontract: c\n---\n";
  const PMA_HASH = sha256Hex(new TextEncoder().encode(PMA_BODY));
  function pmaLine(overrides: Record<string, unknown> = {}): string {
    return l5Line({ l5ContentHash: PMA_HASH, ...overrides });
  }

  test("a proved-mod-audit shard still backed by a fresh VALID verdict -> no finding (support intact)", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: PMA_BODY, [L5_STORE_PATH]: pmaLine() + "\n" });
    const r = checkL5Promotion(snapshot, [lemma({ status: "proved-mod-audit" })]);
    expect(r.findings).toEqual([]);
  });

  test("a proved-mod-audit shard whose latest verdict is INVALID -> ERROR: demote", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: PMA_BODY, [L5_STORE_PATH]: pmaLine({ verdict: "INVALID", justification: "flaw found" }) + "\n" });
    const r = checkL5Promotion(snapshot, [lemma({ status: "proved-mod-audit" })]);
    expect(r.findings.some((f) => f.severity === "ERROR" && f.path === SHARD_PATH && f.message.includes("proved-mod-audit"))).toBe(true);
  });

  test("a proved-mod-audit shard edited after promotion (hash now stale) -> ERROR: demote", () => {
    const edited = PMA_BODY + "\nedited after audit\n";
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: edited, [L5_STORE_PATH]: pmaLine() + "\n" }); // record bound to the OLD hash
    const r = checkL5Promotion(snapshot, [lemma({ status: "proved-mod-audit" })]);
    expect(r.findings.some((f) => f.severity === "ERROR" && f.path === SHARD_PATH)).toBe(true);
  });

  test("a proved-mod-audit shard with NO L5 verdict at all (store present) -> ERROR: unsupported promotion", () => {
    const otherLine = l5Line({ itemId: "someone-else", l5ContentHash: "a".repeat(64) });
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: PMA_BODY, [L5_STORE_PATH]: otherLine + "\n" });
    const r = checkL5Promotion(snapshot, [lemma({ status: "proved-mod-audit" })]);
    expect(r.findings.some((f) => f.severity === "ERROR" && f.path === SHARD_PATH)).toBe(true);
  });

  test("a proved-mod-audit shard whose latest verdict is a fresh VALID-WITH-CORRECTION (correction-pending) -> ERROR: demote", () => {
    const line = pmaLine({
      verdict: "VALID-WITH-CORRECTION",
      justification: "one fix",
      correction: { description: "fix", correctedContentHash: "b".repeat(64) },
    });
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: PMA_BODY, [L5_STORE_PATH]: line + "\n" });
    const r = checkL5Promotion(snapshot, [lemma({ status: "proved-mod-audit" })]);
    expect(r.findings.some((f) => f.severity === "ERROR" && f.path === SHARD_PATH)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------
// rk-0ehr / P1 — a live retraction overrides the L5 verdict (ratified plan §P1, semantics (a)).
// End-to-end fixture: corpus/linker/linker-44.
// ---------------------------------------------------------------------------------------

describe("checkL5Promotion — a live retraction overrides a fresh VALID", () => {
  const PMA_BODY = "---\nid: lem-x\nkind: lemma\nstatus: proved-mod-audit\naf: none\ncontract: c\n---\n";
  const PMA_HASH = sha256Hex(new TextEncoder().encode(PMA_BODY));

  function retractionLine(over: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schemaVersion: "1", ordinal: 0, itemId: "lem-x", contentHash: SHARD_HASH,
      hashDomain: "l5-shard-bytes", retractedBy: "audit:2026-07-28-independent-sweep",
      reason: "independent sweep found the step-3 approximation unjustified", ...over,
    });
  }

  test("a 'stated' shard with a fresh VALID + a live retraction is silently NOT promotable (no nudge)", () => {
    const snapshot = snapshotFromFiles({
      [SHARD_PATH]: SHARD_BODY,
      [L5_STORE_PATH]: l5Line() + "\n",
      [RETRACTION_STORE_PATH]: retractionLine() + "\n",
    });
    const facts = readRetractionFacts(snapshot, [lemma()]);
    const r = checkL5Promotion(snapshot, [lemma()], facts);
    expect(r.checked).toBe(1);
    expect(r.promotable).toBe(0);
    expect(r.findings).toEqual([]);
  });

  test("a 'proved-mod-audit' shard with a live retraction -> ERROR naming the retraction, who, and why", () => {
    const snapshot = snapshotFromFiles({
      [SHARD_PATH]: PMA_BODY,
      [L5_STORE_PATH]: l5Line({ l5ContentHash: PMA_HASH }) + "\n",
      [RETRACTION_STORE_PATH]: retractionLine({ contentHash: PMA_HASH }) + "\n",
    });
    const lemmas = [lemma({ status: "proved-mod-audit" })];
    const facts = readRetractionFacts(snapshot, lemmas);
    const r = checkL5Promotion(snapshot, lemmas, facts);
    const errs = r.findings.filter((f) => f.severity === "ERROR" && f.path === SHARD_PATH);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("retracted");
    expect(errs[0]!.message).toContain("audit:2026-07-28-independent-sweep");
    expect(errs[0]!.message).toContain("demote");
  });

  test("editing the shard releases the retraction — the ordinary support check takes over", () => {
    const snapshot = snapshotFromFiles({
      [SHARD_PATH]: PMA_BODY,
      [L5_STORE_PATH]: l5Line({ l5ContentHash: PMA_HASH }) + "\n",
      [RETRACTION_STORE_PATH]: retractionLine({ contentHash: "c".repeat(64) }) + "\n", // pinned to older bytes
    });
    const lemmas = [lemma({ status: "proved-mod-audit" })];
    const r = checkL5Promotion(snapshot, lemmas, readRetractionFacts(snapshot, lemmas));
    expect(r.findings).toEqual([]);
  });

  test("a corrupt retraction store poisons promotion exactly as a corrupt L5 store does", () => {
    const snapshot = snapshotFromFiles({
      [SHARD_PATH]: PMA_BODY,
      [L5_STORE_PATH]: l5Line({ l5ContentHash: PMA_HASH }) + "\n",
      [RETRACTION_STORE_PATH]: retractionLine({ contentHash: PMA_HASH }) + "\n{truncated\n",
    });
    const lemmas = [lemma({ status: "proved-mod-audit" })];
    const r = checkL5Promotion(snapshot, lemmas, readRetractionFacts(snapshot, lemmas));
    expect(r.promotable).toBe(0);
    expect(r.findings.some((f) => f.severity === "ERROR" && f.path === SHARD_PATH)).toBe(true);
  });

  test("omitting the facts argument leaves every pre-P1 answer unchanged", () => {
    const snapshot = snapshotFromFiles({ [SHARD_PATH]: SHARD_BODY, [L5_STORE_PATH]: l5Line() + "\n" });
    expect(checkL5Promotion(snapshot, [lemma()]).promotable).toBe(1);
  });
});
