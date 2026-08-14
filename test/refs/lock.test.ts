import { describe, expect, test } from "bun:test";
import { decideStatus, parseLockFile, serializeLockFile } from "../../src/refs/lock";
import type { LockFile } from "../../src/types";
import { sourceId } from "../../src/types";

const AISM_LOCK_JSON = `{
  "_comment": "ignored by rk, preserved on round-trip is not required",
  "arxiv_verified": ["2007.11433"],
  "files": [
    {
      "path": "baake-sumner-2007.11433/equal-fin.tex",
      "sha256": "f358c71c066293f80c1f2cebd1bfb6b46489bf25320bccef7c5ec6b464b3aa01",
      "source_id": "baake-sumner-2007.11433",
      "fetch": { "kind": "arxiv-eprint-member", "id": "2007.11433" }
    },
    {
      "path": "hognas-mukherjea/hognas-mukherjea-2011.pdf",
      "sha256": "d74844072a1b96a29acbae5586e42c641fcc17721f55b89184b95dbcf25fa649",
      "source_id": "hognas-mukherjea",
      "fetch": null,
      "note": "cache-only; acquire manually"
    }
  ]
}`;

describe("parseLockFile", () => {
  test("parses a real AISM-shaped sources.lock.json", () => {
    const lock = parseLockFile(AISM_LOCK_JSON);
    expect(lock.files).toHaveLength(2);
    expect(lock.arxiv_verified).toEqual(["2007.11433"]);
    expect(lock.files[0]).toEqual({
      path: "baake-sumner-2007.11433/equal-fin.tex",
      sha256: "f358c71c066293f80c1f2cebd1bfb6b46489bf25320bccef7c5ec6b464b3aa01",
      source_id: sourceId("baake-sumner-2007.11433"),
      fetch: { kind: "arxiv-eprint-member", id: "2007.11433" },
    });
  });

  test("a cache-only entry has fetch: null and an optional note", () => {
    const lock = parseLockFile(AISM_LOCK_JSON);
    expect(lock.files[1]!.fetch).toBeNull();
    expect(lock.files[1]!.note).toBe("cache-only; acquire manually");
  });

  test("missing arxiv_verified defaults to an empty array, not undefined", () => {
    const lock = parseLockFile('{"files": []}');
    expect(lock.arxiv_verified).toEqual([]);
  });

  test("throws on malformed JSON rather than silently producing an empty lock", () => {
    expect(() => parseLockFile("{not json")).toThrow();
  });
});

describe("serializeLockFile", () => {
  test("round-trips through parseLockFile", () => {
    const lock: LockFile = {
      arxiv_verified: ["1234.5678"],
      files: [
        {
          path: "a/b.tex",
          sha256: "aa".repeat(32),
          source_id: sourceId("a"),
          fetch: { kind: "url", url: "https://example.org/a.pdf" },
        },
        {
          path: "c.pdf",
          sha256: "bb".repeat(32),
          source_id: sourceId("c"),
          fetch: null,
          note: "manual",
        },
      ],
    };
    const text = serializeLockFile(lock);
    expect(parseLockFile(text)).toEqual(lock);
  });
});

describe("decideStatus — the fetch-refs.py --status dry-run decision, pure", () => {
  // Ground truth: fetch-refs.py reconstruct() with write=False, allow_fetch=False
  // (fetch-refs.py:143-172,206-208). This function takes the already-probed booleans (disk
  // presence+hash-match, cache hit, spec presence) and returns the classification — the actual
  // fs/network probing is the edge's job (src/refs/status.ts).

  test("present on disk with a matching hash -> present, regardless of spec/cache", () => {
    expect(decideStatus({ presentOnDisk: true, hasFetchSpec: true, cacheHit: false })).toBe("present");
    expect(decideStatus({ presentOnDisk: true, hasFetchSpec: false, cacheHit: true })).toBe("present");
  });

  test("absent, but a cache hit during the dry-run -> cache (checked before fetchable)", () => {
    expect(decideStatus({ presentOnDisk: false, hasFetchSpec: true, cacheHit: true })).toBe("cache");
    expect(decideStatus({ presentOnDisk: false, hasFetchSpec: false, cacheHit: true })).toBe("cache");
  });

  test("absent, no cache hit, but a fetch spec exists -> fetchable", () => {
    expect(decideStatus({ presentOnDisk: false, hasFetchSpec: true, cacheHit: false })).toBe("fetchable");
  });

  test("absent, no cache hit, no fetch spec -> missing", () => {
    expect(decideStatus({ presentOnDisk: false, hasFetchSpec: false, cacheHit: false })).toBe("missing");
  });
});

// --- extraction records (bead rk-we5i) ------------------------------------------------------
// A PDF payload's searchable text lives in a sidecar recorded on its lock entry, chained to the
// payload hash. The lock is the transport for that chain, so it must round-trip losslessly: an
// `extraction` silently dropped by `serializeLockFile` would erase the chain on the next
// `rk refs add`/`adopt` write and demote every PDF citation back to unverifiable.

const EXTRACTION_LOCK_JSON = `{
  "files": [
    {
      "path": "sources/spectral.pdf",
      "sha256": "aa11bb22cc33dd44ee55ff66007788990011223344556677889900aabbccddee",
      "source_id": "spectral",
      "fetch": null,
      "extraction": {
        "path": "sources/spectral.pdf.extracted.txt",
        "sha256": "1111111111111111111111111111111111111111111111111111111111111111",
        "payload_sha256": "aa11bb22cc33dd44ee55ff66007788990011223344556677889900aabbccddee",
        "tool": "pdftotext -layout"
      }
    }
  ]
}`;

describe("extraction records", () => {
  test("parses all four fields of an extraction record", () => {
    const lock = parseLockFile(EXTRACTION_LOCK_JSON);
    expect(lock.files[0]!.extraction).toEqual({
      path: "sources/spectral.pdf.extracted.txt",
      sha256: "1111111111111111111111111111111111111111111111111111111111111111",
      payload_sha256: "aa11bb22cc33dd44ee55ff66007788990011223344556677889900aabbccddee",
      tool: "pdftotext -layout",
    });
  });

  test("round-trips an extraction record through serialize -> parse without loss", () => {
    const once = parseLockFile(EXTRACTION_LOCK_JSON);
    const twice = parseLockFile(serializeLockFile(once));
    expect(twice.files[0]!.extraction).toEqual(once.files[0]!.extraction);
  });

  test("an entry with no extraction stays extraction-free (absent is a legitimate text-payload state)", () => {
    const lock = parseLockFile(serializeLockFile(parseLockFile(AISM_LOCK_JSON)));
    expect(lock.files[0]!.extraction).toBeUndefined();
    expect(serializeLockFile(lock)).not.toContain("extraction");
  });

  test("a PARTIAL extraction record is dropped, never half-trusted", () => {
    // A record missing payload_sha256 has no chain at all; keeping it would leave the staleness
    // comparison reading `undefined`. Dropping it lands the consumer on the fail-closed
    // "no extraction recorded" branch instead.
    const partial = EXTRACTION_LOCK_JSON.replace(/\s*"payload_sha256":[^,]+,/, "");
    expect(parseLockFile(partial).files[0]!.extraction).toBeUndefined();
  });
});
