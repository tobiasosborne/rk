# Candidate-B blinded grading: unblinded results + validity assessment (2026-08-09)

Grader: TJO (self-described non-expert in subarea; "some gradings are just vibes").
Scores per arm (mean of precision+novelty+consequence sums, 5 questions each):
  control-opus   11.20   [13,12,11,10,10]
  control-haiku   9.60   [11,11,11,9,6]
  control-sonnet  8.40   [13,12,8,6,3]
  campaign        7.20   [13,7,7,6,3]

## VERDICT: the arm comparison is VOID — examiner extraction confound

The examiner's sheet-building regex extracted full technical statements for the
control arms but reduced 4 of 5 campaign questions to their rhetorical tagline
headers (PORTFOLIO.md places a hook line above each full Question body). Direct
measurement of the artifact: the SAME question (bound contextuality) appeared twice —
as bare-opus's full statement (Q8: 12 points) and as the campaign's tagline fragment
(Q15 "Can contextuality fail to amplify?": 7 points). A 5-point penalty on identical
content. TJO's low grades on Q15/Q16 ("huh?", "what?") were correct responses to
fragments, not to the campaign's questions.

## What survives the confound

- The ONE campaign question extracted in full technical form (Q11, cohomological
  order vs AC0[p]) scored 13 — tied for best of all 20.
- Bare-opus's arm is strong (11.20 mean) — the question-finding tier is close to
  frontier-model-native; any harness value-add is at the gating/grounding layer
  (kill discipline, literature deltas), which this grading did not measure.
- TJO taste signals: hates VQE/QAOA framings and advantage-is-related-to-
  contextuality framings; rewards precise separations and structure theorems.

## Repair option (cheap, next session)

Re-grade ONLY the four mangled campaign questions in their full PORTFOLIO.md forms
(blind labels R1-R4 mixed with 4 already-graded controls as calibration anchors).
~10 minutes of TJO time; restores a valid comparison.

## Examiner error ledger (this makes four)

git-add -A sweep; tripwire self-hits; fixture naming a nonexistent file; and now
extraction-without-verification against source. Consistent with campaign A's own
finding: as the verified core hardens, the ORCHESTRATING human/agent layer is the
system's principal residual error source. The examiner is not exempt.
