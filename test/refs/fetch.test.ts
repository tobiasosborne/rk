import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchSpec } from "../../src/refs/fetch";
import { sha256Bytes } from "../../src/refs/hash";

const dir = mkdtempSync(join(tmpdir(), "rk-fetch-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Build a minimal single-file ustar archive by hand (no deps) — enough to exercise the
 * arxiv-eprint-member tar-extraction path against a real tar byte layout. */
function buildUstar(name: string, content: string): Uint8Array {
  const contentBytes = new TextEncoder().encode(content);
  const header = new Uint8Array(512);
  const enc = new TextEncoder();
  header.set(enc.encode(name), 0);
  const sizeOctal = contentBytes.length.toString(8).padStart(11, "0") + "\0";
  header.set(enc.encode(sizeOctal), 124);
  header[156] = "0".charCodeAt(0); // typeflag: regular file
  const contentBlocks = Math.ceil(contentBytes.length / 512) * 512;
  const out = new Uint8Array(512 + contentBlocks + 1024); // + two zero end-of-archive blocks
  out.set(header, 0);
  out.set(contentBytes, 512);
  return out;
}

describe("fetchSpec — kind: url (file:// local route, no network in tests)", () => {
  test("returns bytes when the fetched content hashes to expected_sha", async () => {
    const p = join(dir, "payload.tex");
    writeFileSync(p, "the payload");
    const expected = sha256Bytes(new TextEncoder().encode("the payload"));
    const bytes = await fetchSpec({ kind: "url", url: `file://${p}` }, expected);
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes!)).toBe("the payload");
  });

  test("returns null (never installs) when the hash does not match — a wrong-hash blob is rejected", async () => {
    const p = join(dir, "payload2.tex");
    writeFileSync(p, "the payload");
    const bytes = await fetchSpec({ kind: "url", url: `file://${p}` }, "0".repeat(64));
    expect(bytes).toBeNull();
  });

  test("returns null (falls through, never throws) when the URL cannot be read at all", async () => {
    const bytes = await fetchSpec({ kind: "url", url: `file://${dir}/does-not-exist.tex` }, "0".repeat(64));
    expect(bytes).toBeNull();
  });
});

describe("fetchSpec — kind: arxiv-pdf / arxiv-eprint (injectable getter, no live network)", () => {
  test("arxiv-pdf constructs the arxiv.org/pdf/<id> URL and verifies the hash", async () => {
    const pdfBytes = new TextEncoder().encode("%PDF fake pdf bytes");
    const expected = sha256Bytes(pdfBytes);
    let requestedUrl = "";
    const bytes = await fetchSpec({ kind: "arxiv-pdf", id: "2007.11433" }, expected, async (url) => {
      requestedUrl = url;
      return pdfBytes;
    });
    expect(requestedUrl).toBe("https://arxiv.org/pdf/2007.11433");
    expect(bytes).toEqual(pdfBytes);
  });

  test("arxiv-eprint constructs the arxiv.org/e-print/<id> URL", async () => {
    const raw = new TextEncoder().encode("raw eprint bundle");
    const expected = sha256Bytes(raw);
    let requestedUrl = "";
    const bytes = await fetchSpec({ kind: "arxiv-eprint", id: "1234.5678" }, expected, async (url) => {
      requestedUrl = url;
      return raw;
    });
    expect(requestedUrl).toBe("https://arxiv.org/e-print/1234.5678");
    expect(bytes).toEqual(raw);
  });
});

describe("fetchSpec — kind: arxiv-eprint-member", () => {
  test("matches when the e-print IS the plain gzipped member (single-file arXiv submission)", async () => {
    const memberText = "\\documentclass{article}\\begin{document}Hi\\end{document}";
    const gz = Bun.gzipSync(new TextEncoder().encode(memberText));
    const expected = sha256Bytes(new TextEncoder().encode(memberText));
    const bytes = await fetchSpec({ kind: "arxiv-eprint-member", id: "9999.00001" }, expected, async () => gz);
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes!)).toBe(memberText);
  });

  test("matches when the expected member is inside a tar bundle, selected purely by hash", async () => {
    const memberText = "member file contents, selected by hash not name";
    const tar = buildUstar("subdir/paper.tex", memberText);
    const expected = sha256Bytes(new TextEncoder().encode(memberText));
    const bytes = await fetchSpec({ kind: "arxiv-eprint-member", id: "8888.00002" }, expected, async () => tar);
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes!)).toBe(memberText);
  });

  test("returns null when no candidate (raw, gunzipped, or tar member) matches the expected hash", async () => {
    const tar = buildUstar("paper.tex", "some content");
    const bytes = await fetchSpec({ kind: "arxiv-eprint-member", id: "7777.00003" }, "f".repeat(64), async () => tar);
    expect(bytes).toBeNull();
  });
});

describe("fetchSpec — any network/parse failure falls through to null, never throws", () => {
  test("a getter that throws yields null, not an exception", async () => {
    const bytes = await fetchSpec({ kind: "arxiv-pdf", id: "x" }, "0".repeat(64), async () => {
      throw new Error("simulated network failure");
    });
    expect(bytes).toBeNull();
  });
});
