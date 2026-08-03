<!-- ROLE: raw postmortem evidence (Opus subagent report, banked verbatim).
     UPDATE-POLICY: frozen historical record; never edit.
     TRIGGER: consulted from docs/memos/2026-08-03-aism-bitter-lesson-snapshot.md -->

# AISM postmortem — tooling/scripts agent report (banked verbatim)

## Tooling inventory (piece → purpose → state)

**`scripts/` = 23 files, ~9,450 lines Python/shell + 1,305 lines of tests.** Verified state by running every read-only gate.

### A. The gate suite (all wired into `scripts/check-all.sh`, which is the pre-commit hook; `check-all.sh:2-3` "No remote CI — this is the only gate")

| piece | lines | purpose | state (measured now) |
|---|---|---|---|
| `check-defs.py` | 162 | Layer-0 definitions DB: required fields, **dedup/drift guard** (no two shards claim one term), cited sha256 in `refs/manifest/checksums.sha256` | GREEN — 46 shards, 0 err, 11 warn |
| `check-refs.py` | 214 | Byte-verbatim quote matching of every af external back to a local `refs/` file. Guards **quote fabrication by provers** (`check-refs.py:5-8`) | GREEN — 959 externals: 27 PASS byte-verified, 927 `skip_import`, 5 `skip_noquote` WARN |
| `argument.py` | 725 | THE LINKER: acyclic DAG, import resolution, **contract match (registry contract ≡ af root)**, status propagation, brittleness, orphans | GREEN — 364 results, 32 ready, 115 blocked, 0 err, 15 REFACTOR warns |
| `check-runs.py` | 88 | Numerics gate: every `runs/` bundle needs README + re-run Command + declared **invariant/certificate** + INDEX row | GREEN — 38 bundles, 0 err |
| `check-provenance.py` | 523 | Report↔registry sync + `latexmk` build + undefined-`\ref` scan. Guards **status OVERCLAIM** (`:23-24`: "a registry status=open result framed as proved… the project's #1 guarded failure mode") | wired, `--build` folds in the single report compile |
| `check-report-shards.sh` | 121 | Lab-book shard hygiene: master purity, SHARD-ID grammar, README/CATALOG cross-index, 280-line cap | GREEN — 55 shards |
| `gen-report-defs.py` | 1591 | `definitions/*.md` → LaTeX, gated `--check` byte-compare | active |
| `gen-report-dag.py` | 1067 | Route-F sub-DAG TikZ atlas; imports `argument.py`'s parser so the two "can never disagree about the data" (`:24-26`) | active |
| `gen-report-stats.py` | 1632 | Campaign statistics. **Split extract/render with a committed snapshot between** — only RENDER is gated, because "a naive byte-freshness gate over such a generator would be permanently red" (`:15-20`) | active |
| `gen-current-pointer.py` | 97 | One generated indirection at the latest `*top-down-proof-sketch*.md`, so prose stops hardcoding `vNN` | active (v46) |

### B. The af orchestration layer

| piece | lines | purpose | state |
|---|---|---|---|
| `af-orchestrate.py` | 514 | The driver: one prover build → rounds of {prover-fix ∥ verifier-attack} until root `validated`. **Never judges proofs itself** (`:4-7`) | live, 5 commits, most-churned script |
| `af_constants.py` | 19 | Single `NODE_SOFT_CAP = 26` read by BOTH `argument.py` and `af-orchestrate.py` — a shim built *after* the two drifted (linker warned >12, orchestrator capped at 40, real validated trees run 14–52) | live |
| `codex-dispatch.sh` | 147 | Quota-resilient wrapper: probe → parse "try again at" → sleep to reset+2min → exec | **14 invocations total**, last 2026-07-16 (`.frontier/dispatch-log.txt`) |
| `seed-af-workspaces.py` | 125 | `af init` one workspace per non-open-problem shard + round-trip verify + flip `af: none`→`seeded` | 342 dirs created |
| `provision-af-row.py` | 50 | `af def-add` + `af add-external` from the shard's `defs:`/`deps:` lines | 2 doc mentions, 1 commit |
| `register-oracle.py` | 90 | Append one `af-<rid>` oracle to `.frontier/portfolio.json`, **idempotent + byte-format-verified append-only** (`:73-78`) | 134 oracles registered |
| `oracles/af-validated.py` | 77 | The ONE fr oracle: claim binds to contract ∧ af root ≡ contract ∧ root `validated` ∧ taint all `clean` | 147 verdicts on disk |

