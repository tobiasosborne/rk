<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-11, session close — wave 2 opened: rk-0ree landed)

This session (Fable, serial, no subagents — TJO directive): took the first wave-2
item, rk-0ree, end to end. **Attribution rule v1 is settled and live**: per-node
spentTokens is now recovered from `.rk/driver-log.jsonl` and banked into close
events by `rk reward sync`. The window-1 inversion (prunes paid ~1.3, real pma
closes paid 0.0 because every close banked spentTokens=0) is fixed at the source.
All green at close: 2809 tests, corpus 161/161, selftest OK. Commit 1a945db.

**The rule** (dated append to docs/memos/2026-08-08-prereg-autonomy-v1.md, at its
legitimate S0-2 re-registration point; pure implementation in
src/reward/attribution.ts):
- Hard-tier usage records (claimId not starting `l5:`) attribute in FULL to their
  `contractId` — one af workspace closes one contract; prover/verifier/repair/
  discarded turns all count (the rk-s9t budget stance).
- L5 records (claimId starting `l5:`) attribute member turns to `nodeId`;
  `(session-open)` sentinel cost pools per session and splits integer-fair across
  that session's distinct members; a dead session's open cost is reported
  unattributable, never smeared.
- Conservation: attributed + unattributed == the log's total usage tokens
  (property-tested). Figures are at-sync-time; a close banks once.
- Sync FAILS CLOSED on unreadable driver-log lines (hidden spend); only
  `unrecognized 'kind'` warns (cannot conceal a usage record).

**L6 process held**: codex gpt-5.6-sol xhigh review BEFORE landing (the opus-panel
directive was wave-1-only; default review policy resumed). Two P2 validity findings,
both repaired and probe-verified same-session, one review round + one repair wave:
- Fractional usage components could MINT tokens via fairShares(0.5,1)=[1] —
  usage components now must be non-negative INTEGERS (parse-level, all readers).
- A registry node literally named `(session-open)` collides with the L5 sentinel —
  the id is now reserved: l5-dispatch refuses such a member pre-dispatch
  (stage "reserved-item-id"), sync withholds such a close loudly.

**Live-fire**: dry-runs on the two rk-m3.5-baseline repos (real driver logs).
lem-mass-split banks spentTokens=273996 — exact match against an independent
python hand-sum; lem-starvation-completion-obstruction banks 1533460.

**Also this session**: fairShares moved to src/drive/accounting.ts and the
session-open sentinel to src/drive/report-parse.ts (pure homes; l5-dispatch
re-exports); docs/worker-contract.md usage-shape clause updated.

## Next steps (wave 2 continues, then per the remediation plan)

1. **rk-tlwb (P1)** — provenance-record producer + schema: campaign-A draws 12
   [reward-tier-unbacked] findings; needs schemas/provenance-record.v1.json + a
   writer + template section + campaign remediation. Do NOT weaken the gate.
2. **rk-6cmx + rk-oeal (P1)** — template gets §G AND the full campaign-proven
   protocol (probes I.1-I.3, brief format, hostile seat, worker lifecycle), every
   section citing its campaign scar; then backfill campaign C's constitution and
   run its round-0 `rk reward sync` chore (dry-run first — campaign repos have no
   driver logs, so closes bank 0 there until campaign tooling writes usage records;
   that is honest, not a bug).
3. rk-io5l (port campaign C's record-integrity oracle if sound), rk-cz1h (escrow
   on-ramp design; reduces=0 across all 6 windows — Tier A where it touches payouts).
4. **Wave 3 — worker contract / unattended operation**: rk-4w2y, rk-p037, rk-j8xo,
   rk-7the (needs TJO ratification).
5. **Wave 4 — boundary-probe worker** (rk-5man); **wave 5** — audit lenses
   (rk-czzc into rk-g7fc) + Tier C friction batch.
Campaign C window 2 launches only after waves 1-2 are in (frozen-environment rule).
Waves 3-4 gate any further unattended/zero-intervention window (rk-afyf).

## TJO decision queue (blocking, unchanged from 2026-08-10 + one resolved)

1. rk-7the — ratify no-pattern-kill amendment (text exists, live incident).
2. rk-23pr — ratify remaining autonomy plan items.
3. Roster policy: window-5 same-family waiver — standing or per-campaign?
4. Campaign codas (cheap, decaying): rk-2h33 (Theorem G via af), rk-iup9
   (campaign B regrade), rk-mxl3 (C_G contract repair ruling).
5. ~~Review policy~~ RESOLVED this session by default: opus panel was wave-1-only;
   wave 2 reviews ran codex gpt-5.6-sol xhigh per standing §3. Say if wrong.

## Key facts for the next session

- `dist/rk` still NOT rebuilt (frozen env; ~/.local/bin/rk symlinks it). Sessions
  here ran the new code via `bun run src/cli.ts`. Rebuild deliberately before any
  campaign window uses reward sync: `bun build --compile src/cli.ts --outfile dist/rk`.
- Campaign repos (rk-campaign-A/C) have reward ledgers (A) but NO driver logs —
  their workers ran outside the rk driver. New closes there bank spentTokens=0
  honestly. Real figures start once campaign windows drive workers through rk
  (or rk-0ree-style accounting is added to campaign tooling — not planned).
- The two rk-m3.5-baseline repos are the live-fire targets with real driver logs.
- Usage-record validation is now STRICTER (non-negative integers). Any tool
  writing driver-log usage records must comply or its lines block reward sync.
- `(session-open)` is a reserved id everywhere (prereg append clause 7).
- Corpus counts live at test/corpus.test.ts:66,68 + EXPECTED_FIXTURE_COUNT=161;
  README Totals reconciled. Keep true.
- Codex review invocation that works: `codex exec review --uncommitted -c
  model_reasoning_effort="xhigh" -o <file>` — it does NOT accept a prompt
  argument alongside --uncommitted.

## Governance (standing)

- Anti-Zeno held: ONE review round + ONE repair wave; repairs verified by
  re-running the reviewer's own exploits, not re-reviewed.
- L1/L2 never relaxed: every change red-green with mutation proofs (5 mutations
  proved on the attribution rule alone).
- D1-D8 + PRD Amendment A1 stand. bd for all tracking. Benchmark hygiene rules
  unchanged (campaign A wound down, B closed, C between windows 1 and 2).
