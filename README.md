<!-- ROLE: repository front page. AUTHORED. UPDATE POLICY: edited when the tool's
     surface or status materially changes. TRIGGER: milestone acceptance / repo events. -->

# rk

rk is a research-automation tool for mathematical and theoretical research
campaigns: a single TypeScript/Bun CLI that scaffolds a campaign repository,
enforces validity gates over its artifacts, projects a claim graph out of the
campaign's ground-truth tools, renders an honest status site, and drives
cross-vendor prove/verify worker sessions over a proof ledger.

It is the extraction, as one general-purpose tool, of workflow machinery that
evolved across several live research campaigns. Design intent: useful to any
academic running a claims-and-proofs campaign, not shaped around any single
project. Prose artifacts stay the researcher's; rk guards their validity and
does the bookkeeping.

## What it does today

- `rk init` / `rk upgrade` — scaffold and version a campaign repository
  (definitions, argument shards, references, runs, report mirrors).
- `rk check` — eight validity gates over the campaign tree (config, defs,
  linker/argument, refs, provenance, runs, shards, freshness), each backed by a
  red corpus of 123 fixtures drawn from real incidents. Gates report coverage
  ("checked N/N"); a silent skip is a bug by definition.
- `rk graph` — a typed claim-graph projection joining the campaign's proof
  ledger (af), exploration frontier (fr), and issue tracker (bd) exports;
  critical-path and taint queries.
- `rk render` — a static status site (dashboard, DAG, node views, graveyard
  with death certificates, run gallery) that never overstates: effective
  status, conflicts, and staleness are computed, not declared.
- `rk verify` — the hard-tier driver: dispatches real prover/verifier model
  turns (Claude and Codex backends) over an af proof ledger, per node,
  cross-vendor enforced (prover and verifier must be different model
  families), with content-hash-bound verdicts, campaign token caps,
  churn/balloon guards, and a full usage/accounting report (`rk verify
  --report --baseline`).

## Status

Pre-1.0, under active development. Milestones M1–M2 accepted; M3 (worker
protocol + live driver) is functionally complete: the full cross-vendor
prove/verify cycle has converged live on real lemmas (fresh workspaces
re-proved from scratch, verdict parity with the original validations, both
worker pairings). The SC4 cost baseline (M3.5) is 4/6 runs banked; see
`HANDOFF.md` for exact current state and `docs/worklog.md` for the narrative.

## Install

Requires [Bun](https://bun.sh) 1.3+ to build. Zero runtime dependencies
(`package.json` `dependencies` is `{}` by law; `dagre` is a *build-time-only*
devDependency, vendored into the compiled binary).

```
git clone https://github.com/tobiasosborne/rk.git && cd rk
make install              # bun install && bun run build, then copies dist/rk onto PATH
rk doctor                 # check which of af/fr/bd are present and what each one gates
```

`make install` installs **rk only**. It picks `/usr/local/bin` if writable, else
`~/.local/bin` (override with `RK_INSTALL_DIR=<dir> make install`; see
`scripts/install.sh`). If neither is on your `PATH`, the script says so.

Without `make`, the equivalent by hand is:

```
bun install && bun run build     # -> dist/rk
cp dist/rk ~/.local/bin/rk       # or anywhere on PATH
```

### The three sibling binaries

rk orchestrates a campaign but does not implement proof verification, the
explore/exploit controller, or issue tracking itself — those are separate
tools, each its own repo. `rk init`'s stamped hooks and `rk verify` expect all
three; **none of them is required to build rk or run `rk init` / `rk check` /
`rk render`** on their own, and `rk init` degrades gracefully (warns and skips)
when `fr` or `bd` is missing. What's missing costs you:

| binary | what it's for | repo | required for |
|---|---|---|---|
| **af** (min 0.1.6) | the proof-ledger / validity kernel — adversarial prove/verify over a proof tree | [github.com/tobiasosborne/vibefeld](https://github.com/tobiasosborne/vibefeld) — `./scripts/build.sh install` | `rk verify` (the hard-tier driver); without it, `rk verify --af <id>` reports "declares no workspace: — nothing to verify" and the `rk graph` critical-path/taint views see no proof state |
| **fr** (min 0.2.1) | the explore/exploit controller — a stop-loss on tunnel-visioning subagents | [github.com/tobiasosborne/frontier](https://github.com/tobiasosborne/frontier) — `bun install && bun run install:global` | the stamped `.claude/settings.json` hooks (`fr board`, `fr turn-begin`, `fr check` fire on every SessionStart/prompt/Stop); without it every turn of an orchestrator session hits a "command not found" from the hook, though `rk init` itself only warns and continues |
| **bd** (min 1.0.0) | issue tracking (beads) — cross-session task state | [github.com/steveyegge/beads](https://github.com/steveyegge/beads) — `brew install beads` or `npm install -g @beads/bd` | the stamped `bd prime` hooks (SessionStart, PreCompact); same "command not found" cost as `fr` if absent |

`rk doctor` probes all three against `rk.compat.json`'s pinned `{min, tested}`
versions and tells you exactly which is missing, stale, or untested — run it
right after `make install` to see your real starting state; do not assume the
table above is still current.

For real (non-`--dry-run`) `rk verify` dispatch, the `claude` and/or `codex`
CLIs must also be on PATH (cross-vendor: prover and verifier need different
model families).

## Build and test

```
bun test                 # unit + property tests
bun run selftest         # red corpus + purity grep + compat checks
bun run build             # -> dist/rk (same as `bun build --compile src/cli.ts --outfile dist/rk`)
```

## Layout

```
src/types.ts    shared contracts          src/gates/    PURE gate logic
src/graph/      PURE projection/joins     src/render/   html generation
src/drive/      workers, batch, verdicts  src/refs/     fetch/hash/quote
src/scaffold/   init/upgrade templates    src/corpus/   fixture discovery
corpus/         red fixtures (123)        schemas/      versioned JSON schemas
docs/           gate contracts, memos, reviews, worklog
```

Pure cores (`src/gates`, `src/graph`, render cores) perform no IO and read no
clock — enforced by grep in the selftest. All IO lives at the edges.

## How this repo is run

Development follows `CLAUDE.md`: red-green TDD with mutation checks, red
corpus first for every gate, tiered adversarial review for validity-semantic
changes, atomic path-scoped commits, and a rewritten `HANDOFF.md` at every
session close. `docs/gate-contracts.md` is the normative gate specification.
