<!-- ROLE: design record for the quantum-PCP campaign (rk-campaign-E) and the rk extensions it
     needs. AUTHORED. UPDATE POLICY: append-only decision rows in section 11; body revised by
     the single Tier A repair wave of 2026-08-20 (review record
     docs/reviews/2026-08-20-qpcp-plan-tierA-codex.md) and thereafter only by TJO ratification.
     TRIGGER: read before any work on rk-campaign-E, the signature schema, the notation
     register, the card records, or the convention profile. -->

# NOTES 2026-08-20 — Quantum PCP campaign plan (rk-campaign-E)

Status: TJO-directed 2026-08-20 (in-conversation). Three decisions taken that session:
(1) target is the HAMILTONIAN version of the quantum PCP conjecture, north star a complete
mathematically rigorous proof; (2) the signature schema extension and the notation register are
rk-owned (schema bump + fixtures + Tier A review), not campaign-local; (3) roster per
orchestrator recommendation (section 7). Standing directive the same day: orchestrate the work,
zero Fable subagents, codex `gpt-5.6-sol` at xhigh for reviews and hard lanes, claude opus for
cognition-heavy lanes, claude sonnet for mundane queries.

Review history: v1 of this memo was REJECTED by the codex xhigh Tier A review (nine landing
findings, four follow-ups). This is v2, the single repair wave. Every v1 finding is addressed
in the section it names; the verification table is in the review record.

Design input: PRD D1-D9 + Amendment A1, `docs/gate-contracts.md` (Gates 1-3 and 7 are the
extension points; phase matrix at its section "Phase matrix"), campaign-D's constitution and
decision record (roster decisions 16/18, the codex-quota outage of 2026-08-19), the 2026-08-20
survey of the shard/refs/init schemas, and the review above.

## 1. Thesis and the one governing constraint

A frontier orchestrator can run a very large proof exploration with a light human touch IF the
ground truth the agents read is mechanically anchored to sources and the human's interventions
are enumerated in advance. Every design choice below exists to make one failure class
impossible: a plausible claim about the literature (a dropped hypothesis, a mistranslated
symbol, a result applied outside its regime) entering the DAG and being built on. Three
false-green paths were identified in review and are closed by construction below: omitted or
mistranslated content reaching a cited node (section 4), regime mismatch passing the signature
check (section 6), and metadata inflation satisfying bite (section 8).

## 2. Phases and acceptance bars

| Phase | Deliverable | Acceptance (mechanical, no "looked hard") |
|---|---|---|
| 0a corpus closure | Seed set S; forward+backward citation snowball to depth 2; every paper in the closure triaged `in \| out \| context` with a one-line reason in `refs/triage.md`; the dependency-closure exception of section 3 applied | `rk refs status` all `in` rows present+hashed; 0 untriaged rows; closure depth and counts stated |
| 0b extraction + card records | Per `in` paper: one L0 record, one L1 record per result, each an AUTHORED, hash-bound extraction record (section 4) with an independent VALID review record; the human-readable cards are GENERATED from the records by Gate 7 | Refs gate Check 10 green; every L1 record carries a complete-statement anchor range and a review record whose `card_sha256` matches; 0 records without review |
| 0c notation register + convention profile | `.rk/conventions/qpcp.v1.json` (the profile, section 5) committed; one notation shard per blessed symbol with per-source translation rows | Gate 9 green against the profile's tracked classes; 0 unregistered tracked symbols in L1 records |
| 1 blessed definitions + typed results | Layer 0 shards (`kind: cited`, `source`+`sha256` required) for every object the L1 records use; Layer 1 shards for every `in` result with `contract` AND a signature (section 6); `status: cited` only via the card->shard hash join of section 4 | defs gate + linker green; every L1 record has exactly one Layer 1 shard; 0 shards with empty signature |
| 2 DAG + checking | Linker with the entailment check (section 6) on every pre-commit; `rk render` site; critical path to `thm-north-star` | `rk check` green; regime-mismatch fixture red; unresolved-reference bucket empty or every entry triaged |
| 3 ideation | Conjecture lanes (opus + codex) generating candidates; admission ONLY through the A1 Gates C/D (implemented, N2) plus bite (section 8), run as a phase-independent admission transaction (section 2a) | Every admitted conjecture has a signature, a Brier-scored hardness prediction, a bite record, and a declared decomposition it advances |
| 4 portfolio | Arms on `fr board`; goal-graph frontier; wildcard arm floored | Pre-registered arm set committed; allocation per A1 |

