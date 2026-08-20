<!-- ROLE: Tier A review record — codex gpt-5.6-sol xhigh hostile review of
     docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md v1, plus the orchestrator's
     mechanical verification of the single repair wave (v2). AUTHORED, append-only.
     TRIGGER: read before the next milestone review of the qPCP plan or its Tier A beads. -->

# Tier A review: qPCP campaign plan v1 (codex gpt-5.6-sol, xhigh, 2026-08-20)

Invocation: `codex exec -s read-only -c model_reasoning_effort="xhigh" -o <file> "<prompt>" < /dev/null`,
tracked task, exit 0. Verdict on v1: **REJECT**. Per CLAUDE.md section 3 (one review round + one
repair wave, no re-review), v2 of the memo is the repair wave; the table below is the
orchestrator's verification of each finding against v2, by section.

## Verification of the repair wave (v2)

| # | Finding (v1) | Repair in v2 | Verified by |
|---|---|---|---|
| LB1 | Card gate cannot detect omitted/mistranslated hypotheses | Section 4: authored extraction records with a COMPLETE `statement_range`, hypotheses anchored inside the range, hash-bound independent review record (`card_sha256`), card->shard hash join, contract byte-match to `statement_blessed`; cards generated | Reading v2 section 4; fixtures enumerated (omitted-hypothesis, irrelevant-quote, stale, review-absent) carried into rk-nsex |
| LB2 | Signature check unsound (atom-wise) | Section 6: route-scoped ENTAILMENT — dependency's entire pre+regime entailed by the parent's context before its post is available; typed lattices; the review's exact pair is the first red fixture | v2 section 6 text; fixture named in rk-8805 |
| LB3 | Bite prose-only and gameable | Section 8: mechanical core (canonical ids, defined partial order, spectator exclusion, redundancy stripping) + hash-bound hostile judgement; five fixtures | v2 section 8; rk-8805 carries the bite core as a pure module for Gate C |
| LB4 | Validity barrier advisory at admission | Section 2a: new checks classified structural; phase-independent admission transaction; Gates C/D (N2) a hard prerequisite for phase 3 | v2 section 2a; phase-matrix amendment listed in section 10 |
| LB5 | Notation shards outside namespace; `kind` overloaded; register self-declares tracked classes | Section 5: `shard_type: notation` orthogonal to `kind`; recursive discovery with fixture; meaning-level provenance; tracked classes live in the versioned convention profile outside the register | v2 section 5; rk-5lzf |
| LB6 | D2 / rule 10 violations (cards "generated" but authored; signature unversioned; graph schema closed) | Sections 4 and 6: records AUTHORED + hash-bound, cards GENERATED via Gate 7; signature canonical JSON with `schema_version`; graph schema 2->3 with legacy fixture; malformed signature is an ERROR | v2 sections 4, 6 |
| LB7 | Section 8a launders literature claims through the `original` note | Section 8a: note may source only TJO-original content; every known ingredient joins to its primary paper's record; enforced via the card->shard join and reviewer instruction | v2 section 8a |
| LB8 | Trap list incomplete; NLTS entry misleading | Section 5: versioned convention profile `qpcp.v1` fixing every listed choice; NLTS restated correctly | v2 section 5 |
| LB9 | North star not a closed promise problem | Campaign PRD section 2 and `argument/thm-north-star.md` restated with fixed k, d, c; polynomially described 0 <= H_i <= I; rational thresholds A < B, B - A >= c m; Karp reductions; partial credit moved to the PRD | Campaign commit (same sitting) |
| FU1 | Check-number collision (12) | Check 17 | v2 section 6 |
| FU2 | Phase description wrong | Section 2 last paragraph corrected; exploration flip recorded by the campaign | v2 section 2 |
| FU3 | Closure can exclude a prerequisite | Section 3 dependency-closure exception | v2 section 3 |
| FU4 | L3 boundary explicit | Section 10 module boundaries | v2 section 10 |

Residuals for the next milestone review (not re-reviewed now): whether the range-extent check
in section 4 is sufficient against a deliberately truncated `statement_range`; whether the
spectator rule's "occurs in statement_blessed" is too weak (lexical occurrence). Both are
recorded on rk-nsex / rk-8805.

## Review text (verbatim)

## Landing-blockers

