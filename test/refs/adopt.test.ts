// rk-pk8o: `rk refs adopt` — OFFLINE registration of an already-downloaded payload under refs/.
// The campaign case (window 1, ../rk-campaign-A): a firewalled librarian script wrote
// refs/sources/arxiv-1811.08017.txt and there is no refs/manifest/ at all, so Gate 3 can see the
// bytes but `rk refs status`/`quote` know nothing about them. Every assertion here is a contract
// statement, not a smoke test: the three manifest artifacts must come out byte-compatible with
// what `rk refs add` writes (same parsers read them back), a hash mismatch must write NOTHING, and
// re-adoption must be idempotent rather than duplicating rows.

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { adoptSource } from "../../src/refs/adopt";
import { parseChecksumsFile } from "../../src/refs/checksum";
import { sha256Bytes } from "../../src/refs/hash";
import { parseLockFile } from "../../src/refs/lock";
import { parseManifestTable } from "../../src/refs/manifest";
import { computeStatus } from "../../src/refs/status";
import { locateQuoteInRepo } from "../../src/refs/quote-locate";
import { sourceId } from "../../src/types";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const PAYLOAD = "Theorem 3.1. Every almost-idempotent map is close to a projection.\n";
const PAYLOAD_SHA = sha256Bytes(new TextEncoder().encode(PAYLOAD));

/** A repo in exactly the campaign's state: a librarian-fetched payload under refs/sources/ and NO
 * refs/manifest/ directory whatsoever. */
function makeCampaignRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "rk-adopt-test-"));
  dirs.push(root);
  mkdirSync(join(root, "refs", "sources"), { recursive: true });
  writeFileSync(join(root, "refs", "sources", "arxiv-1811.08017.txt"), PAYLOAD);
  return root;
}

function manifestPath(root: string, name: string): string {
  return join(root, "refs", "manifest", name);
}

