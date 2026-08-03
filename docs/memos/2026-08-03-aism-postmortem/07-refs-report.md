<!-- ROLE: raw postmortem evidence (Opus subagent report, banked verbatim).
     UPDATE-POLICY: frozen historical record; never edit.
     TRIGGER: consulted from docs/memos/2026-08-03-aism-bitter-lesson-snapshot.md -->

# AISM postmortem — literature/reference layer + report assembly

All paths under `almost-idempotent-stochastic-maps/`. Numbers come from running the repo's own audit scripts in non-mutating mode plus ad-hoc read-only Python.

## Refs data model as-is

**Shape.** `refs/<source-id>/<payload files>` + one tracked manifest triple:
- `refs/manifest/SOURCES.md` — human registry: source-id, full citation, locator, retrieval date, local path, key-file sha256-16, and a **role** sentence saying which registry rows the source underwrites.
- `refs/manifest/checksums.sha256` — 23 rows, authoritative hashes.
- `refs/manifest/sources.lock.json` — per-file **reconstruction recipe**: `fetch: {kind: arxiv-eprint|arxiv-eprint-member|url, …}` or `fetch: null` + a note routing to a content-addressed cache `$EXTPROP_REFS_CACHE/<sha256>`.

**Payloads are gitignored** (only the manifest triple is tracked). Provenance is auditable from a clean checkout; bytes are not. `sha256sum -c` → **23/23 OK**; manifest rows and files on disk in exact bijection.

**Ten sources, three acquisition classes**, all recorded explicitly:
1. arXiv e-prints (3 ids), byte-verified against the official e-print.
2. Open-access URLs with the exact URL pinned (incl. a note that the Project Euclid slug is Incapsula-blocked and the AMS URL serves byte-identical content).
3. Copyright/cache-only (`fetch: null`), acquisition route recorded ("TIB institutional access 2026-07-26", "user-supplied scanned copy").

**Text extraction is a second-class citizen, and honestly labelled as such.** Every `.txt` beside a `.pdf` is `fetch: null` with note "local `pdftotext -layout` extraction (greppable loci; byte-quote against this `.txt`)". Munkres: "per-page tesseract OCR (400dpi, psm 3) … typewriter-era scan, superscripts garble … Thm 10.6 statement visually confirmed against the p.108 page image". The *quoting ground truth* is a lossy derivative of the real ground truth, and the campaign knows it.

**Staging.** `refs-staging/` is untracked scratch with `ACQUIRED.md` as an item-by-item log: per item, source URL tried, SHA256, file size, a **positive extraction test**, and explicit `Status: FAILED` entries listing every route tried. Promotion is *by demand*, not by acquisition: 12 staged PDFs → 10 promoted source-ids. Because staging is untracked, the log was snapshotted into a tracked doc to survive. Discipline is real but *manual* — no promote script; the promotion event is three hand-written manifest rows.

## Citation practice in proofs (sampled evidence)

**Three distinct citation modalities, with three different levels of enforcement.**

**(1) af externals — mechanically byte-checked.** `proofs/<id>/externals/<hash>.json` with `{id, name, source, content_hash, created}`. `source` is a **freeform string** conventionally shaped `refs/<path>:<lines> VERBATIM: "<quote>"`. `check-refs.py` regex-extracts locus and quote, normalizes (drop `*`, collapse whitespace; LaTeX and `$` kept), requires the quote — or the longest ≥40-char contiguous run — to be a substring of the refs file.

Live audit: **959 externals, 0 failed, 932 skipped → 27 PASS, 5 WARN, 927 `skip_import`**. The ratio is the headline: **97% of "citations" are internal imports of previously validated lemmas**, 2.8% are external literature quotes, and those 27 carry the entire external surface of a 169-result rigorous campaign.

**(2) Export prose → external name.** Only 2 of 171 `export.md` files mention a `refs/` path; 17 name `GT-*` externals in prose. Dangling-citation sweep: **27 resolved, 0 dangling** — binding enforced by af itself ("Creation of this child succeeds only after AF validates that the cited name resolves to a registered external in this workspace").

