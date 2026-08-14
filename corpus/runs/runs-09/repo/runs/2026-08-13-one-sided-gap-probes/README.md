# 2026-08-13 one-sided gap probes

**Hypothesis.** The one-sided gap bound holds at the extreme admissible values of every
quantifier, including both range endpoints and the stated threshold.

**Command.** `bash runs/probe-channel.sh runs/2026-08-13-one-sided-gap-probes probe.py 300`
(the sanctioned channel; ledger entry appended to `runs/probe-ledger.jsonl`).

**Finding.** No violation at any probed extreme; the smallest measured margin is 4.1e-3 at the
lower endpoint.

**Invariant.** Relative-tolerance cross-check against the closed-form value at the two endpoints,
plus one negative control (a deliberately perturbed constant) the probe does catch.

**Next.** Extend the probe to the degenerate rank-1 case before the claim ships to review.
