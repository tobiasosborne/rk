<!-- ROLE: raw postmortem evidence (Opus subagent report, banked verbatim).
     UPDATE-POLICY: frozen historical record; never edit.
     TRIGGER: consulted from docs/memos/2026-08-03-aism-bitter-lesson-snapshot.md -->

# AISM postmortem — governance & process layer

## Durable (A)

- **Status-as-type on every claim (the rigour ladder).** `CLAUDE.md:58-67` (L0) + the mirror table `CONVENTIONS.md:14-33`. Nine statuses, only three rigorous. Scales *up* with capability: stronger models emit more plausible claims per hour, so a machine-checkable "is this rigorous?" predicate becomes more valuable, not less. Enforcement is mechanical (`argument.py`), never judgment.
- **Status-propagation law**: an `af: validated` result may never rest on a non-rigorous dep; only `cited` leaves and `af: validated` deps are "available" (`CLAUDE.md:304-307`, `CONVENTIONS.md:30-32`). Demonstrated live: when M25/M19-S2/S3 were retracted, the linker **auto-suspended** dependents M18/M20 (`docs/LEARNINGS.md:157-193`). This is what made retraction cheap rather than catastrophic — the single highest-leverage mechanism in the repo.
- **Byte-verbatim ground truth** (L1, `CLAUDE.md:68-73`): recompute SHA256, `grep -F` the quote, no `cited` claim without a provenance row, "if the source isn't in `refs/`, STOP and ask". Fluency growth makes fabricated citations *harder* to catch by reading and *equally easy* to catch by string match.
- **Reviewer ≠ author with a fresh context, and the verifier is told a counterexample is a BIG SUCCESS** (L5 `CLAUDE.md:92-96`; protocol `CLAUDE.md:269-283`). Measured yield: "~48% of author output corrected, ~15% killed by fresh hostile verifiers — never a rubber stamp; two whole architecture attempts killed" (`docs/plans/2026-07-10-methodology-assessment.md:14-18`). This is *decorrelation*, not capability compensation: a single model's blind spots are correlated across its own re-reads at any capability level.
- **The orchestrator never judges a proof** — "Reasoning about a step's correctness poisons your context" (`CLAUDE.md:269-272`, Rule 6 `:123-126`). Role purity as an invariant, not a crutch.
- **Contract-match law**: the af root node must equal the registry `contract` verbatim, linker-enforced (`CLAUDE.md:298-307`). The only thing binding a proof artifact to the claim it allegedly proves. Later hardened to *root == the ratified design text*, not merely == the shard (`HANDOFF.md:97-101`) after a mis-landed contract kept all gates green (`docs/worklog.md:2172-2179`).
- **One canonical definition per term; drift = build failure** (L2 `CLAUDE.md:74-79`). Symbol drift is an error class whose frequency grows with artifact count.
- **Node cap as a brittleness *signal* with a forced classification** — balloon tripwire returns `MISSING fact` / `DAG dep` / `genuine gap`, and "don't just bump rounds" (`CLAUDE.md:289-295`). The classification is durable diagnosis; the number (26) is not.
- **External-oracle gate on "banking"**: `fr log banked` requires a passing verdict from an oracle other than the author. Verified in production — it **refused** a registry landing and the refusal was recorded in the commit rather than worked around (`HANDOFF.md:136-138`; `docs/worklog.md:2311-2314`). Anti-gaming rationale stated explicitly at `CLAUDE.md:251-255`: "internal convergence ≠ correctness".
- **Numerics quarantined forever as evidence** — run bundle with re-run command, seeds, SHA256, checkable invariant; "a number without a re-run command and a SHA256 is not a finding" (L3 `CLAUDE.md:80-87`). 67k+ exact instances with 0 violations is still `numerical` (`CLAUDE.md:171-173`).
- **Retraction ledger framed as machinery succeeding**: "A retraction here is a SUCCESS of the rigour machinery, not an embarrassment" (`docs/LEARNINGS.md:3-5`). Six dated retractions, each with the catching mechanism named.
- **Dead-route certificates** (Rule 13 `CLAUDE.md:142-146`, `FINDINGS.md`): refuted approaches recorded *with the refuting mechanism*. Negative results are model-independent search-space pruning.
- **ROLE / UPDATE-POLICY / TRIGGER headers** on 115 markdown files. Machine-legible answer to "may I edit this, and when is it stale?" — a durable ownership contract.
- **Generated vs authored, never mixed**, each generated layer with a `--check` freshness gate wired into the single gate (`CLAUDE.md:361-364`, `:193-195`).
- **Adversarial *design* review with a deletion test** for decorative dep branches, and "when a design comes back small, aim it at under-specification instead" (`HANDOFF.md:113-117`). The deletion test caught the thmainext method clause.
- **Transcription audits as a distinct check**: work the orchestrator itself transcribes gets a fresh independent transcription auditor, and the generating script is retained and corrected too (`HANDOFF.md:118-120`; `docs/worklog.md:2299-2301`). Separates mechanical fidelity from mathematical truth.

