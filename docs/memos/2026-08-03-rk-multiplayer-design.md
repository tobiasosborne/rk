<!-- ROLE: authored DESIGN PROPOSAL — rk-multiplayer primitives (P7 of the ratified
     improvement plan). Design only: no code, no schema landed here. Nothing is adopted
     until TJO ratifies; adopted items move into ../research-workflows/IMPLEMENTATION_PLAN.md
     (sequencing authority) and bd. UPDATE-POLICY: authored; edited only to record
     ratification outcomes, then frozen. TRIGGER: TJO ratification of the M6-vs-M5 question
     (§7) — §7 recommends MP.1-MP.3 land before M4's lanes dispatch.
     EVIDENCE: docs/memos/2026-08-03-aism-postmortem/{01-governance,05-tooling}.md,
     docs/memos/2026-08-03-aism-bitter-lesson-snapshot.md §6, and this repo's own
     2026-07-25 and 2026-08-03 parallel-lane waves. -->

# rk multiplayer: lanes, roles, ratification

Scope, per the ratified plan (`2026-08-03-rk-improvement-plan-from-aism.md` §P7): what rk
needs so N>1 writers — concurrent agent sessions, or a human on a second device — can work
one campaign without corrupting it. Citations `01-governance.md:120` are into
`docs/memos/2026-08-03-aism-postmortem/`.

Every mechanism below is a **file convention + a gate + a generator**. Nothing resident: no
lock server, no lease daemon, no watcher, no remote coordination (PRD §7; CLAUDE.md §7 stop
condition). A proposal that cannot be stated as "a tracked file some role owns, a check that
reads it, a generator that derives the rest" does not belong here.

## 1. What breaks today with N>1 writers

| # | Failure mode | Evidence (measured) |
|---|---|---|
| 1 | Guards keyed on whole-repo state treat every concurrent writer as an attack. The repair was always to serialize people — "fr/bd writes FIRST, commit, af launch LAST", "no design/audit codex while ANY af run is live" (`:103`, `:59`). A safety guard that serialized the workflow | AISM's overreach guard was a `git status --porcelain` snapshot diff with a hand-maintained allowlist (`05-tooling.md:108`). "All 6 parallel first-attempt runs aborted; zero genuine overreach" (`01-governance.md:68`); an fr Stop hook's `log.jsonl` append "killed a live run whose baseline was committed-clean" (`:67`) |
| 2 | Concurrency was retrofitted as isolation, never as merge | Worktree per row, rsync back (`:121`); two stale worktrees months later, so "a repo grep for governance now returns three different vintages" (`:46`) |
| 3 | The merge protocol is a hand-written artifact — an agent wrote it, by hand, once. rk should emit it | `MERGE-NOTES.md`: per-file conflict-risk table, resolution rules, shard-numbering collision protocol, post-merge command list (`:122`) |
| 4 | Sequential numeric ids collide; slug ids do not. **rk has this bug now** — fixture ids are sequential-per-gate (`refs-09`, `linker-44`); the 2026-08-03 wave escaped only because its two lanes touched different gates | `AISM-NN` shards forced a renumber (36 to 37) plus an `00a` escape hatch; `def-`/`lem-` slugs had zero collisions across 412 shards and definitions (`:125`) |
| 5 | Hand-maintained counters rot. Three homes for one number in rk, one already wrong | AISM: "Registry: 44 results (HANDOFF said 46 — stale)"; verdict "Hand-maintained discipline decays; only gated discipline holds" (`:53`). rk: `src/corpus/discovery.ts:145` (`EXPECTED_FIXTURE_COUNT = 131`), `test/corpus.test.ts:66-68` (131 twice), and `corpus/README.md:161` whose Totals still reads **123** — stale since the 127-fixture recount, deliberately (rk-sp3n), now with five stacked "+N over the then-pinned M" paragraphs in place of a number. The 2026-07-25 wave nearly lost the second count entirely (memory `rk-orchestration-shared-file-writers`) |
| 6 | Shared wiring files are the whole collision surface; tracking derived files guarantees conflicts | AISM hot spots: `report/main.tex`, `README.md`, `SHARD_CATALOG.md`, `check-all.sh`, `CLAUDE.md`/`AGENTS.md`, `Makefile`, plus tracked `main.pdf` and `*.aux` (`:123`). Clean merges: append-only logs and one-object-per-file shards, 754 of them (`:124`). rk's list is known: `corpus/README.md`, `src/corpus/discovery.ts`, `test/corpus.test.ts`, `docs/gate-contracts.md`, `docs/worker-contract.md`, `HANDOFF.md`, `rk.compat.json`, `README.md` |
| 7 | bd is single-writer; any lane running `bd` is a race | Exclusive Dolt lock: "Do not run multiple `bd` commands in parallel" (`:120`) |
| 8 | Textual merge success is not semantic merge success — two lanes can merge conflict-free and produce a runtime failure | rk 2026-08-03: `GraphEdges.retraction` is required and "bun doesn't typecheck; a new `GraphEdges` literal elsewhere fails at runtime" (`HANDOFF.md:97-98`) |
| 9 | Untracked-but-load-bearing state is the multi-human failure mode | AISM cross-device handoff was manual reconstruction: `refs/` payloads gitignored, `refs-staging/` untracked with a committed snapshot, scratchpad lost (`:130`); the `fetch-refs.py` recipe "travels with the repo [with] no gate forcing it to still work" (`05-tooling.md:46`). rk today: `.rk/parse-failures/` unrotated, scratchpad ephemeral (`HANDOFF.md:115,118`) |
| 10 | Read-only fan-out never broke — the one concurrency mode that already works, unmodified, in both repos | Four parallel auditors, four recon lanes; "Workers did not edit tracked files and did not run fr/bd/git" (`:128`) |

