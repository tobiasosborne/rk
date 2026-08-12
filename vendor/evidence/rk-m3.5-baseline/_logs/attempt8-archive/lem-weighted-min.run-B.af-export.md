# Proof Export

## Node 1

**Statement:** Weighted minimum bound: let p_1, ..., p_m be positive reals with sum_i p_i = 1 and let n_1, ..., n_m be real numbers; then min over i in {1, ..., m} of n_i <= sum_i p_i * n_i.

**Type:** claim

**Inference:** assumption

**Status:** pending

**Taint:** unresolved

### Node 1.1

**Statement:** Let a = min_{1 <= i <= m} n_i; then a <= n_i for every i in {1, ..., m}.

**Type:** claim

**Inference:** by_definition

**Status:** validated

**Taint:** unresolved

### Node 1.2

**Statement:** For every i in {1, ..., m}, p_i a <= p_i n_i.

**Type:** claim

**Inference:** multiplication_by_positive

**Status:** validated

**Taint:** unresolved

### Node 1.3

**Statement:** Summing these inequalities over i gives a sum_{i=1}^m p_i <= sum_{i=1}^m p_i n_i.

**Type:** claim

**Inference:** summation_of_inequalities

**Status:** validated

**Taint:** unresolved

### Node 1.4

**Statement:** Since sum_{i=1}^m p_i = 1, a <= sum_{i=1}^m p_i n_i.

**Type:** claim

**Inference:** substitution

**Status:** validated

**Taint:** unresolved

### Node 1.5

**Statement:** Therefore min_{1 <= i <= m} n_i <= sum_{i=1}^m p_i n_i.

**Type:** claim

**Inference:** substitution

**Status:** validated

**Taint:** unresolved