### C. Write-once / dead weight

| piece | lines | evidence |
|---|---|---|
| `gen-dag-figure.py` | 85 | **DEAD.** 0 mentions in any `.md`; `report/figures/` does not exist; no `\includegraphics` of `dag.pdf` in any `.tex`; `.gitignore:48` still whitelists `!report/figures/dag.pdf` |
| `land-ledger-domains-rows.py` | 326 | **Write-once by construction**: hardcodes `REPO = pathlib.Path("/home/tobiasosborne/…")` (`:23`) and `sys.exit(f"REFUSING to overwrite existing shard")` (`:312`). Ran once, 2026-08-03 |
| `beads-sync.sh` | 87 | 0 mentions in any `.md`; 1 commit; explicitly "NOT run by any git hook" (`:38`) |
| `build-workspace.sh` | 119 | 5 doc mentions, 1 commit; motivated by "the recorded W56 rebuild-cost incident" (`:8`) |
| `fetch-refs.py` | 229 | 1 commit; the reconstruction recipe travels with the repo but has no gate forcing it to still work |

## af workflow surface as-practised

**Binary:** Go tool from `../vibefeld`, versions 0.1.3 → 0.1.6 across the campaign, **never pinned in code** — `CLAUDE.md:203` only prescribes running `"$AF" --version`.

**Subcommand surface actually used** (from `af-orchestrate.py`, `provision-af-row.py`, `seed-af-workspaces.py`, `af-validated.py`): `init`, `get [--full|--subtree|--ancestors]`, `status`, `jobs --role prover|verifier [--ready]`, `claim`, `release`, `reap`, `refine`, `def-add`, `defs`, `add-external`, `externals`, `challenge --target <statement|inference|gap|type_error|context|dependencies|scope>`, `challenges`, `resolve-challenge`, `accept --confirm`, `unvalidate`, `archive`, `export`.

**State machine.** Node field `epistemic_state` ∈ {pending, `challenged`, `validated`, `archived`}, plus an orthogonal `taint_state` (only `clean` appears in all 2,472 tracked export records). Verifier verdict lines are `VERDICT accepted|challenged|blocked <node>` (`af-orchestrate.py:294,299,300`). Registry mirror is the shard's `af:` field ∈ {`none`, `seeded`, `validated`} with the propagation law "a lemma may be `af: validated` only if every `dep` is too" (`argument/README.md:68`).

**Role separation is the load-bearing invariant.** Prover = fresh `codex exec` (gpt-5.6-sol); verifier = a *separate* fresh `codex exec` per node, "explicitly told that finding a counterexample/gap/error is a BIG SUCCESS" (`af-orchestrate.py:16-18`). Only a verifier may `accept`. The orchestrating agent is hard-prohibited: "**Never re-derive/judge a proof, and never run `af accept`/`af challenge` yourself.** Reasoning about a step's correctness poisons your context (L5)" (`CLAUDE.md:271-272`). Bottom-up enforced: a node dispatches to a verifier only when all live children are `validated`; `archived` children explicitly do not block (`af-orchestrate.py:296-297,430-432`).

**Verdict flow to the bank.** `af export` → `fr verify proofs/<rid>/export.md --oracle af-<rid>` → oracle re-reads the ledger and checks four conditions → fr hash-binds the verdict to `(claim, oracle_digest, inputs_hash)` so it **stales automatically** when the ledger or shard changes (`.frontier/verdicts/*.json`). This is the one genuinely mechanical link between "codex said validated" and "the repo claims rigour."

**Where humans intervene** — five named points: (1) electing a row for elevation at all (`CLAUDE.md:123-126`); (2) contract/def changes — "A verifier finding needing a CONTRACT/DEF change returns to design/user" (`HANDOFF.md:162`); (3) balloon/stuck triage — read the orchestrator's classification, "genuine gap → stop — don't just bump rounds"; (4) design ratification — root node 1 must be byte-present in the *ratified design*, not merely equal to the shard (`HANDOFF.md:97-99`); (5) status-ladder promotion and every stop condition (`CLAUDE.md:333-343`).

