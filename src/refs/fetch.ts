// EDGE — network + fs. Ports fetch-refs.py's `fetch_spec` (fetch-refs.py:66-110): given a
// FetchSpec and the expected sha256, return the verified bytes or null. Every byte written
// anywhere in rk is verified against its recorded hash FIRST (fetch-refs.py's own framing,
// module docstring lines 18-19) — a wrong-hash download is never returned, let alone installed.
//
// `get` is injectable so tests never touch the network (a file:// URL reads a local fixture
// directly; arxiv-* kinds accept a fake getter). Unlike fetch-refs.py's default-arg-dict
// memoization (one process = one campaign-wide reconstruction run), rk's `add` fetches exactly
// one source per invocation, so memoization is dropped as a documented, parity-free deviation.

import { fileURLToPath } from "node:url";
import type { FetchSpec } from "../types";
import { sha256Bytes } from "./hash";

export type UrlGetter = (url: string) => Promise<Uint8Array>;

const ARXIV_EPRINT = (id: string) => `https://arxiv.org/e-print/${id}`;
const ARXIV_PDF = (id: string) => `https://arxiv.org/pdf/${id}`;

async function defaultGet(url: string): Promise<Uint8Array> {
  if (url.startsWith("file://")) {
    return new Uint8Array(await Bun.file(fileURLToPath(url)).arrayBuffer());
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Minimal single-pass ustar/POSIX-tar reader: regular-file entries only, no GNU long-name
 * extensions (a known, documented gap — arXiv e-print tarballs are typically plain ustar; see
 * HANDOFF for the fixture that would motivate extending this). Throws on anything that does not
 * look like a valid tar, so callers can treat a throw as "not a tar" and move on, mirroring
 * fetch-refs.py's `except Exception: pass` around `tarfile.open`. */
function parseTar(buf: Uint8Array): Array<{ name: string; content: Uint8Array }> {
  if (buf.length < 512) throw new Error("too short to be a tar archive");
  const entries: Array<{ name: string; content: Uint8Array }> = [];
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break; // end-of-archive zero block
    const name = readCString(header, 0, 100);
    const sizeField = readCString(header, 124, 12).trim();
    const size = sizeField ? parseInt(sizeField, 8) : 0;
    if (!Number.isFinite(size) || size < 0) throw new Error("bad tar header: unparseable size");
    const typeflag = String.fromCharCode(header[156] ?? 0);
    offset += 512;
    if (size > buf.length - offset) throw new Error("bad tar header: size exceeds archive length");
    if ((typeflag === "0" || typeflag === "\0") && name) {
      entries.push({ name, content: new Uint8Array(buf.subarray(offset, offset + size)) });
    }
    offset += Math.ceil(size / 512) * 512;
  }
  return entries;
}

function readCString(buf: Uint8Array, start: number, len: number): string {
  const slice = buf.subarray(start, start + len);
  const nul = slice.indexOf(0);
  return new TextDecoder().decode(nul === -1 ? slice : slice.subarray(0, nul));
}

/** Returns the verified bytes for `spec`, or null if unresolvable/hash-mismatched — never
 * throws (any network/parse failure falls through to null, matching fetch-refs.py:108-109's
 * blanket `except Exception: return None`). */
export async function fetchSpec(
  spec: FetchSpec,
  expectedSha256: string,
  get: UrlGetter = defaultGet,
): Promise<Uint8Array | null> {
  try {
    if (spec.kind === "url") {
      const b = await get(spec.url);
      return sha256Bytes(b) === expectedSha256 ? b : null;
    }
    if (spec.kind === "arxiv-pdf") {
      const b = await get(ARXIV_PDF(spec.id));
      return sha256Bytes(b) === expectedSha256 ? b : null;
    }
    const raw = await get(ARXIV_EPRINT(spec.id));
    if (spec.kind === "arxiv-eprint") {
      return sha256Bytes(raw) === expectedSha256 ? raw : null;
    }
    // arxiv-eprint-member: the e-print bundle may itself be a tar.gz, a bare gzipped single
    // file, or (rarely) raw — try each, then try opening each as a tar and add its members,
    // finally check every candidate's hash. Mirrors fetch-refs.py:91-107 exactly, including the
    // snapshot-before-extending order (see module tests for the deviation-free property).
    const candidates: Uint8Array[] = [raw];
    try {
      candidates.push(Bun.gunzipSync(new Uint8Array(raw)));
    } catch {
      /* not gzip-compressed; fine */
    }
    for (const blob of [...candidates]) {
      try {
        for (const entry of parseTar(blob)) candidates.push(entry.content);
      } catch {
        /* not a tar; fine */
      }
    }
    for (const c of candidates) {
      if (sha256Bytes(c) === expectedSha256) return c;
    }
    return null;
  } catch {
    return null;
  }
}
