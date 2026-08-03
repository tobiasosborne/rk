<!-- ROLE: raw postmortem evidence (Opus subagent report, banked verbatim).
     UPDATE-POLICY: frozen historical record; never edit.
     TRIGGER: consulted from docs/memos/2026-08-03-aism-bitter-lesson-snapshot.md -->

# AISM postmortem — proof-artifact data model agent report (banked verbatim)

## Data model inventory (schema as it actually is)

Three layers, joined only by a filename-stem convention (`<id>`).

**Layer 1 — registry shard `argument/lemmas/<id>.md`** (364 files). Flat YAML frontmatter, schema documented at `argument/README.md:18-70`. Actual field population across all 364:

| field | present | values observed |
|---|---|---|
| `id`,`kind`,`contract`,`defs`,`status`,`af`,`owner`,`provenance` | 364 | — |
| `deps` | 362 | semicolon list of registry ids |
| `workspace` | 252 | always exactly `proofs/<id>` (0 divergences) |
| `routes` | **1** | only `argument/lemmas/op-hlc.md` |

- `status`: `proved` 282, `conjecture` 31, `proved-mod-audit` 22, `stated` 19, `open` 3, `numerical` 2, `heuristic` 2, `disproved` 2, `obstruction` 1.
- `af`: `none` 183, `validated` 169, `seeded` 12.
- `kind`: `lemma` 335, `obstruction` 13, `theorem` 6, `open-problem` 6, `proposition` 2, `corollary` 2.
- `owner`: `A` 297, `B` 66, **`D` 1**.

**Layer 2 — proof workspace `proofs/<id>/`** (342 dirs). Not one layout but **nine**:

```
161  af skeleton only (nodes/ locks/ lemmas/ defs/ assumptions/) — ALL EMPTY, 0 files
 61  meta+ledger+export.md+export.tex+externals
 55  af skeleton + meta+ledger+export.md+export.tex+externals
 24  meta+ledger+export.md+export.tex
 23  meta+ledger+export.md+externals
  9  meta+ledger only
  7  af skeleton + meta+ledger+export.md+export.tex
  1  meta+ledger+export.md          1  meta+ledger+externals
```

- `meta.json` is `{"version":"1.0"}` in **all 181** files. Carries no status, no deps, no provenance — a completely dead field.
- `ledger/NNNNNN.json` — one JSON file per event, **15,305 files, 76 MB** for 181 proofs. Event types: `nodes_released` 4062, `nodes_claimed` 4062, `node_created` 2491, `node_validated` 2428, `def_added` 862, `challenge_raised` 409, `challenge_resolved` 402, `node_amended` 343, `proof_initialized` 181, `node_archived` 56, `node_unvalidated` 7, `approach_tried` 2.
- Node record: `{id, type, statement, inference, workflow_state, epistemic_state, taint_state, content_hash, created, claimed_at}`. Lamport dotted ids; depth over 2491 nodes: d1 181, d2 808, d3 973, d4 391, d5 96, d6 36, d7 5, d8 1.
- `externals/<hash>.json` — `{id, name, source, content_hash, created, notes}`; `source` free text sometimes embedding the dep's contract.

**Layer 3 — `definitions/def-<slug>.md`** (46 files). `status`: `locked` 35, `draft` 11. `kind`: `original` 27, `cited` 13, `consensus` 6. Bodies cross-reference via a third link syntax, `[[def-x]]`/`[[lem-y]]`.

**Layer 4 (derived) — `.frontier/verdicts/<hash>.af-<id>.json`**: `{claim, oracle, result, claim_hash, oracle_digest, inputs_hash, ts}`. Content-addressed oracle verdicts over `export.md`.

Generated projections: `argument/INDEX.md`, `argument/DAG.md` (364 nodes, 774 arrows), `report/generated/`, all gated byte-identical by `scripts/check-all.sh`.

## Drift & inconsistency found

**1. Two retracted proofs still read "validated" in three of four layers.** Headline defect.
`argument/lemmas/lem-stage1-approximate-group-laws.md` and `lem-stage1-smooth-unitary-operations.md` were af-validated 2026-07-27 (95th and 100th "rigorous results"), then found DEFECTIVE by an independent sweep and retracted — recorded by editing the shard (`status: stated`, `af: seeded`) plus a prose RETRACTED paragraph. Everything else still says pass:
- ledger: last event `node_validated` node `1`; **no `node_unvalidated` ever appended**.
- `proofs/lem-stage1-approximate-group-laws/export.md:12-14` — `**Status:** validated` / `**Taint:** clean`.
- `.frontier/verdicts/61d7cb6f1c28c816...json` — `"result":"pass"` (ditto the other).
Found only by replaying every ledger vs the `af:` field — **no gate checks this direction** (linker errors on `af != none` + missing workspace, and validated-with-unvalidated-dep, but never `af: seeded` with a validated workspace). The correct mechanism exists and was used exactly once: `proofs/lem-stage1-maurer-cartan-transport` has 7 `node_unvalidated` events.