## 2. Design: lane manifests

A **lane** is one writer with a declared, machine-readable write scope: one tracked file per
lane, slug-named, one object per file — the shape that merged cleanly 754 times in AISM.

```
.rk/lanes/<lane-slug>.json          # lane.v1 — one lane per file, never a shared list
{ "schema_version": "1", "lane": "rk-wkzh", "role": "implementer",
  "branch": "rk-wkzh-gate3", "base": "<sha>",
  "owns":     ["src/gates/refs*.ts", "test/gates/refs*.test.ts", "corpus/refs/refs-09/**"],
  "appends":  [".rk/lane-journal/rk-wkzh.jsonl"],
  "reserves": ["corpus/refs/refs-locus-*"],
  "shared":   [{ "path": "docs/gate-contracts.md", "intent": "Gate 3 checks 6-7",
                 "payload": "docs/lane-deltas/rk-wkzh-gate-contracts.md",
                 "apply": "orchestrator" }] }
```

Four path classes, because the evidence shows four distinct merge behaviours:

| class | behaviour | evidence |
|---|---|---|
| `owns` | exclusive write; two lanes' globs may not intersect | one-object-per-file shards merged clean (`01-governance.md:124`) |
| `appends` | union merge, dedup by record hash | `.frontier/log.jsonl`, `docs/worklog.md` merged clean (ibid.) |
| `reserves` | id-prefix reservation, no write implied | the `AISM-NN` renumber (`:125`) |
| `shared` | lane authors the exact text into a payload file; orchestrator places it | AISM's four wiring files; rk's eight-file hot-spot list |

`shared` is the load-bearing class: it keeps single-writer discipline on the contract surface
**without** making the orchestrator paraphrase a lane's intent — the 2026-07-25 wave's actual
failure mode, where deltas lived only in agents' final reports and a crash between "lane
commits" and "orchestrator applies delta" left the contract silently understating the code
(memory `parallel-lane-waves-survive-process-death`). The payload file is lane-`owns`ed, so the
*text* is durable at lane-commit time and only the *placement* waits — the file-not-final-message
rule (`05-tooling.md:70`: a 64-minute run lost because 31 tool calls were reads and nothing hit
disk) applied to merges.

