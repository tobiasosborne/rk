// PURITY: pure — no fs/network/clock (L3). Gate 2 (linker) NEW check (M3.8, deliverable 3): the
// L5-promotion integration src/drive/l5-promote.ts's module header names as Gate 2's job to wire
// ("wiring this into Gate 2 (src/gates/**) is EXPLICITLY M3.8's job, not this WP's"). PRD C9 / M3.7:
// "the L5 verdict store... queried by the linker for stated->proved-mod-audit promotion."
//
// PRESENCE-CONDITIONAL, per L2: `.rk/l5-verdicts.jsonl` is read straight off `snapshot`'s
// already-loaded text map — src/store/snapshot-load.ts includes `.rk` one level deep, the exact
// same mechanism src/gates/freshness.ts already relies on for `.rk/generated.json` — so this check
// stays pure (no second fs read). A campaign that has never dispatched an L5 review has no such
// file; that is a legitimate state, named explicitly on the coverage line, NEVER an ERROR (a fresh
// scaffold must not fail Gate 2 just because L5 has not run yet).
//
// The l5ContentHash domain (docs/worker-contract.md section (f): "lowercase hex SHA-256 of the RAW
// SHARD-FILE BYTES, with NO normalization") is EXACTLY `RepoSnapshot.sha256`'s own domain
// (src/gates/snapshot.ts's `SnapshotFacts.sha256` doc comment: "full 64-char lowercase sha256 of
// the file's RAW bytes") — this check reuses `fileSha256(snapshot, l.path)` rather than
// recomputing a second, possibly-differently-normalized hash.
//
// WHAT THIS CHECK DOES NOT DO: it never rewrites the registry shard's `status:` field (Gate 2 is a
// checker, not a mutator) and it never feeds into `checkStatus`'s availability predicate (M3.8's
// brief: "L5 promotion is a status-computation input" — but `proved-mod-audit` is NOT `rigorous`
// per PRD §5's ladder table and does not count as `isAvailable`, so this promotion has no bearing
// on any EXISTING check's pass/fail verdict). It surfaces a non-blocking WARN naming which
// `status: stated` shards are eligible to be manually bumped to `proved-mod-audit` — an
// informational nudge, never itself a validity violation.

import type { Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { fileSha256 } from "./snapshot";
import type { Lemma } from "./linker-parse";
import { parseL5Log } from "../drive/l5-store";
import { promotionStateFor } from "../drive/l5-promote";

export const L5_STORE_PATH = ".rk/l5-verdicts.jsonl";

export interface L5PromotionResult {
  findings: Finding[];
  /** False iff `.rk/l5-verdicts.jsonl` is entirely absent from the repo — presence-conditional,
   * never an ERROR on its own (see file header). */
  present: boolean;
  /** `status: "stated"` shards this check actually queried the store for (only meaningful when
   * `present`). */
  checked: number;
  /** Of `checked`, how many came back `{status:"promotable"}`. */
  promotable: number;
}

const ABSENT: L5PromotionResult = { findings: [], present: false, checked: 0, promotable: 0 };

export function checkL5Promotion(snapshot: RepoSnapshot, lemmas: readonly Lemma[]): L5PromotionResult {
  const text = snapshot.get(L5_STORE_PATH);
  if (text === undefined) return ABSENT;

  const { records, issues } = parseL5Log(text);
  const findings: Finding[] = [];
  // A corrupted line in the store is surfaced (CLAUDE.md L2: never a silent skip) but WARN-only —
  // it degrades this check's own coverage, it does not block the whole gate (the store's own
  // integrity is not a registry-shard defect).
  for (const issue of issues) {
    findings.push({ severity: "WARN", path: L5_STORE_PATH, line: issue.line, message: `L5 store line malformed: ${issue.message}` });
  }

  let checked = 0;
  let promotable = 0;
  for (const l of lemmas) {
    if (l.status !== "stated") continue;
    const currentHash = fileSha256(snapshot, l.path);
    if (currentHash === undefined) continue; // shard file present but unhashed should not happen; skip rather than guess
    checked++;
    const decision = promotionStateFor(records, l.id, currentHash);
    if (decision.status === "promotable") {
      promotable++;
      findings.push({
        severity: "WARN",
        path: l.path,
        message: `L5 promotable: '${l.id}' has a fresh VALID L5 verdict (ordinal ${decision.record.ordinal}) while registry frontmatter still reads 'status: stated' — consider bumping to 'proved-mod-audit'`,
      });
    }
  }

  return { findings, present: true, checked, promotable };
}
