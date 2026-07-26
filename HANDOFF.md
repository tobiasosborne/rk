<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-25, session close — generality wave: rk is usable by a stranger)

**Twelve parallel lanes landed, 18 commits.** The session's theme was TJO's directive:
make rk genuinely useful as a research + proof orchestrator for *any* academic, not a
tool shaped around this campaign. A read-only generality audit
(`docs/memos/2026-07-25-generality-audit.md`) stamped real scaffolds, ran the binary
against them, and traced where a mathematician cloning rk would first get stuck. The
answer was: **ten seconds** (`bun build` failed on an undocumented `bun install`), then
a permanent false STALE on a pristine scaffold, then every registry shard ERRORing in
consolidation phase. All three are fixed.

**Day-one blockers closed.** `git clone && make install` works (verified by cloning HEAD
into scratch and running it). Gate 4's anchor check is presence-conditional on the
`report/` ROOT — a campaign with no LaTeX report is a legitimate permanent state, and a
check whose only remedy is adopting a convention the tool refuses to stamp is coercion,
not validity. `rk check`'s freshness regeneration goes through `rk render`'s own
option-assembly path, so `renderSite` is called for the site artifact from exactly ONE
place and generator/verifier cannot silently disagree. Template 1.4.0 seeds
`argument/thm-north-star.md` from `rk init`'s own contract argument and binds
`northStarId` — so PRD C2's critical-path provenance guarantee has a real path from day
one instead of passing vacuously.

**GAP 11 solved without a live re-run.** The banked attempt-11 logs already carried the
answer: the claude-opus verifier omitted the required top-level `justification`.
Diagnosis corrected mid-fix — the *proximate* failure was extraction (exit 12), not
shape validation, so a repair gated on shape alone would not have fired. Landed: prompt
hardening plus ONE bounded schema-repair reprompt, structurally one-shot, no extra trust,
usage accounted. 17 mutation proofs. **Live confirmation is outstanding** (rk-k8dq).

**Validity inputs that were faked or fail-open are now real.** `isLoadBearing` was
hardcoded `true` (safe direction, never a false green, but it made PRD C9's
non-critical-path branch unreachable); it now resolves through `computeCriticalPath` with
af's crux flag as a stricter backstop, every indeterminate answer load-bearing. Verified
**zero behavior change for every campaign on disk**. `familyForBackend` no longer infers
family from a backend *name* (which mapped any unknown name to `claude`); it reads the
resolved instance's declared `modelFamily`, validated against the closed vocabulary,
failing closed before any spend. Batch eligibility is structural, not a caller promise —
five constraints against real graph/af state, determined-vs-indeterminate never
conflated, 24 mutation proofs; batching still OFF.

**Cross-repo version hygiene.** af's `const Version` had not moved in sixteen
behavior-changing commits — HANDOFF's "0.1.5" was recording a number that had stopped
tracking behavior. af re-cut **0.1.6** and stamped at build time; fr **0.2.1** with a
COMMIT line; `rk.compat.json` pinned to both, `rk doctor` verified ok on the real
binaries and blocking on a constructed unstamped one.

Gates at close: `bun test` **2182 pass / 1 skip / 0 fail** (142 files), `bun run
selftest` **OK** (corpus 125/125, purity 108/108, gates-dir 27/27).

## Next steps (in order)

1. **rk-k8dq (P1) — live-confirm the GAP 11 repair**: re-run mass-split B + starvation B
   from `_pristine/`. Confirm the repair fires at most once, the repaired verdict binds
   through the unchanged pipeline, repair tokens appear in the report's new repair line
   and the budget, and the prover is finally dispatched. Within the standing M3.5
   authorization (runbook §14, 1.5M/run).
2. **rk-i19 (P1) — prover dispatch has no bounded repair**: same exit-12 death mode,
   uncorrected. Blocker: the prover body has no validator producing `RawIssue[]` to echo
   back. Build the validator, then reuse `verdict-repair.ts`'s bounded path verbatim.
