# PRD — General-Purpose Automated Theoretical-Research Tool

Working name: `rk` (research kit). Name is a placeholder; the CLI conventions below assume
a short binary in the af/fr/bd family style.

Status: draft v2, 2026-07-17. v1 was adversarially reviewed (hostile Fable review, verified
against the vibefeld/knowledge-frontier/AISM source); all blocker/major findings are folded
into this revision.
Design input: `DISTILLATION.md` (same directory) — the seven-repo synthesis. Read it first.
This PRD states WHAT is being built and the acceptance bars. HOW lives in later design docs.

---

## 0. Decision record (2026-07-17, TJO)

These five decisions are settled. Do not relitigate without new evidence.

| # | Question | Decision |
|---|---|---|
| D1 | Unified DAG vs. thin seams | **Middle path.** Per-tool ledgers (af, fr, bd, registry) remain sources of truth. A read-only projection layer renders the unified AND/OR graph. No shared ledger. |
| D2 | Lab book: generated vs. gated-manual | **Generate as much as possible via the deterministic pipeline.** All derived artifacts are build outputs; hand-editing a generated file is a gate failure. Only the narrative worklog remains authored. |
| D3 | Ground-truth database scope | **Per-repo.** The refs/manifest pattern stays inside each research repo. No global store. |
| D4 | Bandits/MCGS for exploration control | **Open, leaning yes.** AISM is aimlessly wandering despite fr; the suspicion is that a real allocation policy is needed, not just anti-gaming. Build it as an instrumented experiment (§6) with kill criteria, not as a settled feature. |
| D5 | Lean4 | **Out of scope entirely.** Not a final gate, not a rung, not a roadmap item. The rigour ladder tops out at af-validated + cited. |
| D6 | af/fr release model | **Lockstep = co-ownership, not co-packaging** (amended 2026-07-17). Repos stay separate; af, fr, bd remain independently cloned/built. "Lockstep" means TJO (and the orchestrator) own all the repos, so any feature rk needs in af/fr is immediately subagented into that repo and shipped — no upstream negotiation, no waiting. Compatibility is managed, not merged: rk records the af/fr versions it was tested against and `rk doctor` verifies installed binaries match (this, not a monorepo, is the fix for the stale-binary bug class). Seam schemas carry explicit version fields. |
| D7 | Implementation language | **rk is TypeScript on Bun**, fr style: pure core, zero runtime deps, `bun build --compile` single binaries. **af stays Go for now** — porting benefits are unclear; maybe one day, not this day. If a port ever happens, the acceptance bar is byte-identical `af replay --verify` output on the full historical ledger corpus. Consequence: af-side changes are made in Go in `../vibefeld`; the kernel changes needed are deliberately small (§4 C3), with the orchestration intelligence living rk-side in TS. |
| D8 | Agent backends | **Multi-backend provers and verifiers.** Claude Code, codex, and optionally other headless coding agents are all first-class prover/verifier workers — not codex-only. Backends are a registry with per-role/per-tier assignment (§4 C9). Prompt caching and token efficiency are to be exploited aggressively per backend. |
| D9 | Status of prior art (added 2026-07-17) | **AISM and the sister repos are evidence, not canon.** They kind-of-work with many known problems; their incident histories are load-bearing data, their behavior is never the spec. rk's contracts are normative; rk-vs-prior-art differences are handled by divergence triage (rk-stricter-intended / rk-bug / ambiguous), never by matching known-wrong behavior for "parity". |

Clarification on D2 vs. the standing no-remote-CI rule: "CI/CD" here means the **local
deterministic pipeline** (pre-commit gate, session hooks, `rk render`). Remote CI remains
banned per the standing user directive ("failure-email noise is worse than zero signal").
If a remote runner is ever wanted, that is a new decision, off by default.

---

## 1. Mission