Gate phase: the campaign runs in `consolidation` (rk's default when unset; `rk init` stamps
`exploration` and the campaign flipped it on day one with `rk phase consolidation`, which
logged the transition to worklog and fr). The flip to `exploration` at phase 3 is recorded as
a PRD decision row in the campaign plus a worklog entry written by the orchestrator in the same
commit — `rk phase` does not log exploration-ward transitions, so the campaign record does.

### 2a. Admission is phase-independent

The phase matrix demotes non-structural ERRORs to WARN in exploration. The checks introduced by
this plan — Check 10 (card records), Gate 9 (notation), the signature entailment check, and the
bite check — are classified STRUCTURAL in the phase matrix: they are never demoted. Admission of
a conjecture or a cited result is a transaction over one candidate: its card records, review
records, notation, signature, and source closure must all be ERROR-free at admission regardless
of phase; ordinary exploratory files stay advisory. Phase 3 has a hard prerequisite: Gates C/D
(A1, N2, beads rk-ptx0/rk-lmtr) implemented and green on the S0 smoke slice. Until then phase 3
does not open.

## 3. Corpus stopping criterion (phase 0a)

"Complete" is defined, not felt: S is the ratified seed list (v0 produced 2026-08-20 by an opus
lane, 153 rows, every id verified against arXiv/Crossref); closure C = S plus all papers cited
by or citing a member of S, iterated to depth 2, restricted to year >= 1999 and to the
Hamiltonian-complexity, qLDPC/qLTC, NLTS, gap-amplification, Hamiltonian-PCP-obstruction, and
MBQC-flow/circuit-to-Hamiltonian clusters; games/MIP* literature enters as `context` only.
Dependency-closure exception: every source cited as a prerequisite by an `in` result's proof
is acquired and triaged `in` or `context` regardless of year or cluster — the filter bounds
discovery, never the prerequisites of an admitted result. Triage is `in` (a result a proof
might consume), `context` (orientation only, L0 record, no L1 records), or `out` (reason
recorded). Acquisition: arXiv first; paywalled tail via TIB VPN with `playwright-cli`, payload
gitignored, manifest row tracked, reacquisition route recorded (C7; no pirate sources).
Acceptance is a count statement in HANDOFF: "closure depth 2 over |S| seeds: N papers,
N_in/N_ctx/N_out, 0 untriaged; dependency exceptions: E".

## 4. Extraction records, review records, and generated cards (phase 0b)

Cards are the most dangerous artifact in the pipeline: an agent answering from a card trusts
it. v1 made them "generated" while model lanes wrote them and anchored only the hypotheses that
were present; review showed that cannot detect an OMITTED hypothesis or a mistranslated
statement. v2 separates authored records from generated views and binds a review to the bytes.

- **Extraction record** (AUTHORED by an opus lane): `refs/records/<source-id>/L1-<n>.json`,
  schema `schemas/extraction-record.v1.json` (`schema_version: "1"`). Fields: `source`,
  `payload_sha256`, `extraction_sha256`, `result_label`, `statement_range` (the anchor RANGE
  `refs/<path>:<from>-<to>` covering the COMPLETE statement as printed, including its
  hypotheses clause and any "where"/"assume" sentences), `statement_verbatim` (the bytes of
  that range), `statement_blessed` (restated in register notation), `hypotheses` (list, each
  `{text, anchor}`), `conclusion`, `signature` (section 6 grammar), `profile: qpcp.v1`,
  `proof_locus`. L0 records are the per-paper analogue (`L0.json`: `regime`, `objects`,
  `results`).
- **Completeness rule, mechanical**: the refs gate verifies (a) every anchor and the full
  `statement_range` bytes against the recorded source lines (Check 8/9 semantics, exact); (b)
  `statement_verbatim` equals the range bytes; (c) every hypothesis anchor lies INSIDE
  `statement_range` or inside a declared `standing_assumptions_range` of the L0 record. An
  omitted hypothesis is then a translation error visible to the reviewer, who reads the full
  range, not a silent gap; a hypothesis anchored outside the statement is an ERROR.
