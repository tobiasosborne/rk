---
id: sym-invisible
term: invisible nested symbol
shard_type: notation
symbol: \epsilon
class: promise-gap
expansion: \ensuremath{\epsilon}
kind: cited
status: locked
---

**A notation shard one level below `definitions/`, carrying a violation Gate 1 already
owns.** `kind: cited` with neither `source:` nor `sha256:` is the `defs-15` violation
verbatim (checks 8-9, F5 reversed, M0.7). The point of THIS fixture is not the violation —
it is the DEPTH. Before rk-5lzf the snapshot loader's `definitions` include rule was
non-recursive (`src/store/snapshot-load.ts`) and Gate 1 listed one level
(`listDir(snapshot, "definitions")`), so this file was not in the snapshot at all: zero
findings, `checked defs: 0/0 shards`, exit 0. A shard nobody reads carries no violations.