## Scaffolding (B)

- **Read-order gate** (`CLAUDE.md:44-52`): six documents plus `fr board` before touching math, else "STOP: file a `bd` issue blocked on the pre-read". Pure compensation for a cold context; costs a turn every session.
- **Rule 10 — "Re-read these rules after every context compaction. Then re-orient from the repo + `fr board`, not from the conversation summary"** (`CLAUDE.md:135-136`). Explicitly a context-limit patch.
- **Per-turn context injection**: `UserPromptSubmit` → `fr turn-begin && fr board --hook prompt`; `SessionStart` → `bd prime` + `fr board`; `PreCompact` → `bd prime` (`.claude/settings.json:11-26`). Re-priming rules every turn is instruction-forgetting insurance.
- **HANDOFF.md rewritten (not appended) each session, ≤500 lines** (`CLAUDE.md:353`) — serialised working memory across a context boundary.
- **`HANDOFF.md:95-140` "Worked patterns (BINDING; follow verbatim)"** — 45 lines of operational recipe. Prompt-engineering for today's orchestrator; a stronger agent re-derives most of it from the tool's own errors.
- **Effort tiers `--tier creative` / `--tier routine`** and the pinned model policy `gpt-5.6-sol`, cap `xhigh` (`CLAUDE.md:284-288`). Ages out by construction.
- **Batched verification as the default** for routine multi-lemma harvests (`CLAUDE.md:273-277`) — adopted because "verification is the cost center" (`methodology-assessment.md:32`). A pure economics compromise that reverts when verifiers get cheap.
- **The multi-arm bandit**: declared vestigial by the campaign's own assessment — "fr's multi-arm bandit is vestigial under the Tier-1 lock (40+ consecutive EXPLOIT-B)... revisit the abstraction only if the Tier-1 lock lifts" (`methodology-assessment.md:30`).
- **Per-row node budgets** ("projected af" column, `HANDOFF.md:78-80`) — sized to the current prover's context, not to the mathematics.
- **~200-line sharding everywhere** (Rule 4 `CLAUDE.md:114-117`) — half context-window artifact, half durable merge/blame property (see Multiplayer).
- **"Provision the PROOF's vocabulary at SEEDING time, not the contract's"** (`HANDOFF.md:101-106`) — a workaround for `af def-add` not rejecting duplicates.
- **Rule 11 non-interactive shell** (`cp -f`/`mv -f`; "`-i` aliases hang the agent") — harness quirk.
- **`CLAUDE.md == AGENTS.md` byte-identical duplication** — compensation for two harnesses not sharing a config format. Already a merge hazard in practice (`.claude/worktrees/agent-ad79636b2ebfcd24a/MERGE-NOTES.md:65`: "Keep both, then `cp -f CLAUDE.md AGENTS.md` — the two files must stay byte-identical").

## Scar tissue (C)