### 2a. Pre-merge: the generated merge protocol

`rk lanes protocol` reads every `.rk/lanes/*.json` and emits `build/MERGE-PROTOCOL.md`
(generated, never hand-edited — rule 9; freshness-gated by Gate 7, which already exists):
**§1** lanes in flight (lane, role, branch, base sha, age); **§2** conflict-risk table, path
or glob × lanes × class × resolution — an intersection of two `owns` globs is an **ERROR at
dispatch time**, not a surprise at merge time (AISM's table was written after the fact);
**§3** shared-file deltas, payload to target, in apply order; **§4** count reconciliation
spelled out (`base 131 + rk-wkzh(+3) + rk-0ehr(+1) = 135`, then the post-merge disk check);
**§5** post-merge command list in this harness's verb set (`git switch`/`cherry-pick`/`branch -f`;
`merge` and `checkout` are classifier-blocked, `HANDOFF.md:84-85`); **§6** composition checks —
the full `bun test` + selftest + compile, because textual merge success is not semantic merge
success (§1.8).

### 2b. Live: a path-scoped overreach check

`rk lanes check` compares the lane's **own worktree diff against its own `base` sha** to its
declared scope. Three properties, each repairing a named incident:

- **Scoped, not global.** No whole-repo porcelain snapshot. An orchestrator writing `HANDOFF.md`,
  or bd writing its store, is outside every lane's scope and trips nothing — exactly the class
  that aborted all six of AISM's first parallel runs (`:68`) and killed a live run via an fr
  Stop-hook append (`:67`, exemption commit `4122cd28`).
- **Diff-based, not snapshot-based.** The baseline is a commit, so a dirty tree at launch is not
  an accusation; the self-inflicted BALLOON false positive that minted "fr/bd writes FIRST,
  commit, launch LAST" (`:103`) cannot recur.
- **Advisory to the lane, blocking at merge.** It reports; it never kills a running job — AISM's
  guard killed live work at a measured genuine-overreach rate of zero. The blocking run is the
  orchestrator's, pre-merge, on its side of the fence: the corollary of the near-miss where a
  worktree agent used `--no-verify` on a worktree-only failure and merged (`:75`).

### 2c. The count-file problem

Live instance in §1.5: one constant, one duplicate pair, one ledger line reading 123.

- **(a) Per-fixture ledger rows, generated total.** Each fixture directory carries its own row
  (`corpus/<gate>/<id>/fixture.json`: id, gate, violation, source incident, status); a generator
  sums them into the pinned constant and the README table. Lanes only add a directory; the
  shared number is derived. One-object-per-file applied to bookkeeping, and the
  `gen-report-stats.py` split-generator pattern AISM proved for self-referential counts
  (`05-tooling.md:123`).
- **(b) Orchestrator-owned counters.** Lanes report deltas, orchestrator writes all three homes.
  The status quo; measured output is one stale Totals line, five correction paragraphs, and a
  near-miss on the second hardcoded count.

**Recommend (a)**, plus one addition that keeps what the pin was for: a total regenerated from
disk cannot detect a *lost* fixture — the tripwire the constant exists to be. So the gate asserts
a triangle, `sum(authored rows) == generated constant == disk discovery count`. A deleted
directory leaves an orphan row and ERRORs; an undeclared directory ERRORs the other way. The
number stops being hand-maintained without becoming unguarded ("only gated discipline holds"),
and rk-sp3n reconciles as a side effect. The rule generalizes: **any file that is a list of
things living elsewhere is generated** (`GATE_DIRS`, the gate registry, `corpus/README.md`'s
tables). That is how AISM's four wiring files stop being wiring files.

## 3. Roles as the concurrency unit

