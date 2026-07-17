<!-- ROLE: committed review record (Fable L6 review of gate-contracts.md @ e17bbe8).
     UPDATE POLICY: append-only; never edited after the corrections commit lands.
     TRIGGER: read by the corrections implementer and by M0.3 gate implementers. -->

# Fable L6 review — rk gate contracts (commit e17bbe8)

Verdict: **APPROVE-WITH-CORRECTIONS**. Mandatory corrections: F1–F6.
Reviewer verified all 69 checks against cited AISM script lines (provenance and linker
clause-by-clause), ran three read-only experiments against AISM git history, verified
all five deviations pass/fail-neutral, verified all ten [PLAN] fixtures and ledger
totals (71 ✓).

## Mandatory corrections

- **F1 [Major]** Provenance claim-source check (contract check 3) omits the token
  filters: only tokens fullmatching `[A-Z0-9][A-Z0-9-]*` with len ≥ 2 are candidates
  (check-provenance.py:76-81,276-279); mixed/lowercase tokens are never flagged (by
  design). A literal port floods false ERRORs on AISM HEAD. Add both conditions with
  citations.
- **F2 [Major]** `tab:status` table grammar is unspecified. Add to provenance Inputs
  (cite check-provenance.py:204-225): body = text before `\label{tab:status}` back to
  the last `\midrule`, cut at `\bottomrule`; `%`-comments stripped first; rows split on
  `\\`; columns on unescaped `&`; status cell = column 2 lowercased/stripped; labels =
  every `\Cref`/`\ref` in the row; rows with no labels dropped; exact-string "open"
  comparison; "a consistent row must exist" semantics (296-300).
- **F3 [Major]** Provenance retains a silent-skip false-green surface (empty
  `status_table_rows` when the configured file lacks `\label{tab:status}` or
  `\midrule` → OVERCLAIM checks nothing) and is the only gate with no coverage unit.
  Define coverage line `checked provenance: <N> registry results, <R> claim rows,
  <S> tab:status rows` with S=0 rendered loudly; add fixture provenance-13 (file
  present, label absent → visible `0 status rows scanned`, never silent green).
- **F4 [Major]** Pin the M0.3 historical-parity baseline: **AISM HEAD scripts replayed
  on the historical tree**, findings compared per-gate (check-all.sh short-circuits;
  rk check does not). One sentence in the drift-tolerance section.
- **F5 [Major]** defs `source`/`sha256` are NOT required for kind=cited in AISM —
  check-defs.py:112-118 validates only when present and truthy; a cited shard with
  neither passes silently (and AISM currently has zero real cited shards, so fixtures
  would bake the error in unnoticed). Change column to "validated if present"; record
  the silent-pass-on-absence under Known limitations.
- **F6 [Minor, mandatory]** Specify refs quote extraction: prefer the double-quoted run
  following `VERBATIM` (re.S), else the longest double-quoted run (check-refs.py:63-74);
  only the FIRST `refs/` locus is taken (:114). Fixtures refs-02/03 depend on this.

## Flagged-item rulings

1. Stale ">12/depth>3" in AISM argument/README.md — accept code-over-prose (cap 26, no
   depth); bd issue to fix AISM README at M0.5 cutover.
2. defs INDEX staleness asymmetry — real (check-defs.py only writes, never compares);
   defer to M2.6 freshness gate; bd issue.
3. **MIN_RUN=40 paraphrase hole — fix in contract now.** Zero refs-quote externals
   exist anywhere in AISM history, so tightening has provably zero parity cost. New
   rule: PASS requires the whole normalized quote to match; a ≥40-char partial-run
   match becomes FAIL with matched-run length reported. Add fixture refs-07 (≥40-char
   verbatim core wrapped in paraphrase ⇒ FAIL). Record in the deviation: `...`-spliced
   quotes would fail whole-match; none exist; bd issue for a future splice grammar.
4. skip_import bare-regex trust — real gap, no incident, tightening NOT parity-free
   (all 23 HEAD externals travel this path); defer post-M0.5; bd issue.
5. Substring-search gameability (runs/shards) — accept as-is; deliberate looseness,
   zero incidents, tightening has false-red parity cost; M2.6 obsoletes shards mirrors.

## Optional minors (apply — all doc-only, cheap)

- **F7** 19/19 incident narrative: the historical skips were import/no-quote; the
  absent-payload→skip hole was found by the 2026-07-10 audit, not an observed event;
  note that refs checks 2–4 have never executed on production AISM data (corpus is
  their only exercise).
- **F8** check-all.sh also runs gen-current-pointer.py (CURRENT.md freshness) and the
  test loop; rk check deliberately excludes both — add an out-of-scope note so M0.5
  divergence bookkeeping excludes them deliberately.
- **F9** runs gate: say "repo-root `INDEX.md`" (check-runs.py:28), not "top level".
- **F10** Incident (a) rename direction inverted: ledger was renumbered TO
  13_discussion.tex; the hardcode pointed at the OLD name (worklog.md:270-272).
- **F11** shards headers: duplicates within a file are first-wins (head -n 1), never an
  error; only SHARD-SUMMARY's 2–3 count is enforced — soften "exactly 1".
- **F12** argument.py crashes (KeyError) on a lemma shard lacking `id:` (parse_registry
  never defaults it); all AISM shards carry id so parity unaffected; rk specifies an
  ERROR finding, recorded as a trigger-preserving deviation (crash → finding), and a
  fixture (linker: missing-id shard → ERROR, not crash).

## Do-not-lose (for M0.3 implementers)

- Single-constant brittleness property (the mechanism, not the number 26); boundary
  pinned by fixtures linker-17/18 (matches AISM test_argument.py:107-108).
- No-short-circuit composition verified safe: every script re-parses its own inputs,
  tolerates missing dirs, none consumes another gate's output.
- Leaked-None deviation is the model for message-only fixes (trigger-identical).
- Golden non-error fixtures (defs-13, linker-18/19/20, refs-04, runs-07, shards-11)
  guard false-reds; linker-20's pre-bdf6800 byte-identity probe makes the routes:
  tolerance testable.

---

## Addendum (2026-07-17, post-review — TJO premise correction)

TJO directive: **AISM is not a canonical golden master** — it kind-of-works with many
problems. Incident history is data; script behavior is not the spec. This review's
verification work (citation audit, deviation neutrality, empirical history scans)
remains valid as *characterization of prior art*. What changes:

- "Parity cost" is no longer a valid veto on strictness. Affected rulings:
  - **F5 is reversed**: `source`/`sha256` become REQUIRED for `kind: cited` shards
    (zero cost — AISM has no cited shards; Layer 0's purpose is provenanced
    definitions). Contract amendment queued as M0.7.
  - **Rulings #4 (skip_import) and #5 (substring checks)**: outcomes stand, rationales
    reframed — #4 defers on architectural grounds (needs a registry join the refs gate
    lacks), #5 because M2.6 obsoletes the shards mirrors; not because AISM's current
    behavior is authoritative.
  - **F4's historical baseline** is repurposed: not a parity bar but the definition of
    the M0.3 robustness run (no crashes/floods on older schemas, divergences triaged).
- M0.3/M0.5 acceptance switches from parity/zero-divergence to **divergence triage**
  (rk-stricter-intended / rk-bug / ambiguous; zero rk-bug is the bar).
- These re-rulings await Fable ratification at the M0.3 boundary review (L6).

CLAUDE.md L5 amended accordingly (same date). PRD gains decision D9.