- **Dead config surface**: `.codex/` and `.agents/` exist, created 2026-07-26, and are **empty**.
- **`.claude/docs/lean4/` (5 docs) + `.claude/tools/lean4/` (8 scripts)** in a repo with **zero `.lean` files**, where Lean is out of scope (`PRD.md:73-74`) and af→Lean was "DECLINED by user 2026-07-10". Inherited harness cruft an agent must learn to ignore.
- **Two stale git worktrees still registered** (from July), each containing full-vintage copies of `CLAUDE.md`, `AGENTS.md`, `HANDOFF.md`, `PRD.md`. A repo grep for governance now returns three different vintages.
- **Rule 12's literal prohibition** — "Never disable the pre-commit hook (no `core.hooksPath=/dev/null`)" — plus the fact that on device migration `core.hooksPath` was found rewired so "the pre-commit gate was INERT on this device — one red commit slipped" (`docs/worklog.md:1414-1415`). Prohibiting a specific bypass string is not a control.
- **Engineered warning fatigue.** A validated 29-node tree tripped `WARN REFACTOR … (>12)` on *every* gate run: "permanent noise that will train agents to skim warnings" (`docs/tooling-feedback/AF-FEEDBACK.md:80-84`); plus "20 permanent noise warnings" and "107 permanently-ignored warnings" (`remediation-plan` items 9-10). Fixed by a whitelist file, `report/UNWIRED.md` — which then acquired its own rule: "A newly validated row STAYS in `report/UNWIRED.md` … removing the line fails `check-provenance` (tested)". A whitelist you are forbidden to clean up.
- **Three simultaneous, inconsistent node thresholds** (12 vs 40 vs validated trees at 14–52) until unified to `NODE_SOFT_CAP = 26`; the *prose* then drifted from the constant and needed its own commit `8b5080fb`.
- **The circuit-breaker was structurally defeated**: "every narrowing wave self-tags `progress`; the string 'stalled' appears in 0/106 cycles; the G7–G11 five-wave wall broke only on a manual user audit" (`docs/audits/2026-07-04-operational-audit.md:49-51`). The anti-tunnel-vision ritual was satisfiable without changing behaviour.
- **The portfolio didn't diversify**: "83% of wave-pulls (30/36) chased one mechanism relabeled A→D→G; arms C/E never ran" (`audit:46-49`). "Genuine new-arm EXPLORE events: 3 in the whole campaign" against 1130 logged cycles.
- **Reactive budget-patching ×3** (D3→R_D^ν, G5→SIGMA, G6→silent rows); the pending amendment's defence was "a self-assessment from the same authorial line" (`audit:50-51`).
- **Hand-maintained counters rot.** "Registry: 44 results (HANDOFF said 46 — stale)" (`audit:20`); Phase 0 had to fix HANDOFF asserting sketch v20 and af-count 28 when both were stale. The audit's own cross-cutting verdict: **"Hand-maintained discipline decays; only gated discipline holds"** (`methodology-assessment.md:28`).
- **A first-class user mandate that was chronically unmet**: sketch/`CURRENT.md` reconciliation, with recurring "Rule-9 debt" entries across sessions 24–33.
- **46 versions of the proof sketch** plus 24 subdirectories, resolved by a pointer script because superseded files stay "intact for line citations". Also `docs/plans/CHANGELOG.md` stale since v31.
- **CLAUDE.md has absorbed domain content**: §3 "Faithfulness callouts" and Rule 13's seven inline dead routes are *mathematics*, in the process file, paid by every agent every session. 32 KB / 429 dense lines mixing process, math, a full command reference, and its own changelog.
- **Rules leaked into the state file**: `HANDOFF.md:95-140` ("BINDING; follow verbatim") and `:158-162` ("Orchestration laws (BINDING)"). Two homes for binding rules, with different update policies.
- **Gates that verified nothing.** `check-refs`: "today the fabrication gate verifies nothing — 19/19 externals skip — and false-greens on a clean checkout" (`remediation-plan` item 6). `check-provenance`: "the detector guarding the project's cardinal sin currently has ZERO test coverage, and the file falsely claims a test exists" (`remediation-plan:45-48`).
- **Prover-overreach guard implemented as a git-porcelain snapshot diff** → false-positives on any concurrent write, which then forced serialisation laws: "fr/bd writes FIRST, commit, launch LAST", "no design/audit codex while ANY af run is live". A safety guard that serialised the workflow.
- **Controller UI actively misinformed the agent**: `died --at` residuals leaked into the DEAD ROUTES board ("actively misleading for any fresh agent that trusts the board", `FR-FEEDBACK.md:14-23`); the NO-WAVE counter stuck at ×7 across turns that *did* log pulls.
- **Tool sharp edges recorded as process rules instead of fixed**: `af def-add --dry-run` silently mutated the workspace; `--phase all` grafts a second tree; exit codes conflated max-rounds-while-converging with failure; `--phase verify` misnamed; log truncation produced "prover build done: ause the shard has no deps".
- **The full gate runs on every commit** — including a **LaTeX PDF build** — and is flaky: "the first `check-all` run after fresh .tex changes can fail transiently … rerun once before diagnosing" (`device-migration-notes.md` §4). A gate that teaches retry-on-red.

