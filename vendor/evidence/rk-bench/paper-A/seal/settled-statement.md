# SEALED — answer key for benchmark candidate A (examiner record, 2026-08-08)

Paper: arXiv 2607.19852 v1 (2026-07-22), "Optimal Lower Bounds for Hamiltonian
Simulation", Alexander Zlokapa, Richard R. Allen, Aram W. Harrow. quant-ph, 20pp.

## Settled statements (the scoring key)

For H(tau) = sum_j a_j h_j(tau), ||h_j||=1, simulation to trace-distance error eps:

- Theorem 1 (gates): any channel using G two-qubit gates with
  (1/2)||E_H(rho) - U_H(rho)||_1 <= eps for all rho has
  G >= Omega( min_{0<=K<=L} ( K t + t^2 lambda_K^2 / eps ) ),  lambda_K = sum_{j>K} a_j.
- Theorem 2 (queries, classical oracle model): same expression lower-bounds query count
  in expectation over the hard distribution.
- Matching upper bound: composite qDRIFT (high-order Trotter on the K largest terms +
  randomized first-order on the tail); the min over K is the deterministic/randomized
  split (their Lemma 5, "optimal deterministic-randomized split").
- Consequence: poly(1/eps) gate scaling is NECESSARY for many physical systems
  (e.g. power-law interactions), contra block-encoding query-count intuition.

## Method (the crux, for grading class-b "same crux" outcomes)

Elementary, LOCAL, bounded-degree CLASSICAL hard instances — NOT Boolean-function/parity
encodings (the prior-art route):
- gates: H_2q = sum_j a_j |11><11|_j on disjoint qubit pairs;
- queries: H_1q = sum_j s_j a_j |1><1|_j non-interacting, random signs.
Key ingredients: Mandelstam-Tamm on cat states (energy variance 1/2); fresh-qubits-per-
unit-interval factorization into independent patches; "subset correlation ratio" R_r(S)
concentration (their Lemma 6) via TV between biased Bernoullis + Pinsker + data
processing; "touched set" (<=2G) / "connected set" (<=G) counting.

## Prior art the paper cites as the gap (pre-cutoff, campaign may find these)

Berry et al. 2007/2014/2015 (sparse); Childs-Kothari 2010; Atia-Aharonov 2017
(no-fast-forwarding); worst-case-coefficient parity encodings optimal in t,eps only;
NO prior bound optimal for arbitrary {a_j}.
