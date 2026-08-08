<!-- ROLE: decision record input — TJO directives, 2026-08-08, verbatim-condensed.
     AUTHORED. UPDATE POLICY: immutable except for appending the eventual ratification
     outcome. TRIGGER: read alongside the SOTA survey memo before M4 planning; these
     directives await a worked plan and TJO ratification before entering the PRD. -->

# TJO directives on autonomy and gating (2026-08-08)

Recorded from TJO's own words in-session, same day as the SOTA survey memo
(2026-08-08-proof-search-sota-survey.md). These are DIRECTION, not yet ratified plan.

## D-a: af-first formalization catches classes Lean does not

Natural-language formalization via af + CI/CD lemma-contract checking + higher-scale
verification catches whole classes of failure modes that straight-up Lean form does
not. Evidence base: TJO's MIP*=RE formalization attempt (../mip-re) hit several
transcription errors, false starts, and vacuous theorems; the learnings there are to
be worked into rk.

## D-b: Lean is a path of last resort

LLMs have passed the bar of being reliable proof generators — especially with the
concatenated error correction provided by Lamport-notation structured proofs. Lean is
only needed when the prover is UNTRUSTED. It is costly; treat kernel verification as
an escalation, not a default.

## D-c: North star — unattended goal-directed research

The real challenge is tuning RL methodology so an orchestrator can be left alone to
pursue an explicit research goal WITHOUT human oversight of definitions and
conjectures. TJO's position: this is already possible; LLMs have good taste regardless
of the denial. The open problem is COMPUTING reward signals for definitions and
conjectures — i.e., how to do MCGS/bandit/etc. so that actual progress toward a
research goal is achieved rather than aimless wandering.

## D-d: Gate definitions and conjectures hard

Before a new definition enters the definition database, or a new conjecture enters the
proof/argument graph, its VALUE must be evaluated mechanically. Explore ideas from
mutation testing and fuzzing for this evaluation.

## Success criterion (TJO, verbatim intent)

True success: leave an orchestrator running with rk on a big research goal with an
effectively infinite time horizon; even if it never settles the goal, it generates
VALUABLE results on the way.

## Standing concern

TJO suspects rk has become process-heavy relative to this north star. An assessment
was commissioned same day (process-heaviness inventory + evaluation + plan).
