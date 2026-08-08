// EDGE — fs. rk-ptx0 (S0): the ONE place `.rk/reward-ledger.jsonl` — the append-only reward event
// log the payout engine (src/reward/engine.ts) folds over — is actually opened. The engine is pure
// and takes `readonly RewardEvent[]`; this module is the thin fs seam around it, following the same
// edge-wraps-pure-core convention as src/drive/l5-store-io.ts around src/drive/l5-store.ts.
//
// APPEND-ONLY, BY CONSTRUCTION: every write goes through `appendFileSync` — never `writeFileSync`
// (which truncates), never a read-modify-write. ORDER IS MEANING (src/reward/types.ts): balances
// are derived by folding the log in file order, so a reordered or rewritten line silently changes
// every payout after it. There is no code path here that removes or rewrites a byte already on
// disk.
//
// MALFORMED LINES ARE FIRST-CLASS DATA, never silently dropped (CLAUDE.md L2). A garbage line, a
// mid-log blank line, an unknown `type`, or a known type missing a required field is skipped for
// the purposes of `events` (so later well-formed lines stay readable) and ALWAYS returned in
// `malformed` with its 1-based line number and raw text. This module does not choose how loudly to
// report them; `rk reward report` (src/cli/reward.ts) does, and `--strict` makes them exit 1.
// Unlike the L5 store there is no whole-file fail-closed here: a payout report that refuses to say
// anything is less useful than one that shows the fold AND names every line it could not read.
//
// NO TIMESTAMPS ANYWHERE (same determinism stance as schemas/graph.v1.json): serialization emits
// exactly the fields the event type declares, in a fixed order, and drops everything else — an
// event carrying a stray `timestamp` cannot smuggle it onto disk.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { coerceRewardEvent, parseRewardLedger, REWARD_LEDGER_RELPATH } from "../reward/parse";
import type { RewardEvent } from "../reward/types";
import type { RewardLedgerLoad } from "../reward/parse";

// The pure parsing/validation core moved to src/reward/parse.ts (Gate 8 consumes it there);
// re-exported here so this module stays the one import surface for ledger IO callers.
export { coerceRewardEvent, parseRewardLedger, REWARD_LEDGER_RELPATH } from "../reward/parse";
export type { MalformedLedgerLine, RewardLedgerLoad } from "../reward/parse";

/** The ledger's fixed, campaign-repo-relative location. Exported so no caller hand-derives it. */
export function rewardLedgerPath(root: string): string {
  return join(root, REWARD_LEDGER_RELPATH);
}

/** Reads and parses the ledger. A missing file is a legitimate state (a campaign that has never
 * banked an event) — an empty log, never an error, mirroring every other reader in src/store/. */
export function loadRewardLedger(root: string): RewardLedgerLoad {
  const path = rewardLedgerPath(root);
  if (!existsSync(path)) return { events: [], malformed: [] };
  return parseRewardLedger(readFileSync(path, "utf8"));
}

/** One canonical JSON line (no trailing newline) for `event`. Throws on an event that would not
 * survive a reload — a write that the loader would report as malformed is a defect at the writer,
 * not a line to put on an append-only log. */
export function serializeRewardEvent(event: RewardEvent): string {
  const coerced = coerceRewardEvent(event);
  if (!coerced.ok) throw new Error(`refusing to append an unreadable reward event: ${coerced.error}`);
  return JSON.stringify(coerced.event);
}

/** Appends every event as one write call (one `appendFileSync` carrying every line, each
 * newline-terminated), creating `.rk/` on first use. Every event is serialized BEFORE anything is
 * written, so an invalid event in the batch leaves the file byte-identical rather than partially
 * appended. Single-writer per repo (no locking) — the same documented assumption as
 * src/drive/l5-store-io.ts, consistent with rk's no-daemon stance (CLAUDE.md §7). */
export function appendRewardEvents(root: string, events: readonly RewardEvent[]): void {
  if (events.length === 0) return;
  const batch = events.map((e) => serializeRewardEvent(e) + "\n").join("");
  const path = rewardLedgerPath(root);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, batch, "utf8");
}

export function appendRewardEvent(root: string, event: RewardEvent): void {
  appendRewardEvents(root, [event]);
}