**The banking chain is nine manual steps**, verbatim from `HANDOFF.md:133-135`: `rsync back → export → register oracle → fr verify export.md → mechanical flip → regenerate (INDEX/DAG + report defs/dag/stats) → check-all → fr log banked → commit → push → remove worktree`. No single command does this. It is executed by hand per row, ~169 times.

## Ingest sub-campaign learnings

`docs/ingest/` is a byte-for-byte ingest of a prior 2-day, ~20-wave campaign (`README.md:14-16`), preserved as "**a starting point, not an oracle**" and "**NEVER cited as rigorous**" (`README.md:20-23`). Its deliverable is `README.md` §(c): an **honest re-tag table** mapping every upstream status onto this repo's rungs, with everything downgraded and nothing upgraded — even the one upstream `af`-validated result "RE-ENTERS here as `proved-mod-audit` until re-validated under this repo's own protocol" (`README.md:100`). This is the single most transferable artifact in the directory: a mechanical, per-claim provenance-laundering barrier at a repo boundary.

Orchestration findings, all from `LLM-LEARNINGS.md` / `ORCHESTRATION.md`:

1. **The deliverable is a FILE, written incrementally; the final message is a ≤300-word pointer.** A 64-minute run died at the end with "response exceeded the 64000 output token maximum" — an hour of reasoning lost because 31 tool calls were all reads and nothing hit disk (`LLM-LEARNINGS.md:52-58`). Now standard for all long subagents.
2. **Progress protocol doubles as wedge detection and server-side checkpointing.** A wifi blip left codex on an ESTAB-but-dead TLS socket, hung ~25 min with no output and no exit, "undetectable without event streaming" (`:18-24`). Fixes: never `--ephemeral`; always `--json` events to a file; a 10-second smoke test separates pipeline-health from run-health (`:25-32`).
3. **Cross-family alternation catches real errors.** opus proves → codex verifies → codex proposes → opus refutes caught "an inverted inequality, an overclaim, two numerics artifacts, and one vacuous proof route in a single day — each catch by a DIFFERENT party than the author" (`:42-48`). Calibrated-probability asks ("P(true)? P(provable)?") "produced usefully honest numbers, not flattery."
4. **Convergence across mandated-diverse strategies is itself evidence.** 6/6 provers with 3 disjoint mandated technologies adopted the same frame and died at the *same* inequality — "strong evidence the residual is genuinely ONE lemma, not an artifact of one prover's blind spot" (`:59-67`). Dead angles still paid (an anti-lemma proving a route insufficient). **Opposite-bias pairs** on one target produced both the kill and the rescue, "cheaper than a prove-then-audit chain" (`:70-73`).
5. **Format-forcing makes cross-comparison mechanical.** Requiring "the precise failing inequality in display math" from every worker made 8-way comparison trivial — "the died-at lines aligned almost verbatim" (`:74-75`).
6. **Sandbox capability gaps are permanent brief-content.** Gurobi imports but fails to optimize inside `codex exec -s workspace-write` (HostID license mismatch); works outside. Standing rule: codex WRITES the script, orchestrator RUNS it outside the sandbox (`:80-89`).
7. **Interruption-resilience protocol** (`ORCHESTRATION.md:34-52`): snapshot volatile `/tmp` artifacts into the repo eagerly, not only at landing; commit early, tolerate push failure; briefs bounded to ≤30 min so an interruption loses at most one attempt; local-first fallback when the network dies.
8. **Process hygiene, learned the hard way**: "never `pkill -f`/`pgrep -f` with a pattern contained in your own command line (self-match kills your own shell)" (`ORCHESTRATION.md:61-62`).
9. **The read-order discipline that survived**: `OVERVIEW.md` (plain-language, no jargon undefined, full strategy map with every death certificate) is the designated first read, above the LaTeX and above the dossier (`HANDOFF.md:9-14`). Its §4 is a graveyard with pointers — "Died entries are permanent constraints: do not re-walk them without new input" (`OVERVIEW.md:168-169`).

