# Distillation: 12 Months of LLM-Assisted Theoretical Research Tooling

Synthesized 2026-07-17 from deep exploration of seven repos:
`vibefeld` (af), `knowledge-frontier` (fr), `cft-anyons`, `arithmetic-quantum-mechanics`,
`almost-idempotent-channels`, `almost-idempotent-positive-maps`, `almost-idempotent-stochastic-maps`
(plus sibling references found inside them: `extension-property`, `Bennett.jl`, `su2-fft`,
`firstproof`, `npt-bound-entanglement`).

---

## 1. The chronology is the argument

The repos, ordered by first commit, form a visible evolutionary arc. Every piece of the
current architecture earned its place through a specific, documented failure.

| When (2026) | Repo | Methodological event |
|---|---|---|
| Jan 12 – Jul 2 | `vibefeld` (af) | The adversarial-proof kernel is built and hardened across 605 commits, driven by field feedback from the research repos (AF-FEEDBACK.md loops, First Proof post-mortem → 10 feature proposals). |
| May 16–17 | `cft-anyons` v1 | **Maximum-ceremony experiment**: af + Lean4 + beads + five-gate M/D/C/R/I per commit + GLOSSARY hard-gate + 8000-line migration log. |
| May 30 | `cft-anyons` reboot | v1 archived wholesale as "marginal-to-nonexistent value." `ARCHIVED.md`: "⚰️ DO NOT BUILD ON ANY OF THIS." Rule 14 forbids resurrecting the ceremony. |
| May 24–31 | `arithmetic-quantum-mechanics` | **Protocol-first regime**: Three Laws, append-only CONVENTIONS ledger, sharded LaTeX lab book with mechanical gates, SHA256 source manifests, claim-status ladder, and a 46+4+1-agent adversarial mega-review with serial repair queue. No af, no Lean. |
| May 28 – Jun 15 | `almost-idempotent-channels` | Engineering branch (implements Kitaev's CP theorem in C/Julia). Contributes: per-.tex-line citation discipline, cross-check ladder (double-vs-arb, η=0 oracle, SDP duality), committed Claude Code hooks, NO-GO audition trail. |
| Jun 2–13 | `almost-idempotent-positive-maps` | **The typed module system is born**: definitions / argument-DAG / af-workspace layers with a linker. Also: wave orchestration with kill criteria, cross-vendor (Claude + GPT/codex) adversarial verification, two-lane exploration/canonical split. |
| Jun 21 – Jul 3 | `knowledge-frontier` (fr) | The explore/exploit controller is extracted as a standalone binary after the tunnel-vision failure mode is quantified (see §4.3). Hook-injected scoreboard, non-skippable Stop referee, hash-bound oracle bank gate. |
| Jul 2–17 | `almost-idempotent-stochastic-maps` | **The synthesis** (flagship, 376 commits / 21 sessions): all of the above integrated — 4 layers, rigour ladder, fr+bd hooks, 44 af workspaces, 200-node OR-capable DAG, Lamport plan sketches, gated report sync, retrospective audits. |

The arc: **ceremony-first failed → protocol-light succeeded for exploration → machinery was
reintroduced selectively, piece by piece, each piece gated by a felt failure**. cft-anyons v1
and the flagship contain nearly the same component list; the difference is that in v1 the
ceremony was mandatory-everywhere and imposed up front, while in the flagship each gate is
scoped to a promotion boundary and was adopted in response to a concrete incident. Ceremony
that hasn't earned its place gets archived.

A second reading of the same arc: **rigor machinery pays off in proportion to how
contract-shaped the claims are.** cft-anyons (pre-theorem exploratory physics: conventions
unfixed, definitions still moving) rejected af; stochastic-maps (a single sharply-posed
conjecture with a reduction chain) made af the centerpiece. The tool must support both modes
and the transition between them.

---

## 2. The convergent architecture

Independently refined across repos, the mature stack is four layers plus a control plane:

```
Layer 0  definitions/        one shard per term; kind: cited|consensus|original;
                             alias dedup gate ("drift is death"); never "proved"
Layer 1  argument/lemmas/    one shard per result; YAML: contract (one-line statement),
                             defs, deps (AND edges), routes (OR alternatives), status, af
                             → linker enforces: acyclic, imports resolve, contract-match,
                               status propagation, brittleness (>12 nodes/depth 3 ⇒ factor)
Layer 2  proofs/<id>/        af workspaces, opt-in, one per elevated conjecture;
                             root contract byte-equal to registry shard
Layer 3  runs/<date-slug>/   numerical evidence bundles; invariant required;
                             "numerical is never rigorous" — a permanent ceiling
Control  CLAUDE.md==AGENTS.md constitution · fr portfolio hooks · bd issue DAG ·
         check-all.sh local gate (no remote CI, deliberate) · HANDOFF.md rewritten
         per session · worklog/FINDINGS/LEARNINGS append-only ledgers
```

The **join key across all layers is the contract string**: the registry shard's one-line
statement is byte-identical to the af root conjecture and anchors the report shard; the
linker and check-provenance verify these equalities mechanically.

The **rigour ladder** (flagship CONVENTIONS §a) is the type system:

- Rigorous: `cited` (byte-matched to a hashed local source) · `proved` (af-validated) ·
  `consensus` (recorded sign-off)
- Not rigorous, honestly labeled: `stated`, `proved-mod-audit`, `conjecture`, `heuristic`,
  `numerical`, `open`, `obstruction`, `disproved`
- Hard rule, linker-enforced: **an af-validated result may never depend on a non-rigorous
  result.** Trust propagates monotonically; nothing self-upgrades.

Two verification tiers keep cost sane:

- **L5 "soft" tier** (bulk of work): fresh hostile verifier reviews a *batch* of shards,
  per-shard verdicts VALID / VALID-WITH-CORRECTION / INVALID. Measured yield on the
  flagship: **~48% of prover output corrected, ~15% killed, two whole architecture attempts
  killed** — never a rubber stamp.
- **af "hard" tier** (34/200 results on the flagship): full adversarial protocol —
  tool-enforced prover≠verifier roles, fresh agent per node, challenges block acceptance,
  taint propagation, append-only replayable ledger. The orchestrator **never judges**: "af
  accept/challenge are never run by Claude; reasoning about a step's correctness poisons
  your context."

---

## 3. What the tools actually are

### af (vibefeld) — the validity kernel
Go, single binary, files-as-database. Event-sourced append-only ledger, state derived by
replay, CAS-serialized writes, per-node locks. Nodes carry three orthogonal state axes:
workflow (available/claimed/blocked), epistemic (pending/validated/admitted/refuted/…),
taint (clean/self_admitted/tainted/unresolved). Lamport hierarchical IDs (1, 1.1, 1.2.3),
tool-assigned. Escape hatches with recorded epistemic debt (admit/unadmit, veto). 90+
self-documenting commands; structured exit codes for scripted orchestration. **Scope
disclaimer in its own docs: "procedural rigor, not semantic soundness — does not compete
with Lean."** No MCP, no API client: orchestration is bash (`auto-prove.sh`) shelling out
to headless `claude`/`codex`, one fresh 5-minute agent per job, no context reuse. That is
the structural reason af is slow and token-hungry (see §5).

### fr (knowledge-frontier) — the attention controller
Bun/TS, single binary, pure-core architecture, 273 tests. Modeled as a fund-manager
portfolio: arms = approaches, waves = pulls, outcomes = returns. State = append-only
`log.jsonl` + derived scoreboard. Integration is Claude Code hooks: scoreboard re-injected
**every user turn**; a **Stop hook blocks the turn** until the cycle is logged and the
stall circuit-breaker is respected. Banking a result requires `fr verify` through a
**claim-specific external oracle whose verdict is hash-bound** to claim text, oracle
command, and input files — it goes stale the moment anything changes. Explicit design
principle: "Internal convergence ≠ correctness." Notably: **the actual bandit term
(decaying optimism for untried arms) is on the roadmap, unimplemented.** What's dogfooded
is bookkeeping + forced visibility + a stall breaker.

### The constitution pattern — the orchestrator interface
There is no packaged orchestrator product anywhere. The orchestrator is Claude Code itself,
governed by a CLAUDE.md==AGENTS.md constitution (Laws + Rules + stop conditions + session
close ritual), with the mandatory parts enforced by hooks (`fr check` on Stop, `bd prime`
on SessionStart/PreCompact) and by the local gate (`check-all.sh` in pre-commit). Every
file has a ROLE / UPDATE POLICY / TRIGGER header — the file-role taxonomy is the most
portable single artifact in the ecosystem.

---

## 4. Verdicts on the three core challenges

### 4.1 Hallucination — the barrier works, but the guards themselves failed repeatedly
What demonstrably works:
- Byte-verbatim ground truth (grep-F-matched quotes against SHA256-hashed local sources;
  "never paraphrase from memory").
- The rigour ladder as a *type on every claim*, with linker-enforced propagation.
- External-oracle-only promotion (af verifier, fr verify, byte-match). Self-report is
  permanently `stated`.
- Retraction as a first-class success: LEARNINGS.md ledgers record caught overclaims
  (vacuous framings, silently mis-quantified contracts caught by af challenges, phantom
  subagent claims R3 in positive-maps).
- Overclaim detection as a gate: `check-provenance.py`'s `status OVERCLAIM` check —
  "the project's #1 guarded failure mode."

The critical caveat, documented by the flagship's own audits: **the guardrails themselves
rot.** The fabrication gate false-greened (19/19 externals silently skipped); the overclaim
detector had zero test coverage while its file claimed a test existed; the gate that checks
provenance admits it cannot check statement *content* (a √η↔η drift passes). And these were
caught only by **user-mandated manual audits**, not by the machinery. → A general tool must
treat *gate integrity* as a first-class, scheduled, adversarial concern (guard the guards).

### 4.2 Definition slop — solved by construction, two viable regimes
- **Eager regime** (flagship/positive-maps): Layer 0 registry, one term per shard, alias
  dedup as build failure, definitions never "proved" — only cited/consensus/original.
- **Lazy regime** (cft-anyons/AQM): append-only CONVENTIONS ledger with a **negative list**
  ("Unfixed Core Conventions — do not silently choose any of these"), entries fixed at
  first use, sweep-on-change policy, controlled vocabularies with explicit bans on ad-hoc
  compound tokens.
- Both share: conventions-before-derivations as law; "all scientific bugs are convention
  bugs until proved otherwise" as the default debugging hypothesis; adversarial review
  hunting notation drift as a first-class finding category (the AQM mega-review's P0s were
  overwhelmingly sign/convention drift).
- The transition eager←lazy tracks the exploration→consolidation phase transition. The
  general tool needs both, with promotion of a lazy convention into a locked definition as
  an explicit, gated act.

### 4.3 Aimless wandering / hyperfixation — the honest scoreboard
The flagship's 2026-07-04 operational audit quantified the failure mode *with fr already
running*: **83% of wave-pulls chased one mechanism relabeled A→D→G; the stall breaker was
structurally defeated because every narrowing wave self-tagged "progress" ("stalled"
appeared in 0/106 cycles); 49% of cycles produced no pull.** fr then closed specific gaming
holes (renamed residuals don't reset the breaker; died-outcomes require death certificates).
Conclusions:
- What moved the needle: **forced per-turn visibility** (hook-injected scoreboard),
  **non-skippable referees** (Stop hook), **externalized memory of dead routes**
  (death certificates + "do not re-walk"), and **periodic human-mandated audits**.
- The MAB skepticism is empirically well-founded: the binding constraint was never the
  allocation policy — it was *gaming and visibility*. No bandit math was ever implemented,
  and the system's failures were integrity failures, not exploration-policy failures.
  MCGS/bandits remain unproven here; anti-gaming and audit cadence are proven.

---

## 5. Cost: the af token problem is architectural

- One fresh headless agent per ledger action, 5-min timeout, full context re-derived per
  call via `af get --checklist`, zero caching (Law: agent isolation). A modest 24-node
  proof = 125 ledger events ≈ that many LLM calls.
- Historically ~88% of dispatches were non-actionable (fixed by prover-first dispatch +
  actionability gate) — naive orchestration was mostly waste.
- Working mitigations already discovered: **batched verification as the default** (one
  fresh hostile verifier per harvest batch, validated by the W56 pattern — full per-node
  adversarial rounds reserved for load-bearing/architecture decisions); **Lamport IDs as
  token economy** (compact unambiguous references instead of restated statements);
  bottom-up-ready job filtering; reasoning-effort tiers (routine=high, creative=xhigh,
  "ultra never — unstable, spawns subagents indiscriminately").
- Unexploited levers: persistent verifier sessions with prompt caching; a supervised
  many-jobs-per-agent mode; structured-output enforcement instead of transcript parsing.

Cross-vendor verification (Claude prover × GPT/codex refuter, "two independent model
families with ≥1 adversarial pass" as the PROOF-DONE bar) appears in positive-maps' wave
protocol and cft-anyons' CA-74 orchestration — it's the strongest cheap decorrelator found
in the ecosystem.

---

## 6. Gap analysis: stated vision vs. what exists

| Vision element | Status |
|---|---|
| Git-clonable, general-purpose | **Missing.** af, fr, bd are standalone binaries, but every research repo was stood up by hand-copying sibling conventions; gate scripts are repo-local Python/bash (generically written, never extracted). No scaffold/bootstrap exists. |
| Hard validity barrier | **Exists and is battle-tested** (rigour ladder + linker + oracles + af), with the §4.1 caveat that gate integrity needs its own machinery. |
| Automates everything automatable | Partial: structure/provenance/protocol are automated; content verification is agent-adversarial; lab-book sync and audits are still manual-but-gated. |
| Human-readable lab book in lockstep | **Gated, not generated — and it drifted anyway.** AQM's lab log froze at May 26 while shards reached AQM-95; HANDOFF froze at AQM-45; the flagship had 13 fully-rigorous results with zero report presence until an audit caught it. Strong argument for *generating* the narrative artifact from the ledgers instead of gating manual sync. |
| Beautiful interactive HTML reports | **Absent everywhere.** LaTeX/PDF + Mermaid/GraphViz only. Sole HTML precedent: channels' Documenter.jl software docs. Pure greenfield. |
| DAG with AND/OR nodes | Exists only in the flagship's argument linker (`deps` = AND, `routes` = OR). af is a strict tree; fr is a flat portfolio with a linear frontier trail. **No single unified DAG exists** — state lives in four disjoint stores (fr log, af ledgers, argument registry, beads) joined by contract strings and deliberately thin, monotone, hash-bound seams. The seam-sketch doc explicitly rejected a shared ledger ("too complex"). This is the central architectural decision the new tool must revisit. |
| Fast exploration w/ soft verification | **Exists**: L5 batch hostile review + runs/ bundles with invariants + cft-anyons' tiered Rule 12 (ceremony scales with stakes). |
| Orchestrator-agent interface | Implicit: Claude + constitution + hooks. Not packaged; the constitution is copy-pasted and hand-evolved per repo. |
| Ground-truth provenanced DB | **Per-repo only** (refs/ manifests, literature/ SQLite in cft-anyons, PDF→markdown via marker). No shared cross-project database despite being "non-negotiable." |

---

## 7. Distilled design laws for the target tool

1. **Trust is monotone.** Only external oracles promote; self-report only downgrades.
   Verdicts are hash-bound to claim + oracle + inputs and go stale on any change.
2. **Every claim carries a rigour type**; dependencies propagate the weakest link;
   `numerical` is a permanent ceiling, never a rung.
3. **Contract strings are the universal join key** across registry, proof workspace,
   report, and oracle.
4. **Mechanical gates check structure; adversarial agents check content; never conflate.**
   ("The guard is the gate, not a human reviewer" — for structure only.)
5. **Reviewer ≠ author, enforced by the tool** (role claims, fresh identities), not by
   prompts. The orchestrator never judges correctness — judging poisons its context.
6. **Append-only events, derived state, replay.** Files-as-database, git-native, no server.
7. **Ceremony scales with stakes.** Exploration is cheap and lightly logged; promotion
   boundaries are expensive and gated. Mandatory-everywhere ceremony killed a project.
8. **Negative results are first-class:** death certificates, do-not-rewalk lists,
   retraction ledgers framed as successes of the machinery.
9. **Anything mandatory must be harness-enforced** (hooks, pre-commit, Stop referees) —
   constitution text alone decays from working memory.
10. **Guard the guards:** gates need tests, and the process needs scheduled adversarial
    audits of itself (currently the only component that is still purely human-initiated).
11. **Token economy is a design axis:** batched verification by default, compact stable
    IDs (Lamport), bottom-up-ready dispatch, per-task effort tiers, compute budgets
    written into the constitution.
12. **Two model families for load-bearing claims.**
13. **Self-teaching CLIs:** every command output suggests next steps; agents need no
    external docs at inference time.
14. **Documents declare ROLE / UPDATE POLICY / TRIGGER** in their headers; every doc is
    either append-only, rewritten-whole, or generated — never silently mixed.

## 8. What extraction would take (sketch)

- **Kernel keeps af + fr as separate binaries** (their seam design is sound and tested);
  af needs: batch-verify as a native mode, persistent/cached worker sessions, an
  OR-routes-aware claim graph or a clean export to one, structured output. fr needs: the
  unbuilt gap→arm and refutation→dead-route landings, and the lab-book render it already
  has on its roadmap.
- **New: the scaffold** — a generator that stamps out the four-layer repo (constitution
  template with file-role taxonomy, gate scripts as an installable package instead of
  repo-local copies, shard system, definitions/argument linker, hooks wiring, oracle
  registry). This is mostly extraction, not invention: the flagship's `scripts/` are
  already written generically (env-parameterized paths, generic YAML shard parsing).
- **New: the report engine** — generate the human artifact (HTML, interactive DAG,
  drill-down to ledger events, demo embeds) *from* the ledgers/registry, replacing gated
  manual sync. Greenfield; nothing exists.
- **New: the shared ground-truth library** — promote the per-repo refs/manifest pattern
  (SHA256, locator, retrieval route, line-anchored quotes) into a cross-project provenanced
  store with a query CLI, so definitions/notation/papers stop being re-acquired per repo.
- **Package the orchestrator interface** as a plugin (skills + hooks + constitution
  template) rather than a copy-paste of CLAUDE.md.

## 9. Open tensions worth deciding deliberately

1. **Unify the DAG vs. keep thin seams.** The seam-sketch rejected a shared ledger; the
   vision wants one DAG. Middle path: keep per-tool ledgers as sources of truth, add a
   read-only *projection* layer that renders the unified AND/OR graph for humans and the
   report engine.
2. **Generated vs. gated lab book.** Evidence says gated-manual drifts even under maximum
   discipline. But fully-generated prose loses the "why/frictions" narrative that worklogs
   capture. Likely split: status/DAG/provenance views generated; narrative worklog stays
   human/agent-authored and append-only.
3. **Where the ground-truth DB lives** — per-repo (current, reproducible, isolated) vs.
   global (deduplicates acquisition, enables cross-project notation consistency). The
   manifest format is already stable enough to share.
4. **Bandits/MCGS:** no evidence they're needed; strong evidence anti-gaming + audit
   cadence are. Defer allocation math; automate the audits instead.
5. **Lean's place:** consistently "top rung, final gate, never on the critical path" —
   matches the stated position; the af→Lean export remains an unbuilt roadmap item and is
   the natural submission-time bridge.
