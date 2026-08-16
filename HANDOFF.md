<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-16, session close — campaign-D w1s6 full cycle run this session)

One Fable session (dual role: rk observer + campaign-D orchestrator, TJO directive) ran the
COMPLETE w1s6 cycle in ../rk-campaign-D, TJO-requested settled-results report included:

- **-2gd closed** (the w1s5 cut-repair remainder): all six bookkeeping items done; the lane
  found four already-retracted wave-1 claims still standing in op-candidate-definition and two
  extra stale sites; R1's missing report reconstructed post-hoc.
- **Four-lane wave** (opus-5, disjoint write-ownership): mutation gate restated per campaign
  PRD decision 6 (certified limitation; nothing re-scored); factorization-aware E per decision
  7 (4/4 literal four-slot capture equalities at default factorizations, was 0/4); locality
  answered two-sided (orbit NON-DETERMINATION + matched-refresh bound k* <= min(d k*, n));
  frustration-free input bridge (universal bias bound, DL†DL via palindrome word,
  size-independent composite; obligation open on RESOURCES). Registry 40 -> 46 shards; refs
  157 -> 204 byte-verified anchors.
- **Review G** (codex gpt-5.6-sol xhigh, single hostile pass, verbatim record
  docs/worker-output/w1s6-review-G.md): LANDING BLOCKED, 6 MAJOR — all over-quantification/
  typing/wording overclaims; the measurements survived. Rulings: elegance FAIL stands but the
  factorization parameter CLEARED (0/4 ground deleted from the rationale); all three w1s6
  bundles MEASURED — GRADED PARTIAL; lane A faithful. NOTE: the review launch was externally
  killed twice; TJO approved the third launch, which completed.
- **One repair wave** (R-B/R-C/R-D, anti-Zeno, no re-review), mechanically verified by grep
  against the review's file:line claims. Fifth hostile cycle survived.
- **TJO deliverable**: ../rk-campaign-D/docs/report/settled-results.pdf — 64 pp, all 56
  shards written out in full (all 10 definitions complete, notation section, honest
  rigour-ladder statuses, numerics with provenance, PRD 1-9 + reviews A-G). Refreshed
  post-review; delivered to TJO twice (52-pp pre-wave version, 64-pp final).

Campaign registry at close: 46 argument shards + 10 defs, NOTHING above `stated`; 22 bundles
(19 ledger entries — the "19 bundles" wording in older HANDOFFs conflated directories with
ledger rows); refs 204/204; reward round 6; campaign cycle counter 6/10; rk check green at
every one of the 14 campaign commits. Campaign HANDOFF/worklog/FINDINGS rewritten at close.

rk-side this session: NO rk source changes; binaries current (corpus 176/176 baseline).
Vendor bundle refreshed at campaign commit cef815f. One bd remember landed
(environment-gotcha-w1s6-lane-d: python3 heredoc writes silently failed twice).

## New rk-relevant observations this session (no new rk beads needed beyond standing)

- rk-pxkk stays the top rk item: lane Q's definitions/ anchors remain gate-unenforced
  (measured again this session — the refs gate scans argument/ only).
- Campaign FINDINGS process entry worth porting to rk docs eventually: refs-gate quote
  corruption is WARN-only in exploration; the reliable signal is the COUNT line dropping
  (204/204 -> 203/204), not the 0-ERRORs verdict.
- Probe-channel exit codes behaved correctly under three concurrent lanes (exit-5 busy-retry
  observed working); rk-ahe9 (monotonic sequence number) still open — host clock skew
  reappeared this session (codex log timestamps jumped ~8h).

## Current work

- **rk-qqee (in_progress)**: observer/tooling-health watch while campaign D runs. Campaign
  next session opens on `rk reward sync --round` (round 7), then the P2 queue:
  -9rv (typed-mixer factorization bundle — the one measurement debt review G's repair
  created), -jvq (graveyard backfill), -4pp (first true cited shard), -7ge (bundle-name
  resolution), quotient-on-|b> probe.
- Governance held: anti-Zeno (one review + one repair wave); reviewer verified right again
  (six findings, all confirmed on inspection); disjoint write-ownership held across 8
  concurrent-lane dispatches. One process deviation logged honestly: worker concurrency
  briefly 5 against the campaign's cap of 4 (report lane overlapped the wave).

## Next steps

1. Campaign D session 7: the queue above (all beaded campaign-side).
2. rk-pxkk / rk-ahe9 remain the natural next rk work items (P2; both keep biting).
3. **Wave 3 — worker contract / unattended operation** (rk-4w2y, rk-p037, rk-j8xo), then
   wave 4 (rk-5man), wave 5 (rk-czzc/rk-g7fc + Tier C batch). rk-mief and rk-afyf still gate
   campaign C window 2 if unattended.
4. rk-0s3u (P3) remains open, unblocking no one.

## TJO decision queue (rk-side, carried)

1. rk-cz1h memo §6.1 — four questions, chief: do no-number-change appends need a §7
   re-registration point; does the roster waiver make a probe seat cheap single-vendor?
2. rk-23pr — ratify remaining autonomy plan items.
3. rk-mief — campaign C: attest backfill vs waiver for the 6 window-1 closes.
4. Roster policy: window-5 same-family waiver — standing or per-campaign?
5. Campaign codas (decaying): rk-2h33, rk-iup9, rk-mxl3.

## Key facts for the next session

- **Corpus counts are 176** in all three places (test/corpus.test.ts title+assertion,
  EXPECTED_FIXTURE_COUNT, corpus/README.md Totals). Keep them in step.
- Campaign-D roster: orchestrator Fable (sole seat); provers claude-opus-5; reviews codex
  gpt-5.6-sol xhigh. Campaign cycle counter at 6/10 — the mandatory audit fires at 10.
- Review records: campaign docs/worker-output/w1s6-review-G.md (verbatim, immutable; session
  id in its header) joins reviews A-F. Repair records are the three R-B/R-C/R-D commit
  messages plus the FINDINGS corrections (entries corrected in place carry the withdrawal
  text and the review pointer).
- Codex invocation that worked: `codex exec -s read-only -c model_reasoning_effort="xhigh"
  -o <scratch> "<prompt>"` < /dev/null, backgrounded with timeout 5400. Two earlier launches
  were externally killed (another workspace-write codex was live on the host); if that
  recurs, stop after one relaunch and escalate — do not loop.
- `make refresh-bundles` bundles only ../rk-campaign-D (live); restore-siblings recreates
  wound-down siblings from committed bundles.
- Campaign probe-channel exit codes (1.8.0): 2 validation, 3 output exists, 4 already
  ledgered, 5 busy (retry safe), 6 poisoned. Ledger ts NON-MONOTONE; order by append
  position (rk-ahe9).
- Repo self-contained since fed740c; full suite still needs `../vibefeld` (2 seam tests).

## Governance (standing)

- L1/L2 never relaxed; corpus 176/176 + selftest are the standing guard between reviews.
- D1-D8 + Amendment A1 stand. bd for all tracking. Campaign A wound down, B closed, C
  between windows 1 and 2, D mid-window-1 (w1s6 closed at cycle 6/10; w1s7 opens on the P2
  queue; sole Fable seat; opus-5 provers; codex xhigh reviews; observer = rk main session).
