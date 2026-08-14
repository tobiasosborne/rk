// Contract: docs/gate-contracts.md Gate 3 "Extraction layer (PDF payloads)" + src/gates/
// refs-extraction.ts. This is the validity core of bead rk-we5i: which bytes a claimed quote is
// matched against, and every way that resolution must fail closed.
//
// The load-bearing assertions are the NEGATIVE ones. A missing, absent, stale, or edited
// extraction must resolve to `ok: false` — never to a silent fallback to the raw payload (which
// re-creates the rk-we5i bug) and above all never to a match (which would certify a citation
// against text the current source no longer contains — strictly worse than the bug).

import { describe, expect, test } from "bun:test";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { sha256Hex } from "../../src/gates/sha256";
import { readLockFacts, resolveQuotableText } from "../../src/gates/refs-extraction";

const PAYLOAD = "refs/sources/paper.pdf";
const SIDECAR = "refs/sources/paper.pdf.extracted.txt";
const PDF_BYTES = "%PDF-1.4\n<< /Filter /FlateDecode >>\nstream\nx\nendstream\n";
const EXTRACTED = "Lemma 4.2 (spectral gap).\nthe spectral gap is uniformly bounded below\n";

const enc = new TextEncoder();
const sha = (s: string) => sha256Hex(enc.encode(s));

interface LockShape {
  path?: string;
  sha256?: string;
  extraction?: Record<string, unknown> | undefined;
}

/** Builds a snapshot with the PDF payload, its sidecar, and a lock whose entry can be perturbed
 * one field at a time — so each failure mode below differs from the golden case by exactly the
 * fact under test. */
function build(over: { lockRaw?: string; entry?: LockShape; omitSidecar?: boolean; payload?: string } = {}) {
  const payload = over.payload ?? PDF_BYTES;
  const entry = {
    path: "sources/paper.pdf",
    sha256: sha(payload),
    source_id: "paper",
    fetch: null,
    extraction: {
      path: "sources/paper.pdf.extracted.txt",
      sha256: sha(EXTRACTED),
      payload_sha256: sha(payload),
      tool: "pdftotext -layout",
    },
    ...over.entry,
  };
  const files: Record<string, string> = {
    [PAYLOAD]: payload,
    "refs/manifest/sources.lock.json": over.lockRaw ?? JSON.stringify({ files: [entry] }),
  };
  if (!over.omitSidecar) files[SIDECAR] = EXTRACTED;
  const snapshot = snapshotFromFiles(files);
  return { snapshot, lock: readLockFacts(snapshot) };
}

describe("resolveQuotableText — non-PDF payloads are untouched", () => {
  test("a text payload resolves to its own bytes, layer 'raw' (pre-rk-we5i behavior, verbatim)", () => {
    const snapshot = snapshotFromFiles({ "refs/sources/paper.tex": "Theorem 1.\nA verbatim sentence.\n" });
    const r = resolveQuotableText(snapshot, readLockFacts(snapshot), "refs/sources/paper.tex");
    expect(r).toEqual({ ok: true, text: "Theorem 1.\nA verbatim sentence.\n", layer: "raw", path: "refs/sources/paper.tex" });
  });

  test("a text payload needs no lock entry at all — an absent lock never blocks a text quote", () => {
    const snapshot = snapshotFromFiles({ "refs/sources/paper.tex": "x" });
    const r = resolveQuotableText(snapshot, readLockFacts(snapshot), "refs/sources/paper.tex");
    expect(r.ok).toBe(true);
  });

  test("an absent payload keeps the aism-dbq 19/19 ABSENT wording (never a skip)", () => {
    const snapshot = snapshotFromFiles({});
    const r = resolveQuotableText(snapshot, readLockFacts(snapshot), "refs/sources/gone.tex");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("ABSENT");
  });
});

describe("resolveQuotableText — the golden PDF case", () => {
  test("an intact chain resolves to the EXTRACTION text, not the payload's compressed bytes", () => {
    const { snapshot, lock } = build();
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    expect(r).toEqual({ ok: true, text: EXTRACTED, layer: "extraction", path: SIDECAR });
  });

  test("the resolved text is the layer a quote can actually be found in", () => {
    const { snapshot, lock } = build();
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    // The whole bug in one assertion: the sentence is in the extraction and nowhere in the payload.
    expect(r.ok === true && r.text.includes("uniformly bounded below")).toBe(true);
    expect(PDF_BYTES.includes("uniformly bounded below")).toBe(false);
  });
});

