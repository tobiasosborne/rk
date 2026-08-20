<!-- ROLE: design record for the quantum-PCP campaign (rk-campaign-E) and the rk extensions it
     needs. AUTHORED. UPDATE POLICY: append-only decision rows in section 9; body rewritten only
     by TJO ratification. TRIGGER: read before any work on rk-campaign-E, the contract-signature
     schema, the notation register, or the summary-card artifact. -->

# NOTES 2026-08-20 — Quantum PCP campaign plan (rk-campaign-E)

Status: TJO-directed 2026-08-20 (in-conversation). Three decisions taken that session:
(1) target is the HAMILTONIAN version of the quantum PCP conjecture, north star a complete
mathematically rigorous proof; (2) the contract-signature schema extension and the notation
register are rk-owned (schema bump + fixtures + Tier A review), not campaign-local; (3) roster
per orchestrator recommendation (section 7). Standing directive the same day: orchestrate the
work, zero Fable subagents, codex `gpt-5.6-sol` at xhigh for reviews and hard lanes, claude opus
for cognition-heavy lanes, claude sonnet for mundane queries.

Design input: PRD D1-D9 + Amendment A1, `docs/gate-contracts.md` (Gates 1-3 are the extension
points), campaign-D's constitution and decision record (roster decisions 16/18, the codex-quota
outage of 2026-08-19), and the 2026-08-20 survey of the shard/refs/init schemas.

## 1. Thesis and the one governing constraint

A frontier orchestrator can run a very large proof exploration with a light human touch IF the
ground truth the agents read is mechanically anchored to sources and the human's interventions
are enumerated in advance. Every design choice below exists to make one failure class
impossible: a plausible claim about the literature (a dropped hypothesis, a mistranslated
symbol, a result applied outside its regime) entering the DAG and being built on.

## 2. Phases and acceptance bars

| Phase | Deliverable | Acceptance (mechanical, no "looked hard") |
|---|---|---|
| 0a corpus closure | Seed set S; forward+backward citation snowball to depth 2; every paper in the closure triaged `in \| out \| context` with a one-line reason in `refs/triage.md` | `rk refs status` all `in` rows present+hashed; triage ledger has 0 untriaged rows; closure depth and counts stated |
| 0b multiscale cards | Per `in` paper: L0 card (one per paper), L1 cards (one per result), L2 = extraction sidecar already produced by `rk refs quote` | Every claim line on an L0/L1 card carries a `refs/<path>:<line>` + `"quote"` anchor pair; `rk check` refs gate verifies them (section 4); hypotheses list is a field, not prose |
| 0c notation register | One shard per blessed symbol in `definitions/notation/`, per-source translation rows each with an anchor | Notation gate (section 5) green over all cards and shards; 0 unregistered symbols in L1 cards |
| 1 blessed definitions + typed results | Layer 0 shards (`kind: cited`, `source`+`sha256` required) for every object the L1 cards use; Layer 1 shards for every `in` result with `contract` AND the signature block (section 6), `status: cited` or `proved-mod-audit` | defs gate + linker green; every L1 card has exactly one Layer 1 shard; 0 shards with empty signature |
| 2 DAG + checking | Linker with the signature check (section 6) on every pre-commit; `rk render` site; critical path to `thm-north-star` | `rk check` green in consolidation phase; regime-compatibility check has red fixtures; unresolved-reference bucket empty or every entry triaged |
| 3 ideation | Conjecture lanes (opus + codex) generating candidate intermediate results; each admitted only through the A1 entry gates (vacuity, triviality, subsumption, falsification budget, sanity instances, mutation self-test) plus the bite criterion (section 8) | Every admitted conjecture has a signature, a predicted hardness (Brier-scored), and a declared decomposition of the north star it advances |
| 4 portfolio | Arms on `fr board`; goal-graph frontier; wildcard arm floored | Pre-registered arm set committed; allocation per A1 |

Phases 0-2 run in `consolidation` gate phase from day one (they are a ground-truth build, not
exploration); the `exploration` flip happens at phase 3 and is logged. This inverts `rk init`'s
default and is a committed config edit, recorded in the campaign PRD.

## 3. Corpus stopping criterion (phase 0a)

"Complete" is defined, not felt: S is the ratified seed list (first cut produced 2026-08-20 by an
opus lane, arXiv-id verified); closure C = S plus all papers cited by or citing a member of S,
iterated to depth 2, restricted to year >= 1999 and to the Hamiltonian-complexity, qLDPC/qLTC,
NLTS, gap-amplification, and Hamiltonian-PCP-obstruction clusters; games/MIP* literature enters
as `context` only. Triage is `in` (a result a proof might consume), `context` (orientation only,
L0 card, no L1 cards), or `out` (reason recorded). Source acquisition: arXiv first; paywalled
tail via TIB VPN with `playwright-cli`, payload gitignored, manifest row tracked, reacquisition
route recorded (C7; no pirate sources). Acceptance is a count statement in HANDOFF:
"closure depth 2 over |S| seeds: N papers, N_in/N_ctx/N_out, 0 untriaged".

## 4. Summary-card artifact contract (phase 0b)