AISM's own conclusion: "The natural unit of a successor is the **role**, not the session"
(`:127`).

| role | writes | note |
|---|---|---|
| orchestrator | the eight shared-contract files, `.rk/lanes/`, bd, all merges | never judges Tier A correctness (CLAUDE.md §3) |
| implementer | its `owns` globs + `shared` payloads, on its own branch | one per disjoint glob set |
| surveyor | nothing tracked; its report file only | read-only fan-out, the mode that never broke (`:128`) |
| reviewer | `docs/reviews/<date>-<scope>.md` only | may not hold an implementer manifest over any path it reviewed |
| live-driver | the campaign workspace repo only (`../rk-m3.5-baseline`), never rk's source | separate repo = separate scope; no exemption list needed |

Concurrency rules, derived from incidents rather than taste:

- **N surveyors, always** — free. The cap is machine memory, not correctness: 2-3 lanes on this
  box, never concurrent full `bun test`, the combination that exhausted 62 GB of RAM on
  2026-07-25 (memory; CLAUDE.md rule 13).
- **N implementers with disjoint `owns`**, checked at dispatch (§2a), not discovered at merge.
- **Implementer ∥ live-driver: allowed** — different repositories. AISM had to forbid this ("no
  design/audit codex while ANY af run is live", `:59`) purely because its guard was global.
- **Orchestrator ∥ anything: allowed** — its writes are outside every lane scope by
  construction, the property AISM's global guard could not express.
- **Reviewer ∥ implementer on the same paths: forbidden**, and now structurally checkable: a
  lane manifest claiming `owns` over a path in the reviewer's scope, under the same identity,
  is an ERROR. Reviewer ≠ author stops being a convention held by a person.
- **bd: orchestrator only** (`:120`). Lanes append bead intents (`{op, id, fields, ts}`) to
  their `appends` journal; the orchestrator drains it. No lane runs `bd`. Queueing via an
  append-only file, not a service.

## 4. Humans in the loop

**The ratification package is an artifact, not a conversation.** Model: AISM's
`docs/plans/2026-07-27-W78-ratification-package.md` — "NOTHING IN THIS PACKAGE LANDS WITHOUT
EXPLICIT USER RATIFICATION", four enumerated decisions, a canonical-source table, and
deliberately **no quoted contract text (anti-drift)**: ratification is of *files as audited*
plus enumerated corrections folded in verbatim (`:129`). rk ran this informally on 2026-08-03
(five `[TJO]` points, ratified in-chat, recorded in a memo header); the informal version's
weakness is that the record lives in prose no gate reads.

`rk ratify new <slug>` generates `docs/ratifications/<date>-<slug>.md` from beads tagged
`needs-ratification` plus the lanes in flight: enumerated decisions with options and a
recommendation and no prose beyond that; a canonical-source table of path + sha256 for every
file the decision is *about*; a **gated no-quotation rule** (the package may not contain
content copied from the files it ratifies — you ratify the bytes at that hash, not a paraphrase
that will diverge); a signature block of decision, verbatim TJO text, date, bead updates.

**Nothing lands unsigned**: a `needs-ratification` bead cannot close, and the WP it gates
cannot land, without a record naming it and pinning the sha it was ratified at. If the file
changed since, the record reads stale — the hash-bound auto-staling shape rk already uses for
verdicts. **Escalation is the same artifact, different trigger**: CLAUDE.md §7's stop
conditions become typed records appended to the same queue, so an escalation is a durable
object with a resolution field rather than a paragraph in a session that ends. Evidence:
"Route F complete" persisted alongside "GAPs remain" for days until **user escalation** forced
the retraction (`:73`).

## 5. State rules

1. **Slug ids only.** Zero collisions across 412 AISM slugs against one forced renumber and one
   escape hatch in the numeric namespace (`:125`). rk's bead ids are already slugs (rk-psrh,
   rk-wkzh) with zero collisions in this repo's history; its *fixture* ids are not. New fixtures
   take slug form (`refs-locus-wrong-theorem`, not `refs-12`), gated; the 131 existing numeric
   ids are grandfathered on an explicit, shrink-only list. Manifests may `reserve` an id prefix
   so two lanes cannot pick the same slug either.
