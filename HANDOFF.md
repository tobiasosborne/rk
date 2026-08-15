<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-15, session close — campaign-D w1s4 cycle complete)

This session (Fable, dual role: rk observer + campaign-D orchestrator per TJO directive):
recovered the 2026-08-14 session loss (orphaned `fr dispatch` records committed, three
lanes re-dispatched fresh), ran the full w1s4 cycle in ../rk-campaign-D — three
claude-opus-5 lanes (roster amended from opus-4-8, TJO 2026-08-15; PRD/CLAUDE/workers all
in step), one hostile codex gpt-5.6-sol xhigh review (review E: 1 BLOCKER + 6 MAJOR,
4 rulings), ONE repair wave, mechanically verified, campaign session landed at cycle 4/10.
Campaign headlines: NO cited shard (the first attempt was ruled aggregation and demoted);
mutation gate stays PARTIAL with the typed-presentation-coordinate replacement approved-
but-unscored (campaign bead -8uv, P1, opens next session); elegance FAIL re-recorded;
op-normalization ruled UNDERDETERMINED (not closed off) after repair narrowed lane N's
overclaim. Registry 40 shards + 9 defs, nothing above stated, rk check green throughout.

rk-side this session: Makefile `refresh-bundles` fixed (was naming four removed siblings,
omitted the live rk-campaign-D); campaign-D bundle refreshed and committed; two stale
merged agent worktrees pruned. No rk source changes; binaries current (dist/rk and
~/.local/bin/rk from the 2026-08-15 enablement wave, corpus 176/176 still the baseline).

## New rk beads this session (campaign escalations, all filed with measurements)

- **rk-pxkk (P2, bug)**: Gate 3 shard-citation checks scan argument/ only — a kind:cited
  DEFINITION's quotation is gated by nothing (measured: 9 correct pairs in a defs shard,
  count unchanged). Fix: extend checks 8-9 to definitions/**/*.md, red fixture first (L2).
- **rk-ahe9 (P2, bug)**: probe-channel ledger needs a monotonic sequence number — host
  clock moved backward 2h48m mid-session, campaign ledger now non-monotone in ts (hash
  binding intact; template change + compat fixture).
- **rk-pmyz (P3)**: rk refs quote returns only the first occurrence of a pattern.
- **rk-rz6c (P3)**: rk refs quote rewrites refs/manifest/sources.lock.json unserialised —
  concurrent lanes can race on the lock (observed shape, no corruption).

## Current work

- **rk-qqee (in_progress)**: observer/tooling-health watch while campaign D runs. Campaign
  next session opens on -8uv (typed presentation coordinate); watch for new escalation
  beads, keep the binary current, refresh-bundles at every rk close if the sibling moved.
- Campaign D governance held this session: anti-Zeno (one review + one repair, repairs
  verified mechanically against file:line claims, no re-review); reviewer confirmed right
  7/7 on verified findings. §4a scar recorded twice (no pre-registered predictions for the
  two attempted obligations) — campaign HANDOFF now instructs pre-registration before any
  new-obligation dispatch.

## Next steps

1. **TJO decision queue below** — unchanged from 2026-08-12; wave 3 and the escrow
   implementation still block on it.
2. Observer duties (rk-qqee) while campaign D continues under the Fable orchestrator.
3. rk-pxkk / rk-ahe9 are the natural next rk work items (P2, both campaign-blocking in
   consolidation phase; neither blocks exploration today).
4. rk-0s3u (P3 — extract at add/adopt time per PRD C7) remains open, unblocking no one.
5. **Wave 3 — worker contract / unattended operation** (rk-4w2y, rk-p037, rk-j8xo,
   rk-7the needs ratification), then wave 4 (rk-5man), wave 5 (rk-czzc/rk-g7fc +
   Tier C batch). rk-mief and rk-afyf still gate campaign C window 2 if unattended.

## TJO decision queue (blocking, carried from 2026-08-12)

1. rk-cz1h memo §6.1 — four questions, chief: do no-number-change appends need a §7
   re-registration point; does the roster waiver make a probe seat cheap single-vendor?
2. rk-7the — ratify no-pattern-kill (template clause stamped "pending ratification").
3. rk-23pr — ratify remaining autonomy plan items.
4. rk-mief — campaign C: attest backfill vs waiver for the 6 window-1 closes.
5. Roster policy: window-5 same-family waiver — standing or per-campaign?
6. Campaign codas (decaying): rk-2h33, rk-iup9, rk-mxl3.

## Key facts for the next session

- **Corpus counts are 176** in all three places (test/corpus.test.ts title+assertion,
  EXPECTED_FIXTURE_COUNT, corpus/README.md Totals). Keep them in step.
- Campaign-D model roster: orchestrator Fable (sole seat); provers claude-opus-5;
  reviews codex gpt-5.6-sol xhigh. Recorded in campaign PRD row 3 + CLAUDE.md §4 +
  .rk/config.json workers.
- Campaign-D review records: docs/worker-output/w1s4-review-E.md (verbatim) + repair
  records R1/R2; orchestration pattern that worked is written in the campaign HANDOFF
  (disjoint write-ownership, out-of-ownership edits as exact text, tree still during
  review, findings verbatim to repair lanes, mechanical verification).
- `make refresh-bundles` now bundles ONLY ../rk-campaign-D (live); wound-down siblings'
  last snapshots stay committed in vendor/ (restore-siblings recreates them).
- Codex review invocation for prompt-style reviews (named questions):
  `codex exec -s read-only -c model_reasoning_effort="xhigh" -o <scratch> "<prompt>"`;
  `-o` to SCRATCH, then copy verbatim into docs/worker-output/ (campaign §4d rule).
  Session id from ~/.codex/sessions/<date>/rollout-*.jsonl.
- Repo self-contained since fed740c (rk-he3r); full suite still needs `../vibefeld`
  cloned (2 seam tests, by design).
- Probe-channel exit codes (stamped 1.8.0): 2 validation (pre-ledger), 3 output exists,
  4 already ledgered, 5 busy (bundle untouched, retry safe), 6 poisoned; else the probe's
  own status, ledgered.

## Governance (standing)

- Anti-Zeno held: one review round + one repair wave; repairs verified mechanically.
- L1/L2 never relaxed; corpus 176/176 + selftest are the standing guard between reviews.
- D1-D8 + Amendment A1 stand. bd for all tracking. Campaign A wound down, B closed,
  C between windows 1 and 2, D mid-window-1 (w1s4 closed, w1s5 opens on -8uv; sole Fable
  seat orchestrating; opus-5 provers; codex xhigh reviews; observer = rk main session).