describe("resolveQuotableText — fail-closed PDF cases", () => {
  test("no extraction recorded => unresolvable, naming the missing layer (never a raw-bytes fallback)", () => {
    const { snapshot, lock } = build({ entry: { extraction: undefined } });
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("NO extraction layer recorded");
  });

  test("a partially-written extraction record is DROPPED, landing on the no-extraction branch", () => {
    const { snapshot, lock } = build({ entry: { extraction: { path: "sources/paper.pdf.extracted.txt", sha256: sha(EXTRACTED) } } });
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("NO extraction layer recorded");
  });

  test("the recorded extraction file being absent => unresolvable", () => {
    const { snapshot, lock } = build({ omitSidecar: true });
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("is ABSENT");
  });

  test("STALE CHAIN: extraction produced from a different payload revision => unresolvable", () => {
    // THE case the chain exists for. Everything else is impeccable — the sidecar matches its own
    // recorded sha256 exactly, and the payload matches its lock pin — but the extraction was made
    // from other bytes, so its text is not evidence about this payload.
    const { snapshot, lock } = build({
      entry: {
        extraction: {
          path: "sources/paper.pdf.extracted.txt",
          sha256: sha(EXTRACTED),
          payload_sha256: sha("%PDF-1.4\nan earlier revision\n"),
          tool: "pdftotext -layout",
        },
      },
    });
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("STALE");
  });

  test("EDITED EXTRACTION: sidecar bytes no longer match their recorded sha256 => unresolvable", () => {
    // The other half of the chain: the payload never moved, the derived text did. Without this a
    // fabricated sentence could be typed into the sidecar and cited.
    const { snapshot, lock } = build({
      entry: {
        extraction: {
          path: "sources/paper.pdf.extracted.txt",
          sha256: sha("text that was recorded, but is not what is on disk"),
          payload_sha256: sha(PDF_BYTES),
          tool: "pdftotext -layout",
        },
      },
    });
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("does not match its recorded sha256");
  });

  test("a malformed digest in the record is a BROKEN chain, never a skipped comparison", () => {
    const { snapshot, lock } = build({
      entry: {
        extraction: { path: "sources/paper.pdf.extracted.txt", sha256: sha(EXTRACTED), payload_sha256: "not-a-digest", tool: "x" },
      },
    });
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    expect(r.ok).toBe(false);
  });

  test("an unreadable lock leaves a PDF unresolvable (no chain can be checked)", () => {
    const { snapshot, lock } = build({ lockRaw: "{ not json" });
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("unparseable");
  });

  test("a PDF with no lock entry of its own is unresolvable", () => {
    const { snapshot, lock } = build({ entry: { path: "sources/other.pdf" } });
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("has no entry");
  });

  test("two lock entries for one payload are ambiguous, not first-wins", () => {
    const entry = {
      path: "sources/paper.pdf",
      sha256: sha(PDF_BYTES),
      source_id: "paper",
      fetch: null,
      extraction: { path: "sources/paper.pdf.extracted.txt", sha256: sha(EXTRACTED), payload_sha256: sha(PDF_BYTES), tool: "t" },
    };
    const { snapshot, lock } = build({ lockRaw: JSON.stringify({ files: [entry, entry] }) });
    const r = resolveQuotableText(snapshot, lock, PAYLOAD);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toContain("ambiguous");
  });
});

describe("readLockFacts", () => {
  test("carries the extraction record through when all four fields are present strings", () => {
    const { lock } = build();
    expect(lock.error).toBeUndefined();
    expect(lock.entries[0]!.extraction).toEqual({
      path: "sources/paper.pdf.extracted.txt",
      sha256: sha(EXTRACTED),
      payload_sha256: sha(PDF_BYTES),
      tool: "pdftotext -layout",
    });
  });

  test("one malformed files[] entry invalidates the WHOLE lock (a half-read hash authority is not one)", () => {
    const { lock } = build({ lockRaw: JSON.stringify({ files: [{ path: "a" }] }) });
    expect(lock.entries).toEqual([]);
    expect(lock.error).toContain("malformed");
  });

  test("an absent lock is an error state, never 'no constraints apply'", () => {
    const snapshot = snapshotFromFiles({});
    expect(readLockFacts(snapshot).error).toContain("absent");
  });
});