A git-clonable, general-purpose tool that runs the automatable parts of theoretical
research (mathematics, theoretical physics) while enforcing a hard validity barrier: no
hallucinated claims, no result stated above its evidence level, ever. The interface is an
orchestrator agent (Claude Code or any headless-CLI harness) governed by a constitution the
tool installs and enforces via hooks and gates. Natural language is the medium of
development; adversarial agent verification is the correctness mechanism.

The tool is the extraction and completion of the architecture that evolved across
`vibefeld`, `knowledge-frontier`, `arithmetic-quantum-mechanics`, `cft-anyons`,
`almost-idempotent-{channels,positive-maps,stochastic-maps}`. Reference implementation of
the target workflow: `../almost-idempotent-stochastic-maps` (AISM).

## 2. Users and mode of use

Single researcher (or small group) running long agentic research campaigns. Two phases,
both first-class, with an explicit gated transition:

- **Exploration phase**: cheap, fast, lightly logged. Lazy convention-fixing, L5 soft
  verification only, numerics, negative-result hunting. cft-anyons-v2-weight process.
- **Consolidation phase**: contract-shaped claims, eager definitions, af hard tier,
  generated report. AISM-weight process.

The failure mode to design against (proved by cft-anyons v1): mandatory-everywhere
ceremony. Every gate binds at a promotion boundary, never on exploratory motion.

## 3. Product shape

```
# one-time
git clone <rk> && make install        # installs rk, af, fr, bd (pinned versions)

# per project
mkdir my-conjecture && cd my-conjecture && git init
rk init "Every X with property P is O(√η)-close to a Y"
# → stamps the four-layer repo, constitution, hooks, gate wiring, oracle registry
claude   # orchestrator session begins; hooks inject board + constitution state
```

`rk init` output (the scaffold) is the entire repo skeleton:

```
PRD.md  CLAUDE.md==AGENTS.md  HANDOFF.md  CONVENTIONS.md  FINDINGS.md
definitions/   argument/   proofs/   runs/   refs/   docs/worklog.md
.rk/           # tool state, generated-artifact manifest, pipeline config
.frontier/     # fr state        .beads/  # bd state
build/         # ALL generated artifacts (gitignored or committed per config)
```

Every stamped document carries a ROLE / UPDATE POLICY / TRIGGER header and is classified
**authored-append-only**, **rewritten-whole**, or **generated** — never mixed.

## 4. Components

### C1. Scaffold + constitution (`rk init`, `rk upgrade`)
- Stamps the four-layer repo and a parameterized constitution (Laws, Rules, stop
  conditions, session-close ritual) with project-specific slots (goal, north-star
  contract, compute budget, model policy).
- Installs hooks: SessionStart (`bd prime`, `fr board`), UserPromptSubmit (`fr turn-begin`
  + board), Stop (`fr check`), PreCompact (`bd prime`), pre-commit (`rk check`).
- `rk upgrade` migrates a repo to a newer scaffold version (constitution and gate updates
  must be distributable to live projects; copy-paste drift between sibling repos is the
  disease this cures).
- Phase switch: `rk phase exploration|consolidation` adjusts which gates are advisory vs.
  blocking. The transition consolidation→ is a logged, deliberate act.

### C2. Registry + linker (`rk link`)
Extraction of AISM's `definitions/` + `argument/` + `scripts/argument.py` into a
maintained package (no more repo-local copies).
- Layer 0: one term per shard; alias dedup is a build failure; kinds cited/consensus/
  original; definitions are never "proved."
- Layer 1: one result per shard; `contract` (one-line statement) is the universal join
  key; `deps` (AND) + `routes` (OR); statuses from the rigour ladder (§5).
- Linker enforces: acyclicity, import resolution, contract byte-match against af root and
  report anchors, monotone status propagation (a rigorous node never depends on a
  non-rigorous one through its satisfied route), brittleness bounds (**per-repo
  parameter**; default soft cap 26 nodes — AISM raised it from 12 after the low threshold
  "cried REFACTOR on ~20 healthy validated trees"; no depth check by default), orphan
  detection, bd issue sync, and a **critical-path provenance check**: every node on the
  path to the north-star contract must carry cross-vendor, non-batch validation
  provenance — checked continuously on every link run, because path membership changes
  when edges are added, not only at verdict-apply time (see C9).