Cards are the most dangerous artifact in the pipeline: an agent answering from a card trusts it.
Therefore cards are generated-and-provenanced, never free prose.

- Location: `refs/cards/<source-id>/L0.md` and `refs/cards/<source-id>/L1-<n>.md`.
- L0 fields: `source`, `sha256` (payload), `extraction_sha256`, `title`, `clusters`, `objects`
  (blessed definition ids), `results` (list of L1 ids), `regime` (the paper's standing
  assumptions in blessed notation), `relevance` (one line). Every claim line: anchor pair.
- L1 fields: `source`, `result_label` (the paper's own numbering), `statement_verbatim` (anchor
  pair, byte-verbatim), `statement_blessed` (restated in register notation), `hypotheses` (list,
  each a blessed definition id or a regime predicate), `conclusion`, `consumes`/`produces`
  (the same signature grammar as section 6, so phase 1 is a copy, not a re-derivation),
  `proof_sketch_locus` (anchor to where the proof starts), `notes`.
- Hash binding: each card carries `extraction_sha256`; a re-extraction stales every card of that
  source (reported by the refs gate as `stale-card`, ERROR in consolidation).
- Gate: extend Gate 3 (refs) with Check 10 "card anchors" — every `refs/<path>:<line>` +
  `"quote"` pair on a card is verified with the existing Check 8/9 shard-citation semantics
  (`grep -F` exact substring of the recorded raw line); a card with zero anchor pairs is an
  ERROR (the 19/19-skipped lesson). Red fixtures first: dropped-hypothesis card (anchor present
  but `hypotheses` omits a quoted assumption — caught by a second check that every hypothesis
  line also carries an anchor), zero-anchor card, stale-card.
- Writers: opus lanes produce cards from L2 extraction with `rk refs quote` for every anchor;
  a codex xhigh lane reviews each card against the source (hostile, "find the dropped
  hypothesis"); cards land only with a review record. Reviewer never equals author.

## 5. Notation register and gate (phase 0c)

- Shard type: `definitions/notation/<symbol-id>.md`, frontmatter `id`, `symbol` (the blessed
  LaTeX macro, e.g. `\gapfrac`), `meaning`, `kind: notation`, `translations` (block list of
  `source-id: <their symbol> @ refs/<path>:<line>` rows, each with a quote anchor), `status`.
  Gate 1's alias/DRIFT dedup namespace is extended to `symbol` and every translation symbol, so
  two register entries claiming the same source symbol is a build failure.
- Blessed-notation macro file `definitions/notation/macros.tex` is a GENERATED artifact (Gate 7)
  from the register; any document that wants the notation includes it.
- Gate 9 (new, "notation"): lexical check that L1 cards' `statement_blessed`, Layer 0/1 shard
  bodies, and conjecture shards use only register symbols for the tracked symbol classes
  (gap quantities, locality/degree parameters, code parameters, energy normalisations); an
  unregistered tracked symbol is an ERROR in consolidation. Tracked classes are listed in the
  register itself, so the gate's coverage line reads "checked N symbols over M files".
- Red fixtures: same-source symbol collision; unregistered gap symbol in a card; translation row
  without anchor. Tier A review (L6) before landing.
- qPCP-specific traps the register must settle on day one: promise gap as fraction of m vs of
  ||H|| vs energy density; k-locality vs interaction degree vs bounded-degree interaction graph;
  qudit dimension; code distance/rate/soundness conventions; NLTS as circuit-depth statement vs
  energy-density statement; QMA vs QMA_1 vs QCMA.

## 6. Contract signature: Layer 1 schema extension (phase 1-2)

`contract` stays the one-line statement (join key, unchanged). New optional block `signature`
on Layer 1 shards, REQUIRED (ERROR) in consolidation for `kind` in lemma/proposition/theorem/
corollary:

```
signature:
  consumes:                       # blessed definition ids with regime predicates
    - def-local-hamiltonian {k: const, qudit_dim: const, degree: bounded}
    - def-qldpc-code {rate: const, distance: linear}
  produces:
    - def-promise-gap {gap: const, normalisation: per-term}
  regime:                         # predicates that must hold for the statement
    - n -> infinity
  hardness_class: QMA-hard        # optional; enum from the register
```

Linker checks (Gate 2, new Check 12 "signature"): (a) every id in consumes/produces resolves to a
Layer 0 shard; (b) along every `deps`/`routes` edge, each consumed predicate of the parent is
satisfied by some produced predicate of a dependency or by the parent's own regime (constant gap
cannot be consumed from a 1/poly-gap producer without an amplification node between); (c)
predicate vocabulary is closed: keys and values come from `definitions/notation/predicates.md`
(part of the register). This is shallow typing, honestly named: it does not check proofs, it
checks that no result is applied outside its declared regime. Schema: new
`schemas/signature.v1.json`; compat event per rule 10; red fixtures: dangling id, regime
mismatch across an edge, unknown predicate key. Tier A review.

## 7. Roster and backend policy (recommendation, TJO-accepted 2026-08-20)

