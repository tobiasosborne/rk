<!-- ROLE: cross-lane coordination record for the M3-close repair wave (branch
     rk-m3repair-drive, LB1/LB2/LB9). Lists every edit this lane made to a file another repair
     lane also edits, so the orchestrator can merge without guessing.
     UPDATE-POLICY: append-only during the wave; delete once both lanes have landed.
     TRIGGER: read before merging rk-m3repair-drive with the gates repair lane. -->

# Shared-file edits — DRIVE lane (LB1 / LB2 / LB9)

Shared files touched: `docs/gate-contracts.md` (ONE paragraph, Check 15 only),
`docs/worker-contract.md` (three passages, LB9). No fixture/corpus counts changed
(`corpus/` untouched — 132/132, no `GATE_DIRS` fixture added; the LB1/LB2 red tests live in
`test/drive/` and `test/cli-verify.test.ts`, which are not gate-fixture surfaces).

The gates lane is editing gate-contracts' fixture tables, phase matrix, and Gate 4/7 prose —
disjoint from the single Check-15 paragraph below.

## docs/gate-contracts.md

### Edit 1 — Check 15 (Mandatory review), the counter-provenance sentence

Location: item 15 of the Gate 2 check list (was lines 786-790, now 786-798). Nothing else in
the file is touched — no table row, no heading, no other check.

BEFORE:

```
    counter itself is read from the shard's OWN persisted `balloons:`/`balloon_classifications:`
    frontmatter (`src/gates/linker-parse.ts`, threaded through `Lemma.balloons` since commit
    7ede34c) — the routing decision is never persisted (`driver-run.ts`'s `handleBalloon` marks
    every balloon event, mandatory-review or not), so this check reconstructs the threshold purely
    from the durable counter rather than trusting a stored verdict. Commit 7ede34c added
```

AFTER:

```
    counter itself is read from the shard's OWN persisted `balloons:`/`balloon_classifications:`
    frontmatter (`src/gates/linker-parse.ts`, threaded through `Lemma.balloons` since commit
    7ede34c) — the routing decision is never persisted (`src/drive/driver-balloon-run.ts`'s
    `handleBalloon` persists the counter on every balloon event, mandatory-review or not), so this
    check reconstructs the threshold purely from the durable counter rather than trusting a stored
    verdict. The two halves of the counter advance independently (LB2, M3-close review): the
    `balloons:` COUNT advances on EVERY balloon, including one whose classification turn failed or
    whose classification dispatcher was never configured (no `workers.assignments.verifier.l5`),
    because the tripwire firing is an observed fact; `balloon_classifications:` grows ONLY when a
    real classification turn produced a class — the driver never guesses one, and an unclassified
    balloon files no bd task. So on a roster with no cheap-tier worker this check's count half
    (`>= 2`) is still reachable while its `genuine-gap` half is not, and the run says so at
    preflight (`classificationUnavailableLines`) rather than degrading silently. Commit 7ede34c added
```

Why: LB2's two stale halves. (i) `handleBalloon` moved to `src/drive/driver-balloon-run.ts` in
the shard-cap split; the citation named `driver-run.ts`. (ii) "marks every balloon event" was
false for the unclassified path, which returned before the persist — true only after this lane's
LB2 code fix, and the new prose states the count/classification asymmetry the fix deliberately
keeps.

## docs/worker-contract.md (LB9 — three passages + two echoes of the same false claim)

This file is not, to this lane's knowledge, being edited by the gates lane; listed here anyway
because it is a normative contract document. All edits are truth repairs verified against code
line-by-line; NO real guarantee was weakened — only false ones removed.

### Edit 2 — exit-code table, row 10 (was line 261)

BEFORE: `| 10 | timeout | see "Retry ownership" below — never a blind resume |`

AFTER: the row now states what the driver actually does (skip this round, re-dispatch next round
as an ordinary new turn, bounded by `nodeRetryCap` + campaign cap) and says outright that there is
no retry component and no idempotency key.

Why: "never a blind resume" asserted a mechanism that does not exist (LB9 passage 2).

### Edit 3 — "(b) Request shape" `turnId` description (was line 145) and the shape block (was line 182)

BEFORE: "`turnId` is a per-turn idempotency key" / `// idempotency key for retry (blocker 2 / Q3)`

AFTER: both say `turnId` is a per-turn id INTENDED as an idempotency key but minted fresh on every
dispatch today, pointing at "Retry ownership".

Why: same false claim as Edit 2, stated twice more (`src/drive/driver-live.ts:219-222`).

### Edit 4 — "Bounded schema repair (rk-xxp, GAP 11)" paragraph (was lines 269-280)

BEFORE (the two false halves):
- "Before a code-12 **verifier** turn becomes terminal" — understated the trigger set.
- "A repair that also fails is a normal terminal 12, and the ORIGINAL failure representation is
  preserved verbatim (a parse-failed stays parse-failed)."