- **Review record** (AUTHORED by a codex xhigh lane, reviewer != author): `refs/records/
  <source-id>/L1-<n>.review.json`, schema `schemas/card-review.v1.json`: `card_sha256` (sha256
  of the canonical extraction-record bytes), `verdict: VALID | INVALID`, `reviewer` (family/
  backend/model/session), `checked: {statement_complete, hypotheses_complete,
  translation_faithful, signature_faithful}` each `true|false` with a one-line note, `findings`.
  A record with no review, a review with `card_sha256` mismatch (the record was edited after
  review), or a non-VALID review is an ERROR.
- **Card -> shard hash join**: a Layer 1 shard may carry `status: cited` only if its
  frontmatter names `record: refs/records/<source-id>/L1-<n>.json` and `record_sha256`
  matching the record's canonical bytes, and that record has a VALID review. `proved-mod-audit`
  on a literature result requires the same join (it is a literature claim, not a campaign
  proof). A `cited` shard with a single relevant-looking quote and an arbitrary contract is
  rejected because the contract byte-matches `statement_blessed` of the joined record (Check 9
  contract-match semantics extended to the record).
- **Generated cards**: `refs/cards/<source-id>/L1-<n>.md` are rendered deterministically from
  the record + review by `rk render cards`, declared in `.rk/generated.json`, and byte-diffed
  by Gate 7. Hand-editing a card is a freshness failure. Agents read the cards; the truth is the
  records.
- Red fixtures (Tier A, L2): omitted-hypothesis (statement_range covers a hypothesis the record
  omits — caught by the review-record requirement plus a deliberately short `statement_range`
  that does not cover the printed statement's "where" clause, which a range-extent check
  against the extraction's sentence boundary flags), irrelevant-quote shard (contract does not
  match the record's `statement_blessed`), zero-anchor record, stale record (`card_sha256`
  mismatch), stale extraction (`extraction_sha256` mismatch), review-absent.

## 5. Notation register, convention profile, and Gate 9 (phase 0c)

- **Convention profile** (the thing the gate checks AGAINST, kept outside the artifact being
  checked): `.rk/conventions/qpcp.v1.json`, schema `schemas/convention-profile.v1.json`,
  versioned, committed, referenced by every record and signature as `profile: qpcp.v1`.
  It fixes: promise gap as RELATIVE (fraction of m) vs absolute vs energy density, and which
  the campaign uses as canonical (relative, with translations recorded per source); promise vs
  spectral gap; threshold quantification and precision (inputs A<B given as rationals of
  poly(n) bits); term convention (0 <= H_i <= I PSD-bounded; projector-term and norm-bounded
  variants as declared translations; shifts and term-splitting/zero-padding recorded as
  normalisation moves, never silent); k-locality vs interaction degree vs bounded-degree
  interaction graph; qudit dimension d fixed vs growing; frustration-free / perfect
  completeness variants (QMA vs QMA_1 vs QCMA); reduction class (polynomial-time Karp by
  default; Turing/randomised declared); code parameters (rate, distance, soundness —
  normalised how); NLTS stated correctly as: a family of bounded-degree local Hamiltonians
  with a constant energy-density window below which every state requires circuit depth
  Omega(log n) as proved by Anshu-Breuckmann-Nirkhe (circuit model, ancilla allowance, and
  approximation error all named; the profile records the exact bound, not a paraphrase), as
  opposed to NLSS/combinatorial NLTS variants, each a separate profile entry. The profile
  lists the TRACKED SYMBOL CLASSES Gate 9 enforces; a class can be removed only by a profile
  version bump, which is a compat event with a fixture, so coverage cannot silently shrink.