2. **Append-only logs merge by union.** `.jsonl` stores (`.rk/retractions.jsonl`, the verdict
   store, lane journals) get `merge=union` in `.gitattributes` plus a dedup-by-record-hash
   normalizer the gate re-runs — records are already content-addressed, so dedup is exact.
   Never rewrite history in these files (fr's append-only law; rk's retraction store already
   works this way).
3. **Generated, never hand-merged.** Every wiring file is a build output with a freshness gate
   (§2c), and no derived artifact is tracked: AISM tracked `main.pdf` and `*.aux` and both
   became self-inflicted hot spots (`:123`).
4. **Tracked-or-reconstructible, with a gate that proves reconstruction still works.**
   `.rk/reconstruct.json` lists every gitignored path any role reads, each with a recipe command
   and a verifiable assertion (a manifest checksum that must resolve). A scheduled
   `rk check --reconstruct` executes each recipe into a temp dir under rule-13 bounds
   (`timeout` + RLIMIT) and fails on a recipe that no longer works. Evidence: `fetch-refs.py`
   was tracked and ungated (`05-tooling.md:46`), `refs-staging/` was untracked-with-a-snapshot,
   and one run bundle's documented re-run command has been broken-but-green since banking day.
   Off the pre-commit path (cost); shares an executor with P3's `rk run verify`. Red fixture: a
   recipe whose command exits non-zero, transcribed from that bundle.

## 6. What this does not change

- **D1-D8 stand.** No shared coordination ledger (D1: manifests are per-lane files and the
  merge protocol is a *projection* of them). Per-repo (D3): `.rk/lanes/` lives in the campaign
  repo, no cross-repo registry. No monorepo, no Lean, no remote CI, af stays Go, multi-backend
  workers — untouched.
- **No daemon, server, lock service, or watcher.** Every mechanism is a tracked file, a gate
  that reads it, or a generator that derives from it. A lease server would be a §7 stop
  condition; none is proposed.
- **bd stays single-writer** (§3). No bd concurrency work; the queue is a file.
- **No permissions or authentication.** All lanes are cooperative under one owner's trust
  boundary; every check catches a lane that *forgot* its scope, never one that lies about it.
  PRD §7 lists "multi-user collaboration/permissions" as out of scope and this design does not
  relitigate it; see §8 Q1.
- **Review cadence, the anti-Zeno cap, and role purity are unchanged** — two of them merely
  become structurally checkable (reviewer ≠ author, orchestrator-never-judges).

## 7. Sizing and placement

| WP | Deliverable | Size | Tier | Acceptance |
|---|---|---|---|---|
| MP.1 | `lane.v1` schema + `rk lanes validate` | S | A (versioned schema) | Intersecting `owns` globs ERROR at dispatch; malformed manifest ERRORs; `lanes-*` corpus fixtures |
| MP.2 | `rk lanes protocol` generator (`build/MERGE-PROTOCOL.md`) | S-M | B | Golden output for a three-lane fixture; §4 arithmetic matches disk after a simulated merge; Gate 7 freshness-gated |
| MP.3 | `rk lanes check` — path-scoped overreach | S | B | Red fixtures replay four AISM false positives (concurrent orchestrator write, hook append, dirty-at-launch, cross-repo live-driver) and all PASS; an undeclared `docs/gate-contracts.md` write ERRORs |
| MP.4 | Per-fixture ledger rows + generated count triangle | M | B | Two simulated lanes each adding a fixture merge conflict-free; a deleted directory with a live row ERRORs; rk-sp3n reconciles |
| MP.5 | Slug-id rule + grandfather list + gate | S | C | A new numeric fixture id fails; the grandfather list may only shrink |
| MP.6 | Ratification package generator + unsigned-landing gate | M | A (landing gate) | A `needs-ratification` bead cannot close unsigned; a package quoting source text ERRORs; a record pinned at a stale sha reads stale |
| MP.7 | `.rk/reconstruct.json` + scheduled reconstruction gate | M | B | Broken-recipe fixture caught; runs on the `rk audit` schedule; bounded per rule 13 |
| MP.8 | Role topology into `docs/worker-contract.md` + lane-brief template | S | B | A lane brief is generated from a manifest, not hand-written; the eight-file no-touch list is derived, not retyped |

