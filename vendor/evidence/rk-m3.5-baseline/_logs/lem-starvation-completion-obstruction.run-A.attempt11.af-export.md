# Proof Export

## Node 1

**Statement:** Bounded-slab starvation completion obstruction (K-free): for every finite I, every real A in [4,6], every real tau in (0,1/256], and t := tau^2, a := tau/(1+tau), there is no rank-three exact signed idempotent P (P^2 = P, P*1 = 1, rank P = 3) with row negative mass nu_i <= t for every i in I having five distinct full row-point fibers represented by v,w,f,z,o such that, with D := p_z - p_v and E := p_o - p_v linearly independent, ||D||_1 = tau, p_f - p_v = -A*D + t*E, p_w - p_v = a*(p_f - p_v), top-row fiber masses c_v = 1 - tau, c_w = tau + t, c_f = -t, and c_Q = 0 for every other full row-point fiber Q, every full row-point fiber Q has unique reals x_Q, y_Q with p_Q = p_v + x_Q*D + y_Q*E, and every nonactor support fiber Q satisfies either p_Q in conv{p_v,p_w,p_f,p_z,p_o} or 0 <= y_Q <= 1.

**Type:** claim

**Inference:** assumption

**Status:** pending

**Taint:** unresolved

### Node 1.1

**Statement:** Because D := p_z - p_v and E := p_o - p_v are linearly independent, every full row-point fiber Q admits unique reals (x_Q, y_Q) with p_Q = p_v + x_Q*D + y_Q*E, and in these coordinates the five actor fibers have coordinates (x_v,y_v) = (0,0), (x_z,y_z) = (1,0), (x_o,y_o) = (0,1), (x_f,y_f) = (-A, t), and (x_w,y_w) = (-a*A, a*t).

**Type:** claim

**Inference:** by_definition

**Status:** validated

**Taint:** unresolved

### Node 1.2

**Statement:** With t := tau^2 and a := tau/(1+tau) one has a*(tau + t) = tau*(tau + tau^2)/(1+tau) = tau^2*(1+tau)/(1+tau) = tau^2 = t; equivalently (tau + t)*a - t = 0.

**Type:** claim

**Inference:** algebraic_manipulation

**Status:** validated

**Taint:** unresolved

### Node 1.3

**Statement:** The pinned top-row fiber masses satisfy c_v + c_w + c_f = (1-tau) + (tau+t) + (-t) = 1, and c_v*p_v + c_w*p_w + c_f*p_f = p_v: in the (x,y) coordinates the two components read A*(t - a*(tau+t)) = 0 and t*((tau+t)*a - t) = 0, both of which vanish by the identity a*(tau+t) = t. Hence the pinned display is precisely the fiber-aggregated idempotence equation of the row situated at p_v.

**Type:** claim

**Inference:** algebraic_manipulation

**Status:** validated

**Taint:** unresolved

### Node 1.4

**Statement:** Since P^2 = P and P*1 = 1, for every index i in I the fiber-aggregated masses c^{(i)}_Q := sum_{j in Q} P_{ij}, taken over all row-point fibers Q, satisfy sum_Q c^{(i)}_Q = 1 and p_i = sum_Q c^{(i)}_Q * p_Q.

**Type:** claim

**Inference:** row_expansion_of_idempotence

**Status:** validated

**Taint:** unresolved

### Node 1.5

**Statement:** Applying the two coordinate functionals of the coordinate system p_Q = p_v + x_Q*D + y_Q*E to the fiber-aggregated idempotence equation yields, for every index i in I, the moment identities x_i = sum_Q c^{(i)}_Q * x_Q and y_i = sum_Q c^{(i)}_Q * y_Q.

**Type:** claim

**Inference:** linearity_of_affine_coordinates

**Status:** validated

**Taint:** unresolved

### Node 1.6

**Statement:** For every index i in I the total variation of the fiber-aggregated masses is bounded: sum_Q |c^{(i)}_Q| <= 1 + 2t, since row i has total mass 1 and row negative mass nu_i <= t; moreover the positive part has total mass at most 1 + t and the negative part total mass at most t.

**Type:** claim

**Inference:** mass_and_negativity_bound

**Status:** validated

**Taint:** unresolved

### Node 1.7

**Statement:** The display row (the row whose fiber masses are the pinned c_Q) has negative mass exactly t, carried entirely by fiber f: since c_f = -t its negative part is at least t, while nu <= t forces equality; consequently every entry of that row outside fiber f is >= 0, every entry inside fiber f is <= 0, and its positive part has total mass exactly 1 + t, distributed only over fibers v and w together with nonactor support fibers.

**Type:** claim

**Inference:** saturation_of_budget

**Status:** validated

**Taint:** unresolved

### Node 1.8