- **Notation shards**: `definitions/notation/<symbol-id>.md`. Frontmatter: `id`,
  `shard_type: notation` (ORTHOGONAL to `kind`; `kind` keeps its provenance meaning
  `cited|consensus|original`), `symbol` (blessed LaTeX macro), `meaning` (with `source`+
  `sha256`+anchor when `kind: cited` — the MEANING is what is provenanced, not merely the
  symbol's occurrence), `class` (from the profile), `translations` (block list of
  `source-id: <their symbol> @ refs/<path>:<line>` rows, each with a quote anchor),
  `status`. Discovery: Gate 1 and the snapshot loader read `definitions/` RECURSIVELY
  (today they do not — this is part of the work item, with a fixture that a nested shard is
  seen). Gate 1's alias/DRIFT namespace extends to `symbol` and to every translation symbol
  scoped by source: two register entries claiming the same source symbol is a build failure.
- `definitions/notation/macros.tex` is GENERATED (Gate 7) from the register.
- **Gate 9** (new): lexical check that L1 records' `statement_blessed`, Layer 0/1 shard
  bodies, and conjecture shards use only register symbols for the profile's tracked classes; an
  unregistered tracked symbol is an ERROR; structural (never demoted). Coverage line:
  "checked N symbols in C classes over M files".
- Red fixtures: same-source symbol collision; unregistered gap symbol in a record; translation
  row without anchor; nested shard invisible (discovery); profile class removed without bump.
  Tier A review (L6) before landing.

## 6. Signature and entailment: Layer 1 schema extension (phase 1-2)

`contract` stays the one-line statement (join key, unchanged). New block `signature` on Layer 1
shards, REQUIRED (ERROR, structural) for `kind` in lemma/proposition/theorem/corollary once the
campaign adopts it (`.rk/config.json` `signatures: required`), encoded as a fenced JSON object
(canonical: sorted keys, no floats, `schema_version: "1"`), schema `schemas/signature.v1.json`.
A malformed or unparseable signature is an ERROR, never "no signature". The graph schema gains a
`signature` field and bumps its `schema_version` (2 -> 3) with a legacy fixture.

```
signature:
  schema_version: "1"
  profile: qpcp.v1
  pre:                               # what the result REQUIRES of its context
    - {obj: def-local-hamiltonian, k: const, d: const, degree: bounded}
    - {obj: def-promise-gap, gap: inv-poly, norm: relative}
  post:                              # what the result PROVIDES
    - {obj: def-promise-gap, gap: const, norm: relative}
  regime:                            # predicates on the ambient parameters
    - {n: to-infinity}
  hardness: QMA-hard                 # optional, enum from the profile
```

Each predicate key has a typed LATTICE (chain or poset) declared in the profile, and values
are intervals over it, so "atom satisfies atom" is interval containment, not string equality.
(The profile draft's intermediate polarity scheme was rejected in its review for admitting an
inconsistent `qdim: poly` with `qdim_cap: const`; intervals replace it.)

**Entailment rule (replaces v1's atom-wise matching, which review broke with a concrete pair;
route semantics made order-independent after the profile review's finding 13).** Parameter
values are INTERVALS over a chain (a point is `[x, x]`); a context interval entails a
requirement interval iff it is contained in it, which subsumes the afforded/capped polarity of
the draft (`qdim: [const, const]` does not entail a dependency regime `qdim: [poly, poly]`).
Lattices are chains or posets (`reduction` is a poset: karp <= turing, karp <= quasi-poly-karp,
turing and quasi-poly incomparable; incomparable is never entailed). For a shard P and route R
the evaluation is a FIXED POINT: context := P.regime ∪ P.pre; repeatedly mark any not-yet-
available member D whose entire `pre` ∪ `regime` is entailed by the context and add D's `post`
to the context, until nothing changes. A member never marked available is `regime-unentailed`.
Listing order cannot affect the verdict (property-tested); mutual dependency cannot bootstrap
because availability is granted only from the already-available context. Entailment is
per-object: every key of D's predicate on object X must be met by the context's predicate on X. The review's pair — `lem-amp` with
`regime: d=poly(n)` producing `gap=const`; `thm-qpcp` with `regime: d=const` consuming
`gap=const, d=const` — is rejected because `lem-amp`'s regime `d=poly(n)` is not entailed by
`thm-qpcp`'s context `d=const` (const is below poly in the lattice, so a result that needs
poly-dimensional qudits is unavailable in the constant-dimension context), regardless of the
gap atom. That pair is the first red fixture.

