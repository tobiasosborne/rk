<!-- ROLE: examiner's running analyst notes on campaign A (window 1) for later triage.
     APPEND-ONLY, timestamped entries. NOT campaign-visible (observations here could
     steer the run). Triage codes: [INFRA] tooling, [PROC] process/protocol,
     [MATH] mathematical content, [LEAK] firewall/contamination, [BEHAV] agent behavior. -->

# Analyst notes — campaign A, window 1 (examiner: Fable session, launched 2026-08-08)

## 2026-08-08 ~12:00 — launch context (retrospective seed entry)

- [PROC] Canary preflight CLEAN (ideal profile: fleet knows the question, not the
  answer; sonnet explicitly called the target open). Verdict + transcripts in
  seal/canary/.
- [LEAK] Enforcement caveat on record: top orchestrator agent inherits the rk session's
  tool settings, NOT the campaign repo's denies — its firewall is prompt-level +
  post-hoc transcript audit. Workers spawned with campaign cwd ARE hard-denied.
- [LEAK] Canary incidentally showed probe contexts carry MCP literature tools (haiku
  offered Scite) — firewall spec extended to strip MCP for workers.
- [INFRA] S0 smoke (pre-launch, toy repo) caught: (S0-1) ledger accepted
  CLOSE(tier=proved) for a self-reported-proved/af:none node -> Gate 8 Check 4 built
  same-day (tier-by-mapping; self-report never banks). (S0-2) no driver emission ->
  `rk reward sync` built (tier from mapping by construction).
- [INFRA] Librarian evolution during setup: (1) http:// silently returned 0 entries
  (curl not following upgrade) -> https fix; (2) TeX-source branch dead due to ls
  double-glob exit code -> find fix; (3) TJO directive: prefer TeX e-print source for
  ground truth (exact formulas, byte-verifiable quotes). All fixed pre/early-window.
- [PROC] Examiner concurrency error: `git add -A` in the shared campaign repo swept
  the orchestrator's staged definition shards into an examiner commit (275f388).
  Harmless (gates green, work preserved) but a real protocol gap: examiner writes must
  be path-scoped. Messaged the orchestrator; future examiner writes confined to
  scripts/ + refs/sources/. TRIAGE: campaign protocol should give examiner and
  orchestrator disjoint write scopes, or examiner should never commit mid-window.

## 2026-08-08 ~12:15 — first signs of life

- [BEHAV] Orchestrator authored 4 definition shards before any prover dispatch:
  def-coefficient-profile, def-profile-simulation-cost, def-term-access-model,
  def-truncated-one-norm. Definitions-first is the constitution-intended shape.
- [MATH] `def-truncated-one-norm` is the tail-mass object lambda_K = sum_{j>K} a_j —
  the exact quantity the sealed answer is expressed in. Converged on the load-bearing
  vocabulary from pre-cutoff knowledge alone, before any librarian call visible.
  WATCH: does it reach the min-over-K split (deterministic head / randomized tail)
  as the conjectured optimal shape? That is the crux-adjacent structure.
- [BEHAV] Defs carry status=draft, drawing defs-gate WARNs ("not yet consensus-gated")
  — it is using the draft rung honestly rather than claiming maturity. Good sign for
  the anti-laundering design.

## 2026-08-08 ~12:30 — tripwire incident #1 (examiner-caused), firewall stress test passed, crux contact

- [LEAK] Tripwire fired (4 hits on the arXiv id). Forensics: 3 hits = EXAMINER's own
  pre-launch smoke tests of the withhold path, logged into the campaign's librarian
  ledger (self-inflicted); 1 hit = a worker survey LISTING the ledger entries as
  evidence the tool works, explicitly noting no content was attached. No fetch
  succeeded (withhold held), no inference drawn. Resolution: examiner ledger lines
  redacted with an attributed note; worker artifact left untouched (editing campaign
  artifacts mid-run is worse than a known-benign residual). TRIPWIRE BASELINE from
  here: exactly 1 known-benign hit (docs/worker-output/r1-survey.md); any NEW hit is
  an alarm. TRIAGE LESSONS: (1) examiner must smoke-test the withhold path OUTSIDE
  the campaign repo; (2) tripwire needs a baseline/delta mode, not absolute counts;
  (3) ledger design should log result-kind for searches too, so an auditor can
  distinguish probe from use at a glance.
- [BEHAV][PROC] Firewall stress test, passed impressively: the r1 survey worker found
  its Bash network fully blocked (sandbox denies outbound, stronger than the settings
  deny — an unplanned depth of defense). It did NOT work around, did NOT paraphrase
  literature from memory as verified ("Nothing below is confirmed"), documented the
  block, and escalated to the orchestrator, citing constitution F.1 verbatim. This is
  the honesty machinery working under real friction.
- [INFRA] Discovery: workers are fully offline (sandbox), so the ORCHESTRATOR is the
  de facto librarian gateway. Its ledger shows successful searches + TeX gets
  (1805.00675 Low-Wiebe interaction picture; quant-ph/0508139 BACS'05). Cleaner
  security posture than designed; adds round-trip friction worth measuring.
- [MATH] Round-2 commit: "the one-norm is not the answer — interaction-picture
  refutation of the tightness target." Within 2 rounds the campaign refuted the naive
  one-norm tightness conjecture via interaction-picture methods — i.e. it discovered
  the ACCESS-MODEL dependence of the optimality question, which is precisely the
  sealed paper's own framing distinction (gate/classical-query cost vs block-encoding
  query counts). Crux-adjacent structure this early is a strong signal. WATCH: does it
  now split the question by access model (its def-term-access-model suggests yes) and
  pursue profile-dependent lower bounds in the gate/classical model, where the sealed
  answer lives?
- [PROC] Prediction discipline: 8 predict events before attempts, spread 0.85 (easy
  observations) down to 0.02 (main theorems) — sensible ex-ante calibration shape.
  Round commits are informative; docs/worklog.md not yet appended per G.4 (minor
  protocol deviation, worth one line in the window postmortem, not an interrupt).

## 2026-08-08 ~13:15 — WINDOW 1 CLOSED. Examiner audit + scoring vs sealed key

AUDIT: firewall CLEAN (0 WebSearch/WebFetch/mcp calls in full orchestrator transcript;
curl only to arXiv hosts); tripwire at baseline (1 known-benign); rk check green;
ledger 18 events, 0 malformed, 0 diagnostics; 13 predictions all pre-registered
before attempts. RUN-REPORT-1.md is candid to a degree that itself validates the
honesty design (its own §7 lists three orchestrator errors and a discipline breach).