## Frictions & impedance mismatches

1. **Three stale hardcoded `af` fallback paths, two of them mutually inconsistent.** `af-orchestrate.py:45` and `seed-af-workspaces.py:26` fall back to `/home/tobias/Projects/vibefeld/af`; `oracles/af-validated.py:29` falls back to `/home/tobias/go/bin/af`. **All three paths do not exist** — the home directory moved to `/home/tobiasosborne/`. They survive only because `shutil.which("af")` resolves first. `provision-af-row.py:15` has no `which()` fallback at all and would break immediately. Same rot in `docs/ingest/README.md:15,26,287` (the ingest's own source pointers are dead) and in `report/reviews/overclaim-audit.md`, whose every citation is an unreachable absolute path.

2. **Two `.gitignore` files disagree about `assumptions/`, and the wrong one wins.** `af init` (≥0.1.5) writes a per-workspace `.gitignore` saying "Tracked (commit these): ledger/, **assumptions/**, externals/, meta.json" — a fix `AF-FEEDBACK.md:34-39` explicitly argued for, because "**assumptions/ is filesystem-primary** (written directly, not replayed from the ledger), so it is tracked too — ignoring it would have dropped assumption data." The repo's root `.gitignore:22` ignores `proofs/**/assumptions/`, and a parent-level directory exclusion cannot be re-included by a nested file. `git ls-files 'proofs/*/assumptions/*'` returns **0**, across 223 such directories. Currently harmless only because all 223 are empty — a latent, silent data-loss path.

3. **161 invisible orphan workspaces.** 342 dirs under `proofs/`; only 181 have a `ledger/`, 171 an `export.md`. The other 161 (e.g. `proofs/conj-b-restricted/`) contain nothing but the five gitignored dirs — no ledger, no `meta.json`. `git status` is clean, and `argument.py`'s `check_orphans` only errors on "orphan workspace (no registry entry)" (`argument.py:272`), so all 161 have registry entries and no gate reports them. State exists on disk that no tool can see.

4. **The verifier can validate a wrong proof — six times, documented.** `docs/LEARNINGS.md` records five retraction events where af-VALIDATED, taint-clean, oracle-verified certificates were later found defective: T0 fell 107→105 (`:93`), 105→101 (`:127`), 159→156 (`:157`). Root cause, verbatim: "the elevating cohorts systematically treated repeated notation and definite descriptions as **binder unification across opaque theorem boundaries** — same-named anaphora elevated into missing equality premises" (`:151-153`). And the process finding: "**a verifier cohort can accept an inference that a differently-framed cohort rejects — cross-workspace CONSISTENCY of what 'the same map' means is not enforced by per-node verification**" (`:121-123`). Every one of these was caught by a *design audit*, not by the run's own verifiers.

5. **Exit codes conflate healthy with failed.** `AF-FEEDBACK.md:57-60`: a run that hit `--max-rounds` while *converging* (root pending, 16/28 validated, resumable) "exited 1… the harness surfaced it as a task FAILURE."

6. **`--phase all` on an existing tree grafts a second tree onto the ledger** — the build block is gated only on phase, nothing checks whether node 1 has children. "We avoided it only because the DONE banner recommends `--phase verify`" (`AF-FEEDBACK.md:51-55`). Still unfixed in the source I read.

7. **`--phase verify` is misnamed** — it also dispatches prover-FIX jobs, "and we had to read the loop source to confirm resuming under it would still fix challenged nodes" (`AF-FEEDBACK.md:67-70`).

8. **Round barriers serialize the deep chains.** "Rounds are lock-step: each round waits for its slowest codex worker… rounds 3-7 of the resume were essentially serial with one worker active per round" (`AF-FEEDBACK.md:74-78`).

9. **fr's dead-route board inverts its own semantics.** `died --at` records the residual the attempt died *at* (the live frontier) but renders it under "DEAD ROUTES (do not re-walk)", so "the board simultaneously says arm B's target is 'quotient packing' and 'do not re-walk: quotient packing'. Actively misleading for any fresh agent that trusts the board" (`FR-FEEDBACK.md:14-23`).

10. **fr's bank gate rejects a passing verdict on a claim/artifact string mismatch, with an unhelpful error.** Verifying claim `lem-classical-equiv` then logging `--artifact proofs/lem-classical-equiv/export.md` was REJECTED; re-verifying with the *path* as the claim fixed it (`FR-FEEDBACK.md:25-34`). The whole `af-validated.py` claim-binding clause (`:5-12`, accepting both id-form and contains-contract-form) exists to paper over this.

11. **Verdict filenames choke on long claims** — "the workaround is id-form claims" (`FR-FEEDBACK.md:51-54`); visible in `.frontier/verdicts/` as a mix of 16-hex-hash filenames and one 87-character filename — the naming scheme leaked campaign prose into the filesystem.

12. **Background waves don't fit fr's per-turn ritual.** Dispatch and harvest happen in different turns, so the dispatch turn has no outcome and must be `orient`-logged, "inflating the no-wave counter while a wave is literally in flight" (`FR-FEEDBACK.md:44-49`). The counter itself stuck at ×7 across turns that *did* log pulls (`:38-42`).

13. **Permanent WARN noise trains agents to skim.** The 29-node validated tree "now trips `WARN REFACTOR … (>12)` on EVERY gate run — accepted debt… but the WARN is permanent noise that will train agents to skim warnings" (`AF-FEEDBACK.md:80-84`). Confirmed live: `argument.py --check` emits 15 REFACTOR warnings on healthy validated trees.

14. **Prover overreach is a recurring class, not an incident.** `af-orchestrate.py:336-339`: "**Twice now** provers have edited registry shards / created phantom Layer-1 shards / hand-provisioned defs." A codex prover gets repo-wide `workspace-write` but must write only inside `proofs/<rid>/`; the guard is a `git status --porcelain` diff with a hand-maintained allowlist that needed a `.frontier/` exemption after a false positive on 2026-07-27 (`:151-156`).

15. **Duplicate-def pollution has no tool guard.** `HANDOFF.md:99-101`: "`af def-add` does **NOT** reject duplicates — it assigns fresh ids and pollutes the seed." The mitigation is a human pre-launch checklist item.

## Durable (A)

- **Byte-verbatim quote matching against local sources** (`check-refs.py`). Guards fabricated citations — a failure mode that gets *more* dangerous as models get more fluent, not less. The normalization is tuned deliberately: strips whitespace/markdown-emphasis noise but keeps LaTeX and `$`, "because fabrications often differ there" (`:32-38`). Ground truth beats persuasion at every scale.
- **The contract-match invariant** (registry `contract:` ≡ af root node 1 statement, enforced in `argument.py`, re-checked in `seed-af-workspaces.py:95-96`, re-checked again at verify time in `af-validated.py:58-60`). One string, three independent checks, no human judgment.
- **Hash-bound, auto-staling verdicts.** `.frontier/verdicts/*.json` binds `claim_hash + oracle_digest + inputs_hash`; edit the ledger or the shard and the verdict dies. Freshness-by-construction is strictly better than freshness-by-discipline at any model strength.
- **Append-only ledger as sole source of truth** (15,305 tracked ledger files; `nodes/`, `defs/`, `lemmas/` all rebuildable and gitignored). Reproducible derived state, one writable authority.
- **Adversarial role separation with the orchestrator barred from judging.** `CLAUDE.md:271-272` and `af-orchestrate.py:4-7`. Reviewer ≠ author is a structural property, not a capability workaround; a stronger prover makes an independent verifier *more* valuable, not less.
- **Status propagation + mechanical demotion.** When M19-S2/S3 were demoted, "the linker's status-propagation law **then suspended** banked M18 and M20" automatically (`LEARNINGS.md:188-193`).
- **The honest re-tag table at a repo boundary** (`docs/ingest/README.md` §c). A mechanical, per-claim rule for what an inherited claim is worth here, with nothing upgraded. Provenance laundering is a permanent hazard of composing agent-produced corpora.
- **The retraction ledger itself** (`docs/LEARNINGS.md`). "A retraction here is a SUCCESS of the rigour machinery, not an embarrassment" (`:4-5`).
- **Numerics-as-run-bundle with a declared invariant** (`check-runs.py:11-16`): "the thing that makes the number checkable rather than decorative."
- **Generated-vs-authored separation with byte-compare gates**, including the split-generator design in `gen-report-stats.py:15-30` that solves the "statistics about a repo change on every commit" self-reference problem.
- **The file-not-final-message rule** (`LLM-LEARNINGS.md:52-58`). Checkpointing to durable storage rather than accumulating a payload in a terminal message is architecture, not prompt-craft.
- **Cross-family / opposite-bias adversarial pairing and mandated-diverse portfolios** (`LLM-LEARNINGS.md:42-75`). Independent convergence as a validity signal, and dead angles yielding reusable anti-lemmas, are properties of *portfolio structure*, not of any model's weakness.

## Scaffolding (B)

- **Prompt scaffolds in `af-orchestrate.py:202-315`** — `ground()`, `prover_build_prompt()`, `verifier_prompt()`, `prover_fix_prompt()`. Includes exact `af` command lines, numbered protocol, "trust NOTHING you are merely told", "FINDING A COUNTEREXAMPLE… IS A BIG SUCCESS", anti-charity instruction. The hostility framing is the part most likely to survive as a role definition, the flag-by-flag command recitation the least.
- **`deps_groundtruth()` / do-not-challenge-definitions clause** (`:220-229,242-244`). Scope specification arguably durable; the phrasing is calibration against current over-/under-hostility.
- **Effort tiering and its cap** (`:53-65`): `CODEX_EFFORTS` capped at `xhigh` because "ultra is unstable and spawns subagents indiscriminately"; per-effort wall-clock timeouts 900–3600s. Pure current-model calibration.
- **Node-count tripwires** (`af_constants.py`, `--node-cap`, `--stuck-rounds`). `NODE_SOFT_CAP = 26` is an empirical fit to this campaign (validated trees 14–52, balloons 75–102). The idea of a budget tripwire is durable; the number is scaffolding.
- **`classify_open_challenges()`** (`:105-130`) — regex buckets over challenge reason text. `af challenge --category` was added in 0.1.5 precisely to make this exact; the grep survives anyway.
- **Quota-outage sentinels** (`CODEX_USAGE_LIMIT_MARKERS`) — string-matching provider error spellings. Brittle by construction.
- **`--no-overreach-guard` and its allowlist**. A sandbox that scoped writes correctly would make this unnecessary.
- **`build-workspace.sh`** — hand-assembled context snapshot. Pure context-window management.
- **Pre-launch human checklists** (`HANDOFF.md:96-107`). Every item is a missing tool assertion currently held by a person.
- **`gen-report-defs.py` macro-translation table** — refusal-to-guess policy durable; translation table is format babysitting.

## Anti-patterns (C)

- **`gen-dag-figure.py` — fully dead.** No consumer, no output dir, no reference anywhere.
- **`beads-sync.sh`** — solves a real problem (cross-device beads divergence, "cycle-319 reconciliation incident") with a script nothing invokes.
- **`land-ledger-domains-rows.py`** — one-shot transcription, hardcoded absolute path, can never run twice; a 326-line frozen data blob in the scripts dir. A data file plus generic loader would carry the same provenance.
- **Three inconsistent hardcoded fallback paths to the same binary**, all dead. The `AF` resolution logic duplicated four times with three different answers.
- **State living in two places, three times over**: root vs per-workspace `.gitignore` (root silently wins); `af challenge --category` vs regex classifier; bd issue duplicating the fr log.
- **Permanent non-actionable warnings.** 15 REFACTOR warnings on every gate run against correct trees; proposed fix (`brittleness-accepted: <issue-id>`) never built.
- **Manual, unautomated 9-step banking chain** executed ~169 times by hand. The one enforced step (fr log banked requiring oracle-verified artifact) caught an error — the argument for scripting the rest.
- **161 orphan workspace skeletons** invisible to git status and every gate; seed/re-seed with no teardown.
- **Round-barrier scheduling** — known-inferior, named fix (event-driven re-poll) never implemented.
- **`--phase` as a mode flag** conflating build/resume/verify, one mode silently destructive, one misnamed.
