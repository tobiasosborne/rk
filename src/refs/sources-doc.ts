// EDGE — fs. The one place refs/manifest/SOURCES.md is READ before a row is appended to it.
//
// Why it is shared (rk-tyl6, found live by ../rk-campaign-D): `adopt` seeded a fresh SOURCES.md
// when none existed (`.catch(() => emptySourcesDocument())`) and `add` did not — a bare
// `Bun.file(path).text()` that threw ENOENT on the very first `rk refs add` in a fresh scaffold.
// Two call sites, two behaviors, one of them a crash. There is now one reader, so a future third
// writer cannot re-open the same gap.
//
// "Absent" here includes a file that exists but is blank: `touch refs/manifest/SOURCES.md` was
// the hand-rolled workaround campaign-D used to get past the ENOENT, and an empty file carries no
// `## Source registry` table, so appending to it would have thrown one step later.

import { emptySourcesDocument } from "./manifest";

/** The SOURCES.md text to append a row to: the file's own content, or a freshly seeded empty
 * registry document when the file is absent or blank. Never writes; the caller owns the write
 * (and, per `add.ts`'s ordering note, owns when it happens relative to the machine artifacts). */
export async function readSourcesDocument(path: string): Promise<string> {
  const text = await Bun.file(path)
    .text()
    .catch(() => "");
  return text.trim() === "" ? emptySourcesDocument() : text;
}
