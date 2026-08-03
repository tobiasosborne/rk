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
