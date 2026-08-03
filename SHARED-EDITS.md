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
