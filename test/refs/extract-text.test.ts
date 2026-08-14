// Contract: src/refs/extract.ts's extraction TEXT layer (bead rk-we5i) — extractor selection
// order, the graceful VISIBLE skip when no extractor is installed, and both extractor backends
// actually running. `pdftotext` runs for real (poppler is present in this environment); `marker`
// runs against a stub binary reached through the injectable `which`, so its output-directory
// convention is exercised without needing marker installed.
//
// A skip must never be silent and never be an error: PRD C7 / M0.6 make both binaries optional,
// and CLAUDE.md L2 makes the skip visible with a reason the caller can surface.

import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXTRACTOR_PREFERENCE, extractPdfText, selectExtractor } from "../../src/refs/extract";
import { makeCompressedPdf } from "./pdf-fixture";

const roots: string[] = [];
function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("selectExtractor", () => {
  test("prefers marker over pdftotext when both are installed", () => {
    const sel = selectExtractor((bin) => `/usr/bin/${bin}`);
    expect(sel).toEqual({ name: "marker", bin: "/usr/bin/marker", tool: "marker" });
  });

  test("falls back to pdftotext when marker is absent, recording the exact invocation as the tool", () => {
    const sel = selectExtractor((bin) => (bin === "pdftotext" ? "/usr/bin/pdftotext" : null));
    expect(sel).toEqual({ name: "pdftotext", bin: "/usr/bin/pdftotext", tool: "pdftotext -layout" });
  });

  test("returns null when neither is installed — the skip state, not an error", () => {
    expect(selectExtractor(() => null)).toBeNull();
  });

  test("the preference order is exactly [marker, pdftotext]", () => {
    expect([...EXTRACTOR_PREFERENCE]).toEqual(["marker", "pdftotext"]);
  });
});

describe("extractPdfText — graceful visible skip", () => {
  test("never throws when no extractor exists; the reason names every binary tried", async () => {
    const r = await extractPdfText("/nonexistent/paper.pdf", () => null);
    expect(r.skipped).toBe(true);
    expect(r.skipped === true && r.reason).toContain("marker");
    expect(r.skipped === true && r.reason).toContain("pdftotext");
  });
});

describe("extractPdfText — pdftotext backend (real binary)", () => {
  test("recovers text that does NOT occur anywhere in the compressed payload's raw bytes", async () => {
    const dir = scratch("rk-extract-pdftotext-");
    const pdfPath = join(dir, "paper.pdf");
    const bytes = makeCompressedPdf(["Lemma 4.2 (spectral gap).", "the spectral gap of the transfer operator is uniformly bounded below"]);
    writeFileSync(pdfPath, bytes);

    // The premise of bead rk-we5i, asserted rather than assumed: the sentence is absent from the
    // raw bytes, so every raw-byte search must miss it.
    expect(new TextDecoder("latin1").decode(bytes).includes("uniformly bounded below")).toBe(false);

    const r = await extractPdfText(pdfPath, (bin) => (bin === "pdftotext" ? "/usr/bin/pdftotext" : null));
    expect(r.skipped).toBe(false);
    expect(r.skipped === false && r.text).toContain("the spectral gap of the transfer operator is uniformly bounded below");
    expect(r.skipped === false && r.tool).toBe("pdftotext -layout");
  });

  test("a present-but-failing extractor THROWS — a broken tool is an error, never a skip", async () => {
    const dir = scratch("rk-extract-broken-");
    const bin = join(dir, "brokentool");
    writeFileSync(bin, "#!/bin/sh\necho 'boom' >&2\nexit 3\n");
    chmodSync(bin, 0o755);
    await expect(extractPdfText("/whatever.pdf", (name) => (name === "pdftotext" ? bin : null))).rejects.toThrow(/exited 3/);
  });
});

describe("extractPdfText — marker backend (stub binary through the injected which)", () => {
  test("reads back the markdown marker writes under its --output_dir, and cleans up after itself", async () => {
    const dir = scratch("rk-extract-marker-");
    const bin = join(dir, "marker");
    // Mimics marker's real convention: output nested one directory deep under --output_dir.
    writeFileSync(
      bin,
      "#!/bin/sh\nout=\"\"\nwhile [ $# -gt 0 ]; do if [ \"$1\" = \"--output_dir\" ]; then out=\"$2\"; fi; shift; done\n" +
        "mkdir -p \"$out/paper\"\nprintf '# Paper\\n\\nthe spectral gap is uniformly bounded below\\n' > \"$out/paper/paper.md\"\n",
    );
    chmodSync(bin, 0o755);
    const r = await extractPdfText(join(dir, "paper.pdf"), (name) => (name === "marker" ? bin : null));
    expect(r.skipped).toBe(false);
    expect(r.skipped === false && r.text).toContain("the spectral gap is uniformly bounded below");
    expect(r.skipped === false && r.tool).toBe("marker");
  });

  test("marker exiting 0 without producing any markdown is an error, not empty text", async () => {
    const dir = scratch("rk-extract-marker-empty-");
    const bin = join(dir, "marker");
    writeFileSync(bin, "#!/bin/sh\nexit 0\n");
    chmodSync(bin, 0o755);
    mkdirSync(join(dir, "unused"), { recursive: true });
    await expect(extractPdfText(join(dir, "paper.pdf"), (name) => (name === "marker" ? bin : null))).rejects.toThrow(/produced no \.md file/);
  });
});
