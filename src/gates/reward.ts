// ROLE: Gate 8 — reward (`.rk/reward-ledger.jsonl`). Contract: docs/gate-contracts.md
// "Gate 8 — reward" (checks 1-4). NEW in N2 (rk-5man, PRD Amendment A1) — no AISM counterpart:
// the goal-graph payout ledger did not exist before rk. The ledger is the dark factory's
// account book; every fault here is STRUCTURAL (the LB5 stance on store-integrity: a corrupt or
// self-inconsistent ledger is never phase-demotable — a wrong balance in exploration is exactly
// as wrong as in consolidation).
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult, Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { hasPath } from "./snapshot";
import { readRetractionFacts } from "./linker-retraction";
import type { GateConfig } from "./config";
import { loadDefIds, parseRegistry } from "./linker-parse";
import type { Lemma } from "./linker-parse";
import { fileSha256 } from "./snapshot";
import { L5_STORE_PATH } from "./linker-l5";
import { l5StoreHealthy, latestVerdictFor, parseL5Log } from "../drive/l5-store";
import { parseRewardLedger, REWARD_LEDGER_RELPATH } from "../reward/parse";
import { computePayouts } from "../reward/engine";
import { supportedCloseTier, TIER_RANK } from "../reward/tier";
import type { RewardEvent } from "../reward/types";

/** Engine diagnostic codes that are LEDGER FAULTS (writer-protocol violations -> ERROR).
 * `escrow-expired` is deliberately absent: an expired escrow is the anti-decomposition-inflation
 * economics WORKING (prereg §1), an outcome to report, not a defect to flag. */
const FAULT_DIAGNOSTICS = new Set(["duplicate-close", "reduce-unpredicted", "prune-unpredicted", "compress-refused"]);

/** Registry ids an event references, by event type. `citedDefs`/`citedLemmas` are checked
 * separately (Check 3) so an unknown payout TARGET and an unknown reuse BENEFICIARY read as the
 * distinct problems they are. */
function targetIds(ev: RewardEvent): string[] {
  switch (ev.type) {
    case "close": return [ev.nodeId];
    case "prune": return [ev.nodeId];
    case "reduce": return [ev.obligation, ...ev.children];
    case "predict": return [ev.obligation];
    default: return [];
  }
}

/** Check 4b's backing test (hardened per the Tier A review of f5b6b7c, all four findings):
 * (a) PROVENANCE backs only if its FIRST whitespace-token resolves to an existing repo file
 *     that is not the shard itself — arbitrary prose, a nonexistent path, self-reference, and
 *     the M3.8 `legacy-same-family` marker (which asserts the OPPOSITE of verification) never
 *     back. Review finding: the escape was self-authenticating.
 * (b) An L5 verdict backs only from a HEALTHY store (zero parse issues, intact ordinal chain —
 *     l5StoreHealthy, the same poisoning stance as linker promotion; review reproduced an
 *     earlier-VALID resurrection on linker-41's truncated store),
 * (c) with a healthy retraction ledger and NO live retraction for the shard in EITHER hash
 *     domain (a withdrawn verdict must not back a permanent close; review reproduced on
 *     linker-44), and
 * (d) the latest-by-ordinal verdict fresh against current shard bytes and exactly VALID
 *     (VALID-WITH-CORRECTION and stale never back — linker-37 stance). */
export function pmaBacked(snapshot: RepoSnapshot, target: Lemma, lemmas: readonly Lemma[]): boolean {
  const prov = (target.provenance ?? "").trim();
  if (prov.length > 0) {
    const token = prov.split(/\s+/)[0]!;
    // Existence via the sha256 facts map, which covers EVERY file on disk (snapshot-load.ts:
    // "a provenance source row naming ANY present path is verified") — the text map's bounded
    // include set is irrelevant here; only existence is asserted, content is the auditor's job.
    if (token !== target.path && fileSha256(snapshot, token) !== undefined) return true;
    // unresolvable provenance is NOT backing; fall through to the L5 route
  }
  const text = snapshot.get(L5_STORE_PATH);
  if (text === undefined) return false;
  const parsed = parseL5Log(text);
  if (!l5StoreHealthy(parsed).healthy) return false;
  const retractions = readRetractionFacts(snapshot, lemmas);
  if (!retractions.healthy) return false;
  if (retractions.liveL5.has(target.id) || retractions.liveAf.has(target.id)) return false;
  const hash = fileSha256(snapshot, target.path);
  if (hash === undefined) return false;
  const latest = latestVerdictFor(parsed.records, target.id, hash);
  return latest !== undefined && latest.fresh && latest.verdict === "VALID";
}

