# Implementation Plan — rk

Status: v2, 2026-07-17. Companion to `PRD.md` (decisions D1–D8) and `DISTILLATION.md`.
v1 was adversarially reviewed (hostile Fable review, verified against the vibefeld /
knowledge-frontier / AISM source); this revision folds in all blocker/major findings:
the M4 experiment redesign (contemporaneous control), the reviewer≠author honesty
re-scope of V1/V2, the empirical SC4 baseline, the corrected batch cost model, the
per-edge join spec, the LaTeX deferral, the orphaned-WP fills (L5 verdict store, refs
acquisition, `fr --version`), and the balloon-feedback loop (TJO addition: ballooning is
an epistemic signal that a contract's assumptions are mis-stated — it must update
orchestrator state, not just abort).

Sizes: S (≤1 session), M (2–3 sessions), L (4+ sessions).

Repos touched:
- **`../rk`** (new, TS/Bun) — the tool. All C1/C2/C5–C9 code.
- **`../vibefeld`** (Go, existing) — kernel verbs (V0–V5).
- **`../knowledge-frontier`** (TS/Bun, existing) — fr upgrades (F0–F7).
- **`../almost-idempotent-stochastic-maps`** (AISM) — parity fixture + retrofit dogfood.

House rules inherited: no remote CI; local `bun test` + selftest; AGPLv3; no emoji/
marketing prose; ~200-line source sharding; red-green TDD with mutation-proving for
ported logic.

---

## 0. rk repo bootstrap (M0 entry)

```
rk/
  src/
    types.ts           # all shared contracts (shard schemas, graph, verdicts, config)
    gates/             # PURE: defs, argument (linker), refs, provenance, runs,
                       #       shards — no fs/clock/env (freshness gate joins in M2)
    graph/             # PURE: projection join, conflict detection, path queries
    render/            # html generation (pure core, thin fs edge)
    drive/             # IMPURE: worker backends, sessions, batch composer, dispatch,
                       #         L5 verdict store, balloon router
    refs/              # IMPURE: fetch, hash, extract, quote
    scaffold/          # init/upgrade template engine
    store.ts doctor.ts cli.ts audit.ts
  templates/           # constitution, file-role headers, hooks, shard skeletons
  corpus/              # red-test violation corpus, one directory per gate
  test/
```

fr's architecture rules apply verbatim: pure core behind thin edges; zero runtime deps;
`bun build --compile` single binary; purity enforced by grep in selftest. Every pure
module gets a 1:1 test file.

**Version-compat manifest** (`rk.compat.json`, shipped in the binary):
`{ af: {min, tested[]}, fr: {min, tested[]}, bd: {min, tested[]} }`.
`rk doctor` runs `af version` / `fr version` (new — F0) / `bd version`, compares, blocks
`rk verify`/`rk check` on untested majors (logged override flag exists). bd's
`issues.jsonl` shape is treated as part of the compat surface: a shape change is a compat
break. This lands in M0 — it is the D6 mechanism.

---

## M0 — Gate extraction (target: contract-correct gates, adoptable by AISM)

**Premise correction (2026-07-17, TJO): AISM is NOT a canonical golden master.** It
kind-of-works and has many known problems. Its incident history is load-bearing data;
its script behavior is not the spec. The gate contract is normative; AISM behavior is
characterized for migration bookkeeping. "Parity" is replaced everywhere by **divergence
triage**: every rk-vs-AISM behavioral difference is classified
{rk-stricter-intended | rk-bug | ambiguous → escalate}; zero rk-bug entries is the bar;
rk being stricter than the old gates is the point, not a defect.

Contract-first porting: for each AISM gate script, write the gate's contract down, build
its **red corpus first** (seeded violations drawn from real incidents), then implement.

