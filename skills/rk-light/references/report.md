# The report

ROLE: what the 10-30 page pdflatex artifact looks like and why. `make build` compiles it
fresh (a stale PDF is never reused); `make check` keeps it honest; `make release` = fresh build +
check + audit recorded with `CLOSED-AT` equal to the current state hash.

## Shape

```
report/main.tex                 preamble + \claimstatus + generated banner + \input list (no prose)
report/generated/status.tex     GENERATED from CLAIMS.md (make regen); hand-edit = red
report/sections/01_summary.tex  question; answer per headline claim WITH its status and its assumptions; what is open
report/sections/02_setup.tex    conventions (mirror of CONVENTIONS.md), definitions, assumptions, cited facts
report/sections/03..NN          the work, one section per result cluster, <= 250 lines each
                                 ... Dead routes (mirror of DEAD-ROUTES.md) ... Open problems
report/refs.bib                 one entry per PROVENANCE source key, written from the source's own metadata
```

The orchestrator drafts the report itself (one voice; delegate a section only when it
exceeds your budget — briefs.md). Proofs that are load-bearing go in; exploratory
derivations stay in `notes/` and are cited by path.

## Rules the gate enforces

- Every theorem-like environment (`theorem lemma proposition corollary conjecture
  assumption observation definition`) has a `\label` and a CLAIMS row; every non-definition
  one has exactly one `\claimstatus{<label>}{<status>}` equal to the row's EFFECTIVE status.
- Label prefixes match kinds: `def: lem: prop: thm: cor: conj: obs: asm: cit:`.
- Every `cit:` fact and every `quoted` definition has a PROVENANCE row whose quote is in
  the source at the stated locus, and the `cit:` environment's printed text contains that
  quote verbatim.
- Environments are units: one claim label of the matching kind (`theorem` may carry `thm:`
  or `cit:`), the tag inside the environment, no second label.
- The theorem text printed for a `proved`/`refuted` row is part of its review receipt:
  editing it stales the review.
- Every `\cite{key}` is a registered source key and a refs.bib entry.
- No `[UNVERIFIED]` in `report/` at stakes=report.
- Builds with no undefined references/citations, no multiply-defined labels.

## Rules the gate cannot enforce (the audit lenses exist for these)

- Prose may not outrun the tags: "we prove" beside `sketched` is an overclaim; "conditional
  on Assumption~\ref{asm:x}" must accompany every `-conditional` headline.
- A matched quote supports only what it says at that locus — direction, quantifiers,
  hypotheses included.
- "The source does not assume/prove X" is never shown by a quote; cite an absence note.
- Conventions appear once (Section 2) and are used identically everywhere.
- `pdftotext` renderings of equations are not byte-faithful; quote prose, or check the
  rendered page and say so.

## Printable statuses

`proved`, `proved-conditional`, `sketched`, `sketched-conditional`, `numerical`,
`numerical-conditional`, `conjectured`, `open`, `refuted`, `unsupported` (a dependency failed;
the claim is unproved, not false), `assumed`, `cited`.

## Page budget and voice

10-30 pages at 11pt (BRIEF may change it). Under 10 usually means dead routes and open
problems were not written up — they are results. Over 30 usually means `notes/` material
was pasted in. Expert reader, no fluff, numbers and loci, not adjectives.