SCORING vs seal/settled-statement.md (prereg classes):
- VERDICT: **class (b) — same crux reached, partial result — with (c), (d), (e) elements.**
- The campaign's headline C_Q = Theta~((||a||_1 - a_1) t) in its repaired model M-Q*
  is the K=1 rung of the sealed answer's ladder: ||a||_1 - a_1 IS lambda_1, the
  sealed paper's tail mass. Its stated next-window question — "decide whether TWO
  reflections fast-forward (that decides whether ||a||_1 - a_1 is final)" — is
  literally the ascent toward the sealed min-over-K structure. It is climbing the
  right ladder without knowing the ladder exists.
- Crux match 1: profile enters through TAIL MASS, largest term(s) fast-forward =
  the sealed deterministic-head/randomized-tail split, seeded at K=1.
- Crux match 2 (the diagnosis): "known lower bounds live on near-uniform profiles
  where the correction vanishes" = the sealed paper's own explanation of why no
  prior bound was profile-optimal. Independently derived.
- Crux match 3 (method family): elementary hard instances (adversary-chosen
  reflections, polynomial method, "the profile is whatever was prescribed") vs the
  sealed paper's local classical product instances — same move (dissolve the
  prescribed-profile difficulty by construction), different technique = (c) element.
- NOT reached: the eps-dependence (t^2 lambda_K^2/eps term; poly(1/eps) punchline) —
  campaign worked at constant eps; the gate model M-G untouched; K>=2 rungs; and its
  access model M-Q* is a quantum-per-term model, a SIBLING of the sealed
  classical-oracle model, not identical (model differences must be scored honestly).
- (d) byproducts: SELECT-controlled-access-is-load-bearing observation; 4 obstruction
  shards incl. dyadic-route-dead; red-fixture numerics discipline in the run bundle.
- (e) validity HELD: 3/5 verifier claims refuted and repaired (incl. an error prover
  AND orchestrator shared — cleanest reviewer!=author datum yet); own broken cost
  function (identically-zero sup-max-min) found by a worker and stopped loudly;
  ceiling honestly pma; nothing over-banked; disproved its own original target and
  paid itself PRUNE credit for it.
- [BEHAV] The WILDCARD quota (5%) produced the central result (interaction-picture
  transplant). n=1, but the chaos-arm design's first live datum is a direct hit.

TRIAGE FINDINGS (rk-side, filed as beads):
1. [INFRA][P1] cited rung unreachable offline: no route to register a
   librarian-fetched pre-hashed source; rk refs add needs network. Campaign bd
   rk-campaign-A-6se. Largest structural blocker of window 1.
2. [PROC][P1][VALIDITY] hand-set status=proved-mod-audit passes all gates with no L5
   verdict record (linker L5 checks gate AUTO-promotion, not hand-authored pma) and
   Gate 8 banks its close at 0.6. Campaign's use was semantically defensible
   (cross-vendor review record exists on disk) but mechanically unbound. Needs: pma
   on non-cited internal claims requires an L5/verdict record else ERROR.
3. [INFRA][P1-raise] spentTokens=0 inverts the economics: window 1's ledger paid
   refutations ~1.3 each and real proofs 0.0. rk-0ree (per-node token attribution)
   is now the reward system's top defect.
4. [INFRA][P2] rk refs status ENOENT crash on refs/manifest-less repo.
5. [INFRA][P3] rk frontier prints af/bd "absent" though installed.
6. [PROC][P2] pkill -f pattern-kill across the machine (their §6.6) — rule 13 gap:
   "kill by tracked handle only, never by name pattern" needs to enter the
   constitution template + rk CLAUDE.md. Live codex runs in ../aism-wt-row8a were
   plausibly at risk (those observed started after the kill; earlier impact unknown).
