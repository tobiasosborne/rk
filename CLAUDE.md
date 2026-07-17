<!-- ROLE: how we work in this repo. AGENTS.md is a byte-identical copy: edit both
     together (cp -f CLAUDE.md AGENTS.md); never let them drift.
     UPDATE POLICY: amend only on a felt failure or a TJO directive, with a dated note.
     TRIGGER: read at session start and after any context compaction. -->

# CLAUDE.md — rk

rk is a general-purpose research-automation tool (TS/Bun CLI): the extraction of the
workflow machinery evolved across the sister research repos, per the settled design in
`../research-workflows/`. This file is HOW we work. It is deliberately short; when it
conflicts with a fast path, this file wins.

## 0. Read order (gate)

1. This file.
2. `../research-workflows/PRD.md` — WHAT. The decision record **D1–D8 is settled**.
3. `../research-workflows/IMPLEMENTATION_PLAN.md` — sequencing, WPs, acceptance bars.
4. `HANDOFF.md` — current state, current WP, next steps.

Not read these? STOP and read them. Do not improvise from memory of them.

## 1. Laws (non-negotiable)

- **L1 — Red-green TDD, always.** Failing test first; watch it fail; make it pass; then
  perturb the implementation and confirm the test goes RED again; restore. "Runs without
  errors" is never a passing test — every test asserts a contract from
  `docs/gate-contracts.md`, a schema, or the PRD.
- **L2 — Red corpus first.** Any gate or check guarding a failure mode ships with a
  corpus fixture reproducing that failure mode, drawn from a real incident where one
  exists (`corpus/README.md` is the ledger). A gate with no red fixture does not exist.
  Gates report coverage ("checked N/N"); a silent skip is a bug, full stop.
- **L3 — Pure core, thin edges.** `src/gates`, `src/graph`, and render cores are pure:
  no fs/clock/env/network, no `Date.now()`. All IO at the edges (`store`, `drive`,
  `refs`, `cli`). Enforced by grep in selftest, fr-style.
- **L4 — Zero runtime deps.** `package.json` `dependencies` stays `{}`. Build-time
  vendoring only where the plan names it (dagre, in M2.4).
- **L5 — Prior art is evidence, not canon** (amended 2026-07-17, TJO directive; the
  original "parity before improvement" wording wrongly treated AISM as a golden
  master). AISM and the sister repos kind-of-work and have known problems: their
  incident histories are load-bearing data; their script behavior is NOT the spec.
  `docs/gate-contracts.md` is normative. When porting, characterize the prior
  implementation (cite `script:line` as provenance), record every behavioral
  divergence in a triage ledger — {rk-stricter-intended | rk-bug | ambiguous →
  escalate} — and default to the stricter validity semantics. Zero rk-bug divergences
  is the bar; deliberately matching a known-wrong behavior is itself a bug.
- **L6 — Validity semantics outrank everything.** Any change touching a validity check
  (gate logic, provenance, status propagation, verdict staleness, truthful rendering)
  gets a Fable-tier review before it lands. Cost and speed never outrank the barrier.

## 2. Rules

1. **D1–D8 are settled.** No monorepo, no Lean, no remote CI, no global DB, af stays Go,
   per-repo ground truth, multi-backend workers. Do not relitigate in code or docs.
2. **Cross-repo work goes to the owning repo** (V-items → `../vibefeld`, F-items →
   `../knowledge-frontier`) under that repo's own CLAUDE.md. Never patch around a
   missing cross-repo feature with a local hack — do the item or file it.
3. **AISM is a live research campaign.** `../almost-idempotent-stochastic-maps` is
   read-only except where a plan WP explicitly touches it (M0.5 staged cutover:
   parallel-run ≥3 sessions before deleting anything).
4. **~200-line source shards**, hard cap 280. One module, one job, one test file.
5. **No remote CI.** `bun test` + `bun run selftest` locally; pre-commit hook once gates
   exist. Failure-email noise is worse than zero signal (standing user directive).
6. **No emoji, no marketing prose.** Docs read like SQLite docs. Concrete numbers.
7. **Docs move with content.** A change that leaves `docs/gate-contracts.md`, a schema,
   `corpus/README.md`, or `HANDOFF.md` stale is incomplete work, not a follow-up.
