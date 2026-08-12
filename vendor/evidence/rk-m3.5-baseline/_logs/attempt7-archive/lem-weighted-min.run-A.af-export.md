# Proof Export

## Node 1

**Statement:** Weighted minimum bound: let p_1, ..., p_m be positive reals with sum_i p_i = 1 and let n_1, ..., n_m be real numbers; then min over i in {1, ..., m} of n_i <= sum_i p_i * n_i.

**Type:** claim

**Inference:** assumption

**Status:** pending

**Taint:** unresolved

### Node 1.1

**Statement:** The index set {1, ..., m} is nonempty and finite, hence mu := min over i in {1,...,m} of n_i exists and is attained.

**Type:** claim

**Inference:** finite_nonempty_set_attains_minimum

**Status:** validated

**Taint:** unresolved

### Node 1.2

**Statement:** For every i in {1, ..., m}, mu <= n_i.

**Type:** claim

**Inference:** by_definition_of_minimum

**Status:** pending

**Taint:** unresolved

#### Node 1.2.1

**Statement:** mu is defined as min over i in {1, ..., m} of n_i, i.e. mu is the least element of the finite set S = {n_1, ..., n_m}.

**Type:** claim

**Inference:** by_definition_of_mu

**Status:** pending

**Taint:** unresolved

#### Node 1.2.2

**Statement:** By definition of the minimum of a set, mu is a lower bound for S: for every x in S, mu <= x.

**Type:** claim

**Inference:** by_definition_of_minimum

**Status:** pending

**Taint:** unresolved

#### Node 1.2.3

**Statement:** For every i in {1, ..., m}, n_i is an element of S.

**Type:** claim

**Inference:** by_definition_of_S

**Status:** pending

**Taint:** unresolved

#### Node 1.2.4

**Statement:** For every i in {1, ..., m}, mu <= n_i.

**Type:** claim

**Inference:** universal_instantiation

**Status:** pending

**Taint:** unresolved

### Node 1.3

**Statement:** For every i in {1, ..., m}, p_i * mu <= p_i * n_i.

**Type:** claim

**Inference:** multiplication_by_positive

**Status:** pending

**Taint:** unresolved

#### Node 1.3.1

**Statement:** Fix an arbitrary i in {1, ..., m}.

**Type:** claim

**Inference:** universal_generalization_setup

**Status:** pending

**Taint:** unresolved

#### Node 1.3.2

**Statement:** mu <= n_i.

**Type:** claim

**Inference:** by_definition_of_minimum

**Status:** pending

**Taint:** unresolved

#### Node 1.3.3

**Statement:** p_i > 0, hence in particular p_i >= 0.

**Type:** claim

**Inference:** hypothesis_p_i_positive

**Status:** pending

**Taint:** unresolved

#### Node 1.3.4

**Statement:** p_i * mu <= p_i * n_i.

**Type:** claim

**Inference:** multiplication_by_nonnegative_preserves_inequality

**Status:** pending

**Taint:** unresolved

#### Node 1.3.5

**Statement:** Since i was arbitrary, for every i in {1, ..., m}, p_i * mu <= p_i * n_i.

**Type:** claim

**Inference:** universal_generalization

**Status:** pending

**Taint:** unresolved

### Node 1.4

**Statement:** sum_i p_i * mu <= sum_i p_i * n_i.

**Type:** claim

**Inference:** summation_of_finitely_many_inequalities

**Status:** pending

**Taint:** unresolved

#### Node 1.4.1

**Statement:** For every i in {1, ..., m}, the termwise inequality p_i * mu <= p_i * n_i holds.

**Type:** claim

**Inference:** termwise_hypothesis_from_multiplication_by_positive

**Status:** pending

**Taint:** unresolved

#### Node 1.4.2

**Statement:** If a_i <= b_i for all i in a finite index set I, then sum over i in I of a_i <= sum over i in I of b_i.

**Type:** claim

**Inference:** finite_sum_monotonicity_by_induction_on_|I|

**Status:** pending

**Taint:** unresolved

#### Node 1.4.3

**Statement:** Instantiate the finite-sum monotonicity principle with I = {1, ..., m}, a_i = p_i * mu, b_i = p_i * n_i.

**Type:** claim

**Inference:** universal_instantiation

**Status:** pending

**Taint:** unresolved

#### Node 1.4.4

**Statement:** sum_i p_i * mu <= sum_i p_i * n_i.

**Type:** claim

**Inference:** modus_ponens

**Status:** pending

**Taint:** unresolved

### Node 1.5

**Statement:** sum_i p_i * mu = mu * sum_i p_i = mu * 1 = mu.

**Type:** claim

**Inference:** algebraic_manipulation_using_sum_i_p_i_eq_1

**Status:** validated

**Taint:** unresolved

### Node 1.6

**Statement:** mu <= sum_i p_i * n_i, i.e. min over i in {1,...,m} of n_i <= sum_i p_i * n_i.

**Type:** claim

**Inference:** substitution_into_inequality

**Status:** pending

**Taint:** unresolved

#### Node 1.6.1

**Statement:** sum_i p_i * mu <= sum_i p_i * n_i.

**Type:** claim

**Inference:** finite_sum_monotonicity_applied_termwise

**Status:** pending

**Taint:** unresolved

#### Node 1.6.2

**Statement:** sum_i p_i * mu = mu * sum_i p_i.

**Type:** claim

**Inference:** distributivity_factoring_constant_out_of_finite_sum

**Status:** pending

**Taint:** unresolved

#### Node 1.6.3

**Statement:** sum_i p_i = 1, hence mu * sum_i p_i = mu * 1 = mu.

**Type:** claim

**Inference:** hypothesis_weights_sum_to_one_and_multiplicative_identity

**Status:** pending

**Taint:** unresolved

#### Node 1.6.4

**Statement:** sum_i p_i * mu = mu.

**Type:** claim

**Inference:** transitivity_of_equality

**Status:** pending

**Taint:** unresolved

#### Node 1.6.5

**Statement:** mu <= sum_i p_i * n_i.

**Type:** claim

**Inference:** rewriting_left_side_of_inequality_by_equal_term

**Status:** pending

**Taint:** unresolved

#### Node 1.6.6

**Statement:** mu = min over i in {1,...,m} of n_i, hence min over i in {1,...,m} of n_i <= sum_i p_i * n_i.

**Type:** claim

**Inference:** by_definition_of_mu

**Status:** pending

**Taint:** unresolved

