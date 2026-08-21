<!-- ROLE: the anti-fabrication ledger. Part 1 registers every local source (path + sha256
     prefix >= 16 hex; the full digest is in sources/manifest.sha256). Part 2 pins every
     external fact the report states to a verbatim quote that `make check` matches
     byte-for-byte (whitespace-normalised, contiguous, whole, inside the stated line window)
     against the local copy.
     UPDATE POLICY: orchestrator-only; rows appended as facts enter the report. Quotes are
     COPIED from the local file, never typed from memory. A quote proves only what it says
     at that locus; "the source does not assume X" is never provable by a quote and needs an
     absence note (references/briefs.md). -->

# PROVENANCE

## Part 1 — sources

`key` is also the BibTeX key (`\cite{key}` must be registered here).

| key | path | sha256 | what |
|---|---|---|---|

## Part 2 — verbatim quotes

`locus` = `<key>:<line>` or `<key>:<from>-<to>` in the file registered for that key; the
quote must occur within that window (a 2-line slack either side). Escape a literal `|` as
`\|`. Every `cit:` label and every `quoted` definition needs a row; any other report label
may have rows for the facts it leans on.

| label | key | locus | quote |
|---|---|---|---|
