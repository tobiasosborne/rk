# Proof Export

## Node 1

**Statement:** Mass split: for an exact signed idempotent P and any row index v, writing a_j = P_{vj}, a_j^+ = max(a_j, 0), a_j^- = max(-a_j, 0), and nu_v = sum_j a_j^-, one has sum_j a_j^+ = 1 + nu_v.

**Type:** claim

**Inference:** assumption

**Status:** validated

**Taint:** clean

### Node 1.1

**Statement:** For each index j, the real number a_j = P_{vj} satisfies a_j = a_j^+ - a_j^-, where a_j^+ = max(a_j, 0) and a_j^- = max(-a_j, 0).

**Type:** claim

**Inference:** by_definition (case split on the sign of a_j: if a_j >= 0 then a_j^+ = a_j and a_j^- = 0; if a_j < 0 then a_j^+ = 0 and a_j^- = -a_j)

**Status:** validated

**Taint:** clean

### Node 1.2

**Statement:** Since P is an exact signed idempotent, P 1 = 1, so the row-v entries satisfy sum_j a_j = sum_j P_{vj} = 1.

**Type:** claim

**Inference:** by_definition (unital condition P 1 = 1 of an exact signed idempotent, read off in coordinate v)

**Status:** validated

**Taint:** clean

### Node 1.3

**Statement:** Summing the pointwise decomposition over the finite index set j = 1, ..., n gives sum_j a_j = sum_j a_j^+ - sum_j a_j^-.

**Type:** claim

**Inference:** finite_additivity (linearity of finite sums applied termwise)

**Status:** validated

**Taint:** clean

### Node 1.4

**Statement:** Combining the two evaluations of sum_j a_j yields sum_j a_j^+ - sum_j a_j^- = 1.

**Type:** claim

**Inference:** transitivity_of_equality

**Status:** validated

**Taint:** clean

### Node 1.5

**Statement:** By definition nu_v = sum_j a_j^-, hence sum_j a_j^+ - nu_v = 1.

**Type:** claim

**Inference:** substitution

**Status:** validated

**Taint:** clean

### Node 1.6

**Statement:** Therefore sum_j a_j^+ = 1 + nu_v.

**Type:** claim

**Inference:** algebraic_manipulation (add nu_v to both sides)

**Status:** validated

**Taint:** clean

