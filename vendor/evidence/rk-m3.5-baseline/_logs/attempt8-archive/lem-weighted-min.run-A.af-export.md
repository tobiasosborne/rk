# Proof Export

## Node 1

**Statement:** Weighted minimum bound: let p_1, ..., p_m be positive reals with sum_i p_i = 1 and let n_1, ..., n_m be real numbers; then min over i in {1, ..., m} of n_i <= sum_i p_i * n_i.

**Type:** claim

**Inference:** assumption

**Status:** pending

**Taint:** unresolved

### Node 1.1

**Statement:** The index set {1, ..., m} is finite and nonempty, so the minimum mu := min over i in {1, ..., m} of n_i exists and is attained at some index.

**Type:** claim

**Inference:** finite_nonempty_set_attains_minimum

**Status:** validated

**Taint:** unresolved

### Node 1.2

**Statement:** For every i in {1, ..., m}, n_i >= mu.

**Type:** claim

**Inference:** by_definition of minimum

**Status:** validated

**Taint:** unresolved

### Node 1.3

**Statement:** For every i in {1, ..., m}, p_i * n_i >= p_i * mu.

**Type:** claim

**Inference:** multiplication_by_positive (p_i > 0)

**Status:** validated

**Taint:** unresolved

### Node 1.4

**Statement:** sum_i p_i * n_i >= sum_i p_i * mu.

**Type:** claim

**Inference:** summation of finitely many inequalities

**Status:** validated

**Taint:** unresolved

### Node 1.5

**Statement:** sum_i p_i * mu = mu * sum_i p_i.

**Type:** claim

**Inference:** distributivity / factoring a constant out of a finite sum

**Status:** validated

**Taint:** unresolved

### Node 1.6

**Statement:** mu * sum_i p_i = mu * 1 = mu.

**Type:** claim

**Inference:** substitution using sum_i p_i = 1

**Status:** validated

**Taint:** unresolved

### Node 1.7

**Statement:** sum_i p_i * mu = mu.

**Type:** claim

**Inference:** transitivity of equality

**Status:** validated

**Taint:** unresolved

### Node 1.8

**Statement:** min over i in {1, ..., m} of n_i = mu <= sum_i p_i * n_i.

**Type:** claim

**Inference:** chaining the inequality with the evaluated sum

**Status:** validated

**Taint:** unresolved

