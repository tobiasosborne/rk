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
import { CLOSE_TIER_WEIGHTS } from "../reward/types";
import type { CloseTier, RewardEvent } from "../reward/types";

export interface MalformedLedgerLine {
  /** 1-based line number in `.rk/reward-ledger.jsonl`. */
  line: number;
  /** The line exactly as it sits on disk — the operator needs the bytes, not a paraphrase. */
  raw: string;
  error: string;
}

export interface RewardLedgerLoad {
  events: RewardEvent[];
  malformed: MalformedLedgerLine[];
}

/** The ledger's fixed, campaign-repo-relative location. Exported so no caller hand-derives it. */
export function rewardLedgerPath(root: string): string {
  return join(root, ".rk", "reward-ledger.jsonl");
}

type Coerced = { ok: true; event: RewardEvent } | { ok: false; error: string };

const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

/** Validates one already-JSON-parsed value against the `RewardEvent` union and returns the
 * CANONICAL event — only the fields its type declares, nothing else. Minimal shape validation by
 * design: the engine's own diagnostics (unpredicted reduce, duplicate close, ...) are semantic
 * judgements over a well-formed log; this function only answers "is this line a reward event at
 * all". */
export function coerceRewardEvent(value: unknown): Coerced {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "not a JSON object" };
  }
  const o = value as Record<string, unknown>;
  const t = o.type;
  const bad = (field: string, want: string): Coerced => ({
    ok: false,
    error: `${String(t)} event: field '${field}' ${field in o ? `is not ${want}` : `is missing (expected ${want})`}`,
  });
  const wildcard = (): Record<string, boolean> => (o.wildcard === undefined ? {} : { wildcard: o.wildcard as boolean });

  switch (t) {
    case "round": {
      if (!isNum(o.n)) return bad("n", "a finite number");
      return { ok: true, event: { type: "round", n: o.n } };
    }
    case "predict": {
      if (!isStr(o.obligation)) return bad("obligation", "a string");
      if (!isStr(o.estimator)) return bad("estimator", "a string");
      if (!isNum(o.p250k)) return bad("p250k", "a finite number");
      if (!isNum(o.p1m)) return bad("p1m", "a finite number");
      return {
        ok: true,
        event: { type: "predict", obligation: o.obligation, estimator: o.estimator, p250k: o.p250k, p1m: o.p1m },
      };
    }
    case "reduce": {
      if (!isStr(o.obligation)) return bad("obligation", "a string");
      if (!isStrArray(o.children)) return bad("children", "an array of strings");
      return { ok: true, event: { type: "reduce", obligation: o.obligation, children: o.children } };
    }
    case "close": {
      if (!isStr(o.nodeId)) return bad("nodeId", "a string");
      if (!isStr(o.tier) || !(o.tier in CLOSE_TIER_WEIGHTS)) {
        return bad("tier", `one of the pre-registered tiers (${Object.keys(CLOSE_TIER_WEIGHTS).join(", ")})`);
      }
      if (!isNum(o.spentTokens)) return bad("spentTokens", "a finite number");
      if (!isStrArray(o.citedDefs)) return bad("citedDefs", "an array of strings");
      if (!isStrArray(o.citedLemmas)) return bad("citedLemmas", "an array of strings");
      if (o.wildcard !== undefined && typeof o.wildcard !== "boolean") return bad("wildcard", "a boolean when present");
      return {
        ok: true,
        event: {
          type: "close", nodeId: o.nodeId, tier: o.tier as CloseTier, spentTokens: o.spentTokens,
          citedDefs: o.citedDefs, citedLemmas: o.citedLemmas, ...wildcard(),
        },
      };
    }
    case "prune": {
      if (!isStr(o.nodeId)) return bad("nodeId", "a string");
      if (!isStr(o.certRef)) return bad("certRef", "a string (the death certificate's ref)");
      if (o.wildcard !== undefined && typeof o.wildcard !== "boolean") return bad("wildcard", "a boolean when present");
      return { ok: true, event: { type: "prune", nodeId: o.nodeId, certRef: o.certRef, ...wildcard() } };
    }
    case "compress": {
      if (!isStr(o.nodeId)) return bad("nodeId", "a string");
      if (!isStrArray(o.useSites)) return bad("useSites", "an array of strings");
      return { ok: true, event: { type: "compress", nodeId: o.nodeId, useSites: o.useSites } };
    }
    default:
      return {
        ok: false,
        error: t === undefined
          ? "no 'type' field — not a reward event"
          : `unknown event type '${String(t)}' (expected round|predict|reduce|close|prune|compress)`,
      };
  }
}

/** Parses raw ledger TEXT into events + malformed lines. A single trailing empty line (the normal
 * artifact of every appended line ending in `\n`) is a file-format convention, not data loss; ANY
 * other blank line is reported. */
export function parseRewardLedger(text: string): RewardLedgerLoad {
  const events: RewardEvent[] = [];
  const malformed: MalformedLedgerLine[] = [];
  if (text.length === 0) return { events, malformed };

  const rawLines = text.split("\n");
  const lines = rawLines[rawLines.length - 1] === "" ? rawLines.slice(0, -1) : rawLines;

  lines.forEach((raw, i) => {
    const line = i + 1;
    if (raw.trim().length === 0) {
      malformed.push({ line, raw, error: "blank line inside the log (not the file's own trailing newline)" });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      malformed.push({ line, raw, error: `unparseable JSON: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    const coerced = coerceRewardEvent(parsed);
    if (coerced.ok) events.push(coerced.event);
    else malformed.push({ line, raw, error: coerced.error });
  });

  return { events, malformed };
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