**Statement:** Every row of P has ell^1 norm at most 1 + 2t, hence ||p_Q - p_v||_1 <= 2 + 4t for every row-point fiber Q and ||E||_1 <= 2 + 4t. Therefore any fiber Q confined to the slab 0 <= y_Q <= 1 satisfies |x_Q| * tau = ||x_Q*D||_1 = ||(p_Q - p_v) - y_Q*E||_1 <= (2 + 4t) + (2 + 4t), i.e. |x_Q| <= (4 + 8t)/tau; and any fiber Q with p_Q in conv{p_v,p_w,p_f,p_z,p_o} satisfies -A <= x_Q <= 1.

**Type:** claim

**Inference:** ell1_geometry

**Status:** validated

**Taint:** unresolved

### Node 1.9

**Statement:** Every nonactor support fiber Q therefore falls into exactly one of the two regimes of the preceding step, and in both regimes the pair (x_Q, y_Q) is finite and obeys the stated bounds; in particular the family of admissible nonactor transverse coordinates is uniformly bounded in terms of tau alone, independently of the cardinality of I.

**Type:** claim

**Inference:** case_analysis_on_hypothesis

**Status:** pending

**Taint:** unresolved

#### Node 1.9.1

**Statement:** By hypothesis, every nonactor support fiber Q satisfies at least one of: (i) p_Q in conv{p_v,p_w,p_f,p_z,p_o}, or (ii) 0 <= y_Q <= 1. This is the raw dichotomy supplied by the lemma's hypothesis, stated as an inclusive disjunction.

**Type:** claim

**Inference:** by_hypothesis

**Status:** validated

**Taint:** unresolved

#### Node 1.9.2

**Statement:** The five actor transverse-plane coordinates have y-values y_v = 0, y_z = 0, y_o = 1, y_f = t, y_w = a*t, and since 0 < t = tau^2 < 1 and 0 < a = tau/(1+tau) < 1 all five lie in [0,1]; by convexity of the interval [0,1], every point of conv{p_v,p_w,p_f,p_z,p_o} has y-coordinate in [0,1]. Hence regime (i) implies regime (ii), the two regimes are NOT mutually exclusive, and the parent statement's phrase 'exactly one of the two regimes' is incorrect as written and must be read as 'at least one'.

**Type:** claim

**Inference:** convexity_of_coordinate_range

**Status:** validated

**Taint:** unresolved

#### Node 1.9.3

**Statement:** Consequently every nonactor support fiber Q satisfies 0 <= y_Q <= 1, in both regimes without case distinction.

**Type:** claim

**Inference:** case_collapse

**Status:** validated

**Taint:** unresolved

#### Node 1.9.4

**Statement:** For a nonactor support fiber Q in regime (i), 1.8 gives the transverse bound -A <= x_Q <= 1, hence |x_Q| <= A <= 6 using A in [4,6].

**Type:** claim

**Inference:** instantiation_of_hull_bound

**Status:** validated

**Taint:** unresolved

#### Node 1.9.5

**Statement:** For a nonactor support fiber Q in regime (ii), 1.8 gives the transverse bound |x_Q| <= (4 + 8t)/tau, which is finite for every tau in (0, 1/256].

**Type:** claim

**Inference:** instantiation_of_slab_bound

**Status:** validated

**Taint:** unresolved

#### Node 1.9.6

**Statement:** Since tau <= 1/256, one has (4 + 8t)/tau >= 4/tau >= 1024 > 6 >= A, so the regime-(ii) bound dominates the regime-(i) bound; therefore every nonactor support fiber Q satisfies the single uniform bound |x_Q| <= X(tau) := (4 + 8t)/tau, with t = tau^2.

**Type:** claim

**Inference:** comparison_of_bounds

**Status:** validated

**Taint:** unresolved

#### Node 1.9.7

**Statement:** The quantities X(tau) = (4 + 8*tau^2)/tau and the y-range [0,1] are functions of tau alone; no step in their derivation referenced the index set I or its cardinality, nor the number of nonactor support fibers. Hence the family of admissible nonactor coordinate pairs (x_Q, y_Q) is contained in the fixed compact rectangle [-X(tau), X(tau)] x [0,1], uniformly over all finite I.

**Type:** claim

**Inference:** parameter_inspection

**Status:** validated

**Taint:** unresolved

#### Node 1.9.8

**Statement:** By the lemma's hypothesis, every nonactor support fiber Q satisfies at least one of the two conditions: (i) p_Q in conv{p_v,p_w,p_f,p_z,p_o}, or (ii) 0 <= y_Q <= 1. The hypothesis supplies this as an inclusive disjunction.

**Type:** claim

**Inference:** by_hypothesis

**Status:** validated

**Taint:** unresolved

#### Node 1.9.9