export const rewardGate: Gate = {
  name: "reward",
  run(snapshot: RepoSnapshot, _config: GateConfig): GateResult {
    const findings: Finding[] = [];
    const path = REWARD_LEDGER_RELPATH;

    // A repo that has never banked an event is a legitimate day-1 state: clean pass, 0/0.
    if (!hasPath(snapshot, path)) {
      return { findings, coverage: [{ gate: "reward", unit: "ledger events", checked: 0, total: 0 }] };
    }

    const { events, malformed } = parseRewardLedger(snapshot.get(path) ?? "");

    // Check 1 — every line parses as a reward event. Malformed lines are first-class ERRORs,
    // one per line, with the loader's own diagnosis.
    for (const m of malformed) {
      findings.push({
        severity: "ERROR", path, line: m.line, structural: true,
        message: `[reward-malformed-line] ${m.error}`,
      });
    }

    // Check 2 — the payout fold's own fault diagnostics (duplicate close, unpredicted
    // reduce/prune, refused compress). Economic outcomes (escrow-expired) are not faults.
    const result = computePayouts(events);
    for (const d of result.diagnostics) {
      if (!FAULT_DIAGNOSTICS.has(d.code)) continue;
      findings.push({
        severity: "ERROR", path, structural: true,
        message: `[reward-${d.code}] event ${d.seq}${d.nodeId ? ` (${d.nodeId})` : ""}${d.detail ? `: ${d.detail}` : ""}`,
      });
    }

    // Check 3 — referential integrity into the registry: every payout target must be a real
    // registry id; every reuse beneficiary must be a registry id or a definition id. The ledger
    // may not pay ghosts.
    const { lemmas } = parseRegistry(snapshot);
    const lemmaById = new Map(lemmas.map((l) => [l.id, l]));
    const lemmaIds = new Set(lemmaById.keys());
    const defIds = loadDefIds(snapshot);
    events.forEach((ev, seq) => {
      for (const id of targetIds(ev)) {
        if (!lemmaIds.has(id)) {
          findings.push({
            severity: "ERROR", path, structural: true,
            message: `[reward-unknown-target] event ${seq} (${ev.type}) names '${id}', which is no argument/ shard id`,
          });
        }
      }
      // Check 4 (S0-1) — close-tier consistency: a CLOSE may bank at most the tier the node's
      // registry state supports (src/reward/tier.ts). Self-reported `status: proved` with
      // `af: none` supports NOTHING — the exact laundering class S0's smoke run caught live.
      if (ev.type === "close") {
        const target = lemmaById.get(ev.nodeId);
        if (target !== undefined) {
          const supported = supportedCloseTier(target);
          if (supported === undefined || TIER_RANK[ev.tier] > TIER_RANK[supported]) {
            findings.push({
              severity: "ERROR", path, structural: true,
              message: `[reward-tier-unsupported] event ${seq} closes '${ev.nodeId}' at tier '${ev.tier}' but the registry supports ${supported === undefined ? "no close tier (status=" + String(target.status) + ", af=" + target.af + " — self-report never banks)" : `at most '${supported}'`}`,
            });
          } else if (ev.tier === "proved-mod-audit" && target.af !== "validated" && !pmaBacked(snapshot, target, lemmas)) {
            // Check 4b (window-1 finding rk-90so): pma-by-STATUS is itself a self-reportable
            // axis — before it banks, the status must be BACKED by an external record: a fresh
            // VALID L5 verdict for this shard, or a non-empty `provenance:` declaration naming
            // the basis. Scoped here (the banking site), NOT the linker: live repos with
            // historical pma shards and no reward ledger see zero new findings.
            findings.push({
              severity: "ERROR", path, structural: true,
              message: `[reward-tier-unbacked] event ${seq} closes '${ev.nodeId}' at 'proved-mod-audit' but the status is backed by neither a fresh VALID L5 verdict nor a provenance declaration — an unbacked status axis never banks`,
            });
          }
        }
      }
      if (ev.type === "close") {
        for (const id of ev.citedDefs) {
          if (!defIds.has(id)) {
            findings.push({
              severity: "ERROR", path, structural: true,
              message: `[reward-unknown-citation] event ${seq} cites definition '${id}', which is no definitions/ shard id`,
            });
          }
        }
        for (const id of ev.citedLemmas) {
          if (!lemmaIds.has(id)) {
            findings.push({
              severity: "ERROR", path, structural: true,
              message: `[reward-unknown-citation] event ${seq} cites lemma '${id}', which is no argument/ shard id`,
            });
          }
        }
      }
    });

    return {
      findings,
      coverage: [{
        gate: "reward", unit: "ledger events",
        checked: events.length, total: events.length + malformed.length,
      }],
    };
  },
};
