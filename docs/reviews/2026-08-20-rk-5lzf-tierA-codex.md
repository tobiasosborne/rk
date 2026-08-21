<!-- ROLE: Tier A review record — codex gpt-5.6-sol xhigh review of the rk-5lzf branch (worktree-agent-a54164d035c96a7d3) vs master. AUTHORED, append-only; the orchestrator appends the repair-wave verification before the branch lands. TRIGGER: read before merging rk-5lzf or at the next milestone review. -->

# Tier A review: rk-5lzf (convention profile, notation shards, Gate 9, recursive discovery) — codex xhigh, 2026-08-20

Verdict on the first implementation: REJECT (6 MAJOR landing-blockers, 6 follow-ups). Disposition: single repair wave by the implementing lane; orchestrator verifies mechanically; no re-review. Branch does not merge until the verification table below is complete.

## Review text (verbatim)

Verdict: **REJECT**. I found six MAJOR validity-semantic blockers.

## Landing-blockers

1. **MAJOR — cited notation meanings are not provenanced.** The plan requires `meaning` plus `source`/`sha256`/anchor, but Gate 1 only applies the legacy shard-level source/hash checks; it requires neither `meaning` nor a locus tying the meaning to source bytes. Translation verification also does not require the quote to contain `theirSymbol`, or `sourceId` to match `sourcePath`. See [campaign plan:150](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md:150), [defs.ts:145](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/defs.ts:145), [defs-notation.ts:65](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/defs-notation.ts:65). These provenance/anchor errors are also non-structural and become WARN in exploration.  
   Repair: require and byte-bind a separate meaning anchor, validate translation quote↔symbol and source-id↔path, make all notation-admission provenance failures structural, and add wrong-meaning/exploration red fixtures.

2. **MAJOR — the profile’s blessed canonical macros are not connected to the register, and class overlap false-greens.** Gate 1 checks only that `class` exists; it never requires `shard.symbol === trackedClass.blessed`, nor exactly one notation shard per blessed symbol. Gate 9 then explicitly clears an overlapping token when registered in *any* claiming class. Thus class X can clear a token used in sense Y. See [defs-notation.ts:102](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/defs-notation.ts:102), [notation.ts:150](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/notation.ts:150), and the test enshrining the false green at [notation.test.ts:99](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/test/gates/notation.test.ts:99).  
   Repair: require exactly one shard whose symbol equals each class’s `blessed`; treat raw source tokens only as source-scoped translations, and require semantic translation review where lexical context cannot identify the intended class.

3. **MAJOR — any fully double-quoted line bypasses Gate 9 without being a real verified quote anchor.** `isQuotedSource` has no access to the preceding line and exempts every line beginning and ending with `"`, including an unpaired shard sentence or quoted `statement_blessed`. See [notation.ts:43](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/notation.ts:43).  
   Repair: exempt only an adjacent strict pointer+quote or translation-row+quote pair; scan unpaired quoted lines and add a bypass fixture.

4. **MAJOR — Gate 9’s class coverage can be vacuous while reporting green.** The denominator is only distinct enforceable tokens actually encountered; `C` is the total profile class count, not classes reached. A class’s entire raw `symbols` list may be unenforceable, its blessed macro may never occur or have a shard, yet it still appears in “C classes.” The skipped-token list is globally aggregated and truncated after five. See [profile.ts:138](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/profile.ts:138) and [notation.ts:194](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/notation.ts:194).  
   Repair: emit per-class registered/enforceable/encountered/skipped counts, list all skipped tokens deterministically, and fail phase-0c completeness when a blessed class has no canonical shard.

5. **MAJOR — class-removal compatibility is readily evaded.** The comparison does nothing for v1, missing predecessors, skipped filename versions, renamed families, or a deleted predecessor; an unparseable predecessor produces only WARN and still returns the current profile for enforcement. See [profile.ts:458](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/profile.ts:458); the missing-predecessor pass is explicitly tested at [profile.test.ts:370](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/test/gates/profile.test.ts:370).  
   Repair: introduce an immutable predecessor/hash-chain or compatibility baseline, require the predecessor for every successor, and fail structurally on missing/unusable history; fixture deletion, skip, rename, and in-place-v1 shrink.

6. **MAJOR — recursive discovery is inconsistent and introduces ambiguous flat IDs.** Gate 1 and `loadDefIds` recurse, but two nested files with the same basename/id are not rejected; the linker collapses them into one `Set` entry. Meanwhile live verification and HTML definitions rendering remain shallow, so a definition Gate 2 resolves can be omitted from the verifier prompt and generated view. See [defs.ts:224](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/defs.ts:224), [linker-defs.ts:20](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/linker-defs.ts:20), [verify-live-io.ts:14](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/cli/verify-live-io.ts:14), and [defs-edge.ts:57](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/render/defs-edge.ts:57).  
   Repair: create one canonical recursive definition reader returning path+id, structurally reject duplicate flat IDs, and reuse it in Gate 1, linker, verifier context, and renderer.

