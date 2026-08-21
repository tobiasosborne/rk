<!-- ROLE: review record. UPDATE POLICY: append-only (review rounds + dispositions). TRIGGER: a
     codex review of skills/rk-light. -->

# rk-light — codex gpt-5.6-sol xhigh reviews, 2026-08-21

Subject: `skills/rk-light/` (the "rk light" Claude Code skill; symlinked from
`~/.claude/skills/rk-light`). Orchestrator: Fable (serial). Lanes: codex xhigh (reviews),
pi/stealth-ox-alpha (operator-readability pass). No opus/sonnet (TJO directive).

## Round 1 — design brief review

Input: the design brief (reproduced below). Output: 9 blockers, 9 cuts, 6 gaps, Q1-Q6, 10 follow-ups.

### Disposition (one repair wave, anti-Zeno)

| # | finding | disposition |
|---|---|---|
| B1 | status lattice conflates basis/scope/state; refuted dep should not refute dependents | TAKEN: rows assert own status; DERIVED `unsupported` / `<s>-conditional`; `rkl_status.py` |
| B2 | reviews not bound to what was reviewed; VALID-WITH-CORRECTION laundering | TAKEN: `RECEIPT <id> <sha256(statement,deps,proof,CONVENTIONS,manifest)>`, `PREMISES` diff vs deps, only exact `VALID` promotes; `review.stale`, `review.premise`, `review.new-premise` |
| B3 | 30-char quote fallback is an anti-gate | ALREADY CLOSED before the review (first red test caught it); plus locus window check `prov.locus-wrong` |
| B4 | self-selected coverage denominator | TAKEN: `tex.unlabelled-env`, `tex.orphan-label`, `tex.cite-unregistered`, `tex.cite-bib` |
| B5 | main-hypothesis check cannot catch the eta class | TAKEN (partially mechanical): verifier PREMISES line diffed against deps; absence-note brief; audit lens `scope-assumptions`. Identifying an implicit premise stays adversarial work, as the reviewer said |
| B6 | skill Stop hook is session-scoped; ignores stop_hook_active | TAKEN: init stamps `.claude/settings.json` project hook; hook honours `stop_hook_active`; blocks at most once per turn |
| B7 | orchestrator-only files prompt-enforced | TAKEN: `make guard` (git diff vs HEAD on orchestrator-only paths; append-only DEAD-ROUTES/CONVENTIONS); codex verifier `-s read-only` |
| B8 | explore mode lacks OR-support | TAKEN: deps `a; b \| c` (AND of OR-groups) |
| B9 | nothing enforces the final audit | TAKEN: `make release` requires `notes/audit/*.md` with `AUDIT-OF` + all `## Blockers` ticked; writes RELEASE.md |
| cuts | global pre-extraction; per-section extractors/writers; judge panels; per-row verifier calls; full machinery at note stakes; long SKILL body; push on close; k=2 in prose | TAKEN except "push if a remote exists" (one line; kept). Section writers demoted to "only over budget". k=2 moved to autonomy.md |
| gaps | blind premise extraction; absence certificate; entailment verdict; retraction propagation; definition laundering; false-green guards | TAKEN: PREMISES diff; absence-note brief; verifier brief checks meaning not just bytes; derived statuses propagate; def rows `quoted\|stipulated` (quoted needs a V row); one red test per check (29) |
| Q6 | saved workflows live in `.claude/workflows/`; `/goal` fits "until condition" | TAKEN: init stamps `rkl-extract/attack/audit.js`; `references/autonomy.md` covers `/goal` and `/loop` |
| follow-ups | full sha; version pinning; id validation; tar traversal; pdftotext caveat; V/I/O/OPEN; fatal parser warnings; `--quiet`; append-only via git; reviewer metadata from log; unlabelled envs | TAKEN: all except "full sha in Part 1" (>=16-hex prefix accepted; full digest in manifest) |

### Round 1 review text

## 1. BLOCKERS

1. **The status “lattice” produces false conclusions.** `assumed`, `numerical`, `cited`, and proof status are incomparable; `cited`/`def` are not even in the ordering. A refuted dependency invalidates a proof route—it does not refute the theorem. Fix: separate claim state, evidence basis, and scope; propagate `unsupported/conditional`, never `refuted`, through dependencies. `DESIGN-BRIEF.md:85-93`; `rk/docs/design/DISTILLATION.md:220-223`.

2. **Reviews are not bound to what they reviewed.** CLAIMS has no statement, proof path/hash, author, or `main` field, despite checking a “row flagged main.” Any file containing `VERDICT: VALID` can bless subsequently changed text; `VALID-WITH-CORRECTION` passes without proving correction. Add statement/proof/author/main fields and a receipt hashing claim, proof, deps, conventions, and source versions. Accept one exact terminal verdict; corrections must precede the hashed verdict. `DESIGN-BRIEF.md:70,85-91,167-169`.

3. **The 30-character quote fallback is an anti-gate.** A fabricated quote with one generic 30-character source fragment passes. The precedent explicitly implements that behavior. Require the entire whitespace-normalised quote within the declared locus; validate the locus. Remove fuzzy fallback. `DESIGN-BRIEF.md:161-162`; `self-correcting-eta-upper-bound/scripts/check_provenance.py:218-239`.

