// PURITY: pure — no fs/network/clock (L3). M3.6 balloon feedback loop, the frontmatter WRITE half:
// a string -> string transform that stamps `balloons:` + `balloon_classifications:` into a registry
// shard's frontmatter while preserving EVERY other byte of the file exactly. The impure EDGE
// (src/drive/driver-run.ts) reads the shard bytes, calls this, and writes the result back; this
// module never touches fs.
//
// SAFETY DESIGN (why this is a byte-surgical rewrite, not a re-serialize):
//   1. The file is split on "\n" and rejoined on "\n" — a lossless round trip that preserves the
//      trailing-newline state and every interior line verbatim. Nothing outside the two balloon keys
//      is ever reformatted.
//   2. Only the frontmatter block (first non-blank line == "---" through its closing "---") is
//      touched; the body after the closing delimiter is copied through untouched.
//   3. Inside the block, ONLY a prior `balloons:` scalar line and a prior `balloon_classifications:`
//      block-list (its key line + immediately-following `- item` lines) are removed; every other
//      frontmatter line — including id/kind/status/contract/deps/defs and any unrelated multi-line
//      list — is preserved character-for-character in its original position and order.
//   4. The fresh balloon block is inserted immediately before the closing "---", using EXACTLY the
//      flat `key: value` + `- item` grammar src/gates/snapshot.ts's parseFrontmatter already
//      accepts (an empty-valued key followed by `- item` continuation lines), so the write round-
//      trips back through the parser to the same BalloonCounter it came from. Re-running it is
//      idempotent in shape (it replaces its own prior block, never stacks a second one).
//
// The write is REFUSED (returns {ok:false}) rather than guessed if the file has no parseable
// frontmatter block — a shard the linker itself would reject is never silently rewritten.

import type { BalloonCounter } from "../graph/types";

const DELIM = "---";
const BALLOONS_KEY = "balloons";
const CLASSIFICATIONS_KEY = "balloon_classifications";

export type FrontmatterWriteResult = { ok: true; content: string } | { ok: false; reason: string };

interface Block {
  openIdx: number; // index of the opening "---" line
  closeIdx: number; // index of the closing "---" line
}

/** Locates the frontmatter block: the first non-blank line must be a bare "---", and a later bare
 * "---" closes it. Returns undefined (caller refuses the write) when either is absent — the same
 * present/terminated conditions parseFrontmatter enforces. */
function locateBlock(lines: string[]): Block | undefined {
  let openIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() === "") continue;
    openIdx = lines[i]!.trim() === DELIM ? i : -1;
    break;
  }
  if (openIdx === -1) return undefined;
  for (let i = openIdx + 1; i < lines.length; i++) {
    if (lines[i]!.trim() === DELIM) return { openIdx, closeIdx: i };
  }
  return undefined;
}

/** Returns the frontmatter body lines (between the delimiters) with any prior `balloons:` /
 * `balloon_classifications:` lines stripped. A `balloon_classifications:` key line is stripped
 * together with the `- item` continuation lines that immediately follow it — mirroring how
 * parseFrontmatter's pendingListKey accumulates them — so re-marking replaces the whole block
 * cleanly instead of orphaning stale `- item` lines. */
function stripPriorBalloonLines(bodyLines: string[]): string[] {
  const out: string[] = [];
  let skippingClassificationList = false;
  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (skippingClassificationList) {
      if (trimmed.startsWith("-")) continue; // a continuation item of the old list — drop it
      skippingClassificationList = false; // list ended; fall through to normal handling
    }
    const idx = line.indexOf(":");
    const key = idx === -1 ? undefined : line.slice(0, idx).trim();
    if (key === BALLOONS_KEY) continue; // drop the old scalar
    if (key === CLASSIFICATIONS_KEY) {
      skippingClassificationList = true; // drop this key line and its following items
      continue;
    }
    out.push(line);
  }
  return out;
}

/** Renders the fresh balloon block in the flat grammar parseFrontmatter accepts. Classifications go
 * as a `- item` block list under an empty-valued key; an empty classification list omits the list
 * key entirely (a zero-history mark is just the counter). */
function renderBalloonBlock(counter: BalloonCounter): string[] {
  const block = [`${BALLOONS_KEY}: ${counter.count}`];
  if (counter.classifications.length > 0) {
    block.push(`${CLASSIFICATIONS_KEY}:`);
    for (const c of counter.classifications) block.push(`- ${c}`);
  }
  return block;
}

/** Stamps `counter` into `content`'s frontmatter, preserving everything else byte-exactly. Returns
 * `{ok:false}` when `content` has no locatable/terminated frontmatter block. */
export function applyBalloonMark(content: string, counter: BalloonCounter): FrontmatterWriteResult {
  const lines = content.split("\n");
  const block = locateBlock(lines);
  if (!block) return { ok: false, reason: "no terminated frontmatter block (first non-blank line must be '---' with a later closing '---')" };

  const head = lines.slice(0, block.openIdx + 1); // through the opening "---"
  const body = lines.slice(block.openIdx + 1, block.closeIdx);
  const tail = lines.slice(block.closeIdx); // the closing "---" and everything after

  const preserved = stripPriorBalloonLines(body);
  const rebuilt = [...head, ...preserved, ...renderBalloonBlock(counter), ...tail];
  return { ok: true, content: rebuilt.join("\n") };
}
