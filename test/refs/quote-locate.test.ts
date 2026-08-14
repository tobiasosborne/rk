import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateQuoteInRepo } from "../../src/refs/quote-locate";
import { sha256Bytes } from "../../src/refs/hash";
import { sourceId } from "../../src/types";

const PAPER_TEX = "Introduction.\nTheorem 3: every idempotent map on a compact semigroup is a projection.\nQED.";

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "rk-quote-locate-test-"));
  mkdirSync(join(root, "refs", "manifest"), { recursive: true });
  mkdirSync(join(root, "refs", "foo-2026"), { recursive: true });
  writeFileSync(join(root, "refs", "foo-2026", "paper.tex"), PAPER_TEX);
  writeFileSync(
    join(root, "refs", "manifest", "sources.lock.json"),
    JSON.stringify({
      files: [
        // The real hash (rk-r0j3: the adopted pin now binds every payload kind, not just PDFs) —
        // a fake sha256 here would be refused rather than silently ignored.
        { path: "foo-2026/paper.tex", sha256: sha256Bytes(new TextEncoder().encode(PAPER_TEX)), source_id: "foo-2026", fetch: null },
      ],
    }),
  );
  return root;
}

describe("locateQuoteInRepo", () => {
  test("resolves the source-id to its local path and locates the pattern with a path:line anchor", async () => {
    const root = makeRepo();
    const r = await locateQuoteInRepo(root, sourceId("foo-2026"), "every idempotent map on a compact semigroup");
    expect(r).toEqual({
      found: true,
      extractions: [],
      result: {
        sourceId: sourceId("foo-2026"),
        path: "refs/foo-2026/paper.tex",
        line: 2,
        quote: "every idempotent map on a compact semigroup",
      },
    });
    rmSync(root, { recursive: true, force: true });
  });

  test("reports found:false — with the (empty) extraction ledger — when the pattern is absent", async () => {
    // Review P2-4: the miss arm carries the same side-effect ledger as the hit arm, so a caller can
    // never report "pattern not found" while silently having written a sidecar. A text payload
    // writes nothing, hence the empty array.
    const root = makeRepo();
    const r = await locateQuoteInRepo(root, sourceId("foo-2026"), "text nowhere in the paper");
    expect(r).toEqual({ found: false, extractions: [] });
    rmSync(root, { recursive: true, force: true });
  });

  test("throws a descriptive error for an unknown source-id (not a silent null)", async () => {
    const root = makeRepo();
    await expect(locateQuoteInRepo(root, sourceId("unknown-source"), "x")).rejects.toThrow(/unknown-source/);
    rmSync(root, { recursive: true, force: true });
  });

  test("rejects a path-traversal entry rather than joining it blindly (rk-correct divergence from fetch-refs.py)", async () => {
    const root = makeRepo();
    writeFileSync(
      join(root, "refs", "manifest", "sources.lock.json"),
      JSON.stringify({
        files: [{ path: "../../etc/passwd", sha256: "0".repeat(64), source_id: "evil", fetch: null }],
      }),
    );
    await expect(locateQuoteInRepo(root, sourceId("evil"), "x")).rejects.toThrow(/unsafe|traversal/i);
    rmSync(root, { recursive: true, force: true });
  });

  test("refuses a TEXT payload swapped after adoption — never emits a quote anchor for unadopted bytes (rk-r0j3 follow-up)", async () => {
    // Mirrors the PDF exploit fix (rk-o85b): Gate 3's resolveQuotableText now binds the adopted
    // pin for EVERY payload kind (rk-r0j3), not just PDFs, but until this fix the acquisition side
    // (locateQuoteInRepo's non-PDF branch) never compared the payload's current bytes to its pin —
    // it just decoded and searched whatever was on disk. A worker could `rk refs quote` a source
    // whose text payload was replaced after adoption and get a "found" anchor that Gate 3 (now
    // pin-checking every kind) rejects at `rk check` time — the same acquisition/gate mismatch the
    // PDF case had, one payload kind over.
    const root = makeRepo();
    const lockBefore = readFileSync(join(root, "refs", "manifest", "sources.lock.json"), "utf8");

    // Swap the payload WITHOUT re-pinning: the lock's sha256 still names the ORIGINAL bytes.
    const swapped = "Introduction.\nTheorem 3 is FALSE: a counterexample exists.\nQED.";
    writeFileSync(join(root, "refs", "foo-2026", "paper.tex"), swapped);
    expect(sha256Bytes(new TextEncoder().encode(swapped))).not.toBe(sha256Bytes(new TextEncoder().encode(PAPER_TEX)));

    await expect(
      locateQuoteInRepo(root, sourceId("foo-2026"), "every idempotent map on a compact semigroup"),
    ).rejects.toThrow(/VIOLATES its adopted pin.*re-adopt/s);

    // Fail-closed at ACQUISITION time: the lock is untouched (no writes at all for a text payload).
    expect(readFileSync(join(root, "refs", "manifest", "sources.lock.json"), "utf8")).toBe(lockBefore);
    rmSync(root, { recursive: true, force: true });
  });

  test("throws a descriptive error when the source-id is known but the payload is absent locally", async () => {
    const root = makeRepo();
    mkdirSync(join(root, "refs", "manifest"), { recursive: true });
    writeFileSync(
      join(root, "refs", "manifest", "sources.lock.json"),
      JSON.stringify({
        files: [{ path: "bar/missing.pdf", sha256: "1".repeat(64), source_id: "bar", fetch: null }],
      }),
    );
    await expect(locateQuoteInRepo(root, sourceId("bar"), "x")).rejects.toThrow(/absent|not found|missing/i);
    rmSync(root, { recursive: true, force: true });
  });
});
