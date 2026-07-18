<!-- ROLE: authored audit memo — the AISM-residue disposition record (bead rk-hq9). It fixes,
     item by item, which AISM-derived assumptions in the M0 gate contracts, gate defaults, and
     layout conventions are genuinely general (JUSTIFY), which are sound defaults that must be
     per-repo parameters (CONFIGURABLE), and which are AISM particulars to delete or replace
     (REMOVE). UPDATE POLICY: authored, APPEND-ONLY — later audits add a dated section below,
     never rewrite a settled disposition (an audit's value is the standing record of what was
     decided and why). TRIGGER: read at the M1.1 template-design boundary (rk-b8p) and before any
     WP that stamps scaffold layout (M1.2), touches Gate 4/Gate 6 bindings, or edits
     DEFAULT_GATE_CONFIG (src/gates/config.ts). -->

# AISM-residue audit (2026-07-18)

Bead rk-hq9. TJO directive (bd memory `aism-role-final-tjo-2026-07-18-supersedes`,
`aism-stance-tjo-2026-07-18-reinforcing-l5`): **AISM is a case study in what NOT to do.** rk
must serve ANY theoretical-research campaign (SC7 generality — the vision core). "Any gate
contract, default, or layout assumption that exists only because AISM does it that way is
suspect residue to be flagged and justified or removed." The M0 gate suite was ported from
AISM's `scripts/check-*.py` / `check-report-shards.sh`, so the residue risk is concrete and
per-item.

## Authority used to adjudicate

Per the stance memory, when rk and AISM disagree the spec is `docs/gate-contracts.md`, the PRD,
and the IMPLEMENTATION_PLAN in `../research-workflows/`; AISM's scripts, conventions, and repo
layout are NOT the spec. The single most decisive fact in this audit:

- **`../research-workflows/PRD.md:79-85` names the entire rk scaffold** — top-level docs
  `PRD.md CLAUDE.md==AGENTS.md HANDOFF.md CONVENTIONS.md FINDINGS.md`; the four content layers
  `definitions/ argument/ proofs/ runs/` plus `refs/`; `docs/worklog.md`; and the tool-state dirs
  `.rk/ .frontier/ .beads/ build/`. Confirmed by `DISTILLATION.md:47-55` (Layer 0 `definitions/`,
  Layer 1 `argument/lemmas/`, Layer 2 `proofs/<id>/`, Layer 3 `runs/<date-slug>/`).
- **`report/` is NOT in the rk scaffold.** The `report/` LaTeX-paper tree that Gate 4
  (provenance) and Gate 6 (report-shards) scan is an AISM/AQM particular. PRD:229 defers LaTeX
  generation ("until the HTML artifact has proven..."); the rk render target is a self-contained
  HTML site (`IMPLEMENTATION_PLAN.md` M2.4, dagre-vendored), and M2.6 replaces the manual
  mirror-check gates with regenerate-and-diff, **deleting the AISM mirror files**
  (`docs/gate-contracts.md:1182-1188`, Gate 7 reserved). This single distinction drives the
  largest findings below.

## Summary table