1. **BLOCKER — The card gate cannot detect omitted or mistranslated hypotheses.** [campaign plan:65](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:65), [campaign plan:72](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:72), [Gate 3:1379](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:1379). Requiring an anchor on every *present* hypothesis cannot detect an omitted hypothesis; nor does exact quote occurrence establish that `statement_blessed`, `conclusion`, or the signature faithfully translates it. A `status: cited` shard can carry one genuine but irrelevant quote and an arbitrary contract; `proved-mod-audit` needs no citation pair at all.

   Repair — Introduce schema-validated, hash-bound card and review records mapping every translated field to the complete source statement, and require a fresh independent `VALID` review plus an exact card→shard hash join before cited/PMA admission; seed omitted-assumption and irrelevant-quote red fixtures.

2. **BLOCKER — The signature/regime check is unsound.** [campaign plan:121](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:121). Concrete passing mismatch: `lem-amp` has `regime: qudit_dim=poly(n)` and produces `gap=const`; `thm-qpcp` depends on it, has `regime: qudit_dim=const`, and consumes `gap=const, qudit_dim=const`. The gap atom comes from the dependency and the dimension atom from the parent’s regime, so the specified check passes although the dependency is unavailable in the parent’s regime.

   Repair — Use route-scoped constraint entailment: the parent context must entail every dependency precondition before that dependency’s complete postcondition becomes available, with typed lattices and a red fixture for this exact pair.

3. **MAJOR — The bite criterion is both prose-only and trivially gameable.** [campaign plan:147](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:147), [campaign plan:194](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:194). No gate, corpus, or work item implements bite. Clause (iii) passes after adding a fresh but irrelevant `def-spectator-register`; clauses (i)/(ii) rely on an undefined “signature ordering”; and nothing binds signature atoms to the contract. “Equal up to renaming” is not mechanically decidable under Gate 1’s lexical dedup.

   Repair — Make bite part of Gate C with canonical semantic IDs, a defined partial order, hash-bound verified implication/necessity evidence, and red fixtures for alias renaming, spectator consumes, redundant predicates, and signature-only inflation.

4. **MAJOR — The validity barrier becomes advisory exactly when admission begins.** [campaign plan:36](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:36), [campaign plan:40](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:40), [phase matrix:321](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:321). In exploration, cited-definition provenance, linker validity, and refs checks are demoted; Gate 9 and the new signature/card checks have no phase classification. The referenced A1 Gates C/D remain planned work, not an implemented prerequisite. Thus an admitted phase-3 conjecture can pass pre-commit with stale cards or bad signatures as warnings.

   Repair — Make completed N2 Gates C/D a hard phase-3 prerequisite and implement a phase-independent admission transaction that blocks on the candidate’s card, notation, signature, attachment, and source closure while leaving ordinary exploratory files advisory.

5. **MAJOR — Notation shards are outside the current definition namespace and erase provenance kind.** [campaign plan:84](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:84), [Gate 1:419](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:419), [snapshot loader:125](/home/tobiasosborne/Projects/rk/src/store/snapshot-load.ts:125). `definitions/notation/*.md` is invisible to the non-recursive Gate 1/linker readers. Moreover, `kind: notation` replaces the existing provenance enum `cited|consensus|original`, so an anchored source-symbol occurrence need not anchor the shard’s claimed `meaning`. Letting the register itself declare tracked classes also lets deletion of a class shrink coverage.

   Repair — Make discovery recursively complete, use orthogonal `shard_type: notation` and `kind: cited|consensus|original`, require meaning-level source/review evidence, and put the mandatory qPCP tracked-class profile outside the artifact being checked.

6. **MAJOR — The artifact and compatibility design violates D2/rule 10 as specified.** [campaign plan:58](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:58), [campaign plan:105](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:105), [PRD D2:21](/home/tobiasosborne/Projects/rk/docs/design/PRD.md:21), [CLAUDE.md:73](/home/tobiasosborne/Projects/rk/CLAUDE.md:73), [graph schema:97](/home/tobiasosborne/Projects/rk/schemas/graph.v1.json:97). Cards are called generated but are directly written by model lanes, and only the extraction—not the card/review bytes—is hash-bound. The nested YAML signature has no canonical parse/version field, while the closed graph schema has no signature field.

   Repair — Store versioned authored extraction/review records, deterministically render cards/macros through Gate 7, specify a fail-closed canonical signature encoding with `schema_version`, and bump every affected schema/graph version with legacy and malformed-input fixtures.

