// TEST HELPER (not a test file — bun test only collects *.test.ts). Builds a minimal, real PDF
// whose text lives ONLY inside a FlateDecode-compressed content stream, so the sentences it
// renders appear nowhere in its raw bytes. That property is the whole premise of bead rk-we5i:
// `grep -F`, `rk refs quote`'s old payload scan and Gate 3's old `sourceLine.includes(quote)` all
// miss a sentence that is plainly in the document.
//
// Zero runtime deps (L4): `node:zlib` is a Bun/Node builtin, and this file is test-only anyway.
// The same generator produced the checked-in corpus payloads (corpus/refs/refs-17..19); keeping it
// here means the fixture's key property can be re-derived and asserted, not just asserted about
// bytes someone once committed.

import { deflateSync } from "node:zlib";

/** A one-page PDF rendering `lines`, with the content stream Flate-compressed. */
export function makeCompressedPdf(lines: string[]): Uint8Array {
  const ops = ["BT", "/F1 12 Tf", "72 720 Td", "14 TL"];
  // PDF literal strings are `(...)`; `\`, `(` and `)` must be backslash-escaped (PDF 1.7 §7.3.4.2).
  for (const line of lines) {
    ops.push(`(${line.replace(/[\\()]/g, (c) => `\\${c}`)}) Tj`, "T*");
  }
  ops.push("ET");
  const stream = deflateSync(Buffer.from(ops.join("\n"), "ascii"), { level: 9 });

  const objects: Buffer[] = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    ),
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n`),
      stream,
      Buffer.from("\nendstream"),
    ]),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];

  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let at = parts[0]!.length;
  objects.forEach((body, i) => {
    offsets.push(at);
    const obj = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    parts.push(obj);
    at += obj.length;
  });
  const size = objects.length + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`;
  parts.push(Buffer.from(xref));
  return new Uint8Array(Buffer.concat(parts));
}
