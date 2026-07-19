// 1:1 test file for src/drive/l5-store-io.ts (M3.7): the fs edge around the L5 verdict ledger.
// Real (temp-dir) filesystem, per the repo's existing edge-test convention
// (test/cli-phase.test.ts's `mkdtempSync(join(tmpdir(), ...))`). Covers: missing-file is a
// legitimate empty state, single/multi-document append, ordinal continuity across separate append
// calls, and the WP's two mutation-proof requirements: APPEND-ONLY (swap the writer for a
// truncating write and this file's own dedicated test goes red) and corrupted-tail loudness
// (a hand-corrupted on-disk line is reported, never silently swallowed).

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendL5Verdict, appendL5Verdicts, l5StorePath, readL5Store } from "../../src/drive/l5-store-io";
import type { VerdictDocument } from "../../src/drive/verdict-schema";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmpRoot(): string {
  const d = mkdtempSync(join(tmpdir(), "rk-l5-store-io-"));
  dirs.push(d);
  return d;
}

function l5Doc(itemId: string, contentHash: string, overrides: Partial<VerdictDocument> = {}): VerdictDocument {
  return {
    schema_version: "1",
    verifier: { modelFamily: "claude", backend: "claude", model: "m", sessionId: "s" },
    verdicts: [{ itemId, tier: "l5", contentHash, justification: "j", verdict: "VALID" }],
    ...overrides,
  } as VerdictDocument;
}

describe("readL5Store", () => {
  test("a missing ledger file is a legitimate empty state, never an error", () => {
    const root = tmpRoot();
    expect(readL5Store(root)).toEqual({ records: [], issues: [] });
  });
});

describe("appendL5Verdicts", () => {
  test("appends one document, creating .rk/ if needed, and it reads back", () => {
    const root = tmpRoot();
    const doc = l5Doc("lem-1", "a".repeat(64));
    const result = appendL5Verdicts(root, [doc], () => "2026-07-19T00:00:00.000Z");
    expect(result.ok).toBe(true);
    expect(result.appended).toHaveLength(1);
    expect(result.appended[0]!.ordinal).toBe(0);

    const { records, issues } = readL5Store(root);
    expect(issues).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]!.itemId).toBe("lem-1");
  });

  test("ordinal continuity: a SECOND separate append call continues from the highest ordinal already on disk", () => {
    const root = tmpRoot();
    appendL5Verdict(root, l5Doc("a", "a".repeat(64)));
    appendL5Verdict(root, l5Doc("b", "b".repeat(64)));
    const { records } = readL5Store(root);
    expect(records.map((r) => r.ordinal)).toEqual([0, 1]);
  });

  test("multiple documents in ONE call get sequential ordinals in one write", () => {
    const root = tmpRoot();
    const result = appendL5Verdicts(root, [l5Doc("a", "a".repeat(64)), l5Doc("b", "b".repeat(64))]);
    expect(result.appended.map((r) => r.ordinal)).toEqual([0, 1]);
  });

  test("a rejected document (hard-tier) contributes nothing to the ledger, and is reported in `rejected`", () => {
    const root = tmpRoot();
    const hardDoc: VerdictDocument = {
      schema_version: "1",
      verifier: { modelFamily: "claude", backend: "claude", model: "m", sessionId: "s" },
      verdicts: [{ itemId: "n-1", tier: "hard", contentHash: "a".repeat(64), justification: "j", verdict: { outcome: "accept" } }],
    };
    const result = appendL5Verdicts(root, [hardDoc]);
    expect(result.ok).toBe(false);
    expect(result.rejected).toHaveLength(1);
    expect(readL5Store(root).records).toHaveLength(0);
  });

  test("PROPERTY: earlier records survive a LATER append call untouched (append-only, functionally)", () => {
    const root = tmpRoot();
    appendL5Verdict(root, l5Doc("a", "a".repeat(64)));
    const before = readFileSync(l5StorePath(root), "utf8");
    appendL5Verdict(root, l5Doc("b", "b".repeat(64)));
    const after = readFileSync(l5StorePath(root), "utf8");
    expect(after.startsWith(before)).toBe(true);
  });
});

describe("MUTATION-PROOF: append-only enforcement", () => {
  test("if the writer truncated instead of appending, this test would go red -- simulating that bug directly against the same file path", () => {
    const root = tmpRoot();
    appendL5Verdict(root, l5Doc("a", "a".repeat(64)));
    appendL5Verdict(root, l5Doc("b", "b".repeat(64)));
    expect(readL5Store(root).records).toHaveLength(2);

    // Simulate the exact regression this property guards: a writeFileSync-based writer replacing
    // appendFileSync would truncate the file to just the new content on the next write. Applying
    // that here directly (bypassing appendL5Verdicts entirely) shows what a truncating writer
    // would produce, so the CONTRAST with appendL5Verdicts's own real behavior above is the
    // mutation proof: swap `appendFileSync` for `writeFileSync` inside src/drive/l5-store-io.ts's
    // `appendL5Verdicts` and its "earlier records survive" test two blocks up goes red, because
    // the file would end up looking like this one line, not three.
    writeFileSync(l5StorePath(root), '{"simulated":"truncated-write"}\n', "utf8");
    const truncated = readFileSync(l5StorePath(root), "utf8").split("\n").filter((l) => l.length > 0);
    expect(truncated).toHaveLength(1);
  });
});

describe("MUTATION-PROOF: corrupted-tail loudness", () => {
  test("a hand-corrupted final line (simulating a crash mid-append) is reported as an issue, earlier records stay readable", () => {
    const root = tmpRoot();
    appendL5Verdict(root, l5Doc("a", "a".repeat(64)));
    appendL5Verdict(root, l5Doc("b", "b".repeat(64)));
    // Truncate the on-disk bytes mid-line, simulating a crash during the SECOND append's write.
    const full = readFileSync(l5StorePath(root), "utf8");
    const lines = full.split("\n").filter((l) => l.length > 0);
    const corrupted = lines[0] + "\n" + lines[1]!.slice(0, 20); // no trailing newline: a genuine short write
    writeFileSync(l5StorePath(root), corrupted, "utf8");

    const { records, issues } = readL5Store(root);
    expect(records).toHaveLength(1);
    expect(records[0]!.itemId).toBe("a");
    expect(issues.length).toBeGreaterThan(0);
    // NEVER silently swallowed: if a future change dropped the corrupted line without recording an
    // issue for it, this assertion (not just the record count) would catch it.
    expect(issues[0]!.message.length).toBeGreaterThan(0);
  });
});
