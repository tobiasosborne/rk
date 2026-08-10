<!-- ROLE: remediation plan synthesized from the campaign A/B/C analyst records.
     AUTHORED, append-only after commit. TRIGGER: written 2026-08-10 on TJO request
     ("investigate the analyst notes and frictions and work out a plan to remediate
     rk"); superseded item-by-item as beads close. -->

# Remediation plan — what three campaigns taught rk (2026-08-10)

Sources: `../rk-bench/paper-A/analyst-notes.md` (campaign A, 5 windows + campaign B,
the trial's master record), `docs/memos/2026-08-09-campaign-C-analyst-notes.md`
(campaign C window 1, first real research goal), `../rk-bench/paper-B/grading/
results.md`, RUN-REPORT-1..5, and the open bead ledger (97 open at time of writing).
Every finding below carries its bead; five beads were filed today to cover findings
the notes flagged "bead at close" but never got (rk-j8xo, rk-io5l, rk-oeal, rk-cz1h,
rk-ghi2); rk-90so was closed against its landed fix (Check 4b, f5b6b7c + fbe6e31).

## What the record actually says

Across 7 windows the validity machinery went 6-for-6 on refutations that mattered,
the firewall audited 0/0/0 every window, and nothing was over-banked. The frictions
cluster into five groups, ordered here by what a defect corrupts (the CLAUDE.md §3
test):

1. **Validity holes campaigns brushed against.** The cited rung is reachable but
   ungated 4 windows running (rk-uqxh); the Check 4b provenance route accepts the
   prover's own report — the campaign found the loophole and *declined to use it*
   (rk-ne3a); an overclaimed-but-banked close has no walk-back event (rk-4317); a
   3-window-old contract mismatch sat unread in `rk graph` output nobody is obliged
   to run (rk-45dj); a verifier brief fenced an unverified input from scrutiny
   (rk-fs8v). None caused a wrong bank — but each is one campaign-mistake away.
2. **Reward economics inverted or silent.** spentTokens=0 pays prunes ~1.3 and real
   pma closes 0.0 (rk-0ree); campaign C ran a full window with a reward ledger at
   zero because the template stamps no §G protocol (rk-6cmx) — and the template
   turns out to carry *none* of the campaign-proven protocol at all (rk-oeal);
   reduces=0 across all 6 windows of all 3 campaigns — escrow has never fired and
   the cause is entry cost, not agent reluctance (rk-cz1h, new).
3. **Unattended operation is not yet trustworthy.** Wake-on-completion measured
   ~1/3 lossy (2 misses/~6 in one window, both caught by the human noticing);
   turn-end killed live workers once; re-dispatch raced on shared output paths;
   codex `-o` clobbers worker reports; the user twice could not tell whether
   anything was running (rk-4w2y, rk-p037, rk-j8xo). This cluster is the direct
   blocker on the dark-factory north star (Amendment A1) — today the examiner IS
   the watchdog.
4. **The dominant math-defect class is mechanically catchable.** 3/5 window-3
   review defects were "bound never evaluated at the boundary of its own
   quantifiers"; the one probed review dropped refutations to 1/6 vs the stable
   3/5 baseline. The boundary-probe worker (N2.4, rk-5man) would pre-catch the
   dominant class cheaply — the campaigns also supplied its design spec for free
   (probe debt, margins, negative controls, run-don't-collect, immutable archives
   rk-70ok; notes appended to rk-5man today).
5. **Audit lenses now have real signatures to implement.** Honest-wall vs theater
   (obligations-up + satisfied-flat vs closes-without-frontier-contact); the
   over-correction/blanket-softening mode (rk-czzc); overclaimed *negatives* as a
   named species; the 11/11 hostile-critic datum for panel design (notes appended
   to rk-g7fc today).

Two meta-findings shape the ordering. First: the orchestrating layer — agent or
human — is the principal residual error source everywhere (steering wrong ~3/4,
examiner errors #1–#4 including the void campaign-B grading), so remediation should
prefer mechanical rails over orchestrator diligence. Second: hand-porting protocol
between campaigns already failed once (the §G miss); anything proven in a campaign
belongs in the template or in rk itself, never in per-campaign prose.

## The plan — five waves

**Wave 1 — validity batch (Tier A, one review round + one repair wave).**
rk-uqxh (Gate 3 byte-verifies argument-shard citation quotes per run), rk-ne3a
(provenance independence: record author ≠ claim prover), rk-4317 (reward demotion
event — design must keep the ledger append-only: a compensating event, not an
edit), rk-45dj (contractMatch surfaces in `rk check`), rk-fs8v (fence-claims
require a citable verdict record; verifiers confirm against the L5 store before
honoring). All five are L6 validity semantics: red corpus first, one batched codex
gpt-5.6-sol xhigh review over the whole wave per the anti-Zeno rule.

**Wave 2 — reward economics (blocks a measurable campaign C window 2).**
rk-0ree first (settle ONE attribution rule for the two driver-log conventions —
Tier A, it is payout math; then teach reward-sync); rk-6cmx + rk-oeal (template
gets §G *and* the full proven protocol: probes I.1–I.3, brief format, hostile
seat, worker lifecycle — each section citing its campaign scar); backfill campaign
C's constitution and run the round-0 `rk reward sync` chore; rk-io5l (examine the
campaign's convergently-invented record-integrity oracle, port if sound); rk-cz1h
(escrow on-ramp design — Tier A where it touches payouts).

**Wave 3 — worker contract / unattended operation (N2 prerequisite).**
rk-4w2y both halves (never kill on turn end; treat wake-on-completion as lossy —
poll-before-stop, harvest-all-on-wake, plus a watchdog-side sweep: newest worker
log mtime vs orchestrator transcript mtime, alert on inversion); rk-p037 (`-o` to
scratch, workers own their report paths, run-unique names); rk-j8xo (`rk status
--live` or stamped liveness.sh — procs by cwd, transcript mtime dereferenced);
rk-7the (no-pattern-kill into CLAUDE.md + template — needs TJO ratification).

**Wave 4 — boundary-probe worker before more campaign windows (N2.4 pull-forward
from rk-5man).** The one lever with measured defect-rate impact. Inherits the
appended design data verbatim; rk-70ok folds in. Acceptance: re-run against the
window-3/4 defect set — it must pre-catch the 3/5 boundary-class defects and the
L(eps)<0 corpus defect.

**Wave 5 — audit lenses + friction burn-down.** rk-czzc and the stuckness/theater
signatures into the N4.1 lens set (rk-g7fc); then the standing P2/P3 friction list
(rk-svwy bd-absent misreport, rk-ghi2 cycle authoring warning, rk-zva .gitignore,
doc-drift batch rk-sckg) batched at the next milestone boundary per Tier C rules.

Ordering rationale: wave 1 is the barrier itself; wave 2 makes the autonomy
economics produce true numbers before more data is collected under wrong ones;
wave 3 is what lets windows run without a human watchdog; wave 4 is the highest
measured-yield quality lever; wave 5 rides milestone cadence. Waves 1–2 should
land before campaign C window 2 launches (tooling changes only between windows);
waves 3–4 before any further zero-intervention or unattended window (rk-afyf).

## TJO decision queue (blocking items only)

1. rk-7the — ratify the no-pattern-kill CLAUDE.md amendment (text exists, live
   incident on record).
2. rk-23pr — ratify the autonomy plan items still marked pending.
3. Roster policy: the window-5 same-family waiver ("all codex, no frozen banking")
   — standing policy or per-campaign ruling? Affects wave-1 rk-ne3a design (what
   counts as an independent record) and campaign C's verification seats.
4. Campaign codas, cheap and decaying: rk-2h33 (drive Theorem G to `proved` via af
   — the only end-to-end test of the af-promotion path ever proposed), rk-iup9
   (campaign B 4-question regrade), rk-mxl3 (C_G contract repair ruling).

## Not planned, deliberately

- No new gates for defect classes with zero live incidents — the corpus + selftest
  remain the standing guard between reviews.
- No orchestrator-hardening beyond rails already listed: the record says thinner
  orchestration + stronger mechanical allocation (the N3 bandit) is the fix
  direction, and N3 stays sequenced behind N2 as planned.
- No relitigation of settled scoring/benchmark design (paper-B confound has a
  registered cheap repair; that is campaign work, not rk work).
