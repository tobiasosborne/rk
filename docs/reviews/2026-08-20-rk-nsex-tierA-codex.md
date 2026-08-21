<!-- ROLE: Tier A review record — codex gpt-5.6-sol xhigh review of the rk-nsex branch (worktree-agent-a9f0e64703ddb02bd) vs master. AUTHORED, append-only; the orchestrator appends the repair-wave verification table before the branch lands. TRIGGER: read before merging rk-nsex or at the next milestone review. -->

# Tier A review: rk-nsex (extraction/review records, Check 11/12, cards-v1) — codex xhigh, 2026-08-20

Verdict on the first implementation: REJECT (6 landing-blockers, 4 follow-ups). Disposition: single repair wave by the implementing lane; orchestrator verifies mechanically; no re-review. Branch does not merge until the verification table below is complete.

## Review text (verbatim)

Direct false greens remain, including clean `1/1` record and shard joins for claims not supported by the declared source.

## Landing-blockers

1. **BLOCKER — Record `source` is not bound to the lock entry’s `source_id`.** The gate accepts a record filed as `paper-A` whose range, payload hash, quotation, and theorem all come from `paper-B`; my constructed triple produced zero findings and `1/1 shard-record joins`. [refs-records-schema.ts:155](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-records-schema.ts:155), [refs-records-verify.ts:107](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-records-verify.ts:107), [refs-extraction.ts:31](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-extraction.ts:31).  
   Repair: retain `source_id` in `LockEntryFacts` and require every statement/hypothesis/standing-assumption payload to belong to `record.source`.

2. **BLOCKER — Complete-statement enforcement is not sufficient.** A source with `Theorem 1. Assume d-regular` on line 1 and the conclusion on line 2 passes when the range starts at line 2; the heuristic only looks after the range. Capitalized or EOF-ending omitted clauses also pass. [refs-records-verify.ts:68](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-records-verify.ts:68), [refs-records-verify.ts:138](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-records-verify.ts:138).  
   Repair: introduce independently reviewed start/end boundary anchors or a fail-closed statement envelope, with leading, capitalized-sentence, and EOF omission fixtures.

3. **BLOCKER — Check 12 remains optional at the exact promotion boundary it is meant to protect.** A `cited` shard without `record:` exits green with a WARN and is excluded from the `0/0` join denominator; a `proved-mod-audit` shard without a record or citation produces no finding at all. [refs-card-join.ts:67](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-card-join.ts:67), [refs-card-join.ts:77](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-card-join.ts:77), [refs-card-join.ts:89](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-card-join.ts:89).  
   Repair: add an adopted/required records mode and a literature-vs-campaign origin discriminator; require joins structurally for cited and literature-PMA shards while retaining WARN only for explicit legacy mode.

4. **BLOCKER — `cards-v1` inherits Gate 7’s non-structural policy and lacks inverse completeness.** A declared hand-edited card becomes only WARN in exploration, so `rk check` exits green; a valid record with no manifest or an empty manifest yields clean `0/0`, as does an undeclared stale card. [freshness.ts:344](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/freshness.ts:344), [freshness.ts:360](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/freshness.ts:360), [gate-contracts.md:327](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/docs/gate-contracts.md:327).  
   Repair: make `cards-v1` missing/stale/unregenerable findings structural and enforce a bijection between L1 records, card files, and manifest entries.

5. **MAJOR — Canonical hashing is lossy for unsafe JSON numbers.** Changing a signature value from `9007199254740992` to `9007199254740993` leaves the canonical digest unchanged after `JSON.parse`; the old review and shard hash therefore carry forward and Checks 11–12 pass. [canonical-json.ts:26](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/canonical-json.ts:26), [extraction-record.v1.json:102](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/schemas/extraction-record.v1.json:102).  
   Repair: reject duplicate keys and non-safe numeric values before hashing, or use a lossless canonical JSON parser.

6. **MAJOR — Runtime validation under-enforces both schemas.** `additionalProperties:false` is not checked at any level; L0 SHA shape, array item types, source-directory equality, and nested exact-key sets are also omitted. Schema-invalid records can therefore pass the gate. [refs-records-schema.ts:90](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-records-schema.ts:90), [refs-records-schema.ts:182](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-records-schema.ts:182), [refs-records-schema.ts:202](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-records-schema.ts:202).  
   Repair: enforce exact key sets and every nested type/pattern from both schemas, with extra-property and malformed-L0 red fixtures.

## Follow-ups

1. **Reviewer independence is asserted, not mechanically evidenced.** Extraction records contain no author identity, so reviewer≠author cannot be checked. [card-review.v1.json:23](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/schemas/card-review.v1.json:23).  
   Repair: record an author/dispatch seam and enforce family/session separation where campaign policy requires it.

2. **The renderer treats review validity as full record usability.** A source-stale or verbatim-invalid record with a matching VALID review renders a content-bearing card rather than a refusal stub, although Gate 3 separately errors. [cards.ts:58](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/render/cards.ts:58), [cards.ts:121](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/render/cards.ts:121).  
   Repair: render mathematical content only when the record is present in Check 11’s `usable` map.

