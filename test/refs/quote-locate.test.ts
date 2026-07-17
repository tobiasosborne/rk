import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateQuoteInRepo } from "../../src/refs/quote-locate";
import { sourceId } from "../../src/types";

function makeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "rk-quote-locate-test-"));
  mkdirSync(join(root, "refs", "manifest"), { recursive: true });
  mkdirSync(join(root, "refs", "foo-2026"), { recursive: true });
  writeFileSync(
    join(root, "refs", "foo-2026", "paper.tex"),
    "Introduction.\nTheorem 3: every idempotent map on a compact semigroup is a projection.\nQED.",
  );
  writeFileSync(
    join(root, "refs", "manifest", "sources.lock.json"),
    JSON.stringify({
      files: [
        { path: "foo-2026/paper.tex", sha256: "0".repeat(64), source_id: "foo-2026", fetch: null },
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
      sourceId: sourceId("foo-2026"),
      path: "refs/foo-2026/paper.tex",
      line: 2,
      quote: "every idempotent map on a compact semigroup",
    });
    rmSync(root, { recursive: true, force: true });
  });

  test("returns null when the pattern is not present in the source", async () => {
    const root = makeRepo();
    const r = await locateQuoteInRepo(root, sourceId("foo-2026"), "text nowhere in the paper");
    expect(r).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });

  test("throws a descriptive error for an unknown source-id (not a silent null)", async () => {
    const root = makeRepo();
    await expect(locateQuoteInRepo(root, sourceId("unknown-source"), "x")).rejects.toThrow(/unknown-source/);
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