AFTER: states BOTH triggers ((i) exit 12 with `rawText`, (ii) exit 0 with a body failing
`validateRawWorkerOutput` — the attempt-11 shape), consistent with the prover paragraph that
follows; then splits terminality into its two real mechanisms — trigger (i) folds back to exit 12
and is skipped on the exit check, trigger (ii) folds back to **exit 0 carrying the invalid body**
(`foldRepairTurn`, `src/drive/verdict-repair.ts:167-175`) and is terminal only because
`bindVerdicts` / `extractProofContent` (`driver-prove-node.ts:133-143`, deferring to
`validateRawProverOutput` since rk-xfzg) refuse it one stage later. Adds a "Test gap (rk-wr58)"
paragraph saying that path is not pinned end-to-end by any test. The "no extra trust" sentence is
retagged "A SUCCESSFUL repair" (it only ever applied to the success branch).

### Edit 5 — "Retry ownership (Q3 ruling)" section (was lines 538-547)

BEFORE: "a retry after exit 10 ... MUST either open a fresh session or reuse the SAME `turnId`
(an idempotency key) ... This shared retry component is not built in this WP".

AFTER: the Q3 quote is kept as the RULING/design intent, followed by "What is actually built
(2026-08-03)": no retry component, no caps/backoff key, no idempotency key; adapters do make one
attempt each (`backend-claude.ts`/`backend-codex.ts` have no retry loop); a timed-out node is
re-dispatched next round on the SAME resumed session with a FRESH `turnId`. Then the defense that
does exist — the per-target hash CAS (`reReadContentHashes` + `expect_hash` in
`driver-run-round.ts`; `--expect-hash` in `driver-live-dispatch.ts:167-170`) — with an explicit
statement of what it does NOT buy (no de-duplication of a repeated write against unchanged bytes).
Closes by pointing at the turnId-idempotency design bead (see bd) rather than implementing it.

---

<!-- ROLE: this repair lane's ledger of every edit it made to an ORCHESTRATOR-OWNED shared file
     (docs/gate-contracts.md, corpus/README.md, src/corpus/discovery.ts, test/corpus.test.ts).
     UPDATE-POLICY: append one section per landing-blocker as the lane works; frozen at push.
     TRIGGER: read by the orchestrator when reconciling this wave's lanes. -->

# SHARED-EDITS — gates repair lane (branch `rk-m3repair-gates`)

Wave: the 2026-08-03 M3-close batched Tier A review repair wave. This lane repairs LB3-LB8.
The drive lane repairs LB1/LB2/LB9 and also edits `docs/gate-contracts.md` — **Check 15's
paragraph only**; this lane never touched it.

## Fixture-count ledger (this lane owns the bumps this wave)

| step | before | after | fixtures added |
|---|---|---|---|
| LB3 (+ gates-F14) | 132 | 134 | `corpus/linker/linker-45`, `corpus/linker/linker-46` |
| LB6 | 134 | 135 | `corpus/provenance/provenance-24` |

Three count sites, bumped together every time (the third is easy to miss):

1. `src/corpus/discovery.ts` — `EXPECTED_FIXTURE_COUNT`, plus a dated delta paragraph in its
   doc comment.
2. `test/corpus.test.ts` — the SECOND hardcoded total, in **both** the test title and the
   assertion (`test("total fixture count matches corpus/README.md's ledger (N)")` /
   `expect(total).toBe(N)`).
3. `corpus/README.md` — one ledger row per new fixture, plus a delta paragraph near the
   `refs-09`..`refs-11` / `config-05` paragraphs, and the `EXPECTED_FIXTURE_COUNT = N`
   mention inside the `config-05` paragraph.

`bun run selftest`'s `checked corpus: N/N` line is derived, not authored.

## docs/gate-contracts.md edits

### LB8 — four inverted rows corrected (commit 1)

| where | before | after |
|---|---|---|
| Check 13 fixture list (~:980-982) | "`linker-32` (no parseable seam at all, AISM's real shape ⇒ WARNING legacy-same-family), `linker-33` (batch-validated on the critical path ⇒ WARNING)" | "`linker-32` (… ⇒ **ERROR, fail closed** — 2026-07-19 M3 review blocker 5a; legacy is never INFERRED …), `linker-33` (batch-validated on the critical path ⇒ **ERROR** — blocker 5c)" |
| fixture-ledger row `linker-32` (~:1070) | "⇒ WARNING `legacy-same-family`, never ERROR (Check 13, grandfathering golden case)" | "⇒ **ERROR, fail closed** (Check 13)" + blocker 5a citation + pointer to the fixture's own `expected.json`/`notes` and to this document's own correct statement at the Check 13 "unresolvable-or-same-family identity" sentence |
| fixture-ledger row `linker-33` (~:1071) | "⇒ WARNING naming the batch id (Check 13)" | "⇒ **ERROR** naming the batch id (Check 13)" + blocker 5c citation + PRD C3 rationale + the explicit-marker downgrade |

No code change: the corpus fixtures were already the enforcement.

### LB3 — Gate 2 Check 16 prose (commit 2)

