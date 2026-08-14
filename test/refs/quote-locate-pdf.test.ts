// Contract: `rk refs quote` against a compressed-PDF payload (bead rk-we5i, the reported symptom).
// Before this bead the pattern below returned pattern-not-found for every PDF source in the
// campaign (RVW math/0406038, RV TR05-092, JMRW 2209.07024) because the search ran over raw
// payload bytes, in which no sentence of the document occurs — so no shard could ever carry
// `status: cited` against a PDF.
//
// The tests assert three things in order of importance: the quote is found (via the extraction
// layer), the extraction is RECORDED and CHAINED so Gate 3 can re-verify it, and a repo with no
// extractor installed gets a loud actionable error rather than a "not found" that would be a
// statement about rk's toolchain masquerading as a statement about the source.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { locateQuoteInRepo } from "../../src/refs/quote-locate";
import { sha256Bytes } from "../../src/refs/hash";
import { sourceId } from "../../src/types";
import { makeCompressedPdf } from "./pdf-fixture";

const SENTENCE = "the spectral gap of the transfer operator is uniformly bounded below";
const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** Only pdftotext is offered, so these tests never depend on whether `marker` happens to be
 * installed. poppler's pdftotext IS required here and is present in this environment (the same
 * real-binary convention test/refs/extract.test.ts already uses for `markerAvailable`). */
const PDFTOTEXT = Bun.which("pdftotext");
const pdftotextOnly = (bin: string) => (bin === "pdftotext" ? PDFTOTEXT : null);

function makePdfRepo(): { root: string; payloadSha: string } {
  const root = mkdtempSync(join(tmpdir(), "rk-quote-pdf-test-"));
  roots.push(root);
  mkdirSync(join(root, "refs", "manifest"), { recursive: true });
  mkdirSync(join(root, "refs", "sources"), { recursive: true });
  const bytes = makeCompressedPdf(["Lemma 4.2 spectral gap.", SENTENCE, "by a constant independent of the system size."]);
  writeFileSync(join(root, "refs", "sources", "spectral.pdf"), bytes);
  const payloadSha = sha256Bytes(bytes);
  writeFileSync(
    join(root, "refs", "manifest", "sources.lock.json"),
    JSON.stringify({ files: [{ path: "sources/spectral.pdf", sha256: payloadSha, source_id: "spectral", fetch: null }] }, null, 2),
  );
  return { root, payloadSha };
}

function readLock(root: string): { files: Array<Record<string, any>> } {
  return JSON.parse(readFileSync(join(root, "refs", "manifest", "sources.lock.json"), "utf8"));
}