7. **MAJOR — Section 8a can launder literature claims through an “original” source.** [campaign plan:161](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:161), [campaign plan:171](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:171), [flow note:106](/home/tobiasosborne/Projects/codex-scratch/flow-expanderisation.tex:106). The TJO note correctly labels its proposals, but also asserts numerous “known” literature facts. Treating the whole payload as `original` permits those facts to inherit the note’s hash instead of the cited papers’ evidence.

   Repair — Permit the note to source only TJO-original definitions/conjectures; every “known/standard” ingredient must join to its acquired primary paper and cannot receive cited status through the note.

8. **MAJOR — The qPCP trap list is mathematically incomplete, and its NLTS entry is misleading.** [campaign plan:98](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:98). NLTS is not circuit depth *versus* energy density: it combines a fixed low-energy-density window with circuit non-triviality. Missing traps include promise versus spectral gap, quantification/precision of thresholds, weighted terms and zero-padding/term-splitting, PSD-effects versus norm-bounded/projector terms and shifts, frustration-free/perfect completeness, reduction type, fixed versus growing locality/dimension, and the circuit model/ancillas/approximation used by NLTS.

   Repair — Replace the list with a versioned qPCP convention profile fixing all these choices and require every relevant card/signature to name the profile.

9. **MAJOR — The north star is not yet the same closed promise problem as the standard Hamiltonian qPCP statement.** [north star:4](/home/tobiasosborne/Projects/rk-campaign-E/argument/thm-north-star.md:4), [flow note:78](/home/tobiasosborne/Projects/codex-scratch/flow-expanderisation.tex:78). The flow note uses dimensionless thresholds \(a\) and \(a+\gamma\), multiplied by \(m\); the north star reuses \(a,b\) as absolute energies but never quantifies or declares them as inputs. It also omits efficient term/threshold encoding, \(m=\mathrm{poly}(n)\), fixed \(d\), and the reduction type. The term convention and constant-dimensional qudits are otherwise standard if \(0\le H_i\le1\) means \(0\preceq H_i\preceq I\). Standard references explicitly distinguish absolute and relative gaps and specify the input representation and reduction model. [Aharonov–Arad–Vidick](https://arxiv.org/pdf/1309.7495), [Grilo–Kerenidis–Pereszlényi](https://arxiv.org/pdf/1603.00903).

   Repair — State fixed \(k,d,c\); polynomially described \(0\preceq H_i\preceq I\); input thresholds \(A<B\) with \(B-A\ge cm\) (or fixed normalized \(\alpha<\beta\)); the chosen reduction class; and move the “partial credit” policy out of the mathematical contract.

## Follow-ups

1. **Check-number collision.** [campaign plan:121](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:121), [Gate 2:715](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:715). Gate 2 already has Check 12, brittleness.

   Repair — Number signature as Check 17 and update the phase table, corpus ledger, and tests consistently.

2. **Phase description disagrees with current behavior.** [campaign plan:40](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:40), [phase contract:305](/home/tobiasosborne/Projects/rk/docs/gate-contracts.md:305). Consolidation is already `rk init`’s default, and consolidation→exploration is not worklog-logged by `rk phase`.

   Repair — Remove “inverts the default” and specify the committed campaign record that logs the exploration transition, or deliberately amend the phase contract.

3. **Literature closure can exclude a consumed prerequisite.** [campaign plan:46](/home/tobiasosborne/Projects/rk/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:46). The year/cluster filter needs an override when an in-scope theorem depends on an older or differently classified source.

   Repair — Add a dependency-closure exception: every cited prerequisite of an `in` result is acquired and triaged regardless of year/cluster.

4. **No intrinsic L3 conflict, but the boundary should be explicit.** [CLAUDE.md:33](/home/tobiasosborne/Projects/rk/CLAUDE.md:33). Signature, notation, and card validation can remain pure over `RepoSnapshot`; snowballing, hashing, model review, and source acquisition belong at `refs`/`drive`/`store` edges.

   Repair — Record that module split in the work items and purity selftest before implementation.

**Verdict: REJECT.** The design currently has three direct false-green paths: omitted or mistranslated literature content can become a cited DAG node, incompatible regimes can pass atom-wise signature matching, and arbitrary metadata inflation can satisfy bite. Those failures are then softened during the phase in which admission occurs. No settled D1/D3–D9 decision or inherent L3 boundary is violated, but D2, the fixed phase matrix, and rule 10 are unresolved. The intended north star is recognizable as Hamiltonian qPCP, yet it is not a fully specified promise problem until the threshold normalization and quantifiers are repaired.