**2. The unenforced duplicate drifted; the enforced join did not.** Natural experiment:
- *Enforced* (linker rule 3): registry `contract` vs current af root. Replayed all 181 ledgers: **0/181 drift**.
- *Unenforced*: `proof_initialized.conjecture` (copy of root statement at seed time, never updated on amendment): **6/181 (3.3%) drift** — exactly the 6 workspaces with a depth-1 `node_amended`.

**3. Rigor ladder leaks at lemma→definition edge.** 0 violations lemma→lemma; but **5 `af: validated` lemmas import a `status: draft` definition** (`lem-compcb-entrywise-compression-naturality`, `lem-compcb-amplification-naturality` → `def-theta-idempotent-approximation`; `lem-always-tight-dual-support` → `def-zero-face`, `def-dual-witness`, `def-actor-hull`).

**4. 161 ghost workspaces.** Empty `af init` skeletons, shards say `af: none`, linker only errors on the converse. `proofs/` overstates work by 47%.

**5. 22 dangling `workspace:` pointers** (`conj-ex`, `op-classical`, 16 `lem-routef-*`, …). Field is 100% derivable from `id`, checked only when `af != none`.

**6. `externals/` is a second, unchecked dependency encoding.** 959 records; `argument.py` never reads them (`HANDOFF.md:108-112`). 14 externals name a registry id that is neither a dep nor a transitive ancestor (uncited in export.md in fact — but nothing establishes that mechanically). Three id namespaces for one object: `lem-x`, `lem-x-CONTRACT` (447 records, 242 with non-ancestor base), and unresolvable literature ids. 529/959 omit the embedded contract; of the 426 that embed one, 0 drift. `lem-hcb-column-hilbert-squared` has two declared deps with no external at all.

**7. af workspace definition namespace doesn't join to `definitions/`.** 46 distinct `def_added` names; **11 dangle** — free text (`epsilon-banach-cstar-norm-axioms` in 31 workspaces), prose variants, and `def-four-corner-merging-datum-2026-07-25-amended` (amendment encoded as date-suffixed new id, used in 5 workspaces). Cause: "`af def-add` does NOT reject duplicates" (`HANDOFF.md:99-101`). Conversely 11 definitions files used by no workspace.

**8. Documented schema ≠ observed schema.** README documents `cited`/`consensus` (0 uses) and omits `conjecture` (31), `proved-mod-audit` (22), `numerical` (2), `heuristic` (2). `owner` documented A|B; one shard uses D. `challenge_raised.category` present on 2 of 409 events — added late, never backfilled.

**9. `challenge_resolved` records no outcome.** `{type, timestamp, challenge_id}` only. 409 raised / 402 resolved / 7 open; nothing distinguishes "repaired" from "dismissed". The adversarial signal is discarded at resolution time.

**10. 593 of 2428 `node_validated` events (24%) have `verified_by: null`.**

**11. 53% of the ledger is lock traffic** (`nodes_claimed`+`nodes_released` = 8124 of 15,305).

**What did NOT drift**: 0 dangling `deps`, 0 dangling `defs`, 0 dangling wikilinks, 0 duplicate contracts, 0 status-propagation violations, 0 stale export.md, DAG label ≡ shard status for 364/364. Every one is a `check-all.sh` gate. 5-edge spot-check: 5/5 consistent. The DAG is consistent with the registry because it is generated from it; it is NOT cross-checked against workspaces — precisely where findings 1 and 6 live.

## What the structure bought (error-localisation evidence)

**Direct**: `lem-stage1-maurer-cartan-transport` — defect at node `1.3.3` produced 7 `node_unvalidated` of 13 nodes (blast radius computable, bounded to the branch; subtrees 1.1/1.2 untouched).
**Indirect at scale**: challenge targets over 409: `dependencies` 277 (68%), `inference` 45, `gap` 26, `scope` 21, `type_error` 14, `statement` 13, `context` 13. Severity `major` 382 / `critical` 27. Adversarial attention concentrated on the joins between steps — exactly what decomposition exposes.
**Counter-evidence**: the structure did NOT localise the two retractions. Both validated node-by-node clean, caught only by an out-of-band prose sweep reading the whole export. Cause: a child's contract underspecified what it exported ("opaque contracts export only an anaphoric first component") — node-local validation cannot see an interface silently ambiguous across a node boundary.
**Cost**: 15/181 workspaces exceed NODE_SOFT_CAP=26 (max 52); 343 amendments; a whole obstruction class created by the structure itself ("a contract that asserts its own provenance", `HANDOFF.md:142-149`).

## Durable (A)

- **Contract-as-join-key with byte-equality enforcement.** Enforced: 181/181 agreed; unenforced copy: 3.3% drift. Model-independent.
- **Typed DAG of statements with mechanically-checked edges.** "Prose in a contract enforces nothing; a dep edge is checked every gate run" (`HANDOFF.md:48-53`).
- **Append-only event log as source of truth** — what made the audit itself possible. Durable provided derived state is projected, never stored.
- **Generated-vs-authored with byte-comparison freshness gates.** Zero drift wherever applied.
- **Content-addressed verdicts over hashed artifacts.** Right primitive; failed only because nothing *invalidates* a verdict.
- **Independent adversarial challenge as a first-class record.**
- **Explicit whitelists for known-incomplete state** (`report/UNWIRED.md`): "listed = allowed, unlisted = hard ERROR" — turns omission into a reviewable act.

## Scaffolding (B)

- ~26-node soft cap and balloon abort (ceiling rises with model capability).
- Lamport dotted decomposition to depth 8 — bookkeeping durable; granularity (2491 nodes/181 lemmas, median depth 3) calibrated to current models.
- `proved-mod-audit`/`heuristic`/`numerical` confidence ladder — collapses toward binary as verification strengthens.
- `owner: A|B` — two-arm staffing model, not a property of the mathematics.
- Per-node claim/release locking in the ledger (53% of events) — artifact of multi-worker orchestration over a filesystem.
- `provenance:` as free text (~20 distinct grammars) — exists because no structured link to design artifacts was built.

## Anti-patterns (C)

- **`meta.json = {"version":"1.0"}` × 181** — versioned envelope, no payload.
- **Retraction expressible only in prose** — the strongest negative finding lives in a markdown paragraph while export.md and the oracle verdict still say pass. Scar tissue with an active false claim in it.
- **Verdicts that never expire** — `result: pass` with no supersession/revocation.
- **`workspace:` stored but 100% derivable**, dangling ×22.
- **`af:` hand-flipped duplicate of a ledger-computable fact**, wrong 2/181. "Mechanical flip" is the tell: if mechanical, compute it.
- **Two id namespaces plus a suffix convention** — a name in three shapes is a join key in none.
- **Versioning by date-suffixed id** — absence of a version field made new-id-minting the only move.
- **`challenge_resolved` with no outcome.**
- **One JSON file per event** (15,305 files/76 MB).
- **161 empty skeleton dirs** no check can see (+47% apparent progress).
- **A full OR-route grammar for one consumer** (`routes:` serves exactly one shard).
- **Schema doc drift** (documents 2 unused statuses, omits 4 used ones).

## Schema-from-scratch recommendations

**Keep.** Shard-per-result with one-line canonical contract; typed dep DAG with acyclicity+dangling+propagation enforcement; append-only event log; generated artifacts byte-compared; content-addressed verdicts; explicit whitelists for known gaps.

**Drop.** `meta.json`; `workspace:`; `af:` as stored field; `externals/` as parallel dep encoding; free-text workspace def names; per-event files; date-suffixed versioning.

**Change.**
1. **One id namespace, one join key** for every reference type.
2. **Store facts, compute statuses.** `af` = derive(ledger); `status` the only asserted field, with `asserted_by` + `evidence_ref`. Single check "every derived field equals its recomputation" would have caught findings 1 and 5 at commit time.
3. **Retraction as first-class event; verdicts revocable.** `retracted{target, by, reason, supersedes_verdict}`; no artifact may render "validated" when a retraction event exists. **Single highest-value change** — the one place the current model states a falsehood.
4. **Cross-layer gates, not per-layer gates.** Workspace-root state ≡ registry `af`; workspace imports ≡ registry `deps` (with `cited` vs `registered` as distinct typed relations); no validated result imports a non-locked definition (5 live violations); every proofs/* dir has a shard with `af != none`.
5. **Version definitions/contracts in place** (`def-x@3` + supersedes edge; dependents pin the version validated against → amendment auto-invalidates).
6. **Type the challenge lifecycle** (`outcome ∈ repaired|withdrawn|dismissed|escalated` + resolution_ref); `verified_by` non-nullable.
7. **Separate epistemic log from operational log** (locks → scheduler log; one file per proof).
8. **Provenance as typed reference** `{artifact, locus, hash}` resolvable in-repo.
9. **Interface obligations, not just statements.** Both retractions were caused by a child contract under-specifying what it exported. Contracts need an explicit *exports* clause checked against the parent's citation — the one place the schema should get richer, not leaner.