describe("locateQuoteInRepo — compressed PDF payload (rk-we5i)", () => {
  test("finds a sentence that is absent from the payload's raw bytes", async () => {
    const { root } = makePdfRepo();
    // The premise, asserted: a raw-byte search cannot find this sentence.
    const raw = readFileSync(join(root, "refs", "sources", "spectral.pdf"), "latin1");
    expect(raw.includes(SENTENCE)).toBe(false);

    const r = await locateQuoteInRepo(root, sourceId("spectral"), SENTENCE, pdftotextOnly);
    expect(r.found).toBe(true);
    expect(r.found === true && r.result.quote).toBe(SENTENCE);
    expect(r.found === true && r.result.line).toBe(2);
  });

  test("anchors the citation at the hash-pinned PAYLOAD path, not the derived sidecar", async () => {
    // Gate 3 pins and verifies the payload; anchoring at the sidecar would point a citation at an
    // unpinned derived file that nothing in the manifest vouches for.
    const { root } = makePdfRepo();
    const r = await locateQuoteInRepo(root, sourceId("spectral"), SENTENCE, pdftotextOnly);
    expect(r.found === true && r.result.path).toBe("refs/sources/spectral.pdf");
  });

  test("records the extraction in sources.lock.json, chained to the payload's current sha256", async () => {
    const { root, payloadSha } = makePdfRepo();
    await locateQuoteInRepo(root, sourceId("spectral"), SENTENCE, pdftotextOnly);
    const entry = readLock(root).files[0]!;
    expect(entry.extraction.path).toBe("sources/spectral.pdf.extracted.txt");
    expect(entry.extraction.payload_sha256).toBe(payloadSha);
    expect(entry.extraction.tool).toBe("pdftotext -layout");
    const sidecar = readFileSync(join(root, "refs", "sources", "spectral.pdf.extracted.txt"));
    expect(entry.extraction.sha256).toBe(sha256Bytes(new Uint8Array(sidecar)));
    expect(sidecar.toString("utf8")).toContain(SENTENCE);
  });

  test("re-uses an intact extraction instead of re-running the extractor", async () => {
    const { root } = makePdfRepo();
    await locateQuoteInRepo(root, sourceId("spectral"), SENTENCE, pdftotextOnly);
    const before = readFileSync(join(root, "refs", "manifest", "sources.lock.json"), "utf8");
    // No extractor offered at all this time: a re-run would have to skip, so a successful quote
    // proves the recorded extraction was used.
    const r = await locateQuoteInRepo(root, sourceId("spectral"), SENTENCE, () => null);
    expect(r.found === true && r.result.line).toBe(2);
    expect(readFileSync(join(root, "refs", "manifest", "sources.lock.json"), "utf8")).toBe(before);
  });

  test("re-extracts when the payload changed under a stale sidecar (never quotes stale text)", async () => {
    const { root } = makePdfRepo();
    await locateQuoteInRepo(root, sourceId("spectral"), SENTENCE, pdftotextOnly);

    // Replace the payload with a revision that says the opposite, and re-pin it.
    const revised = makeCompressedPdf(["Lemma 4.2 spectral gap.", "the spectral gap closes at the thermodynamic limit"]);
    writeFileSync(join(root, "refs", "sources", "spectral.pdf"), revised);
    const lock = readLock(root);
    lock.files[0]!.sha256 = sha256Bytes(revised);
    writeFileSync(join(root, "refs", "manifest", "sources.lock.json"), JSON.stringify(lock, null, 2));

    // The old sentence must NOT be quotable any more — the stale sidecar is regenerated first.
    const miss = await locateQuoteInRepo(root, sourceId("spectral"), SENTENCE, pdftotextOnly);
    expect(miss.found).toBe(false);
    // Review P2-4: the miss that regenerated the sidecar must SAY it regenerated the sidecar —
    // this is the exact call whose two on-disk writes used to vanish behind a bare `null`.
    expect(miss.extractions).toEqual([{ path: "refs/sources/spectral.pdf.extracted.txt", regenerated: true }]);
    const after = await locateQuoteInRepo(root, sourceId("spectral"), "closes at the thermodynamic limit", pdftotextOnly);
    expect(after.found).toBe(true);
    expect(readLock(root).files[0]!.extraction.payload_sha256).toBe(sha256Bytes(revised));
  });

  test("with no extractor installed, THROWS an actionable error — never a silent 'pattern not found'", async () => {
    const { root } = makePdfRepo();
    await expect(locateQuoteInRepo(root, sourceId("spectral"), SENTENCE, () => null)).rejects.toThrow(
      /could not be searched.*pdftotext/s,
    );
  });

  test("a non-PDF payload is unaffected: no extraction is produced and the lock is untouched", async () => {
    const { root } = makePdfRepo();
    writeFileSync(join(root, "refs", "sources", "notes.tex"), "Intro.\nA plain verbatim sentence.\n");
    const lock = readLock(root);
    lock.files.push({ path: "sources/notes.tex", sha256: "0".repeat(64), source_id: "notes", fetch: null });
    const serialized = JSON.stringify(lock, null, 2);
    writeFileSync(join(root, "refs", "manifest", "sources.lock.json"), serialized);

    const r = await locateQuoteInRepo(root, sourceId("notes"), "A plain verbatim sentence.", () => null);
    expect(r.found === true && r.result.line).toBe(2);
    expect(r.extractions).toEqual([]);
    expect(readFileSync(join(root, "refs", "manifest", "sources.lock.json"), "utf8")).toBe(serialized);
  });
});
