# Canary preflight verdict: CLEAN (GO) — 2026-08-08

Probes: haiku/sonnet/opus x {state-of-the-art P1, title-probe P2}, throwaway contexts.

- P2 (paper knowledge): all three models plainly deny knowing the paper; no
  fabrication; sonnet/opus correctly identify the authors as plausible but refuse to
  guess contents.
- P1 (does the fleet already have the answer?): all three reproduce the PRE-CUTOFF
  state of the art (BCK'15-lineage bounds, HHKL/CSTWZ lattice results, commutator-
  scaling open questions) and explicitly name the target question OPEN. Sonnet
  verbatim: "a lower bound proving the composite deterministic-Trotter-plus-
  randomized-tail approach is optimal for arbitrary coefficient profiles does not
  exist in the literature I know of; this is an open problem." No model produced the
  min-over-K tail-mass bound shape.
- Ideal canary profile: the fleet KNOWS THE QUESTION and NOT THE ANSWER.

Incidental catch (firewall-relevant): the haiku probe context OFFERED to search via a
Scite MCP literature tool. Probe declined to use it, but this confirms worker contexts
can carry MCP literature/search tools unless explicitly stripped. Firewall enforcement
must remove MCP servers AND WebSearch/WebFetch from every non-librarian worker's tool
policy (deny hooks as backstop), not merely rely on prompt instructions.
