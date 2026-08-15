<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-15, session close — campaign-D w1s4 AND w1s5 cycles run this session)

One long Fable session (dual role: rk observer + campaign-D orchestrator, TJO directive)
ran TWO full campaign cycles in ../rk-campaign-D and closed on a TJO stop directive:

- **w1s4**: recovery of the 2026-08-14 session loss; three opus-5 lanes (roster amended
  opus-4-8 → claude-opus-5, in PRD/CLAUDE/workers); review E (1 BLOCKER + 6 MAJOR,
  4 rulings incl. -eem: only the typed-presentation-coordinate replacement gate approved);
  one repair wave, mechanically verified. First `cited` attempt demoted (aggregation);
  op-normalization ruled UNDERDETERMINED.
- **w1s5**: three opus-5 lanes — typed presentation coordinate BUILT (bead -8uv), +57
  byte anchors (refs gate 157/157), full-corpus tolerance sweep (0 flips ever, 229+
  sites); review F (3 BLOCKER + 6 MAJOR; gate GRADED PARTIAL — DOES NOT PASS; elegance
  FAIL stands; the two escapes are TJO decisions); repair R2 complete, repair R1 CUT
  MID-FLIGHT by the stop — campaign bead **rk-campaign-D-2gd (P1)** resumes it (same
  anti-Zeno wave, no re-review).
- **Independent neutral assessment** (fresh opus, read-only) delivered to TJO: machinery
  works ("no surviving overclaim found"; captures independently re-verified), mathematics
  correct-but-modest, "last two sessions bought trustworthiness rather than distance";
  its w1s6 programme was subsequently RATIFIED (see Next steps item 1).

Campaign registry at close: 40 argument shards + 10 defs, nothing above `stated`, 19
ledgered bundles, reward ledger 17 events (round 5), rk check green, campaign cycle 5/10.
Campaign HANDOFF/worklog/FINDINGS/CONVENTIONS all rewritten at close; the campaign's own
HANDOFF records the TJO decision queue as RATIFIED (PRD decisions 6-9; w1s6 wave beaded).