describe("adoptSource — offline registration (rk-pk8o)", () => {
  test("registers the payload in all three manifest artifacts, seeding refs/manifest/ when absent", async () => {
    const root = makeCampaignRepo();
    const result = await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", {
      source: "arxiv:1811.08017",
      retrieved: "2026-08-08",
      citation: "A. Author, *A Paper*, arXiv:1811.08017",
      role: "test fixture",
    });

    expect(result.sha256).toBe(PAYLOAD_SHA);
    expect(result.path).toBe("refs/sources/arxiv-1811.08017.txt");
    expect(result.sourceId).toBe("arxiv-1811.08017"); // default id: the basename stem
    expect(result.alreadyAdopted).toBe(false);

    // checksums.sha256 — refs-relative path, `sha256sum -c` format (same parser as `add`).
    const checksums = parseChecksumsFile(readFileSync(manifestPath(root, "checksums.sha256"), "utf8"));
    expect(checksums).toEqual([{ sha256: PAYLOAD_SHA, path: "sources/arxiv-1811.08017.txt" }]);

    // sources.lock.json — refs-relative path, real hash, no fabricated fetch route.
    const lock = parseLockFile(readFileSync(manifestPath(root, "sources.lock.json"), "utf8"));
    expect(lock.files).toHaveLength(1);
    expect(lock.files[0]!.path).toBe("sources/arxiv-1811.08017.txt");
    expect(lock.files[0]!.sha256).toBe(PAYLOAD_SHA);
    expect(lock.files[0]!.source_id).toBe(sourceId("arxiv-1811.08017"));
    expect(lock.files[0]!.fetch).toBeNull();
    expect(lock.files[0]!.note).toContain("arxiv:1811.08017");

    // SOURCES.md — a real Source registry table with the adopted row in it.
    const rows = parseManifestTable(readFileSync(manifestPath(root, "SOURCES.md"), "utf8"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sourceId).toBe(sourceId("arxiv-1811.08017"));
    expect(rows[0]!.localPath).toBe("refs/sources/arxiv-1811.08017.txt");
    expect(rows[0]!.sha16).toBe(PAYLOAD_SHA.slice(0, 16));
    expect(rows[0]!.retrieved).toBe("2026-08-08");
    expect(rows[0]!.locator).toBe("arxiv:1811.08017");
  });

  test("accepts a refs-relative path too, and records it identically", async () => {
    const root = makeCampaignRepo();
    const result = await adoptSource(root, "sources/arxiv-1811.08017.txt", {
      source: "arxiv:1811.08017",
      retrieved: "2026-08-08",
    });
    expect(result.path).toBe("refs/sources/arxiv-1811.08017.txt");
    const lock = parseLockFile(readFileSync(manifestPath(root, "sources.lock.json"), "utf8"));
    expect(lock.files[0]!.path).toBe("sources/arxiv-1811.08017.txt");
  });

  test("--sha256 matching the bytes is accepted", async () => {
    const root = makeCampaignRepo();
    const result = await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", {
      source: "arxiv:1811.08017",
      retrieved: "2026-08-08",
      expectSha256: PAYLOAD_SHA.toUpperCase(), // case-insensitive hex comparison
    });
    expect(result.sha256).toBe(PAYLOAD_SHA);
  });

  test("--sha256 mismatch is a loud error naming BOTH hashes, and writes nothing", async () => {
    const root = makeCampaignRepo();
    const claimed = "c".repeat(64);
    await expect(
      adoptSource(root, "refs/sources/arxiv-1811.08017.txt", {
        source: "arxiv:1811.08017",
        retrieved: "2026-08-08",
        expectSha256: claimed,
      }),
    ).rejects.toThrow(new RegExp(`${claimed}[\\s\\S]*${PAYLOAD_SHA}|${PAYLOAD_SHA}[\\s\\S]*${claimed}`));
    expect(existsSync(manifestPath(root, "sources.lock.json"))).toBe(false);
    expect(existsSync(manifestPath(root, "checksums.sha256"))).toBe(false);
    expect(existsSync(manifestPath(root, "SOURCES.md"))).toBe(false);
  });

  test("re-adopting the same path with the same bytes is idempotent (no duplicate rows)", async () => {
    const root = makeCampaignRepo();
    await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", { source: "arxiv:1811.08017", retrieved: "2026-08-08" });
    const second = await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", {
      source: "arxiv:1811.08017",
      retrieved: "2026-08-09",
    });
    expect(second.alreadyAdopted).toBe(true);
    expect(second.sha256).toBe(PAYLOAD_SHA);
    expect(parseLockFile(readFileSync(manifestPath(root, "sources.lock.json"), "utf8")).files).toHaveLength(1);
    expect(parseChecksumsFile(readFileSync(manifestPath(root, "checksums.sha256"), "utf8"))).toHaveLength(1);
    expect(parseManifestTable(readFileSync(manifestPath(root, "SOURCES.md"), "utf8"))).toHaveLength(1);
  });

  test("re-adopting the same path with DIFFERENT bytes is an error naming the recorded and the computed hash", async () => {
    const root = makeCampaignRepo();
    await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", { source: "arxiv:1811.08017", retrieved: "2026-08-08" });
    writeFileSync(join(root, "refs", "sources", "arxiv-1811.08017.txt"), "different bytes entirely");
    const newSha = sha256Bytes(new TextEncoder().encode("different bytes entirely"));
    let message = "";
    try {
      await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", { source: "arxiv:1811.08017", retrieved: "2026-08-09" });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain(PAYLOAD_SHA);
    expect(message).toContain(newSha);
    // nothing written: the lock still carries exactly the original row
    const lock = parseLockFile(readFileSync(manifestPath(root, "sources.lock.json"), "utf8"));
    expect(lock.files).toHaveLength(1);
    expect(lock.files[0]!.sha256).toBe(PAYLOAD_SHA);
  });

  test("re-adopting the same path under a DIFFERENT source-id is an error naming both ids", async () => {
    const root = makeCampaignRepo();
    await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", { source: "arxiv:1811.08017", retrieved: "2026-08-08" });
    let message = "";
    try {
      await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", {
        source: "arxiv:1811.08017",
        retrieved: "2026-08-08",
        id: "some-other-id",
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("arxiv-1811.08017");
    expect(message).toContain("some-other-id");
    expect(parseLockFile(readFileSync(manifestPath(root, "sources.lock.json"), "utf8")).files).toHaveLength(1);
  });

  test("an absent payload is an error — never fabricates a hash", async () => {
    const root = makeCampaignRepo();
    await expect(
      adoptSource(root, "refs/sources/not-there.txt", { source: "arxiv:1811.08017", retrieved: "2026-08-08" }),
    ).rejects.toThrow(/does not exist/i);
    expect(existsSync(manifestPath(root, "sources.lock.json"))).toBe(false);
  });

  test("a payload outside refs/ is rejected, naming refs/ as the requirement", async () => {
    const root = makeCampaignRepo();
    writeFileSync(join(root, "outside.txt"), PAYLOAD);
    await expect(
      adoptSource(root, "outside.txt", { source: "arxiv:1811.08017", retrieved: "2026-08-08" }),
    ).rejects.toThrow(/refs\//);
  });

  test("a traversal path is rejected before anything is hashed or written", async () => {
    const root = makeCampaignRepo();
    await expect(
      adoptSource(root, "../../etc/passwd", { source: "x", retrieved: "2026-08-08" }),
    ).rejects.toThrow(/unsafe|traversal/i);
    expect(existsSync(manifestPath(root, "sources.lock.json"))).toBe(false);
  });

  test("a '|' in a field that lands in the SOURCES.md table is rejected (table integrity)", async () => {
    const root = makeCampaignRepo();
    await expect(
      adoptSource(root, "refs/sources/arxiv-1811.08017.txt", {
        source: "arxiv:1811.08017",
        retrieved: "2026-08-08",
        citation: "A. Author | fake column",
      }),
    ).rejects.toThrow(/'\|'|pipe/i);
    expect(existsSync(manifestPath(root, "SOURCES.md"))).toBe(false);
  });
});

describe("adoptSource — the adopted source behaves like a fetched one (rk-pk8o acceptance)", () => {
  test("rk refs status reports it as present (real hash re-derived from disk)", async () => {
    const root = makeCampaignRepo();
    await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", { source: "arxiv:1811.08017", retrieved: "2026-08-08" });
    const rows = await computeStatus(root);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.path).toBe("sources/arxiv-1811.08017.txt");
    expect(rows[0]!.status).toBe("present");
  });

  test("rk refs quote can byte-verify a quote from it, anchored at path:line", async () => {
    const root = makeCampaignRepo();
    const r = await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", {
      source: "arxiv:1811.08017",
      retrieved: "2026-08-08",
    });
    const quote = await locateQuoteInRepo(root, sourceId(r.sourceId), "almost-idempotent map is close to a projection");
    expect(quote).not.toBeNull();
    expect(quote!.path).toBe("refs/sources/arxiv-1811.08017.txt");
    expect(quote!.line).toBe(1);
  });

  test("two payloads adopted under one source-id are both quote-searchable (pdf + txt, AISM's own convention)", async () => {
    const root = makeCampaignRepo();
    writeFileSync(join(root, "refs", "sources", "arxiv-1811.08017.pdf"), "binary-ish pdf bytes");
    await adoptSource(root, "refs/sources/arxiv-1811.08017.pdf", {
      source: "arxiv:1811.08017",
      retrieved: "2026-08-08",
      id: "arxiv-1811.08017",
    });
    await adoptSource(root, "refs/sources/arxiv-1811.08017.txt", {
      source: "arxiv:1811.08017",
      retrieved: "2026-08-08",
      id: "arxiv-1811.08017",
    });
    const lock = parseLockFile(readFileSync(manifestPath(root, "sources.lock.json"), "utf8"));
    expect(lock.files).toHaveLength(2);
    const quote = await locateQuoteInRepo(root, sourceId("arxiv-1811.08017"), "close to a projection");
    expect(quote!.path).toBe("refs/sources/arxiv-1811.08017.txt");
  });
});
