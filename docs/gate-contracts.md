<!-- ROLE: normative contract for rk's gate suite (`rk check`) — the six ported AISM gates plus
     the two synthetic rk-only gates (config, M1; freshness, M2.6).
     UPDATE POLICY: authored, rewritten-whole per gate section when that gate's checks change;
     a code change that alters check semantics without updating this doc is incomplete work
     (CLAUDE.md Rule 7).
     TRIGGER: before implementing or modifying any gate in src/gates/; before writing a corpus
     fixture (corpus/README.md must stay in lockstep — every fixture named here has a row there). -->

# Gate contracts

## Authority

This contract is normative for `rk check`'s six M0 gates. AISM's scripts
(`../almost-idempotent-stochastic-maps/scripts/{check-defs.py, argument.py, check-refs.py,
check-provenance.py, check-runs.py, check-report-shards.sh}`, plus the shared constant
`scripts/af_constants.py` and the composition script `scripts/check-all.sh`) are
**characterized prior art** — cited throughout as provenance (`script:line-range`) and as the
source of every incident this contract guards against, never as a golden master to match.
Where this document and an AISM script disagree, this document wins. Every behavioral
divergence between a gate's contract and its corresponding AISM script is recorded and triaged
per CLAUDE.md L5 ({rk-stricter-intended | rk-bug | ambiguous → escalate}); see each gate's
"Divergences from AISM (triage)" section. Cross-reference: PRD decision D9 ("Status of prior
art", added 2026-07-17).

**Tag taxonomy note** (stated once here, applies to every gate's Divergences section): two tags,
`[message-only]` and `[crash-to-finding]`, appear alongside the L5 triad but are not members of
it. Both are **verdict-neutral, trigger-preserving** subclasses — a `[message-only]` divergence
changes only finding *text* (never a trigger condition or a verdict on any fixture); a
`[crash-to-finding]` divergence changes an uncaught crash into a reported ERROR on the identical
trigger condition, without altering what triggers it. Neither needs an {rk-stricter-intended |
rk-bug | ambiguous → escalate} classification, since that triad exists to triage divergences
that *could* flip a verdict; these two categories are defined precisely so they cannot. A
mechanical audit of this document should not flag their absence from the triad as an omission.

**Tag asymmetry, resolved once.** Two divergences look superficially identical — a hardcoded
AISM value becomes an explicit rk config parameter — yet carry different tags: Gate 4's
`provenance-11` (the `tab:status` source filename) and Gate 6's `PREFIX` (amended 2026-07-18, R12)
are both `[rk-stricter-intended]`, while Gate 6's `MAX_LINES` parameterization is `[message-only]`.
The distinguishing question is whether the change alters *what gets scanned or checked, or what
counts as passing*: `provenance-11`'s hardcoded filename already caused a real false-green
(incident (a) in Gate 4) by silently pointing at a stale, renamed file; `PREFIX` carrying forward
AISM's own `"AISM"` value as rk's default was itself exactly that shape of residue (a
general-purpose tool silently validating every repo against one prior campaign's name) — removing
the default and requiring explicit configuration closes both gaps, a genuine (near-zero-cost,
R12-audited) strictness tightening in each case. `MAX_LINES` changes only *how* a value already
correct for AISM's own repo is configured; AISM's own default remains byte-identical, so no tree's
scan set or verdict ever changes for it — text/config-surface only, hence `[message-only]`. See
each entry for the specific reasoning.

Every check below cites its AISM source as `script:line-range` for provenance. Every gate's
docstring/header comment is itself read as part of the spec's prior art — AISM's authors
already named several of these gates' failure modes and known limitations in prose; that prose
is preserved and cited as characterization of the incidents this contract guards against, not
paraphrased away.

This document specs the **six** M0 gates ported from AISM (defs, argument/linker, refs,
provenance, runs, report-shards) plus **two synthetic rk-only gates with no AISM
check-all.sh counterpart**: `config` (M1, rk-xbm — untrusted `.rk/config.json` validation)
and **Gate 7, freshness** (M2.6 — see its own section below), the general regenerate-and-diff
mechanism IMPLEMENTATION_PLAN M2.6 names. Gate 2 (argument/linker) already contains a narrow
freshness-style check of its own — `check_generated`/Check 11, unconditionally ERROR-ing on
its two generated mirror files (argument.py's port) — that predates and is narrower than Gate
7: Check 11 is file-specific and hardcoded to exactly `argument/INDEX.md`/`DAG.md`; Gate 7 is a
declared-manifest mechanism any generator can register into. Gate 7's own section documents the
boundary between the two precisely (never double-reporting the same staleness under two gate
names).

## Shared conventions (all six ported gates, plus `config` and `freshness`)

**Finding format.** One line per finding: `SEVERITY path:line message`. `SEVERITY` is `ERROR`
or `WARN`. `path` is repo-relative. `line` is 1-indexed; where the underlying check does not
resolve to a specific source line (a JSON file, a cross-shard cycle, a whole-registry check),
`line` defaults to `1` and is attributed to the first-mentioned path. This is a **deviation**
from AISM's own console output, which is inconsistent across scripts — bare `<file>: <message>`
in check-defs.py/argument.py, a tabular `[symbol] workspace  external  verdict  locus` layout in
check-refs.py, grouped-by-check-name blocks in check-provenance.py, and bare `report shard
check: <message>` lines in check-report-shards.sh. Justification: PRD C8 and CLAUDE.md L2
require one stable, parseable finding format across the whole suite; AISM never needed this
because its five formats were read by humans only. No gate's pass/fail semantics changes.

**Exception: the crash-boundary sentinel** (rk-bdd, 2026-07-18 M0.3 re-review finding 9). `rk
check`'s per-gate exception boundary (`src/cli/check.ts`'s `runGateSafely`, "Composition" below)
synthesizes one ERROR finding when a gate itself throws — a defense-in-depth path, never a normal
finding. That finding's `path` is the sentinel `<gate:NAME>` (e.g. `<gate:defs>`), not a
repo-relative path: a crash cannot be attributed to any specific file in the checked repo, and a
bare gate name (e.g. `defs`) would both misread as a malformed real path and could coincidentally
collide with an actual repo-relative path if the checked repo happened to have a file literally
named `defs`. Angle brackets never appear in a real repo-relative path, so this is the one path
shape in the whole suite deliberately not repo-relative.

**Coverage line.** Every gate emits exactly one final line: `checked <gate>: <N>/<M> <unit>
(<E> errors, <W> warnings)`, even when `N == M == 0` (an empty corpus, e.g. `runs/` on day 1,
is a legitimate green state and must say so explicitly — CLAUDE.md L2: "a skip is always
visible with a count"). Where a gate has more than one countable unit (check-refs.py's
pass/fail/skip-import/skip-noquote split), the coverage line breaks the total down by verdict
class rather than collapsing skip reasons into one number — see the refs gate's Divergences.

**Exit codes.** `0` — zero ERRORs (WARNs never fail a gate). `1` — at least one ERROR. This
matches every AISM script's own `main()` (`return 1 if errors else 0`, uniformly). A gate's own
CLI convenience surface (e.g. argument.py's `--show <id>` on an unknown id) may use other codes
for usage errors; those are CLI ergonomics, not gate verdicts, and are out of this contract's
scope.

**Composition (`rk check`).** All six gates run unconditionally in one invocation; `rk check`
exits 1 if any gate found ≥1 ERROR, and prints all six coverage lines regardless of earlier
failures. This is a **deviation** from `scripts/check-all.sh`, which short-circuits at the first
failing script (`fail() { ...; exit 1; }`, check-all.sh:7, invoked at lines 10,13,16,19,20,28,31,36).
Justification: L2's coverage-reporting mandate is only meaningful if every gate actually runs
every time; a fix-one-rerun loop hides how many gates are broken at once. No individual gate's
internal logic changes — only the wrapper's control flow.

**Snapshot loading** (round-3 landing-blocker 3). `rk check` builds the in-memory `RepoSnapshot`
(`src/store/snapshot-load.ts`) once, BEFORE the per-gate exception boundary. Two rules keep that
precondition from silently defeating composition:

- **Symlink policy.** The loader `lstat`s every entry and treats a symbolic link as
  **content-invisible**: never followed — not hashed, not read as text, not recorded as a
  directory, never descended into. This closes three failure modes the older follow-the-link
  behavior exposed, each of which could throw or diverge before any gate ran: a **dangling** link
  (would throw following a dead target), a **cyclic** self/parent-referential link (would recurse
  forever), and an **escaping** link to a path outside the root (would pull foreign bytes into the
  snapshot). A symlinked source therefore carries no hash fact, so Gate 4 reads it as genuinely
  absent ⇒ WARN "not hash-verifiable" — the safe direction (never a false ERROR, never a
  missed-stale false-green). Only regular files receive content/hash; fifos/sockets/device nodes
  are skipped for the same reason. This is a **deviation** from AISM's scripts, which never walked
  a repo tree at all (each hard-coded its inputs); no gate's pass/fail semantics changes.
- **Load failure is composed, never fatal.** Snapshot loading is a precondition of all six gates,
  so a failure cannot be attributed to any one of them. If it throws anyway (defense-in-depth —
  the lstat policy makes the loader effectively total), `rk check` emits one loud ERROR under the
  `<snapshot-load>` sentinel path (same angle-bracket, never-a-real-path convention as
  `<gate:NAME>`), a crash-marked coverage line for every registered gate, and exit 1 — never a
  silent pass-shaped `0/0` and never an uncaught process exit.

**Out of scope for `rk check`.** `check-all.sh` also runs `gen-current-pointer.py --check`
(`CURRENT.md` freshness against the registry, check-all.sh:20) and a tooling-test loop over
`scripts/tests/test_*.py` (check-all.sh:33-37) as part of the same local-CI invocation. Neither
is one of the six ported gates this contract specifies, and `rk check` deliberately excludes
both — the second is a test suite, not a gate over repo content, out of scope permanently. The
first (`CURRENT.md` freshness) is a narrower instance of the general problem **Gate 7 —
freshness** (below) now solves for any repo that declares an equivalent artifact in
`.rk/generated.json` — rk has no `CURRENT.md` concept of its own, so this specific AISM script
invocation has no direct rk counterpart to adopt, but the mechanism it wanted is no longer
absent. Recorded here explicitly so M0.5's AISM-parity divergence bookkeeping excludes both on
purpose, not by oversight.

**Per-repo parameters (this WP's scope).** Two config values are explicitly per-repo, not
global constants, ported from AISM's hardcoded defaults:
- **Brittleness soft cap** (linker gate): default **26** nodes, **no depth check** by default.
  AISM's own `argument/README.md:80-81` still documents the *old* rule ("default >12 / depth
  >3") — that prose is stale against the code (`af_constants.py:19`, `check_brittleness`'s
  actual signature has no depth parameter at all). Ground truth per L5 is the code, not the
  stale doc; see the linker gate section for the full incident (aism-s64).
- **Report-shard PREFIX** (no default — amended 2026-07-18, R12; was "AISM" in the AISM source)
  and **MAX_LINES** (280, already an env-var override in AISM) — see the report-shards gate
  section.

**Config validation (rk-xbm, M1 review B1).** `.rk/config.json` is untrusted, untyped JSON.
Every field is runtime-validated before use (`src/gates/config.ts`'s `validateConfigOverrides`):
enum membership for `phase`, positive-finite-number for the numeric fields
(`linkerBrittlenessSoftCap`, `shardsMaxLines`, `refsMinRunReportingLength`), non-empty-string for
`provenanceStatusTableFile`/`shardsPrefix`, and unknown-key detection. A malformed or unknown
field is NEVER silently accepted and NEVER silently kept — it is dropped (falling back to
`DEFAULT_GATE_CONFIG`'s strict value, so a typo can only ever make checking STRICTER, never
weaker) and produces exactly one loud, `structural: true` (blocking in both phases) ERROR at
`.rk/config.json:1`, surfaced by a synthetic `config` gate registered first in
`src/gates/index.ts`. Invalid config is a BLOCKING ERROR: `rk check` exits 1, same as any other
gate ERROR. Known residual (deliberate scope boundary, tracked): syntactically unparseable JSON
still degrades to defaults without a finding — a distinct failure mode from a malformed field.
Corpus fixtures: `config-01` (typo'd `phase` — pre-fix, `phase.ts` treated any
non-"consolidation" value as exploration, a silent severity demotion), `config-02` (malformed
`shardsMaxLines` — pre-fix, the NaN comparison false-greened the line cap), `config-03`
(rk-7hi, M3.5 STOP-2 blocker: empty-string `workers.assignments.<role>.<tier>.model` — the new
optional per-assignment model override added so a `--live` run can pin the claude side to an
explicit model while the codex side stays on its own default; validated with the same
non-blank-string discipline as `backend`; see `docs/worker-contract.md`'s isolation-tuple
section and `src/drive/backend-registry.ts`'s `RoleTierAssignment`).

**Fixture/harness invocation (read before running any AISM script against a fixture or
historical tree).** Two harness pitfalls surfaced building the M0.2 corpus (recorded in full in
`corpus/README.md`'s Validation methodology section); M0.3 implementers and the M0.3 robustness
run inherit both:
- **AISM's python gates hardcode `ROOT` from `__file__`.** Every AISM python gate script
  (`check-defs.py`, `argument.py`, `check-refs.py`, `check-provenance.py`, `check-runs.py`) sets
  `ROOT = pathlib.Path(__file__).resolve().parent.parent` — derived from the *script's own file
  location* inside the AISM checkout, never from `cwd`. Running `cd <fixture-or-tree> && python3
  .../check-defs.py` therefore does **not** check the target tree; it silently re-checks the
  real AISM repo at whatever `ROOT` resolves to and produces a pass/fail unrelated to the
  intended target. Fixture and historical-tree runs must instead use the **module-import
  harness** documented in `corpus/README.md` (imports each script as a module, read-only, and
  calls its pure check functions directly with the target's paths substituted for the
  module-level `ROOT`-derived globals) — never `cd`+run.
- **`check-report-shards.sh` needs `GIT_CEILING_DIRECTORIES` pinned** when the target tree lives
  inside rk's own repo (as every M0.2 fixture, and potentially an in-repo historical-tree
  checkout, does). Its `ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"` fallback
  (check-report-shards.sh:9) resolves to **rk's own toplevel**, not the target directory, unless
  `GIT_CEILING_DIRECTORIES` is set to rk's toplevel so `git rev-parse` fails from inside the
  target and the script's own `|| pwd` fallback correctly takes over.

---

## Phase matrix (M1.3 — `rk phase exploration|consolidation`)

**Purpose.** PRD sec. 2 names two first-class phases with an explicit gated transition:
"Exploration phase: cheap, fast, lightly logged... Consolidation phase: contract-shaped claims,
eager definitions, af hard tier, generated report." The failure mode this guards against is named
explicitly in the PRD, proved by a real prior campaign (cft-anyons v1): **mandatory-everywhere
ceremony kills exploratory motion.** "Every gate binds at a promotion boundary, never on
exploratory motion." M1.3 makes that mechanical: one config field, `phase`, selects between
exactly two FIXED severity policies. There are no per-gate override flags — PRD's own resolved
question 4 settles this: "Fixed matrix; escape valve is a committed, logged config edit only. A
mis-phased gate is a template bug fixed upstream via D6." The "escape valve" is therefore a
reviewed, committed change to THIS document and the classification it drives
(`src/gates/phase.ts`) — never a runtime flag a session can flip unilaterally.

**Mechanism.** Every finding a gate constructs may carry `structural: true`
(`src/gates/framework.ts`'s `Finding.structural`). A finding is STRUCTURAL iff it belongs to one
of four classes: **parse errors**, **dependency cycles**, **duplicate ids/aliases**, or **broken
cross-shard references** — the checks that keep the underlying registry/graph itself coherent
enough for every OTHER check to even run meaningfully. Every other ERROR (the default — the field
omitted, or explicitly `false`) is completeness/provenance/freshness-class: schema fields being
filled in, byte-verification of claimed quotes, report cross-referencing, generated-file
staleness. `src/gates/phase.ts`'s `applyPhase(findings, phase)` is the ONE place that reads the
flag: in `consolidation` it is the identity function (today's behavior, byte-identical — every
pre-M1.3 fixture and test assumes consolidation and is unaffected by construction, since the
corpus runner calls `gate.run()` directly and never passes through this layer); in `exploration`
it rewrites every non-structural ERROR to WARN, appending a `[advisory in exploration phase --
would ERROR in consolidation]` clause to the message so a reader can tell a phase-demoted WARN
from an ordinary advisory one. `src/cli/check.ts` calls it exactly once per gate result, AFTER the
gate has computed its findings and BEFORE printing/counting — a demoted finding is still computed,
still printed, still counted in the coverage line's `(<E> errors, <W> warnings)` suffix (CLAUDE.md
L2: "a skip is always visible with a count" — a demotion is never a skip). The `checked`/`total`
pair in each gate's `CoverageLine` is untouched by construction: it comes from the gate's own
bookkeeping, never from `findings`, so a phase switch never changes what a coverage line's
numerator/denominator mean, only which findings block. The crash-boundary sentinel
(`src/cli/check.ts`'s `runGateSafely`, `<gate:NAME>` — "Composition" above) is itself marked
`structural: true`: a gate crashing is a defense-in-depth boundary firing, never a normal finding,
and must never silently soften in exploration.

**Default.** A `.rk/config.json` with no `phase` field, or no `.rk/config.json` at all, resolves
to **`consolidation`** (`src/gates/phase.ts`'s `DEFAULT_PHASE`) — the strictest state, and the one
every pre-M1.3 repo has always run under. CLAUDE.md L2: "a fresh clone without config must never
silently run loose." `rk phase` (no args) prints the current resolved phase; `rk phase
exploration|consolidation` writes it. The consolidation-ward transition (`exploration ->
consolidation`) is a deliberate act per PRD C1 ("The transition consolidation-> is a logged,
deliberate act"): `src/cli/phase.ts` prepends one dated entry to `docs/worklog.md` (after the
`## Sessions` heading, matching that template's own "newest first" convention) if the file exists,
and always prints a notice either way — never a silent touch of an authored doc, never a silent
skip when it is absent. Any OTHER transition (into exploration, or consolidation-to-consolidation)
is not itself "the consolidation-ward transition" and is not logged to the worklog.

**Per-gate classification.**

| gate | structural (blocks in both phases) | non-structural (demoted to WARN in exploration) | rationale |
|---|---|---|---|
| **Gate 1 — defs** | Check 1 (frontmatter parse), Check 2 (malformed line), Check 3's `id` sub-check + Check 4 (`id`==stem — a shard's own cross-referenceable identity), Check 7 (DRIFT: duplicate term/alias) | Check 3's `term`/`kind`/`status` sub-checks, Checks 5-6 (enum validity), Checks 8-9 (cited source/sha256 required+valid), Check 12 (consensus/original missing `consensus:`) | id/parse/dedup keep the term namespace addressable; field completeness and cited-provenance are exactly PRD's "lazy convention-fixing" / "L5 soft verification" exploration allowances |
| **Gate 2 — argument/linker** | Check 1 (frontmatter parse), the missing-`id:` crash-to-finding [F12], Check 2 (`id`==stem), Check 2a (duplicate id [rk-sj6]), Check 2b (malformed frontmatter line [rk-wc3]), Check 6 (cycle), Check 7 (unknown dep/route-member/def id) | Checks 3-5 (kind/status/af enum + the missing-`kind:` fix [rk-aft]), Check 8 (status propagation / rigour ladder), Check 9 (contract match), Check 10 (orphans), Check 11 (generated freshness), Check 13 (critical-path provenance, M3.8), Check 14 (L5 promotion, M3.8) | id/parse/cycle/broken-ref keep the DAG itself coherent; the rigour ladder and contract-drift are explicitly consolidation-phase concerns (PRD: "af hard tier", "contract-shaped claims"); freshness is the named freshness class; critical-path provenance and L5 promotion are likewise consolidation-weight validity/status concerns over an af-validated claim, not DAG-coherence structural checks |
| **Gate 3 — refs** | Check 5 (unparseable JSON), the non-object-JSON crash-to-finding (`refs-08` class) | Check 2 (payload existence), Checks 3-4 (normalization + whole-quote match) | a corrupt external cannot be reasoned about at all in either phase; byte-verifying a claimed quote is PRD's named "L5 soft verification only" exploration allowance — the anti-fabrication gate is deliberately soft during exploration and hard again at consolidation, never removed |
| **Gate 4 — provenance** | (none) | all checks (1-9) | the entire gate cross-references a generated report — PRD names "generated report" as a Consolidation-phase artifact only; during exploration there is typically no report yet to cross-reference against |
| **Gate 5 — runs** | (none) | all checks (1-6) | run-bundle lab-notebook discipline is PRD's "lightly logged" exploration allowance verbatim; still computed/reported as WARN so the discipline stays visible, just not blocking |
| **Gate 6 — report-shards** | (none) | all checks (1-20) | the sharded LaTeX report is, like Gate 4, a Consolidation-phase-only artifact per PRD; this includes the M1 `shardsPrefix` config-missing ERROR (below) — during exploration there is no report to shard yet, so an unset prefix is not yet a blocking concern either |
| **Gate 7 — freshness** (M2.6) | (none) | manifest-malformation findings, per-entry STALE, per-entry declared-but-missing | mirrors Gate 2 Check 11's own reasoning exactly, generalized from one hardcoded pair of files to any declared generator: a stale or missing generated artifact is a build-output/completeness-class defect — the underlying registry itself is still fully coherent — never a break in DAG structure. Classified WHOLE-GATE non-structural for the same reason Gates 4-6 are: the subject matter (a repo's own adopted generated-output convention) is consolidation-shaped by construction, not a per-check carve-out |

Gate 6's own `Check 11` (duplicate `SHARD-ID`) formally resembles the structural "duplicate
ids/aliases" class, and Gate 2's Check 12 (brittleness) and Check 15 (mandatory review, M3 review
blocker 7c) and Gate 1's Checks 10-11/13-14 are
already WARN-only in both phases (nothing to demote) — noted here so their absence from the tables
above reads as a deliberate, considered call, not an oversight: the WHOLE-GATE non-structural
classification for Gates 4-6 (and now Gate 7) is a deliberate policy choice (their subject matter
is inherently consolidation-shaped), not a per-check omission.

The synthetic `config` gate (M1, rk-xbm) is deliberately absent from this table: its one finding
class (a malformed/unknown `.rk/config.json` field) is unconditionally `structural: true` — see
"Config validation" above — because a config error changes what "structural" and "non-structural"
even MEAN for every other gate's own findings in the same run; it cannot itself be phase-demoted
without threatening to hide the exact severity-policy drift M1.3 exists to make mechanical.

**Mutation-proof discipline.** A change to this table is a validity-semantics change (CLAUDE.md
L6) — it moves a check between "always blocks" and "advisory during exploration." Any edit here
must be paired with the corresponding `structural` flag flip in the gate source (or a matrix edit
in `src/gates/phase.ts`) AND the classification tests in `test/gates/phase-classification.test.ts`
updated in the same commit; a bare doc edit with no code change (or vice versa) is incomplete work
per Rule 7.

---

## Gate 1 — defs (`definitions/*.md`)

**Purpose.** Guard the project's vocabulary against drift: no two shards may define the same
term, or silently annex each other's alias, and every `cited` definition must be traceable to a
hashed local source. "The core guard" per the script's own docstring (check-defs.py:6-7);
`definitions/README.md:9-10`: "If two places define the same concept differently, the project
drifts and is sunk."

**Failure mode guarded.** Term/alias DRIFT — two shards claiming the same name, so downstream
readers (and downstream shards) can no longer tell which definition is authoritative. No single
dated AISM incident is on record for this specific gate (it is preventive, and no drift has
actually occurred in AISM's history at time of reading); the corpus fixture for it is
class-driven, not incident-driven — record this honestly rather than inventing a source
incident.

**Inputs.**
- Glob: `definitions/*.md`, excluding `README.md`, `INDEX.md` (check-defs.py:27,80).
- Frontmatter: flat `key: value` per line, terminated by a second `---` line (check-defs.py:30-50).
  Amendment (rk-wc3, dogfood-2): a list-valued field may equivalently be written as a natural
  multi-line YAML block list — a `key:` line with an empty value followed by `- item`
  continuation lines; `parseFrontmatter` (`src/gates/snapshot.ts`) joins the items into the same
  `;`-separated value string the single-line grammar produces before any gate splits it. Applies
  uniformly to every list-valued field in every gate that consumes `parseFrontmatter`.

| field | type | required | allowed values |
|---|---|---|---|
| `id` | string | yes | must equal the filename stem |
| `term` | string | yes | canonical human name |
| `aliases` | `;`-separated string | no | alternate names/symbols, folded into the same dedup namespace as `term` |
| `kind` | enum | yes | `cited` \| `consensus` \| `original` |
| `status` | enum | yes | `draft` \| `locked` |
| `source` | string | **REQUIRED for `kind=cited`** (ERROR when absent — F5 reversed, M0.7) | a `refs/manifest/SOURCES.md` source-id, or `internal` |
| `locus` | freeform string | documented, **not machine-checked** | where in the source (informational only) |
| `sha256` | 16-hex string or `-` | **REQUIRED for `kind=cited`** (ERROR when absent or `-` — F5 reversed, M0.7) | prefix must exist in the manifest |
| `consensus` | freeform string | for `kind∈{consensus,original}` | who agreed / where transcribed |

**`status` enum, precisely** (bead rk-cvy — undocumented before this entry, discovered dogfood-1:
a newcomer had no way to know a definition shard's `status:` uses a DIFFERENT vocabulary from
CLAUDE.md's rigour ladder, and only found out via a gate WARN):
- `draft` — this definition is still mutable; term/aliases/kind may still change without
  notice. Check 13 (below) WARNs on every `draft` shard as a standing reminder, not a defect.
- `locked` — this definition is frozen; downstream result shards (Gate 2's `defs:` field) may
  rely on its `term`/`aliases`/`kind` staying fixed.

**Relation to the rigour ladder (PRD §5).** Definition shards are never `proved` — PRD C2 Layer 0
states plainly that "definitions are never 'proved'"; the rigour ladder
(`cited|proved|consensus|proved-mod-audit|stated|conjecture|heuristic|numerical|open|obstruction|
disproved`) is a Layer 1 (result-shard) concept only, checked by Gate 2's `status` field, not this
one. `draft`/`locked` is a MUTABILITY flag on a term's definition text, not an evidence-strength
level — the two enums are deliberately disjoint namespaces on two different layers, not two
options within one status vocabulary.

Config: `manifest_path = refs/manifest/checksums.sha256` (check-defs.py:149); `SKIP =
{README.md, INDEX.md}` (check-defs.py:27).

**Checks.**
1. Frontmatter present and terminated ⇒ ERROR otherwise (check-defs.py:85-86).
2. A frontmatter line without `:` ⇒ ERROR per line (check-defs.py:45-46).
3. Required fields (`id`,`term`,`kind`,`status`) present ⇒ ERROR per missing field (check-defs.py:88-90).
4. `id == filename stem` ⇒ ERROR otherwise (check-defs.py:91-92).
5. `kind ∈ {cited, consensus, original}` ⇒ ERROR otherwise (check-defs.py:93-94).
6. `status ∈ {draft, locked}` ⇒ ERROR otherwise (check-defs.py:95-96).
7. **DEDUP/DRIFT**: `term` + every `alias` (lower-cased) forms one global name namespace across
   all shards; a name claimed by two different shards ⇒ ERROR `DRIFT: name '<nm>' claimed by
   both <a> and <b>` (check-defs.py:98-107).
8. `kind=cited`: `source` is **REQUIRED** ⇒ ERROR `cited shard missing required 'source:'`
   if absent/empty (**F5 reversed, rk amendment, M0.7** — AISM's own check-defs.py:112-115
   validates `source` only `if src`, never requiring it; see Divergences below). When `source`
   is present, it must be a known refs/ source-id, checked only when the manifest yielded at
   least one source-id ⇒ ERROR `cited source '<source>' not a refs/ source-id` otherwise
   (check-defs.py:112-115, value-validation logic ported unchanged).
9. `kind=cited`: `sha256` is **REQUIRED** ⇒ ERROR `cited shard missing required 'sha256:'` if
   absent/empty (absent, or bare `-`, both count as missing) (**F5 reversed, rk amendment,
   M0.7** — AISM's check-defs.py:116-118 validates `sha256` only `if sha and sha != "-"`, never
   requiring it; see Divergences below). When present and not `-`, `sha256` must resolve as a known prefix
   in the manifest, checked only when the manifest is non-empty ⇒ ERROR `sha256 prefix '<sha>'
   not in refs manifest` otherwise (check-defs.py:116-118, value-validation logic ported
   unchanged).
10. `kind=cited`: `sha256` resolves in the manifest but the resolved path is not under
    `source/` ⇒ WARN (mismatch between claimed source and file path) (check-defs.py:119-122).
11. `kind=cited`: `sha256` resolves but the payload file is absent on disk (gitignored) ⇒
    WARN, never ERROR (check-defs.py:123-124).
12. `kind ∈ {consensus, original}`: `consensus:` field must be present ⇒ ERROR otherwise
    (check-defs.py:125-127).
13. `status=draft` ⇒ WARN "not yet consensus-gated" (check-defs.py:128-129).
14. Manifest file absent entirely ⇒ WARN "cannot verify cited hashes"; checks 8–9 become
    no-ops in this case (guarded by `and source_ids` / `and prefix2path`) (check-defs.py:57-59,114,117).

**Known limitations / incident history.**
- Checks 8–9's *value-validation* sub-checks (does `source`/`sha256` resolve against the
  manifest) silently no-op (not ERROR, not even counted as unverified) when the manifest is
  absent or empty — on a fresh clone with nothing fetched into `refs/` yet, a fabricated
  `source`/`sha256` on a brand-new `cited` shard passes value-validation with only the one
  generic WARN "manifest absent", no count of how many cited claims went unverified. This is the
  same *shape* as the refs gate's 19/19 false-green (a checker that verifies nothing while
  reporting green) at smaller scale; the port's coverage line must make the count visible (see
  Divergences). Note this is orthogonal to the presence requirement below: presence is checked
  unconditionally, regardless of manifest state.
- **AISM's own `source`/`sha256` are NOT required fields for `kind=cited`** — contrary to what a
  naive reading of the frontmatter table might suggest, AISM's `REQUIRED =
  ["id","term","kind","status"]` (check-defs.py:26) never includes them, and its checks 8–9 only
  run `if src`/`if sha` — an AISM `cited` shard carrying **neither** `source:` nor `sha256:`
  triggers no error and no warning from either check (check-defs.py:112-118). This is now a
  **triaged divergence** (see Divergences below): rk's contract requires both fields for
  `kind=cited` (checks 8–9, above); AISM's script does not. Triage: **rk-stricter-intended**,
  zero cost — AISM currently has **zero** real `cited` shards in its registry (spot-checked at
  time of writing; `definitions/README.md`'s `kind: cited` line is documentation prose, excluded
  from the glob, not a real shard), so the tightening cannot flip any existing AISM shard's
  verdict. Corpus fixture `defs-15` (source: and sha256: both absent on a cited shard) is now
  contract-backed and M0.3-enforceable.
- `check-defs.py` has **no staleness check** on its own generated `definitions/INDEX.md`: the
  script only *writes* `INDEX.md` under `--generate-index`; in `--check` mode it never compares
  an existing `INDEX.md` to a fresh render (contrast argument.py's `check_generated`, which does
  exactly this for `argument/INDEX.md`/`DAG.md`). A hand-edited `definitions/INDEX.md` is
  **not caught by this gate today**. This is a genuine asymmetry in AISM's own characterized
  behavior — recorded here, not silently fixed. The "hand-edited generated file" corpus fixture
  (IMPLEMENTATION_PLAN M0.2, mandatory) is therefore assigned to the **linker** gate, where the
  equivalent check genuinely exists — see linker fixture `linker-16`. Flagged for
  Fable/orchestrator: whether `rk` should close this specific gap with a new check is a
  deliberate decision for a later WP, not this one.
- No historical DRIFT incident is on record in AISM (see Failure mode guarded, above).

**Divergences from AISM (triage).**
- **[rk-stricter-intended] `source`/`sha256` REQUIRED for `kind=cited`** (F5 reversed, M0.7) —
  checks 8–9, above; AISM's check-defs.py:112-118 validates both fields only when present, never
  requiring them. Zero cost: AISM has zero real `cited` shards at time of writing (see Known
  limitations). Fixture: `defs-15`.
- **[message-only]** Coverage line adds an explicit cited-hash sub-count: `checked defs:
  <N>/<N> shards, <C>/<K> cited shards hash-verified` whenever `K > 0`; when the manifest is
  absent/empty this renders as `0/<K> cited shards hash-verified — manifest absent`. CLAUDE.md
  L2's mandatory coverage reporting — AISM's single WARN sentence (check-defs.py:58) carries no
  count, so a reader cannot tell "we checked 0 of 12 cited shards" from "there are no cited
  shards." No check's trigger condition or verdict changes; this only makes an existing no-op
  visible.
- **[message-only]** Standard cross-gate finding-format change (see Shared conventions); no
  check's trigger condition changes.

**Historical schema-drift tolerance.** No frontmatter field was added to the defs schema
mid-campaign in AISM history at time of reading (`id`/`term`/`kind`/`status`/`source`/`locus`/
`sha256`/`consensus` are all present from the schema's first commit, per `definitions/README.md`).
N/A for this gate; nothing to tolerate.

**Corpus fixtures required** (feeds M0.2):

| id | violation |
|---|---|
| `defs-01` | missing/unterminated frontmatter |
| `defs-02` | frontmatter line without `:` |
| `defs-03` | missing required field (parametrize over id/term/kind/status) |
| `defs-04` | `id` != filename stem |
| `defs-05` | `kind` not in the allowed set |
| `defs-06` | `status` not in the allowed set |
| `defs-07` | **duplicate alias** [PLAN-mandated] — two shards claim the same term/alias (DRIFT) |
| `defs-08` | `cited` shard, unknown `source` |
| `defs-09` | `cited` shard, `sha256` not in manifest |
| `defs-10` | `cited` shard, `sha256` resolves under a different source (WARN) |
| `defs-11` | `cited` shard, payload absent locally (WARN) |
| `defs-12` | `consensus`/`original` shard missing `consensus:` |
| `defs-13` | `status: draft` baseline (WARN, golden non-error case) |
| `defs-14` | manifest file entirely absent (WARN, and checks 8–9 coverage count reads `0/K`) |
| `defs-15` | **F5 reversed** [M0.7] — `cited` shard, `source:` and `sha256:` BOTH entirely absent ⇒ ERROR (AISM's script passes this silently, check-defs.py:112-118) |

---

## Gate 2 — argument / linker (`argument/**/*.md`, recursive)

**Purpose.** The linker for Layer 1 (the module graph): enforces acyclicity, import
resolution, contract match between the registry and the af proof, rigour-ladder-respecting
status propagation, a brittleness signal, and orphan detection between the registry and
`proofs/` (argument.py:1-14; `argument/README.md:7-12`, "each result is a *module* ... the
linker ... enforces the contracts").

**Failure mode guarded.** The general project failure mode — "a confident, plausible,
WRONG-or-overclaimed result" (AISM `CLAUDE.md:34`) — made mechanical at the DAG layer: a
non-rigorous or drifted foundation silently supporting a claim marked `af: validated` (status
propagation), or a registry `contract` diverging from what the af workspace actually proved
(contract drift). **Real incident**: the brittleness-threshold drift (aism-s64) —
`argument.py`'s REFACTOR warning threshold (12 nodes) diverged from `af-orchestrate.py`'s
balloon-abort cap (40 nodes) while actual af-validated trees in AISM ran 14–52 nodes, so the
linker "cried REFACTOR on ~20 perfectly healthy validated trees" (`af_constants.py:5-10`),
burying the signal in noise. Fixed by hoisting both to one shared constant,
`af_constants.NODE_SOFT_CAP = 26`.

**Inputs.**
- Glob: `argument/**/*.md`, RECURSIVE — every depth under `argument/` (amended 2026-07-18, bead
  rk-9pk; see Divergences below — AISM's own glob is `argument/lemmas/*.md`,
  argument.py:131-133). **Exclusions**: a file whose BASENAME is exactly `README.md`, `INDEX.md`,
  or `DAG.md`, at ANY depth, is treated as non-shard documentation/mirror content and never
  parsed as a shard. Every OTHER `.md` file under `argument/` MUST parse as a shard — a file with
  no YAML frontmatter, or with frontmatter but no `id:` line, is a parse ERROR exactly as any
  other malformed shard (Checks 1-2 below); it is never silently skipped. Prose that is not a
  shard belongs in a `README.md`, not a bare `.md` file under `argument/`.
  - **Coverage line.** The linker gate's one `CoverageLine` names both the shard count and the
    exclusion count explicitly, unconditionally (never omitted, even at zero — CLAUDE.md L2):
    `checked linker: <checked>/<total> lemma shards (<K> non-shard files ignored[: <names>]); mirrors: ...`.
    `<names>` is the sorted list of excluded files' paths RELATIVE TO `argument/` (so a root-level
    `argument/README.md` reads as `README.md`, and a nested `argument/lemmas/README.md` reads as
    `lemmas/README.md` — disambiguating same-basename files at different depths without full
    repo-relative paths). Example: `checked linker: 3/3 lemma shards (2 non-shard files ignored:
    README.md, INDEX.md); mirrors: INDEX absent (not adopted), DAG absent (not adopted)`.
- Frontmatter (`argument/README.md:22-38`, argument.py:106-124):

| field | type | required | allowed values / notes |
|---|---|---|---|
| `id` | string | yes | `lem-\|thm-\|prop-\|cor-\|op-\|obs-<slug>` convention (not machine-enforced beyond the stem check); must equal filename stem |
| `kind` | enum | yes | `lemma` \| `proposition` \| `theorem` \| `corollary` \| `open-problem` \| `obstruction` |
| `contract` | freeform, one line | yes (by convention; not required-field-checked) | the canonical statement; anti-drift invariant vs. the af root conjecture |
| `defs` | `;`-list of `definitions/` ids | no | resolved against `definitions/*.md` |
| `deps` | `;`-list of registry ids | no | unconditional prerequisites (DAG edges) |
| `routes` | OPTIONAL structured field | no | grammar `[a; b] \| [c]` — see below; absent ⇒ `[]` |
| `status` | enum | no (defaults absent) | `proved\|cited\|consensus\|open\|obstruction\|disproved\|stated\|proved-mod-audit\|conjecture\|heuristic\|numerical` |
| `af` | enum | no, defaults `none` | `none\|seeded\|validated` |
| `provenance` | freeform | no | not parsed here — see the **provenance** gate |
| `owner` | freeform | no | not validated |
| `workspace` | string | no (but load-bearing) | `proofs/<id>` path; used by orphan/contract/brittleness checks |

`routes:` grammar (argument.py:68-90, `aism-3ne`): each bracketed group is one route (a
*conjunction* of its members); groups are separated by `|` (the *disjunction* — any one route
suffices). A shard may carry `deps:` and `routes:` together; `deps` are required under every
route. `all_dep_ids(l) = deps ∪ (∪ routes)` is the edge set used for acyclicity and the
conservative ancestor/descendant closures (argument.py:93-103).

Multi-line list amendment (rk-wc3, dogfood-2): each `;`-list field above (`defs`, `deps`, and
`routes` where its value is a plain list) may equivalently be written as a natural multi-line
YAML block list:

```
deps:
  - id-one
  - id-two
```

`parseFrontmatter` (`src/gates/snapshot.ts`) joins the `- item` continuation lines of an
empty-valued key into the same `;`-separated value string the single-line grammar produces,
before the field-owning gate ever splits it — so both forms are byte-equivalent downstream. A
`- item` line NOT preceded by an empty-valued key remains genuinely malformed (Check 2b below).
Incident: dogfood-1's three argument shards used the multi-line style and pre-fix parsed to an
EMPTY `deps` with zero diagnostic — the DAG/unknown-id checks validated an edgeless graph while
reporting `3/3 ... 0 errors` (bead rk-wc3; fixtures `linker-29`/`linker-30`).

Config: `NODE_THRESHOLD = af_constants.NODE_SOFT_CAP = 26` — **per-repo parameter**, no depth
check (af_constants.py:19; argument.py:61; confirmed by `check_brittleness`'s signature, which
takes only `nodecounts`, never a depth argument — `argument/README.md:80-81`'s "depth>3" prose
is stale against the code and must not be treated as ground truth).

**Checks.**
1. Frontmatter present ⇒ ERROR if missing/unterminated (argument.py: `_parse_frontmatter`
   returns `None`; parse_registry:136-137).
2. `id == filename stem` ⇒ ERROR (argument.py:139-140).
2a. **Duplicate id** (rk-sj6, M1 review B3) — two shards, at any two paths under `argument/`,
   declaring the same `id` ⇒ structural ERROR `duplicate id '<id>': claimed by both <path1> and
   <path2>`, emitted at the parse boundary the moment a second file claims an already-registered
   id (rolling id→path owner map, same shape as Gate 1's DRIFT `aliasOwner`). Duplicate ids are
   one of the four structural classes named in the per-gate classification above. Both shards
   still register (Gate 1 DRIFT precedent: flag, never silently exclude) so every other check
   still runs against both; the structural ERROR itself blocks the run. AISM comparison:
   `parse_registry` (argument.py:127-148) has no duplicate-id check at all — downstream id-keyed
   dicts silently collapse to whichever file traverses last. Fixture: `linker-28`.
2b. **Frontmatter line without `:`** (rk-wc3, dogfood-2) — a line inside a terminated
   frontmatter block that is neither `key: value` nor a valid multi-line list continuation (see
   the multi-line list amendment under Inputs) ⇒ one structural ERROR per `fm.malformedLines`
   entry, `frontmatter line without ':'` — identical message and classification to Gate 1
   Check 2, which Gate 2 previously never read at all. AISM comparison: `_parse_frontmatter`
   (argument.py:106-124) silently skips any colon-less line with zero diagnostic. Fixture:
   `linker-30`.
3. `kind ∈ KINDS` ⇒ ERROR (argument.py:141-142).
4. `status ∈ MATH_STATUS` ⇒ ERROR (argument.py:143-144).
5. `af ∈ {none, seeded, validated}` ⇒ ERROR (argument.py:145-146).
6. **Acyclic** — DFS over `all_dep_ids` (union of `deps` + every route's members) ⇒ ERROR
   `cycle detected: a -> b -> ... -> a` (argument.py:153-176). A cycle hidden in *any* route
   counts.
7. **Imports resolve** — every `dep` and every route member must be a known registry id ⇒
   ERROR per unknown id (argument.py:179-190); every `def` must be a known `definitions/` id ⇒
   ERROR (argument.py:191-193).
8. **Status propagation** — `af: validated` requires every unconditional `dep` **available**
   (`af=validated` OR `status=cited`) **and** (no `routes`, or at least one route's members
   *all* available) ⇒ ERROR listing the unmet deps (argument.py:197-236, esp. 220-229). This is
   the mechanical form of the rigour ladder: a validated result can never rest on a
   non-rigorous dep.
9. **Contract match** — for every shard with `af != none` and an introspectable af workspace,
   `normalize(af_root_statement) == normalize(registry.contract)` ⇒ ERROR "contract drift"
   otherwise (argument.py:239-248, 684-690). Introspection is a no-op (silently unable to
   check) when `af` or the CLI is unavailable, or the workspace field/dir doesn't resolve — see
   Known limitations.
10. **Orphans** — a shard with `af != none` whose `workspace` value is not among the scanned
    `proofs/*` dirs (a dir containing a `ledger` subdir) ⇒ ERROR "workspace dir missing: <ws>";
    a scanned `proofs/<ws>` dir declared by no registry shard ⇒ ERROR "orphan workspace"
    (argument.py:262-273, 517-521).
11. **Generated freshness, PRESENCE-CONDITIONAL per file** (amended 2026-07-18, R14, bead
    rk-1rv) — checked independently for `argument/INDEX.md` and `argument/DAG.md`: a file present
    in the repo must byte-equal a fresh render of the current shard set (checked only when not
    running with `--generate`) ⇒ ERROR "... is STALE" (argument.py:632-642, 698-701), unchanged
    from the pre-amendment contract. A file ABSENT from the repo is read as "the markdown-mirror
    convention has not been adopted here" — never a finding — because these two files are AISM's
    transitional view format, superseded by the M2.4 HTML render and M2.6's regenerate-and-diff
    gate (`docs/memos/2026-07-18-aism-residue-audit.md` R14); a general research tool must not
    force every repo to hand-generate AISM's own markdown mirror just to pass `rk check`. Each
    file's adoption status (`present` / `absent (not adopted)`) is named explicitly in the
    linker gate's coverage line — `checked linker: <N>/<M> lemma shards (<K> non-shard files
    ignored[: <names>]); mirrors: INDEX <status>, DAG <status> (...)` — so non-adoption is always
    visible, never a silent skip (CLAUDE.md L2).
    Fixture: `linker-25` (both absent, golden pass); `linker-16` (INDEX present and stale still
    ERRORs, unchanged).
12. **Brittleness** (WARN only, never blocks the gate) — an af workspace's node count `>
    NODE_THRESHOLD` (default 26) ⇒ WARN `REFACTOR: <ws> has <n> nodes (><cap>) — factor <id>
    into sub-lemmas` (argument.py:251-259, boundary confirmed by AISM's own test suite:
    exactly 26 does not warn, 27 does — `scripts/tests/test_argument.py:107-108`).
13. **Critical-path provenance** (M3.8, `src/gates/linker-crossvendor.ts`) — PRD C2/C9's
    cross-vendor rule, the CONTINUOUS half (the apply-time half lives in
    `src/drive/cross-vendor.ts`, checked before an af `accept` item is ever written — see below).
    Presence-conditional on `config.northStarId` (M2.5's own "no default" contract): absent ⇒
    zero findings, named on the coverage line, never a silent guess at which registry id is the
    north star. **Fail-closed on an UNRESOLVED north star** (2026-07-19 M3 review, blocker 5d): a
    `northStarId` that IS configured but resolves to no registry node is a hard misconfiguration
    ⇒ ERROR (`path: .rk/config.json`), never a silent pass. Previously an unresolved north star
    yielded an empty critical set that checked nothing and (in the batch composer) permitted every
    batch; the operator asked for critical-path enforcement against a specific id, so if that id
    cannot be resolved the guarantee cannot be established and the check fails closed. (The distinct
    "no `northStarId` at all" case above stays silent — a deliberate no-opinion state, not a broken
    one.) When configured AND resolvable, every shard on the critical path to the configured north star
    (`src/graph/query-path.ts`'s `computeCriticalPath`, the same over-inclusive OR-route closure
    M2.5/M3.4 already use) with `af: validated` and an introspectable, currently-validated af
    workspace is checked against its root node's identity provenance
    (`src/gates/linker-workspace.ts`'s `introspectRootIdentity` — the SAME direct-ledger read
    path `introspectWorkspace` already uses for contract/node-count, since this gate is pure and
    may not shell out to `af export`):
    - `validationBatchId` present ⇒ **ERROR** (2026-07-19 M3 review, blocker 5c), independent of
      family — PRD C3's critical-path exclusion says a load-bearing node must NEVER be
      batch-validated; a batch id here is a structural exclusion violation, no longer a mere
      warning. The ONLY downgrade is an explicit, reviewed `legacy-same-family` marker (atomic
      token, see cutover semantics below), which acknowledges the legitimate case C2 names — a
      batch that validated the node BEFORE it became load-bearing — ⇒ WARN. Genuinely-old batched
      data is thus grandfatherable but never silently, and a fresh batch validation on a
      load-bearing node fails closed.
    - **Cutover semantics** (decided here, normative; HARDENED by the 2026-07-19 M3 review,
      blocker 5a/5b): both `author` and `validatedBy` are run through `src/drive/identity.ts`'s
      `decodeVerifierSeam` (never a bespoke parse). If BOTH sides decode and the two `modelFamily`
      values are EQUAL (POST-convention same-family) ⇒ ERROR. If EITHER side fails to decode, or
      `validatedBy` was never recorded at all (an unparseable/absent identity) ⇒ **also ERROR,
      failing closed** — "legacy" is NO LONGER inferred from an unresolvable identity, because
      that inference let a new same-family result evade enforcement simply by using free text
      instead of the seam. BOTH the same-family ERROR and the unparseable-identity ERROR are
      downgraded to WARN (grandfathered, never demoted) IFF the shard's frontmatter `provenance:`
      field carries `legacy-same-family` as an **atomic, semicolon-delimited token** — the field
      is split on `;`, each token trimmed, and an EXACT `legacy-same-family` token required. This
      is a reviewed administrative grandfathering mark, never a substring match: `not-legacy-same-family`
      or `legacy-same-family-x` contain the literal but are NOT the token and never grandfather
      (Gate 4 remains the owner of `provenance:`'s own "report `<label>`" grammar). Sanctioned
      shape: `provenance: report lem:x; legacy-same-family`. Different families ⇒ satisfied, no
      finding. Stated as one line: **an unresolvable-or-same-family identity on a load-bearing node
      is an error, unless an explicit atomic `legacy-same-family` token grandfathers it.** This is
      the split the brief calls for between the two enforcement points: the apply-time check
      (below) fails closed on an unresolvable identity when minting a NEW validation event; this
      continuous check now ALSO fails closed retrospectively, but still honors PRD C9's standing
      directive ("existing results validated under the old same-family regime... are not demoted")
      via the explicit opt-in marker rather than by silently inferring legacy from missing data.
    - Coverage is folded into Gate 2's one coverage line as
      `critical-path provenance: <checked>/<criticalPathSize> checked` (or
      `no north star configured` / `configured north star not found in registry`).
14. **L5 promotion** (M3.8, `src/gates/linker-l5.ts`) — `src/drive/l5-promote.ts`'s
    `stated`→`proved-mod-audit` promotion query (M3.7's L5 verdict store), wired into Gate 2 per
    that module's own header ("wiring this into Gate 2 is EXPLICITLY M3.8's job"). Reads
    `.rk/l5-verdicts.jsonl` straight off the snapshot's already-loaded text map (`.rk` is included
    one level deep, the same mechanism Gate 7 relies on for `.rk/generated.json`) — presence-
    conditional: the file's total absence is a legitimate state (a campaign that has never
    dispatched an L5 review) ⇒ zero findings, named on the coverage line as `L5 store: absent (no
    promotions)`, never an ERROR. When present, every `status: stated` shard is queried via
    `promotionStateFor` against its current hash (`fileSha256`, the same raw-bytes sha256 domain
    `l5ContentHash` is pinned to, docs/worker-contract.md section (f)) ⇒ a fresh `VALID` verdict
    produces a non-blocking WARN, `L5 promotable: '<id>' has a fresh VALID L5 verdict... status is
    still 'stated'`. For a `stated` shard this is a STATUS-COMPUTATION INPUT only: it never rewrites
    the shard's frontmatter (Gate 2 is a checker, not a mutator) and it never feeds `checkStatus`'s
    availability predicate (`proved-mod-audit` is not `rigorous` per PRD §5's ladder table), so a
    stated shard's promotability has zero bearing on any OTHER check — it is purely an informational
    nudge. For a `stated` shard, stale / `INVALID` / `VALID-WITH-CORRECTION` (correction-pending,
    rule (g)) verdicts all produce no finding at all — "not yet promotable" is a silent, legitimate
    state, not a defect.
    - **Store-integrity poisoning** (2026-07-19 M3 review, blocker 6): the store is first checked
      for health via `src/drive/l5-store.ts`'s `l5StoreHealthy` — ZERO parse issues (no truncated,
      garbage, or blank lines) AND an intact append-only ordinal chain (record i in file order
      carries ordinal i: 0,1,2,…, strictly increasing, unique, contiguous — `assessL5OrdinalChain`
      catches duplicates, gaps, reorders, and a truncated prefix). A single corrupt line makes the
      WHOLE store untrustworthy (a truncated line's own `itemId` is unknowable, so it could belong
      to any shard — precisely how an earlier `VALID` could survive a later truncated `INVALID`).
      An unhealthy store ⇒ **ERROR** (`path: .rk/l5-verdicts.jsonl`), promotion POISONED (no `stated`
      shard is nudged, no `proved-mod-audit` shard can be confirmed) — no longer the pre-review WARN
      that merely degraded coverage. The writer (`src/drive/l5-store-io.ts`'s `appendL5Verdicts`)
      likewise REFUSES to append through a corrupt store, writing nothing.
    - **Continuous re-validation of already-promoted shards** (2026-07-19 M3 review, blocker 6b):
      Check 14 no longer queries only `stated` shards. Every `status: proved-mod-audit` shard is
      re-queried via `promotionStateFor` against its current hash; if the current L5 state is
      anything other than `promotable` — edited-to-stale, `INVALID`, correction-pending, OR no
      supporting verdict at all (`no-verdict`; `proved modulo audit` is the L5 soft-tier outcome, so
      a promoted shard with no L5 backing is unsupported) — it is an **ERROR** naming the reason and
      calling for demotion/re-verification. A promoted label the history no longer supports is a
      false validity claim, not a silent state. (Presence-conditional: a repo with NO L5 store at
      all cannot be re-validated this way — tracked as a follow-up bead.)
15. **Mandatory review** (WARN only, never blocks the gate; M3 review blocker 7c,
    `src/gates/linker-graph.ts`'s `checkMandatoryReview`) — surfaces the SAME
    `isMandatoryReview` threshold `src/drive/driver-balloon.ts`'s `routeBalloon` uses to route a
    balloon event: `l.balloons.count >= 2` (a REPEAT balloon on this contract) OR
    `l.balloons.classifications.includes("genuine-gap")` (a first balloon already classified as a
    genuine gap, never merely `missing-fact`/`dag-dep` on a first occurrence) ⇒ WARN
    `MANDATORY-REVIEW: <id> has ballooned <n> time(s) (classifications: <list>) — the contract's
    hypotheses are suspect, review before further decomposition`, one per qualifying shard. The
    counter itself is read from the shard's OWN persisted `balloons:`/`balloon_classifications:`
    frontmatter (`src/gates/linker-parse.ts`, threaded through `Lemma.balloons` since commit
    7ede34c) — the routing decision is never persisted (`driver-run.ts`'s `handleBalloon` marks
    every balloon event, mandatory-review or not), so this check reconstructs the threshold purely
    from the durable counter rather than trusting a stored verdict. Commit 7ede34c added
    `checkMandatoryReview` itself plus the board-facing render flag (`⚠MANDATORY-REVIEW` on
    `argument/INDEX.md`/`DAG.md` rows, `linker-render.ts`) but left the check unwired from
    `linkerGate` — a shard past the threshold rendered the board flag yet produced no gate
    finding at all, the exact "state visible on the board but never checked" gap CLAUDE.md L2
    forbids. This wiring closes that gap: `checkMandatoryReview(lemmas)` is now spread into
    `linkerGate`'s findings array alongside `checkBrittleness` (Check 12), same WARN tier, same
    "informational nudge, not a validity violation" footing. `aism_behavior: class-driven (no
    AISM counterpart — AISM's `argument.py` has no balloon-routing or classification concept at
    all; the balloon/classification machinery is rk's own M3 addition, orphaned pre-7c the same
    way L5 promotion was pre-M3.8)`. Fixture: `linker-43`.

Not part of the pass/fail contract, but present in AISM's `argument.py` surface and worth
noting so M0.3 doesn't accidentally scope it in as a *check*: the ready-frontier/blocked-set
computation, `--show`/`--closure-min` local maps, and `--sync-beads` mirroring are CLI/reporting
features layered on the same pure functions, not gate verdicts.

**Known limitations / incident history.**
- **aism-s64** (brittleness-cap drift): documented above; the fix hoisted both consumers (the
  linker and `af-orchestrate.py`'s balloon guard) to one shared constant "so the two gates
  cannot drift apart again" (af_constants.py:6-9). rk's port must preserve that property: the
  default soft cap is defined exactly once and both the linker gate and any future balloon-style
  guard in `rk verify` (M3.6) read the same value — no per-module duplication.
- A `workspace:` field **absent** on an `af != none` shard produces no dedicated ERROR message —
  `af_introspect(l.get("workspace",""))` resolves to `ROOT/""` = the repo root, `(root/"ledger")`
  does not exist, so introspection silently returns `None` and the shard is skipped from
  contract/brittleness checks (argument.py:686-690, no error raised at that point). It IS caught
  downstream by `check_orphans`, whose `ws in ws_dirs` test against a `None` workspace value is
  always false, producing `ERROR <id>: af=<af> but workspace dir missing: None` — a real message
  quality gap (a leaked Python `None`, not an actionable path). **Real incident**: the
  2026-07-10 remediation plan found 62 of 151 shards missing `workspace:` because
  `seed-af-workspaces.py`'s `flip_af_seeded` omitted the field on every newly-elevated shard
  until fixed (`docs/plans/2026-07-10-project-remediation-plan.md` Phase 0 item 2) — a real,
  gate-breaking-on-every-elevation bug class, not hypothetical.
- `check_brittleness` itself is defensive against a missing `workspace` key on the *dict* level
  (falls back to `proofs/<id>` for the display path only, confirmed by AISM's own test
  `scripts/tests/test_argument.py:109-111`) — this is a display fallback inside the WARN
  message, not a fix for the orphan-check message above; the two code paths are independent.
- **`argument.py` crashes (uncaught `KeyError`) on a lemma shard whose frontmatter lacks `id:`
  entirely.** `parse_registry` never defaults the `id` key onto the parsed dict — it only checks
  `if fm.get("id") and fm["id"] != path.stem` (argument.py:139-140), which is a no-op when `id`
  is absent (falsy `fm.get("id")` short-circuits the whole condition, so no error is raised for
  the missing field itself), and the shard is appended to `lemmas` with no `id` key present at
  all. Every downstream pure function then indexes with `l["id"]` (bracket access, not `.get`) —
  e.g. `check_acyclic`'s `ids = {l["id"] for l in lemmas}` (argument.py:154) — so the first such
  access raises `KeyError: 'id'` and the whole script crashes rather than reporting a finding.
  All AISM shards at time of reading carry `id:` (spot-checked across the full registry), so this
  does not fire on any current or historical AISM fixture — but it is a real crash class in the
  ported logic, not a hypothetical. See Divergences.

**Divergences from AISM (triage).**
- **[message-only] Leaked-`None` message fix** — the orphan-check message for an absent
  `workspace` field becomes `ERROR <shard>: af=<af> but workspace field is absent (cannot
  resolve a workspace dir)` instead of AISM's `... workspace dir missing: None`. Identical
  trigger condition, identical ERROR verdict on identical inputs — only the message text is
  corrected to avoid a leaked `None` literal; no verdict on any fixture changes. Fixture:
  `linker-15`.
- **[crash-to-finding] A lemma shard missing `id:` produces an ERROR finding, not a crash**
  [F12]: `ERROR <path>: missing
  required field 'id' (cannot register this shard for acyclicity/status/orphan checks)`, and the
  gate continues checking every other shard and every other check rather than aborting the whole
  run. Justification: AISM has no explicit "id is required" check at all — the current behavior
  is an *accidental* crash (an unguarded `l["id"]` deep in `check_acyclic` and friends, not a
  deliberate validation) triggered by the same input (a shard with no `id:` line) that a real
  required-field check would also need to reject. The trigger condition is unchanged (a shard
  lacking `id:`); only the outcome changes, from "the whole process dies with a Python traceback"
  to "one ERROR finding is reported and the rest of the gate still runs" — the same
  trigger-preserving-fix shape as the leaked-`None` divergence immediately above. A shard rejected
  this way is excluded from every id-keyed structure (acyclicity, status propagation, orphans) for
  the remainder of the run, so no downstream check can re-crash on it. Fixture: `linker-21`.
- **[message-only]** Standard cross-gate finding-format change (see Shared conventions).
- **Check 11 becomes PRESENCE-CONDITIONAL per mirror file** (amended 2026-07-18, R14, bead
  rk-1rv — see Check 11 above for the full rule). AISM's `check_generated` (argument.py:632-642)
  treats an absent `argument/INDEX.md`/`DAG.md` as maximally stale (`have = "" if not
  path.exists()`) and ERRORs unconditionally; script-verified 2026-07-18 against fixture
  `linker-25`'s `repo/` tree via the module-import harness (`parse_registry` +
  `check_generated(lemmas, arg_dir=...)` called directly) — it reports both files STALE. This IS
  a verdict-changing divergence — a repo with neither mirror generated now passes where AISM's
  script would fail — but it is **not** triaged into the usual rk-stricter-intended / rk-bug /
  ambiguous triad: that triad exists to default an AISM behavioral gap to the *stricter* reading,
  and this change goes the other way, deliberately. The AISM behavior here IS the residue this
  bead removes (forcing every general rk repo to adopt AISM's own transitional markdown-mirror
  convention just to pass), not a stricter baseline worth preserving — the same footing as F5's
  reversal (Gate 1). Fixture: `linker-25`.
- **Shard discovery becomes RECURSIVE across all of `argument/`, not `argument/lemmas/*.md` only**
  (amended 2026-07-18, bead rk-9pk — see Inputs above for the full rule). AISM's `parse_registry`
  only ever globs `argument/lemmas/*.md` (argument.py:131-133) — the private subdirectory
  convention every AISM shard happens to live under. rk's own stamped scaffold does not create a
  `lemmas/` subdirectory (PRD.md:79-85 creates `argument/` only); a dogfood session (2026-07-18,
  real user, bead rk-9pk) wrote three result shards — including the campaign's north-star theorem
  — directly at `argument/*.md`, and `rk check` reported `checked linker: 0/0 lemma shards` with
  zero findings and exit 0: a green run over an entirely unvalidated registry, the exact
  silent-skip failure class CLAUDE.md L2 forbids. This IS a verdict-changing divergence — a repo
  with shards at `argument/` root, or nested anywhere else under `argument/`, is now discovered
  and validated where AISM's script would silently see zero shards — but it is **not** triaged
  into the usual rk-stricter-intended / rk-bug / ambiguous triad: that triad exists to default an
  AISM behavioral gap to the *stricter* reading, and this change goes the other way, widening
  discovery, deliberately. AISM's `lemmas/`-only convention is the residue of a private repo
  layout choice, not a general contract worth constraining every rk repo to — the same footing as
  R14's mirror-presence amendment (Check 11 above) and F5's reversal (Gate 1). AISM's own tree is
  unaffected: `argument/lemmas/*.md` is a subset of the new recursive scan, and AISM's `lemmas/`
  directory carries zero files named `README.md`/`INDEX.md`/`DAG.md` (spot-checked
  2026-07-18, `../almost-idempotent-stochastic-maps/argument/lemmas/`, 200 files, no basename
  collision) — the same 200 shards resolve, byte-identically, under the new rule; the three
  root-level `argument/{README,INDEX,DAG}.md` files that the recursive scan now walks past are
  excluded by name (3 ignored, named on the coverage line), never mistaken for shards. Fixtures:
  `linker-26` (root-level shards, the dogfood shape, plus a nested non-shard README ignored
  alongside a root-level one — coverage line names both); `linker-27` (a frontmatter-less stray
  `.md` at `argument/` root, not README/INDEX/DAG — parse ERROR, never a silent skip).
- **[rk-stricter-intended] Duplicate registry ids are a structural ERROR** (rk-sj6, M1 review
  B3, 2026-07-19). AISM's `parse_registry` (argument.py:127-148) has no duplicate-id check;
  both files register and every downstream id-keyed dict silently collapses to the
  traversal-last entry. rk detects the collision at the parse boundary and ERRORs, naming both
  claiming paths. Became reachable when discovery went recursive (rk-9pk): two files at
  different depths can now share a stem. Fixture: `linker-28`. See Check 2a.
- **[rk-stricter-intended] Malformed frontmatter lines are loud in Gate 2; multi-line YAML
  block lists parse** (rk-wc3, dogfood-2, 2026-07-19). AISM's `_parse_frontmatter`
  (argument.py:106-124) silently skips any colon-less line with zero diagnostic — under its
  script, a natural multi-line `deps:` list resolves to the empty list and `check_imports`
  validates nothing, reporting zero errors (dogfood-2 reproduced this exact silent-skip live).
  rk now (a) parses the multi-line block-list form into the same value the `;`-grammar
  produces (see the Inputs amendment — an acceptance widening, not a strictness change), and
  (b) ERRORs every genuinely malformed line, mirroring Gate 1 Check 2 — Gate 2 catching up to
  Gate 1's already-ratified stricter behavior, not a new rule. Fixtures: `linker-29`
  (multi-line deps with an unknown id must produce the unknown-dep ERROR), `linker-30`
  (malformed line ⇒ ERROR where AISM registers the shard clean). See Checks 2a/2b.
- **[no AISM counterpart] Critical-path provenance (Check 13) + L5 promotion (Check 14)** (M3.8,
  worktree agent-a9b12837c0ead0e82). AISM never recorded per-node author/verifier identity at all
  (`argument.py` has no concept of a "verifier family," and — confirmed by a spot-check of all 44
  AISM workspaces' ledgers — 0/44 carry a `node.author`/`node_validated.verified_by`/`.batch_id`
  field of any kind) and never had an L5 verdict store (M3.7 is rk's own addition, "orphaned in
  v1" per PRD C9). Both checks are therefore genuinely new surface, not a divergence from any
  characterized AISM behavior — `aism_behavior: class-driven (no AISM counterpart)` on every
  fixture below. The cross-vendor rule's OTHER half — apply-time enforcement, before a same-family
  accept on a load-bearing node is ever written to a verdict file — lives in
  `src/drive/cross-vendor.ts` / `src/drive/driver-run.ts`'s `verifyOneNode` (docs/worker-
  contract.md section (e)); it is NOT part of this gate and carries no corpus fixture of its own
  (it is Tier-A driver logic, covered by `test/drive/cross-vendor.test.ts` and
  `test/drive/driver-run.test.ts`'s dedicated `describe` block instead, per this codebase's
  gates-vs-drive split). Fixtures: `linker-31` (same-family POST-convention ⇒ ERROR), `linker-32`
  (no parseable seam at all, AISM's real shape ⇒ WARNING legacy-same-family), `linker-33`
  (batch-validated on the critical path ⇒ WARNING), `linker-34` (cross-family ⇒ golden pass),
  `linker-35`/`linker-36`/`linker-37` (L5 promotion: fresh VALID promotes, stale/correction-pending
  do not), `linker-38` (same-family + explicit `provenance: legacy-same-family` marker ⇒ WARNING
  not ERROR).

**Historical schema-drift tolerance.** Two fields were added mid-campaign and must be tolerated
on historical commits — load-bearing for the **M0.3 robustness run** (F4, repurposed per the
2026-07-17 Fable review addendum: this paragraph is no longer a parity bar, it is the
definition of the robustness run itself).

**The M0.3 robustness run is defined as follows.** The *candidate* under test is rk's
HEAD-contract gates (this document — not AISM's contemporaneous script versions at each
historical commit), run against each of 3 historical AISM trees (older schemas — trees
predating `routes:`/`workspace:` being added or consistently populated, see below). The
*comparison baseline* (re-pinned here; the earlier F4 rewrite dropped this sentence, leaving
"rk's HEAD-contract gates" to silently stand in for both candidate and baseline, a category
mix-up) is **AISM's own HEAD scripts** — `scripts/check-*.py` at AISM's current commit, never
the contemporaneous script version that existed at each historical commit — replayed against
the same 3 trees via the module-import harness (Shared conventions, "Fixture/harness
invocation"), never `cd`+run. Acceptance is **not verdict-parity** against that baseline or
against `check-all.sh`'s combined exit code — it is: (1) no crashes on any of the 3 trees, (2)
no finding-floods (a volume of findings that swamps genuine signal — the aism-s64 failure mode
recurring in a new form; see the operational definition below), and (3) every divergence
between rk's gates and the AISM-HEAD-on-historical-tree baseline triaged per CLAUDE.md L5
({rk-stricter-intended | rk-bug | ambiguous → escalate}). Findings are still compared
**per-gate**, not via `check-all.sh`'s single exit code, since `check-all.sh` short-circuits at
the first failing script (`fail()`, check-all.sh:7) while `rk check` always runs all six (see
Shared conventions' Composition deviation) — a per-gate comparison is the only one well-defined
under that control-flow difference, and the only one from which per-divergence triage is even
possible.

**Finding-flood, operationally defined** (N tunable; TJO): a single check emitting **more than
25 findings** on one tree, or a check **erroring on a majority of its checked units**, unless
every one of those findings/errors is attributable to a single triaged root cause (e.g. one
schema-drift field absent across every shard in an older tree, triaged once, not per-shard).
Either condition, un-attributed, fails robustness-run acceptance criterion (2) above — the same
"signal buried in noise" shape as aism-s64 (a 12-node threshold crying REFACTOR on ~20 healthy
trees), recurring at the gate-output level instead of the brittleness-check level.
- **`routes:`** — genuinely new, added 2026-07-10 (`bdf6800`, "P0 OR-route linker support
  (aism-3ne)"). A shard with no `routes:` line parses to `routes: []` and every check reduces
  byte-identically to the pre-`routes` behavior (argument.py:77-78, "backward-compatible: a
  shard with no routes behaves byte-identically to today"; `argument/README.md:61`, "A deps-only
  shard ... behaves byte-identically to before this field existed"). rk's port must preserve
  this: absence is not an error and not a warning on any historical commit predating `bdf6800`.
- **`workspace:`** — present in the schema from the very first commit (`baeaccd`, 2026-07-02;
  documented in `argument/README.md` from inception), so this is not a schema-timing drift in
  the strict sense — but it was **inconsistently populated** by tooling (the seed-script bug
  above), so historical commits legitimately contain `af != none` shards with no `workspace:`
  value. The gate's behavior on that case (ERROR via `check_orphans`, message corrected per
  Divergences above) is the correct, intended contract behavior, not a drift exemption — a
  missing `workspace:` on an `af != none` shard is a real defect in every commit where it occurs, past
  or present.

**Corpus fixtures required** (feeds M0.2):

| id | violation |
|---|---|
| `linker-01` | missing/unterminated frontmatter |
| `linker-02` | `id` != filename stem |
| `linker-03` | bad `kind` |
| `linker-04` | bad `status` |
| `linker-05` | bad `af` |
| `linker-06` | **dependency cycle** [PLAN-mandated] |
| `linker-07` | unknown `dep` id |
| `linker-08` | unknown `routes` member id |
| `linker-09` | unknown `defs` id |
| `linker-10` | `af: validated` with an unmet unconditional dep |
| `linker-11` | `af: validated`, `routes` present, no route fully available |
| `linker-12` | **contract mismatch registry↔af-root** [PLAN-mandated] |
| `linker-13` | orphan: `af != none`, declared `workspace` dir missing |
| `linker-14` | orphan: `proofs/<ws>` dir exists, no registry entry declares it |
| `linker-15` | `workspace:` field entirely absent on an `af != none` shard (real incident) |
| `linker-16` | **hand-edited generated file** [PLAN-mandated] — `argument/INDEX.md` or `DAG.md` diverges from a fresh render |
| `linker-17` | brittleness WARN at 27 nodes (just above the 26 cap) |
| `linker-18` | brittleness boundary golden case: exactly 26 nodes, no warn |
| `linker-19` | OR-route golden case: one route fully available, shard is ready (no error) |
| `linker-20` | schema-drift golden case: a `routes:`-less shard behaves byte-identically (pre-`bdf6800` regression probe) |
| `linker-21` | **missing `id:` field** [F12] — shard frontmatter has no `id` line at all ⇒ ERROR finding (AISM crashes with an uncaught `KeyError` here; rk must not) |
| `linker-22` | **`node_amended` on root node RECONCILES a contract mismatch** [rk-co2] — a later ledger amendment corrects the root statement to match the registry `contract` ⇒ check 9 (Contract match) stays clean, golden case, no drift ERROR |
| `linker-23` | **`node_amended` on root node BREAKS contract agreement** [rk-co2 companion] — inverse of `linker-22`: the root statement matches the `contract` at creation, a later amendment moves it away ⇒ check 9 (Contract match) "contract drift" ERROR still fires |
| `linker-24` | **missing `kind:` field entirely** [rk-aft, finding 3] — shard frontmatter has no `kind` line at all ⇒ check 3 ERROR "missing required field 'kind'" (AISM's enum check, argument.py:141, is a no-op when `kind` is absent — no finding, shard registers clean) |
| `linker-25` | **[R14, bead rk-1rv] mirror presence-conditional golden case** — one valid lemma shard, `argument/INDEX.md` and `argument/DAG.md` BOTH entirely absent ⇒ zero findings, coverage names both mirrors' non-adoption (AISM's `check_generated` ERRORs unconditionally on an absent mirror; rk's contract does not) |
| `linker-26` | **[rk-9pk] recursive discovery golden case, dogfood shape** — three shards directly at `argument/*.md` root (one dep chain: `lem-a` -> `lem-b` -> `thm-main`), plus `argument/README.md` and `argument/lemmas/README.md` both present ⇒ all three parse/check cleanly, coverage line reads `3/3 lemma shards (2 non-shard files ignored: README.md, lemmas/README.md)` |
| `linker-27` | **[rk-9pk] frontmatter-less stray file under `argument/` root** — a `.md` file with no `---` frontmatter block at all, named neither `README.md`/`INDEX.md`/`DAG.md` ⇒ ERROR "missing/unterminated frontmatter" (proves a non-excluded file is never silently skipped, only ever a shard or a parse error) |
| `linker-28` | **[rk-sj6, M1 review B3] duplicate registry id across recursive discovery** — `argument/lem-x.md` + `argument/nested/lem-x.md` both `id: lem-x` (each passes its own id==stem check) ⇒ structural ERROR naming both claiming paths; pre-fix both registered silently and graph checks ran on an overwritten identity |
| `linker-29` | **[rk-wc3, dogfood-2] multi-line YAML `deps:` naming an unknown id** — the natural block-list style that pre-fix parsed to an EMPTY deps list (dogfood-1's live `3/3 ... 0 errors` over an edgeless graph) ⇒ the list now parses and `unknown dep 'lem-nonexistent'` ERROR fires |
| `linker-30` | **[rk-wc3 sibling] genuinely malformed frontmatter line in a linker shard** — a colon-less line after a non-empty-valued key (not a list continuation) ⇒ ERROR `frontmatter line without ':'` (Gate 2 now reads `fm.malformedLines` exactly as Gate 1 always has; AISM registers the shard clean with zero diagnostic) |
| `linker-31` | **[M3.8] critical-path node validated POST-convention SAME-family** — `author`/`validated_by` both parse as the same `modelFamily`, no legacy marker ⇒ ERROR (Check 13) |
| `linker-32` | **[M3.8] critical-path node validated with NO parseable identity at all** — AISM's real shape (0/44 workspaces carry these fields) ⇒ WARNING `legacy-same-family`, never ERROR (Check 13, grandfathering golden case) |
| `linker-33` | **[M3.8] critical-path node validated via a BATCH** (`af verdicts apply`, cross-family so isolated from the same-family check) ⇒ WARNING naming the batch id (Check 13) |
| `linker-34` | **[M3.8] critical-path node validated CROSS-family** — golden pass, zero findings (Check 13) |
| `linker-35` | **[M3.8] `status: stated` shard with a fresh VALID L5 verdict** ⇒ WARN `L5 promotable` (the L5-promotion check, `src/gates/linker-l5.ts`) |
| `linker-36` | **[M3.8] `status: stated` shard, L5 verdict bound to a stale hash** ⇒ no promotion, zero findings |
| `linker-37` | **[M3.8] `status: stated` shard, fresh `VALID-WITH-CORRECTION`** ⇒ correction-pending, no promotion, zero findings (rule (g)) |
| `linker-38` | **[M3.8] critical-path node, same shape as `linker-31`, but shard carries `provenance: legacy-same-family`** ⇒ WARNING not ERROR (Check 13, explicit-marker escape hatch) |
| `linker-43` | **[M3 review blocker 7c] `checkMandatoryReview` wired into `linkerGate`** — a shard with `balloons: 2` + `balloon_classifications: [missing-fact, dag-dep]` (a repeat balloon) ⇒ WARN `MANDATORY-REVIEW` through the full gate (Check 15), golden pass otherwise |

---

## Gate 3 — refs (`proofs/<ws>/externals/*.json`)

**Purpose.** Byte-verify every externally-claimed VERBATIM quote against its local `refs/`
source, so an af prover cannot fabricate a quote attributed to a locus where those words do not
appear (check-refs.py:6-9).

**Failure mode guarded — THE 19/19 false-green.** Before the `aism-dbq` "UN-VACUUM" fix,
an external whose claimed `refs/` payload was absent locally (e.g. gitignored, not yet fetched
on a clean checkout) was classified as a **skip**, not a failure — so a clean checkout with zero
payloads fetched locally could report "19 externals, 0 failed, 19 skipped" and exit 0: a
fabrication gate that, per the project's own remediation plan, "verifies nothing ... and
false-greens on a clean checkout" (`docs/plans/2026-07-10-project-remediation-plan.md:51`, item
6). **The current script already contains the fix** (check 2 below): an absent payload is now a
hard FAIL, never a skip (check-refs.py:136-144, "a green run must never mean 'we couldn't
look'"). This incident is PRD C7's explicitly-named canonical regression test; the port's
mandatory fixture proves rk does not reintroduce the pre-fix behavior — not that AISM currently
has the bug.

**On the "19/19" narrative, precisely.** The remediation-plan sentence above describes the
*pre-fix code path's* behavior under analysis, not an observed clean-checkout run that actually
produced 19 skips: AISM's real historical skip verdicts on record are `skip_import` and
`skip_noquote` (imports and no-quote externals), and the absent-payload→skip hole itself was
identified by the 2026-07-10 remediation audit reading the code (item 6), then fixed in the same
session — not caught live as a false green on a real checkout. More precisely still: checks 2–4
(payload existence, normalization, longest-run match) have to date **never executed against real
AISM production data** at any point in the project's history — every external ever committed
resolves to `skip_import` (all 23 at HEAD; a full history scan finds zero externals whose
`source` text ever contained a `refs/` locus at all). The corpus fixtures below are these three
checks' only exercise; treat them accordingly, not as a "regression on live data" claim.

**Inputs.**
- Glob: `proofs/<ws>/externals/*.json` for every directory under `proofs/` (check-refs.py:168-172).
- JSON schema per external: `{"name": string, "source": string}` — only these two keys are
  read (check-refs.py:180-181); `name` falls back to the filename stem, `source` to `""` if
  absent. No stricter schema is enforced (an external with neither key is legal input, simply
  classified `skip_noquote`).
- Config: `MIN_RUN = 40` (minimum contiguous matched-character run to count as "distinctive",
  check-refs.py:40) — a hardcoded module constant in AISM, never varied across the project's
  history; carried as a fixed default in the port. In rk, `MIN_RUN` is repurposed as the
  minimum-length threshold for the ≥40-char-partial-match **FAIL** diagnostic (see Checks item 4
  and Divergences) rather than as a PASS threshold — AISM's own PASS-on-partial-match tuning
  tradeoff is documented under Known limitations below as the thing rk's divergence resolves.
- Regexes: `refs/[A-Za-z0-9_./-]+(:[\d,-]+)?` (refs-locus, line 44); `proofs/[A-Za-z0-9_-]+`
  (proofs-reference / IMPORT marker, line 46).
- **Quote extraction** (check-refs.py:63-74, `extract_quote`): prefer the double-quoted run
  immediately following the literal token `VERBATIM` anywhere in `source`, matched with `re.S`
  (so the quote may itself span newlines); if no such `VERBATIM`-anchored quote exists, fall back
  to the **longest** double-quoted run anywhere in `source` (ties are not specially broken;
  Python's `max` keeps the first of equal-length candidates). Returns the raw, un-normalized
  quote text, or `None` if `source` contains no double-quoted text at all. Fixtures `refs-02`/
  `refs-03` depend on this extraction rule for which quote is under test.
- **Locus extraction takes only the FIRST match.** `_REFS_RE.search(src)` (check-refs.py:114) is
  a single `.search`, not a global/`findall` scan — a `source` string naming two or more `refs/`
  loci is checked against the first one only; any later locus in the same string is invisible to
  this gate.

**Checks.**
1. **Classification** (check-refs.py:108-133):
   - IMPORT external — `source` contains a `proofs/` reference and **no** refs/ locus ⇒
     verdict `skip_import` (not an error: it imports a validated lemma, nothing to quote-check).
   - No extractable quote — no refs/ locus, or no double-quoted text ⇒ verdict `skip_noquote`, WARN.
   - refs-quote external — has both a refs/ locus and a quote ⇒ proceeds to checks 2–4.
2. **Payload existence** — for a refs-quote external whose `refs/<path>` file is **not** present
   on disk ⇒ verdict **FAIL**, never a skip: "refs file <fp> ABSENT — a claimed VERBATIM refs
   quote cannot be byte-verified" (check-refs.py:136-144). This is the aism-dbq fix; the 19/19
   incident is the regression this exact check guards.
3. **Normalization** (applied to both quote and refs-file text): `\$` → `$`; drop `*`; collapse
   whitespace runs to one space (check-refs.py:49-60). LaTeX command names and `$` are kept —
   fabrications differ in words, not formatting.
4. **Whole-quote match** (rk divergence from AISM's longest-run fallback — see Divergences) — the
   **entire** normalized quote must appear verbatim as a substring of the normalized refs text ⇒
   **PASS**. AISM's own logic (check-refs.py:77-98, 149-156, `longest_run_match`) instead accepts
   a PASS for quotes ≥ `MIN_RUN` (40) chars when only the longest contiguous run ≥ 40 chars
   matches, even if the whole quote does not; rk requires the whole quote to match regardless of
   quote length. When the whole quote does not match: if the quote is ≥ 40 chars **and** a
   contiguous run of ≥ 40 chars *does* match somewhere in it, the verdict is **FAIL** with the
   matched-run length reported — "claimed VERBATIM quote NOT found as a whole (best matched run:
   <n>/<m> chars) — word-level mismatch / fabrication, or a genuine quote wrapped in paraphrase";
   otherwise (no ≥40-char run matches at all, or the quote is < 40 chars) the verdict is **FAIL**
   "claimed VERBATIM quote NOT found (word-level mismatch / fabrication)" with no run length in
   the message. See Divergences for why this tightening carries zero cost, not a silent one. An
   **empty normalized quote never matches** ⇒ **FAIL**, unconditionally, before any substring or
   run comparison runs (mirrors AISM's own guard, check-refs.py:84-85, `if not qn: return False,
   None` — without it, an empty string vacuously `.includes()`-matches any refs text). This is
   the gate-level statement of the same rule `wholeQuoteMatch` enforces in code (`src/refs/
   quote.ts`); the gate must call that function rather than re-deriving the guard.
5. Unparseable external JSON ⇒ **FAIL** "unparseable JSON: <error>" — a corrupt file is a hard
   fail, never a skip (check-refs.py:174-179).

**Known limitations / incident history.**
- **The 19/19 false-green (aism-dbq)**: documented above; the mandatory regression fixture.
- **AISM's own `MIN_RUN=40` embeds a tuning asymmetry** (the thing rk's Divergences entry below
  fixes, not a limitation rk carries forward): a **short** quote (< 40 chars) is held to a
  *stricter* standard (exact whole-quote match required) than a **long** quote (≥ 40 chars),
  which passes AISM's own script if merely some 40+-char inner substring matches verbatim — so in
  AISM, a long quote's outer wording could in principle be paraphrased/fabricated around a
  genuine 40-char verbatim core and still PASS. No evidence this was ever exploited in AISM's
  history (zero refs-quote externals have ever existed to exploit it against — see the "19/19"
  discussion above); rk closes this hole rather than carrying it forward, since the fix is
  provably zero-cost — see Divergences.
- `skip_import` trusts a bare regex match on `proofs/[A-Za-z0-9_-]+` in freeform `source` text
  with **no verification** that the referenced workspace exists or is validated — an external
  could claim to "import" a nonexistent or unvalidated workspace and this gate silently skips
  it rather than failing. No historical incident on record; a real gap in the ported logic.
  **Deferred on architectural grounds** (ruling #4, 2026-07-17 Fable review addendum): closing
  it needs a registry join this gate lacks by design — `check-refs.py` (and this gate's port)
  reads only `proofs/<ws>/externals/*.json` (confirmed: it imports no other module, no registry
  parser) and has no access to the argument/linker registry's workspace-existence/status data,
  which lives in Gate 2. Not deferred for parity cost; a bd issue tracks a future cross-gate
  join if this gap is ever exploited.
- **Whitespace-class divergence, JS vs Python `\s`.** `normalizeQuoteText`'s `/\s+/g` (rk, V8's
  regex engine) and `normalize`'s `re.sub(r'\s+', ' ', s)` (AISM, CPython's `re`, Unicode-mode by
  default in Python 3) do not classify every Unicode whitespace-adjacent codepoint identically —
  e.g. U+FEFF (BOM / zero-width no-break space) sits at the boundary of each engine's whitespace
  table and the two engines need not agree on it. One line of Known-limitations, not a code fix:
  a quote or refs payload carrying one of these rare codepoints could normalize slightly
  differently between rk and AISM's script. Neither implementation performs Unicode NFC/NFD
  normalization on quote or refs text either, so composed vs. decomposed accented characters
  (e.g. `é` as U+00E9 vs. `e`+U+0301) can produce a false-RED (a genuine verbatim quote reported
  as not matching) — but identically on both sides, since neither does the normalization; this is
  a shared limitation, not an rk-introduced divergence, and is accepted as-is (no incident on
  record from either side).

**Divergences from AISM (triage).**
- **[rk-stricter-intended] Whole-quote match required (no partial-run PASS).** AISM's
  `longest_run_match` (check-refs.py:77-98) accepts a PASS for a quote ≥ `MIN_RUN` (40) chars
  when the whole quote doesn't match but some contiguous run ≥ 40 chars does; rk requires the
  whole normalized quote to match, full stop — a ≥40-char partial-run match alone is **FAIL**,
  with the matched-run length reported in the finding (Checks item 4, above). **Zero-cost
  evidence**: a full scan of every commit in AISM's history that ever touched
  `proofs/*/externals/*.json` finds **no externals JSON file whose `source` text ever contained
  a `refs/` locus** — i.e. zero refs-quote externals have ever existed in this project (every
  external, at every commit, is `skip_import`, `skip_noquote`, or parse-invalid). This
  tightening therefore cannot flip any historical or current AISM fixture from PASS to FAIL; the
  M0.3 robustness run (see the linker gate's Historical schema-drift tolerance section) is
  unaffected by construction, not merely by inspection. Fixture: `refs-07` (a ≥40-char verbatim
  core wrapped in paraphrase).
  **`...`-splice caution**: a *legitimate* quoting convention that splices together two
  non-adjacent verbatim spans with an ellipsis (`"first span ... second span"`) would also FAIL
  whole-match under this rule, since the ellipsis text itself does not appear in the refs file.
  No such spliced quote exists anywhere in AISM's history (consistent with zero refs-quote
  externals ever existing); a bd issue is filed for a future splice-aware grammar (segment-wise
  whole-match around `...` boundaries) only if a future repo actually needs one — not built
  speculatively here.
- **[message-only]** Coverage line reports a four-way breakdown: `checked refs: <P>/<T>
  externals byte-verified, <F> failed, <I> import-skipped, <Q> no-quote-skipped` — instead of
  AISM's `<total> externals, <fail> failed, <skip> skipped` (check-refs.py:185-186, 206), which
  conflates two different skip reasons into one number. CLAUDE.md L2, "a skip is always visible
  with a count" — the historical incident was specifically about *which* skip reason dominated
  (19 unverifiable quotes, not 19 legitimate imports); a single collapsed skip count cannot
  distinguish those again. No verdict changes; both skip classes remain non-failing.
- **[message-only]** Standard cross-gate finding-format change: `SEVERITY
  proofs/<ws>/externals/<file>.json:1 message` (JSON has no meaningful line granularity;
  `refs_locus` stays in the message text).

**Historical schema-drift tolerance.** N/A — the external JSON schema (`name`, `source`) has not
changed across AISM's history at time of reading.

**Corpus fixtures required** (feeds M0.2):

| id | violation |
|---|---|
| `refs-01` | **19/19 false-green** [PLAN-mandated] — every external's payload absent; all must FAIL, coverage line must show `0` import/no-quote-skipped, not `N` skipped |
| `refs-02` | fabricated quote, ≥40 chars (word-level mismatch) |
| `refs-03` | fabricated quote, <40 chars (exact-match-required case) |
| `refs-04` | IMPORT external golden case (skip_import, no error) |
| `refs-05` | no-quote external (WARN, skip_noquote) |
| `refs-06` | unparseable external JSON |
| `refs-07` | **paraphrase-wrapped verbatim core** [ruling #3] — ≥40-char genuine verbatim run wrapped in paraphrased outer wording ⇒ FAIL under whole-quote-match (would PASS under AISM's own longest-run rule) |
| `refs-08` | **syntactically-valid non-object JSON external** [rk-6r3, finding 7] — `null`/array payload ⇒ check 5's unparseable-JSON treatment extended to non-object shapes, ERROR "malformed external", never a thrown exception (AISM crashes with an uncaught `AttributeError` here, check-refs.py:180) |

---

## Gate 4 — provenance (`report/` ↔ `argument/**/*.md`)

**Purpose.** Keep the human-readable report in sync with the machine-checked argument
registry — "the Phase-2b 'CI for the paper'" (check-provenance.py:3) — so a renamed, validated,
downgraded, or removed registry result cannot silently drift from what the paper claims.

**Failure mode guarded.** **OVERCLAIM** — "the project's #1 guarded failure mode (a confident
WRONG claim)" (check-provenance.py:24, 296-298): a registry `status: open` result framed as
proved/settled in the paper's status table. **Real incidents:**
(a) a genuine false-green in this exact gate — `check-provenance.py`'s status-table source
filename was **hard-coded** to an old ledger filename; when the status ledger was renumbered
**to** `13_discussion.tex` mid-project, the stale hardcode kept pointing at the now-defunct old
name and the check silently scanned nothing useful until caught by hand
(`docs/worklog.md:270-272`, "status ledger renumbered to `13_discussion.tex`; caught a
false-green: `check-provenance.py` hard-coded the ledger filename" — the hardcode was fixed to
follow the rename, landing on today's `13_discussion.tex` value);
(b) `lem-hx-financing-floor` (2026-07-10, `docs/LEARNINGS.md:40-62`) — a `status: proved` result
carried a contract with an unstated quantifier bound (claimed for all reals `A`; the actual proof
covered only `A>0`); this was **not** caught by check-provenance.py — it was caught by an af
hostile verifier — because it is the concrete real-world instance of the gate's own documented
#1 limitation (statement text is never compared; see below). Recorded here precisely because it
proves the limitation is not hypothetical.

**Inputs.**
- Registry: `argument/**/*.md` — recursive, excluding `README.md`/`INDEX.md`/`DAG.md` at any
  depth, the identical scan Gate 2 applies (rk-2t8, M1 review B2; AISM's own script globs
  `argument/lemmas/*.md` only, check-provenance.py:120-132) — re-parsed independently of the
  linker gate (a Gate 2 parser bug must not silently propagate into this gate's coverage);
  fields read: `id`, `status`, `af`, `provenance`, `kind`.
  `provenance:` is a freeform string; the join key is a `report <label>` token embedded anywhere
  in it, e.g. `provenance: bridge md:301-372; report lem:bridge-squarehole` (check-provenance.py:11-14,73).
  Label grammar: `[a-z]+:[A-Za-z0-9-]+` (line 71). When a shard carries no `report <label>`
  token, the linker falls back to the first-hyphen→colon transform of its id (`lem-P-properties`
  → `lem:P-properties`) **iff** that label exists in the `.tex` (check-provenance.py:230-237).
- Report: `report/sections/*.tex`, scanned for `\label{}` outside `%`-comments
  (check-provenance.py:135-143).
- `report/PROVENANCE.md`: two markdown sections identified by exact headers `## Ground-truth
  source registry` and `## Per-claim ledger` (check-provenance.py:169,189). Source-registry
  rows: `` | `KEY` | `path` | sha(6+hex) | ... `` (check-provenance.py:174-187, last-wins for
  membership, every row hashed even on key reuse). Per-claim rows: `| label | source-cell | ... |`
  (check-provenance.py:192-200).
- `report/UNWIRED.md`: whitelist of registry ids as bare lines inside triple-backtick fences;
  blank lines and `#`-comments ignored, prose outside fences ignored
  (check-provenance.py:325-346).
- `report/sections/13_discussion.tex` **specifically**, for the `tab:status` table — a hardcoded
  filename in AISM (check-provenance.py:206), itself the class of bug behind incident (a) above.
- `tab:status` table grammar (check-provenance.py:204-225): body = the text before
  `\label{tab:status}`, taken back to the last `\midrule` before it, then cut again at
  `\bottomrule`; `%`-comments are stripped first (`strip_tex_comment`, applied per line); rows
  split on `\\`; columns split on an unescaped `&` (a literal `\&` is text, not a column
  separator); the status cell is column 2, lowercased and stripped; labels are every
  `\Cref{...}`/`\ref{...}` match found anywhere in the row; a row yielding zero labels is
  dropped entirely. The OVERCLAIM/underclaim comparison (check 5, below) is an exact-string
  `"open"` test against the status cell (check-provenance.py:317,320). The semantics are "a
  consistent row must exist": a result `\Cref`'d by several rows (e.g. once as its own `open`
  row, once as the condition of a `proved, cond.` row) is fine as long as at least one row
  frames it consistently with the registry (check-provenance.py:296-300).
- Config: `SOURCE_ALLOW` (non-key source-cell marker tokens, line 76); `--build` flag (off by
  default) gates an optional `latexmk` compile.

**Checks** (ERROR unless marked WARN):
1. **forward labels** — every registry `report <label>` token resolves to a `\label{}` ⇒ ERROR
   (check-provenance.py:242-248,478).
2. **claim labels** — every PROVENANCE.md per-claim row label resolves to a `\label{}` ⇒ ERROR
   (check-provenance.py:262-267,479).
3. **claim sources** — every per-claim row's Source-cell text is split into tokens on
   whitespace`/,/;/()/|` and stripped of surrounding backticks (check-provenance.py:274-275); a
   token shorter than 2 chars, already a known source-registry key, or an allow-listed
   `SOURCE_ALLOW` marker is skipped with no further check (check-provenance.py:276). Of the
   remaining tokens, only those **fullmatching** `[A-Z0-9][A-Z0-9-]*` (check-provenance.py:80)
   are candidates at all — a mixed-case or lowercase token (e.g. an inline citation like
   `Kadison1952`) is **never flagged**, by design (check-provenance.py:77-79,278). A candidate
   token is ERROR "Source key '<tok>' not in the source registry" unless it also matches the
   external-citation pattern `[A-Z]+[0-9]{3,}` (check-provenance.py:81,278-279), in which case
   it is treated as an external citation+year and passes (check-provenance.py:270-280,480). Both
   filters (fullmatch and length ≥ 2) are load-bearing: a literal port that omits either one
   floods false ERRORs on ordinary mixed-case/lowercase citation text already present in AISM
   HEAD's source cells.
4. **hash freshness** — compare each source-registry row's recorded `sha256[:16]` against a
   **byte-faithful** sha256 of the file's raw bytes, measured at the edge (`src/store/snapshot-load.ts`);
   the gate never re-hashes snapshot text (a UTF-8 round-trip that corrupts non-UTF-8/binary
   payloads). Boundary (settled 2026-07-18, rk-399 — was "ambiguous → escalate"; provenance
   `docs/reviews/2026-07-18-m0.3-milestone-review-codex.md` finding 1 + Check-4 ruling):
   - malformed sha (not 16 lowercase hex) ⇒ ERROR;
   - absolute (non-`refs/`-relative) path ⇒ WARN (hash unverifiable);
   - **present on disk + hash mismatch ⇒ ERROR "file edited, hash stale"**, always — this holds
     **regardless of git-tracking AND regardless of the loader's include rules**. The edge hashes
     **every file present on disk** (a full-tree walk that descends everywhere except the repo-root
     `.git`; round-3 landing-blocker 1), so a source row naming *any* present path is verified, not
     silently WARNed — inside the include rules or not, tracked or gitignored. The only distinction
     tracking draws is the message shape: a **git-tracked** stale file (`git ls-files`; AISM parity,
     check-provenance.py:368-404,481-482) carries no suffix, while a **git-untracked-but-present**
     one (a gitignored payload, e.g. under `refs/`) is the same `[rk-stricter-intended]` ERROR (AISM
     WARNs it) carrying a `present on disk but git-untracked; rk-stricter-intended` marker. CLAUDE.md
     L5 defaults to the stricter validity reading, and the failure direction (an extra ERROR, never
     a missed stale-source false-green) is the safe one;
   - **genuinely absent from disk** ⇒ WARN "not hash-verifiable", never ERROR. Because the edge
     hashes every present file regardless of tracking or the include rules, a *missing* byte-hash
     fact can mean only one thing: the path is not on disk at all. (The round-2 exception that also
     called an "untracked *and* outside the include rules" path absent is retired — after
     landing-blocker 1 no present path is left unhashed, so that class no longer exists.)
   Tracking is real `git ls-files` state and byte hashes are of raw bytes — both are
   `SnapshotFacts` supplied by the edge; the pure gate consumes facts, it does not guess (the
   retired "present in RepoSnapshot" proxy could neither see a tracked path outside the include
   set nor hash a binary payload — review Check-4 ruling).
5. **status OVERCLAIM/underclaim** — a registry `status: open` result whose `tab:status` rows
   never frame it as `open` ⇒ ERROR (check-provenance.py:293,317-319,483-484); a `proved`/
   `validated` result framed *only* `open` ⇒ WARN (check-provenance.py:320-321).
6. **anchor** — a registry result mapping to zero report labels and **not** in
   `report/UNWIRED.md` ⇒ ERROR "dropped from the paper, or never wired in" (per-item, actionable);
   if whitelisted ⇒ WARN (check-provenance.py:349-365,485). The whitelisted-unanchored WARNs are
   **aggregated into a single finding** (amended 2026-07-18, review ruling f): `<N> registry
   result(s) unanchored but whitelisted in report/UNWIRED.md (off paper-track): <sorted ids>`,
   attributed to the first sorted id's shard path. Rationale: a per-item WARN per whitelisted
   shard produced 96/118/138 WARNs on real historical AISM trees — a finding-flood under this
   document's own >25 threshold (see "Finding-flood, operationally defined"). This mirrors the
   ratified frontmatter-invalid aggregate (ruling b): one honest WARN naming the count and every
   id, denominator unchanged. `[rk-stricter-intended]` vs AISM's per-shard console lines
   (check-provenance.py:349-365): the flood-suppression is deliberate, and the aggregate loses no
   information (every id is named). Non-whitelisted (real) unanchored shards remain per-item ERRORs.
   Corpus: `provenance-05` (single, degenerate aggregate of one), `provenance-18` (three ⇒ one
   aggregate, the flood shape).
7. **reverse labels** (WARN) — a `\label{}` with a result-kind prefix (`thm/lem/prop/cor/op/
   obs/ex`) and no registry backref (check-provenance.py:251-259,487).
8. **coverage** (WARN) — a report-facing registry result (≥1 report label) with no per-claim
   PROVENANCE row (check-provenance.py:283-290,488).
9. **parse integrity** (WARN) — an unparseable source-registry/per-claim data row, or a
   duplicate source key — surfaced, never a silent drop (check-provenance.py:180-181,185-186,200,489).
10. **build** (`--build` only) — `latexmk` must compile `main.tex` ⇒ ERROR on failure; the log
    is scanned for "undefined references" ⇒ ERROR (promoted from a latexmk warning, since
    `-halt-on-error` does not fail on these); undefined citations ⇒ WARN
    (check-provenance.py:420-457,500-503). Skips cleanly with a WARN if `latexmk` is absent
    (check-provenance.py:440-441) — same in the port, not a deviation.

**Known limitations / incident history** (verbatim from the script's own header,
check-provenance.py:38-46 — the gate's admitted false-green surface):
- **STATEMENT TEXT is not checked.** The gate joins label↔label only; it never compares a
  registry `contract` to the report theorem body, so a weakened hypothesis or a content change
  (the script's own header names the class: "a `√η`↔`η` change") drifts green. Real instance:
  `lem-hx-financing-floor`'s quantifier bug (see above) — caught by an af hostile verifier, not
  this gate. PRD explicitly assigns statement-content drift to `rk audit` (M5.1), never `rk
  check`; this gate's scope stays label-wiring only — not expanded here.
- STATUS drift is seen only for results the `tab:status` table actually `\Cref`s; a flip on an
  un-listed result is not caught (check-provenance.py:42).
- af-validation state is not read here — that is the linker gate's job (check-provenance.py:44).
- Hash freshness covers only in-repo (tracked) source files; gitignored/external payloads
  (documented as ~1/3 of sources) only WARN (check-provenance.py:45-46,390-391).
- The hardcoded `13_discussion.tex` filename (check-provenance.py:206) is a structural fragility
  that already produced one real false-green (incident (a) above); AISM's own fix at the time
  was manual (the file happened to stabilize under that name). See Divergences.
- **Silent-skip false-green surface (status rows).** `status_table_rows()` returns `[]` — with
  no warning, no error, nothing — whenever the configured file either doesn't exist, or exists
  but lacks `\label{tab:status}` or `\midrule` (check-provenance.py:207-211). Since check 5
  (OVERCLAIM/underclaim) only compares against rows it was actually given, an empty row set
  means check 5 checks **nothing** and still reports clean. This is the same *shape* of bug as
  the refs gate's 19/19 false-green (a checker that verifies zero things while reporting green),
  and this gate is otherwise the only one of the six with no coverage unit of its own visible in
  the finding stream — see Divergences for the fix (an explicit coverage line with `S=0`
  rendered loudly) and fixture `provenance-13`.
- **Silent-skip false-green surface (registry parse), fixed 2026-07-18 (rk-v18, review finding
  4).** `parse_registry`'s own `fm is None: continue` (check-provenance.py:128-129) drops a
  registry shard with missing/unterminated frontmatter with no finding and no count; the port's
  coverage line used to derive BOTH its numerator and its denominator from the surviving parsed
  set, so one good shard + one malformed shard reported a full `1/1` — the malformed file was
  invisible to the coverage line, not merely unflagged by a finding. The linker gate (Gate 2)
  separately ERRORs this exact defect (`linker-01`) — that ERROR does not make THIS gate's own
  coverage statement truthful, since `rk check` still needs to print six honest coverage lines
  even if a reader only looks at one of them. Fixed: the denominator is now every registry file
  discovered by the recursive `argument/**/*.md` scan (before the frontmatter filter, after the
  README/INDEX/DAG name exclusion — rk-2t8), never just the survivors;
  every excluded path is also named in a single aggregate WARN (`src/gates/
  provenance-parse.ts::registrySkipReport`) — a WARN, not a second ERROR, since Gate 2 already
  owns the validity failure and this gate's own duty is coverage transparency, not a duplicate
  defect report. **[Tier-A / L6 flag]**: this WARN-vs-duplicate-ERROR choice is a validity-surface
  decision made by the implementing session without a Fable reviewer present; it is carried
  pending ratification at the rk-4wm milestone re-review, per CLAUDE.md L6 and the model-policy
  Tier-A review requirement. See the Divergences entry below for the resulting coverage-line
  wording.

**Divergences from AISM (triage).**
- **[rk-stricter-intended] The `tab:status` source file becomes a config parameter** (default
  `report/sections/13_discussion.tex`, overridable per-repo) instead of a hardcoded literal
  (check-provenance.py:206). This exact hardcoding already caused one documented false-green in
  AISM's own history (incident (a), above — a rename silently blinded the check). The default
  value is byte-identical to AISM's; only the mechanism for pointing at it changes, closing a
  structural false-green surface rather than tightening a check's logic. Fixture:
  `provenance-11`. (Gate 6's `PREFIX` parameterization, amended 2026-07-18/R12, is now tagged the
  same `[rk-stricter-intended]` for the same reason; its sibling `MAX_LINES` stays `[message-only]`
  — see the Authority section's "Tag asymmetry, resolved once".)
- **[rk-stricter-intended] Registry discovery is recursive `argument/**/*.md`, mirroring Gate 2**
  (rk-2t8, M1 review B2, 2026-07-19). AISM's `parse_registry` globs `argument/lemmas/*.md` only
  (check-provenance.py:120-132) — on a repo whose shards live at `argument/` root (the exact
  shape rk's own scaffold stamps, PRD.md:79-85), AISM's script sees an EMPTY registry and check 5
  compares against nothing: a silent green over a `status: open` result the paper frames as
  proved, the gate's #1 guarded failure mode entirely undefended. rk's scan now matches Gate 2's
  recursive contract exactly (same README/INDEX/DAG exclusion set at any depth), deliberately
  re-implemented rather than imported so the two gates' parsers stay independent. Same footing
  as Gate 2's rk-9pk widening: a contract amendment removing AISM private-layout residue.
  Fixture: `provenance-20`.
- **[message-only] Coverage line** (amended 2026-07-18, rk-v18). `checked provenance: <N>/<M>
  registry results, <X> frontmatter-invalid, <R> claim rows, <S> tab:status rows (<E> errors, <W>
  warnings)`. `M` (the denominator) is every file this gate's recursive `argument/**/*.md` scan discovered
  (README/INDEX/DAG excluded by name at any depth — rk-2t8),
  `N` (the numerator) is the surviving successfully-parsed set, and `X = M - N` is rendered even
  when `0` — the same "never omitted or folded away" rule `S` already followed. Before this
  change `N` and `M` were both derived from the parsed set alone (always `N == M`, a vacuous
  100%-looking ratio even when files were silently excluded); see the Known-limitations entry
  above for the incident this closes. `S` keeps its own prior rule unchanged: rendered even when
  `0` (never omitted or folded into a generic "manifest absent"-style WARN). CLAUDE.md L2's
  mandatory coverage reporting, applied twice over to this gate's two independent silent-skip
  surfaces (registry parse, tab:status parse) — AISM's script counts neither. Pass/fail is
  unchanged both times; only visibility improves.
- **[message-only]** Standard cross-gate finding-format change; the `--build` step remains
  opt-in, matching AISM's own `--build` flag exactly (not a divergence, confirmed here for
  clarity).

**Historical schema-drift tolerance.** N/A for this gate's own inputs (the registry fields it
reads — `id`/`status`/`af`/`provenance`/`kind` — are the same set the linker gate reads, and
none of them are `routes:`/`workspace:`; this gate never inspects those two fields).

**Corpus fixtures required** (feeds M0.2):

| id | violation |
|---|---|
| `provenance-01` | **OVERCLAIM** [PLAN-mandated] — registry `open` framed as proved |
| `provenance-02` | underclaim (proved framed only `open`, WARN) |
| `provenance-03` | **stale SHA256** [PLAN-mandated] — tracked source edited after hash recorded |
| `provenance-04` | **unwired anchor** [PLAN-mandated] — zero report labels, not on UNWIRED.md |
| `provenance-05` | whitelisted-unanchored (on UNWIRED.md, WARN) |
| `provenance-06` | forward-label dangling (`report <label>` with no matching `\label{}`) |
| `provenance-07` | claim-source token unresolved |
| `provenance-08` | duplicate source key (parse integrity, WARN) |
| `provenance-09` | reverse-label orphan (WARN) |
| `provenance-10` | coverage: report-facing result with no per-claim row (WARN) |
| `provenance-11` | hardcoded-filename regression probe — rename the status-table file; must still be scanned (proves the config-parameter divergence actually fixes incident (a)) |
| `provenance-12` | absolute (non-`refs/`-relative) source path (WARN) |
| `provenance-13` | **status-table label absent** [F3] — `13_discussion.tex` present but no `\label{tab:status}`/`\midrule` ⇒ coverage line must show `0 tab:status rows` loudly, never a silent green |
| `provenance-14` | **check 4: git-tracked source outside every loader include rule, stale hash** [rk-399, finding 1 BLOCKER] — the edge hashes every `git ls-files` path, so a tracked path outside the include set is still verified ⇒ ERROR "file edited, hash stale" |
| `provenance-15` | **check 4: binary/non-UTF-8 payload, correct byte-faithful hash** [rk-399, finding 1] — raw-byte hashing (not a UTF-8 text round-trip) ⇒ PASS, no false ERROR |
| `provenance-16` | **check 4: same binary payload, mismatched recorded hash** [rk-399, finding 1] — proves the byte-faithful check still fails a genuinely stale binary source ⇒ ERROR "file edited, hash stale" |
| `provenance-17` | **registry-parse frontmatter-invalid > 0** [rk-v18, N4] — one valid lemma plus one lemma with no frontmatter at all ⇒ Gate 4's own aggregate WARN naming the excluded path, coverage denominator honest (`checked` < `total`, never a silent `1/1`) |
| `provenance-18` | **check 6: three whitelisted-unanchored shards ⇒ one aggregate WARN** [ruling f] — the flood shape (96/118/138 per-item WARNs on real AISM historical trees) collapses into one WARN naming the count + sorted ids |
| `provenance-19` | **check 4: stale source payload shadowed by a coincidental VCS-named parent** [round-3 landing-blocker 1] — the loader's skip-set is anchored to the repo root and narrowed to `.git` alone, so a `notes/.svn/`-shadowed payload is hashed and its staleness ⇒ ERROR, never a false absent-WARN (row restored 2026-07-19 — the fixture landed in the round-3 wave but this table was never updated; see corpus/README.md's own `provenance-19` row for the full incident) |
| `provenance-20` | **OVERCLAIM on a root-level (non-`lemmas/`) shard** [rk-2t8, M1 review B2] — recursive `argument/**/*.md` discovery mirrors Gate 2 exactly; `argument/thm-main.md` with `status: open` framed as proved by a `tab:status` row ⇒ OVERCLAIM ERROR, coverage `1/1` (pre-fix: a vacuous `0/0` and no finding) |

---

## Gate 5 — runs (`runs/<YYYY-MM-DD>-<slug>/`)

**Purpose.** Keep numerical evidence honestly quarantined below the rigour ladder: "Numerics
are evidence, NEVER proof" (check-runs.py:6-10). Every run bundle must be reproducible (an
exact re-run command), checkable (a declared invariant), and indexed (a reverse-lookup row).

**Failure mode guarded.** An undocumented or unverifiable numerical claim entering the argument
as if it were checkable. No single dated AISM incident is on record for this gate specifically
(it is structural/preventive, and every `runs/` bundle inspected conforms); fixtures are
class-driven from the script's own enumerated requirements, not incident-driven.

**Inputs.**
- Glob: `runs/*/` — only directories are bundles; a stray non-directory file at the top level
  other than `README.md` ⇒ WARN (check-runs.py:46-50).
- Bundle dirname: `^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$` (check-runs.py:30,54-55).
- `runs/<bundle>/README.md`: plain markdown, **substring-search**, not a structured schema —
  case-insensitively must contain each of `hypothesis`, `command`, `finding`, `next`
  (check-runs.py:32,60-63), and at least one of `invariant`, `certificate`, `known value`,
  `known-value`, `independent`, `cross-check`, `cross check`, `residual`, `tolerance`
  (check-runs.py:34-35,64-66). A heading or an inline mention both satisfy these — see Known
  limitations.
- Repo-root `INDEX.md` (`ROOT / "INDEX.md"`, check-runs.py:28 — **not** a `runs/`-local file):
  the bundle dirname must appear as a substring of its text (check-runs.py:67-68) — also
  substring-based, not a structured-table check.
- `SKIP = {README.md}` at the `runs/` top level (the schema doc itself, check-runs.py:36).

**Checks.**
1. Bundle dirname matches the date-slug pattern ⇒ ERROR "bad bundle name" otherwise
   (check-runs.py:54-55).
2. `README.md` exists in the bundle ⇒ ERROR "missing README.md" otherwise, and the remaining
   per-bundle checks are skipped for that bundle (check-runs.py:57-59, `continue`).
3. `README.md` contains all four required-field substrings ⇒ ERROR listing which are missing
   (check-runs.py:61-63).
4. `README.md` contains at least one invariant-marker substring ⇒ ERROR "no checkable
   invariant/certificate/known-value declared" otherwise (check-runs.py:64-66).
5. Bundle dirname appears in repo-root `INDEX.md` ⇒ ERROR "not referenced in INDEX.md"
   otherwise (check-runs.py:67-68).
6. A stray non-directory file at the `runs/` top level (not `README.md`) ⇒ WARN
   (check-runs.py:49-50).

**Day-1 vacuity.** An empty `runs/` directory is an explicitly valid green state
(check-runs.py:16, "Day 1: runs/ is empty by design ⇒ the gate is green") — zero bundles is
zero errors, not a coverage failure. The coverage line must state `0 run bundle(s)` explicitly
per the Shared conventions' coverage-reporting rule, never omit the line.

**Known limitations / incident history.**
- Checks 3, 4, and 5 are all plain substring search, not structural (heading-based or
  table-row-based). A README containing the literal word "hypothesis" anywhere — e.g. inside
  "no hypothesis was tested" — satisfies check 3 regardless of context; a bundle dirname
  mentioned in `INDEX.md` prose (not an actual index row) satisfies check 5. This is a real,
  acknowledged looseness in AISM's own implementation (a deliberate design choice for a
  hand-authored README, not a bug); no historical incident recorded (no evidence it was ever
  exploited). **Carried forward unchanged** (ruling #5, 2026-07-17 Fable review addendum):
  accepted as deliberate looseness because M2.6's freshness gate (regenerate-and-diff) obsoletes
  the `runs/`↔`INDEX.md` substring-matching mirror entirely — a structural fix at M2.6
  supersedes a point-fix here. Not accepted for parity cost.

**Divergences from AISM (triage).** None. This gate's logic is simple enough that it is ported
as characterized prior art with no behavioral tightening; only the standard **[message-only]**
cross-gate finding-format change and the mandatory day-1 coverage line apply.

**Historical schema-drift tolerance.** N/A — the `README.md` field/marker requirements have not
changed across AISM's history at time of reading.

**Corpus fixtures required** (feeds M0.2):

| id | violation |
|---|---|
| `runs-01` | **orphaned run bundle** [PLAN-mandated] — not referenced in `INDEX.md` |
| `runs-02` | **missing invariant** [PLAN-mandated] — no invariant-marker substring |
| `runs-03` | bad bundle name (doesn't match the date-slug pattern) |
| `runs-04` | missing `README.md` entirely |
| `runs-05` | missing one required field (parametrize over hypothesis/command/finding/next) |
| `runs-06` | stray top-level file (WARN) |
| `runs-07` | empty `runs/` golden case (day-1 green baseline; asserts the coverage line still fires) |
| `runs-08` | **empty run bundle DIRECTORY (exists, no README)** [rk-399, finding 2 BLOCKER] — check 2 must ERROR "missing README.md" even when file-prefix inference sees nothing; the gate enumerates bundles from the `dirs` SnapshotFact, not file prefixes alone |

---

## Gate 6 — report-shards (`report/main.tex` + `report/sections/*.tex`)

**Purpose.** Enforce the sharded lab-book discipline for the LaTeX report: a single
`report/main.tex` master forbidden from carrying body prose, every shard under
`report/sections/` included exactly once, size-capped, carrying a machine-checkable header, and
cross-indexed in both `report/README.md` and `report/SHARD_CATALOG.md`
(check-report-shards.sh:2-6). Ported wholesale from `../arithmetic-quantum-mechanics`
(check-report-shards.sh:2).

**Failure mode guarded.** The report degenerating into either a monolithic, un-navigable
`main.tex` (defeats the whole sharding discipline — the same ~200-line-target/280-line-hard-cap
convention rk's own CLAUDE.md Rule 4 inherits), or an orphan shard file nobody indexes, silently
invisible to readers. No single dated AISM incident is on record for this specific gate (it was
ported already-hardened, not authored in this repo); fixtures are class-driven from the script's
own enumerated checks.

**Gate-level presence guard: `report/` ROOT presence-conditional** (amended 2026-07-18, R13, bead
rk-au6). `report/` — the whole LaTeX-paper layout this gate scans — is NOT in rk's scaffold
(PRD.md:79-85; rk's render target is the M2.4 HTML site, and M2.6's regenerate-and-diff gate
supersedes this hand-maintained mirror entirely). A general research tool must not force every
repo to hand-create AISM's own report skeleton just to enter consolidation, so EVERY check below
(1-20) is bound ONLY when the `report/` **ROOT directory** exists on disk (the `dirs`
SnapshotFact, `dirExists(snapshot, "report")`). Absent `report/` ⇒ zero findings; the coverage
line names the non-adoption explicitly — `checked shards: 0/0 shard(s) fully conforming
(included, labeled, cataloged); report/: absent (not adopted) (...)` — never a silent skip
(CLAUDE.md L2). This keys on the ROOT artifact only: once `report/` exists at all, every check
below runs exactly as documented, including Check 1's own missing-`main.tex`/`README.md`/
`SHARD_CATALOG.md`/`sections/` ERRORs — a repo that has started adopting `report/` but left it
incomplete is the incident class this gate exists to catch (fixture `shards-13`), and root-level
presence-conditionality must never blur into that deeper-item leniency. Present-and-populated
`report/` runs unchanged; the coverage line then reads "...; report/: present". Fixture:
`shards-15` (root absent, golden pass) — see Divergences.

**Inputs.**
- `MASTER = report/main.tex`; `SECTIONS_DIR = report/sections/`; `README = report/README.md`;
  `CATALOG = report/SHARD_CATALOG.md` (check-report-shards.sh:12-15).
- `MAX_LINES`: env override `REPORT_SHARD_MAX_LINES`, default **280** (check-report-shards.sh:16).
- `PREFIX = "AISM"` (check-report-shards.sh:17) — a hardcoded shell variable in AISM (only ever
  needed one value there); **per-repo parameter, `GateConfig.shardsPrefix`, with NO default** in
  the port (**R12**, bead rk-psm, M1 landing-blocker — amended 2026-07-18: a general tool must
  never default a shard-id prefix to a specific campaign name) — see Divergences. **Required-
  when-consumed**: the shards gate only needs `PREFIX` to validate a real shard's `SHARD-ID`
  header (Checks 10/12 below); a tree with nothing to check yet (the empty-scaffold exemption,
  Check 2) never touches it and is unaffected by whether it is configured. The first shard that
  DOES need it, with no `shardsPrefix` configured, produces one loud ERROR at the sentinel path
  `.rk/config.json:1` ("shardsPrefix is not configured...") — visible, counted (L2), never a
  silent AISM-shaped default and never a crash. Fixture: `shards-14`.
- Per-shard TeX-comment header lines inside each `report/sections/NN_slug.tex`:

| header | cardinality | format |
|---|---|---|
| `% SHARD-ID:` | first occurrence wins; a duplicate line within the same file is **not** an error | `^${PREFIX}-[0-9]{2}[A-Z]?-[A-Z0-9-]+$`, unique **across shards**, numeric-prefix segment must match the shard filename's own leading 2 chars |
| `% SHARD-TITLE:` | first occurrence wins; a duplicate line within the same file is **not** an error | freeform |
| `% SHARD-KEYWORDS:` | first occurrence wins; a duplicate line within the same file is **not** an error | freeform |
| `% SHARD-SUMMARY:` | **enforced**: exactly 2 or 3 lines | freeform, one per line |

Only `SHARD-SUMMARY`'s count is actually cardinality-checked (`mapfile` collects every matching
line and the count is validated, check-report-shards.sh:83-84). `SHARD-ID`/`TITLE`/`KEYWORDS` are
each extracted with `sed ... | head -n 1` (check-report-shards.sh:62-64) — a second occurrence of
any of these three headers in the same file is silently ignored (first-wins), never flagged as a
duplicate-header error. "Exactly 1" is not the enforced rule for these three; do not build a
fixture asserting a duplicate-header ERROR for `SHARD-ID`/`TITLE`/`KEYWORDS` — it does not exist
in AISM.

- `\include{sections/NN_slug}` lines in `main.tex`, comment-lines excluded
  (check-report-shards.sh:28-30).

**Checks.** (Checks 1-20 below all run only when `report/` itself exists — see the "Gate-level
presence guard" above.)
1. `MASTER`, `README`, `CATALOG` (files) and `SECTIONS_DIR` (the `report/sections/`
   **directory** itself) must all exist ⇒ fail per missing item (check-report-shards.sh:22-25).
   The directory-existence half is enforced via the `dirs` SnapshotFact (`src/gates/snapshot.ts`),
   which represents an empty directory that git cannot store — resolving the rk-399 review's
   finding-2 gap where an absent `report/sections/` used to green-light as an empty scaffold. The
   missing-directory finding is surfaced *before* the empty-scaffold exemption below, so an absent
   `sections/` always fails even when there are no shards yet (provided `report/` itself exists —
   R13, above).
2. **Empty-scaffold exemption** — the `report/sections/` directory exists (Check 1) but has zero
   `\include`s and zero `.tex` files under it ⇒ pass cleanly, exit 0 (check-report-shards.sh:31-36).
3. Non-empty scaffold with zero includes but nonzero shard files ⇒ fail
   (check-report-shards.sh:37-39).
4. Every `\include` target must be under `sections/` ⇒ fail otherwise (check-report-shards.sh:45-48).
5. No `\include` target may repeat ⇒ fail on duplicate (check-report-shards.sh:50).
6. Every `\include` target file must exist ⇒ fail if missing (check-report-shards.sh:52).
7. Shard line count ≤ `MAX_LINES` ⇒ fail otherwise, message states the ~200-line target and the
   hard cap (check-report-shards.sh:54-57).
8. `README.md` must contain the shard's file path as a backtick-quoted substring ⇒ fail
   otherwise (check-report-shards.sh:58-59).
9. `SHARD-ID` present (first matching line, `head -n 1`; a duplicate line is not itself an error
   — see Inputs) ⇒ fail if absent (check-report-shards.sh:62,67-68).
10. `SHARD-ID` matches the required format ⇒ fail otherwise (check-report-shards.sh:69).
11. `SHARD-ID` unique across all shards ⇒ fail on duplicate (check-report-shards.sh:71-72).
12. `SHARD-ID`'s numeric-prefix segment matches the filename's own leading 2 chars ⇒ fail
    otherwise (check-report-shards.sh:75-78).

    Checks 10 and 12 both consume `PREFIX` (`GateConfig.shardsPrefix`). When it is unconfigured,
    checks 9/11/13-20 still run normally, but 10/12 cannot — the shard is instead flagged by the
    config-missing ERROR (Inputs, above) and excluded from the coverage numerator; every OTHER
    shard needing the same missing config reuses the SAME one ERROR (never one per shard).
13. `SHARD-TITLE` present ⇒ fail if absent (check-report-shards.sh:81).
14. `SHARD-KEYWORDS` present ⇒ fail if absent (check-report-shards.sh:82).
15. `SHARD-SUMMARY` count is exactly 2 or 3 ⇒ fail otherwise (check-report-shards.sh:83-84).
16. `README.md` must contain the shard's `SHARD-ID` as a backtick-quoted substring ⇒ fail
    otherwise (check-report-shards.sh:87-88).
17. `CATALOG` must contain, as a plain substring, each of `SHARD-ID`/file path/`SHARD-TITLE`/
    `SHARD-KEYWORDS` ⇒ fail per missing item (check-report-shards.sh:90-95).
18. `CATALOG` must contain each `SHARD-SUMMARY` line verbatim as a substring ⇒ fail otherwise
    (check-report-shards.sh:96-99).
19. **No orphan shard files** — every `.tex` file under `sections/` must be one of the
    `\include`d files ⇒ fail otherwise (check-report-shards.sh:104-109).
20. `MASTER` must contain no body-sectioning command (`\section`, `\subsection`,
    `\subsubsection`, `\paragraph`) at line-start ⇒ fail otherwise, offending lines echoed
    (check-report-shards.sh:111-115).

**Known limitations / incident history.**
- Checks 8, 16, 17, 18 are all `grep -F` (fixed-string) substring containment against
  README/CATALOG — the same "loose substring, not structural" class as the runs gate; a
  coincidental substring match could pass without the value genuinely being "listed" in a
  meaningful sense. No historical incident on record. **Carried forward unchanged** (ruling #5,
  2026-07-17 Fable review addendum): accepted as deliberate looseness because M2.6's freshness
  gate (regenerate-and-diff) obsoletes these hand-maintained README/SHARD_CATALOG mirrors
  entirely — a structural fix at M2.6 supersedes a point-fix here. Not accepted for parity cost.
- No historical incident on record specifically for this script in AISM (it arrived already
  hardened from a sister repo).
- `report/README.md` and `report/SHARD_CATALOG.md` are **hand-maintained cross-indexes** in
  AISM's model — there is no regeneration command for them (contrast `argument/INDEX.md`/
  `DAG.md`, which genuinely are generated). The mandatory "hand-edited generated file" corpus
  fixture (IMPLEMENTATION_PLAN M0.2) does **not** belong to this gate — it is assigned to the
  linker gate (`linker-16`), where an actual generate/check-staleness pair exists. Recorded here
  explicitly to prevent the wrong assignment.

**Divergences from AISM (triage).**
- **[message-only] `MAX_LINES` becomes an explicit per-repo config parameter** (default 280,
  already env-overridable in AISM via `REPORT_SHARD_MAX_LINES`). Not a behavior change: AISM's own
  default (`MAX_LINES=280`) remains byte-identical when rk is pointed at AISM's own repo.
- **[rk-stricter-intended] `PREFIX` becomes a per-repo config parameter with NO default** (R12,
  bead rk-psm — amended 2026-07-18; supersedes the pre-M1 text of this entry, which bundled
  `PREFIX` with `MAX_LINES` above under `[message-only]` on the reasoning that AISM's own default
  stayed byte-identical). That reasoning held only as long as rk carried AISM's `"AISM"` string
  forward as ITS OWN default — a residue an M1 audit (`docs/memos/2026-07-18-aism-residue-audit.md`
  R12) flagged as a real defect: a general-purpose tool defaulting a shard-id prefix to one
  specific prior campaign's name is exactly the kind of copy-paste-from-AISM residue the whole rk
  extraction exists to remove (CLAUDE.md L5). This IS a behavior change — a repo that never
  configures `shardsPrefix` now gets a loud config-missing ERROR instead of silently validating
  against `"AISM"` — but a zero-cost one for AISM itself: pointing rk at AISM's own repo with
  `shardsPrefix: "AISM"` configured reproduces byte-identical behavior; AISM's own script, with its
  prefix hardcoded, cannot express "unconfigured" at all and so has no equivalent state to diverge
  from except by inspection. Confirmed `differs` by running `check-report-shards.sh` directly
  against `corpus/shards/shards-14/repo` (`GIT_CEILING_DIRECTORIES` pinned per the Validation
  methodology): it exits 0 (AISM's hardcoded `PREFIX="AISM"` matches the fixture's golden
  `AISM-01-INTRO` content), while rk's contract requires the config-missing ERROR regardless.
  Fixture: `shards-14`. (Contrast Gate 4's `provenance-11`, the OTHER `[rk-stricter-intended]`
  hardcoded-literal-to-config-parameter entry in this document — see the Authority section's "Tag
  asymmetry, resolved once": both close a real gap the AISM-hardcoded literal left open, unlike
  `MAX_LINES` immediately above, which changes only how an already-correct value is configured.)
- **[message-only]** Standard cross-gate finding-format change: `SEVERITY
  report/sections/<file>.tex:<line>` for shard-header/size findings (line resolved to the
  offending header comment's own line where possible, else 1); `SEVERITY
  report/main.tex:<line>` for master-purity/include findings — vs. AISM's plain `report shard
  check: <message>` lines to stderr with no path/line structure (check-report-shards.sh:20).
- **`report/` ROOT presence-conditional gate guard** (amended 2026-07-18, R13, bead rk-au6 — see
  the gate-level "Gate-level presence guard" note above for the full rule). `check-report-
  shards.sh:22-25` requires `MASTER`/`SECTIONS_DIR`/`README`/`CATALOG` unconditionally — no
  report/-absent no-op exists in the script. Script-verified 2026-07-18 by running
  `check-report-shards.sh` directly against fixture `shards-15`'s `repo/` tree
  (`GIT_CEILING_DIRECTORIES` pinned per the Validation methodology): it prints four `report shard
  check: missing ...` failures and exits 1. This IS a verdict-changing divergence — a repo with no
  `report/` at all now passes where AISM's script would fail four times — but, like the parallel
  Gate 2 Check 11 divergence, it is **not** triaged into the rk-stricter-intended / rk-bug /
  ambiguous triad: the AISM behavior here is the residue this bead removes (forcing every general
  rk repo to hand-create AISM's own `report/` LaTeX skeleton just to pass), not a stricter
  baseline worth preserving — the same footing as F5's reversal (Gate 1). Fixture: `shards-15`.
- **[message-only] Coverage line, numerator semantics defined explicitly** (amended 2026-07-18,
  rk-1tt, review finding 5; unit text extended 2026-07-18 by the R13 guard immediately above to
  append `; report/: present` or `; report/: absent (not adopted)`, itself the point of the R13
  entry, not this one). `checked shards: <N>/<M> shard(s) fully conforming (included,
  labeled, cataloged) (<E> errors, <W> warnings)`. `M` (the denominator) is every shard identity
  this run examined — named by an `\include` in `main.tex` (**including an `\include` whose target
  lies outside `sections/`**, which resolves to no `sections/X.tex` file but is itself a
  non-conforming identity that still counts — amended 2026-07-18, review N3), or physically present
  under `sections/`, whichever set is larger; `N` (the numerator) means **fully conforming**: zero
  findings against that shard from ANY of checks 5-19, not merely "was looked at". An
  outside-`sections/` include therefore contributes to `M` but never to `N`; the pre-N3 code
  `continue`d it before it entered any denominator set, reporting a false `0/0` beside a live
  Check-4 ERROR (fixture `shards-07`). This is a
  definition, not a behavior change — AISM's own script has no coverage line of any kind
  (`check-report-shards.sh` only prints per-violation lines and a final pass/fail); the port added
  this line under the same CLAUDE.md L2 mandate every gate's coverage line follows, and this entry
  makes explicit what it always should have meant. The pre-fix implementation approximated
  "fully conforming" by checking `finding.path === shardFile` after the fact, which silently
  degenerated to "examined" for any check whose finding is attributed to a DIFFERENT file than
  the shard it is about: checks 8/16 (README does not list this shard's path/label) and 17/18
  (CATALOG does not list this shard's header/summary) attribute their ERROR to `report/README.md`
  or `report/SHARD_CATALOG.md`, and check 6 (missing `\include` target) attributes its ERROR to
  `report/main.tex` — so a shard that provably fails cataloging, listing, or even existing on disk
  could still be counted "fully conforming" (fixtures `shards-08`/`shards-09`: `1/1` despite a
  live CATALOG/README ERROR). The fix tracks non-conformance directly at each check site (a
  `nonConforming: Set<string>` populated wherever a check fires against a specific shard,
  regardless of which file the resulting finding names as its own `path`), never by reverse-
  matching finding paths afterward. No shard-identity set or ERROR/WARN verdict changes; only
  what the coverage numerator counts is now well-defined and computed consistently. **[Tier-A /
  L6 flag]**: a coverage line's truthfulness is explicitly Tier-A per CLAUDE.md's model-policy
  ("truthful rendering"); this fix was implemented and mutation-proven without a Fable reviewer
  present and is carried pending ratification at the rk-4wm milestone re-review, same as Gate 4's
  parallel fix above.

**Historical schema-drift tolerance.** N/A — the shard header schema (`SHARD-ID/TITLE/
KEYWORDS/SUMMARY`) has not changed across AISM's history at time of reading.

**Corpus fixtures required** (feeds M0.2):

| id | violation |
|---|---|
| `shards-01` | oversized shard (>280 lines) |
| `shards-02` | duplicate `SHARD-ID` |
| `shards-03` | malformed `SHARD-ID` (wrong prefix/format) |
| `shards-04` | wrong `SHARD-SUMMARY` count (0, 1, or 4 lines) |
| `shards-05` | orphan shard file (exists, not `\include`d) |
| `shards-06` | duplicate `\include` |
| `shards-07` | `\include` pointing outside `sections/` |
| `shards-08` | missing `SHARD_CATALOG.md` entry for an existing shard |
| `shards-09` | missing `README.md` entry for an existing shard |
| `shards-10` | body-sectioning command present in `main.tex` |
| `shards-11` | empty-scaffold golden case (zero includes, zero shard files — must pass) |
| `shards-12` | non-empty scaffold with zero `\include`s (shard files exist, master has none) |
| `shards-13` | **absent `report/sections/` directory** [rk-399, finding 2 BLOCKER] — check 1 must ERROR via the `dirs` SnapshotFact rather than green-lighting as an empty scaffold; golden "exists but empty" counterpart is `shards-11` |
| `shards-14` | **`shardsPrefix` unconfigured, a real shard needs SHARD-ID validation** [R12, bead rk-psm, M1 landing-blocker] — a fully-conforming golden shard tree (same shape as `shards-01`..`10`'s content) with NO `repo/.rk/config.json` ⇒ one loud, counted config-missing ERROR at `.rk/config.json:1`, never a silent AISM-shaped default and never a crash |
| `shards-15` | **[R13, bead rk-au6] `report/` ROOT presence-conditional golden case** — a fresh-scaffold-shaped repo (a real `argument/lemmas` shard, no `report/` anywhere) ⇒ zero findings, coverage names the non-adoption (AISM's script fails four times unconditionally on the same tree; rk's contract does not) |

---

## Gate 7 — freshness (`.rk/generated.json` ↔ any declared generated artifact)

**Purpose.** IMPLEMENTATION_PLAN M2.6: "regenerate-and-diff replaces mirror-check gates." A
repo may adopt any number of generated artifacts — today, Gate 2's own `argument/INDEX.md`/
`DAG.md` mirrors; in the future, M2.4's `rk render` HTML output, or any other renderer this
binary or a later one adds. Rather than hand-writing one hardcoded per-file mirror check per
artifact (Gate 2 Check 11's own shape), Gate 7 reads one **declared manifest**,
`.rk/generated.json`, listing `{path, generator}` pairs, regenerates each with the named
generator, and byte-diffs the result against what is on disk. Adding a future generator is a
one-line addition to `src/gates/freshness.ts`'s `GENERATORS` map — no change to this gate's
shape, its coverage-line format, or `rk check`'s CLI wiring.

**Scope note (this WP, 2026-07-19).** AISM cutover — deleting AISM's own markdown mirrors and
migrating its live campaign onto this manifest — is explicitly OUT of this WP's scope (a
standing TJO directive defers the AISM staged cutover indefinitely; see CLAUDE.md Rule 3 and
HANDOFF.md). IMPLEMENTATION_PLAN M2.6's acceptance clause "AISM mirrors deleted" is therefore
inapplicable here; this WP's bar is the fixture bar below (a hand-edited generated file fails
`rk check`, a clean one passes, absence is presence-conditional and named).

**Repair wave (M2 boundary review blockers #3/#4, this session).** The M2 boundary review found
two holes the first landing left open, both repaired here:
- **#3 — `rk render`'s actual HTML output was unprotected, and an unrecognized generator id
  green-lit an unchecked artifact.** `rk render` (M2.4) now upserts a manifest entry
  `{"path": "<out>/index.html", "generator": "render-site-v1"}` (src/cli/render.ts, render lane).
  `render-site-v1` is a NEW kind of recognized generator — **edge-supplied**, not pure — see
  "Edge-supplied generators" below. Separately, a manifest entry naming a generator id this
  binary recognizes NEITHER as a pure `GENERATORS` entry NOR as `render-site-v1` is now a
  BLOCKING manifest ERROR (Check 4, below) — the pre-repair behavior ("not adopted", zero
  findings, excluded from `checked`) let a typo'd or unregistered generator id exit green at
  `checked 0/1`; that state no longer exists.
- **#4 — the runtime manifest parser under-enforced `schemas/generated.v1.json`.** Missing
  `schema_version`, a wrong version (e.g. `"2"`), and extra top-level/per-entry keys were all
  silently accepted. Check 1 (below) now enforces the schema's full surface: the exact
  `schema_version` const, and `additionalProperties:false` at BOTH the top level and per entry.

**Edge-supplied generators (`render-site-v1`).** `src/gates/freshness.ts` stays PURE (L3: no fs/
network/clock) — it cannot itself build a `GraphDocument` (af/fr subprocess calls) or call
`src/render/site.ts`'s `renderSite`. So unlike `linker-index`/`linker-dag` (pure functions of
the snapshot, computed INSIDE this gate), `render-site-v1`'s expected bytes are computed at the
EDGE, `src/cli/check.ts`'s `prepareRenderSiteExternalRegen`: it builds the real `GraphDocument`
(`src/store/build-graph.ts`'s `buildGraphDocument`, imported unmodified), renders it
(`src/render/site.ts`'s `renderSite`, imported unmodified, `northStarId` sourced from
`.rk/config.json` the same way `rk render` itself defaults it — `rk check` has no CLI
equivalent of `rk render`'s own `--title`/`--north-star` overrides, a known limitation below),
and hands the pure gate the result via `runFreshnessGate`'s third parameter, `externalRegen: Map<
path, {ok:true, bytes} | {ok:false, reason}>`. The pure gate never regenerates `render-site-v1`
itself; it only diffs SUPPLIED bytes. Consequently `freshnessGate.run` (the plain 2-arg `Gate`
interface every OTHER caller uses — `src/gates/index.ts`'s registry, the corpus harness) always
passes an EMPTY `externalRegen` map, so a `render-site-v1` entry run through that plain interface
always reports "cannot be regenerated for verification" (`freshness-07`) — never a silent pass.
If the edge cannot produce trustworthy expected bytes (a structurally incomplete build —
`buildGraphDocument`'s own `diagnostics.isStructurallyComplete === false`, the join lane's M2
boundary review blocker #2 first-class build-diagnostics surface: a registry shard skipped for a
structural parse reason, or a malformed raw fr log line — or an unexpected exception from
`buildGraphDocument`/`renderSite`), every declared `render-site-v1` path gets a loud, named
`ok:false` ERROR naming the concrete structural-loss entries, never a silent pass or skip.

**Edge-only wrinkle: the snapshot text map doesn't cover `build/`.** `src/store/
snapshot-load.ts`'s `RepoSnapshot` text map is bounded to the six pre-M2.6 gates' declared
Inputs (`definitions/`, `argument/`, `proofs/`, `refs/`, `runs/`, `report/`, `.rk/`) — `rk
render`'s default output directory, `build/site/`, is not among them, so `snapshot.get("build/
site/index.html")` would be `undefined` even when the file exists on disk. Widening
`src/store/snapshot-load.ts`'s include rules is join-lane territory (`src/store/**`) this WP does
not touch. Instead, `src/cli/check.ts`'s `augmentSnapshotForRenderSite` reads the handful of
declared `render-site-v1` paths directly at the edge and hands ONLY Gate 7's own invocation an
augmented snapshot carrying those extra entries (read via plain `fs.readFileSync`, never through
`loadSnapshot`'s include-rule walk) — every OTHER gate still sees the original, unaugmented
snapshot. Flagged here as a residual gap for a future WP to close properly (a `build/` — or,
better, a "declared generated artifact" catch-all — include rule in `src/store/
snapshot-load.ts` itself), not something this repair wave resolves at the root.

**Failure mode guarded.** The same one Gate 2 Check 11 already guards for its two files,
generalized: a generated artifact (a rendered index, a dependency graph, any build output a
repo has declared) silently drifts out of sync with the source data it was rendered from, and a
reader or downstream tool trusts the stale copy. CLAUDE.md Rule 9: "Generated vs authored, never
mixed... `build/` outputs are never hand-edited." This gate is the mechanical enforcement of
that rule for any artifact a repo opts into declaring.

**Inputs.**
- `.rk/generated.json` (schema `schemas/generated.v1.json`): `{"schema_version": "1", "entries":
  [{"path": <repo-relative string>, "generator": <string>}, ...]}`. Optional file — read via the
  same `RepoSnapshot` every other gate reads (`src/store/snapshot-load.ts` gained a one-level
  `.rk/` include rule for exactly this; `.rk/config.json` keeps its own separate edge path,
  `src/store/config-load.ts`, unaffected).
- **Recognized generators.** Two SHAPES: (a) `src/gates/freshness.ts`'s `GENERATORS` map — pure
  `(snapshot) => string` functions this gate calls itself: `linker-index` (renders
  `argument/INDEX.md` via `src/gates/linker-render.ts`'s `renderIndex`, over the same
  `parseRegistry` every Gate 2 run computes independently), `linker-dag` (`DAG.md` /
  `renderDag`, same source). (b) `RENDER_SITE_GENERATOR` — `render-site-v1`, EDGE-SUPPLIED (see
  "Edge-supplied generators" above): recognized, but this gate never regenerates it itself. A
  manifest entry naming any OTHER generator id (neither (a) nor (b)) is now a BLOCKING ERROR —
  see Check 4, below (M2 boundary review blocker #3a; flipped from the pre-repair "not an error
  by itself" state).

**Checks.**
1. **Manifest shape and schema enforcement** (M2 boundary review blocker #4 hardened the version/
   key checks). `.rk/generated.json` absent ⇒ no finding at all (the whole-mechanism
   presence-conditional case, below). Present but not valid JSON, not a JSON object, or missing
   an `entries` array ⇒ ONE ERROR at `.rk/generated.json:1` naming the shape defect, and the
   manifest is treated as declaring ZERO entries for every other check (never silently read as
   "absent" — a malformed manifest is a real, visible defect, a different state from "never
   adopted"). Given a JSON object with an `entries` array, THREE further schema checks each fire
   independently (any subset may fire together on the same manifest): missing `schema_version`
   ⇒ ERROR; `schema_version` present but not exactly the const `"1"` (`schemas/generated.v1.json`)
   ⇒ ERROR naming the actual and expected values (a future incompatible manifest version must
   never silently run under today's v1 semantics); any top-level key other than `schema_version`/
   `entries` ⇒ ERROR naming the extra key(s) (`additionalProperties:false`). An individual
   `entries[i]` that is not EXACTLY `{path: non-empty string, generator: non-empty string}` —
   including one carrying any THIRD key — ⇒ one ERROR per malformed entry, naming its index (and,
   for an extra key, the key itself); every OTHER, well-formed entry in the same manifest is still
   individually checked (same "flag, never silently exclude the rest" discipline Gate 1's DRIFT
   dedup and Gate 2's duplicate-id check already use).
2. **Whole-mechanism presence-conditional.** `.rk/generated.json` entirely absent from the repo
   ⇒ zero findings, coverage line `checked freshness: 0/0 generated artifacts (manifest not
   adopted: .rk/generated.json absent)`. This generalizes Gate 2 Check 11's own per-file
   precedent (R14, rk-1rv) and Gate 6's `report/`-root precedent (R13, rk-au6) to the gate as a
   whole: a repo that has never adopted the manifest mechanism has, by construction, nothing
   declared for this gate to check — never a finding, never a silent `0/0` with no explanation
   (CLAUDE.md L2).
3. **Per-entry regenerate-and-diff**, for every well-formed entry whose `generator` is
   recognized (either shape): if `path` is absent from the repo ⇒ ERROR `<path> is declared in
   .rk/generated.json (generator '<gen>') but is absent from the repo — regenerate it or remove
   the manifest entry`. If present, regenerate (a `GENERATORS` entry computes this itself; a
   `render-site-v1` entry reads the edge-supplied bytes) and byte-compare; a mismatch ⇒ ERROR
   `<path> is STALE (regenerate via '<gen>') — first difference at line <n>: have "...", want
   "..."` — naming both the file and the first differing line (line-based diff, 1-indexed; when
   one render is a strict prefix of the other, the divergence is reported at the line immediately
   past the shared prefix). An exact byte match ⇒ no finding. For `render-site-v1` specifically,
   if the edge could not supply expected bytes at all (no `externalRegen` entry for this path —
   always true through the plain `Gate.run` interface — or an `ok:false` structured failure) ⇒
   ERROR `<path> cannot be regenerated for verification (generator 'render-site-v1'): <reason>`,
   checked before the have/want comparison ever runs.
4. **Unrecognized generator** (M2 boundary review blocker #3a — flips the pre-repair behavior). A
   well-formed entry whose `generator` id is recognized as NEITHER a `GENERATORS` entry NOR
   `render-site-v1` ⇒ now a BLOCKING ERROR: `<path> is declared in .rk/generated.json with an
   unrecognized generator '<gen>' — ...`. Named on the coverage line as "unrecognized generator",
   with the path and generator id; excluded from the numerator (`checked`, since this binary never
   attempted verification) but included in the denominator (`total`). Pre-repair this was the
   benign "not adopted" state (zero findings, exit green at `checked 0/1`) — the forward-
   compatibility rationale (a manifest entry declaring a not-yet-landed generator on an older
   binary) is no longer accepted: a typo'd or genuinely-unregistered id is indistinguishable from
   that forward-declaration case either way, so the safe direction is to ERROR both, never to
   green-light either.

**Coverage line.** `checked freshness: <checked>/<total> generated artifacts[ (<K> unrecognized
generator: <path> (generator '<id>'), ...)]`. `total` is every well-formed manifest entry;
`checked` is the subset whose generator this binary recognizes (attempted, whether the result
was clean, STALE, declared-but-missing, or — for `render-site-v1` — could not be regenerated for
verification at all); the parenthetical is present only when `K > 0`. The
whole-mechanism-absent case (Check 2) uses its own fixed text, `0/0 generated artifacts
(manifest not adopted: .rk/generated.json absent)`, distinguishing "never adopted" from
"adopted, zero entries declared yet" (`0/0 generated artifacts`, no parenthetical) and from
"adopted, malformed" (a manifest-shape ERROR, `0/0`, no parenthetical either — the ERROR itself
is what signals the difference from a clean empty adoption).

**Check 11 boundary** (the one thing this gate changes about a PRE-EXISTING check, Gate 2 Check
11, `src/gates/linker-render.ts`'s `checkGenerated`). Both a per-repo whole-manifest boundary and
a per-path boundary were considered; **per-path is the one implemented**, for a concrete safety
reason: — a path is superseded out of Check 11 (Check 11 stops byte-diffing it itself) **if and
only if** `.rk/generated.json` declares that exact path AND names a `generator` this gate
recognizes (`src/gates/freshness.ts`'s `freshnessSupersededPaths`). Declaring the SAME manifest
file with zero entries, or with an entry naming an unrecognized generator, supersedes nothing —
Check 11 keeps covering `argument/INDEX.md`/`DAG.md` exactly as before. This is deliberately
**stricter** than a simpler "any manifest present turns Check 11 off entirely" rule: under that
simpler rule, a freshly-adopted-but-not-yet-populated manifest (e.g. `.rk/generated.json`
stamped empty, or declaring only an unrelated artifact) would silently stop Gate 2 from ever
byte-diffing `argument/INDEX.md`/`DAG.md` again, while Gate 7 also has no entry for them yet —
a real, silent double-gap neither gate would report. Keying supersession to the SPECIFIC path
(and specifically to a generator this binary can actually verify) closes that gap by
construction: a path is only ever unchecked by NEITHER gate if it is simultaneously absent from
the repo tree (nothing to check) — the only state that was always a non-finding under Check 11
too. `mirrorStatus` entries for a superseded path report `superseded (see freshness gate)` on
Gate 2's own coverage line, rather than `present`/`absent (not adopted)`, so a reader always sees
which gate is responsible for that path's staleness.

**Ratified (M2 boundary review, this session's repair wave).** The per-path (not whole-manifest)
Check-11 supersession rule above, the declared-but-missing semantics (Check 3), and
`freshness-05` (malformed-manifest-is-never-silently-absent) were all flagged unreviewed-at-Tier-A
by the first landing. The M2 boundary review examined all three and ratified them as permanent,
unchanged: "the per-path Check-11 supersession rule itself is ratified, declared-but-missing
semantics are correct... keep `freshness-05` permanently." No code change accompanies this
paragraph — it closes the open Tier-A question the first landing's own text flagged (see this
section's prior revision for the exact wording of that question) and bd rk-9lg (the bead tracking
it).

**Known limitations.**
- `linker-index`/`linker-dag` re-derive `parseRegistry(snapshot)` independently of Gate 2's own
  run over the same snapshot (same "deliberately re-implemented, not imported, to preserve
  independent re-parse" discipline `provenance-20`'s fix already established for Gate 4) — a
  parse-time ERROR in a shard (e.g. a duplicate id) does not prevent Gate 7 from still attempting
  a regenerate-and-diff against whatever partial/best-effort lemma set `parseRegistry` produces;
  this mirrors Gate 2 Check 11's own pre-existing behavior (`checkGenerated` already renders
  against `lemmas` regardless of `parseErrors`), unchanged by this WP.
- **Resolved this session (was a Known limitation; superseded by Check 4, above):** a manifest
  entry's `generator` id space is still a flat, unnamespaced string with no registry of
  "known-but-not-yet-shipped" ids — a typo in a `generator` value (e.g. `"linker-indx"`) remains
  indistinguishable from a genuine forward-declaration of a not-yet-landed generator. The pre-
  repair acceptance of that ambiguity (both read as benign "not adopted", never an ERROR) is what
  the M2 boundary review's blocker #3a rejected: both cases now ERROR identically, on the
  reasoning that an unverifiable declared artifact must never exit green regardless of WHY this
  binary cannot verify it. A repo that legitimately wants to forward-declare a not-yet-landed
  generator id must accept a blocking ERROR until it upgrades — there is no longer a silent,
  non-blocking middle state.
- `render-site-v1` verification depends on `src/cli/check.ts`'s `northStarId` defaulting
  (`.rk/config.json` only) matching whatever `rk render` itself was actually invoked with. A
  render invoked with an explicit `--north-star`/`--title` CLI override (`rk check` has no
  equivalent flags) will legitimately diff against this config-only regeneration — a false STALE,
  not a real one. Accepted for this repair wave, flagged as a residual concern; the eventual fix
  either records the options used in the manifest entry itself (a schema addition) or drops the
  override flags from `rk render` in favor of `.rk/config.json`-only configuration.
- The `RepoSnapshot` text-map / `build/` gap this session's edge-side `augmentSnapshotForRenderSite`
  works around (see "Edge-supplied generators" above) is a workaround, not a fix — the proper fix
  (widening `src/store/snapshot-load.ts`'s include rules) is join-lane territory this WP does not
  touch, flagged as a residual concern for a later WP.

**Divergences from AISM (triage).** N/A by construction — Gate 7 is a NEW rk-only mechanism with
no AISM script counterpart to characterize or diverge from (AISM's `argument.py --generate`/
`--check` pair is the un-generalized, hardcoded precursor this gate supersedes for repos that
adopt the manifest; it is cited as prior art in Gate 2's own section, not repeated here).

**Historical schema-drift tolerance.** N/A — this is a new schema (`generated.v1.json`) with no
prior history to tolerate drift against.

**Corpus fixtures required** (landed this WP, M2.6; `freshness-06`..`freshness-11` landed the
M2 boundary review repair wave, blockers #3/#4 — see this WP's final report for the proposed
`corpus/README.md`/`src/corpus/discovery.ts` `EXPECTED_FIXTURE_COUNT` delta these six add, not
yet applied here since both files are out of this repair wave's scope):

| id | violation |
|---|---|
| `freshness-01` | clean regenerate golden case — `argument/INDEX.md` byte-identical to a fresh render, manifest declares it under `linker-index` ⇒ zero findings, `checked=1/1` |
| `freshness-02` | **hand-edited generated file** [M2.6-mandatory, IMPLEMENTATION_PLAN M2.6's acceptance clause] — `argument/INDEX.md` hand-edited so it diverges from a fresh render ⇒ ERROR naming the file and the first differing line |
| `freshness-03` | declared-but-missing — the manifest declares `argument/INDEX.md`, the file does not exist in the repo ⇒ ERROR, distinct from the presence-conditional golden case below |
| `freshness-04` | no-manifest presence-conditional golden case — `.rk/generated.json` entirely absent ⇒ zero findings, coverage names the non-adoption (sibling to `linker-25`/`shards-15`'s per-file/per-directory precedent) |
| `freshness-05` | malformed manifest (not valid JSON) ⇒ one loud ERROR, never silently read as "absent" (would otherwise misroute into `freshness-04`'s golden-pass state) |
| `freshness-06` | **blocker #3a** — unrecognized generator id (`render-html-v2`) declared for `argument/INDEX.md` ⇒ BLOCKING ERROR, `checked=0/1`, never the pre-repair silent "not adopted" green exit |
| `freshness-07` | **blocker #3** — `render-site-v1` declared for `build/site/index.html`, exercised through the plain 2-arg `Gate` interface (no edge-supplied bytes, exactly what the corpus harness always uses) ⇒ ERROR "cannot be regenerated for verification"; the full edge pipeline (clean-pass / hand-edited-STALE) is proven separately in `test/cli-check.test.ts`'s render-site-v1 suite, since only `src/cli/check.ts` ever supplies `externalRegen` |
| `freshness-08` | **blocker #4** — manifest missing `schema_version` entirely ⇒ ERROR |
| `freshness-09` | **blocker #4** — manifest `schema_version: "2"` (wrong version) ⇒ ERROR naming both the actual and expected value |
| `freshness-10` | **blocker #4** — manifest carries an extra top-level property ⇒ ERROR (`additionalProperties:false`) |
| `freshness-11` | **blocker #4** — a manifest entry carries an extra property beyond `path`/`generator` ⇒ per-entry ERROR, entry dropped entirely (`checked=0/0`) |