3. **M3 close**: (a) ONE batched Tier A codex review (gpt-5.6-sol, high) — scope is now
   the M3.5 loop's validity changes PLUS this session's: bounded schema repair, Gate 4
   presence-conditionality, Gate 7's single-assembly-path repair, structural batch
   eligibility, load-bearing membership resolution, family fail-closed; (b) M3.9 SC4
   comparison; (c) auto-prove.sh disposition in vibefeld (D6 stale-tooling trap);
   (d) acceptance report.
4. **Then M4** (fr upgrades + bandit experiment, pre-registration M4.0 first).

## Governance (standing, in bd memory)

- Reviews: codex gpt-5.6-sol HIGH; Fable only with explicit TJO permission.
- Anti-Zeno: ONE review round + ONE repair wave per milestone; mechanical verification;
  residuals → beads → next milestone's single review.
- Worker models: claude side opus/sonnet ONLY (never Fable); codex side gpt-5.6-sol.
- AISM: read-only crash-test corpus + incident seed ONLY (SC7 generality lens).

## Key facts for the next session

- **Parallel lanes work well** at this scale (12 concurrent, one shared tree) IF: file
  scopes are disjoint and stated exhaustively in the brief; shared files are
  orchestrator-single-writer with lanes reporting deltas; commits are always
  `git commit -m "..." -- <paths>`. Zero collisions this session.
- **Shared-writer files are FOUR, not three**: `corpus/README.md`,
  `src/corpus/discovery.ts`, `docs/gate-contracts.md`/`worker-contract.md`, and
  **`test/corpus.test.ts`** — which holds a SECOND hardcoded fixture total independent of
  `EXPECTED_FIXTURE_COUNT`. Bump both together.
- Corpus is **125** gate fixtures. Three non-gate fixture trees exist outside
  `GATE_DIRS` and outside that count: `corpus/graph/`, `corpus/render/`, and the new
  `corpus/drive/` (rk-b09 / rk-x573 track surfacing them in selftest).
- Template version is **1.4.0**; `rk upgrade`'s manifest now carries a per-version
  changelog printed ahead of the diff plan, because the two most important 1.4.0 changes
  are invisible to a file diff.
- af **0.1.6** (`vibefeld` e7d6da7, `scripts/build.sh`), fr **0.2.1** (`frontier`
  fe7e081), bd 1.0.0. `af version --json` now reports the real number.
- Live invocation shape unchanged: `dist/rk verify --af <id> --live
  --max-campaign-tokens 1500000` from a lemma dir in `../rk-m3.5-baseline`; models pinned
  per-assignment in `.rk/config.json`; NO `--model` flag. Rebuild `dist/rk` and reinstall
  af before any run.

## Standing cautions

- **Bound every process you spawn (CLAUDE.md rule 13, added 2026-07-26).** On 2026-07-25
  this repo's own test loop OOM-killed the WSL VM: an un-timeout'd `bun test`, run while
  a mutation wave was editing driver-loop exit conditions, reached **34.5 GB RSS** and
  took 62 GB of RAM plus 16 GB of swap with it. A second crash the same afternoon came
  from rk-explorer. An 8 GiB soft `RLIMIT_DATA` is now applied automatically to every
  tool-spawned shell via `BASH_ENV=scripts/agent-limits.sh`, but the guard only converts
  a VM-wide freeze into one dead process — it does not make the loop terminate. Keep
  `timeout` on `bun test`/`selftest`/ad-hoc scripts, and never detach (`(cmd &)`).
  Mutation waves are the specific risk: mutating a loop's exit condition is *designed* to
  produce a non-terminating program, and RED is then indistinguishable from a hang.
- Do NOT take a subagent's finding at face value: this session, one lane corrected the
  orchestrator's own GAP 11 root cause, another corrected the audit's af-0.1.5 figure,
  and a third found a fixture that hardcoded the wrong `modelFamily`. Verify P0 claims
  against source before filing them.
- Live runs write `.rk/parse-failures/` in workspaces — no rotation; clean when restoring
  pristine.
- Purity grep false-triggers on `node:` param names — rename, never touch the guard.
- `bd close` with multiple ids applies ONE `--reason` to all (fix notes after).
- Scratchpad is EPHEMERAL: bank into `docs/reviews/` and `../rk-m3.5-baseline`.