**(3) Cited definitions — NOT byte-checked.** 14 shards in `definitions/` carry `kind: cited` + `source:` + `locus:` + `sha256:` and a fenced "Byte-verbatim source text" block. `check-defs.py` only verifies the source-id and hash prefix appear in `checksums.sha256`; it never opens the payload. Byte-checked all 14 by hand: **11 exact**, 3 explained and benign (concatenated displays, explicit `[...]` elision). No fabrication, but the un-gated path is only clean by author discipline.

## Report assembly frictions

`report/` is a 51-shard LaTeX lab-book, 193 pages, master-purity-gated, ledger-gated by `check-provenance.py` (**0 errors, 291 warnings**, all the `anchor` category).

**F1 — the ledger is 5× wider than the paper.** 364 registry results, 73 result labels in `sections/`. `report/UNWIRED.md` whitelists exactly **291** ids as deliberately unanchored. Rendering forced the campaign to name, one id at a time, what it was *not* going to say.

**F2 — five wiring files must move in lockstep per shard.** `main.tex` include list, `README.md` order table, `SHARD_CATALOG.md`, `PROVENANCE.md` rows, `UNWIRED.md` deletions. Two gated by string-equality; three semantic.

**F3 — the ordering model broke under append-only growth.** `report/README.md:55-111` is ~55 lines of stacked HTML-comment ADDENDA ("22-24 inserted; status/outlook renumbered 22→25", "49b takes a slot without renumbering, exactly as 00a does"). Include order ≠ file-number order. The data model had a filename-number where it needed an explicit order edge.

**F4 — three generated layers appeared, each after a hand-written version failed.** `generated/defs/`, `generated/dag/`, `generated/stats/`. Rationale verbatim from `gen-report-defs.py:6-13`: "The naive fix — hand-writing the definitions into a report shard — would create a SECOND statement of every term and is exactly the drift L2 forbids."

**F5 — the stats layer had to split extract from render to have a gate at all.** A byte-freshness gate over a live-mining generator "would be permanently red, because the commit landing the regenerated tables changes their inputs again". Only *render* is gated; the numbers "go stale silently by design", with a drift advisory and printed snapshot timestamp.

**F6 — no bibliography.** `report/references.bib` contains three entries inherited from a sibling repo, none an AISM source; zero `\cite` in the whole report. Inline literature citation exists on exactly 4 hand-typed lines. The refs registry and the paper's bibliography are disjoint universes.

**F7 — build-artifact churn.** 43 tracked `report/sections/*.aux` rebuilt on every compile; unresolved policy bead open.

## Hallucination/staleness incidents

**I1 — the gate that verified nothing (fixed).** Remediation plan: "today the fabrication gate verifies nothing — 19/19 externals skip — and false-greens on a clean checkout." Fix: an external claiming a `refs/` VERBATIM quote whose payload is absent is now a hard FAIL — "a green run must never mean 'we couldn't look'."

**I2 — wrong-passage citation that PASSED the gate.** `proofs/lem-topology-quotient-manifold/externals/` holds three externals for one theorem: the first (`GT-lee-2ed-thm-21.10`) quotes text that actually sits at **line 25202**, not Theorem 21.10 at the recorded locus 25748 — **check-refs PASSES it** because the locus is advisory and the gate only asks whether the string occurs *anywhere*. Then a `-corrected` external with the real text; then a dots→hyphens **alias** of it because af's citation token syntax could not carry the `.`. The bad external is still registered and still green. Name ↔ locus ↔ quote is prose-trust; only quote ⊆ file is mechanical.

**I3 — five externals silently exempt from the gate, today.** `GT-kitaev-def-delta-homomorphism` in five `lem-maincb-*` workspaces (created 2026-08-02, the newest wave) writes its source with **no `refs/` prefix and no double quotes** — both regexes miss, so `check-refs` returns `skip_noquote` (WARN, not FAIL). Checked by hand: the 820-char quote **is** exact. Substance fine; the freeform-string schema let five of the campaign's newest citations out of the only gate that would have caught a fabrication.

