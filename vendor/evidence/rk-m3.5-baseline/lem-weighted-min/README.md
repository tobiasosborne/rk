# Scratch campaign dir: lem-weighted-min (M3.5 SC4 baseline prep)

Prepared for rk's M3.5 SC4 baseline re-measurement (`../research-workflows/IMPLEMENTATION_PLAN.md`
row M3.5). This directory is a FRESH re-proof scratch, never a copy of AISM's own proof state — no
proof content was seeded here; the af workspace holds only the root conjecture.

Full selection rationale, node-count/shape/fan-in table, and the runbook command sequence live in
`rk/docs/memos/2026-07-19-m3.5-baseline-runbook.md`. This README states only per-lemma provenance:
exactly what was copied, from where, and what was deliberately left out.

## Source (read-only origin)

AISM repo: `/home/tobiasosborne/Projects/almost-idempotent-stochastic-maps` (registry id
`lem-weighted-min`, `argument/INDEX.md` row: kind=lemma, status=proved, af=validated, owner=A).

Contract: "Weighted minimum bound: let p_1, ..., p_m be positive reals with sum_i p_i = 1 and let
n_1, ..., n_m be real numbers; then min over i in {1, ..., m} of n_i <= sum_i p_i * n_i."

Original workspace: `proofs/lem-weighted-min/` (8-node tree, root status `validated`, all 8 nodes
taint `clean`). Original validation provenance (`argument/lemmas/lem-weighted-min.md` frontmatter):
"docs/waves/2026-07-03-A10-weighted-payment.md (arm A wave 10, codex ...); factored out of
proofs/lem-fan-payment after the run-1/run-2 balloon aborts (aism-ugk)." AISM's process rule
(`CLAUDE.md`/`AGENTS.md` §1-2: "Provers = fresh codex; verifiers = *separate* fresh codex; roles
never mix") means every node in this workspace was validated by fresh-codex-prover +
separate-fresh-codex-verifier — confirmed at the campaign-protocol level; AISM's ledger events
themselves carry NO actor/model identity field (that is `V1`'s still-open scope in vibefeld, per
`IMPLEMENTATION_PLAN.md`), so this cannot be re-derived from ledger JSON alone.

## What was copied (and only this)

| File in this dir | Copied from (AISM, read-only) |
|---|---|
| `argument/lemmas/lem-weighted-min.md` | `argument/lemmas/lem-weighted-min.md` (registry shard, byte-identical) |

`defs:` and `deps:` are both empty in the registry shard — this lemma is a self-contained abstract
inequality (weighted-average domination), not stated in terms of any AISM-specific vocabulary
(`def-signed-idempotent` etc.). **No `definitions/` shard was copied — none is needed.** This is
part of why it was selected: maximal self-containedness for the baseline's first, simplest re-proof.

No `refs/manifest` rows apply (grepped the shard and export for citation markers; none found).

## What was NOT copied (deliberate)

- The original `proofs/lem-weighted-min/export.md` and `ledger/` — the historical proof CONTENT
  and event trail. Seeding proof content here would defeat the baseline's purpose (measuring a
  FRESH prove-from-scratch cost); the new af workspace below starts from the bare conjecture only.
- `argument/INDEX.md`, `argument/DAG.md` — the generated cross-campaign index/DAG; not needed to
  re-prove one isolated lemma, and hand-copying a generated file would violate CLAUDE.md Rule 9
  (generated vs. authored) if it were later edited here.

## Fresh af workspace

Initialized read-only-safe (writes only inside this scratch dir):

```
af init -c "<the contract above>" -a "rk-m3.5-baseline-prep" -d proofs/lem-weighted-min
```

Result: `proofs/lem-weighted-min/` contains a brand-new af workspace (`.gitignore`, `export.md`,
`meta.json`, `ledger/000001.json` — a single `proof_initialized` event). Root node `1` is the
conjecture above, `epistemic_state: pending`, no proof steps. Verified with
`af status -d proofs/lem-weighted-min`: root is a VERIFIER job (fresh af's normal post-init state).

## `.rk/config.json` (run A) and `.rk/workers.reverse.json` (run B)

Both validated clean against `dist/rk check --root <this dir>`: **config gate reports 3/3 fields
valid, 0 errors** for both files (see the runbook memo's "config validation" section for the full
`rk check` transcript and the one caveat found — the provenance gate's report-anchor check, which
is about paper-wiring and orthogonal to config validity).

`rk` has no `--config` flag; only `.rk/config.json` at the fixed path is ever read
(`src/store/config-load.ts`). To run direction B (prover=codex, verifier=claude), an operator must
explicitly swap the file into place, e.g.:

```
cp .rk/config.json .rk/config.run-a.json.bak
cp .rk/workers.reverse.json .rk/config.json
```
