# Proof Export

## Node 1

**Statement:** Weighted minimum bound: let p_1, ..., p_m be positive reals with sum_i p_i = 1 and let n_1, ..., n_m be real numbers; then min over i in {1, ..., m} of n_i <= sum_i p_i * n_i.

**Type:** claim

**Inference:** assumption

**Status:** validated

**Taint:** clean

### Node 1.1

**Statement:** The index set {1, ..., m} is nonempty, i.e. m >= 1.

**Type:** claim

**Inference:** empty_sum_is_zero_contradicts_sum_one

**Status:** validated

**Taint:** clean

### Node 1.2

**Statement:** The quantity mu := min over i in {1, ..., m} of n_i is well-defined, and there exists an index k with n_k = mu.

**Type:** claim

**Inference:** minimum_of_finite_nonempty_set_exists

**Status:** validated

**Taint:** clean

### Node 1.3

**Statement:** For every i in {1, ..., m}, n_i >= mu.

**Type:** claim

**Inference:** by_definition_of_minimum

**Status:** validated

**Taint:** clean

### Node 1.4

**Statement:** For every i in {1, ..., m}, p_i * n_i >= p_i * mu.

**Type:** claim

**Inference:** multiplication_by_nonnegative

**Status:** validated

**Taint:** clean

### Node 1.5

**Statement:** sum_i p_i * n_i >= sum_i p_i * mu.

**Type:** claim

**Inference:** monotonicity_of_finite_sums

**Status:** validated

**Taint:** clean

### Node 1.6

**Statement:** sum_i p_i * mu = mu * sum_i p_i.

**Type:** claim

**Inference:** distributivity_factor_out_constant

**Status:** validated

**Taint:** clean

### Node 1.7

**Statement:** mu * sum_i p_i = mu * 1 = mu.

**Type:** claim

**Inference:** substitute_hypothesis_sum_p_i_eq_one

**Status:** validated

**Taint:** clean

### Node 1.8

**Statement:** sum_i p_i * mu = mu.

**Type:** claim

**Inference:** transitivity_of_equality

**Status:** validated

**Taint:** clean

### Node 1.9

**Statement:** min over i in {1, ..., m} of n_i <= sum_i p_i * n_i.

**Type:** claim

**Inference:** chain_inequality_with_equality

**Status:** validated

**Taint:** clean