4. **“Checked N/N” has a self-selected denominator.** The checker sees ledger rows, not omitted report claims. Unlabelled theorem environments, prose claims, and citations without rows escape; notes are also outside the stated scan. Require every theorem-like environment to have a claim ID, generate its status from that ID, reject unregistered `\cite`s, and mark worker notes explicitly non-canonical. Narrow R1’s guarantee: prose completeness remains audit-controlled. `DESIGN-BRIEF.md:101-103,159-172`.

5. **The main-hypothesis check cannot catch the η failure.** It can verify only dependencies the author declared; no mechanical procedure can infer an omitted premise from the current row. The row also lacks a structured hypothesis field. Add an explicit hypothesis list plus a blind premise-extraction review that does not see CLAIMS, then diff the two lists before promotion. `DESIGN-BRIEF.md:168-169`; `self-correcting-eta-upper-bound/STATE.md:8-19`.

6. **The Stop hook does not provide persistent enforcement.** Skill hooks start only after invocation and last for that session, while this campaign is multi-session. It also runs a full gate every turn despite the “promotion-boundary only” rule; as described, it ignores `stop_hook_active` and can hit Claude Code’s eight-block override. Stamp a project hook, make it phase-aware, block once, and reserve full checks for `promote`/`release`. `DESIGN-BRIEF.md:40-41,57-60,190-193`; [Claude Code hooks reference](https://code.claude.com/docs/en/hooks).

7. **“Orchestrator-only” is prompt-enforced, contrary to R8.** Dynamic-workflow agents run with write capability; the proposed Codex reviewer even receives `workspace-write`. Use read-only workers returning structured results, with the orchestrator writing notes, or install a path-denial hook for subagents. Codex review should be read-only. `DESIGN-BRIEF.md:44,114-118,147-150`; `quantum-conjectures/CLAUDE.md:153-154`.

8. **Explore mode lacks OR-support semantics.** Flat `deps` are AND-only, so one dead route can wrongly downgrade a claim supported by another route. Add separate proof/route records: each route has AND-deps; the claim is supported if any route validates. No general graph engine is needed. `DESIGN-BRIEF.md:108-120`; `rk/docs/design/DISTILLATION.md:211`.

9. **Nothing enforces the final audit or closure of its blockers.** `check.py` has no audit receipt, report hash, or blocker-resolution ledger; P5 can therefore be skipped while the release remains green. Add `make release`: require a hash-bound audit, classify every finding, and either close each blocker mechanically or downgrade the affected claims. `DESIGN-BRIEF.md:127-132,157-176`; `rk/CLAUDE.md:131-145`.

## 2. CUTS

- **Global “all provenance green before any derivation” barrier — CUT.** Gate each external premise at first use or promotion; do not pre-extract an entire paper before learning what matters. `DESIGN-BRIEF.md:101-108`.
- **One extraction agent per paper section — CUT as default.** Use one extractor plus targeted fan-out only for sections exceeding context or carrying the main argument.
- **One drafting agent per report section — CUT.** It creates notation/status drift; the orchestrator should draft the short report from reviewed artifacts. `DESIGN-BRIEF.md:123-125`.
- **Three-to-six-route judge panel and generic N-prover pipeline — CUT.** Default to one author and one refute-biased verifier; parallelise only disputed load-bearing claims.
- **One verifier invocation per proved row — CUT; batch instead.** Review coherent batches, reserving second-family review for main/load-bearing claims. Batching is the measured economy precedent. `rk/docs/design/DISTILLATION.md:186-198`.
- **Full stamped campaign machinery at `note` stakes — CUT.** Keep sources, provenance, claim tags, build, and the honest banner; omit waves, workflows, STATE, and dead-route administration.
- **250–350-line SKILL body — DEMOTE-TO-REFERENCE.** Loaded skill text persists across turns; keep only gates and phase transitions inline. [Claude Code skills documentation](https://code.claude.com/docs/en/slash-commands).
- **Mandatory push on every session close — CUT.** It does not protect claim validity. Keep a local checkpoint before audit/release.
- **Exact k=2 stall breaker as prose — DEMOTE-TO-REFERENCE.** Without an append-only wave log it is neither enforceable nor resistant to relabelling.

## 3. GAPS

- **Undeclared premise:** run a blind “list every premise actually used” pass over each main proof, then mechanically diff against declared hypotheses. Any surplus becomes an `assumed` row or blocks promotion.
- **Claim that something is absent from a source:** add an absence certificate containing source hash, searched terms, sections/loci inspected, and an independent verdict. Absence cannot be established by a positive quote.
- **Matched quote misread:** at load-bearing citation promotion, require a citation verifier to read the claim and source context and return `ENTAILS | CONTRADICTS | INSUFFICIENT`. Hash-bind that verdict. The prior error was an inequality-direction misread despite genuine source text. `docs/LEARNINGS.md:52-66`.
- **Retraction propagation:** add reverse-dependency invalidation and render repeated claim statements/statuses from IDs. The incident repo still says both “retracted” and `η≤1/3 [T0-candidate]` in canonical files. `STATE.md:8-19,33-36,46-48`; `docs/LEARNINGS.md:8-10,102-107`.
- **Definition laundering:** `def` currently bypasses status/provenance, although the exact η definition was load-bearing. Every definition needs `source-quoted | stipulated`, with a V row for the former. `DESIGN-BRIEF.md:85-93`; `quantum-conjectures/CLAUDE.md:73-78`.
- **False-green guards:** require one red fixture per check, malformed/skipped rows to be errors, and a self-test proving each fixture is rejected. “Each has a test file” is insufficient given the documented guard failures. `rk/CLAUDE.md:29-32`; `rk/docs/design/DISTILLATION.md:140-145`.

## 4. Q1–Q6

### Q1

No. `assumed`, `numerical`, and `cited` are evidence/basis types, not points on one order. Numerical should ceiling only a derivation that logically depends on numerical evidence. A proved theorem under assumptions is `proved-conditional`, not `assumed`; a failed dependency invalidates the proof, not the theorem.

### Q2

One table is adequate for 10–40 claims; per-claim files are ceremony. The current table is inadequate: add one-line contract, basis/scope, proof artifact, author, route/support, and `main`. Parsing must fail on malformed rows, duplicates, unknown columns, or skipped content.

### Q3

Net positive only as a cheap, persistent, phase-aware structural gate. A skill-scoped full check is session-local and will fight partial exploration. Stamp a project hook, inspect `stop_hook_active`, block at most once, and use explicit promotion/release commands for expensive checks.

### Q4

Cut global pre-extraction, section-per-agent extraction/drafting, judge panels, per-claim verifier processes, full note-mode scaffolding, and automatic push. Batch related reviews. Keep provenance, explicit assumptions, generated statuses, dead-route walls, and one end audit.

### Q5

The checker cannot discover a premise omitted from both proof metadata and CLAIMS. Add blind premise extraction, an explicit hypothesis list, and absence certificates for “the source does not assume/prove X.” The mechanical part is the diff; identifying implicit premises remains adversarial work.

### Q6

Workflow and `/workflows` exist, but `/workflows` manages runs; saved scripts belong in `.claude/workflows/` or a plugin, not `references/workflows.md`. Workflows require v2.1.154+, may need enabling, accept no mid-run user input, and restart after session exit. `/loop` is timed recurrence; `/goal` better matches “continue until condition/budget.” Skill hooks last only the invocation session. [Workflows](https://code.claude.com/docs/en/workflows), [scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks), [goals](https://code.claude.com/docs/en/goal).

## 5. FOLLOW-UPS

- Store full SHA-256; truncating to 16 hex characters saves no meaningful ceremony.
- Pin arXiv versions (`vN`), retrieval URL, and retrieval time rather than silently fetching “latest.”
- Validate arXiv IDs and defend extraction against archive path traversal.
- Treat pdftotext/OCR equations as unverified unless checked against the rendered page.
- Define or delete provenance statuses `V/I/O/OPEN`; they currently duplicate and conflict with claim status.
- Make parser warnings fatal, especially duplicate keys, unknown statuses, skipped rows, and zero-row coverage.
- Specify the missing `--quiet` interface and correct the claim that every script supports `--check`.
- Enforce append-only BRIEF amendments and DEAD-ROUTES using the Git parent, or stop calling them mandatory.
- Capture actual model/run metadata from reviewer execution instead of trusting a hand-written family string.
- Reject theorem-like environments without labels and multiply defined claim IDs, not only labelled mismatches.
### Design brief as reviewed

# rk-light — design brief (v1, 2026-08-21, for hostile review)

## 0. What this is

A Claude Code **skill** (`~/.claude/skills/rk-light/SKILL.md` + supporting files) that an
Opus-class-or-better orchestrator invokes to run a small, low-stakes theoretical-research
campaign and land a 10-30 page pdflatex report. Two modes:

- **formalise**: light formalisation of one paper (or a small cluster): extract its
  definitions/claims/dependency structure into a ledger, re-derive the load-bearing steps,
  locate gaps, state what is actually proved vs assumed.
- **explore**: attack a conjecture/idea at modest scale: routes, partial results,
  counterexample search, numerics as evidence, honest open-problem list.

It is NOT the rk binary. No af, fr, bd, TS gates, graph projection, HTML, schemas, compat
manifests, phase matrices, milestone reviews. The only machinery is: a stamped repo layout,
three stdlib-python/sh scripts, a claims ledger, a provenance ledger, and a protocol for how
the orchestrator uses subagents (Agent tool), fan-out orchestration (Workflow tool, i.e.
`/workflows`), self-paced iteration (`/loop`), and a second model family (`codex exec`).

Audience: a strong model. The skill states rules, reasons in one line, and recipes. It does
not explain basics. Opus-class failure modes are not ignorance; they are (a) confident
plausible wrong claims, (b) status inflation under pressure to finish, (c) re-walking dead
routes after context loss, (d) ceremony drift in both directions (skipping the one check that
matters / inventing process nobody asked for).

## 1. Evidence: what transfers from heavy rk, and what does not

Every rule below is anchored to an incident in the sister repos. Rules without an incident
are not in the skill.

| # | Rule (light form) | Incident that earns it |
|---|---|---|
| R1 | Byte-verbatim ground truth: every external fact in the report has a verbatim quote that a script matches against a local, hashed copy of the source. Otherwise `[UNVERIFIED]`. | `self-correcting-eta-upper-bound` 2026-06-23: headline `η ≤ 1/3` (tagged [T0], "four-worker confirmed") RETRACTED because scope condition (ii) "volume-filled L = Θ(n^{1/3})" is **absent from `paper.tex`**; the paper proves the opposite direction (`paper:307`). Found by a byte-level pass + a second model family, not by the four workers. |
| R2 | Every claim carries a status from a fixed vocabulary; a claim's effective status is the weakest of itself and its deps; the report's printed tag may not exceed the effective status (script-enforced). Main-theorem hypotheses are each a claim id or an explicit `assumed` row. | Same incident: the assumption was load-bearing and listed as a "non-blocking follow-up" in HANDOFF. AISM: overclaim (`open` framed as proved) is the #1 guarded failure mode. |
| R3 | Reviewer ≠ author for any promotion to `proved`; prefer a second model family (codex) for load-bearing claims; the review is recorded (who, when, note file) and the ledger row names it. | η retraction found by two-family pass; AISM "phantom subagent claims R3"; DISTILLATION law 5/12. |
| R4 | Dead routes are first-class: a death certificate names the wall; ledger is append-only; read before re-deriving. | AISM 2026-07-04 audit: 83% of pulls chased one relabeled mechanism; quantum-conjectures wave-9 `ε̄` route re-walked until LEARNINGS.md existed. |
| R5 | Re-orient from the repo, never from the conversation; STATE.md rewritten whole at session close. | Every sister repo's CLAUDE.md; compaction losses. |
| R6 | Anti-Zeno: ONE hostile review + ONE repair wave per phase; residuals become open problems, not another round. | rk CLAUDE.md §3 (TJO 2026-07-18): "review until zero findings" never terminates. |
| R7 | Ceremony scales with stakes: checks bind at promotion boundaries (a claim becoming `proved`, the report being declared done), never on exploratory motion. A stakes dial selects how much of the protocol applies. | cft-anyons v1 killed by mandatory-everywhere ceremony. |
| R8 | Anything mandatory is harness-enforced: the skill registers a Stop hook that runs the check script when a stamped project is present; red check blocks the turn from ending silently. | DISTILLATION law 9 (constitution text decays from working memory); fr Stop-hook referee was what moved the needle. |
| R9 | Bounded processes: every spawned loop/build/test carries `timeout`; no detached processes. | rk 2026-07-25: two unbounded loops, 34.5 GB and 61.5 GB, froze the VM. |
| R10 | Gates report coverage ("checked N/N quotes"); a silent skip is a failure. | AISM refs gate false-greened 19/19 skipped. |
| R11 | Orchestrator-only files: subagents never edit CLAIMS.md, STATE.md, DEAD-ROUTES.md, PROVENANCE.md; they return files in `notes/` and the orchestrator integrates. | rk lane incidents (shared-file writers); cstar-sdp-bounds rule "subagents must not upgrade statuses". |
| R12 | Conventions fixed at first use in CONVENTIONS.md with a negative list of unfixed choices; "all scientific bugs are convention bugs until proved otherwise". | AQM mega-review: P0s overwhelmingly sign/convention drift. |

Deliberately NOT transferred: af hard tier, fr bandit/breaker machinery (only the k=2 stall
rule survives as prose), bd (git + STATE suffice; bd optional if the repo has it), sharded
one-definition-per-file DB (light scale: definitions live in the tex with `\label{def:...}`
and a CLAIMS row of kind `def`), TS gates, graph render, schemas/compat, divergence triage,
milestone cadence, token accounting.

## 2. Stakes dial

`.rk-light.json` carries `stakes`:

- `note` — single-session write-up. Stamps layout, requires build green + provenance V-rows
  byte-match, no review requirement (everything maxes at `sketched`/`cited`). Banner says so.
- `report` (default) — the full protocol in §4. Required for any `proved` status.

Anything below `note` (a scratch calculation) is not this skill; the skill says so and exits.

## 3. Stamped layout (`rk-light init` = the skill's init steps; templates copied from the skill dir)

```
.rk-light.json        marker + config {mode, stakes, page_target:[10,30], budget:{waves, agents_per_wave}, families:{author, verifier}}
BRIEF.md              authored once: question, mode, scope, non-goals, done criteria, budget. Dated amendments appended.
STATE.md              rewritten whole each session: banner (from ledger), what moved, next steps, open decisions for the user.
CONVENTIONS.md        notation/sign/normalisation fixed at first use + NEGATIVE LIST (unfixed choices).
CLAIMS.md             THE ledger. One row per claim: id | kind | status | deps | label | review | note
PROVENANCE.md         Part 1 source registry (key, path, sha256[:16]); Part 2 per-claim verbatim quotes (label, key, locus, status V/I/O/OPEN, quote).
DEAD-ROUTES.md        append-only death certificates: route, wall, evidence (key:line), date.
sources/              local ground truth: sources/<key>/... (arXiv e-print extracted; .tex preferred, pdftotext fallback) + sources/manifest.sha256
notes/                per-wave worker outputs: notes/wave-NN-<slug>/... and notes/reviews/<claim>-<date>.md
report/main.tex       preamble, \status macro, banner \input, \input of sections
report/sections/NN_<slug>.tex
report/generated/status.tex   GENERATED from CLAIMS.md (hand-edit fails check)
report/refs.bib
scripts/check.py      the gate (stdlib python)
scripts/fetch_arxiv.sh
scripts/build.sh
Makefile              check | build | fetch ID=... | status
```

Status vocabulary (ordered, weakest first): `refuted < open < conjectured < assumed <
numerical < sketched < proved`; `cited` is terminal (no deps; requires a V row); `def` rows
have no status. Effective status = min(own, effective(deps)). `numerical` is a ceiling: a
claim with a `numerical` dep is at most `numerical`. `proved` requires `review` cell =
`<family>:<model> <date> notes/reviews/<file>` and that file to exist and contain a verdict
line `VERDICT: VALID` or `VALID-WITH-CORRECTION`. A `single-family` token in the review cell is
allowed and printed in the banner (honest downgrade, not a hidden one).

Kinds: `def | lemma | prop | thm | cor | conj | obs | assumption | cited`.

## 4. Protocol (phases; entry and exit conditions are the only ceremony)

P0 **Brief** (with the user; 10 minutes). Mode, question, done criteria ("report answers Q1-Q3
with statuses", "main theorem proved or refuted or reduced to a named open problem"), budget
(waves, agents/wave, wall-clock), page target. Write BRIEF.md. Stamp layout.

P1 **Ground truth**. `make fetch ID=...` for each source; registry rows; hash. Rule: no
external fact is written anywhere without a V row or an `[UNVERIFIED]` tag. Quotes are
copied from the local file, never typed from memory.

P2 **Skeleton**. formalise: Workflow fan-out, one agent per paper section, extracting
definitions + claims + deps with `key:line` loci and verbatim quotes into `notes/extract/`;
orchestrator merges into CLAIMS.md (`cited` rows) and PROVENANCE.md; `make check` must be
green (every quote matches) before any derivation starts. explore: the conjecture as a
`conjectured` row; a judge-panel Workflow produces 3-6 attack routes scored for
{plausibility, cost, what-it-would-teach-if-it-dies}; known no-gos seeded into DEAD-ROUTES.

P3 **Waves** (the loop). One wave = (a) pick targets from CLAIMS (weakest load-bearing
first, never a dead route); (b) dispatch workers: prove / compute / search-counterexample /
find-in-literature, each brief self-contained, writing to `notes/wave-NN/`, never touching
orchestrator-only files; (c) harvest: orchestrator updates rows (`sketched`, `numerical`,
`refuted`, `open`, dead routes); (d) promotion: for any row to become `proved`, dispatch an
independent REFUTE-stance verifier from the other family with the written proof only (no
author transcript), record its note; (e) `make check`; STATE.md rewritten. Stall rule: a
route with 2 consecutive waves and no status change on its target dies (certificate) or
pivots. Exploration budget from BRIEF. `/loop` runs waves unattended with stop conditions
{budget exhausted, done criteria met, check red twice in a row, user input needed}.

P4 **Write-up**. Section drafts by agents from CLAIMS + notes (one agent per section; the
brief includes the row list and the CONVENTIONS file); orchestrator integrates; `make build`
green (no undefined refs/citations, page count in range or a stated reason).

P5 **Audit**. ONE hostile end-to-end review (codex xhigh preferred) with five lenses:
overclaim (tag vs evidence), provenance (quotes vs meaning — a matched quote can still be
misread), convention drift, scope assumptions absent from sources (the η class), proof
errors. Two lists: blockers (validity) and follow-ups. ONE repair wave; mechanical
verification (`make check`, `make build`); residual follow-ups go to the Open problems
section and STATE. Then close.

Session close, every session: `make check`; STATE.md rewritten whole; commit; push if a
remote exists.

## 5. Orchestration recipes shipped in `references/`

- `workflows.md`: three ready-to-paste Workflow scripts — `extract-claims` (per-section
  extract → merge → quote verify), `attack-claim` (N independent provers from distinct angles
  → adversarial verifiers → judge → status recommendation), `hostile-audit` (lenses →
  verify each finding → two lists). Each returns structured output; none edits
  orchestrator-only files.
- `briefs.md`: worker brief templates (prover, verifier-REFUTE, extractor, section writer,
  counterexample hunter) with the invariant preamble (self-contained, files to disk, cite
  `key:line`, never edit ledger files, return a VERDICT line).
- `codex.md`: the second-family invocation (`codex exec -s workspace-write -c
  model_reasoning_effort="xhigh" -o <file> "<brief>" < /dev/null`, inside a git dir, bounded
  by `timeout`), and the fallback when codex is unavailable (fresh Agent, REFUTE stance,
  `single-family` token).
- `loop.md`: the `/loop` wave prompt with stop conditions and the rule that the loop never
  promotes to `proved` without a verifier note.
- `lessons.md`: the incident ledger behind R1-R12, one paragraph each, with pointers.
- `report.md`: the tex conventions (`\status{}`, banner, section plan, page budget, what goes
  in the appendix).

## 6. Scripts (stdlib only, each `--check` exits non-zero on ERROR, each with a test file)

`check.py` — parses CLAIMS.md, PROVENANCE.md, sources/manifest.sha256, report/**/*.tex.
1. hash freshness of every registered source;
2. V-row quote byte-match (whitespace-normalised, contiguous; min-run fallback 30 chars)
   with coverage line `quotes: checked N/N`;
3. ledger ↔ tex: every CLAIMS label exists in tex; every theorem-like env with a `\label`
   has a row; every `\status{X}` adjacent to a label matches or is weaker than the row's
   effective status;
4. vocabulary, deps resolve, acyclic;
5. `proved` rows carry a review cell whose note file exists and contains a VALID verdict;
6. `assumed` rows are listed in the banner; main theorem (row flagged `main`) has every
   hypothesis covered;
7. generated banner fresh (regenerate, byte-diff);
8. `[UNVERIFIED]` count (ERROR at stakes=report when >0 in report/, WARN at note);
9. page count vs target (WARN).
`fetch_arxiv.sh ID` — e-print download, tar/gz/pdf detection, extract to `sources/<id>/`,
pdftotext fallback, manifest lines, registry row stub printed.
`build.sh` — `timeout 600 latexmk -pdf -interaction=nonstopmode`, scan log for undefined
references/citations and multiply-defined labels, print page count.

## 7. Skill surface

```
~/.claude/skills/rk-light/      (symlink -> <rk repo>/skills/rk-light, versioned)
  SKILL.md        ~250-350 lines: when to use, the 12 rules, stakes dial, layout, the five
                  phases with entry/exit, orchestrator-only files, session close, pointers
  templates/      the stamped files (BRIEF, STATE, CONVENTIONS, CLAIMS, PROVENANCE,
                  DEAD-ROUTES, main.tex, Makefile, .rk-light.json)
  scripts/        check.py, fetch_arxiv.sh, build.sh, tests/
  references/     workflows.md, briefs.md, codex.md, loop.md, lessons.md, report.md
```

Frontmatter: `description` (trigger phrases: "light formalisation", "explore this idea",
"small campaign", "write up a report on paper X", "rk light"), `argument-hint: [formalise|explore] [arxiv-id or question]`, `hooks:` a Stop hook
running `scripts/check.py --check --quiet` iff `.rk-light.json` exists in cwd (exit 2 with
the ERROR lines so the turn cannot end on a red ledger silently).

## 8. Questions for the reviewer

Q1. Is the status lattice right? Specifically `assumed` between `conjectured` and
`numerical`, and `cited` as terminal. Is `numerical`-as-ceiling too strict for explore mode?
Q2. Is a single CLAIMS.md table (vs per-claim files) adequate at 10-40 claims, given the
check script must parse it and agents must not edit it?
Q3. Is the Stop hook a net positive, or will it fight the user in exploratory sessions
(it only fires when `.rk-light.json` exists)?
Q4. What in §4 is ceremony an Opus-class orchestrator would rationally skip — and should
therefore be cut or demoted to a reference?
Q5. What failure mode of the η-class (load-bearing assumption absent from the source) does
this design still not catch mechanically? Could `check.py` do more than the `main` row
hypothesis check?
Q6. Anything here that contradicts how Claude Code skills/Workflow/loop actually behave?

## Round 2 — artifact review (complete skill + smoke project)

Input: `skills/rk-light/` as of the round-1 repair wave, plus the smoke project. Output: 8 blockers
(with a constructed false-green), repair verification of the 9 round-1 blockers, 10 follow-ups.
The pi/stealth-ox-alpha operator-readability pass returned empty output twice (prompt size); dropped.

### Disposition (the ONE repair wave for this review; no re-review per CLAUDE.md §3)

| # | finding | disposition |
|---|---|---|
| B1 | release not hash-bound; blocker grammar loose; state hash incomplete | TAKEN: state hash = CLAIMS + PROVENANCE + CONVENTIONS + manifest + report tex + every proof artifact; audit note needs `AUDIT-OF <64hex>` and `CLOSED-AT == current hash`; only `## Blockers` parsed; closed items must end `-> fixed|demoted`; `make release` depends on a fresh `build` |
| B2 | theorem env can evade the denominator; text not bound to row | TAKEN: environments parsed as units (`tex.env-label`, `tex.env-kind`, `tex.env-unregistered`, tag must be inside); the printed environment body is hashed into the review receipt (`review.stale` on edit); `cit:` environments must reproduce their quote verbatim (`prov.cited-body`) — this closes the constructed P=NP false-green |
| B3 | self-review and missing proof accepted | TAKEN: `review.proof-missing` (path must exist inside the project; `--receipt` refuses otherwise), `review.author`, `review.same-family` (unless `single-family`, printed), `review.self-review`, `review.note-format` on duplicate lines, review path under `notes/reviews/` |
| B4 | numerical loses conditionality | TAKEN: `numerical-conditional` |
| B5 | audit workflow fails open | TAKEN: CONFIRMED/DISPROVED/UNRESOLVED; unresolved or missing lens = blocker; severity decides on every lens; `complete` flag |
| B6 | single prover can refute | TAKEN: `refuted` requires the same receipt-bound review as `proved` (`REVIEWED = {proved, refuted}`); the workflow's refuter checks witnesses; judge emits `refuted-candidate`; row stays `open` until the second family validates the witness |
| B7 | build.sh false PASS | TAKEN: fresh `-outdir`, exit codes propagated, PDF installed only on success, release depends on build |
| B8 | guard incomplete and self-modifiable | TAKEN: guard = anything outside `notes/` changed since HEAD (incl. untracked), append-only BRIEF/CONVENTIONS/DEAD-ROUTES; Makefile runs the INSTALLED copy (`~/.claude/skills/rk-light/scripts/guard.sh`) when present |
| follow-ups | 0/N coverage; page reason; second table; settings merge; reviewer metadata; KEY validation + link entries; BRIEF append-only | TAKEN: `prov.zero` WARN; second table = parse ERROR; KEY regex; tar link entries refused; BRIEF in guard's append-only set. NOT taken (beads): structured page-target reason; settings.json merge; verifying reviewer metadata from codex logs; a real (non-stub) campaign as the acceptance smoke |

Red/green tests: 29 -> 41. Smoke re-run (smoke2): the constructed false-green now fails on
`prov.cited-body`; editing a reviewed theorem's printed text fails on `review.stale`; a worker
append to CONVENTIONS fails `make guard`; `make release` fails until `CLOSED-AT` matches.

### Round 2 review text

# 1. BLOCKERS

Verdict: reject. Eight false-green paths remain.

1. **Release is neither hash-bound nor structurally closed.** `check_release` merely searches for any `AUDIT-OF ` substring and unchecked checklist item; it never compares the audit hash with current state, validates the hash, confines checklist parsing to `## Blockers`, or requires `fixed|demoted`. Moreover, `state_hash` omits PROVENANCE, conventions, sources, and proof artifacts. Post-audit scientific changes therefore release green; unchecked follow-ups incorrectly block, while malformed blocker prose passes. `skill/scripts/check.py:77-81,118-124`; `skill/scripts/rkl_checks.py:216-229`; `skill/scripts/tests/test_check.py:232-239`.  
   **Fix:** hash every audited input; retain `AUDIT-OF <pre-repair hash>` and require `CLOSED-AT <current full-state hash>`; parse only the Blockers section with an exact grammar and require every blocker to end `-> fixed|demoted`.

2. **A theorem can evade the CLAIMS denominator, and theorem text is not bound to its row.** The parser treats any label as satisfying an environment, but orphan checking only considers recognized claim prefixes. Thus `\begin{theorem}\label{sec:false-green}$P=NP$\end{theorem}` needs neither a row nor a status. Separately, labels/tags are collected globally, so a reviewed ledger statement can be replaced by a different theorem body. `skill/scripts/rkl_parse.py:83-111`; `skill/scripts/rkl_checks.py:110-151`; `skill/scripts/tests/test_check.py:153-163`.  
   **Fix:** parse each environment as a unit; require exactly one correctly prefixed claim label, kind agreement, and exactly one in-environment status tag. Bind a canonical statement/body hash to the row and review receipt.

3. **The review gate accepts self-review and nonexistent proof artifacts.** `receipts_for` hashes missing proof files as empty bytes; `check_reviews` checks only that the path string is nonempty. It never validates `author`, compares author with reviewer, or requires the review path under `notes/reviews/`. Changing the smoke author to its Codex reviewer or issuing a receipt for `notes/does-not-exist.md` produced zero errors. `skill/scripts/check.py:72-74`; `skill/scripts/rkl_checks.py:70-105`; `skill/templates/CLAIMS.md:17-21`.  
   **Fix:** refuse receipts unless the proof exists inside the project; require and validate author/reviewer identities, enforce distinct reviewers, restrict review paths, and reject duplicate RECEIPT/PREMISES/VERDICT entries.

4. **Conditional numerical claims lose their conditional status.** R2 says any assumption below a result adds `-conditional`, but the numerical branch returns plain `numerical`; that is also the only numerical form allowed in the printable vocabulary. A numerical row depending on `asm-x` computes as `numerical` while merely carrying `cond=['asm-x']`, so the theorem tag hides the condition. `skill/SKILL.md:39-44`; `skill/scripts/rkl_status.py:28-32,74-82`; `skill/references/report.md:45-49`.  
   **Fix:** make conditionality orthogonal to evidential status, or add and require `numerical-conditional`.

5. **The hostile-audit workflow fails open.** A missing skeptic result or uncertainty becomes `real=false`, silently discarding a finding; missing lens agents are filtered out without a 5/5 coverage requirement. Even a BLOCKER-level convention drift is forced into follow-ups because `convention-drift` is excluded from the validity lenses. `skill/templates/workflows/rkl-audit.js:9-25`; `skill/references/lessons.md:53-58`.  
   **Fix:** use `CONFIRMED|DISPROVED|UNRESOLVED`, make unresolved/error a blocker, require all five lenses and every verification result, and classify by severity rather than excluding convention drift.

6. **A single prover can falsely “refute” a claim.** `rkl-attack` immediately recommends `refuted` on the first prover-reported witness, before any refuter or judge; the checker requires reviews only for `proved`. A wrong counterexample can therefore become a green headline. `skill/templates/workflows/rkl-attack.js:20-30`; `skill/scripts/rkl_checks.py:70-76`; `skill/templates/CLAIMS.md:10-14`.  
   **Fix:** require a witness artifact and independent receipt-bound validation for `refuted`, just as for `proved`.

7. **`build.sh` can return PASS after compilation fails.** It uses `set -u`, ignores `latexmk`/`pdflatex`/`bibtex` exit codes, and accepts any pre-existing `main.pdf`. `make release` does not run `build`. `skill/scripts/build.sh:6-18,28-30`; `skill/templates/Makefile:7-16`.  
   **Fix:** propagate compiler failures, build to a fresh temporary output, atomically install only a successful PDF, and make `release` depend on a fresh build.

8. **`make guard` does not prove orchestrator-only integrity.** Workflow agents have edit rights, but the diff list omits CONVENTIONS, Makefile, `.claude/`, and sources; appending to CONVENTIONS passes. Worse, a worker may alter the local Makefile/guard before `make guard` invokes it. `skill/references/workflows.md:3-9`; `skill/scripts/guard.sh:8-23`; `skill/SKILL.md:63-65`. Current Claude workflows indeed run agents with auto-approved edits. [Claude workflow documentation](https://code.claude.com/docs/en/workflows)  
   **Fix:** invoke an immutable guard outside the worker-writable project and fail on every changed path except the assigned `notes/**` outputs.

## Concrete false-green

Starting from `smoke/`:

```markdown
# CLAIMS.md:32 — replace only the statement
| cit-nlts | cited | cited | - | cit:nlts | ABN proves P = NP | - | - | - | - |
```

Leave PROVENANCE unchanged:

```markdown
# PROVENANCE.md:30
| cit:nlts | abn2022 | abn2022:266 | the circuit complexity of the state $\psi_n$ is at least $\Omega(\log n)$ |
```

Replace the cited theorem body:

```tex
% report/sections/03_work.tex:2-4
\begin{theorem}[ABN Thm 1, NLTS \cite{abn2022}]
\label{cit:nlts}\claimstatus{cit:nlts}{cited}
ABN proves $P=NP$.
\end{theorem}
```

Leave the old audit untouched. Exercising the shipped `load`/`run(..., release=True)` path in memory returned **zero errors**. The real source quote still matches, no checker relates it to the claimed statement, and the stale audit hash is ignored. `skill/scripts/rkl_checks.py:155-213,216-229`; `skill/scripts/check.py:84-124`.

An even smaller bypass is a new theorem containing only `\label{sec:false-green}`; that also returned zero errors with unchanged CLAIMS and PROVENANCE. `skill/scripts/rkl_parse.py:99-109`; `skill/scripts/rkl_checks.py:142-145`.

# 2. REPAIR VERIFICATION

| Review-1 blocker | Result | Evidence |
|---|---|---|
| 1. Status lattice | **Partial** | `unsupported`, conditional propagation, and OR selection exist, but numerical assumptions lose `-conditional`. `skill/scripts/rkl_status.py:39-90` |
| 2. Unbound reviews | **Not closed** | Receipt binding exists, but missing proofs and self-review pass. `skill/scripts/rkl_checks.py:62-67,70-105` |
| 3. Fuzzy quotes | **Closed** | Whole normalized quote must occur inside the locus window; the 30-character run is diagnostic after an error. `skill/scripts/rkl_checks.py:185-207` |
| 4. Self-selected denominator | **Not closed** | Unlabelled environments and unregistered citations are red, but any non-claim label bypasses the environment requirement. `skill/scripts/rkl_parse.py:99-111`; `skill/scripts/rkl_checks.py:114-150` |
| 5. η-class omitted premise | **Adequately closed at the declared adversarial boundary** | The verifier lists actual premises, extras/`NEW:` are red, and absence claims have a search-record brief. No mechanical completeness is claimed. `skill/references/briefs.md:41-79`; `skill/scripts/rkl_checks.py:95-103` |
| 6. Persistent Stop hook | **Closed for a clean stamp** | Init installs a project hook and the script honors `stop_hook_active`. Existing settings require manual merging. `skill/scripts/init.sh:28-35`; `skill/scripts/stop-hook.sh:10-20`; `smoke/.claude/settings.json:1` |
| 7. Orchestrator-only files | **Not closed** | Codex is read-only, but the writable-workflow guard is incomplete and self-modifiable. `skill/references/codex.md:18-30`; `skill/scripts/guard.sh:8-23` |
| 8. OR support | **Closed** | `a \| b` becomes an OR group and the strongest live alternative is used. `skill/scripts/rkl_parse.py:128-138`; `skill/scripts/rkl_status.py:60-73`; `skill/scripts/tests/test_check.py:124-128` |
| 9. Release audit | **Not closed** | `make release` exists, but neither audit hash nor blocker grammar is enforced. `skill/scripts/rkl_checks.py:216-229` |

# 3. FOLLOW-UPS

- The smoke proves plumbing, not a campaign: BRIEF/STATE remain placeholders, proofs are one-line stubs, and the released report is 2 pages against a 10–30 target. `smoke/BRIEF.md:6-16`; `smoke/notes/wave-01/lem-gap/proof.md:1`; `smoke/report/.pages:1`
- Add red tests for every blocker above; the current release test explicitly accepts `AUDIT-OF abc`. `skill/scripts/tests/test_check.py:232-239`
- R10’s “0/0 with sources is a finding” is stated but not enforced. `skill/SKILL.md:61-62`; `skill/scripts/rkl_checks.py:212`
- Page-range failure remains only a warning, with no structured “stated reason” escape. `skill/scripts/check.py:114-117`
- `parse_table` silently ignores a second table or rows after a blank boundary. `skill/scripts/rkl_parse.py:42-64`
- Init does not merge an existing `.claude/settings.json`, weakening the “stamped for every session” claim. `skill/scripts/init.sh:28-35`
- Reviewer model identity is copied from a log but neither the log nor invocation metadata is checked. `skill/references/codex.md:21,28-32`
- `fetch_arxiv.sh` does not validate `KEY`, and its archive defense checks names but not link targets. `skill/scripts/fetch_arxiv.sh:10-16,31-33`
- BRIEF’s append-only amendment policy is not enforced against orchestrator edits. `skill/templates/BRIEF.md:1-2,18`
- Accepted mechanics: the skill frontmatter/hooks, saved `.claude/workflows` shape, `/goal`, self-paced `/loop`, and `ScheduleWakeup stop` match current Claude Code behavior. `skill/SKILL.md:1-11`; `skill/references/autonomy.md:1-43`; [skills](https://code.claude.com/docs/en/slash-commands), [hooks](https://code.claude.com/docs/en/hooks), [workflows](https://code.claude.com/docs/en/workflows), [goals](https://code.claude.com/docs/en/goal), [scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks).