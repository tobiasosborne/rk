# Scratch campaign dir: lem-mass-split (M3.5 SC4 baseline prep)

Prepared for rk's M3.5 SC4 baseline re-measurement (`../research-workflows/IMPLEMENTATION_PLAN.md`
row M3.5). This directory is a FRESH re-proof scratch, never a copy of AISM's own proof state — no
proof content was seeded here; the af workspace holds only the root conjecture.

Full selection rationale, node-count/shape/fan-in table, and the runbook command sequence live in
`rk/docs/memos/2026-07-19-m3.5-baseline-runbook.md`. This README states only per-lemma provenance:
exactly what was copied, from where, and what was deliberately left out.

## Source (read-only origin)

AISM repo: `/home/tobiasosborne/Projects/almost-idempotent-stochastic-maps` (registry id
`lem-mass-split`, `argument/INDEX.md` row: kind=lemma, status=proved, af=validated, owner=A).

Contract: "Mass split: for an exact signed idempotent P and any row index v, writing a_j = P_{vj},
a_j^+ = max(a_j, 0), a_j^- = max(-a_j, 0), and nu_v = sum_j a_j^-, one has sum_j a_j^+ = 1 + nu_v."

Original workspace: `proofs/lem-mass-split/` (9-node tree, root status `validated`, all 9 nodes
taint `clean`). Original validation provenance (`argument/lemmas/lem-mass-split.md` frontmatter):
"af-VALIDATED IN-REPO 2026-07-02 (run 1, clean): 9-node adversarial tree, root `validated`, taint
9/9 clean; fresh codex prover/verifiers per node, Claude orchestrated only (§6)." AISM's process
rule (`CLAUDE.md`/`AGENTS.md` §1-2: "Provers = fresh codex; verifiers = *separate* fresh codex;
roles never mix") confirms fresh-codex+fresh-codex for every node — at the campaign-protocol
level, since AISM's ledger events carry no per-node actor/model identity field (V1's still-open
scope in vibefeld).

## Why this lemma (in addition to the memo's table)

Factored out of `proofs/lem-halo-collapse`'s elevation run 1 specifically BECAUSE that run
ballooned (49 > 40 nodes) from re-deriving this bookkeeping identity inline across siblings — it
is now depended on by 13 other lemma shards in the registry (highest fan-in of any candidate in
the 5-20 node band), making it a good "real, load-bearing" pick rather than an artificial toy.

## What was copied (and only this)

| File in this dir | Copied from (AISM, read-only) |
|---|---|
| `argument/lemmas/lem-mass-split.md` | `argument/lemmas/lem-mass-split.md` (registry shard, byte-identical) |
| `definitions/def-signed-idempotent.md` | `definitions/def-signed-idempotent.md` (registry `defs:` field) |
| `definitions/def-negative-mass.md` | `definitions/def-negative-mass.md` (registry `defs:` field) |

The registry shard's `deps:` field is empty (no lemma-to-lemma dependency, only the two
definitions above). `def-signed-idempotent.md`'s own prose contains further `[[wiki-links]]` to
`def-near-positive-projection`, `def-exposed`, `def-visible-set`, `def-height`,
`def-invisible-mass` — these are CROSS-REFERENCE context in the definition's "Notes/provenance"
paragraph, not terms the mass-split proof itself invokes (confirmed against
`proofs/lem-mass-split/export.md`'s node statements, which use only "exact signed idempotent" and
"negative mass" vocabulary). They were deliberately NOT copied transitively; if a fresh prover
turns out to need them, that is itself a useful signal about how tightly the registry's `defs:`
field tracks real proof dependencies.

No `refs/manifest` rows apply (grepped the shard and export for citation markers; none found).

## What was NOT copied (deliberate)

- The original `proofs/lem-mass-split/export.md` and `ledger/` — proof CONTENT and event trail.
  The new af workspace below starts from the bare conjecture only.
- `argument/INDEX.md`, `argument/DAG.md` — generated cross-campaign artifacts (Rule 9).

## Fresh af workspace

```
af init -c "<the contract above>" -a "rk-m3.5-baseline-prep" -d proofs/lem-mass-split
```

Result: `proofs/lem-mass-split/` contains a brand-new af workspace with a single
`proof_initialized` ledger event and root node `1` = the conjecture, `epistemic_state: pending`.

## `.rk/config.json` (run A) and `.rk/workers.reverse.json` (run B)

Both validated clean against `dist/rk check --root <this dir>`: config gate reports 3/3 fields
valid, 0 errors, for both files. See the runbook memo for the full transcript and the one caveat
(provenance gate's report-anchor check — orthogonal to config validity, see below).

`rk` has no `--config` flag; only `.rk/config.json` at the fixed path is read
(`src/store/config-load.ts`). To run direction B, swap the file into place:

```
cp .rk/config.json .rk/config.run-a.json.bak
cp .rk/workers.reverse.json .rk/config.json
```
