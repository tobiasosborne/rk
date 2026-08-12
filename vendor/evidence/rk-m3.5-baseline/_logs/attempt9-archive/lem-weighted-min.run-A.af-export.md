# Proof Export

## Node 1

**Statement:** Weighted minimum bound: let p_1, ..., p_m be positive reals with sum_i p_i = 1 and let n_1, ..., n_m be real numbers; then min over i in {1, ..., m} of n_i <= sum_i p_i * n_i.

**Type:** claim

**Inference:** assumption

**Status:** pending

**Taint:** unresolved

### Node 1.1

**Statement:** The index set {1, ..., m} is finite and nonempty, so the minimum n_k := min over i in {1, ..., m} of n_i is attained at some index k in {1, ..., m}.

**Type:** claim

**Inference:** finite_nonempty_set_attains_minimum

**Status:** validated

**Taint:** unresolved

### Node 1.2

**Statement:** For every i in {1, ..., m}, n_k <= n_i.

**Type:** claim

**Inference:** by_definition of minimum

**Status:** validated

**Taint:** unresolved

### Node 1.3

**Statement:** For every i in {1, ..., m}, p_i * n_k <= p_i * n_i.

**Type:** claim

**Inference:** multiplication_by_positive (p_i > 0)

**Status:** validated

**Taint:** unresolved

### Node 1.4

**Statement:** sum_i p_i * n_k <= sum_i p_i * n_i.

**Type:** claim

**Inference:** summation of finitely many inequalities (monotonicity of finite sums)

**Status:** validated

**Taint:** unresolved

### Node 1.5

**Statement:** sum_i p_i * n_k = n_k * sum_i p_i.

**Type:** claim

**Inference:** algebraic_manipulation (distributivity / factoring the constant n_k out of the sum)

**Status:** validated

**Taint:** unresolved

### Node 1.6

**Statement:** n_k * sum_i p_i = n_k, since sum_i p_i = 1.

**Type:** claim

**Inference:** substitution of the hypothesis sum_i p_i = 1 and multiplicative identity

**Status:** validated

**Taint:** unresolved

### Node 1.7

**Statement:** n_k <= sum_i p_i * n_i.

**Type:** claim

**Inference:** chaining the equalities of #4 and #5 with the inequality of #3 (transitivity)

**Status:** pending

**Taint:** unresolved

#### Node 1.7.1

**Statement:** sum_i p_i * n_k = n_k.

**Type:** claim

**Inference:** transitivity of equality applied to 1.5 (sum_i p_i * n_k = n_k * sum_i p_i) and 1.6 (n_k * sum_i p_i = n_k)

**Status:** validated

**Taint:** unresolved

#### Node 1.7.2

**Statement:** n_k <= sum_i p_i * n_i.

**Type:** claim

**Inference:** rewriting the left-hand side of 1.4 (sum_i p_i * n_k <= sum_i p_i * n_i) using the equality of #0

**Status:** validated

**Taint:** unresolved

#### Node 1.7.3

**Statement:** sum_i p_i * n_k = n_k * sum_i p_i and n_k * sum_i p_i = n_k both hold.

**Type:** claim

**Inference:** conjunction of the established equalities 1.5 and 1.6

**Status:** validated

**Taint:** unresolved

#### Node 1.7.4

**Statement:** sum_i p_i * n_k = n_k.

**Type:** claim

**Inference:** transitivity of equality

**Status:** validated

**Taint:** unresolved

#### Node 1.7.5

**Statement:** The left-hand side of the established inequality sum_i p_i * n_k <= sum_i p_i * n_i may be replaced by n_k.

**Type:** claim

**Inference:** substitution of equals into an inequality

**Status:** validated

**Taint:** unresolved

#### Node 1.7.6

**Statement:** n_k <= sum_i p_i * n_i.

**Type:** claim

**Inference:** conclusion of the substitution

**Status:** validated

**Taint:** unresolved

##### Node 1.7.6.1

**Statement:** n_k <= sum_i p_i * n_i.

**Type:** claim

**Inference:** restatement of 1.7.5, whose content is exactly that this inequality holds after the substitution it licenses; no further decomposition is possible

**Status:** validated

**Taint:** unresolved

###### Node 1.7.6.1.1

**Statement:** General substitution principle for order relations: for real numbers a, b, c, if a = b and a <= c, then b <= c.

**Type:** claim

**Inference:** Leibniz substitution of equals (primitive rule of equality); terminal, no further decomposition

**Status:** validated

**Taint:** unresolved

###### Node 1.7.6.1.2

**Statement:** n_k <= sum_i p_i * n_i.

**Type:** claim

**Inference:** instantiation of #0 with a = sum_i p_i * n_k, b = n_k, c = sum_i p_i * n_i, applied to the substitution licensed by 1.7.5; this node is atomic and any further child would be a verbatim restatement

**Status:** validated

**Taint:** unresolved

###### Node 1.7.6.1.3

**Statement:** n_k <= sum_i p_i * n_i, obtained by rewriting the left-hand side of the inequality sum_i p_i * n_k <= sum_i p_i * n_i using the equality sum_i p_i * n_k = n_k.

**Type:** claim

**Inference:** Leibniz substitution of equals into an order relation (primitive rule); TERMINAL LEAF — this node has now been requested twice with identical statement and dependency set, and it is an atomic one-step substitution from 1.7.5, so no non-restating decomposition exists; the expansion loop should stop here

**Status:** validated

**Taint:** unresolved

##### Node 1.7.6.2

**Statement:** n_k <= sum_i p_i * n_i, obtained by rewriting the left-hand side of sum_i p_i * n_k <= sum_i p_i * n_i using the equality sum_i p_i * n_k = n_k.

**Type:** claim

**Inference:** Leibniz substitution of equals into an order relation (primitive rule); TERMINAL LEAF — node 1.7.6 and its child 1.7.6.1 have now been requested five times total with identical statements and dependency sets, and each expansion can only restate the same atomic one-step substitution from 1.7.5; the expansion loop is not converging and should be halted

**Status:** validated

**Taint:** unresolved

### Node 1.8

**Statement:** min over i in {1, ..., m} of n_i <= sum_i p_i * n_i.

**Type:** claim

**Inference:** substitution of n_k = min over i of n_i

**Status:** validated

**Taint:** unresolved