8. **Cross-session state → bd** (prefix `rk-`), never markdown TODOs. Persistent
   insight → `bd remember` or HANDOFF, per kind.
9. **Generated vs authored, never mixed.** `build/` outputs are never hand-edited;
   every doc carries a ROLE/UPDATE-POLICY/TRIGGER header stating which it is.
10. **Schema changes are compat events.** Anything under `schemas/` or in
    `rk.compat.json` bumps a version field and gets a fixture. bd's `issues.jsonl`
    shape counts as compat surface too.
11. **Estimates are tripwires.** A WP ballooning past ~2× its plan size is a signal the
    WP is mis-scoped: stop, split, update the plan — do not grind.
12. **Commit discipline.** Atomic commits, one WP-step each; message states what gate/
    test proves it; end with the acting model's `Co-Authored-By:` line. Work is not
    done until committed.

## 3. Model policy (user directive, 2026-07-17; cadence amended same day)

- **Implementers: Sonnet.** Generic WP implementation, ports, tests, fixtures.
- **Summarisation and code queries: Sonnet.**
- **Reviews: Fable, serial — frequency scales with blast radius**, not with commit
  count. A bug's reach decides the cadence:
  - **Tier A — review before landing**: validity semantics (gate pass/fail rules,
    status propagation, provenance/staleness rules, truthful rendering), contract
    documents, versioned schemas, and shared contracts other components consume
    (types.ts interfaces). This is L6; no exceptions.
  - **Tier B — batched review at milestone boundaries**: substantial implementation
    that is already constrained by corpus/tests (gate implementations, drivers,
    projection joins). The corpus catches behavior; Fable reviews design and logic
    once per milestone, not per WP.
  - **Tier C — no dedicated review**: fixtures (script-validated), CLI plumbing,
    scaffolding, test code, docs formatting, bookkeeping. Caught incidentally at
    milestone reviews; a bug here is cheap and local.
  When in doubt, ask what a bug would corrupt: a wrong verdict or schema = A; a wrong
  behavior a test would catch = B; an inconvenience = C.
- Reviewer never implements the fix in the same session; findings go back to an
  implementer.
- Orchestrator dispatches and bookkeeps; it does not judge proof-of-correctness for
  Tier A changes itself — that is the reviewer's job (reviewer ≠ author, applied to us).

## 4. Build & test

```
bun test                 # unit + property tests
bun run selftest         # red corpus + purity grep + compat checks
bun build --compile src/cli.ts --outfile dist/rk
```

All three green before any commit that claims a WP step. Live-fire acceptance (on AISM
or a dogfood repo) is part of each milestone's definition of done — fixtures alone never
close a WP.

## 5. Architecture (fixed by the plan; details there)

```
src/types.ts    shared contracts          src/gates/    PURE gate logic
src/graph/      PURE projection/joins     src/render/   html generation
src/drive/      workers, batch, verdicts  src/refs/     fetch/hash/quote
src/scaffold/   init/upgrade templates    corpus/       red fixtures
schemas/        versioned JSON schemas    docs/         gate contracts, memos
```

Join keys are per-edge (PRD C5 table) — there is no universal join key; do not invent
one. The critical-path query (M2.5) is load-bearing for batch exclusion (M3.4).

## 6. Session close ("landing the plane")

1. `bun test` + `bun run selftest` green.
2. `HANDOFF.md` rewritten (not appended, ≤150 lines): state, current WP, next steps.
3. bd issues updated/closed; new work filed, not TODO'd.
4. Atomic commits done. Push if a remote is configured. Never "ready to push when you
   are" — if there is a remote, you push.

## 7. Stop conditions (escalate to TJO, do not improvise)

- A PRD/plan conflict or gap discovered mid-WP → surface it in HANDOFF + a note in
  `../research-workflows/`, pick nothing silently.
- Tempted to add a runtime dependency, a server, a daemon, or remote automation.
- An L6 validity semantic would change without a Fable review available.
- A cross-repo item (V/F) turns out bigger than its plan size — re-plan, don't absorb
  it here.
- Anything in the sister repos would need modifying beyond the named V/F items.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
