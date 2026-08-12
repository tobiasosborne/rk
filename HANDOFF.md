<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-12, session close — wave 2 COMPLETE)

This session (Fable orchestrating; Opus implementer lanes for validity code, Sonnet
for template prose, codex gpt-5.6-sol xhigh for the Tier A review — per TJO directive
"opus or codex if the code is important"): the remaining wave-2 remediation items all
landed. rk-tlwb, rk-io5l, rk-xrgn, rk-6cmx, rk-oeal closed; rk-cz1h design delivered
(TJO-gated). All green at close: 2860 tests, corpus 166/166, selftest OK.
**dist/rk REBUILT** (deliberate, post-wave — `~/.local/bin/rk` now enforces the
hardened Check 4b everywhere it is hooked).

**What landed:**
- **rk-tlwb**: `schemas/provenance-record.v1.json` (v1 requires `claimSha256` from
  inception — version ruling recorded in the schema description), pure validator
  `src/reward/provenance-record.ts`, writer `rk reward attest` (`--author` required,
  never inferred — the tool cannot know who verified). Campaign-A: 12 unbacked closes
  WAIVED, not backfilled (`../rk-campaign-A/docs/2026-08-12-check4b-backing-waiver.md`)
  — 9 have no recoverable prover seam, 3 are same-model, and none can name the bytes
  reviewed. Verifier seams preserved in the waiver before transcripts rot.
- **rk-io5l**: campaign C's record-integrity oracle triaged (sound core, 4 unsound
  behaviors NOT ported); Check 4b(i) records now hash-bound: `claimSha256` must equal
  the shard's current raw bytes, stale ⇒ no backing (reward-22/23).
- **rk-xrgn** (found by Lane 1, confirmed P1 by review, fixed in repair wave): the
  banking site now reads `verdict` and `reason` — a REFUTED record no longer backs
  (reward-26 is the reviewer's exploit, verbatim).
- **rk-6cmx + rk-oeal**: template_version 1.7.0 stamps §4a predict/reward (S0), §4b
  probe protocol I.1-I.3, §4c briefs + hostile seat, §4d worker lifecycle — each with
  its campaign scar, test-enforced (test/templates). Campaign C constitution
  backfilled (`../rk-campaign-C` 5b76f00); AGENTS.md byte-identity drift fixed there.
- **rk-cz1h**: design memo `docs/memos/2026-08-12-escrow-onramp-design.md` —
  deferred-review on-ramp (probe record opens escrow, releases nothing; conditional-
  step review moves post-children-close). Key result: under current H_pred bounds,
  every k≥4 decomposition pays exactly ZERO for any prediction assignment; campaign
  A's only V>0 shapes were k=1 (the laundering shape). No prereg number changed;
  appends are TJO-gated (memo §6.1). Implementation beads wait on the ruling.

**L6 process held**: one codex gpt-5.6-sol xhigh review over the whole wave diff
(`docs/reviews/2026-08-12-waveA-tlwb-io5l-codex.md`), one repair wave (4/4 findings:
attest declare-before-hash ordering; verdict/reason enforcement; no schema bump —
evidence showed zero records of any prior shape exist anywhere; `--out` confined to
`.rk/provenance-<name>.json` namespace). Repairs verified mechanically against the
review's file:line claims; not re-reviewed (anti-Zeno).

**Round-0 chore finding (campaign C)**: `rk reward sync` withholds all 6 window-1
pma closes — NOT the anticipated spentTokens=0 gap (that is honest) but missing
provenance records (`rk reward attest` postdates the banking). Backfill is transcript
archaeology with a seam-fabrication hazard → bead **rk-mief** (P2). New closes in
window 2 are unaffected: the protocol is now stamped in the constitution.

## Next steps

1. **TJO decision queue below** — wave 3 and the escrow implementation both block on it.
2. **Campaign C window 2** is now unblocked on the frozen-environment rule (waves 1-2
   in). Remaining pre-launch choices: rk-mief (attest backfill or waiver for the 6),
   and whether window 2 waits for wave 3 (it must, if unattended — rk-afyf).
3. **MBGP campaign bootstrap** (TJO 2026-08-12 intent, this session): rk is now
   usable for an ATTENDED many-body-graph-products campaign — template 1.7.0 stamps
   the full proven protocol, reward economics produce true numbers, provenance is
   producible. Bead **rk-t69x** (P1) holds the bootstrap plan sketch (seed goal graph from
   phase-8 frontier; re-admit ~22 PROVED_PROJECT results as proved-mod-audit with
   attest records; `rk refs add` their sources; git init — it has no VCS at all).
4. **Wave 3 — worker contract / unattended operation**: rk-4w2y, rk-p037, rk-j8xo,
   rk-7the (needs ratification). Then wave 4 (rk-5man boundary-probe worker), wave 5
   (audit lenses rk-czzc/rk-g7fc + Tier C batch).
5. Smaller follow-ups this wave filed: rk-yic3 (P1, Tier A — live retraction does not
   stop the provenance backing route; next milestone review), rk-4rrq (stale installed
   rk green-lights old gates — partially mitigated by this session's rebuild),
   rk-ao9k, rk-v266, rk-fddu, rk-yast, rk-168x.

## TJO decision queue (blocking)

1. rk-cz1h memo §6.1 — four questions, chief: do no-number-change appends need a §7
   re-registration point; does the roster waiver make a probe seat cheap single-vendor?
2. rk-7the — ratify no-pattern-kill (template clause stamped "pending ratification").
3. rk-23pr — ratify remaining autonomy plan items.
4. rk-mief — campaign C: attest backfill vs waiver for the 6 window-1 closes.
5. Roster policy: window-5 same-family waiver — standing or per-campaign?
6. Campaign codas (decaying): rk-2h33, rk-iup9, rk-mxl3.

## Key facts for the next session

- dist/rk is CURRENT as of cea76bc+410317a. Campaign-A's pre-commit will now FAIL
  rk check (12 waived-in-prose errors are live findings to the new binary) — that
  campaign is wound down; use the waiver doc if a commit is ever needed there.
- `rk reward attest` REFUSES until the shard's `provenance:` declaration exists (the
  declaration is part of the bytes bound). `--out` only accepts
  `.rk/provenance-<name>.json`. The consumer still reads any declared `.rk/*.json`.
- Backing records must carry `verdict: "VALID"` + non-blank `reason` + current
  `claimSha256`; REFUTED/stale/missing ⇒ withheld, fail-closed.
- Corpus counts: test/corpus.test.ts title+assertion, EXPECTED_FIXTURE_COUNT, and
  corpus/README.md totals — all say 166. Keep the three in step.
- Codex review invocation that works for committed work:
  `codex exec review --base <branch> -c model_reasoning_effort="xhigh" -o <file>`
  (and `--uncommitted` for diffs; neither accepts a prompt argument).
- Orchestration pattern that worked: 2 lanes max, path-scoped commits, lanes report
  shared-file deltas as exact text, orchestrator is single writer for the contract
  surface; design lanes write to scratchpad while a review runs (tree stays still).

## Governance (standing)

- Anti-Zeno held: one review round + one repair wave; repairs verified mechanically.
- L1/L2 never relaxed: reviewer exploits became red fixtures (reward-26) before fixes;
  mutation proofs on every repair.
- D1-D8 + Amendment A1 stand. bd for all tracking. Campaign A wound down, B closed,
  C between windows 1 and 2; frozen-environment rule satisfied for window 2.
