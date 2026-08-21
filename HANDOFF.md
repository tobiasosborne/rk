<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-21 session close — three campaign-E Tier A items LANDED; profile blessed; register complete; first reviewed record)

TJO directive this session (in-conversation): orchestrate campaign E; lanes are codex
gpt-5.6-sol xhigh ONLY, otherwise the orchestrator works serially itself. No opus, no sonnet.

Landed on master this session (all pushed, master `3dfc961`+):

| bead | what | repair wave | corpus |
|---|---|---|---|
| rk-nsex CLOSED | Gate 3 Check 11 (extraction records) + Check 12 (card->shard join), `cards-v1` generator, `rk render cards`, schemas extraction-record/card-review v1 | BL1-BL6 + FU2/FU4 repaired by a codex lane; FU1/FU3 filed as rk-wv3h / rk-vy2v | 176 -> 201 |
| rk-5lzf CLOSED | convention profile schema + predecessor chain, notation shards (`shard_type: notation`), recursive `definitions/` discovery, Gate 9 lexical check, `notation-macros` generator, `rk render macros` | B1-B6 + follow-ups repaired by a codex lane (its sandbox could not write the worktree's git metadata; the orchestrator committed its verified tree as 06d4d82) | 201 -> 230 |
| rk-8805 CLOSED | signature schema v1 (fenced block), Gate 2 Check 17 route-scoped entailment with interval/poset lattices and fixed-point routes, graph schema v3, pure bite core (`src/graph/bite.ts`, unwired until Gate C) | B1-B6 + follow-ups repaired by a codex lane per the bead's repair plan | 230 -> 246 |

Each merge was verified mechanically (gates on the branch, two mutation spot-checks per branch,
gates again on master) and the verification table appended to the review record under
`docs/reviews/2026-08-20-rk-*-tierA-codex.md`. No re-review (anti-Zeno). rk-zmg0 (phase-matrix
amendment) CLOSED: Checks 11/12, Gate 9, Check 17 are all STRUCTURAL with survival fixtures.

Integration rulings (recorded in the merge commits and review records): the two lanes' colliding
`freshness-12` -> rk-5lzf's macros fixture is `freshness-16`; `adoptGeneratedEntry` lives in
`src/cli/generated-manifest.ts` (4-arg), `rk render cards` adapts to it; the `notation-macros`
generator returns `PureRegenResult`; config validation lives in `src/gates/config-validation.ts`
and carries `records` (nsex), `signatures` + `conventionProfile` (8805/5lzf); the snapshot walker
is `src/store/snapshot-include.ts` over rk-5lzf's recursive rule table `snapshot-rules.ts`.

Debt created by the integration: `src/gates/freshness.ts` is 558 lines (cap 280) — bead rk-tmzl
(move-only split, Tier B). Pre-existing over-cap: provenance 328, shards 312, refs 296,
drive/driver-af 305.

Residual for the NEXT milestone review (not re-reviewed now, per the cap): rk-8805's adoption
gate on `kind-status-incoherent` (ERROR only once `signatures` is `optional|required`); rk-nsex's
range-extent heuristic against sentence-boundary truncation; bite's lexical spectator test.

Also this session: rk-rz74 re-filed (provenance-existence gate, P1 bug — bead id in `bd list`);
Tier C beads filed for the refs payload `.gitignore` stamp and `arXiv:` locator case.

## Current work

Campaign E (`../rk-campaign-E/HANDOFF.md` is authoritative). Done this session, all committed
there and bundled in `vendor/`: profile BLESSED (`.rk/conventions/qpcp.v1.json`, 18 classes);
notation register 18/18 with 31/31 byte-verified translations, `macros.tex` adopted; phase 0b
PILOT record (ABN 2206.13228 Theorem 1) VALID after 3 codex review rounds (5+2+0 findings), card
adopted, `records: "required"`; depth-1 closure 41 -> 66/149 cached (stopped at close, resumable).
Gap surfaced: rk-0sj6 — convention-profile schema v1 admits ONE blessed macro per class; the
draft's other ~55 macros cannot be registered or enforced, and the pilot record had to paraphrase
`\Theta`/`\Omega`/`\psi`. TJO decision (recommend `blessed: string[]`, schema v2, Tier A).

## Next steps

1. rk-0sj6 ruling, then (if (a)) schema v2 `blessed: string[]` + predecessor-chain fixture + Gate 9
   canonical-shard rule per macro — Tier A, codex xhigh review.
2. Campaign E next steps per its HANDOFF: resume closure; records at scale (author -> codex
   review -> repair -> card); Layer 0 shards; then `signatures: optional`.
3. rk side: rk-tmzl split; rk-wv3h / rk-vy2v at the next milestone review.
4. Unchanged queue: rk-t69x, rk-yic3, rk-ptx0/rk-lmtr (Gates C/D — hard prerequisite for
   campaign-E phase 3), rk-23pr, rk-cz1h, rk-4w2y wave, rk-rz74 (re-filed).
5. Bundles refreshed at close (campaign E @ 22f3405).

## TJO decision queue

1. Campaign E D1: north-star reduction class — Karp (in force) vs AAV's quantum poly-time.
2. Campaign E D7: Gate 9 exemption for settled `contract:` lines (likely moot as built).
3. Semantic Scholar API key for the closure crawl.
4. Roster: with opus/sonnet excluded, extraction records are Fable-authored / codex-reviewed
   (cross-vendor holds; "zero Fable workers" from the 2026-08-20 roster does not).
5. Carried: rk-cz1h memo §6.1; rk-23pr ratification; rk-mief; window-5 waiver; campaign codas;
   campaign-D frozen-P1 erratum; promotion permission-hold FYI.

## Key facts

- **Corpus count on master is 246** (12 config + 29 defs + 7 notation + 62 linker + 43 refs +
  24 provenance + 10 runs + 15 report-shards + 16 freshness + 28 reward); `bun test` 3545.
- Codex lanes: `codex exec -s workspace-write -c model_reasoning_effort="xhigh" -o <file>
  "<brief>" < /dev/null`, tracked background task, `timeout 7200`. A lane in a git WORKTREE
  cannot commit (its `.git` file points outside the sandbox) — either commit its verified tree
  yourself or run the lane on a branch in the main checkout. Lanes in a campaign repo commit fine.
- `bd dolt push` has no remote configured here (prints help); beads travel with git.
- Merged worktrees removed; branches `worktree-agent-a9f0…/a541…/a642…` remain (merged).
- `rk` on PATH is a symlink to `dist/rk`; rebuilt at 3dfc961.
- Campaign-D bd is EMPTY on this device (dolt state never bundled). `make refresh-bundles`
  bundles D and E.

## Governance (standing)

L1/L2 never relaxed; 246/246 + selftest green on master. D1-D9 + A1 stand. bd for all tracking.
Campaigns: A wound down, B closed, C between windows, D restored here (audit due at its next
close, counter 9/10), E session 2 in progress (audit counter 1/10 at session-1 close).
