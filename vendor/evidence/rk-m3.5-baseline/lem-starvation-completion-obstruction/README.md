# Scratch campaign dir: lem-starvation-completion-obstruction (M3.5 SC4 baseline prep)

Prepared for rk's M3.5 SC4 baseline re-measurement (`../research-workflows/IMPLEMENTATION_PLAN.md`
row M3.5). This directory is a FRESH re-proof scratch, never a copy of AISM's own proof state — no
proof content was seeded here; the af workspace holds only the root conjecture.

Full selection rationale, node-count/shape/fan-in table, and the runbook command sequence live in
`rk/docs/memos/2026-07-19-m3.5-baseline-runbook.md`. This README states only per-lemma provenance:
exactly what was copied, from where, and what was deliberately left out.

## Source (read-only origin)

AISM repo: `/home/tobiasosborne/Projects/almost-idempotent-stochastic-maps` (registry id
`lem-starvation-completion-obstruction`, `argument/INDEX.md` row: kind=lemma, status=proved,
af=validated, owner=B).

Contract (abbreviated in the memo table; full text below is the exact string used for `af init`):
"Bounded-slab starvation completion obstruction (K-free): for every finite I, every real A in
[4,6], every real tau in (0,1/256], and t := tau^2, a := tau/(1+tau), there is no rank-three exact
signed idempotent P (P^2 = P, P*1 = 1, rank P = 3) with row negative mass nu_i <= t for every i in
I having five distinct full row-point fibers represented by v,w,f,z,o such that, with D := p_z -
p_v and E := p_o - p_v linearly independent, ||D||_1 = tau, p_f - p_v = -A*D + t*E, p_w - p_v =
a*(p_f - p_v), top-row fiber masses c_v = 1 - tau, c_w = tau + t, c_f = -t, and c_Q = 0 for every
other full row-point fiber Q, every full row-point fiber Q has unique reals x_Q, y_Q with p_Q =
p_v + x_Q*D + y_Q*E, and every nonactor support fiber Q satisfies either p_Q in
conv{p_v,p_w,p_f,p_z,p_o} or 0 <= y_Q <= 1."

Original workspace: `proofs/lem-starvation-completion-obstruction/` (7-node tree — the smallest of
the three selected lemmas). Original validation provenance (`argument/lemmas/
lem-starvation-completion-obstruction.md` frontmatter): "W59 wave
(runs/2026-07-10-w58-starvation-completion-extra-vertex/PAPER-PROOF-w59.md): codex prover
(gpt-5.6-sol ultra) paper proof from first principles ...; fresh hostile codex verifier verdict
first line verbatim 'VERDICT: VALID-WITH-CORRECTIONS — the K-free obstruction is proved; only an
index-level coordinate abbreviation is missing.' (single notation correction applied). Reviewer !=
author." This is the most EXPLICIT of the three provenance strings about the codex+codex split
(names the exact model and effort, and quotes the verifier verdict verbatim) — AISM's
`CLAUDE.md`/`AGENTS.md` process rule confirms the same fresh-codex-prover / separate-fresh-codex-
verifier discipline campaign-wide; ledger events themselves carry no identity field.

## Why this lemma (in addition to the memo's table)

Smallest node count (7) of any validated+clean candidate in the 5-20 band, and the one with the
most distinctly BUSHY shape: root `1` -> single child `1.1` -> a flat fan of five leaves
(`1.1.1`..`1.1.5`), versus the other two candidates' more linear/chain-like trees. It is also a
"nothing exists" (obstruction) result rather than an inequality bound — a different proof-shape
flavor than lem-weighted-min/lem-mass-split — and has zero registered fan-in (no other lemma shard
currently cites it), the opposite end of the fan-in spectrum from lem-mass-split's 13.

## What was copied (and only this)

| File in this dir | Copied from (AISM, read-only) |
|---|---|
| `argument/lemmas/lem-starvation-completion-obstruction.md` | same path (registry shard, byte-identical) |
| `definitions/def-signed-idempotent.md` | `definitions/def-signed-idempotent.md` (registry `defs:` field) |
| `definitions/def-negative-mass.md` | `definitions/def-negative-mass.md` (registry `defs:` field) |

`deps:` is empty in the registry shard. Same transitive-closure caveat as lem-mass-split's README:
`def-signed-idempotent.md`'s own cross-reference links to other definitions were NOT chased
further — only the two defs the registry shard itself names were copied.

No `refs/manifest` rows apply (grepped the shard for citation markers; none found).

## What was NOT copied (deliberate)

- The original `proofs/lem-starvation-completion-obstruction/export.md` and `ledger/` — proof
  CONTENT and event trail. The new af workspace starts from the bare conjecture only.
- `argument/INDEX.md`, `argument/DAG.md` — generated cross-campaign artifacts (Rule 9).
- The W59 wave's supporting run bundle (`runs/2026-07-10-w58-starvation-completion-extra-vertex/`)
  — background material for the ORIGINAL proof's construction, not part of the registry's own
  `defs:`/`deps:` contract for a fresh re-proof.

## Fresh af workspace

```
af init -c "<the contract above>" -a "rk-m3.5-baseline-prep" -d proofs/lem-starvation-completion-obstruction
```

Result: a brand-new af workspace with a single `proof_initialized` ledger event and root node `1`
= the conjecture, `epistemic_state: pending`.

## `.rk/config.json` (run A) and `.rk/workers.reverse.json` (run B)

Both validated clean against `dist/rk check --root <this dir>`: config gate reports 3/3 fields
valid, 0 errors, for both files. See the runbook memo for the full transcript and the one caveat
(provenance gate's report-anchor check — orthogonal to config validity).

`rk` has no `--config` flag; only `.rk/config.json` at the fixed path is read
(`src/store/config-load.ts`). To run direction B, swap the file into place:

```
cp .rk/config.json .rk/config.run-a.json.bak
cp .rk/workers.reverse.json .rk/config.json
```