3. **Corpus expectations are subset matches, not exact matches.** The ten current fixtures happen to emit exactly their intended codes, but collateral findings would not fail the harness. [run.ts:162](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/corpus/run.ts:162).  
   Repair: compare the complete normalized finding multiset, with explicit allowances only where documented.

4. **`rk render cards` exits 0 when shape-invalid records were left unrendered.** [render-cards.ts:70](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/cli/render-cards.ts:70), [render-cards.ts:84](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/cli/render-cards.ts:84).  
   Repair: include `unrendered > 0` in the nonzero exit decision.

## Answers to the six questions

1. A literal `checked.translation_faithful.value: false` is rejected as `[review-inconsistent]`; an exact hypothesis mismatch is `[anchor-unverified]`; and a raw, noncanonical-byte hash is `[review-stale]`. However, a mistranslated `statement_blessed` with the reviewer incorrectly recording `true` passes cleanly, as does a misleading hypothesis that is merely an exact substring of a negated or longer source clause. The review is the declared semantic oracle.

2. The extent heuristic examines only the first non-empty line after `statement_range.to`. It rejects lowercase initials or case-insensitive prefixes `where`, `assume`, `assuming`, `suppose`, `such that`, `provided`, `here`, and `with the`. It does not inspect the range’s beginning, parse sentence boundaries, require the result label, recognize arbitrary capitalized continuations, or detect truncation at EOF. It can false-positive on a complete statement followed by lowercase proof/equation text. It is clearly documented as heuristic at [refs-records-verify.ts:68](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/src/gates/refs-records-verify.ts:68) and [gate-contracts.md:1523](/home/tobiasosborne/Projects/rk/.claude/worktrees/agent-a9f0e64703ddb02bd/docs/gate-contracts.md:1523).

3. The existing `linker-index`, `linker-dag`, and edge-supplied site behavior is unchanged; the affected freshness regression suites pass. A declared missing card errors. An undeclared missing card, absent manifest, or empty manifest is clean `0/0`; and card errors demote in exploration.

4. Purity passes: selftest reports `142/142` pure files and `41/41` gate files. The new `src/render/cards.ts` core is pure. The pre-existing `src/render/defs-edge.ts` and `fr-edge.ts` contain their intentionally edge-local IO.

5. Yes. The cited migration route is visible but exit-0 and excluded from join coverage; the PMA no-record route is completely silent. Emitted Check 11/12 errors are correctly structural, but these absence paths avoid emitting one.

6. Current fixture behavior is exact: refs-23 through refs-31 emit only their expected codes; refs-29 emits its intended two codes for its two records; refs-32 is the green control. `timeout 120 bun run selftest` passes `186/186`. The affected pure suites pass `176/176`. Full `timeout 300 bun test` could not be validated in this read-only sandbox: `2599 pass, 1 skip, 484 fail, 2 errors`, with all 484 failures reporting `EROFS` while creating temporary repositories.

**Verdict: REJECT.**
## Repair-wave verification (orchestrator, 2026-08-21)

Single repair wave, implemented by codex gpt-5.6-sol xhigh lane on branch `worktree-agent-a9f0e64703ddb02bd` (998725a..cb41ae1). Verified mechanically by the orchestrator on the branch and again on master after merge; no re-review (anti-Zeno rule).

| Finding | Commit | Code | Fixture / test | Orchestrator check |
|---|---|---|---|---|
| BL1 source binding | c5a8f58 | `src/gates/refs-records-verify.ts:259` | refs-33 | lane mutation report |
| BL2 statement envelope | 83870b2 | `src/gates/refs-records-verify.ts:213` | refs-34..36 | lane mutation report |
| BL3 join required at promotion | d69bc7c | `src/gates/refs-card-join.ts:93` | refs-37..40 | lane mutation report |
| BL4 cards-v1 structural + bijection | 883c9b6 | `src/gates/freshness.ts:292,367,421` | freshness-12..15 | lane mutation report |
| BL5 lossless canonical JSON | 9b45653 | `src/gates/refs-records.ts:66` | refs-41 | orchestrator: disabled `scan.ok` branch -> refs-41 RED (false `2/2` joins); restored |
| BL6 exact schema enforcement | 269c951 | `src/gates/refs-records-schema.ts:102,193,227` | refs-42, refs-43 | orchestrator: replaced `exactL1Problems(o)` with `[]` -> refs-42 RED; restored |
| FU2 render only usable records | 044924d | `src/render/cards.ts:157` | test/render/cards.test.ts | unit tests green |
| FU4 nonzero exit on unrendered | cb41ae1 | `src/cli/render-cards.ts:84` | cli test | unit tests green |
| FU1 reviewer independence | — | — | — | filed as bead (rk-nsex FU1) |
| FU3 exact multiset corpus matching | — | — | — | filed as bead (rk-nsex FU3) |

Gates: branch `bun test` 3162 pass / 0 fail, selftest 201/201; master after merge 3190 pass / 0 fail, selftest 201/201, compile OK. Corpus 176 -> 201 on master.