**I4 — line loci are tool-ambiguous.** `pdftotext` output contains form feeds (558 before line 25748 in the Lee `.txt`). `grep -n`/`wc -l` do not count `\x0c` as a line break; Python's `splitlines()` does. The same recorded locus resolves to two different passages ~546 lines apart depending on the reader. Hit live during this audit.

**I5 — an actual hallucination, caught by the sweep.** `docs/lit-review/2026-07-04-literature-sweep.md:46-47`: a search engine claimed Kitaev 2405.02434 was "published in Nature 638 (2025)" — checked against arXiv metadata and **FALSE (hallucination)**. The sweep file's own header carries the standing quarantine: "NOTHING here is byte-matched to `refs/` yet — every claim in this file has repo-status `stated` until a source is pinned."

**I6 — faithful transcription of a wrong upstream framing.** `lem-dual-localization` was carried as "the single genuine gap"; it is a distance tautology. The upstream ingest doc mislabelled it, and the registry inherited the mislabel. Byte-fidelity to a source cannot catch this class.

**I7 — the report prose inventing mathematics.** Hostile prose-vs-export review (`VERDICT-PROSE-W3.md`): **7 VALID / 11**. One shard INVALID for "insert[ing] mathematical counterexamples and challenge history absent from both admissible ground-truth files"; another for global counts "not supported by the registry files" (arithmetic "internally consistent but not registry evidence"). Companion passes: 16/25 and 5/7 — and the fix wave *reintroduced* challenge-history metadata in one shard.

**I8 — a live stale count in the shipped PDF.** `report/sections/41_status_outlook.tex:11` — "The preceding sections reproduce **forty-seven** registry results" (with an internally consistent `% Count derivation:` comment). The report actually reproduces **73**: the 26 Stage-1 results added 07-27→29 were never folded in. No gate checks it — `check-provenance` verifies wiring, never counts. Two of the 73 are *retracted* and typeset as conjectures, so even "73" is not the number a reader wants.

**I9 — clean surfaces, for contrast.** All 73 `\contractquote{…}` blocks byte-identical (whitespace-normalized) to their registry `contract:` line — 73/73, 0 drift (my check; no gate does this). Hash-freshness over the 144-row source registry: OK. 0 undefined references in the final PDF.

## Durable (A)

- **Content-addressed payloads + a reconstruction recipe separated from the bytes.** Hash-pinning is model-independent ground truth; degrades gracefully for copyrighted material (`fetch: null` + cache pointer) instead of pretending. A stronger model does not need this less; it needs it more, because it will cite more, faster.
- **Byte-verbatim quote → local source, machine-checked, with fabrication as the named threat model.** The single highest-value mechanism in the territory and the one a superhuman prover still cannot self-certify: the check is against bytes, not against a judgment. The *normalization design* is durable too — collapse whitespace and markdown emphasis (never load-bearing), keep LaTeX and `$` (fabrications differ in words).
- **"An unverifiable pass is a FAIL."** Absent payload ⇒ hard error. Green must mean "we looked", never "we couldn't look". Coverage reporting belongs to the same principle.
- **Attribution scope carried with the quote.** The best externals name what is *not* imported: "imports ONLY these two printed clauses; no Delta(1) clause, no coassociativity, counit, or antipode"; "proof retained in-source at :1198-1222 (NOT imported)". A cited theorem is a *boundary*, and the boundary is the load-bearing datum.
- **Provenance certifies provenance, not truth** — stated on the page itself: "What this certifies is *provenance*: that the text below is what the source says. It certifies nothing about whether the source's claim is true." Paired with recording *known errors in the source*.
- **Generate every derived view; forbid the second statement.** Counts, indices, DAGs, status tables are projections; a hand-typed projection is a lie with a delay fuse (I8).
- **Rendering "what is deliberately absent" as a first-class, reviewable artifact** (`UNWIRED.md`: unanchored-and-unlisted = hard ERROR). Silence is where drift hides.