### C3. Validity kernel: af (existing, upgraded in place — stays Go, per D7)
af remains a separate binary in its own repo (`../vibefeld`) with its own ledger. Needed
features are subagented into that repo directly (D6). The kernel-side changes are
deliberately minimal; everything requiring orchestration intelligence lives rk-side in TS
(C9). Kernel upgrades (Go), in priority order:
1. **Batched verification as a native mode.** Definition: the dispatch unit changes from
   one node = one fresh verifier agent to one fresh hostile verifier over a set of N
   verification-ready items. Honest cost model: per-node context has a shared part
   (conjecture, definitions, common ancestors) and a per-item part (the node's own
   statement, deps, scope, checklist) — batching moves N×(C_shared + c_i + v) to
   C_shared + Σ(c_i + v). The win is real for sibling leaves of one subtree and shrinks
   for scattered nodes, so **the batch composer optimizes for shared-context batches
   within the independence constraint** (siblings of validated subtrees are both
   independent and context-sharing). Overall savings are a hypothesis to be measured
   (SC4), not a design fact. The verifier returns a schema-validated verdict list — per
   item accept | challenge(target, severity, reason), with mandatory per-item
   justification (no blanket accepts). The driver applies these as N individual ledger
   events (per-node NodeValidated/ChallengeRaised — never a wholesale subtree accept),
   attributed to the verifier identity plus a recorded batch id. `af verdicts apply` must
   define **partial-failure semantics**: accepts are order-dependent (children before
   parent) and a mid-batch challenge can legitimately block later accepts — the verb
   applies what it can, reports per-item outcomes, and never leaves the ledger ambiguous.
   **Reviewer ≠ author, honestly stated:** af today records no author identity on nodes
   and no verifier identity on validations — the separation is enforced by the driver's
   process discipline and prompt convention, not by the kernel. The upgrade makes it
   *recorded and mechanically checkable* (author/verifier identity fields, checked at
   verdicts-apply), which is provenance, not adversary-proof enforcement: all identities
   are supplied by the driver, so the trust anchor remains the driver's role separation
   (C9). Do not claim more than this anywhere.
   Traded: verifier independence *within* a batch (one bad session correlates errors
   across N items). Mandatory guardrails: batch cap (~10); composition rule (routine,
   logically independent items only — never a chain where accepting item k biases item
   k+1); **critical-path exclusion** (nodes on the path to the north star always get
   per-node, cross-vendor treatment); batch provenance in the ledger so promotion policy
   can distinguish batch- from singly-validated; `af unvalidate --batch <id>` as the
   bulk-revocation lever.
   This is the AISM W56 pattern, today hand-orchestrated outside af at the L5 tier only.
   Kernel surface needed: **author identity on nodes and verifier identity + batch id on
   validation events** (a real schema addition, not an optional-fields patch), the
   verdict-file ingestion verb (`af verdicts apply <file>`, schema-validated), and
   `af unvalidate --batch <id>`.
2. **Projection export**: `af export --graph json` stable schema for C5, with an explicit
   schema-version field (D6).
3. Retain: Lamport IDs, three-axis state, taint, escape hatches with recorded debt,
   self-teaching CLI, exit-code contract. Ledger format changes require a version bump
   and a replay-compatibility test against the historical corpus. The corpus is AISM's
   44 workspaces plus the firstproof ledgers **vendored into vibefeld's test tree if
   recoverable** (the ../firstproof checkout no longer exists locally); if unrecoverable,
   AISM's workspaces are the corpus. The replay invariant, stated precisely: identical
   derived state and a passing `af replay --verify` content-hash check — not
   "byte-stable output" (replay emits a stats summary, not a canonical dump).

