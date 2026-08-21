<!-- ROLE: the claims ledger, the join key between report, reviews and provenance.
     UPDATE POLICY: orchestrator-only; rewritten in place per wave. Workers never edit it
     (`make guard` checks). TRIGGER: any claim created, promoted, demoted, refuted. -->

# CLAIMS

Columns.
`id` kebab, prefixed by kind: def- lem- prop- thm- cor- conj- obs- asm- cit-.
`kind` def | lemma | prop | thm | cor | conj | obs | assumption | cited.
`status` (what THIS row asserts): def: quoted | stipulated · assumption: assumed · cited: cited ·
results: proved | sketched | numerical | conjectured | open | refuted.
`deps` the hypotheses and results the proof uses: `a; b` = both needed, `a | b` = either
suffices. An omitted dependency is an overclaim; the verifier's PREMISES line is diffed
against this cell.
`label` the tex label (prefix must match kind: def: lem: prop: thm: cor: conj: obs: asm: cit:).
`statement` one line, no wrapping (part of the review receipt).
`proof` path of the artifact a reviewer saw (proof, or witness for refuted); must exist; hashed into the receipt
together with the theorem text printed in report/ — write the statement into the report before `make receipt`.
`author` `<family>:<model>` of whoever wrote the proof.
`review` (required for proved AND refuted) `<family>:<model> <date> notes/reviews/<file>`; the reviewer's
family must differ from `author` unless `single-family` is added (printed); the note must contain
`RECEIPT <id> <hash>` (from `python3 scripts/check.py --receipt <id>`), `PREMISES <id>: ...`,
`VERDICT <id>: VALID`. Add `single-family` when no second family was available.
`note` free text.

Effective status (what the report prints) is derived: a dependency that is refuted/open/
conjectured makes the claim `unsupported`; an `assumed` dependency makes it
`<status>-conditional`; `numerical` is a ceiling (`numerical-conditional` when an assumption is below); a `sketched`
dependency caps a proof at `sketched`. `make regen` writes the banner; `\claimstatus{label}{status}` must print exactly
the effective status.

| id | kind | status | deps | label | statement | proof | author | review | note |
|---|---|---|---|---|---|---|---|---|---|
| thm-main | thm | open | - | - | the question from BRIEF.md as one sentence | - | - | - | - |
