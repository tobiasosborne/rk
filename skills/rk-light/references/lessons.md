# Lessons — the incidents behind every rule

ROLE: evidence ledger. Each rule in SKILL.md points here. A rule with no incident does not
belong in the skill; when you are tempted to add ceremony, first write its incident here.
Sources are sister repos under `~/Projects/` (rk, almost-idempotent-stochastic-maps = AISM,
self-correcting-eta-upper-bound, quantum-conjectures, cft-anyons, arithmetic-quantum-mechanics).

## L1 — The η ≤ 1/3 retraction (2026-06-23): the light-project failure mode in full

`self-correcting-eta-upper-bound` was exactly an rk-light-sized project: one week, one paper
(arXiv:2605.10943), a provenanced 12-section report, stdlib gates, two model families. Its
headline `η ≤ 1/3` was tagged [T0] and described as "four-worker, two-family + two adversarial
NO-FLAW". It was wrong. The proof needed the construction to be volume-filling,
`L = Θ(n^{1/3})`; the paper proves only bounded density `n = O(L^3)` (`paper:307`) — the
opposite direction — and its explicit geometry indicates `n = Θ(L^2)`. The assumption had been
listed in HANDOFF as a "non-blocking follow-up". What caught it: a second-family pass that asked
"where in the source is each hypothesis?" and went to the bytes (STATE.md, docs/LEARNINGS.md).
Rules earned: R1 (byte-verbatim quotes), R2 (explicit `assumption` rows; effective status is the
weakest link; the banner prints "conditional on"), R3 (second family, REFUTE stance), the audit
lens "scope assumptions absent from sources", and the stance that the guard is the bytes, not
the number of workers who agreed.

## L2 — A matched quote can still launder a claim (rk-light's own first test, 2026-08-21)

The precedent provenance checker accepted a quote if any 30-character run matched. The first
red test of rk-light's gate changed one word ("converges" → "diverges") in an otherwise genuine
quote and the gate passed. Partial acceptance was removed: a V-quote matches in full or fails.
Rule: R1 is "contiguous, whole, whitespace-normalised"; the partial run is only a diagnostic.

## L3 — 19/19 externals silently skipped (AISM, 2026)

AISM's fabrication gate reported green while skipping every external it was supposed to check
(a path mismatch). Found by a user-mandated manual audit, not by the machinery. Rule: R10 —
every gate prints coverage ("quotes: checked N/N"); "checked 0/0" on a project with sources is
a finding, not a pass.

## L4 — 83% of pulls chased one relabeled mechanism (AISM operational audit, 2026-07-04)

With an exploration controller already running, 83% of wave pulls pursued a single mechanism
renamed A→D→G; "stalled" appeared in 0/106 cycles because every narrowing wave self-tagged
"progress"; 49% of cycles produced no pull. What worked afterwards: dead routes written down
with the wall named, a breaker that does not reset on rephrasing, forced per-turn visibility.
Rules: R4 (DEAD-ROUTES.md, read before dispatch), the k=2 stall rule in P3.

## L5 — Mandatory-everywhere ceremony killed cft-anyons v1

An exploratory programme was run with consolidation-weight process from day one (eager
definitions DB, gates on every motion, full provenance before any idea was tested). Output
stopped. v2 succeeded with lazy conventions (CONVENTIONS.md with a negative list) and gates only
at promotion. Rules: R7 (stakes dial; checks bind at promotion boundaries), R12 (conventions
fixed at first use), and the CUT list in SKILL.md.

## L6 — Sign/convention drift dominated the AQM mega-review

In `arithmetic-quantum-mechanics` the P0 findings of a hostile multi-agent review were
overwhelmingly sign and normalisation drift between sections written by different agents.
Rules: R12, the section-writer brief that pastes CONVENTIONS.md, the audit lens
"convention drift".

## L7 — "Review until zero findings" never terminates (rk, TJO directive 2026-07-18)

Three successive hostile reviews of one milestone each produced a full list; the third's
findings were of lower validity-weight than the work they delayed. Rule: R6 — one hostile
review + one repair wave per phase; residuals become open problems or the next phase's review.

## L8 — Phantom subagent claims (almost-idempotent-positive-maps, R3 entry)

A subagent reported a lemma proved; no proof existed on disk. Rules: worker briefs require
files on disk; the orchestrator integrates only what it can open; nothing is `proved` without
a review note file containing a VERDICT line (R3, check `review.*`).

## L9 — Two unbounded loops froze the machine (rk, 2026-07-25)

An un-timeout'd test run during a driver-loop mutation reached 34.5 GB; an ad-hoc script with
no teardown reached 61.5 GB; both drained RAM+swap and killed the sessions. Rule: R9 — every
build/test/fetch carries `timeout`; no detached processes; a lane kills what it starts.

## L10 — Re-orienting from the conversation after compaction (every sister repo)

Post-compaction sessions repeatedly acted on summarised state that no longer matched the
repo (a claim already retracted; a route already dead). Rule: R5 — STATE.md rewritten whole at
close, read first at start and after any compaction; the repo is the source of truth.

## L11 — Shared-file writers (rk lane incidents, 2026-07/08)

Parallel lanes that each "fixed" a shared ledger produced merge damage and lost rows; a
triage tool that partially parsed a ledger and wrote it back truncated 5000 rows (recovered
from git). Rules: R11 (orchestrator-only files; workers return files under `notes/`), and
check.py refuses to act on a table it could not fully parse (`claims.parse`, `prov.parse`
are ERRORs, not skips).