**Useful standalone, in this order: MP.1 + MP.2 + MP.3.** They pay off the first time two
lanes run, touch no validity semantics, and replace work rk does by hand every multi-lane
session — the 2026-08-03 wave hand-wrote a `SHARED-EDITS.md` which the Tier A review then ruled
should be deleted as scaffolding, and scaffolding is precisely what a generator should emit.
MP.4-MP.5 follow naturally; MP.6-MP.7 are independent and sequence with M5.1, whose scheduler
MP.7 reuses.

**Recommendation: fold into M5, and pull MP.1-MP.3 forward to run before M4.** Not a new M6.

- *For M6:* keeps M5 inside its size envelope — M5 already carries an L (M5.4, dogfood 2) and
  four M's, so eight more WPs risk rule 11's 2× tripwire; and multiplayer gets its own review
  and acceptance boundary.
- *For M5:* M5.4, a fresh exploration-phase dogfood, is the best live-fire this design will
  ever get — a second campaign run by ≥2 lanes proves the manifests or breaks them. An M6
  *after* M5 means the best test case runs before the thing it tests exists, and every
  milestone until then pays the manual merge tax. AISM's parallel af arrived four days before
  the campaign closed (snapshot §6); that is the mistake not to repeat.
- *Why the split:* MP.1-MP.3 are self-hosting tooling — rk uses them to build M4, so they must
  exist before M4's lanes dispatch; they are small, Tier A only on the schema, and depend on no
  other M5 work. The remaining five fold into M5 as an M5.0 block ahead of M5.1, so M5.4
  exercises them. If M5 then crosses its tripwire, MP.6-MP.7 split out — the rule 11 response,
  which need not be decided today.

## 8. Open questions for TJO

1. **PRD §7 wording.** It lists "Multi-user collaboration/permissions" as out of scope; this
   design is multi-*writer* mechanics with no permissions model (§6). Amend the PRD line
   ("permissions/auth out; concurrent-writer conventions in"), or treat P7 as an exception
   recorded only here? Surfaced rather than picked silently (CLAUDE.md §7).
2. **Is "multiple humans" real or hypothetical?** The cross-device single-human case is real
   today (`bd dolt pull`, refs reconstruction, `:130`). A genuine second human changes §4: who
   may sign, and does a signature need an identity field? MP.6's schema depends on the answer.
3. **Fixture-id migration.** Grandfather the 131 numeric ids permanently, or spend one wave
   renaming to slugs? A rename touches every ledger row, every `expected.json` path, and both
   hardcoded counts — mechanical but wide.
4. **Where does the unsigned-landing gate bind** — at `bd close`, in the pre-commit hook, or at
   milestone acceptance? Pre-commit is strongest and most annoying; milestone acceptance is
   weakest but catches the case that mattered in AISM (a headline drifting free for days).
5. **Should a manifest declare a resource class?** With `"heavy": true`, MP.2 could refuse a
   five-lane wave outright instead of relying on the orchestrator remembering the 2026-07-25 OOM.
6. **Manifest retention.** Do merged manifests stay tracked as a record of who wrote what (a
   natural home for author identity once vibefeld's V1 lands), or are they deleted at merge to
   keep `.rk/lanes/` a live set?