## Sharp edges & impedance mismatches

- **Async execution vs per-turn ritual.** "Dispatch and harvest happen in different turns… inflating the no-wave counter while a wave is literally in flight" (`FR-FEEDBACK.md:44-49`). Requested primitive: `fr dispatch`.
- **Two safety mechanisms fighting.** The Stop hook's forced `.frontier/log.jsonl` append tripped af's overreach guard → the guard had to exempt `.frontier/` (commit `4122cd28`); worse, "the Stop-hook-forced fr log append **killed a live run** whose baseline was committed-clean" (`docs/worklog.md:1483-1484`).
- **Guards keyed on global repo state don't compose.** "All 6 parallel first-attempt runs aborted; zero genuine overreach" (`worklog:1478-1481`); a BALLOON abort was "a PROVER-OVERREACH FALSE POSITIVE self-inflicted by appending an fr log entry after the af launch (dirty snapshot baseline)".
- **Round-barrier scheduling wastes the parallelism it exists to buy**: "rounds 3-7 of the resume were essentially serial with one worker active per round".
- **Precision, not presence, was the provenance gap.** OCR form-feeds made `splitlines()` locus arithmetic wrong by ~82 lines; `check-refs` passed because it tests quote-exists-**somewhere**, not quote-**at-locus**; a STUCK run validated 5 nodes against corrupted externals and one verifier ACCEPTED a node citing them (`docs/worklog.md:1969-1976`).
- **Mutually-consistent-but-wrong survives every gate.** The M26 shard contract was mis-landed; "shard and workspace mutually consistent, so every gate stayed green; visible only against the ratified design text" (`docs/worklog.md:2172-2179`).
- **Per-node adversarial verification is locally sound, globally unsound**: "a verifier cohort can accept an inference that a differently-framed cohort rejects — cross-workspace CONSISTENCY … is not enforced by per-node verification" (`docs/LEARNINGS.md:93-125`). Cost: T0 107→105, then a sweep 105→101.
- **Headline-level claims drift free of the machinery.** Agents kept repeating both "Route F proved-mod-audit COMPLETE" and "GAPs remain" without reconciling, until **user escalation** forced the retraction; new rule minted: a demoted headline needs a LEARNINGS entry *in the same commit*.
- **Author-role violation caught only by self-inspection**: "During the F2 repair I began hand-editing the landed contract, self-caught mid-edit … REVERTED … and delegated to a fresh design job" (`docs/worklog.md:1657-1660`).
- **Near-miss on gate bypass under worktree isolation**: one worktree agent used `--no-verify` on a worktree-only test failure and merged; the Stage-1 agent correctly refused and escalated (`docs/worklog.md:1778-1780`).
- **Verdict filenames choke on long claims** → forced id-form-claims workaround, documented in a script docstring rather than fixed; **FRONTIER trail growth** bloats every turn's injected context.
- **Permission friction**: `.claude/settings.local.json` allowlists exactly one command (`Bash(fr board *)`); every other tool call prompts.

## Incident ledger (rule → triggering incident)

