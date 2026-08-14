<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-15, mid-session checkpoint — campaign-D enablement wave landed)

This session (Fable orchestrating; 2 Opus + 1 Sonnet implementer lanes; codex
gpt-5.6-sol xhigh for the Tier A review): the deferred validity pair plus the two
quote-side follow-ups are fixed, reviewed, repaired, and closed — **rk-r0j3** (Gate 3
adopted-pin rule was PDF-only; now binds ALL payload kinds, missing lock is a counted
ERROR), **rk-yic3** (a live or unknowable retraction now refuses proved-mod-audit
backing on BOTH Check 4b routes via a shared precondition, src/reward/pma-withdrawal.ts),
**rk-o85b** (rk refs quote refuses pin-violating payloads on BOTH the PDF and text
paths — shared checkAdoptedPin helper; no sidecar/lock writes for unadopted bytes),
**rk-k7ez** (stamped constitution documents the probe channel's exit codes 2-6 and
reservation rule). All green: 3011 tests / 0 fail, corpus **176/176**, selftest OK.
**dist/rk and ~/.local/bin/rk REBUILT and verified** (dist/rk errors on refs-21, exit 1).
Template still **1.8.0** (amended in place — unreleased until a campaign copies it;
probe-channel usage error now exits 2 pre-ledger, exit-5 prose corrected).

**L6 process held**: one codex xhigh review over the combined diff
(`docs/reviews/2026-08-15-r0j3-yic3-o85b-codex.md`, 1 P1 operational + 4 P2, zero
semantic landing-blockers), one repair wave, repairs verified mechanically against
file:line claims, NOT re-reviewed (anti-Zeno).

## Current work

**Campaign D recommencing** (TJO directive 2026-08-15: fix its blockers, then run it
under a Fable orchestrator with codex reviews until the north star is achieved).
All three campaign escalations (rk-campaign-D-8w4/-qe1/-r6e) are fixed rk-side and
LIVE-FIRE VERIFIED in the campaign repo: `rk check` green there, `rk refs quote`
extracts its compressed PDFs (rvw-zigzag sidecar written + chained). rk main session
is observer/tooling-health watch (bead rk-qqee, in_progress). Campaign w1s4 opens on:
close the three escalation beads, re-copy the hardened 1.8.0 probe channel, `rk reward
sync --round` (round 4), then the P1 queue (-eem gate approval, -2e3 elegance
re-ruling — both via the round's single hostile review).

## Next steps

1. **TJO decision queue below** — unchanged from 2026-08-12; wave 3 and the escrow
   implementation still block on it.
2. Observer duties while campaign D runs: watch for new escalation beads
   (rk-campaign-D-*, "rk defect" prefix), keep the binary current if rk-side fixes
   land, `make refresh-bundles` + commit vendor/ when the campaign sibling changes.
3. rk-0s3u (P3 — extract at add/adopt time per PRD C7) remains open, unblocking no one.
4. **Wave 3 — worker contract / unattended operation** (rk-4w2y, rk-p037, rk-j8xo,
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
- **Adopted-pin rule (Gate 3, ALL payload kinds)**: quote verification requires a
  parseable lock with exactly one matching entry, a raw-byte hash fact, and payload
  sha256 == entry.sha256 — for text exactly as for PDFs; missing lock is a counted
  ERROR ("is not hash-pinned"), never a raw-bytes fallback. PDFs additionally need the
  intact 4-field extraction chain. Fixtures refs-21/22 discriminate the rule;
  refs-02/03/07/09/11 gained locks so each keeps testing its own subject
  (divergence ledger: [rk-stricter-intended], docs/gate-contracts.md).
- **Withdrawal binds both backing routes (Check 4b)**: live retraction in either hash
  domain OR an unhealthy retraction ledger refuses backing before either route runs
  (reward-27/28). Remedy strings are domain-specific: af-canonical retractions cannot
  be released by edit+re-verify; resolve in .rk/retractions.jsonl.
- **Probe channel exit codes** (stamped 1.8.0 script): 2 validation (incl. missing
  args, pre-ledger), 3 output exists, 4 already ledgered, 5 channel busy (bundle
  untouched — same name safe to retry), 6 poisoned; else the probe's own status,
  ledgered.
- Repo self-contained since fed740c (rk-he3r); full suite still needs `../vibefeld`
  cloned (2 seam tests, by design). Campaign sibling ../rk-campaign-D WILL change
  during the campaign — refresh-bundles before rk session close.
- Codex review invocation that works for committed work:
  `codex exec review --base <sha> -c model_reasoning_effort="xhigh" -o <file>`
  (`--uncommitted` for diffs; neither accepts a prompt argument).
- Orchestration pattern that worked (again): implementer lanes on disjoint paths
  (worktree isolation for overlapping subsystems); lanes report shared-surface deltas
  (corpus counts, README totals) as exact text; orchestrator is single writer for
  those; tree stays still while a review runs; repair lanes get the review's
  file:line claims verbatim and the orchestrator verifies mechanically, never
  re-reviews.

## Governance (standing)

- Anti-Zeno held: one review round + one repair wave; repairs verified mechanically.
- L1/L2 never relaxed: red-first fixtures with mutation proofs on every validity
  change (refs-21/22, reward-27/28 this wave).
- D1-D8 + Amendment A1 stand. bd for all tracking. Campaign A wound down, B closed,
  C between windows 1 and 2, D recommencing at w1s4 under a Fable orchestrator
  (sole Fable seat; opus provers; codex xhigh reviews; observer = rk main session).
