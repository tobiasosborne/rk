// EDGE — spawns a subprocess, touches PATH. PDF -> markdown extraction via the optional
// `marker` binary (https://github.com/VikParuchuri/marker), per PRD C7 ("extract (PDF->text/
// markdown via marker where available)") and IMPLEMENTATION_PLAN.md M0.6 ("marker PDF->markdown
// integration optional-with-graceful-skip"). CLAUDE.md L2's "a skip is always visible with a
// count" applies here too: an absent binary must never fail silently — the caller (rk refs add)
// is responsible for surfacing the skip count, never dropping it.

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type Which = (bin: string) => string | null;

/** True iff the `marker` binary is on PATH. `which` is injectable for tests; defaults to
 * Bun.which, which returns null (not a path) when the binary is absent. */
export function markerAvailable(which: Which = (bin) => Bun.which(bin)): boolean {
  return which("marker") !== null;
}

export type ExtractResult =
  | { skipped: true; reason: string }
  | { skipped: false; outputPath: string };

/** Extracts `pdfPath` to markdown under `outDir` via `marker`, or reports a visible skip if the
 * binary is unavailable. Never throws for the "no marker" case — that is the expected, graceful
 * path this function exists to model; a spawn/exit failure of an actually-present binary DOES
 * propagate (a present-but-broken tool is a real error, not a skip). */
export async function extractWithMarker(
  pdfPath: string,
  outDir: string,
  which: Which = (bin) => Bun.which(bin),
): Promise<ExtractResult> {
  const bin = which("marker");
  if (bin === null) {
    return { skipped: true, reason: "marker not found" };
  }
  const proc = Bun.spawn([bin, pdfPath, "--output_dir", outDir], { stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`marker exited ${exitCode}: ${stderr}`);
  }
  return { skipped: false, outputPath: outDir };
}

// ---------------------------------------------------------------------------------------
// The extraction TEXT layer (bead rk-we5i)
// ---------------------------------------------------------------------------------------
//
// A compressed PDF keeps every sentence inside FlateDecode streams, so no quote can be located
// or byte-verified against its raw bytes (`rk refs quote` returned pattern-not-found even for
// "spectral gap"; Gate 3 could never verify a `status: cited` shard against a PDF source). PRD C7
// names the answer — extract, and record the SHA256 of payload AND extraction. This section
// produces the extraction's TEXT; `src/refs/extraction-store.ts` writes it down and chains it.

/** An extractor rk is willing to run, in preference order. `marker` first (PRD C7 names it, and
 * its markdown keeps structure a plain text dump loses), `pdftotext -layout` as the fallback that
 * is present on essentially every Linux/macOS box with poppler installed. Both are OPTIONAL: the
 * absence of both is a visible, counted skip, never a silent one and never an error (L2). */
export const EXTRACTOR_PREFERENCE = ["marker", "pdftotext"] as const;
export type ExtractorName = (typeof EXTRACTOR_PREFERENCE)[number];

export interface Extractor {
  name: ExtractorName;
  bin: string;
  /** Recorded verbatim into the lock's `extraction.tool` field — provenance for a human reader.
   * It is never consulted for a validity decision: a tool name proves nothing about the bytes,
   * only `extraction.sha256`/`payload_sha256` do. */
  tool: string;
}

/** First available extractor in `EXTRACTOR_PREFERENCE`, or null when none is installed. `which` is
 * injectable so both the ordering and the nothing-installed path are unit-testable without either
 * binary present (defaults to `Bun.which`, which returns null for an absent binary). */
export function selectExtractor(which: Which = (bin) => Bun.which(bin)): Extractor | null {
  for (const name of EXTRACTOR_PREFERENCE) {
    const bin = which(name);
    if (bin !== null) return { name, bin, tool: name === "pdftotext" ? "pdftotext -layout" : "marker" };
  }
  return null;
}

export type PdfTextResult =
  | { skipped: true; reason: string }
  | { skipped: false; text: string; tool: string };

/** Extracts `pdfPath`'s text with the best available extractor.
 *
 * Returns a VISIBLE skip (never throws) when no extractor is installed — that is the graceful
 * degradation PRD C7/M0.6 require, and the caller is responsible for surfacing it with a count.
 * A present-but-failing extractor DOES throw: a broken tool is a real error, not a skip, and
 * silently treating it as "no extraction available" would let a misconfigured box quietly demote
 * every PDF citation. */
export async function extractPdfText(pdfPath: string, which: Which = (bin) => Bun.which(bin)): Promise<PdfTextResult> {
  const extractor = selectExtractor(which);
  if (extractor === null) {
    return { skipped: true, reason: `no PDF text extractor found on PATH (tried: ${EXTRACTOR_PREFERENCE.join(", ")})` };
  }
  const text = extractor.name === "pdftotext" ? await runPdftotext(extractor.bin, pdfPath) : await runMarker(extractor.bin, pdfPath);
  return { skipped: false, text, tool: extractor.tool };
}

/** `pdftotext -layout <pdf> -` writes plain text to stdout: no temp files, and `-layout` preserves
 * the physical line structure, which is what makes the `path:line` citation anchor mean anything. */
async function runPdftotext(bin: string, pdfPath: string): Promise<string> {
  const proc = Bun.spawn([bin, "-layout", pdfPath, "-"], { stdout: "pipe", stderr: "pipe" });
  const [text, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) throw new Error(`pdftotext exited ${exitCode}: ${stderr}`);
  return text;
}

/** marker writes markdown into an output DIRECTORY rather than to stdout, so this runs it against a
 * scratch dir and reads back the single markdown file it produced (marker nests output under a
 * per-document subdirectory, hence the recursive search). The scratch dir is always removed. */
async function runMarker(bin: string, pdfPath: string): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), "rk-extract-"));
  try {
    const proc = Bun.spawn([bin, pdfPath, "--output_dir", outDir], { stdout: "pipe", stderr: "pipe" });
    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
    if (exitCode !== 0) throw new Error(`marker exited ${exitCode}: ${stderr}`);
    const produced = findFirstMarkdown(outDir);
    if (produced === null) throw new Error(`marker exited 0 but produced no .md file under ${outDir}`);
    return readFileSync(produced, "utf8");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

/** First `.md` file under `dir`, depth-first with entries visited in sorted order so the choice is
 * deterministic when marker emits more than one. */
function findFirstMarkdown(dir: string): string | null {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      const nested = findFirstMarkdown(abs);
      if (nested !== null) return nested;
    } else if (name.endsWith(".md")) {
      return abs;
    }
  }
  return null;
}