Linker checks (Gate 2, Check 17 — 12 is already brittleness): (a) every object id in pre/post
resolves to a Layer 0 shard; (b) entailment on every route; (c) closed vocabulary: keys, values
and lattices from the profile; (d) canonical encoding. Honest scope: this is shallow typing. It
does not check proofs; it checks that no result is applied outside its declared regime and that
the regime bookkeeping is closed under the DAG. Tier A review.

## 7. Roster and backend policy (TJO-accepted 2026-08-20)

- Orchestrator: Fable, sole seat. Zero Fable workers, zero Fable subagents.
- Reviews (record review, Tier A rk reviews, hostile verification): codex `gpt-5.6-sol` xhigh.
- Heavy cognition (extraction records, signatures, conjecture generation, proving): opus
  `claude-opus-5`; codex `gpt-5.6-sol` as the second prover family.
- Mundane (queries, log summaries, plumbing, fixtures): sonnet `claude-sonnet-5`.
- Cross-vendor per claim (campaign-D decision 16 pattern); banking never same-family.
- Quota outage rule, settled in advance: the other family runs the lane, every record states the
  substitution, banking of that lane's output is deferred until the missing family returns.
  Never substitute inside banking. (Campaign-D decision 18, made standing.)
- `.rk/config.json` `workers`: prover codex primary / claude fallback; verifier claude opus
  primary / codex fallback; reviewer codex.

## 8. Bite criterion (phase 3 admission) — mechanical part and judged part

Bite is a Gate C admission check (A1, N2) with a mechanical core and a recorded judgement;
neither alone admits.

Mechanical (pure, over the snapshot):
1. **Canonical identity.** A candidate's signature is canonicalised (objects by Layer 0 id,
   predicates sorted, lattice values normalised). Two signatures equal after canonicalisation
   are the SAME claim; a candidate whose canonical signature equals an existing admitted
   shard's is rejected (subsumption) — renaming cannot evade this because ids, not names, are
   compared.
2. **Partial order.** Signature s1 <= s2 (s1 is at least as strong) iff s1.pre is entailed by
   s2.pre (needs no more), s1.post entails s2.post (gives no less), and s1.regime is entailed
   by s2.regime. Defined via the section-6 lattices; decidable.
3. **Spectator exclusion.** Every `pre` object must occur in `statement_blessed` or in the
   candidate's declared decomposition; a `pre` object occurring nowhere is an ERROR ("spectator
   consume"). Every `post` object must be new relative to the context or strictly stronger
   under (2). Redundant predicates (implied by others via the lattice) are stripped before
   comparison, so inflation by redundant atoms changes nothing.
4. **Advance clause.** At least one of: (i) decomposition — the candidate is declared as a new
   route member of an admitted target T and s_candidate < s_T strictly under (2); (ii)
   strengthening — s_candidate < s_existing for some admitted shard with the same post objects;
   (iii) new tool — a non-spectator `pre` object outside the DAG's current closure.

Judged (recorded, hash-bound to the candidate bytes, reviewer != author): a codex xhigh
hostile review record answering "is the advance real or a reformulation?" with `VALID|INVALID`.
Admission requires mechanical pass AND a VALID judgement. Red fixtures: alias renaming (same
canonical signature, different names); spectator consume; redundant-predicate inflation;
signature-only inflation (stronger post with no decomposition or review); reformulation with
INVALID review.

## 8a. Pre-registered arm candidate: flow expanderisation (TJO note, 2026-08-20)

TJO's note `../codex-scratch/flow-expanderisation.tex` ("Flow Expanderisation for
Measurement-Based Quantum PCPs") is, to TJO's knowledge, not in the literature. Its thesis:
place the expander on the gauge redundancy of an MBQC execution (Pauli frames, alternative
causal schedules, subsystem/teleportation descriptions of one logical wire) rather than on
copies of the quantum witness, so that every computationally meaningful fault produces an
extensive set of local flow defects; a constant-soundness Clifford expander-flow compiler (its
Conjecture 1) would already be a structural theorem and, with the coherent-extraction and
predicate-energy statements, a quantum assignment-tester-like primitive composable with
iterable gap amplification (BMVZ25). Treatment:

