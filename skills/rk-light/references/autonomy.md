# Unattended waves: /goal and /loop

ROLE: how to let P3 run without the user at the keyboard. Two mechanisms exist; pick by
what should start the next turn.

- **`/goal <condition>`** — a fresh small model judges the condition after every turn and
  Claude keeps working until it holds, is judged impossible, or the user clears it. Best fit
  for "work until the done criteria hold". The evaluator reads only the transcript, so every
  wave must END by printing `make check` and `make status` output (that is what it judges).
- **`/loop`** (no interval = self-paced) — time-driven re-entry. Use when waves must wait
  on slow external lanes (a codex verifier that takes 30 min) and you want the session idle
  in between.

Neither may promote to `proved`: promotion needs a second-family receipt, and the wave
prompt says so. Neither edits BRIEF.md.

## /goal prompt

```
/goal rk-light project at <abs path>: BRIEF.md done criteria hold — <paste them> — as shown
by `make check` printing PASS and `make status` printing the headline; OR a stop condition
holds: waves >= <N>, wall-clock >= <H> h, `make check` red at the end of two consecutive
waves, or STATE.md "Decisions needed" is non-empty. Each turn = ONE wave per SKILL.md P3
(re-read STATE.md, CLAIMS.md, DEAD-ROUTES.md first; the repo is truth), ending with `make
check`, `make status`, and STATE.md rewritten. Never write `proved` without a codex receipt;
never edit BRIEF.md; demote rather than leave the gate red.
```

## /loop prompt

```
/loop rk-light wave at <abs path>. Read STATE.md, CLAIMS.md, DEAD-ROUTES.md (repo is truth).
ONE wave: target = weakest load-bearing claim on the path to <main id>, not dead, not the
target of the last 2 waves without a status change (none left -> stop: "frontier
exhausted"). Dispatch /rkl-attack (one angle unless disputed) or a counterexample hunter;
harvest into notes/wave-NN/; `make guard`; update rows (never above the judge's status; new
assumptions -> assumption rows; walls -> DEAD-ROUTES); for a sketched load-bearing proof
issue `make receipt` and dispatch the codex verifier (background, timeout); apply a VALID
verdict only when its receipt matches; `make check` green (demote otherwise); rewrite
STATE.md. Stop (ScheduleWakeup stop) when: done criteria met; waves >= <N>; hours >= <H>;
check red twice in a row; a decision only the user can make (write it in STATE.md first).
Else schedule the next wake at the slowest pending lane's expected time, never under 300 s.
```

## Why these stop rules

Unattended operation is where status inflation happens (lessons L1, L4): every stop rule
marks a place where an orchestrator under pressure would otherwise round up. "Red twice"
stops because a gate that stays red across a wave is a mis-scoped claim, not a typo.
