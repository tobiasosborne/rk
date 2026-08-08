// PURITY: pure — no fs/network/clock (L3). The reward ledger's PURE parsing/validation core,
// shared by the fs edge (src/store/reward-ledger.ts) and Gate 8 (src/gates/reward.ts) — one
// validator, never two competing implementations to drift apart. Moved here from the store edge
// so the gate can consume it without importing an fs-touching module.
//
// MALFORMED LINES ARE FIRST-CLASS DATA, never silently dropped (CLAUDE.md L2). A garbage line, a
// mid-log blank line, an unknown `type`, or a known type missing a required field is skipped for
// the purposes of `events` (so later well-formed lines stay readable) and ALWAYS returned in
// `malformed` with its 1-based line number and raw text.

import { CLOSE_TIER_WEIGHTS } from "./types";
import type { CloseTier, RewardEvent } from "./types";

/** The ledger's fixed campaign-repo-relative path — also the gate's snapshot key. */
export const REWARD_LEDGER_RELPATH = ".rk/reward-ledger.jsonl";

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