| WP | Deliverable | Size | Acceptance |
|---|---|---|---|
| M0.1 | Gate contracts doc (`docs/gate-contracts.md`): input schema, checks, exit codes, coverage-reporting format for the **six** M0 gates: defs, argument/linker, refs, provenance, runs, shards (the seventh — freshness — is created in M2.6). Brittleness bound is a per-repo parameter, default soft cap 26 (AISM's realigned value), no depth check by default | M | Reviewed against AISM's script headers **and** `scripts/af_constants.py`; every known false-green/false-red incident mapped to a contract clause |
| M0.2 | Red corpus: per gate, a minimal repo fixture per violation class. Mandatory members: the 19/19-skipped refs false-green; overclaim (registry `open` framed as proved); duplicate alias; dependency cycle; contract mismatch registry↔af-root; stale SHA256; orphaned run bundle; missing invariant; unwired anchor; hand-edited generated file | M | Each fixture fails exactly its target gate; `rk check --selftest` runs the corpus |
| M0.3 | `rk check` — the six gates in TS, composed, with per-gate coverage lines ("checked N/N externals") and no silent skips | L | Corpus fully red/green per contract. Run on AISM HEAD emits a **triaged divergence report** (rk-stricter-intended / rk-bug / ambiguous) with zero rk-bug entries. Robustness run on 3 historical commits (older schemas — `routes:`/`workspace:` added mid-campaign) completes without crashes or finding-floods, divergences triaged the same way. Fable review ratifies the triage + the reopened strictness rulings |
| M0.4 | `rk doctor` + compat manifest (depends on F0) | S | Blocks on a deliberately mismatched af binary; passes on pinned set |
| M0.5 | AISM cutover, staged: wire `rk check` alongside the python/bash gates and **parallel-run for ≥3 real sessions** (AISM is a live campaign — cycle 432 has an unverified batch pending); cutover when **no untriaged divergence remains** — NOT zero divergence: rk is expected to be stricter and to surface true findings the old gates missed; each such finding is either fixed in AISM or explicitly waived (dated waiver committed in AISM) | M | 3 parallel sessions; divergence ledger fully dispositioned; then cutover commit deleting `scripts/check-*` |
| M0.7 | Contract stance amendment (follow-up to the premise correction): flip F5 back to strict (`source`/`sha256` REQUIRED for kind=cited — zero cost, AISM has no cited shards; Layer 0's purpose is provenanced definitions); reframe deferred rulings #4/#5 rationales (architectural dependency / M2.6 obsolescence — "parity cost" is no longer a valid veto); recast per-gate "Deviations from AISM" sections as divergence-triage entries; repurpose F4's historical baseline as the robustness-run definition. Fable ratification folded into the M0.3 boundary review | S | Contract text matches the amended L5; corpus expectations consistent |
| M0.6 | `rk refs` acquisition side: port `fetch-refs.py` (fetch/hash/manifest/reacquisition-status) + `rk refs quote` (locate + emit byte-verbatim quote with path:line anchor); marker PDF→markdown integration optional-with-graceful-skip | M | Round-trip on AISM's `refs/manifest/`; quote output grep-F-verifiable |

Definition of done → SC-partial(2), groundwork for SC1.

## M1 — Scaffold

| WP | Deliverable | Size | Acceptance |
|---|---|---|---|
| M1.1 | Template set: constitution (CLAUDE.md==AGENTS.md) with slots {goal, north-star contract, compute budget, model policy, phase, audit cadence}; PRD/HANDOFF/CONVENTIONS/FINDINGS skeletons with ROLE/UPDATE-POLICY/TRIGGER headers and authored/rewritten/generated classification. **Includes the minimal scheduled-audit trigger from day one**: the session-close checklist blocks when cycles-since-last-audit exceeds the cadence slot (full `rk audit` lenses arrive in M5; the trigger must be exercised by both dogfoods) | M | A domain expert reads the stamped constitution and finds no AISM-specific residue; audit trigger fires in dogfood 1 |
| M1.2 | `rk init "<north-star contract>"` — stamps layout, hooks (SessionStart/UserPromptSubmit/Stop/PreCompact/pre-commit), fr portfolio init, bd init, oracle registry stub | M | Fresh dir → first orchestrator session productive in <30 min (SC1), measured by dogfood |
| M1.3 | `rk phase exploration\|consolidation` — flips gate severities per a **fixed** phase matrix in `.rk/config` (no per-gate override flags; the only escape valve is a committed, logged config edit); transition consolidation-ward is logged to worklog + fr | S | Exploration: only structural gates block; consolidation: full set. Matrix reviewed against the cft-anyons-v1 lesson |
| M1.4 | `rk upgrade` v0 — **stub only** (detect template-version mismatch, print manual-diff instructions). Three-way merge machinery is deferred to M5.2, when a second template version actually exists (review finding E1: no migration machinery ahead of need) | S | Mismatch detected and reported; nothing auto-merged |
| M1.5 | Dogfood 1: stamp a fresh small conjecture repo; run 2–3 real sessions | M | SC1 pass; friction notes filed as rk issues |

## M2 — Projection + render

| WP | Deliverable | Size | Acceptance |
|---|---|---|---|
| M2.1 | Graph JSON schema v1 (`schemas/graph.v1.json`) **including the per-edge join-key table** (PRD C5): registry↔af by contract byte-match via `workspace:`; registry↔bd by id; registry↔fr by artifact-path resolution with a first-class **unresolved-reference bucket**; registry↔report by label/id anchor. Deterministic: sorted keys, content-addressed, timestamps excluded from identity | M | Schema review by V4 owner; golden-file round-trip; the rename hazard (id ≠ workspace dir, e.g. `lem-halo-collapse`) is a corpus fixture |
| M2.2 | Store readers: argument/definitions YAML shards; af via `af export --graph json` (V4) with direct-ledger-JSON fallback; fr `log.jsonl`; beads JSONL | M | Reads AISM's 200 shards + 44 workspaces + 433 fr entries. Easy direction: every registry id with an af workspace joins. **Hard direction has its own acceptance**: fr-record resolution rate on AISM is measured and reported; unresolved records land in the bucket view, never dropped; resolution rate is a baseline metric, not assumed 100% |
| M2.3 | Conflict detection: registry-status vs af-epistemic-state disagreement; contract byte-mismatch; taint vs status inconsistency; fr banked-claim without oracle verdict | S | Each conflict class has a corpus fixture; conflicts render as defects, never auto-resolved |
| M2.4 | `rk render` HTML site: dashboard; interactive AND/OR DAG (rigour-coloured, drill-down node→contract→af tree→ledger events→verdicts); definitions + conventions views; dead-route graveyard; run gallery; per-claim provenance chains; unresolved-reference bucket view. Self-contained static output; layout via **dagre vendored at build time** (not elkjs — ~1.5 MB bundle bloat); the hard problem is drill-down state in a no-server page, budget accordingly. **Rendering-truthfulness fixtures in the corpus**: one node per rigour status, asserted against emitted markup (a `stated` node styled as `proved` is a corpus failure, not a cosmetic bug) | L | SC5 dry-run: a third party answers the five questions on AISM's site in <10 min; truthfulness fixtures green |
| M2.5 | Terminal graph views: `rk graph --focus <id>`, critical path to north star, campaign-wide taint trace, "what blocks the north star" (the critical-path query is a hard dependency of M3.4's batch exclusion) | M | Path query agrees with linker ground truth on AISM; used by M3.4 |
| M2.6 | Freshness gate (gate #7): regenerate-and-diff replaces mirror-check gates (INDEX/CATALOG/DAG files become build outputs) | S | Hand-edit of a generated file fails `rk check`; AISM mirrors deleted |

**LaTeX generation: deferred out of M2 entirely** (review finding M6/E1). AISM's report
is 100% authored — there is no generated/manual split to round-trip, and theorem
statements live inside prose. Generation lands at M5.5 on a fresh fixture; migrating any
existing report is its own explicitly-scoped work package, undertaken only if wanted.

Vibefeld dependency: **V4 lands early in M2** (see below).

## M3 — Verification driver (C9)

| WP | Deliverable | Size | Acceptance |
|---|---|---|---|
| M3.0 | **Caching measurement spike** (half-day, before M3.3 design freezes): measure `cache_read_input_tokens` across sequential headless `claude -p` calls with a stable prompt file; determine whether the CLI's prompt assembly is byte-stable ahead of rk's prompt; measure TTL behavior for a 10-item batch cadence | S | A numbers memo committed; M3.3's design and its cache-fraction target are set **from** this memo |
| M3.1 | Worker contract spec (`docs/worker-contract.md`) + `schemas/verdict.v1.json`: request {role, tier, backend, prompt_parts {shared_prefix, item[]}, output_schema, timeout, budget}; response {verdicts[], usage {input, output, cache_read}, exit} | S | Both backends implement it; schema-validated at the boundary |
| M3.2 | Backends: claude (headless `claude -p`, JSON output) and codex (`codex exec`). Backend registry with per-role×tier assignment + fallbacks in `.rk/config`; family identity recorded for the cross-vendor rule | M | A toy proof driven end-to-end with prover=claude/verifier=codex and the reverse |
| M3.3 | Session + cache manager: persistent worker session per (role, node/batch claim); role isolation is identity-based — a session is **never reused across roles**; stable prompt prefixes (shared context first, item last); **stagger rule**: the first call of every same-prefix group is dispatched alone and awaited to first token before the rest fire (concurrent identical requests all miss); cache-aware scheduling groups same-prefix jobs inside the TTL window | L | Cache-read fraction meets the M3.0-derived target on a 10-item batch; isolation property-tested |
| M3.4 | Batch composer: eligibility (routine tier, logical independence — no member depends on another member), cap (default 10), **critical-path exclusion via M2.5's path query**, **shared-context preference** (prefer sibling leaves of validated subtrees — both independent and context-sharing; the corrected cost model C_shared + Σ(c_i+v) says scattered batches barely win), batch provenance threading to V1/V2 | M | Corpus: chained pair never batches; critical-path node never batches; composer prefers siblings over scattered nodes in a synthetic fixture; ledger shows batch ids |
| M3.5 | **SC4 baseline re-measurement** (before batching/caching are enabled): instrumented implementation of the *current* per-node protocol re-proves 2–3 already-validated AISM lemmas from fresh workspaces, recording tokens + calls per validated node. This is the SC4 denominator — AISM's historical logs contain no token accounting and never used auto-prove.sh | M | Baseline memo committed; verdict parity with the original validations |
| M3.6 | Hard-tier driver (`rk verify --af <id>`): replaces the af-orchestrate/auto-prove pattern — prover-overreach abort, stuck guard, bottom-up-ready dispatch, retry/churn caps, burst budgets, and the **balloon feedback loop**: the balloon tripwire emits a structured event {contract id, node count, classification: missing-fact\|dag-dep\|genuine-gap, offending subtree}; routing per PRD C9 — missing-fact→bd provisioning task, dag-dep→factoring task, genuine-gap or repeat balloon→mandatory contract review; `balloons:` counter + classifications written to registry frontmatter; linker surfaces balloon-flagged contracts as board warnings; contract revision stales hash-bound verdicts. Ballooning updates orchestrator state, never just aborts | L | Re-proves one AISM lemma end-to-end; a synthetic over-decomposed conjecture triggers the balloon path and produces the frontmatter mark + bd task + board warning |
| M3.7 | **L5 verdict store** (the default tier's ledger — was orphaned in v1): append-only, per-shard verdicts VALID/VALID-WITH-CORRECTION/INVALID, hash-bound to shard content (stale on edit), queried by the linker for `stated`→`proved-mod-audit` promotion and by the freshness gate; batch dispatch of L5 reviews through the same worker contract | M | AISM's next real L5 harvest recorded through the store; stale-on-edit property-tested |
| M3.8 | Cross-vendor rule: enforced at verdict-apply **and** continuously via the linker's critical-path provenance check (path membership mutates); **grandfathering policy implemented**: existing same-family validations (all 44 AISM workspaces) keep status, gain `legacy-same-family` provenance marks, appear as path warnings, re-verification prioritized by path criticality | S | Same-family promotion attempt on a critical-path node rejected; AISM retrofit shows warnings, not demotions |
| M3.9 | Token accounting: per-node and per-campaign tokens/calls report (`rk verify --report`); SC4 measured against the M3.5 baseline | S | ≥3× or an honest miss reported with analysis |

Also in M3: decide auto-prove.sh's fate in vibefeld (delete or mark deprecated with a
pointer to rk) — leaving it live is a D6 stale-tooling trap.

## M4 — Exploration (fr upgrades + bandit experiment)

Redesigned per review findings B1/B2. The historical 83%/49% numbers are motivation only
— cycles 1–106, exploration phase, pre-anti-gaming-fixes, semantic instrument; nothing
run today is comparable to them. The experiment uses contemporaneous control.

| WP | Deliverable | Size | Acceptance |
|---|---|---|---|
| M4.0 | Pre-registration doc committed (append-only): metrics (concentration over mechanism tags, no-pull rate, distinct-mechanism coverage per 20 cycles, banked+refuted per 100 cycles, deviation rate), shadow-mode agreement thresholds, ABAB epoch length and count, the A-vs-B contrast decision rule. No post-hoc edits | S | Reviewed before any flag flips |
| M4.1–4.3 | fr work items F1–F3 (below) | M | fr test suite extended; ingest round-trip on AISM |
| M4.4 | F4 `fr audit` instrument on-board every N cycles. **Instrument validation** (not historical reproduction): seeded relabel fixtures (same residual, renamed arm/tag) must be caught; new mechanism-tagged cycles measured correctly; the only historical cross-check is the mechanically-recoverable no-pull rate (49%) on the untagged log. Semantic clustering of residuals is `rk audit`'s job (agent, off the hook path), keeping fr zero-deps/<50ms | M | Fixture suite green; no-pull rate on AISM history reproduced |
| M4.5 | F5 statability gate + F6 bandit v1 behind `fr policy bandit` (additive-only log schema — fr's append-only law): rigor-weighted returns, decaying optimism, concentration penalty; board recommendation; `policy_rec` + `deviation_reason` fields | L | Unit tests for return weighting (laundering-resistant); recommendation + logged-deviation flow works in shadow mode |
| M4.6 | **Stage 1 — shadow mode** on the live AISM campaign: recommendations logged, hidden from the orchestrator; measure counterfactual agreement/divergence per M4.0 | M | Shadow report vs. pre-registered thresholds decides whether Stage 2 proceeds |
| M4.7 | **Stage 2 — interleaved ABAB epochs** on the same campaign, same instrument, same phase; A-vs-B contrast per M4.0 decides adopt/kill (SC6) | L | Verdict reached and recorded; no threshold edits after the fact |

## M5 — Hardening + second dogfood

| WP | Deliverable | Size | Acceptance |
|---|---|---|---|
| M5.1 | `rk audit` full lenses: overclaim hunter (including statement-content drift — the √η↔η class, seeded as a must-catch fixture; audit verdicts hash-bound to shard content so they stale on edit), convention-drift, gate-rot, wandering (semantic residual clustering — the counterpart to F4's lexical tags), balloon-flagged-contract review. Mechanical trigger already live since M1.1 | M | Runs unprompted on schedule during dogfood 2; the √η↔η fixture is caught; findings filed as bd issues |
| M5.2 | `rk upgrade` real migrations (three-way merge on constitution slots) across ≥2 template versions | M | M1.5 repo and AISM both upgrade cleanly; zero authored-content loss |
| M5.3 | Docs: self-teaching CLI help (af Law 9 style), tutorial, gate-contract reference | M | A fresh orchestrator session needs no external docs (spot-check) |
| M5.4 | Dogfood 2: fresh exploration-phase programme (cft-anyons-style) | L | SC7: same tool, both phases, no tool modification |
| M5.5 | LaTeX skeleton generator on a **fresh fixture** (manual-block contract, statement ownership, checksummed fences); optional separate WP: migration of one existing report, only if wanted after HTML has proven the generated-artifact contract | M | Round-trip on the fixture with zero manual-block loss; risk trigger (PRD §10) armed |

---

## Cross-repo work items (subagented on demand, D6)

### vibefeld (Go)

| ID | Item | Needed by | Notes |
|---|---|---|---|
| V0 | Vendor the firstproof ledgers into vibefeld's test corpus if recoverable (../firstproof no longer exists locally); else strike them from acceptance criteria and rely on AISM's 44 workspaces | V1 | Small event logs; replay-regression seed |
| V1 | **Author identity on nodes + verifier identity & batch id on validation events** — a real schema addition (nodes today have no author field; `NodeValidated` carries no identity; `ClaimedBy` is transient). Backward-compatible optional fields on read; replay regression on the historical corpus (identical derived state + passing hash verification — the precise invariant) | M3.4 | Re-scoped from v1's "optional fields patch" per review M1 |
| V2 | `af verdicts apply <file>`: schema-validated per-item accept/challenge; reviewer≠author checked against V1's recorded authorship (recorded-and-checkable, not adversary-proof — identities are driver-supplied); **partial-failure semantics defined**: order-dependent accepts (children before parent), mid-batch challenge may block later accepts, per-item outcome report, ledger never ambiguous | M3.4 | The kernel half of batch verification |
| V3 | `af unvalidate --batch <id>` | M3.4 | Bulk revocation lever |
| V4 | `af export --graph json` with `schema_version` | M2.2 | Align with graph schema v1; earliest vibefeld item — schedule first |

Each V-item: red-green in Go, replay regression on the corpus, AF-FEEDBACK.md entry
closed if applicable.

### knowledge-frontier (TS)

| ID | Item | Needed by | Notes |
|---|---|---|---|
| F0 | `fr version` command (none exists today; only package.json carries 0.2.0) | M0.4 | Trivial; sequenced before rk doctor |
| F1 | Ingest landing: gap → arm candidate | M4 | Already spec'd in fr HANDOFF §5 |
| F2 | Ingest landing: refutation → refuted dead-route | M4 | ditto |
| F3 | crack → supersedes credit assignment (cross-ledger join) | M4 | Hardest fr item; design doc first |
| F4 | `fr audit`: **lexical** detection over a new required `mechanism` tag on pulls (relabeling becomes schema-visible at write time); no-pull rate; frontier turnover; banked-per-100; board surfacing every N cycles. Semantic clustering explicitly NOT here (rk audit's job) | M4.4 | Keeps fr zero-deps and <50ms hooks |
| F5 | Statability gate: non-null pulls must name a falsifiable post-state | M4.5 | On fr's own roadmap |
| F6 | Bandit policy v1 behind flag: rigor-weighted returns, decaying optimism, concentration penalty; `policy_rec` + `deviation_reason`; **additive-only schema change** (append-only log law — no history rewrites, ever) | M4.5 | Shadow-mode support first |
| F7 | Board/log export consumed by C5 (replaces fr's own planned lab-book render) | M2.2 | fr stays presentation-free |

---

## Testing strategy (all repos)

1. **Red corpus first** for every gate and every fr/af behavior change; a fixture per
   real historical incident (the distillation's §4.1 failures are the seed list; the
   √η↔η content-drift incident seeds the M5.1 audit corpus).
2. **Mutation-proving** for ported logic (perturb, watch RED, restore) — the AISM rule.
3. **Golden files** for render (normalized inputs, timestamp-free identity) **plus
   rendering-truthfulness fixtures** (status → markup assertions; golden files catch
   regressions, truthfulness fixtures catch miscolorings).
4. **Property tests** for the linker (acyclicity, propagation monotonicity, OR-route
   satisfaction, critical-path provenance) and the batch composer (independence, cap,
   critical-path exclusion, shared-context preference).
5. **End-to-end selftest** (`rk selftest`): corpus + a toy campaign driven against
   pinned af/fr binaries (the D6 cross-repo smoke test).
6. **Live-fire acceptance** at each milestone on AISM or a dogfood repo — never only
   fixtures. Cutovers on live campaigns are staged (parallel-run before delete, M0.5).

## Sequencing constraints

- F0 before M0.4 (doctor calls `fr version`).
- V0→V1 before M3.4; V4 before M2.2 (direct-ledger fallback de-risks).
- M2.5 (path query) before M3.4 (critical-path exclusion consumes it).
- M3.0 (caching spike) before M3.3 design freeze; M3.5 (baseline) before batching/caching
  are enabled anywhere SC4-relevant.
- F4 before M4.5; M4.0 before any flag flip; M4.6 (shadow) gates M4.7 (ABAB).
- rk doctor (M0.4) before any cross-repo consumption (M2.2, M3.4).

## Resolved questions (v1's open questions, closed by review)

1. **DAG layout**: vendor **dagre** (not elkjs — bundle bloat); the real budget item is
   drill-down state in a no-server page.
2. **Claude backend persistence**: cached prefixes first, but the M3.0 spike decides the
   numbers; never resume a session across roles; stagger the first call of every
   same-prefix group.
3. **Statement-content drift**: `rk audit` territory (M5.1), never `rk check`; audit
   verdicts hash-bound so they stale on edit; the real incident is a must-catch fixture.
4. **`rk phase` per-gate overrides**: no. Fixed matrix; escape valve is a committed,
   logged config edit only. A mis-phased gate is a template bug fixed upstream via D6.
5. **bd**: stays third-party, driven only through its public CLI; `issues.jsonl` shape is
   part of the compat surface in `rk.compat.json`.

---

## N-series addendum (2026-08-08, ratified)

The autonomy/goal-graph work (goal-graph frontier + payout ledger, admission Gates
C/D, wildcard arm, calibration sampling, unattended live-fire) is planned in
`NOTES-2026-08-08-autonomy-implementation-plan.md` (N0-N5) with pre-registered
parameters in rk `docs/memos/2026-08-08-prereg-autonomy-v1.md`. It amends M4.5/F6
(return function becomes goal-graph payouts) and extends M5.1 (wandering lenses) and
M2.4 (frontier + results-ledger pages). Sequencing: gates before bandit; S0 smoke
slice before full N2; no unattended run before N4.1-N4.3.