| where | before | after |
|---|---|---|
| Check 16, before the "Two domains" bullet | (absent) | NEW bullet **"THE VETO IS UNCONDITIONAL"** — every shard with a live retraction in either domain ERRORs, independent of status vocabulary and of any other store's presence; mirrors `validate-conflicts.ts`'s three reasons; names the closed hole and fixture `linker-45` |
| Check 16, "Two domains, never cross-compared" bullet | opened "A live `l5-shard-bytes` retraction feeds **Check 14**…" | opens "On TOP of the unconditional veto, each domain feeds one specialized check that adds semantics the veto deliberately does not carry; neither replaces it…", and closes with a **"One story, not three"** paragraph fixing the wording split (veto states the withdrawal; Check 8 = propagation consequence; Check 14 = promotion consequence) |
| Check 16, coverage-line bullet | "`retraction store: <n> live (l5-shard-bytes), <m> live (af-canonical)`" | "`retraction store: <L> live (<n> l5-shard-bytes, <m> af-canonical), <D> drove a Check 16 veto ERROR`" + the rk-lkeh S/J rationale for the pair |
| Check 16, last bullet | "Fixture: `linker-44`." | "Fixtures: `linker-44` …, `linker-45` (the store-absent hole, LB3), `linker-46` (fail-closed corrupt ledger, gates-F14)." |

### LB4 — Gate 7 "Edge-supplied generators" structural-loss enumeration (commit 3, gates-F11)

| where | before | after |
|---|---|---|
| Gate 7, "Edge-supplied generators", the `ok:false` paragraph (~:1998-2000) | inline parenthetical listing **two** classes: "a registry shard skipped for a structural parse reason, or a malformed raw fr log line" | the parenthetical drops the list; a new **numbered list of FOUR** classes follows (`registrySkips`, `frMalformedLines`, `retractionStoreProblems`, `bdMalformedLines`), each with its own one-line rationale, plus a closing paragraph naming `src/render/diagnostics-view.ts`'s `structuralLossLines`/`structuralLossCount` as the single implementation and declaring a fifth-class omission a truthfulness bug |

### LB5 — phase-matrix row for Gate 2 (commit 4)

| where | before | after |
|---|---|---|
| Phase matrix, Gate 2 row, structural column (~:300) | ended at "Check 7 (unknown dep/route-member/def id)" | adds "Check 14's and Check 16's STORE-INTEGRITY halves (a corrupt `.rk/l5-verdicts.jsonl` or `.rk/retractions.jsonl`, and the promotion-unconfirmable ERRORs that follow from either)" |
| Phase matrix, Gate 2 row, non-structural column | listed "Check 14 (L5 promotion, M3.8), Check 16 (retraction, rk-0ehr)" flat | those two entries are qualified as their **semantics halves only** ("Check 14's PROMOTION semantics", "Check 16's RETRACTION-STATUS semantics (the veto itself)"), making the split explicit |
| Phase matrix, Gate 2 row, rationale column | unchanged prefix | one sentence appended stating the split rule: a ledger that cannot be PARSED is the same class as a shard that cannot be parsed, while what a readable ledger MEANS for a status is consolidation-weight |
| Phase matrix, "Mutation-proof discipline" paragraph | unchanged | unchanged (already required doc+code+tests in one commit — LB5 complies with it rather than editing it) |

### LB6 — Gate 4 check 5 (commit 5)

| where | before | after |
|---|---|---|
| Gate 4, check 5 / `provenance-11` divergence prose | described only the `present-but-unloaded` ERROR and the absent-is-legitimate rule | adds the **explicitly-configured-but-absent ⇒ ERROR** rule (the `ConfigValidationResult.overrides` distinction), and the coverage line gains `tab:status source: read \| present-but-unloaded \| absent` |
| Gate 4, "Known limitations" | — | adds the characterized label-above-midrule parsing limitation (gates-F5), stated rather than changed |

### LB7 — Gate 7 three-cause STALE, cause 3 (commit 6)

| where | before | after |
|---|---|---|
| Gate 7, the degraded-fidelity (cause 3) prose | named only `buildGraphDocument`'s af/fr source statuses as cause-3 inputs | adds the render edge's own second `fr export` read (`loadFrResiduals`) as a cause-3 input, with its fidelity record |

## corpus/README.md edits

- LB3: two new ledger rows inserted after `linker-44`'s row and before `refs-01`'s
  (`linker-45`, `linker-46`); one new delta paragraph after the `config-05` paragraph;
  `EXPECTED_FIXTURE_COUNT` mention in the `config-05` paragraph 132 → 134.
- LB6: one new ledger row (`provenance-24`) and its delta paragraph; count 134 → 135.

## corpus fixture `expected.json` files this lane also STRENGTHENED (not orchestrator-owned,
listed for completeness)

- `corpus/linker/linker-44/expected.json` — two `retraction veto:` expectations added plus a
  `coverage` block pinning the new S/J unit text; `notes` extended.
- `corpus/provenance/provenance-13/expected.json` — `unit_patterns` extended with the new
  `tab:status source: <state>` clause (LB6).