| Rule / guard | Trigger | Citation |
|---|---|---|
| codex effort capped at `xhigh`, never `ultra` | "`ultra` unstable — spawns subagents indiscriminately" | `CLAUDE.md:284-286`; commit `0371dd80`; `worklog:1038-1042` |
| Never disable pre-commit / no `core.hooksPath=/dev/null` (Rule 12) | device migration left the gate INERT; "one red commit slipped, caught and re-gated" | `worklog:1414-1415` |
| `lem-dual-localization` retired; §3 "frame-specific → frame-free" callout | transcribed contract was a **distance tautology** | `LEARNINGS.md:14-30`; commit `a27b8266` |
| "quantifier hygiene" on contracts | `lem-hx-financing-floor` said "all reals A"; 2×2 identity falsifies the floor | `LEARNINGS.md:40-62` (caught by W61 fresh verifiers) |
| A demoted headline needs a LEARNINGS entry in the same commit | "Route F complete" repeated alongside "GAPs remain" for days; user escalation 2026-07-26 | `LEARNINGS.md:64-91` |
| Explicit-binder discipline: a definite-description map needs a TYPED WITNESS | anaphoric polar-inverse identified with a typed inverse without a preimage witness; T0 107→105 | `LEARNINGS.md:93-125` |
| Sweep-not-piecemeal on an allegation class | second W97 wave found 4 more of the same class; T0 105→101 | `LEARNINGS.md:127-155` |
| Premises must be **registered**, not merely true | M25/M19-S2/S3 used unexported inferences; linker auto-suspended M18/M20 | `LEARNINGS.md:157-193` |
| Red-green fixtures for the OVERCLAIM detector | "ZERO test coverage, and the file falsely claims a test exists" | `remediation-plan:45-48`; commit `585151e9` |
| `check-refs` must hard-error on missing payload | "19/19 externals skip — false-greens on a clean checkout" | `remediation-plan` item 6 |
| Quota fast-fail in `run_codex` | "today's 14 burned rounds" on undetected usage-limit errors | `remediation-plan` item 7 |
| Overreach guard widened to ANY path outside `proofs/<rid>/` | "a workspace-write prover can currently edit refs/, report/, even scripts/ gates untripped" | `remediation-plan` item 8 |
| `report/UNWIRED.md` whitelist; WARN→ERROR | 107 permanently-ignored warnings | `remediation-plan` item 9 |
| `NODE_SOFT_CAP` unified to 26 | 12 vs 40 vs trees at 14–52; 20 noise warnings | `remediation-plan` item 10; prose re-drift fixed `8b5080fb` |
| `seed-af-workspaces.py` must insert `workspace:` | "62/151 shards lack the field, so the gate-breaking seed bug recurs on EVERY new elevation" | `remediation-plan` §PHASE0 item 2 |
| A proved result must not wear a `conj-` id | `conj-halo-collapse` validated but still `conj-` | `remediation-plan` §PHASE0 item 3 |
| Batched verification default; OR-route linker support | 2026-07-10 methodology assessment, user: findings are P0 | `methodology-assessment.md:29,32,37-40` |
| af runs strictly sequential per checkout → worktree-per-run | "all 6 parallel first-attempt runs aborted; zero genuine overreach" | `worklog:1478-1481` |
| Overreach guard exempts `.frontier/` | fr Stop hook wrote to `log.jsonl` during a live run | commit `4122cd28` |
| Commits only in zero-live-run windows | "the Stop-hook-forced fr log append killed a live run" | `worklog:1483-1484` |
| **fr/bd writes FIRST, commit, af launch LAST** | self-inflicted BALLOON false positive from a dirty snapshot baseline | `worklog:1653-1656` |
| Report subagents must work in isolated worktrees while af is live | mainline writes self-trip the porcelain guard | `worklog:1775-1780` |
| Cap hit = factoring stop, never self-permission to enlarge; cap raises USER-RATIFIED per row | W98 row-1 ABORT [BALLOON] 20 vs 14; B0i 17>15 → ratified 15→20 | `worklog:2025-2027` |
| Clean re-seed, never patch, after balloon/STUCK | "patched trees thrash, clean re-seeds close (M03/M09/M12/M13/M19-S1)" | `worklog:2118-2119` |
| `rm -rf` the whole workspace dir before re-seed | leftover gitignored caches make `af init` fail with a ledger sequence-gap error | `device-migration-notes.md` §3 |
| Registration = `\n`-space extraction + quote-**at-locus** check + page-image eyeball | the scan-OCR locus trap; 5 nodes validated against corrupted externals | `worklog:1969-1976` |
| root == **ratified design text** pre-launch check; duplicate-contract tripwire | M26 mis-landed contract, all gates green | `worklog:2172-2179` |
| Orchestrator must not hand-edit a landed hostile-endorsed contract | self-caught mid-edit during F2 repair, reverted | `worklog:1657-1660` |
| Register all deps, cite only what is used | registered-but-uncited externals "tempt tree reinflation" | `HANDOFF.md:107-112` |
| `fr log banked` requires an oracle-verified artifact | designed anti-gaming; fired correctly against a registry landing | `worklog:2311-2314` |
| Anti-gaming §5 wording ("a residual can't be paraphrased away") | the breaker was found "structurally defeated by `progress` self-tagging" | `audit:49-51` |
| `af def-add --dry-run` guard (upstream af 0.1.4) | `--dry-run` was a global no-op; every mutating command wrote anyway | `AF-FEEDBACK.md:18-25` |
| Legal-open-access-only for refs; do not chase mirrors | Lee and Granas–Dugundji failed acquisition → user escalation | `device-migration-notes.md` §2 |
| No remote CI | standing user directive; "failure-email noise is worse than zero signal" | `PRD.md:85-86` |