## Scaffolding (B)

- **`pdftotext`/OCR `.txt` as the quoting substrate.** Purely an artifact of today's tooling: proofs must carry OCR decoding tables; quotes swallow running headers. A model that reads the PDF/page image directly retires this whole apparatus.
- **The freeform `source` string + regex extraction.** Convention-encoded structure parsed by two regexes. Works until it doesn't (I3). The fix is a typed field, not a better regex.
- **Line-number loci.** Fragile across extraction tools (I4) and re-extractions. A hash-of-the-quote plus a stable anchor (theorem number, section id) is the durable form.
- **The dotless alias external** — a workaround for a citation-token syntax limitation, which duplicated a payload and left three externals for one theorem.
- **Hostile-LLM prose-fidelity review.** Necessary *because* the report re-narrates the machine-validated tree in hand-written prose. A patch for a missing mechanical link between export and prose, not a permanent institution.
- **Whole-file substring search with `MIN_RUN=40`.** A pragmatic tolerance band; a structured quote (list of contiguous segments, each with its own anchor) needs no such heuristic, and would have caught I2.

## Anti-patterns (C)

- **Locus recorded but never enforced.** "The locus line number is advisory" converts a checkable claim into decoration and directly produced I2: a citation whose *attribution* is wrong while its *bytes* are right, permanently green.
- **Hand-typed counts and rollups in the render** ("forty-seven"; the refuted "36+30+3=69"). Every one is a projection of data the system already holds.
- **Prose re-narration of a machine-checked object with no mechanical tether.** It produced invented counterexamples (I7). The export is the truth; prose that restates it needs either generation or a diff-able binding.
- **A bibliography disconnected from the reference registry.** Two citation systems, neither pointing at the other.
- **Verified-once, never re-verified.** `TRANSCRIPTION-MANIFEST.md` states "every `\contractquote` argument is identical to HEAD" as a past-tense manual verification; no gate re-checks it. It happens to still hold — luck plus discipline, not a property of the system.
- **Retaining a superseded, still-passing citation artifact** next to its `-corrected` replacement, with no supersession field.

## What the render stage teaches the schema

Ranked by how much pain the absence caused:

1. **A citation is a 5-tuple, not a string.** `{source-id, anchor (theorem/section id), locus, quote-segments[], hash-of-source}` — segments explicit so elisions and joined displays are *representable* instead of defeating a contiguity check, and the anchor checked against the locus so I2 fails loudly.
2. **Every number in the document is a query.** The campaign discovered this three times (`generated/dag`, `generated/defs`, `generated/stats`) and still shipped a stale hand-typed count in the same PDF. Rule: no cardinal in prose that is not `\input` from a generated file.
3. **Verdict/status needs an explicit lifecycle field with retraction as a first-class state.** `PROVENANCE.md` encodes retraction/re-validation/taint in *free prose notes*; the renderer then has to decide whether a retracted row counts as "reproduced" — it currently does, silently.
4. **Inclusion/exclusion and reading order are edges, not filenames.** Fifty-five lines of README addenda and `UNWIRED.md`'s 291 rows are what "order" and "scope" look like when the model has neither.
5. **The document needs its own dependency graph.** One shard touches five wiring files; only two of the five links are gated.
6. **Derived data needs a freshness *policy* field, not just a freshness gate.** Gate what is deterministic; timestamp and advise on what is mined. The distinction (`generated | snapshot | authored`) belongs in the schema, not in one script's README.
7. **Bibliography is a projection of the reference registry.** `SOURCES.md` already holds full citation, DOI/arXiv id, year and role; `references.bib` should be generated from it.
8. **Extraction is a versioned transformation, not a file.** `.txt` needs `{tool, version, flags, date, fidelity-class}` and quotes need to record which extraction they were verified against — otherwise a re-extraction silently invalidates 27 byte-matches, and form feeds decide what "line 25748" means.
