# Campaign goal statement (benchmark candidate A) — CAMPAIGN-VISIBLE

Setting: H = sum_{j=1..L} a_j h_j with ||h_j|| = 1 and arbitrary coefficients
a_1 >= a_2 >= ... >= a_L > 0; simulate time evolution e^{-iHt} on a quantum computer
to trace-distance error eps.

State of the art (as of the literature cutoff): upper bounds via product formulas,
qDRIFT (randomized compiling), and composite/hybrid schemes that Trotterize the large
terms deterministically and sample the small-term tail randomly. Lower bounds are
known to be tight in t and eps only for WORST-CASE coefficient profiles, via
constructions that encode Boolean functions (e.g. parity) into time evolution; no
known lower bound is optimal for every coefficient profile {a_j}.

GOAL: settle the optimality of Hamiltonian-simulation cost as a function of the FULL
coefficient profile: prove lower bounds on (i) two-qubit gate count and (ii) query
count (classical oracle access to the terms) that match the best known upper bounds
for EVERY {a_j}, t, eps — or disprove tightness by improving the upper bounds. A
complete answer characterizes the optimal complexity up to constants as an explicit
function of {a_j}, t, eps, with both bounds.

Notes for the campaign: literature access only through the librarian worker
(submittedDate <= D_CUTOFF = 2026-05-31). Numerics are welcome as evidence
(never promotion). All standard rk gates apply.