- Ingested (done, source `tjo-flow-expanderisation-2026`, `kind: original`). **Scope of what
  the note may source**: ONLY TJO-original content — its definitions of flow soundness, flow
  distance, the expander-flow reduction goals (E1)-(E6), its conjectures and problems, its
  falsification tests. Every "known"/"standard" ingredient the note cites (gflow, the algebraic
  Pauli-flow characterisation, BFHS17 gadgets, weight reduction, DLV24, ABN24, BMVZ25, ...)
  must join to its ACQUIRED primary paper's extraction record to receive `cited` status; the
  note's hash never backs a literature fact. Enforced by the card->shard join (section 4): a
  shard citing the note whose `statement_blessed` is a literature theorem fails the reviewer's
  `translation_faithful` check by instruction, and the note's L0 record lists `results` as
  conjectures only.
- Its bibliography (16 items) is in the seed set (8 were already present; 8 added).
- Its conjectures/problems become `conjecture` shards with signatures; its four falsification
  tests become the arm's pre-registered kill criteria; its Stage 1 (finite Pauli-flow
  experiments over the (M,N,C) description) is the cheapest probe and runs as a `numerical`
  evidence bundle early in phase 3, before any Stage 2 proof attempt.
- CANDIDATE, not selected: phase 4 selection requires passing bite (section 8) against the
  assembled DAG. Other arms come from the phase 3 lanes; no priority beyond pre-registration.

## 9. TJO touch classes (the light-touch contract)

Only these reach TJO; everything else runs behind gates under the standing
continue-authorization pattern (campaign-D decision 15):
1. Blessing a disputed definition, notation entry, or profile choice (two sources conflict).
2. Admissibility rulings on what counts as the target (statement variants of qPCP).
3. Roster changes beyond section 7's outage rule.
4. Arm portfolio selection at phase 4 and any later arm kill/add.
5. rk schema changes (rule 10) — by way of the Tier A review record, not in-conversation.

## 10. rk work items and module boundaries

Beads (filed 2026-08-20; descriptions point here):
- rk-nsex (Tier A): extraction-record + review-record schemas, refs Check 10 (anchors, range
  completeness, review binding), card->shard hash join, `rk render cards` (Gate 7 adoption).
- rk-5lzf (Tier A): convention-profile schema, notation shards (`shard_type`), recursive
  definitions discovery, Gate 9, generated macros.
- rk-8805 (Tier A): signature schema, lattices, entailment Check 17, graph schema 2->3, bite
  mechanical core as a pure module consumed by Gate C (N2).
- rk-hzla (Tier B): `rk refs snowball` (in progress).
- Phase-matrix amendment: the four new checks classified structural (docs/gate-contracts.md
  phase table) — lands with the first of the three Tier A items.

Module boundaries (L3, recorded before implementation): signature canonicalisation, lattice
entailment, bite core, notation check, and record verification are PURE over `RepoSnapshot`
(`src/gates/`, `src/graph/`); snowballing, payload hashing, model-lane dispatch, and card
rendering to disk sit at `src/refs/`, `src/drive/`, `src/render/` edges. The purity grep in
selftest covers the new pure shards.

Sequencing: phase 0a needs none of the rk changes; Check 10 and the record schemas must land
before any record is trusted (phase 0b authoring may start against the schema draft, with
records re-validated when the gate lands); the profile and Gate 9 before phase 0c closes; the
signature schema before phase 1 shards are written at scale; Gates C/D before phase 3 opens.

## 11. Decision rows (append-only)

| # | Decision | Ruling | Date |
|---|---|---|---|
| 1 | Target variant | Hamiltonian version; north star a complete rigorous proof; games/MIP* is context | 2026-08-20 |
| 2 | Ownership of signature schema + notation register | rk-owned, schema bump + fixtures + Tier A | 2026-08-20 |
| 3 | Roster | Section 7 as written | 2026-08-20 |
| 4 | v1 review disposition | REJECT by codex xhigh; single repair wave produced v2 (this text); no re-review per the anti-Zeno rule; residuals are beads examined at the next milestone review | 2026-08-20 |
| 5 | North-star statement | Repaired to a closed promise problem (campaign PRD section 2 and `argument/thm-north-star.md`); partial-credit policy moved out of the contract into the PRD | 2026-08-20 |