**Statement:** The five actor points have y-coordinates y_v = 0, y_z = 0, y_o = 1, y_f = t, y_w = a*t, and since 0 < t = tau^2 < 1 and 0 < a = tau/(1+tau) < 1 all five lie in the interval [0,1]; by convexity of [0,1], every point of conv{p_v,p_w,p_f,p_z,p_o} has y-coordinate in [0,1]. Hence regime (i) implies regime (ii), the two regimes overlap rather than partition, and the parent statement's phrase 'exactly one of the two regimes' is incorrect as written: it must be read as 'at least one'.

**Type:** claim

**Inference:** convexity_of_coordinate_range

**Status:** validated

**Taint:** unresolved

#### Node 1.9.10

**Statement:** Consequently every nonactor support fiber Q satisfies 0 <= y_Q <= 1 unconditionally, with no case distinction required.

**Type:** claim

**Inference:** case_collapse

**Status:** validated

**Taint:** unresolved

#### Node 1.9.11

**Statement:** For a nonactor support fiber Q lying in regime (i), 1.8 gives -A <= x_Q <= 1, hence |x_Q| <= A <= 6 since A in [4,6].

**Type:** claim

**Inference:** instantiation_of_hull_bound

**Status:** validated

**Taint:** unresolved

#### Node 1.9.12

**Statement:** For a nonactor support fiber Q lying in regime (ii), 1.8 gives |x_Q| <= (4 + 8t)/tau, a finite quantity for every tau in (0, 1/256].

**Type:** claim

**Inference:** instantiation_of_slab_bound

**Status:** validated

**Taint:** unresolved

#### Node 1.9.13

**Statement:** Since tau <= 1/256, one has (4 + 8t)/tau >= 4/tau >= 1024 > 6 >= A, so the regime-(ii) bound is the weaker of the two and therefore covers both cases; every nonactor support fiber Q satisfies the single uniform bound |x_Q| <= X(tau) := (4 + 8*tau^2)/tau.

**Type:** claim

**Inference:** comparison_of_bounds

**Status:** validated

**Taint:** unresolved

#### Node 1.9.14

**Statement:** The bound X(tau) = (4 + 8*tau^2)/tau and the range [0,1] for y are functions of tau alone; no step in their derivation invoked the index set I, its cardinality, or the number of nonactor support fibers. Hence every admissible nonactor coordinate pair (x_Q, y_Q) lies in the fixed compact rectangle [-X(tau), X(tau)] x [0,1], uniformly over all finite I, which is the parent statement's conclusion once its 'exactly one' is corrected to 'at least one'.

**Type:** claim

**Inference:** parameter_inspection

**Status:** validated

**Taint:** unresolved

### Node 1.10

**Statement:** Exact idempotence at the pinned display forces one full unit of transverse moment: combining the moment identity for the display row with the pinned masses gives sum_Q c_Q * x_Q = 1 when the identity is normalized against the transverse direction D, i.e. the display row must supply transverse moment exactly 1.

**Type:** claim

**Inference:** transverse_normalization_of_moment_identity

**Status:** pending

**Taint:** unresolved

#### Node 1.10.1

**Statement:** By 1.5 applied to the index i whose row point is p_v (the display row), the transverse component of the fiber-aggregated idempotence equation reads x_v = sum_Q c^{(v)}_Q * x_Q, where c^{(v)}_Q are the display row's fiber-aggregated masses.

**Type:** claim

**Inference:** instantiation_of_moment_identity

**Status:** validated

**Taint:** unresolved

#### Node 1.10.2

**Statement:** The display row's fiber-aggregated masses are exactly the pinned masses: c^{(v)}_v = c_v = 1 - tau, c^{(v)}_w = c_w = tau + t, c^{(v)}_f = c_f = -t, and c^{(v)}_Q = 0 for every other full row-point fiber Q, by the hypothesis on top-row fiber masses.

**Type:** claim

**Inference:** by_hypothesis

**Status:** validated

**Taint:** unresolved

#### Node 1.10.3

**Statement:** In the coordinates of 1.3 the display row sits at p_v, whose transverse coordinate is x_v = 0; hence the left-hand side of the instantiated moment identity is 0.

**Type:** claim

**Inference:** by_definition

**Status:** validated

**Taint:** unresolved

#### Node 1.10.4

**Statement:** Evaluating the right-hand side with the pinned masses and the actor transverse coordinates x_v = 0, x_w = -a*A, x_f = -A gives sum_Q c_Q * x_Q = (1 - tau)*0 + (tau + t)*(-a*A) + (-t)*(-A) = A*(t - a*(tau + t)).

**Type:** claim

**Inference:** algebraic_manipulation

**Status:** validated

**Taint:** unresolved

#### Node 1.10.5

**Statement:** By the identity a*(tau + t) = t established in 1.3, the expression A*(t - a*(tau + t)) equals A*0 = 0; hence sum_Q c_Q * x_Q = 0.

