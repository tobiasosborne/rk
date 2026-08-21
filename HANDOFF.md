<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-21 session close — three Tier A items landed; campaign-E phase 0a triage complete; rk-0sj6 ruled)

TJO directive this session (in-conversation): orchestrate campaign E; lanes are codex
gpt-5.6-sol xhigh ONLY, otherwise the orchestrator works serially itself. No opus, no sonnet.

Landed on master this session (all pushed):

| item | what | corpus |
|---|---|---|
| rk-nsex CLOSED | Gate 3 Check 11 (extraction records) + Check 12 (card->shard join), `cards-v1`, `rk render cards`, schemas extraction-record/card-review v1 | 176 -> 201 |
| rk-5lzf CLOSED | convention profile + predecessor chain, notation shards, recursive `definitions/`, Gate 9, `notation-macros`, `rk render macros` | 201 -> 230 |
| rk-8805 CLOSED | signature schema v1, Gate 2 Check 17 route-scoped entailment (intervals/posets, fixed point), graph v3, pure bite core (unwired until Gate C) | 230 -> 246 |
| rk-zmg0 CLOSED | phase matrix: Checks 11/12, Gate 9, Check 17 STRUCTURAL | — |
| rk-tmzl CLOSED | freshness.ts split move-only into four shards | — |
| `rk refs triage` NEW | `--auto` (seed links + title keywords), `--redo-auto`, `--apply <tsv>`, `--redo-prefix`; ledger writer escapes `\|`/newlines; both ledger writers REFUSE to rewrite a partially parsed table | — (Tier C, 22 tests) |

Each Tier A merge was verified mechanically (gates on the branch, two mutation spot-checks per
branch, gates on master); verification tables are appended to `docs/reviews/2026-08-20-rk-*-tierA-codex.md`.
No re-review (anti-Zeno). Residuals for the NEXT milestone review: rk-8805's adoption gate on
`kind-status-incoherent`; rk-nsex's range-extent heuristic vs sentence-boundary truncation; bite's
lexical spectator test; rk-wv3h / rk-vy2v (nsex follow-ups). Beads filed: rk-rz74 re-file
(provenance-existence gate, P1), two Tier C (refs `.gitignore` stamp, `arXiv:` locator case).

Incident this session: `rk refs triage --auto`'s first run parsed 1478 of 6437 ledger rows (a title
containing `|`) and wrote the ledger back truncated; recovered from git; writer/parser fixed and
both writers now refuse partial-parse rewrites (fixtures in test/refs-snowball-triage.test.ts).

## Campaign E (authoritative: `../rk-campaign-E/HANDOFF.md`; bundled in `vendor/`)

Done this session: profile BLESSED (18 classes); notation register 18/18, 31/31 translations
byte-verified, `macros.tex` adopted; phase 0b PILOT record (ABN 2206.13228 Theorem 1) VALID after
3 codex review rounds, card adopted, `records: "required"`; Semantic Scholar key received (stored
`~/.config/rk/env`, 1 req/s; rk spaces 3.5 s) -> depth-1 closure COMPLETE (6436 papers); triage
funnel: `rk refs triage --auto` then two-vote LLM triage (openrouter `stealth/ox-alpha` via `pi -p
--thinking low|minimal`, free, ~80 min, no rate limit; merge rule in|context with >= 5 seed links
-> in, else weaker) -> ledger **in 628 / context 725 / out 4933 / seed 149**. Depth 2 deliberately
NOT run (diminishing returns; dependency-closure exception covers prerequisites).

TJO rulings 2026-08-21: D1 north star = QMA-hard under QUANTUM polynomial-time reductions (campaign
PRD decision 7; `contract:` restated); D7 closed as moot (decision 8); **rk-0sj6 = option (a)**.

## Current work — rk-0sj6 option (a) (NEXT rk task, Tier A, not started)

`schemas/convention-profile.v2.json`: `tracked_classes[].blessed` becomes `string | string[]`
(min 1, unique, first = canonical); loader reads v1 and v2 (internal `blessed: string[]`);
`blessedSymbolIndex` maps every macro; Gate 9 `notation: complete` = exactly one shard per blessed
macro per class (coverage `registered R/N`); `defs-notation` `symbol-not-blessed-for-class` =
symbol not in the class's list; `profile-history` adds `blessed-removed-without-bump`;
`macros.tex` unchanged. Red fixtures: v2 golden (2 macros, 2 shards); second macro in prose
unregistered; complete with one shard missing; macro removed without bump; v1 profiles keep
passing. Implement on a branch (orchestrator, serial), codex xhigh review, merge. Full design in
the bead comment (`bd show rk-0sj6`). Then campaign: `qpcp.v2.json` (predecessor chain) carrying
the draft's ~55 further macros, `notation: draft` until their shards exist.

## Next steps

1. rk-0sj6 (a) as above.
2. Campaign E: acquire the 628 `in` papers (`rk refs add arxiv:<id>`; S2-only ids need DOI/title
   resolution); records for the ~40 most-linked `in` papers (author -> `rk check` -> codex review
   -> repair -> `rk render cards`), Layer 0 shards for the objects they name; then phase 1
   (`signatures: optional` -> `required`). Roster for authoring: TJO queue item 2.
3. Unchanged queue: rk-t69x, rk-yic3, rk-ptx0/rk-lmtr (Gates C/D — hard prerequisite for
   campaign-E phase 3), rk-23pr, rk-cz1h, rk-4w2y wave, rk-rz74.

## TJO decision queue

1. Seed set ratification: the triage `in` set (628) is the de-facto seed v1 — ratify or amend.
2. Roster for records at scale: Fable-authored / codex-reviewed (this session) vs opus authors.
3. Carried: rk-cz1h memo §6.1; rk-23pr ratification; rk-mief; window-5 waiver; campaign codas;
   campaign-D frozen-P1 erratum; promotion permission-hold FYI.

## Key facts

- **Corpus count on master is 246**; `bun test` 3575; selftest green.
- Codex lanes: `codex exec -s workspace-write -c model_reasoning_effort="xhigh" -o <file>
  "<brief>" < /dev/null`, tracked background task, `timeout 7200`. Lanes in a git WORKTREE cannot
  commit (`.git` outside the sandbox); lanes in the campaign repo committed in 1 of 5 runs — plan
  on committing their verified trees yourself (the campaign hook runs `rk check`).
- Cheap classifier that worked: `pi -p --provider openrouter --model stealth/ox-alpha --thinking
  low --no-tools --no-session --no-context-files --no-extensions --no-skills --no-prompt-templates
  "<prompt>"` (~1 row/s on 60-row batches; default thinking level HANGS; never run two calls in
  parallel). Driver: `../rk-campaign-E/scripts/triage-llm.py` (+ `--remerge`).
- `bd dolt push` has no remote configured here; beads travel with git.
- Merged worktrees removed; `rk` on PATH is a symlink to `dist/rk`, rebuilt at every commit.
- Campaign-D bd is EMPTY on this device. `make refresh-bundles` must run from the rk checkout
  (`make -C /home/tobiasosborne/Projects/rk refresh-bundles`); bundles D and E.

## Governance (standing)

L1/L2 never relaxed; 246/246 + selftest green on master. D1-D9 + A1 stand. bd for all tracking.
Campaigns: A wound down, B closed, C between windows, D restored here (audit due at its next
close, counter 9/10), E session 2b closed (audit counter 3/10).