## Follow-ups

- Both new gate files contain literal NUL bytes, so Git reports validity code as binary; use an escaped delimiter. [notation.ts:172](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/notation.ts:172), [defs-notation.ts:161](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/defs-notation.ts:161).
- The hard 280-line cap is violated by new/touched production shards: `profile.ts` 564, `defs.ts` 291, `snapshot-load.ts` 290, and `render.ts` 297. Split before landing.
- Recursive Gate 1 skips `README.md`/`INDEX.md` at any depth, but parses `DAG.md`, `notes.md`, and arbitrary nested Markdown as shards; Gate 9 additionally skips `DAG.md`. Define one shared non-shard policy and fixture it.
- `allowed_translations` is `uniqueItems: true` in the schema but runtime validation accepts duplicates. [schema:118](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/schemas/convention-profile.v1.json:118), [profile.ts:414](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a54164d035c96a7d3/src/gates/profile.ts:414).
- `expansion:` drives generated LaTeX but is absent from the notation contract and unvalidated; bind it to the reviewed notation meaning or define its allowed semantics.
- `HANDOFF.md` was not updated for this committed WP.

## Direct answers

1. Wrong meaning with verified translation anchors: **passes**. Exact duplicate `symbol:` across two shards is caught structurally, and duplicate profile `blessed` macros are rejected, but one wrong meaning or multiple different macros for one class are not.
2. Enforced tokens are exactly profile tokens matching `^\\[A-Za-z]+$`; bare identifiers, control symbols, and compound/braced forms are merely counted. The scanner may separately see macro components such as `\lambda` inside `\lambda_{\min}`. Coverage is not unambiguous per class.
3. Poset cycles/self-loops are caught; chain values must be distinct. Profile shrink comparison is evadable as described above.
4. No pre-existing corpus fixture declared exploration, so applying `applyPhase` changes no pre-existing verdict. The only exploration fixture is new `notation-02`. However new Gate 1 notation-provenance findings still demote in exploration.
5. README/INDEX are skipped recursively; notes are parsed/scanned. A notation shard is intentionally processed by both gates—Gate 1 for register validity, Gate 9 for body usage—so their coverage counts are not additive.
6. L3 purity passed. The new schema has version fields, docs, and fixtures, but its compatibility invariant is not mechanically sound.

Verification: `timeout 120 bun run selftest` passed, including 188/188 corpus fixtures and purity checks. The seven changed pure test files passed 151/151. The full suite could not be meaningfully completed in this read-only environment: temp-directory tests failed with `EROFS` on `/tmp`.

**Final verdict: REJECT.**
## Repair-wave verification (orchestrator, 2026-08-21)

Single repair wave, implemented by a codex gpt-5.6-sol xhigh lane on branch `worktree-agent-a54164d035c96a7d3` (359cba6..06d4d82; the lane's sandbox could not write the worktree's git metadata, so the orchestrator committed its verified working tree as 06d4d82). Verified mechanically on the branch and again on master after merge; no re-review (anti-Zeno rule).

| Finding | Code | Fixtures | Orchestrator check |
|---|---|---|---|
| B1 meaning byte-bound | `src/gates/defs-notation-provenance.ts:15` | defs-23..26 | lane mutation report; fixtures green on master |
| B2 blessed tied to register / overlap false green | `src/gates/defs-notation.ts:130`, `src/gates/notation.ts:196` | defs-27, notation-05 | orchestrator: disabled the `symbol !== blessed` guard -> defs-27 RED; restored |
| B3 quoted-line bypass | `src/gates/notation.ts:58` | notation-06 | lane mutation report |
| B4 vacuous class coverage / `notation: complete` | `src/gates/notation.ts:232` | notation-07 | lane mutation report |
| B5 evadable compat check (predecessor chain) | `src/gates/profile-history.ts:9` | config-08..11 | orchestrator: disabled the hash comparison -> config-11 RED; restored |
| B6 ambiguous recursive ids | `src/gates/definitions-scan.ts:37` (4b883f9) | defs-21, defs-22 | fixtures green |
| follow-ups: 280-cap splits, `allowed_translations` uniqueness, `expansion:` binding | profile-*.ts, defs-shard.ts, snapshot-rules.ts, render-site-from-repo.ts | config-12, defs-28, defs-29 | `wc -l` under 280 for every touched file; fixtures green |

Gates: branch `bun test` 3195 pass / 0 fail, selftest 205/205; master after merge 3362 pass / 0 fail, selftest 230/230, compile OK. Integration notes: both lanes numbered a fixture `freshness-12` (rk-5lzf's macros.tex fixture is `freshness-16` on master); both extracted `adoptGeneratedEntry` (kept rk-5lzf's `src/cli/generated-manifest.ts`, `rk render cards` adapts to it); the `notation-macros` generator now returns `PureRegenResult` under rk-nsex's widened generator signature.