Everything else that §5 of the distillation identified as af cost levers — persistent
worker sessions, prompt caching, structured worker output, dispatch policy — is driver
territory and moves to C9 (rk, TS), replacing `auto-prove.sh`. The af kernel never talks
to an LLM; it only records events. That boundary is what lets af stay Go while all new
orchestration intelligence is TS.

### C4. Exploration controller: fr (existing, upgraded) + the bandit experiment (§6)
Required upgrades independent of the bandit question:
1. The unbuilt ingest landings (gap→arm, refutation→dead-route) and the crack→supersedes
   credit-assignment loop.
2. **Automated audit cadence**: the AISM 07-04 audit metrics become built-in instruments,
   computed by `fr audit` and surfaced on the board every N cycles — concentration (share
   of pulls on the top mechanism cluster), no-pull rate, frontier turnover,
   banked-per-100-cycles. Division of labor, fixed here to respect fr's zero-deps/<50ms
   hook laws: **fr's detection is lexical, over a new required `mechanism` tag** on every
   pull (relabeling becomes a schema-visible act at write time); **semantic clustering of
   residuals belongs to `rk audit`** (an agent, off the hook path), which is what caught
   the A→D→G relabeling historically. Only the no-pull rate (49%) is mechanically
   recoverable from the untagged historical log; the concentration instrument is
   validated on seeded relabel fixtures and new tagged cycles, not by reproducing the
   historical 83% (which was a semantic, agent-derived number). Today these audits are
   human-initiated; that is the single biggest gap in the anti-wandering machinery.
3. Death-certificate quality gate: a `died` outcome without a falsifiable post-state
   ("statability") is rejected at write time.

### C5. Projection layer (`rk graph`) — D1
Read-only, deterministic, stateless. The registry is the spine; the other three stores
join to it by **different keys per edge** (there is no universal join key — fr records
carry no contract strings, and registry ids are not stable across renames):

| Edge | Join key | Known hazards |
|---|---|---|
| registry ↔ af | contract byte-match, located via the shard's `workspace:` field | workspace dir ≠ id after renames (legal; keyed on `workspace:`) |
| registry ↔ bd | registry id (linker-synced issues) | none known |
| registry ↔ fr | `evidence.artifact` path resolution + `graduates`/oracle ids | free-text paths; expect a real **unresolved-reference bucket**, surfaced as its own view, never silently dropped |
| registry ↔ report | shard label/id anchors (as check-provenance does today) | anchors are ids, not contracts |