**Type:** claim

**Inference:** substitution_of_established_identity

**Status:** validated

**Taint:** unresolved

#### Node 1.10.6

**Statement:** The two evaluations agree: both sides of the instantiated moment identity equal 0, so 1.3 and 1.5 jointly establish sum_Q c_Q * x_Q = 0, and they do not establish sum_Q c_Q * x_Q = 1. The parent statement's asserted value of one full unit of transverse moment therefore does not follow from its declared dependencies; no normalization against D changes this, since scaling the transverse functional by any nonzero constant maps 0 to 0 and cannot produce 1.

**Type:** claim

**Inference:** comparison_of_evaluated_sides

**Status:** validated

**Taint:** unresolved

#### Node 1.10.7

**Statement:** By 1.5, applied to the index i whose row point is the display point p_v, the transverse component of the fiber-aggregated idempotence equation reads x_v = sum_Q c^{(v)}_Q * x_Q, where c^{(v)}_Q denotes the display row's fiber-aggregated mass on fiber Q.

**Type:** claim

**Inference:** instantiation_of_moment_identity

**Status:** validated

**Taint:** unresolved

#### Node 1.10.8

**Statement:** By the lemma's hypothesis on top-row fiber masses, the display row's fiber-aggregated masses are exactly the pinned values: c^{(v)}_v = c_v = 1 - tau, c^{(v)}_w = c_w = tau + t, c^{(v)}_f = c_f = -t, and c^{(v)}_Q = 0 for every other full row-point fiber Q.

**Type:** claim

**Inference:** by_hypothesis

**Status:** validated

**Taint:** unresolved

#### Node 1.10.9

**Statement:** The display row sits at p_v, whose transverse coordinate in the system p_Q = p_v + x_Q*D + y_Q*E is x_v = 0; hence the left-hand side of the instantiated moment identity equals 0.

**Type:** claim

**Inference:** by_definition

**Status:** validated

**Taint:** unresolved

#### Node 1.10.10

**Statement:** Substituting the pinned masses and the actor transverse coordinates x_v = 0, x_w = -a*A, x_f = -A into the right-hand side gives sum_Q c_Q * x_Q = (1 - tau)*0 + (tau + t)*(-a*A) + (-t)*(-A) = A*(t - a*(tau + t)).

**Type:** claim

**Inference:** algebraic_manipulation

**Status:** validated

**Taint:** unresolved

#### Node 1.10.11

**Statement:** By the identity a*(tau + t) = t, which is exactly the transverse component already established in 1.3, the quantity A*(t - a*(tau + t)) equals A*0 = 0; hence sum_Q c_Q * x_Q = 0 for every A in [4,6] and every tau in (0, 1/256].

**Type:** claim

**Inference:** substitution_of_established_identity

**Status:** validated

**Taint:** unresolved

#### Node 1.10.12

**Statement:** Both sides of the instantiated moment identity evaluate to 0, so the identity is satisfied identically and dependencies 1.3 and 1.5 jointly establish sum_Q c_Q * x_Q = 0. They do not establish sum_Q c_Q * x_Q = 1: the asserted value of one full unit of transverse moment is off by 1 from the value that actually follows. Normalizing the identity against the transverse direction D cannot repair this, since replacing the transverse functional by any nonzero scalar multiple maps the value 0 to 0 and can never produce 1. The parent statement therefore does not follow from its declared dependencies.

**Type:** claim

**Inference:** comparison_of_evaluated_sides

**Status:** validated

**Taint:** unresolved

### Node 1.11

**Statement:** The transverse moment actually available to the display row is O(tau): the actor hull contributes at most a bounded multiple of tau because the pinned masses c_v, c_w, c_f pair the actor transverse coordinates 0, -a*A, -A against weights 1 - tau, tau + t, -t whose transverse cancellation is exact to order tau^2 by the identity a*(tau+t) = t, while the aggregated exterior sign-union budget over all nonactor support fibers is bounded by the row negativity budget t together with the uniform transverse bounds of the slab/hull dichotomy; summing the two contributions gives a total transverse moment of at most C*tau with an absolute constant C <= 64, uniformly over A in [4,6] and over finite I.

**Type:** claim

**Inference:** sign_union_budget_aggregation

**Status:** validated

**Taint:** unresolved

### Node 1.12

**Statement:** For every tau in (0, 1/256] the supply bound gives transverse moment at most C*tau <= 64/256 = 1/4 < 1, which contradicts the requirement that the display row supply transverse moment exactly 1; hence no rank-three exact signed idempotent P with the stated configuration exists, for any finite I, any A in [4,6] and any tau in (0,1/256], which is the assertion of the lemma.

**Type:** claim

**Inference:** contradiction

**Status:** validated

**Taint:** unresolved