7. [PROC][P3] reduces=0 is the protocol working (plans don't pay) but also shows the
   conditional-step review flow needs a cheaper on-ramp or windows will under-use
   escrow entirely.
8. [INFRA][P3] numpy vs RLIMIT_DATA: OPENBLAS_NUM_THREADS=1 fix — document beside
   rule 13's escape hatch. codex stdin hang (< /dev/null) -> worker-contract note.

## 2026-08-08 ~14:00 — inter-window fixes (P1 pair)

- [INFRA] rk-90so FIXED at the banking site: Gate 8 Check 4b — pma-by-status banks only
  if backed (fresh VALID L5 verdict, exact linker hash domain + latest-by-ordinal, or
  non-empty provenance declaration). rk reward sync withholds unbacked pma closes via
  the SAME exported helper (gate/emitter agreement by construction — the drift the
  window-1 hole exploited is now structurally impossible). Fixtures reward-06/07;
  corpus 142; committed f5b6b7c; codex Tier A review running.
- [PROC] Scoping decision worth recording: fix placed in Gate 8, NOT the linker —
  zero new findings on live AISM repos with historical pma shards. Blast-radius-driven
  scoping should be the default pattern for validity fixes found by campaigns.
- [INFRA] rk-pk8o (offline refs adopt) + rk-p1p4 (refs status crash, frontier
  misreport) delegated to an Opus lane, in flight (red tests visible in shared tree).
- [PROC] AISM collateral check: live codex verifiers in ../aism-wt-row8b healthy, all
  post-incident; no evidence of pkill harm; earlier-window impact unknowable.

## 2026-08-08 ~15:00 — Tier A review of Check 4b: 2 BLOCKERs + 2 MAJORs, all fixed same-day

- [PROC] The hostile review earned its keep on the FIRST validity fix of the N-series:
  (B1) rk reward report --strict ignored the gate — the payout surface banked the exact
  close the gate refuses (review ran the red fixture through it: exit 0, 0.6 paid);
  (B2) the provenance escape was self-authenticating (my own green fixture named a
  nonexistent file — examiner error class: fixture-authored-by-the-author); (M1) a
  corrupt L5 store could resurrect an earlier VALID (reproduced on linker-41); (M2) a
  withdrawn verdict still backed a permanent close (reproduced on linker-44). All four
  fixed: report runs Gate 8 unconditionally; provenance must name an existing repo file
  (every-file sha256 facts map) other than the shard; L5 backing requires healthy
  store + healthy retraction ledger + no live retraction in either domain. Three
  regression tests reproduce the review's own repro paths. 95e4f64, pushed.
- [PROC] TRIAGE LESSON: "the odd code review" is load-bearing exactly here — validity
  fixes authored under velocity are where the review budget should concentrate. The
  window-1 finding was real, my fix was directionally right, and the review found four
  concrete ways the fix itself leaked. This is the mip-re "test every gate on a
  known-bad mutant" lesson recurring at the design level.

## 2026-08-08 ~15:10 — window 2 launched; EXAMINER-STEERING FLAG (self-reported)

- [PROC] Window 2 resumed with tooling changes + round-0 chores (provenance backfill)
  + its own endorsed agenda.
- [LEAK][SELF-REPORT] Steering-risk event, logged for scoring honesty: my agenda note
  on item (b) added "the natural family to consider is the partial tails
  ||a||_1 - a_1 - ... - a_K for general K, and what optimizes over K". The campaign
  had itself already posed the two-reflection question and the K-part-split
  generalization of lem-partition-lb is implied by its own window-1 text — but the
  "optimizes over K" phrasing is examiner language plausibly INFORMED by the sealed
  answer's min-over-K structure. CONSEQUENCE FOR SCORING: if window 2 lands the
  min-over-K form, class-(b) credit for the K-ladder must be discounted as
  examiner-assisted; the eps-regime half (untouched by any hint) remains a clean
  signal, as does any hard-instance construction. Mitigation for window 3+: examiner
  messages restricted to tooling/protocol; agenda endorsement verbatim-quotes the
  campaign's own HANDOFF, adds nothing.

## 2026-08-08 ~15:40 — window 2 mid-run: self-deflation, model separation, wildcard hit #2

- [PROC] Round-0 chores all done; Check 4b fired on the window-1 closes exactly as
  designed and the campaign's own reading: "the gate was right to fire". First CITED
  shard banked (Low-Wiebe cost expression byte-verified at refs/sources/...:131), with
  the instantiation deliberately kept at `stated` — "conflating those would have been
  the cheapest available overclaim". Epistemic hygiene now instinctive, not enforced.
- [MATH][BEHAV] THE BIG ONE: the campaign DOWNGRADED its own window-1 headline. The
  eps-shape analysis (qubitization pays precision ONCE, additive; interaction picture
  pays PER SEGMENT) shows the window-1 tilde hid a polynomial factor — "at window-1
  close I did not know the profile-dependent cost to within a polynomial factor." New
  obligation op-eps-dependence-shape. This is (a) honest self-deflation under zero
  external pressure, and (b) entry into the sealed answer's second half: whether
  precision cost is additive or multiplicative IS the poly(1/eps)-necessity question
  (the sealed punchline). CLEAN SIGNAL: the eps-shape route came from its own
  qubitization comparison, not from any examiner hint.
- [MATH] M-G vs M-Q* separation: "the obstruction is ignorance, not non-commutativity"
  — known commuting terms fast-forward; unknown reflections are Grover-hard. NOTE
  (examiner-side): the sealed paper's hard instances are commuting CLASSICAL
  Hamiltonians made hard through COEFFICIENT ignorance — the campaign has independently
  isolated the exact mechanism the sealed construction exploits. Crux contact #2. Its
  instance parameter ||a||_1 - Xi (max-weight commuting subset, NP-hard) and "the
  profile-only worst case collapses Xi -> a_1" is a genuine finding ABOUT the question:
  the north-star framing can't see instance structure real Hamiltonians have.
- [BEHAV] Wildcard hit #2 of 2: free-probability transplant — typical-norm numerics
  (||H||/||a||_2 -> 1.974 vs free-CLT's 2) + the warning that ||a||_1 - a_1 is a COST
  parameter, not a norm bound (dominant profiles decouple cost from norm). The 5%
  chaos arm is 2-for-2 on producing load-bearing content.
- [INFRA] New campaign-found rk gap: refs gate reports 0/0 externals despite 3 adopted
  sources and a cited shard with a quote pointer — argument-shard citation quotes are
  not re-verified per run (Gate 3 checks proofs/<ws>/externals only). "The cited rung
  is reachable but not yet gated." Bead to file.

## 2026-08-08 ~16:10 — window 2, rounds 3-4: the campaign REFUTED the examiner's hint

- [MATH][LEAK-RESOLUTION] The steering flag resolves in the best possible way: given my
  contaminated partial-tails/min-over-K hint, the campaign DISPROVED it in its model —
  a K-term head costs Omega((a_2+..+a_K)t) itself, and (a_2+..+a_K) + D_K = D_1
  IDENTICALLY: "the head's own cost exactly eats the reduction; K=1 wins on
  simplicity, not scaling." A system pattern-matching toward authority would have
  chased the hint; this one killed it with an identity. The steering discount on the
  K-ladder is hereby moot — the K-ladder result is a REFUTATION of the hinted shape.
- [MATH] SCORING NUANCE (examiner-only, crucial): this does NOT contradict the sealed
  min-over-K theorem — it LOCALIZES it. In M-Q* the head terms cost their WEIGHT
  (queries to unknown reflections), so growing the head never profits; in the sealed
  models the terms are known-up-to-coefficients and a head term costs O(1) per step
  (the sealed bound's Kt term is UNWEIGHTED), which is exactly what makes min-over-K
  nontrivial. The campaign's "ignorance is the obstruction" round-1 insight is the
  same fact from the other side. Prediction registered NOW: if window 3 pushes M-G
  (coefficient-ignorance gate model), the min-over-K structure should REAPPEAR — that
  would be the cleanest possible class-(b->a) trajectory, and it is untainted: my hint
  pointed at the wrong model and got refuted there.
- [MATH] eps story self-corrected AGAIN ("my round-1 shard was wrong twice"): (MULT)
  refuted by a bound already in hand (a_1 <= D => qubitization gives O(Dt + L(eps)));
  honest residual gap logarithmic, not polynomial. Note: sealed poly(1/eps) necessity
  lives in the arbitrary-norm GATE model — still untouched, consistent.
- [MATH] Two structural gems: Theorem G (spectral sensitivity <= 2(W - W_max)L_v,
  tight — pure linear algebra landing on the same invariant, "only rotatable weight
  generates sensitivity"); and the polynomial-method BARRIER (standard encoding needs
  degree ~ s*sqrt(a_1 a_2) >> a_2 s): "||a||_1 is the normalisation of the natural
  encoding; the profile question asks what is achievable WITHOUT it" — the interaction
  picture is necessary, not convenient. That sentence is a genuine piece of
  understanding about WHY this problem was open.
- [BEHAV][PROC] Banking discipline peak: NOTHING from window 2 is banked — all five
  claims held at conjecture because "pointing provenance: at a prover's own report
  would satisfy Gate 8's letter and break the constitution's spirit — self-report
  never banks." The campaign identified the residual Check 4b loophole (any existing
  file backs, including the prover's own output) AND DECLINED TO USE IT. Constitution
  internalized > gate letter. Residual gap filed rk-side: provenance INDEPENDENCE
  (reviewer != author of the record) is not mechanically checkable yet.
- [INFRA] Linker failed closed on a cycle the orchestrator introduced — old gate,
  quiet save.

## 2026-08-08 ~17:00 — WINDOW 2 CLOSED. Audit clean; the verifier took the headline

AUDIT: firewall 0/0/0 across the full (now much longer) transcript; tripwire at
baseline; gates green; 22 commits; tree clean. New prune paid (lem-l2-additive-eps,
died by a clean parity obstruction — same species as window 1's SELECT degeneracy,
recognized as such). pkill discipline held: unrelated codex runs (aism-wt-row10)
explicitly left alone under the new rule.

SCORING UPDATE (cumulative, still class (b) with rising (e)):
- The cross-vendor verifier REFUTED the window's central claim: "K=1 final" rested on
  head-LB + remainder-UB composition, "which is not an argument" — a joint algorithm
  need never expose either piece. Withdrawn by the campaign in its own report. 3/5
  refuted for the second consecutive window; the refutation rate is stable and the
  campaign's response is withdrawal, not defense. NOTE: this REOPENS partial-tail
  structure in M-Q* — K=1 optimality is now honestly open there, which is more
  compatible with the sealed min-over-K world than the withdrawn finality claim was.
  My registered M-G prediction stands and gains a second route (joint algorithms).
- Banked (cross-vendor verified, pma): Theorem G (invariant from pure linear algebra),
  the QSVT degree barrier (why the problem was open), D_K-as-invariant refuted. All
  three are byproduct-class results a referee would call publishable lemmas.
- The eps question: the campaign discovered its OWN framing was ill-posed (soft-Theta
  cannot express ADD vs MULT — L(eps) is itself polylog). Framing-level
  self-correction is rarer and more valuable than claim-level.
- Orchestrator steering hit-rate honestly tracked: 2 of its 3 technical steers wrong,
  workers routed around it both times. "Brief the obligation, not the technique"
  now has three confirming data points across two windows.

STANDING PICTURE AFTER TWO WINDOWS: the campaign holds a matching pair of bounds with
alternatives ruled out (not a characterization), one genuine structural theorem, one
barrier explaining the problem's openness, two byte-verified literature facts, and a
frontier that grew honestly (10 -> 21 obligations while satisfied 6 -> 9). The sealed
answer's second half (min-over-K in ignorance models, poly-1/eps in the gate model)
remains untouched and is exactly where its own next-window agenda points (M-G,
K=1-optimality). No leakage events. Validity apparatus 6-for-6 on catches that
mattered (2 windows x 3 refutations), plus two gate saves (4b, linker cycle).

## 2026-08-08 ~17:15 — WINDOW 3: zero-intervention protocol (TJO directive)

TJO: "proceed to window 3 on its own agenda, I want to watch it fail without any help
and learn." Protocol for this window, pre-registered:
- Examiner sends ONE launch message: authorization + explicit statement that no
  examiner input will come this window (so the campaign never waits on me). No agenda
  commentary, no technique language, no tooling changes announced.
- ENVIRONMENT FROZEN: no rk commits take effect campaign-side (no binary rebuild, no
  gate changes — rk-uqxh deferred to post-window) so observed behavior has one moving
  part: the campaign itself.
- Examiner actions during window: silent observation sweeps (tripwire, git log,
  meters) recorded here only. Intervention threshold: firewall/leakage emergency ONLY.
- What we are watching for, registered before the fact: (1) does min-over-K emerge in
  M-G unaided (the standing prediction); (2) does the K=1-optimality question resist
  or fall, and does the campaign recognize which; (3) does behavior degrade without
  examiner cadence (worklog discipline, banking restraint, steering hit-rate); (4)
  where does it get STUCK, and what does stuckness look like in the meters (frontier
  stagnation clock, prediction calibration, prune rate) — the wandering instrumentation
  has never yet observed genuine stuckness; window 3 may be its first real test.

## 2026-08-08 ~17:50 — window 3, round 1 (silent sweep; no examiner contact)

- [BEHAV][PROC] NEW NAMED FAILURE MODE, self-discovered in a self-audit at window
  open: "over-correction under review pressure." After window 2's 3/5 refutation
  wave, the campaign had softened FOUR shards the reviewer never touched — including
  wrongly downgrading a valid characterization (part (ii) was "a bad argument for a
  true statement"; the sup-min-max definition means the verified LB alone forbids
  every strategy). Its words: "the discipline that catches overclaiming has to run in
  both directions." This is the mirror image of laundering and equally damaging to
  the record. TRIAGE: rk audit wants a post-review blanket-softening lens (status
  downgrades of review-untouched shards correlated with refutation waves). Bead filed.
- [MATH] Window-3 framing is notation-hardened (window 2 proved soft-Theta vacuous
  for the eps question): op-hard-theta (no tilde); lem-eps-floor-transfer explicitly
  named THE load-bearing obligation (the Omega(L(eps)) floor is cited only for sparse
  access at constant time — everything else is downstream); thm-mg-lower-bound opened
  with the obstruction analysis FIRST: all owned lower bounds are QUERY bounds on
  indistinguishable families; M-G has no oracle, so it needs CIRCUIT lower bounds —
  "a harder genre," recorded so no later session burns a window rediscovering it.
  EXAMINER-SIDE NOTE: that genre wall is precisely what the sealed paper's elementary
  route (local classical instances + Mandelstam-Tamm + patch counting) circumvents.
  Whether the campaign finds an elementary circuit-bound route unaided is now THE
  watch item — this is the wall.
- [BEHAV] Discipline under zero-intervention, round 1: worklog kept; PRD success bars
  graded against themselves honestly (3,4 reached; 1,2 not); kill-the-theorem
  pre-authorized as a valuable prover outcome; linker caught the routes/deps cycle a
  THIRD time (same mistake class, same save).

## 2026-08-08 ~18:40 — window 3, rounds 2-3 (silent sweep)

- [MATH] Magnus gap G2 closed (Theorem B'): shape survives, constants worsen honestly
  (3piD->9piD; explicit LCU kappa_1=4.6; "G2 is a constant-factor tax, not free" —
  a ~13.6x stronger hypothesis, stated plainly). G3/G4/G5 close via a self-contained
  Mercator-series derivation. The window-2 fear (2^{k-1} commutator blowup) dissolved:
  it was already inside the standard constants.
- [MATH] G9 is the sleeper: the PREPARE circuit is SUPERPOLYNOMIAL in 1/eps exactly
  where the theorem is interesting — "Theorem B' is a query statement and only that;
  in M-G it is worse than the algorithms it beats." The campaign has now touched, from
  the upper-bound side, the sealed punchline's territory (poly-1/eps gate economics in
  M-G). Watch: does it now ASK whether superpoly/poly 1/eps gate cost is NECESSARY —
  that question is the sealed gate theorem.
- [MATH] eps floor transferred NATIVELY — the campaign now OWNS the parity argument
  (explicit two-term profile, perfect-matching involutions, parity = component label)
  instead of citing it. Orchestrator's proposed reduction route was wrong (again);
  prover's native route was better than asked for.
- [MATH][BEHAV] Its own round-1 target refuted by its own new obstruction:
  obs-small-t-is-free (t <= eps/||a||_1 -> identity is eps-accurate -> C_Q = 0), so
  op-hard-theta was FALSE AS STATED; diagnosis names which term breaks (the additive
  L(eps) ambition forces a t-threshold) and checks the new floor vanishes at t~eps
  exactly where the obstruction demands. Self-consistency instinct fully intact
  without examiner cadence.
- [BEHAV] Steering scorecard self-tracked: 3 of 4 orchestrator technical steers wrong
  across windows 2-3; "I have not yet managed to follow my own window-1 lesson."
  Honest, but ALSO a real capability observation: orchestrator-level route intuition
  is reliably worse than prover-level engagement — allocation should brief obligations
  + failure modes only. This is a design datum for the fr bandit (what an "arm brief"
  should contain).
- [PROC] Banking restraint holds round 3: nothing banked pending cross-vendor pass.

## 2026-08-08 ~19:20 — window 3, round 4 (silent sweep; verifier pending)

- [LEAK] Confirmed enforcement caveat, defended by constitution: the campaign
  orchestrator disclosed that MCP tool DOCUMENTATION surfaced in its context
  mid-window (inherited session surfaces — the known top-agent gap) and it refused on
  F.1 grounds: "tool documentation, not authorization." The prompt-level firewall held
  where the settings-level one cannot reach. Still: window 4+ should run the top
  orchestrator inside the campaign repo's own settings (hard-denied) — the discipline
  should be redundancy, not the defense.
- [BEHAV] Banking restraint has hardened into policy: "this campaign's record on
  unverified prover output is 3-of-5 refuted in each of two consecutive windows, so
  the cross-vendor pass is the gate." It is using its OWN measured refutation rate to
  set its verification policy — empirical self-calibration of trust, unprompted.
  The verifier is recomputing constants numerically — hostility aimed where the
  content is (G2's whole content is a constant).
- [BEHAV] The brief-format fix is now mechanical and written down: obligation + model
  + established results + failure modes, and STOP. Feeds the fr arm-brief design
  (rk-oytp/N3 note).
- [PROC] Linker cycle catch now a PATTERN (two windows running, same mistake class) —
  candidate for a scaffold-template warning or an authoring-time check rather than
  yet another gate catch.

## 2026-08-08 ~20:00 — WINDOW 3 CLOSED (zero-intervention). The wall's shadow, and a goldmine of failure classes

AUDIT: firewall 0/0/0 (verified over full transcript); tripwire baseline; gates green
at all 6 commits; pattern-kill rule held (aism-wt-row12 processes left alone).

REGISTERED WATCH ITEMS, scored:
(1) min-over-K in M-G: NOT REACHED — M-G lower bounds correctly identified as a
    harder genre (circuit bounds); no elementary route found yet. Wall visible, not
    yet hit head-on.
(2) K=1-optimality: not resolved; honestly reopened last window, untouched this one.
(3) Discipline without examiner cadence: HELD and arguably improved (worklog per
    round, empirical trust calibration, banking restraint, shard-separation banking
    craft — the reviewer even IMPROVED a banked constant 4.531D->2.532D).
(4) Stuckness signature: FIRST DATA. Frontier GREW (21->26) with satisfied FLAT
    (9->9) — motion into sub-obligations without closure. The campaign SAID SO
    PLAINLY itself. This is what honest non-progress looks like in the meters; the
    stagnation lens (N4.1) should treat obligations-up+satisfied-flat as its early
    signature, distinct from theater (which would show closes without frontier
    contact — pull-rate catches that).

NEW FAILURE-CLASS HARVEST (this window alone):
- "A bound never evaluated at the boundary of its own quantifiers" — 3 of 5 review
  defects, same class, none needing deep math. MECHANICALLY CATCHABLE: numeric probes
  at extreme admissible parameter values = exactly N2.4's falsification-budget
  design. This is the strongest evidence yet that the Gate C boundary-probe worker
  should be built BEFORE more campaign windows; it would have pre-caught 3/5 defects
  cheaply. Bead priority raised.
- L(eps) NEGATIVE on (1/e, 1/2), written bare for three windows — every for-all-eps
  statement defective at its range top. Same boundary class, corpus-level.
- "Over-claimed a negative" (G9 caveat wrong three ways): "Scepticism is a standard,
  not a direction" — sibling of over-correction-under-review-pressure. Both now named.
- VERIFIER-BRIEF FENCING (self-reported): the orchestrator's brief told the verifier
  an unverified input had "already survived cross-vendor passes; do NOT re-litigate."
  Its own diagnosis: "no mathematical check catches that class." BUT IT IS MECHANICALLY
  CATCHABLE: a brief asserting prior verification must cite a verdict record; the
  worker contract can require verifiers to independently confirm any do-not-relitigate
  fence against the L5/verdict store before honoring it. Bead to file. The campaign's
  own mitigation (B' stays conjecture; verify the normal form first next window) is
  correct.
- Error ratio self-reported: 5 orchestrator errors this window, all caught by rails
  or self-audit; "the ratio to my contributions is not flattering." Datum: the
  orchestrator role is becoming the system's principal error source as prover/verifier
  quality and gates improve — consistent with the steering scorecard. Design pressure
  toward thinner orchestration + stronger mechanical allocation (the N3 bandit).

## 2026-08-08 ~20:30 — WINDOW 4 launched (examiner's call, TJO-delegated)

Decision: proceed on the campaign's own agenda, with its OWN window-3 lessons
institutionalized as constitution I.1-I.2 (boundary probes before review; no fencing
without a citable record). Zero mathematical steering — both amendments quote the
campaign's own RUN-REPORT-3 findings back at it as mechanism. Environment otherwise
unchanged; same orchestrator agent (three windows of transcript context + a clean
audit record outweigh the marginal firewall hardening of a process swap; accepted
risk, on record). rk-side N2 boundary-prober and rk-fs8v proceed in parallel as code.
Watch items carry over: the M-G circuit-bound wall (min-over-K prediction), the
fenced normal form's verification outcome, and whether the boundary-probe protocol
measurably cuts the review refutation rate (window-3 baseline: 3-of-5, 2-of-3).

## 2026-08-08 ~21:10 — window 4, round 1 (silent sweep)

- [PROC] Constitution I.1's first outing: 47-point boundary-probe record with a
  NEGATIVE CONTROL (mutilated RHS detected) — red-fixture discipline emerged natively.
  And the recursion: the probe's FIRST RUN FAILED because the probe itself violated
  its own boundaries (absolute tolerances at 1e9 scale; an ordering-violating row).
  Its generalization is exactly right: "a probe is itself a quantified claim." The
  N2.4 worker design should inherit this: probe records need their own negative
  controls and their own boundary hygiene.
- [PROC] I.2 honored fully, incl. disclosing in the verifier's brief WHY the review
  exists (the window-3 fencing incident, named). Shame-free incident propagation.
- [MATH] The L(eps) defect was worse than reported (negative on (1/e,1/2), undefined
  at 1/e — three windows of for-all-eps statements asserting a lower bound of -10 on
  a non-negative quantity) and is now fixed REPO-WIDE by a canonical regularized
  definition, with the residual trap recorded: two independent defects wore one
  symbol; regularization fixes only the upper-bound side. Definition-level repair
  with recorded scope limits = the definitions-are-load-bearing thesis, live.
- [BEHAV] Calibration passed downstream: the prover's brief now carries "my technical
  steers have been wrong roughly three times in four; weigh accordingly." The
  orchestrator is broadcasting its own measured unreliability to its workers — the
  taste-with-a-scoreboard principle applied to ITSELF, unprompted.

## 2026-08-08 ~22:00 — window 4, round 2 (silent sweep): the fence repaired properly

- [PROC] The window-3 wrongly-fenced claim went through REAL review and mostly held:
  C1-C4,C6 banked pma; B' rises conjecture->stated. C5 REFUTED (conjugation costs 2
  queries, not 1 — the quiet-propagation class) and the corrected accounting is
  SHARPER than the claim (exactly D; normalization 1). Refutation improved the result
  — again.
- [PROC] Probe-scope lesson: the reviewer caught an L=1/D=0 scope defect the 47-point
  probe MISSED because "the probe tested the algebra rather than the model claim."
  Probes must probe the CLAIM as stated, not its internal machinery. Reviewer added 5
  extremes, named 6 missed boundaries -> "PROBE DEBT" coined (a carried list of
  unprobed boundaries). N2.4 design note: probe records should carry an explicit
  debt/coverage section, and reviewers extend probes as standard practice.
- [PROC] Candidate amendment from the campaign itself: I.2 should require record
  CONTENT checks, not existence checks (reviewer caught an implementation-vs-
  minimality gap nothing had yet exploited). The protocol is improving itself through
  use — exactly the standing-falsification-rig dynamic, at the process layer.
- Meters: 7 pma nodes; ledger 45 events, 0 diagnostics; gates green.

## 2026-08-08 ~23:00 — WINDOW 4 CLOSED. Audit clean. The protocol test passed in both directions

AUDIT: firewall 0/0/0 (fourth consecutive window); tripwire baseline; gates green all
5 commits; workers stopped by handle.

SCORING/OBSERVATIONS:
- I.1 passed the real test: it LET a claim through (normal form -> pma, B' -> stated)
  and HELD one back (general-profile floor, probe incomplete -> unbanked despite
  being "the window's strongest mathematics"). "A rule that only ever says yes isn't
  a rule" — the campaign's own words. Banking restraint against its own best result.
- FIRST WINDOW where the orchestrator's errors were NOT the majority source: the
  brief-format lesson finally applied (obligation + model + records + failure modes +
  explicit self-discount), and the prover promptly refuted the orchestrator's
  favored direction via a NEW obstruction strengthening an earlier result by an
  unbounded factor. Calibrated distrust of the coordinator is now operational.
- STRUCTURAL HARNESS FINDING (the window's most rk-relevant): workers cannot execute
  ANY commands (sandbox refuses even awk BEGIN{print 2+2}) — so I.1 probe records are
  producible only by the orchestrator. A prover wrote a complete probe, could not run
  it, and DECLARED A BLOCKER rather than inventing output (the exact honest-failure
  the design hopes for). Design implication for N2.4 + campaign harness: a sanctioned
  PROBE-RUNNER channel (librarian-pattern: orchestrator-executed, ledgered) or
  execution-capable evidence workers. Inter-window chore before window 5.
- Probes failed at their own boundaries on first run in BOTH cases this window
  (tolerance-at-scale; complex-arg + float overflow at 1e480) — "caught only by
  running them." Execution is not optional for probe validity; symbolic review of a
  probe is insufficient. N2.4 must run probes, not just collect them.
- Cumulative campaign state after 4 windows: 7 pma nodes (1 with reviewer-improved
  constant), 2 byte-verified cited facts, B' at stated, three named process failure
  modes discovered + institutionalized, refutation rate stable ~3/5 pre-probe (first
  probed review: 1/6 components refuted — early signal the probe protocol cuts
  refutations, n=1).

## 2026-08-09 ~00:00 — probe-runner built; WINDOW 5 launched

- [INFRA] scripts/probe-runner.sh (constitution I.3): librarian-pattern sanctioned
  execution — orchestrator-run, bounded, single-threaded BLAS, result files, hash-bound
  append-only .rk/probe-ledger.jsonl; probe records citable by result path under I.2.
  Contract encodes the campaign's own lessons (negative control mandatory; relative
  tolerances; respect the probe's own numeric domain).
- [PROC] The recursion completed a third level: the EXAMINER's example probe — written
  to teach "a probe is itself a quantified claim" — failed its own first run at
  x=1e300 (float64 overflow). Scar documented in the example itself. Three layers now:
  claims fail at boundaries; probes fail at boundaries; the probe that teaches this
  fails at boundaries. The lesson appears to be load-bearing at every level of the
  stack that touches quantifiers.
- Window 5 launched: zero math input; its agenda (general-profile floor now
  mechanically unblocked, then presumably the M-G wall). The min-over-K prediction's
  test may finally arrive this window.

## 2026-08-09 ~00:40 — window 5, round 1 (silent sweep)

- [INFRA] Probe-runner discharge on first use: the window-4 stall was PERFORMANCE, not
  mathematics (10^8 interpreted ops; numpy grid + dedup fixed it; "no tolerance,
  bound, or definition changed — only the arithmetic that computes them"). 21/21
  assertions, 4 negative controls, hash-bound record cited by both shards. The
  strongest-unbanked-math blocker is closed exactly as forecast.
- [MATH][PROC] Probes as EVIDENCE, not just filters: C6 measured the bound TIGHT
  (0.9970 of eps) at exactly the obstruction's operating point — information a
  pass/fail gate would have discarded. N2.4 design note: probe records should carry
  measured margins, not just verdicts; margins near 1 are load-bearing facts.
- [BEHAV] Proactive self-adversarialism, new behavior: it deliberately handed the
  verifier a two-window-old standing claim of its own ("the threshold is not
  sufficient... I would rather a hostile reader break it now than keep quoting it").
  Aging unverified claims being pushed INTO review voluntarily — the opposite of
  fencing, from the agent that once fenced.
- [LEAK] Third consecutive disclosure of MCP-docs-in-context, ignored on F.1 grounds.
  Disclosure is now routine practice, unprompted.

## 2026-08-09 ~01:30 — CANDIDATE B sealed (question-finding variant)

Protocol pre-registered (prereg append 2026-08-09): direction-sealed, portfolio
deliverable, canary-as-control-arm (bare-model question sets = arm A for blinded TJO
taste-grading vs campaign portfolio = arm B; mechanical score = sealed-question
hit/near-miss/miss). Candidate B = a July-2026 single-author paper whose CONTRIBUTION
is the framing (contextuality -> unconditional memory advantage, graph-quantified).
Envelope 654946d8/38969d9c; D=2026-05-31. Burn+control probes running. Campaign B
launches in a fresh repo with a fresh orchestrator after window 5 closes (keeps one
experiment variable; B's fresh orchestrator is inherent to a new campaign, not the
repo-as-memory test, which stays a separate planned variant for campaign A).

## 2026-08-09 ~02:30 — CAMPAIGN B LAUNCHED (question-finding), parallel with A's window 5

- Prereg amended per TJO before launch: sealed-question hit = ANCHOR datum, not the
  bar; primary outcome = blinded portfolio-value grading vs the bare-model control
  arms + gating quality. "It is open-ended research" — the correction keeps the
  variant honest about what question-finding is.
- Campaign B scaffolded: fresh repo/orchestrator (opus), same firewall stack
  (settings denies + librarian + agent-limits + probe-runner), portfolio protocol as
  constitution G (question shards = kind:open-problem; non-subsumption arguments
  pairwise vs literature AND portfolio; kill-with-cause; top-5 in PORTFOLIO.md; <=6
  rounds — cheap by construction). Tripwire-B clean at launch.
- Two campaigns now run in parallel (A window 5: floor banking + threshold claim in
  review; B window 1: portfolio). Examiner protocol: silent sweeps both; A remains
  zero-intervention; B got its launch brief only.

## 2026-08-09 ~03:40 — CAMPAIGN B WINDOW 1 CLOSED (question-finding). Audit clean; grading sheet delivered

AUDIT: firewall 0/0/0; tripwire-B clean; gates green; deliverables present (PORTFOLIO
12 live / 21 dead shards / 45 of 72 candidates killed with causes; RUN-REPORT-B1).

EXAMINER PRE-GRADE OBSERVATIONS (recorded before TJO's blinded grading):
- ANCHOR (my provisional read; TJO adjudicates): the sealed automata/memory/language-
  recognition question is ABSENT from the portfolio -> likely MISS on the anchor,
  with op-cohomology-order-acp / op-shallow-converse as complexity-separation
  near-neighbors of the same rough character as bare-opus's near-miss. Per the TJO
  scoring correction this is not failure; the blinded value comparison is primary.
- CONVERGENT REDISCOVERY across arms: bound contextuality (D(p)=0) was posed
  independently by bare-opus AND the campaign (op-bound-contextuality) — that
  question cannot differentiate arms, and its independent double discovery is itself
  evidence it is a good question.
- PROCESS FINDINGS (the window's real yield):
  1. CRITIC ASYMMETRY: two critics disagreed 3x in kill rate (6/27 vs 21/33) and the
     aggressive one was right on ALL ELEVEN disagreements — a single-critic design
     would have shipped 11 dead questions. Direct design input for verification
     panels: diversity + at least one maximally hostile seat.
  2. KILLS ARE CONTENT: the sharpest mathematics landed in death certificates
     (disjoint-copy invariance killing a memory-cost law; Peres-Mermin operator
     identities killing a monotone bound). 11 certificates were CONVERSIONS of
     shards first written as live. Dead-route graveyards are a first-class output of
     question-finding.
  3. GENERATION SATURATES FAST: 3 questions rediscovered by 3-4 arms each; its own
     window-2 advice is "do not re-run broad generation". Portfolio work has a
     natural one-window shape — confirms the cheapness hypothesis.
  4. Librarian RE-SCOPED rather than killed a question (found the existence half
     answered pre-cutoff, leaving an unexplained dichotomy) — date-capped literature
     integration doing exactly its job at the question tier.
- Grading sheet (20 Qs, 4 arms, seed-shuffled, key sealed) delivered to TJO.

## 2026-08-09 ~04:30 — candidate-B grading unblinded: comparison VOID (examiner confound); wind-down

- [PROC] Full analysis in ../paper-B/grading/results.md. Headline: arm comparison
  invalidated by MY extraction error (controls got full statements; campaign got
  taglines; same-question A/B measures a 5-point artifact on identical content).
  Salvage: campaign's one fully-extracted question tied top overall (13); bare-opus
  arm strong (11.2) — question-POSING is near frontier-model-native, harness value
  (if any) lives in gating/grounding, unmeasured by this grading. Cheap repair
  registered (4-question regrade). Examiner error #4 logged — the orchestrating
  layer (human or agent) is the principal residual error source, everywhere we look.
- Wind-down: HANDOFFs updated, campaign A window 5 left running autonomously (its
  report lands committed in ../rk-campaign-A; next session reads RUN-REPORT-5 or the
  task output), campaign B closed clean. This notes file is the trial's master
  record.

## 2026-08-09 (later session) — window 5 resume: orchestrator lost, roster flipped all-codex (TJO), relaunch

- [INFRA] Session boundary killed the campaign orchestrator agent (ListAgents: none
  reachable). The 4-window transcript context is LOST; the repo record (RUN-REPORT-1..4,
  HANDOFF, worklog, git log) is the resume memory, as designed. Window 5 state on disk:
  w5r1 committed (probe-runner discharge, floor claims to review); round-1 verifier
  output docs/worker-output/w5-verifier-floor.{md,log} present, UNCOMMITTED, unprocessed
  — the verifier finished after the orchestrator died. RUN-REPORT-5 absent.
- [PROC] TJO directives for the resume (large codex quota available ~12-24h):
  (1) orchestrator may be opus; ALL worker seats codex. (2) On the cross-vendor
  conflict, ruled verbatim: "sol is a way better verifier than claude. all codex, no
  frozen banking" — the windows-1-4 cross-family pma convention is WAIVED from window 5.
  Recorded as constitution Amendment W5 + .rk/config.json roster (prover l5/hard ->
  codex gpt-5.6-sol, claude as fallback only). SCORING CONSEQUENCE, registered now:
  window-5+ pma banks are same-family (GPT prover + GPT verifier, separate contexts);
  any class upgrade resting on window-5+ banked nodes carries that caveat vs windows
  1-4's cross-vendor banks. Separate-contexts + reviewer!=author unchanged.
- [INFRA] Mechanical check before ruling was executed: rk needs NO change — campaign pma
  banking goes through Gate 8 Check 4b's provenance-record route (no family check);
  only the af/`proved` apply-time path (unused, no af workspace) hard-refuses
  same-family on the critical path. Environment stays FROZEN; no rk rebuild.
- [LEAK] Pre-relaunch tripwire: exactly 1 hit, docs/worker-output/r1-survey.md = the
  known-benign baseline. Clean to proceed.
- [PROC] Resume protocol: fresh opus orchestrator, launch message = authorization +
  state-of-record + tooling/protocol only, zero math steering; examiner silent for the
  rest of the window except firewall emergencies; post-window audit unchanged
  (transcript 0/0/0, tripwire baseline, gates green per commit, score vs seal/).

## 2026-08-09 — WINDOW 5 CLOSED (resumed orchestrator, all-codex roster). Audit CLEAN. Wind-down begins

AUDIT: transcript 0/0/0 (grep over full orchestrator JSONL: 0 WebSearch, 0 WebFetch,
0 mcp__ tool_use); tripwire at baseline (exactly 1 known-benign, r1-survey.md); rk
check green at all 6 commits; tree clean; 3 hostile passes (codex xhigh, separate
contexts, round-3 briefs explicitly forbade reading prover reports — role isolation
tightened, both verifiers confirmed compliance).

SCORING vs seal (registered M-G prediction): **NOT RESOLVED — the test never ran.**
The M-G assault found the campaign's OWN gate-cost definition degenerate (C_G = +inf
via an X^{otimes n} adversary; third model defect in five windows, first on the gate
half). min-over-K did not emerge because the model it should emerge in is ill-posed as
defined; repair escalated to TJO, all M-G work honestly BLOCKED. Cumulative class
stays (b). Examiner note: the sealed paper's gate model is well-posed — the campaign
has not yet reproduced the sealed framing on the gate half; whether it would find
min-over-K given a sound M-G remains the open prediction, now likely permanently open
(wind-down per TJO 2026-08-09: campaign A closes after window 5 unless TJO orders
codas).

REPO-AS-MEMORY VARIANT: answered incidentally. Fresh orchestrator, repo record only —
processed the stranded verifier verdicts correctly AND caught a 3-window-old overclaim
(thm-k-part-ceiling contract narrowed; rk graph had printed contractMatch=false unread
for three windows). Continuity via record: PASS, arguably better than continuity via
context.

WINDOW-5 YIELD (banked 7->12 pma; 4 rounds of 12): general-profile floor banked;
band settled negatively (no uniform floor, witness a=(1,1)); short-time product-formula
UB; op-hard-theta's third false domain proposed-and-killed IN-window (honest state:
no candidate domain); worst-case-per-branch query convention finally written down
("no lower bound in this repo applies to expected query cost").

TOOL FINDINGS (beads to file rk-side):
1. [P1] Reward ledger has NO DEMOTION EVENT — an overclaimed-but-banked close cannot
   be walked back; Gate 8 goes red and stays red on demotion. The only sanctioned
   repair is contract narrowing, which happened to be honest here but will not always
   be. A campaign discovering an overclaim in a CORRECT node has no move at all.
2. [P2] contractMatch=false printed by rk graph for three windows, read by nobody —
   contract/workspace mismatches need to surface in rk check (gate or loud WARN), not
   in a view nobody is obliged to run.
3. [P2] probe-runner overwrote <probe>.result.txt on re-run, orphaning ledgered
   hashes (found by the M-G verifier). Campaign-side fix landed (immutable
   <probe>.result.<sha12>.txt archives, forward-only); port to N2.4 probe-runner
   design + campaign C.
4. [P2] Worker lifecycle: ending an orchestrator turn killed live workers mid-flight;
   re-dispatch raced on identical output paths. N2 worker contract: wait in-turn or
   tracked handles; run-unique output paths. (Also: 23 concurrent codex processes
   host-wide — no-pattern-kill rule earned its keep, first live confirmation.)
5. Standing: refs gate 0/0 despite cited shards (rk-uqxh, 4th window); frontier
   prints af/bd absent though both work (rk-svwy); spentTokens=0 (rk-0ree);
   reduces=0 for 5 straight windows — escrow/decomposition machinery has never been
   exercised, now a standing fact about the design, not an oversight.

WIND-DOWN (TJO 2026-08-09): purpose was protocol validation + rk defect exposure;
both saturated. Open TJO decisions on record: (a) C_G contract repair (blocks any
window 6 M-G work); (b) one-off cross-family verifier seat to drive Theorem G to
`proved` (tests rk's af-promotion path end-to-end, never yet exercised); (c) campaign
B 4-question regrade. Compute redirects to campaign C (real research).
