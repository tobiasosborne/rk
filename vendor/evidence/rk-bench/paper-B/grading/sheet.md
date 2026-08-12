# Candidate-B blinded grading sheet (20 questions, shuffled)

Grade each 1-5 on PRECISION (falsifiable answer shape), NOVELTY (real delta over
literature you know), CONSEQUENCE (who cares if answered). One line per question,
e.g. `Q3: 4/3/5 — comment`. Arms sealed until you finish.

**Q1.** Contextuality-driven learnability: when does quantum data exhibit contextuality signatures learnable by classical algorithms?

**Q2.** Given raw prepare-and-measure statistics plus only the tomographic-equivalence relations among the preparations, can one compute a nontrivial certified lower bound on a magic monotone (stabilizer extent, robustness of magic, or T-count) of the underlying state, valid over all Hilbert space dimensions?

**Q3.** For Gaussian-operation-restricted GKP/CV architectures, does contextuality of the finite measurement statistics coincide exactly with Wigner-function negativity of the GKP magic states, the way Howard–Wallman–Veitch–Emerson established for odd-prime-dimensional stabilizer QM — and if so, does the resulting equivalence yield a tight achievable rate for CV magic-state distillation?

**Q4.** For a complexity class $\mathcal{C}$ of response functions $\lambda \mapsto p(\text{outcome}\mid M,\lambda)$, does a $\mathcal{C}$-noncontextual model reproducing quantum statistics on $n$-qubit stabilizer-plus-magic scenarios to within inverse-polynomial error exist, and can one exhibit a scenario family with an *unconditional* super-polynomial lower bound on the circuit size of any such model?

**Q5.** What separates a non-signaling-hard LCL from a quantum-advantaged one?

**Q6.** Is contextuality the *only* route to unconditional shallow-circuit advantage?

**Q7.** For a local Pauli Hamiltonian $H = \sum_j c_j P_j$, is the Clifford-orbit-minimized average sign of the QMC weight distribution two-sidedly bounded by a contextuality monotone of the Pauli set $\{P_j\}$ minimized over the same orbit?

**Q8.** Under noncontextual wirings (Amaral–Cabello–Cunha–Aolita) as free operations, do the distillable contextuality $D(p) = \lim_n \sup\{m/n : p^{\otimes n} \to \text{(target)}^{\otimes m}\}$ and the contextuality cost $C(p)$ coincide for all behaviours $p$, and does there exist a contextual behaviour with $D(p)=0$ (bound contextuality)?

**Q9.** Can the classical hardness of sampling from random circuit sampling or analogous near-term quantum-advantage tasks be derived as a direct consequence of the contextuality of the underlying measurement statistics — extending the Bermejo-Vega/Delfosse/Okay/Raussendorf contextuality-implies-hardness line beyond restricted computational models (mod-p linear function computation) to genuine sampling-complexity quantum-advantage claims — thereby giving a hardness argument that doesn't route through average-case #P-hardness and non-collapse-of-PH conjectures?

**Q10.** Does the contextual fraction (or sheaf-cohomological obstruction) of the local Pauli measurement records used in magic-state cultivation circuits give a tight lower bound on the space-time volume overhead of the protocol, in the way robustness of magic bounds classical simulation cost for distillation?

**Q11.** Does an obstruction of order `d` in `H^1(-, Z_d)` yield an unconditional `QNC0`-vs-`AC0[p]` separation for every prime `p` not dividing `d`?

**Q12.** Which subsets of parameterized quantum circuits (VQE ansätze, QAOA mixers) undergo sharp *contextuality phase transitions*—discontinuities in contextuality measures, not entanglement—that provably correlate with their classical optimization hardness?

**Q13.** Can reinforcement-learning or LLM-guided combinatorial search discover new state-independent noncontextuality inequalities (KS-colorable-obstruction structures) requiring strictly fewer measurement contexts or lower Hilbert-space dimension than the known minimal constructions (Peres–Mermin, Yu–Oh, etc.), with tightness certified automatically via integer-programming or SAT solvers embedded in the search loop?

**Q14.** Is there a quantitative relationship — ideally a closed-form inequality — between the contextual fraction of the observable/ansatz pair measured in a VQE- or QAOA-type circuit and the exponent governing gradient-variance decay with system size?

**Q15.** Can contextuality fail to amplify?

**Q16.** Is the contextual fraction a currency, or only a witness?

**Q17.** Can we design an experimental test requiring *fewer measurement settings* than Kochen-Specker proofs yet still certifying contextuality with device-independent guarantees—i.e., avoid loopholes without full locality loopholes analysis?

**Q18.** Can iterative projective measurements on contextual states achieve exponential amplification of contextuality signatures per measurement round—and if so, does this amplification translate to faster convergence in contextuality-certified quantum algorithms?

**Q19.** Does there exist a bosonic state with everywhere-positive Wigner function that is *contextual* with respect to the physically implementable measurement fragment {Gaussian unitaries + homodyne + photon counting}, and does any such state supply a computational advantage over efficiently simulable optics?

**Q20.** Do there exist error-correction codes whose logical gates exploit *noise-preserved* contextuality—gates that would lose contextuality in a depolarizing channel but regain it under code measurement recovery?