Outputs: a single graph document (stable JSON schema) consumed by C6, plus terminal views
(`rk graph --focus <id>`, critical path, taint trace across the whole campaign, "what
blocks the north star") — the critical-path query is also a dependency of the batch
composer's exclusion rule (C9), so it ships with the schema, not after it.
Conflicts (e.g. registry says proved, af ledger says pending) are rendered as first-class
defects, not resolved silently.

### C6. Generation engine (`rk render`) — D2
All derived artifacts are build outputs of the local pipeline, regenerated by hooks and
pre-commit; hand-editing a generated file fails `rk check`.
Generated:
- **Interactive HTML report** (the missing greenfield piece): status dashboard; zoomable
  AND/OR DAG with rigour-colour coding and drill-down (node → contract → af proof tree →
  ledger events → verdicts); definitions index; conventions ledger view; dead-route
  graveyard; run-bundle gallery with embedded figures/demos; per-claim provenance chains
  (claim → source manifest → SHA256 → quoted locus). Self-contained static site, no
  server, no external CDN. This artifact is regenerated on session close and is the
  primary human surface.
- All INDEX/CATALOG/DAG/status files (today gate-checked manual mirrors; tomorrow outputs).
- **LaTeX generation is deferred** until the HTML artifact has proven the
  generated-artifact contract (review finding: existing reports like AISM's are 100%
  authored — theorem statements live inside prose, so a generator implies either
  duplication or a migration of a live gated document; that is a separate, explicitly
  scoped project, not a render feature). When it lands: section stubs, theorem
  statements, provenance tables, and the DAG figure generated from the registry, prose
  bodies authored inside fenced manual blocks the generator preserves and the gate
  checksums — developed on a fresh fixture first, with any migration of an existing
  report as its own work package.
- **The renderer is itself a trust surface**: a bug that paints a `stated` node with
  `proved` styling defeats the whole artifact silently. Rendering-truthfulness fixtures
  (one node per status, asserted against emitted markup) are part of the gate corpus.
Authored (never generated): worklog narrative, FINDINGS entries, LEARNINGS retractions,
CONVENTIONS reasoning, proof prose. The generator's job is to make "lockstep" a
non-concept: derived views cannot drift because they are not maintained.

### C7. Ground-truth library (`rk refs`) — D3
Per-repo. Extraction of fetch-refs/check-refs/SOURCES-manifest into the package:
- `rk refs add <locator>` — fetch (arXiv/DOI/local file), hash, extract (PDF→text/markdown
  via marker where available), write manifest row (citation, locator, retrieval route +
  date, SHA256 of payload and extraction).
- `rk refs quote <source-id> <pattern>` — locate + emit a byte-verbatim quote with
  path:line anchor for use in claims and code comments.
- `rk refs check` — every citation in the repo resolves; every quote grep-F-matches its
  source; **must fail loudly on zero-coverage** (the AISM false-green incident is the
  canonical regression test).
- No pirate sources; payloads gitignored, manifests tracked, reacquisition route recorded.

### C8. Gate suite (`rk check`)
One command, local only, wired into pre-commit. Composes: defs gate, linker, refs gate,
provenance/overclaim gate, runs gate (bundle completeness + invariant present), generated-
artifact freshness (regenerate and diff), report build.
**Guard-the-guards requirements (new, non-negotiable):**
- Every gate ships with its own red tests (a seeded violation corpus; each gate must fail
  on its corpus in CI-of-the-tool, and `rk check --selftest` runs them in-repo).
- Gates report coverage ("checked 19/19 externals"), never silently skip; a skip is a
  visible warning with a count.
- `rk audit` (scheduled, e.g. every N sessions per the constitution): spawns the
  adversarial process-review — read-only reviewer agents over the repo hunting overclaim,
  convention drift, gate rot, and wandering — the AQM mega-review and AISM operational
  audit as a packaged, recurring workflow instead of a heroic one-off.

### C9. Verification orchestration (`rk verify`) — the driver, TS/Bun
Replaces `auto-prove.sh`. The two-tier policy as tooling, not convention:
- **L5 soft tier (default)**: batch dispatch of fresh hostile verifiers over a set of
  registry shards; per-shard verdicts VALID / VALID-WITH-CORRECTION / INVALID recorded as
  artifacts. The **L5 verdict store** is a first-class deliverable, not an afterthought
  (this tier carries the bulk of the work): append-only, hash-bound to shard content
  (stale on edit), queried by the linker for `stated`→`proved-mod-audit` promotion and by
  the freshness gate.
- **Hard tier**: seed + drive an af workspace (`rk verify --af <id>`), with the guardrails
  proven in AISM (prover-overreach abort, balloon tripwire with classification, stuck
  guard) plus the C3 batch mode.
- **Ballooning as an epistemic signal, not just an abort.** A proof tree ballooning past
  the node cap is a powerful indicator that the statement's assumptions were not properly
  stated. The tripwire therefore does not merely kill the run — it emits a structured
  **balloon event**: {contract id, node count, classification: missing-fact |
  dag-dep | genuine-gap, offending subtree}. Routing: missing-fact → a definition/
  assumption provisioning task (bd); dag-dep → a factoring task; genuine-gap or a
  **repeat balloon on the same contract → mandatory contract review** — the hypotheses
  are suspect, the shard is marked (`balloons:` counter + classifications in registry
  frontmatter), the linker surfaces balloon-flagged contracts as warnings on the board,
  and any contract revision automatically stales hash-bound verdicts. `rk audit`'s
  overclaim lens treats balloon-flagged contracts as priority targets for
  unstated-assumption hunting. Ballooning thereby updates orchestrator state every time
  it fires, instead of being a cost guardrail that discards its own diagnosis.
- **Backend registry (D8)**: prover/verifier workers are pluggable headless agents —
  Claude Code (`claude -p`), codex (`codex exec`), and any future CLI that satisfies the
  worker contract (prompt in, structured verdict out, exit-code discipline). Config
  assigns backend per role × tier (e.g. prover=claude/high, routine-verifier=codex/high,
  creative-strategist=codex/xhigh), with fallbacks when a backend is unavailable.
  No backend is privileged: Claude Code is a first-class prover *and* verifier, not just
  the orchestrator.
- **Cross-vendor rule**: promotion to `proved` requires verifier model family ≠ prover
  model family for load-bearing claims (constitution-configurable; default on). Checked
  at verdict-apply time **and continuously by the linker** (C2's critical-path provenance
  check), because path membership mutates as edges are added — apply-time-only checking
  leaves nodes that *become* load-bearing unguarded. **Grandfathering**: existing results
  validated under the old same-family regime (all 44 AISM workspaces are codex-prover +
  codex-verifier by standing directive) are not demoted; they carry an explicit
  `legacy-same-family` provenance mark, the linker reports them on the critical path as
  warnings, and re-verification is prioritized by path criticality, not forced wholesale.
- **Token efficiency is a driver responsibility**: persistent worker sessions per
  role-node claim (role isolation is identity-based, not process-amnesia-based; a session
  is never reused across roles); per-backend prompt caching with stable prompt prefixes
  (shared context first, item last). What is known vs. assumed, stated honestly:
  Anthropic caching is byte-exact prefix matching across separate requests (~5-min TTL) —
  but rk does not control the headless CLI's prompt assembly ahead of its own prompt, so
  cache-hit rates must be **measured in a spike before the design freezes**, not assumed;
  and **concurrent identical requests all miss** until the first response streams, so the
  dispatcher staggers the first call of every same-prefix group. Codex-side caching is
  automatic and opaque with smaller discounts — the cross-vendor rule partially forfeits
  the caching lever, an accepted trade (validity outranks cost). Batch composition,
  bottom-up-ready dispatch, per-tier effort caps and burst budgets round out the levers.
  The driver reports tokens/calls per validated node so success criterion 4 is measured,
  not estimated.
- Model/effort policy lives in `.rk/` config; harness-agnostic throughout.

## 5. The rigour ladder (normative, unchanged from AISM minus Lean)

| status | rigorous | meaning |
|---|---|---|
| cited | yes | byte-matched to a hashed local source via C7 |
| proved | yes | af-validated (root validated, taint clean) or L5+af per policy |
| consensus | yes | recorded human sign-off |
| proved-mod-audit | no | paper-proved, not yet independently re-verified here |
| stated / conjecture / heuristic | no | honestly labeled non-results |
| numerical | no, permanently | evidence bundle with invariant; a ceiling, never a rung |
| open / obstruction / disproved | no | frontier and graveyard |

Trust is monotone: only external oracles (fresh verifier, byte-match, fr verify oracle)
promote; self-report only downgrades; verdicts are hash-bound and go stale on any change
to claim, oracle, or inputs. The ladder tops out here — no Lean rung exists (D5).

## 6. The exploration-allocation experiment (D4)

Hypothesis: AISM wanders because fr only *referees* (blocks unlogged turns, breaks stalls)
but never *allocates* — the orchestrator still chooses every next wave, and LLM
orchestrators exploit by default. A real policy might fix what anti-gaming alone did not.

Build, behind a flag (`fr policy bandit`), as an experiment:
- **Returns**: tier-weighted outcomes (banked=T0 high, refuted medium — information is
  positive, progress low, died small-positive with a valid death certificate, relabeled
  residual zero). Rigor-weighted so laundering low-tier motion into "return" is impossible.
- **Policy v1**: decaying optimism over untried/stale arms + concentration penalty
  (the roadmap item never built), computed over the append-only log; recommendation
  emitted on the board each turn: "next wave: arm X (allocation reason)."
- **Binding force**: the orchestrator either follows or files a *logged deviation* with a
  reason; deviation rate is itself a board metric. (Hard-blocking dispatch on
  over-allocated arms is a v2 escalation, only if logged deviation proves toothless.)
- **Experiment design — contemporaneous control, not historical comparison** (review
  finding B2: the audited 83%/49% baseline came from cycles 1–106, exploration phase,
  pre-anti-gaming-fixes, under a different instrument; any improvement over it at cycle
  434+ would be unattributable — those numbers remain *motivation*, never the decision
  rule). Two stages on the live campaign:
  1. **Shadow mode**: the policy emits recommendations that are logged but hidden from
     the orchestrator; measure counterfactual agreement/divergence and what the policy
     *would* have changed. Cheap, zero-risk, runs first.
  2. **Interleaved epochs (ABAB)**: alternate policy-on / policy-off blocks of
     pre-registered length on the same campaign, same instrument, same phase; compare
     within-campaign — concentration over mechanism tags, no-pull rate,
     distinct-mechanism coverage per 20 cycles, banked/refuted per 100 cycles, deviation
     rate. Pre-registered thresholds on the A-vs-B contrast decide adopt/kill.
- MCGS over the OR-route graph (using C5's projection as the game tree) is explicitly
  deferred until bandit-v1 has verdicts.

## 7. Out of scope

- Lean/Coq/Isabelle formalisation, in any role (D5).
- Remote CI/CD, hosted services, servers, databases beyond flat files + SQLite (bd/dolt
  excepted as-is).
- A global cross-project knowledge store (D3).
- Multi-user collaboration/permissions; MCP servers (plain self-teaching CLIs suffice and
  keep the tool harness-agnostic).
- Replacing af/fr/bd with a monolith (D1).

## 8. Success criteria

1. **Cold start**: clone → `rk init` → first productive orchestrator session in under 30
   minutes, no copy-paste from sibling repos, on a fresh conjecture.
2. **No drift by construction**: zero gate-checked manual mirror files remain; every
   derived view is generated; `rk check` proves freshness. The AQM lab-log/HANDOFF drift
   class of failure becomes impossible, not just detected.
3. **Validity record**: across one full dogfood campaign, zero claims found above their
   evidence level by the scheduled `rk audit` that were not already self-reported —
   with the audit actually running on schedule, unprompted.
4. **Cost**: ≥3× reduction in tokens and calls per af-validated lemma vs. an
   **empirically re-measured baseline** — AISM's historical logs contain no token
   accounting and never used auto-prove.sh, so the denominator is produced by re-proving
   2–3 already-validated AISM lemmas under an instrumented implementation of the current
   per-node protocol *before* batching/caching are enabled. No fictional baselines.
5. **HTML artifact**: a third party can open the generated site for a campaign and answer,
   without help: what is proved, what is conjectured, what died and why, what any claim's
   provenance is — in under ten minutes.
6. **Exploration**: the §6 experiment reaches a pre-registered adopt/kill verdict on real
   campaign data via the shadow-then-ABAB protocol (contemporaneous control; the
   historical 83%/49% numbers are motivation, never the comparator).
7. **Portability**: the same scaffold runs a consolidation-phase campaign (AISM retrofit)
   and an exploration-phase campaign (a fresh cft-anyons-style programme) without
   modifying the tool.

## 9. Milestones

All rk code TS/Bun (D7). Repos stay separate (D6): af work happens in `../vibefeld` (Go),
fr work in `../knowledge-frontier` (TS), subagented on demand; rk pins tested versions and
`rk doctor` enforces the match.

- **M0 — Extraction.** C2 + C7 + C8 as an installable package, contract-correct per the
  gate contracts (D9: AISM's scripts are characterized prior art, not a parity target),
  with a fully-triaged divergence ledger on AISM HEAD (zero rk-bug entries) and the
  selftest corpus. AISM's `scripts/` deleted after the staged cutover disposition.
  `rk doctor` + version-compat manifest from day one.
- **M1 — Scaffold.** C1 stamps a new repo; dogfood on one fresh small conjecture.
- **M2 — Projection + render.** C5 JSON schema stable; C6 HTML site generated for AISM;
  generated-freshness gate replaces mirror-checking gates.
- **M3 — Verification orchestration.** C9 replaces auto-prove.sh: backend registry
  (claude + codex at minimum), native batching (with the C3 kernel verbs landed in
  vibefeld), persistent workers + prompt caching, structured verdicts, cross-vendor rule.
  Measure success criterion 4.
- **M4 — Exploration experiment.** C4 upgrades (in knowledge-frontier) + §6 bandit v1 on
  the AISM retrofit; pre-registered metrics collected.
- **M5 — Hardening.** `rk upgrade` migrations, `rk audit` scheduling, docs; second
  external-style dogfood (fresh exploratory programme).

## 10. Risks and escalation triggers

- **Ceremony relapse**: if exploration-phase friction complaints appear in dogfood
  worklogs, cut gates from that phase — the cft-anyons-v1 lesson outranks feature pride.
- **Generator lock-in**: if authored-prose preservation in C6 proves brittle (lost manual
  blocks), stop and redesign the manual-block contract before any wider rollout.
- **af upgrade risk**: persistent-worker caching must not weaken role isolation; any
  ambiguity → escalate, do not ship (validity barrier outranks cost).
- **Cross-repo drift risk** (the D6 model's cost): separate repos with co-evolving seam
  schemas can desynchronize. Mitigations: explicit schema-version fields on every seam;
  rk's version-compat manifest + `rk doctor` blocking on mismatch; a cross-repo smoke
  test in rk's selftest that drives pinned af/fr binaries end-to-end.
- **Backend asymmetry risk**: worker contracts (prompt caching semantics, structured
  output, exit codes) differ across claude/codex/others. The worker contract (C9) is the
  interface; a backend that can't satisfy it is excluded from verifier duty rather than
  accommodated with special cases.
- **Batch-verification risk**: a correlated bad verifier session validates N items at
  once. The §4 C3 guardrails (caps, composition rule, critical-path exclusion, batch
  provenance, bulk revocation) are part of the feature's definition of done, not
  follow-ups; shipping batching without them is a validity-barrier violation.
- **Bandit gaming**: if agents learn to farm the return function (e.g. cheap refutations),
  that is a §6 kill criterion, not a tuning exercise.
- **Scope creep toward a platform**: any proposal adding a server, a daemon, or a remote
  dependency escalates to TJO by default.

---

## Amendment A1 (2026-08-08, TJO): autonomy north star + goal-graph reward

D-decisions stand, with one scoping note on D5: no Lean in any v1 role (unchanged);
sampled-Lean spot-checking as a CALIBRATION instrument only (never a rung, never a
gate) is an approved v2 feature behind a future explicit TJO decision.

New settled direction (supersedes nothing; extends §6): rk's purpose is an
unattended research factory ("dark factory") pursuing an explicit goal with an
effectively infinite horizon, producing banked results on the way. Progress is
verified change in a GOAL GRAPH (frontier of open obligations over competing
decompositions); credit is zero at creation and paid only on verified events
(CLOSE / escrowed REDUCE / PRUNE / REUSE / COMPRESS), with pre-registered
Brier-scored hardness predictions, a floored wildcard chaos arm on the allocation
side only, budgeted prospecting with hindsight attachment, and wandering as a
first-class audit defect. Definitions and conjectures are gated at entry (vacuity,
triviality, subsumption, falsification budget, sanity instances, mutation
self-test). Detail: NOTES-2026-08-08-autonomy-implementation-plan.md + rk
docs/memos/2026-08-08-{autonomy-assessment-and-plan,prereg-autonomy-v1}.md.
