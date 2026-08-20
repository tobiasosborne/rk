// PURITY: pure — no fs/network/clock (L3). THE ONE implementation of Gate 3's anchor rule: "a
// `refs/<path>:<line>` pointer plus a quoted line verifies iff the payload is present, satisfies
// its adopted pin, resolves to its quotable layer, and the raw quoted text occurs as an exact
// case-sensitive substring of that recorded line" (docs/gate-contracts.md Gate 3 Check 8, `grep -F`
// semantics: no normalization, no locus tolerance).
//
// Extracted from ./refs-shard-citations.ts by rk-nsex, unchanged in behavior, because a SECOND
// caller now needs the identical rule: the extraction records of Check 11 anchor every hypothesis
// the same way an argument shard anchors a citation. Two implementations of "what makes an anchor
// verified" would be two different answers to the only question this gate exists to answer, so
// the record checker calls this function rather than re-deriving it (campaign memo section 4:
// "Check 8/9 semantics, exact"). The `label` parameter is the ONLY thing that varies between
// callers — it names the claim in the message ("shard citation refs/x:2", "record anchor
// refs/x:2") without changing a single decision.

import { normalizeQuoteText } from "../refs/quote";
import { LOCK_PATH, resolveQuotableText, type LockFacts } from "./refs-extraction";
import { fileSha256, type RepoSnapshot } from "./snapshot";

const FULL_SHA256_RE = /^[0-9a-fA-F]{64}$/;

export interface AnchorClaim {
  /** `refs/<path>` — the payload the quote is claimed to come from. */
  sourcePath: string;
  /** The text after the colon, as written (`"2"`); undefined when the pointer carried none. */
  locusText?: string;
  /** The claimed byte-verbatim quote, as written, un-normalized. */
  quote?: string;
}

function safeSourcePath(path: string): boolean {
  const parts = path.split("/");
  return path.startsWith("refs/") && parts.every((part) => part !== "" && part !== "." && part !== "..");
}

/** Verifies one anchor. Returns `undefined` when it verifies, or the finding MESSAGE (already
 * prefixed with `label`) when it does not. Callers wrap the message in their own `Finding` so each
 * surface keeps its own path/line attribution and severity policy. */
export function verifyAnchor(
  snapshot: RepoSnapshot,
  lock: LockFacts,
  claim: AnchorClaim,
  label: string,
): string | undefined {
  if (!safeSourcePath(claim.sourcePath)) return `${label} has an unsafe/unresolvable refs source path`;
  if (claim.locusText === undefined || !/^[1-9]\d*$/.test(claim.locusText)) {
    return `${label} has no resolvable positive line locus (rk refs quote emits path:line)`;
  }
  const recordedLine = Number(claim.locusText);
  if (!Number.isSafeInteger(recordedLine)) return `${label} has an unresolvable line locus`;
  if (claim.quote === undefined || normalizeQuoteText(claim.quote) === "") {
    return `${label} is not followed by a recognizable double-quoted byte-verbatim line`;
  }

  const sourceText = snapshot.get(claim.sourcePath);
  if (sourceText === undefined) return `source payload ${claim.sourcePath} ABSENT — ${label} cannot be byte-verified`;
  if (lock.error !== undefined) return `${label} is not hash-pinned: ${lock.error}`;

  const refsRelative = claim.sourcePath.slice("refs/".length);
  const pins = lock.entries.filter((pin) => pin.path === refsRelative);
  if (pins.length !== 1) {
    const reason = pins.length === 0 ? "has no entry" : `has ${pins.length} ambiguous entries`;
    return `${label} is not hash-pinned: ${LOCK_PATH} ${reason} for ${refsRelative}`;
  }
  const pin = pins[0]!;
  if (!FULL_SHA256_RE.test(pin.sha256)) return `${label} is not hash-pinned by a valid full sha256`;
  const actualSha = fileSha256(snapshot, claim.sourcePath);
  if (actualSha === undefined) return `${label} payload is present but has no raw-byte sha256 fact`;
  if (actualSha.toLowerCase() !== pin.sha256.toLowerCase()) {
    return `${label} sha256 ${actualSha} does not match adopted pin ${pin.sha256}`;
  }

  // rk-we5i: WHICH bytes the recorded line locus indexes. For an ordinary text payload, the payload
  // itself (unchanged). For a PDF payload, the chained extraction layer — the payload's own bytes
  // are compressed streams containing none of the document's sentences, so `includes` there can
  // only ever produce a false NOT-FOUND. Any break in the extraction chain resolves to `ok: false`
  // and lands here as one counted ERROR: the claim is in the denominator, never the numerator.
  const resolved = resolveQuotableText(snapshot, lock, claim.sourcePath);
  if (!resolved.ok) return `${label} cannot be byte-verified: ${resolved.reason}`;

  const sourceLine = resolved.text.split(/\r?\n/)[recordedLine - 1];
  if (sourceLine === undefined || !sourceLine.includes(claim.quote)) {
    const where = resolved.layer === "extraction" ? ` of extraction layer ${resolved.path}` : "";
    return `${label} quote NOT found byte-for-byte at recorded locus line ${recordedLine}${where} (exact substring / grep -F semantics)`;
  }
  return undefined;
}