rk-side this session: Makefile `refresh-bundles` fixed (bundles only the live
../rk-campaign-D; wound-down siblings' snapshots stay committed); campaign-D bundle
refreshed TWICE and committed (last at campaign commit 3831dcc); two stale merged agent
worktrees pruned. No rk source changes; binaries current (corpus 176/176 baseline).
Two `bd remember` entries landed (orchestration recovery pattern; probe/citation honesty
rules).

## New rk beads this session (campaign escalations, filed with measurements)

- **rk-pxkk (P2, bug)**: Gate 3 shard-citation checks scan argument/ only — a kind:cited
  DEFINITION's quotation is gated by nothing (measured). Extend checks 8-9 to
  definitions/**/*.md, red fixture first (L2).
- **rk-ahe9 (P2, bug)**: probe-channel ledger needs a monotonic sequence number — host
  clock moved BACKWARD twice (2h48m, then again in w1s5); campaign ledgers are
  non-monotone in ts. Order by append position only; fix in the stamped template.
- **rk-pmyz (P3)**: rk refs quote returns only the first occurrence of a pattern.
- **rk-rz6c (P3)**: rk refs quote rewrites sources.lock.json unserialised (racy shape).
- **rk-xmo0 (P3)**: Gate 3 citation-mismatch finding should name the first differing
  byte offset (dominant failure mode is one invisible byte; extractions can carry raw
  0x01 control bytes).

## Current work

- **rk-qqee (in_progress)**: observer/tooling-health watch while campaign D runs.
  Campaign next session opens on rk-campaign-D-2gd (resume the cut repair wave), then
  the ratified w1s6 wave: -5x2 (gate restatement), -2av (factorization-aware E),
  -nfm (input bridge), -xg3 (locality no-go).
- Governance held both cycles: anti-Zeno (one review + one repair wave; the w1s5 cut
  wave RESUMES rather than re-reviews); reviewer verified right on every disputed
  finding across E and F; disjoint lane write-ownership + orchestrator-sole-writer
  pattern held through four transient network/API drops (SendMessage resume-in-place
  recovered every one; see bd memories).

## Next steps

1. **TJO decisions RATIFIED 2026-08-15** (blanket, in-session): all four campaign-D
   decisions recorded as campaign PRD rows 6-9 (gate deletion-half retired/ill-posed;
   factorization-aware E adopted; assessor w1s6 programme + stop-list; §4a prediction
   unit) with the w1s6 wave beaded (-5x2, -2av, -xg3); rk-7the (no-pattern-kill)
   RATIFIED and closed — templates/CLAUDE.md.tmpl §4d updated in place. Still open for
   TJO: rk-cz1h §6.1, rk-23pr, rk-mief, roster window-5 waiver, codas.
2. Observer duties (rk-qqee) while campaign D continues.
3. rk-pxkk / rk-ahe9 are the natural next rk work items (P2; both become campaign
   ERRORs at consolidation).
4. rk-0s3u (P3) remains open, unblocking no one.
5. **Wave 3 — worker contract / unattended operation** (rk-4w2y, rk-p037, rk-j8xo;
   rk-7the ratified and closed), then wave 4 (rk-5man), wave 5 (rk-czzc/rk-g7fc +
   Tier C batch). rk-mief and rk-afyf still gate campaign C window 2 if unattended.

## TJO decision queue (rk-side, carried from 2026-08-12)

1. rk-cz1h memo §6.1 — four questions, chief: do no-number-change appends need a §7
   re-registration point; does the roster waiver make a probe seat cheap single-vendor?
2. ~~rk-7the~~ — RATIFIED 2026-08-15, closed (template §4d updated in place).
3. rk-23pr — ratify remaining autonomy plan items.
4. rk-mief — campaign C: attest backfill vs waiver for the 6 window-1 closes.
5. Roster policy: window-5 same-family waiver — standing or per-campaign?
6. Campaign codas (decaying): rk-2h33, rk-iup9, rk-mxl3.

## Key facts for the next session

- **Corpus counts are 176** in all three places (test/corpus.test.ts title+assertion,
  EXPECTED_FIXTURE_COUNT, corpus/README.md Totals). Keep them in step.
- Campaign-D roster: orchestrator Fable (sole seat); provers claude-opus-5; reviews
  codex gpt-5.6-sol xhigh. In campaign PRD row 3 + CLAUDE.md §4 + workers config.
- Review records: campaign docs/worker-output/w1s4-review-E.md and w1s5-review-F.md
  (verbatim, immutable) + repair records. A late R1 report
  (w1s5-repair-R1-extended-type.md) may exist untracked in the campaign repo — the
  wind-down directive told the lane to write it after this close; bead -2gd says it is
  authoritative for the done/partial/not-started split if present. Commit it with -2gd.
- Codex prompt-review invocation: `codex exec -s read-only
  -c model_reasoning_effort="xhigh" -o <scratch> "<prompt>"`; -o to SCRATCH, copy
  verbatim to docs/worker-output/. Session id from ~/.codex/sessions/<date>/rollout-*.
- `make refresh-bundles` bundles only ../rk-campaign-D (live); restore-siblings
  recreates wound-down siblings from committed bundles.
- Campaign probe-channel exit codes (1.8.0): 2 validation, 3 output exists, 4 already
  ledgered, 5 busy (retry safe), 6 poisoned. Ledger ts is NON-MONOTONE (clock skew);
  order by append position (rk-ahe9).
- Repo self-contained since fed740c; full suite still needs `../vibefeld` (2 seam
  tests, by design).

## Governance (standing)

- Anti-Zeno held both cycles; repairs verified mechanically, never re-reviewed.
- L1/L2 never relaxed; corpus 176/176 + selftest are the standing guard between reviews.
- D1-D8 + Amendment A1 stand. bd for all tracking. Campaign A wound down, B closed,
  C between windows 1 and 2, D mid-window-1 (w1s5 closed at cycle 5/10; w1s6 opens on
  -2gd then the TJO decision queue; sole Fable seat; opus-5 provers; codex xhigh
  reviews; observer = rk main session).