| # | residue item | class | recommendation | consumer WP / bead |
|---|---|---|---|---|
| R1 | Four-layer dir names `definitions/ argument/lemmas/ proofs/ runs/ refs/` | JUSTIFY | Keep — the rk spec, PRD:79-85 / DISTILLATION:47-55, not AISM residue | M1.1/M1.2 |
| R2 | defs kinds `cited\|consensus\|original` | JUSTIFY | Keep — PRD:107 | — |
| R3 | linker math kinds + id-prefix `lem-/thm-/prop-/cor-/op-/obs-` | JUSTIFY | Keep — math-general, PRD:104-110 | — |
| R4 | rigour-ladder statuses (`MATH_STATUS` enum) | JUSTIFY | Keep — PRD §5 rigour ladder | — |
| R5 | af enum `none\|seeded\|validated` | JUSTIFY | Keep — D1 (af adopted) | — |
| R6 | `refs/manifest/{checksums.sha256,SOURCES.md,sources.lock.json}` | JUSTIFY | Keep — PRD D3/C4; rk owns them (M0.6) | — |
| R7 | `shardsMaxLines` default 280 | JUSTIFY | Keep — rk CLAUDE.md Rule 4 house style; already configurable | — |
| R8 | runs README required substrings (`hypothesis/command/finding/next` + invariant markers) | JUSTIFY | Keep — DISTILLATION:55 evidence discipline; loose, M2.6-superseded | — |
| R9 | `linkerBrittlenessSoftCap` default **26** (AISM's realigned value) | CONFIGURABLE | Keep the key; surface as a constitution/config slot, documented as an AISM-derived starting value, not a universal truth | M1.1 → **rk-8uc** |
| R10 | `refsMinRunReportingLength` default 40 (`MIN_RUN`) | CONFIGURABLE | Keep — already a key, message-only (never affects a verdict); no code change | — |
| R11 | repo-root `INDEX.md` reverse-lookup (runs gate) | CONFIGURABLE/REMOVE | Not in the scaffold; decide keep-as-config vs. fold into M2.6 regenerate-and-diff | M2.6 → **rk-775** |
| R12 | `shardsPrefix` default **`"AISM"`** | REMOVE | Delete the literal-`"AISM"` default; rk init must stamp per-repo; a general tool must never default a shard-id prefix to a specific campaign name | **M1 landing-blocker**, M1.1/M1.2 → **rk-psm** |
| R13 | The `report/` LaTeX-paper layout Gate 4 & Gate 6 assume | REMOVE/replace | Keep the OVERCLAIM/report-hygiene PURPOSE; the `report/`-LaTeX BINDING is AISM residue — M1.1 must NOT stamp a `report/` tree; the binding is superseded by HTML render (M2.4) + M2.6 regenerate-and-diff | M1.1 + M2.6 → **rk-au6** |
| R14 | `argument/INDEX.md` + `argument/DAG.md` markdown mirror format | REMOVE-at-M2.6 | Transitional; M1.1 templates must not bake the markdown mirror as canonical — HTML render (M2.4) + M2.6 supersede it | M2.4/M2.6 → **rk-1rv** |
| R15 | Gate 4 LaTeX/bibliography specifics (label grammar, `\Cref`, `EXTERN_YEAR_RE`, `SOURCE_ALLOW`, `UNWIRED.md`, `tab:status`) | REMOVE/replace | Ride inside R13's binding; keep the join CONCEPT, drop the LaTeX-only encodings | folds into rk-au6 |
| R16 | `provenanceStatusTableFile` default `report/sections/13_discussion.tex` | CONFIGURABLE | Already a key; the default points into the non-scaffold `report/` tree — couple its disposition with R13 | folds into rk-au6 |

Counts: **8 JUSTIFY, 4 CONFIGURABLE, 4 REMOVE/replace** (R15/R16 fold into R13's bead).
Five follow-up beads filed (rk-8uc … rk-1rv). One M1 landing-blocker (R12).

---

## Per-item detail

### R1 — Four-layer directory names — JUSTIFY

`definitions/`, `argument/lemmas/`, `proofs/`, `runs/`, `refs/` are hardcoded across every gate
and every refs module: `src/gates/load.ts:98-106` (`INCLUDE_RULES`),
`src/gates/linker-parse.ts:87` (`LEMMA_DIR = "argument/lemmas"`), `src/gates/defs.ts:20-21`,
`src/gates/runs.ts`, `src/refs/*`. These are **the rk spec, not residue**: PRD:79-85 stamps
exactly this skeleton; DISTILLATION:47-55 names the same four layers as the settled extraction.
Keep, with the one-line justification that they are PRD-normative. (This item exists in the memo
so a future auditor does not re-flag the layer names as suspect: they were checked against the
PRD and confirmed as spec.)

### R2–R5 — Vocabulary enums — JUSTIFY

- defs kinds `cited|consensus|original` (`src/gates/defs.ts`; contract Gate 1 Inputs) — PRD:107
  names these three exactly. General to any provenanced-definition discipline.
- linker kinds `lemma|proposition|theorem|corollary|open-problem|obstruction` and the id-prefix
  convention `lem-/thm-/prop-/cor-/op-/obs-` (contract Gate 2 Inputs) — standard mathematical
  vocabulary, not AISM-specific; PRD:104-110 frames Layer 1 as "one result per shard" in these
  terms.
- rigour-ladder statuses `proved|cited|consensus|open|obstruction|disproved|stated|
  proved-mod-audit|conjecture|heuristic|numerical` (contract Gate 2 Inputs, `MATH_STATUS`) — the
  rigour ladder is a settled rk concept (PRD §5; `proved-mod-audit` at PRD:334). General.
- af enum `none|seeded|validated` (contract Gate 2) — af is the rk-adopted prover under D1 (af
  stays Go). Keep.

### R6 — refs/manifest filenames — JUSTIFY

`refs/manifest/checksums.sha256` (`src/gates/defs.ts:21`), `refs/manifest/SOURCES.md`
(`src/refs/manifest.ts`), `refs/manifest/sources.lock.json` (`src/refs/quote-locate.ts:22`,
`src/refs/status.ts:65`). The refs/manifest pattern is PRD-normative (D3 "the refs/manifest
pattern stays inside each research repo"; C4). rk **owns** this subsystem as of M0.6 — these are
now rk's own file conventions, stamped by rk init, not passively inherited AISM names. Keep.

### R7 — shardsMaxLines 280 — JUSTIFY (already configurable)

`src/gates/config.ts:40` default 280; `REPORT_SHARD_MAX_LINES` was already an env override in
AISM. 280 coincides with rk's OWN CLAUDE.md Rule 4 (~200-line target, 280 hard cap) — it is rk
house style, not merely AISM's number. Already a `GateConfig` key. Keep.

### R8 — runs README required substrings — JUSTIFY (loose; M2.6-superseded)

`src/gates/runs.ts`; contract Gate 5 Inputs. The `hypothesis/command/finding/next` +
invariant-marker substring requirement is general numerical-evidence discipline (DISTILLATION:55,
"invariant required"). It is admittedly loose (substring, not structural — contract Gate 5 Known
limitations) and M2.6's regenerate-and-diff supersedes the substring mirror. No change now; keep.

### R9 — brittleness soft cap 26 — CONFIGURABLE (bead rk-8uc)

`src/gates/config.ts:37` `linkerBrittlenessSoftCap: 26`. Already a `GateConfig` key (good — the
parameterization itself is correct). But the DEFAULT 26 is AISM-particular: it is "AISM's
realigned value" (IMPLEMENTATION_PLAN M0.1, verbatim; PRD:113-115), derived from AISM's own
trees running 14–52 nodes after the aism-s64 incident (a stale 12-node threshold crying REFACTOR
on ~20 healthy trees — contract Gate 2 Failure mode). A different campaign has different tree
sizes; 26 is a reasonable starting value but not a universal truth. **Recommendation:** keep the
key and the 26 default, but M1.1 must surface it as an explicit constitution/config slot with a
one-line note that it is an AISM-derived starting value to be tuned per campaign — not stamped
silently. WARN-only (never blocks a gate), so this is not a landing-blocker. Filed as rk-8uc.

### R10 — refsMinRunReportingLength 40 — CONFIGURABLE (no code change)

`src/gates/config.ts:41` default 40 (`MIN_RUN`). Already a key, and by construction message-only
— it feeds the "best matched run: n/m chars" FAIL diagnostic text and MUST NOT affect the
whole-quote-match verdict (config.ts:27-33; the verdict lives in `src/refs/quote.ts`
`wholeQuoteMatch`). AISM's 40-char "distinctive run" heuristic survives only as a reporting
threshold. No action needed; recorded for completeness.

### R11 — repo-root INDEX.md reverse-lookup — CONFIGURABLE/REMOVE (bead rk-775)

`src/gates/runs.ts:41-43` (`INDEX_PATH = "INDEX.md"`, repo-root, NOT `runs/INDEX.md`); contract
Gate 5 Inputs (`ROOT / "INDEX.md"`, check-runs.py:28). A **repo-root `INDEX.md`** is NOT named in
the PRD scaffold (PRD:79-85) — it is an AISM particular (its manual reverse-lookup index). The
runs gate ERRORs a bundle whose dirname is not a substring of this file. On a fresh rk repo there
is no `INDEX.md`, so every run bundle would ERROR "not referenced in INDEX.md" — unless M1.1
stamps one, which would import an AISM convention the PRD did not sanction. **Recommendation:**
decide between (a) making the reverse-lookup index a `GateConfig` path (and stamping it in the
scaffold) or (b) folding it into M2.6's regenerate-and-diff (a generated index, freshness-checked)
and dropping the manual-substring check. The M2.6 direction is preferred (PRD D2: generate
derived artifacts, gate freshness). Filed as rk-775.

### R12 — shardsPrefix default "AISM" — REMOVE — **M1 LANDING-BLOCKER** (bead rk-psm)

`src/gates/config.ts:39` `shardsPrefix: "AISM"`. The literal string `"AISM"` is the default
shard-id prefix; Gate 6 check 10/12 enforces `^${PREFIX}-[0-9]{2}...` and errors any shard whose
id does not carry it (`src/gates/shards.ts:183,193`; contract Gate 6 Inputs). This is the single
clearest piece of residue in the codebase: **a general research tool must never default a
shard-id prefix to a specific campaign's name.** A fresh dogfood repo would either be forced to
prefix its shard ids `AISM-...` or would fail Gate 6 on every shard. **Recommendation:** delete
the `"AISM"` default. rk init (M1.2) must stamp `shardsPrefix` from the project (e.g. a slug
derived from the north-star contract / repo name); consider making it a required config value
with NO universal default so a mis-stamp fails loudly rather than silently inheriting `"AISM"`.
This is the acceptance bar for rk-b8p ("a domain expert finds no AISM-specific residue") made
mechanical — a stamped repo carrying `AISM` anywhere fails that bar. Filed as rk-psm; flagged
as an M1 landing-blocker.

### R13 — the report/ LaTeX-paper layout (Gates 4 & 6) — REMOVE/replace (bead rk-au6)

Gate 4 (provenance) scans `report/sections/*.tex`, `report/PROVENANCE.md`, `report/UNWIRED.md`,
and `report/sections/13_discussion.tex` (`src/gates/provenance-md.ts:49,124,155`,
`provenance-parse.ts:137`). Gate 6 (report-shards) scans `report/main.tex`, `report/sections/`,
`report/README.md`, `report/SHARD_CATALOG.md` (`src/gates/shards.ts:28-31`) — "Ported wholesale
from `../arithmetic-quantum-mechanics`" (contract Gate 6 Purpose). **None of `report/` is in the
rk scaffold (PRD:79-85).** rk's render target is a self-contained HTML site (M2.4, dagre); LaTeX
generation is explicitly deferred (PRD:229); and M2.6's regenerate-and-diff replaces the manual
mirror-check gates and **deletes the AISM mirror files** (contract Gate 7 reserved,
`docs/gate-contracts.md:1182-1188`).

The distinction to preserve: **Gate 4's PURPOSE is general and load-bearing** — guard OVERCLAIM,
keep the human-readable output in lockstep with the machine-checked registry (contract Gate 4
Failure mode, "the project's #1 guarded failure mode"). That purpose must survive. What is AISM
residue is the BINDING of that purpose to a hand-authored LaTeX `report/` tree. Gate 6
(report-shards) is almost entirely AQM LaTeX-sharding mechanics with far less general purpose.

**Recommendation:**
1. M1.1 must NOT stamp a `report/` LaTeX tree into the scaffold. On a fresh rk repo both gates
   correctly no-op (Gate 6 empty-scaffold exemption `shards-11`; Gate 4 `tab:status` returns `[]`
   ⇒ coverage `0 tab:status rows`), so a stamped repo is clean without any `report/` present.
2. Treat the report/-LaTeX binding as scheduled-for-replacement at M2.6 (regenerate-and-diff on
   the HTML render), not as canonical structure. Do not deepen the LaTeX coupling in the interim.
3. The general OVERCLAIM/registry↔output join concept survives into the M2.4 render + M2.6
   freshness mechanism; the LaTeX encodings (R15) do not.

Filed as rk-au6 (consolidates R13, R15, R16).

### R14 — argument/INDEX.md + DAG.md markdown mirror — REMOVE-at-M2.6 (bead rk-1rv)

`src/gates/linker-render.ts:111-112` renders `argument/INDEX.md` / `argument/DAG.md`; Gate 2
check 11 (generated freshness) errors a stale one. These generated markdown mirror files are
AISM's view format; rk's canonical render is HTML (M2.4), and M2.6 regenerate-and-diff replaces
the staleness check. **Recommendation:** M1.1 templates must not present the markdown INDEX/DAG
mirror as the canonical, permanent view. Keep the generate/check-freshness mechanism through M2
(it is the one working freshness pair rk has today — contract Gate 2 check 11), but tag it
transitional and let M2.4/M2.6 subsume it. Filed as rk-1rv.

### R15 — Gate 4 LaTeX/bibliography specifics — REMOVE/replace (folds into rk-au6)

`src/gates/provenance-parse.ts:13` label grammar `[a-z]+:[A-Za-z0-9-]+`;
`provenance-md.ts:171` `\Cref`/`\ref` scanning; `src/gates/provenance.ts:55` `EXTERN_YEAR_RE =
/^[A-Z]+[0-9]{3,}$/` (author+year citation like `Kadison1952`); `provenance.ts:53` `SOURCE_ALLOW`
marker set; `report/UNWIRED.md` whitelist; `tab:status` table (`provenance-md.ts:145-171`). These
are all LaTeX/bibliography encodings of the general join concept in R13. The CONCEPT (a result
must be wired into the output; a claimed status must match) is general; the ENCODINGS are AISM/AQM
particulars. Replace alongside R13's binding at M2.4/M2.6. No standalone bead — folded into
rk-au6.

### R16 — provenanceStatusTableFile default — CONFIGURABLE (folds into rk-au6)

`src/gates/config.ts:38` default `report/sections/13_discussion.tex`. Already a `GateConfig` key
(the parameterization was the right call — the hardcoded literal caused a real false-green when
AISM renumbered the ledger; contract Gate 4 Divergences `provenance-11`). But the default value
points into the non-scaffold `report/` tree, so its disposition is inseparable from R13. When R13
resolves the report/-binding, this default is re-decided with it. Folded into rk-au6.

---

## Landing-blocker call for M1

**One landing-blocker: R12 (`shardsPrefix` default `"AISM"`).** It is the mechanical form of
rk-b8p's own acceptance bar ("a domain expert finds no AISM-specific residue"): any stamped repo
that carries `AISM` — as a shard-id prefix default or anywhere else — fails that bar by
inspection. It must be removed before M1.1's template set is accepted.

The report/-layout residue (R13) is NOT a landing-blocker: on a fresh rk repo Gates 4 and 6
correctly no-op via their empty-scaffold exemptions, and the full replacement is already
scheduled at M2.4/M2.6. It is a template-DESIGN constraint (do not stamp `report/`), captured in
the rk-b8p notes, not an M1 blocker.
