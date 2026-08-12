# Proof Export

## Node 1

**Statement:** Weighted minimum bound: let p_1, ..., p_m be positive reals with sum_i p_i = 1 and let n_1, ..., n_m be real numbers; then min over i in {1, ..., m} of n_i <= sum_i p_i * n_i.

**Type:** claim

**Inference:** assumption

**Status:** validated

**Taint:** clean

### Node 1.1

**Statement:** For every i in {1, ..., m}, min_{1 <= j <= m} n_j <= n_i.

**Type:** claim

**Inference:** by_definition

**Status:** validated

**Taint:** clean

### Node 1.2

**Statement:** For every i in {1, ..., m}, p_i min_{1 <= j <= m} n_j <= p_i n_i.

**Type:** claim

**Inference:** multiplication_by_positive

**Status:** validated

**Taint:** clean

### Node 1.3

**Statement:** (sum_{i=1}^m p_i) min_{1 <= j <= m} n_j <= sum_{i=1}^m p_i n_i.

**Type:** claim

**Inference:** summation_of_inequalities

**Status:** validated

**Taint:** clean

### Node 1.4

**Statement:** min_{1 <= j <= m} n_j <= sum_{i=1}^m p_i n_i.

**Type:** claim

**Inference:** substitution

**Status:** validated

**Taint:** clean