- Orchestrator: Fable, sole seat. Zero Fable workers, zero Fable subagents.
- Reviews (card review, Tier A rk reviews, hostile verification): codex `gpt-5.6-sol` xhigh.
- Heavy cognition (card authoring, signature extraction, conjecture generation, proving): opus
  `claude-opus-5`; codex `gpt-5.6-sol` as the second prover family.
- Mundane (queries, summarisation of logs, code plumbing, fixtures): sonnet `claude-sonnet-5`.
- Cross-vendor per claim (campaign-D decision 16 pattern): opus-proved takes a codex verifier and
  vice versa; banking never same-family.
- Quota outage rule, settled in advance: if one vendor's quota is empty, the other family runs the
  lane, every record states the substitution, and banking of that lane's output is deferred until
  the missing family returns. Never substitute inside banking. (Campaign-D decision 18, made
  standing.)
- `.rk/config.json` `workers`: prover l5/hard codex primary with claude fallback; verifier l5/hard
  claude opus primary with codex fallback; reviewer codex.

## 8. Bite criterion (phase 3 admission)

A conjecture is admitted only if, in addition to the A1 entry gates, its record declares at least
one of: (i) a strict decomposition — the north star or an admitted intermediate acquires a new
`routes` alternative whose members are each strictly weaker than the parent under the signature
ordering; (ii) a complexity reduction — a consumed predicate weakened or a produced predicate
strengthened relative to the best existing Layer 1 shard with the same produces set; (iii) a new
tool — a consumes id outside the current DAG's closure (imported from a `context` paper or
newly defined). A reformulation whose signature equals an existing shard's up to renaming is
rejected at admission (subsumption gate) and logged as such. Bite is checkable from signatures;
that is the reason section 6 exists.

## 8a. Pre-registered arm candidate: flow expanderisation (TJO note, 2026-08-20)

TJO's note `../codex-scratch/flow-expanderisation.tex` ("Flow Expanderisation for
Measurement-Based Quantum PCPs") is, to TJO's knowledge, not in the literature. Its thesis:
place the expander on the gauge redundancy of an MBQC execution (Pauli frames, alternative
causal schedules, subsystem/teleportation descriptions of one logical wire) rather than on
copies of the quantum witness, so that every computationally meaningful fault produces an
extensive set of local flow defects; a constant-soundness Clifford expander-flow compiler
(its Conjecture 1) would already be a structural theorem and, with the coherent-extraction
and predicate-energy statements, a quantum assignment-tester-like primitive composable with
iterable gap amplification (BMVZ25). Treatment in this campaign:

- Ingested in phase 0a as a source of `kind: original` (TJO-authored proposal; payload the
  .tex, hashed; its own status labels are honoured: definitions standard, cited ingredients
  known, compiler/extraction/cubical statements are CONJECTURES, never consumed as results).
- Its bibliography (16 items, incl. 2510.01333 and 2606.09588) joins the seed set S.
- Its four conjectures/problems become `conjecture` shards with signatures; its four
  falsification tests become the arm's pre-registered kill criteria; its Stage 1 (finite
  Pauli-flow experiments over the (M,N,C) matrix description) is the cheapest probe and runs
  as a `numerical` evidence bundle early in phase 3, before any Stage 2 proof attempt.
- The arm is a CANDIDATE, not yet selected: phase 4 selection still requires it to pass the
  bite criterion against the assembled DAG (it should, under clause (iii) new tool, but that
  is checked, not assumed). Other arms are generated by the phase 3 lanes with no priority
  given to this one beyond its pre-registration.

## 9. TJO touch classes (the light-touch contract)

Only these reach TJO; everything else runs behind gates under the standing
continue-authorization pattern (campaign-D decision 15):
1. Blessing a disputed definition or notation entry (two sources genuinely conflict).
2. Admissibility rulings on what counts as the target (statement variants of qPCP).
3. Roster changes beyond section 7's outage rule.
4. Arm portfolio selection at phase 4 and any later arm kill/add.
5. rk schema changes (rule 10) — by way of the Tier A review record, not in-conversation.

## 10. rk work items (filed as beads 2026-08-20)

- rk-side, Tier A: signature schema + linker Check 12 (section 6); notation register shard
  type + Gate 9 (section 5); refs Check 10 card anchors + stale-card (section 4).
- rk-side, Tier B: `rk refs snowball` (citation closure via Semantic Scholar/arXiv, writes the
  triage ledger skeleton) — or a campaign script if the API surface proves unstable.
- Campaign: bootstrap rk-campaign-E; seed list ratification; phase 0a execution.

Sequencing: campaign bootstrap and phase 0a need none of the rk changes; Check 10 must land
before any card is trusted (phase 0b); Gate 9 before phase 0c closes; signature schema before
phase 1 shards are written at scale (cards carry the grammar from day one so nothing is redone).

## 11. Decision rows (append-only)

| # | Decision | Ruling | Date |
|---|---|---|---|
| 1 | Target variant | Hamiltonian version; north star a complete rigorous proof; games/MIP* is context | 2026-08-20 |
| 2 | Ownership of signature schema + notation register | rk-owned, schema bump + fixtures + Tier A | 2026-08-20 |
| 3 | Roster | Section 7 as written | 2026-08-20 |