## Multiplayer notes

- **Everything assumes a single writer.** bd/Dolt takes an exclusive lock — "Do not run multiple `bd` commands in parallel". af orchestrations are sequential per checkout. Even after `parallel-af`, the law is "≤5 concurrent, **serial banking**" in the main checkout, plus "no design/audit codex while ANY af run is live".
- **Concurrency was retrofitted as isolation, not merge**: `git worktree add --detach .claude/worktrees/af-<row> HEAD`, orchestrator from *inside* the worktree, rsync back, remove after banking. Two such worktrees are still on disk months later, each with its own vintage of every governance doc.
- **The real multi-agent artifact is a hand-written merge protocol.** `.claude/worktrees/agent-ad79636b2ebfcd24a/MERGE-NOTES.md` contains a per-file conflict-risk table with resolutions, an explicit "no file is shared except the four wiring files", a shard-numbering collision protocol, and a post-merge command list. **A successor should generate this, not ask an agent to write it.**
- **Empirically-identified shared hot spots** (`MERGE-NOTES.md` §2): `report/main.tex`, `report/README.md`, `report/SHARD_CATALOG.md`, `scripts/check-all.sh`, `CLAUDE.md`/`AGENTS.md`, `report/Makefile`, and — self-inflicted — tracked build artifacts `report/main.pdf` and `report/sections/*.aux`. Tracking derived files guarantees conflicts.
- **What merged cleanly**: append-only logs (`.frontier/log.jsonl`, `docs/worklog.md`) and one-object-per-file shards (`argument/lemmas/` ×364, `definitions/` ×48, `proofs/` ×342). The ~200-line sharding rule paid off mainly as a **merge** property, not a context property.
- **Sequential ids are the collision surface**: `AISM-NN` report shards forced a renumber (36→37) and needed a suffix escape hatch (`00a`). Slug ids (`def-`, `lem-`) had zero collisions.
- **Global-state guards are hostile to multiplayer.** The porcelain-snapshot overreach guard treats every concurrent writer as an attack; the fix each time was to serialise humans/agents, not to scope the guard. A successor needs **path-scoped lane ownership**.
- **Role separation is already multi-agent**: orchestrator / prover / verifier / hostile auditor / transcription auditor / design agent, "roles never mix". The natural unit of a successor is the **role**, not the session.
- **Read-only fan-out was the safest concurrency and was used repeatedly**: 4 parallel sonnet auditors for the operational audit ("each instructed to verify against primary shards, not HANDOFF claims"); 4 recon lanes with verbatim worker answers and orchestrator-attributed synthesis, where "Workers did not edit tracked files and did not run fr/bd/git".
- **The human is a designed serialization point, and the batching primitive is good.** `docs/plans/2026-07-27-W78-ratification-package.md`: "NOTHING IN THIS PACKAGE LANDS WITHOUT EXPLICIT USER RATIFICATION"; four decisions D1–D4; canonical-source table; and deliberately **quotes no contract text (anti-drift)** — ratification is of *files as audited*, plus enumerated corrections folded in verbatim.
- **Cross-device/human handoff is a manual reconstruction procedure**, not a feature: `refs/` payloads gitignored, `refs-staging/` untracked with a committed snapshot, `bd dolt pull`, scratchpad lost. Untracked-but-load-bearing state is the multi-human failure mode. Counter-evidence for repo-as-canon: "the cycle-319 cross-device merge succeeded for exactly this reason".
- **Scale for calibration**: 1112 commits over 24 active days, 42 sessions, 81 worklog entries, 1130 fr cycles, 364 registry shards, 48 definitions, 342 af workspaces, 169 af-validated (T0), `op-classical` still OPEN.
