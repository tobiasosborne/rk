---
id: lem-retracted-no-l5-store
kind: lemma
status: proved
af: none
contract: A rigorous-ladder result withdrawn by an l5-shard-bytes retraction, in a repo that has never run an L5 review.
---

The LB3 hole, transcribed. This shard sits on the rigorous ladder (`status: proved`) and carries
a LIVE `l5-shard-bytes` retraction pinned to its current raw bytes. The repo has NO
`.rk/l5-verdicts.jsonl` at all — a campaign that never dispatched an L5 review, which is the
legitimate day-1 state.

Before the Check 16 veto existed this produced ZERO gate findings: Check 8 reads only the
`af-canonical` view (this retraction is in the other domain), and Check 14 early-returned on the
absent L5 store BEFORE ever reading `liveL5`. `rk check` exited 0 while `rk render` refused the
same tree, because `computeExpectedConflicts` vetoes unconditionally.
