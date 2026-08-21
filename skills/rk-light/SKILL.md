---
name: rk-light
description: Run a small, low-stakes theoretical-research campaign (light formalisation of a paper, or exploring a conjecture/idea) with subagents, saved Workflow fan-outs, /goal or /loop waves and a second model family, ending in a 10-30 page pdflatex report where every claim carries a machine-checked status and every external fact a byte-verified quote. Use for "light formalisation of arXiv:...", "explore this idea / conjecture", "small research campaign", "write up a report on paper X", "rk light". Not for a one-off calculation, and not for a campaign that needs the full rk machinery (af, fr, multi-week).
argument-hint: "[formalise|explore] [arxiv-id or one-line question]"
allowed-tools: Bash(make:*) Bash(python3 scripts/*) Bash(sh scripts/*) Bash(timeout:*) Bash(codex:*) Bash(git:*)
hooks:
  Stop:
    - hooks:
        - type: command
          command: "sh \"$HOME/.claude/skills/rk-light/scripts/stop-hook.sh\""
---

# rk-light

A protocol, six ledger files, one gate. The whole point: **maximum protection against a
confident, plausible, wrong claim per unit of ceremony.** Every rule is earned by an incident
(`references/lessons.md`); nothing is decoration. You are an expert; this file gives you the
rules and the recipes, not the mathematics.

The incident in one paragraph (lessons L1): a one-week, one-paper repo with two model families
and a provenanced report published `η ≤ 1/3` as a theorem, "four-worker confirmed". The proof
used a premise that was not in the paper. Nobody had written the premise down as an
assumption, so nobody checked the bytes. The ledger, the `assumption` row, the derived
`-conditional` status, the verifier's PREMISES diff and the REFUTE-stance second family exist
to prevent exactly that.

## 0. Stakes dial

`.rk-light.json: stakes` — `report` (default: full protocol; required for any `proved`) or
`note` (single session; sources + quotes + tags + build; nothing exceeds `sketched`; the banner
says so; STATE/DEAD-ROUTES/waves optional). A scratch calculation is neither: skip this skill.

## 1. Rules

R1 **Bytes, not memory.** Every external fact in the report has a PROVENANCE row whose
quote `make check` matches whole and contiguous (whitespace-normalised) inside the stated
line window of a local, hashed source. No partial credit. Else `[UNVERIFIED]` (red at
stakes=report). A quote proves what it says at that locus — not absence, not direction.
R2 **Status is typed and derived.** Rows assert `proved | sketched | numerical | conjectured
| open | refuted` (results), `assumed`, `cited`, `quoted | stipulated` (defs). The printed
status is DERIVED: a refuted/open/conjectured dependency → `unsupported`; an assumption
anywhere below → `-conditional` (banner names the ids; applies to numerical too); `numerical`
is a ceiling; a sketched dependency caps at `sketched`. Deps are `a; b` (both) and `a | b`
(either). Every theorem-like environment is a unit: one claim label of the matching kind,
one tag inside it equal to the derived status; a `cit:` environment reproduces its quote
verbatim (the source's words, never a paraphrase).
R3 **Reviewer ≠ author, hash-bound.** `proved` AND `refuted` need a review note with
`RECEIPT <id> <hash>` (from `make receipt ID=`; hashes statement + deps + proof/witness file +
the theorem text as printed in `report/` + CONVENTIONS + sources — so write the statement
into the report BEFORE requesting a receipt), `PREMISES <id>: ...` (diffed against deps: a
premise outside deps, or any `NEW:`, is red), `VERDICT <id>: VALID`. The proof file must
exist; `author` is `<family>:<model>`; the reviewer's family differs unless `single-family`
is declared (printed; same model is always red). Any later edit stales the receipt. Second
family = codex, read-only.
R4 **Dead routes are results.** DEAD-ROUTES.md append-only (git-checked), read before
every dispatch.
R5 **The repo is the truth.** STATE.md rewritten whole at every close; read first, and again
after any compaction.
R6 **One audit, one repair wave.** Residuals → open problems, not round two.
R7 **Checks bind at promotion, never at motion.** `notes/` is free. Nothing here without an
incident behind it.
R8 **Harness-enforced.** A Stop hook (skill-level for this session; project-level stamped
by init for every session) blocks a turn from ending on a red gate. Demote or fix; never
edit the gate.
R9 **Bounded.** `timeout` on every build, test, fetch and lane. No detached processes.
R10 **Coverage or it did not run.** `quotes: checked N/N`, `reviews: checked N/N`. `0/0`
with sources present is a finding. A ledger that parses partially is red.
R11 **Workers write only under `notes/`.** Everything else is orchestrator-only. Commit
before dispatch; `make guard` after harvest (runs the INSTALLED guard, so a worker cannot
edit it away) proves nothing outside `notes/` changed and the append-only ledgers grew only.
R12 **Conventions at first use**, with a negative list of unfixed choices; a worker needing
one stops. All scientific bugs are convention bugs until proved otherwise.

## 2. Layout (stamped by `scripts/init.sh`)

```
.rk-light.json   mode, stakes, main id, page target, budget, families
BRIEF.md  STATE.md  CONVENTIONS.md  CLAIMS.md  PROVENANCE.md  DEAD-ROUTES.md
sources/<key>/ + manifest.sha256      notes/{wave-NN,extract,reviews,audit}/
report/main.tex sections/ generated/status.tex refs.bib
scripts/ check.py build.sh fetch_arxiv.sh guard.sh stop-hook.sh tests/     .claude/workflows/rkl-*.js
Makefile: check regen build fetch guard receipt release status test
```
CLAIMS columns: `id | kind | status | deps | label | statement | proof | author | review | note`.

## 3. Protocol

**P0 Brief** (~10 min, with the user). Mode; the question as `thm-main`; checkable done
criteria; budget (waves, agents/wave, hours); sources; known hazards → BRIEF.md. Then
`sh ~/.claude/skills/rk-light/scripts/init.sh formalise|explore [report|note]`, edit
`.rk-light.json`, `git init` + commit.

**P1 Ground truth.** `make fetch ID=<arxiv-id>[vN] KEY=<key>` per source; paste the printed
Part-1 row. From here no id, theorem number, constant or quote is typed from memory.

**P2 Skeleton.** formalise: find the spine (main theorem, its proof, the lemmas it names);
`/rkl-extract` on those chunks only; write `cited`/`def`/`assumption` rows + PROVENANCE
rows; `make check` green with `quotes: checked N/N`, N>0. The paper's "clearly"/"we assume"
list is the gap list. explore: `thm-main` as `conjectured`; 2-4 routes ranked by what each
teaches if it dies; known no-gos → DEAD-ROUTES.

**P3 Waves.** Commit. One wave: (1) target = weakest load-bearing claim toward `main`, not
dead, not stalled (2 waves, no change → certificate or pivot); (2) `/rkl-attack` — one
angle by default, more only when disputed — or a counterexample hunter; (3) `make guard`;
harvest: rows to the judge's status, never higher; undeclared premises → `assumption` rows
(now conditional, visibly); walls → DEAD-ROUTES; (4) promotion: `make receipt ID=`, codex
REFUTE verifier (read-only, batch siblings), apply VALID only when the receipt matches;
(5) `make check` green — demote rather than leave red — STATE.md rewritten; commit.
A `refuted-candidate` from the judge is written as `open` with the witness path in `proof`
until the second family returns VALID on the witness; then `refuted`.
Unattended: `/goal` or `/loop` prompts in `references/autonomy.md`.

**P4 Write-up.** You draft `report/` yourself from the rows and notes (one voice); every
environment labelled and tagged with its derived status; `cit:` facts and `quoted` defs get
PROVENANCE rows; the summary names each conditional headline's assumptions; dead routes and
open problems are sections. `make regen && make check && make build`.

**P5 Audit.** `make state-hash` → `AUDIT-OF`. `/rkl-audit` (fails closed: a lens that did
not run or a finding the skeptic could not resolve is a blocker) or one codex xhigh pass with
the auditor brief. Write `notes/audit/<date>.md`: `AUDIT-OF <hash>`, `## Blockers` checklist,
`## Follow-ups`. ONE repair wave: demote first, then fix text; tick each blocker as `- [x] ...
-> fixed|demoted`; `make state-hash` again → `CLOSED-AT <hash>`; `make release` (fresh build +
check + audit recorded + CLOSED-AT == now + blockers closed → RELEASE.md). Any later edit
invalidates the release until CLOSED-AT is re-recorded. Follow-ups → Open problems + STATE.

**Every close.** `make check`; STATE.md rewritten whole in the banner's words; commit; push
if a remote exists.

## 4. What you do and do not do

You dispatch, integrate, bookkeep, and draft. What you write is `sketched` until someone
else has tried to break it; you never promote your own proofs, and you never overrule a
verifier by re-deriving in your own context (the author's blind spot becomes the reviewer's
— lessons L1). Disagree → a second verifier, not a ruling.

Under pressure to finish, the honest move is always available: demote, write the
assumption down, write the dead route. A banner printing `sketched-conditional` is a correct
report. A banner printing `proved` for a proof nobody tried to break is the incident.

## 5. Cut list (deliberately absent)

af hard tier, fr controller/bandit, bd (fine if the repo has it), sharded definitions DB, TS
gates, graph render, schemas/compat, divergence triage, milestone cadence, token accounting,
whole-paper pre-extraction, one-agent-per-section drafting, N-prover panels by default. If
the work starts needing these it is not light any more: stop and say so.

## 6. Pointers

`references/lessons.md` incidents · `references/briefs.md` worker briefs (PREAMBLE, prover,
verifier, extractor, absence note, hunter, auditor) · `references/workflows.md` the three
saved workflows · `references/codex.md` second family and receipts ·
`references/autonomy.md` /goal and /loop · `references/report.md` the artifact ·
`make test` the gate's 41 red/green cases.
