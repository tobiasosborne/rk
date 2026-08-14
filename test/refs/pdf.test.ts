// Contract: src/refs/pdf.ts — the PDF-detection rule both the pure gate side and the impure edge
// depend on (bead rk-we5i). What is under test is the CLASSIFICATION boundary: a false negative
// sends a PDF down the raw-bytes path (the rk-we5i bug: quotes can never match), a false positive
// sends an ordinary text source down the extraction path (a valid citation becomes a fail-closed
// ERROR). Both directions are asserted.

import { describe, expect, test } from "bun:test";
import { extractionPathFor, isPdfBytes, isPdfText, PDF_MAGIC } from "../../src/refs/pdf";

const REAL_PDF_HEAD = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\n";

describe("isPdfText", () => {
  test("recognizes the %PDF- header, which survives the lossy UTF-8 projection of binary bytes", () => {
    expect(isPdfText(REAL_PDF_HEAD)).toBe(true);
    expect(isPdfText(`${PDF_MAGIC}1.7`)).toBe(true);
  });

  test("does NOT classify an ordinary text source that merely mentions %PDF- as a PDF", () => {
    // A false positive here would route a perfectly quotable .tex/.txt source through the
    // extraction layer, turning every one of its citations into a fail-closed ERROR.
    expect(isPdfText("We converted the %PDF- header by hand.\nSee section 2.")).toBe(false);
    expect(isPdfText("\n%PDF-1.4")).toBe(false);
    expect(isPdfText("")).toBe(false);
  });
});

describe("isPdfBytes", () => {
  test("agrees with isPdfText on real bytes, without a UTF-8 round-trip", () => {
    const bytes = new TextEncoder().encode(REAL_PDF_HEAD);
    expect(isPdfBytes(bytes)).toBe(true);
    expect(isPdfBytes(new TextEncoder().encode("\\documentclass{article}"))).toBe(false);
  });

  test("a payload shorter than the 5-byte magic is not a PDF (no out-of-bounds read)", () => {
    expect(isPdfBytes(new Uint8Array([]))).toBe(false);
    expect(isPdfBytes(new TextEncoder().encode("%PDF"))).toBe(false);
  });
});

describe("extractionPathFor", () => {
  test("APPENDS rather than replaces the extension, keeping the payload name visible and the map injective", () => {
    expect(extractionPathFor("sources/paper.pdf")).toBe("sources/paper.pdf.extracted.txt");
    // Injective across payloads differing only by extension — a replace-the-extension convention
    // would collide these two onto one sidecar.
    expect(extractionPathFor("sources/paper.ps")).not.toBe(extractionPathFor("sources/paper.pdf"));
  });

  test("is path-space agnostic: lock-relative and repo-relative inputs stay in their own space", () => {
    expect(extractionPathFor("refs/sources/paper.pdf")).toBe("refs/sources/paper.pdf.extracted.txt");
  });
});
