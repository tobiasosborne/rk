# Plan note: AISM role re-scoped (TJO directive, 2026-07-18)

Status: TJO directive recorded mid-M0 by the rk orchestrator, per rk CLAUDE.md §7
(surface plan conflicts here, decide nothing silently). Affects PRD §1/§8/§9 and
IMPLEMENTATION_PLAN M0.5, M2.2/M2.4, M3.5, M4.6/M4.7, SC7 — not yet folded into
either document.

## Directive

AISM is a case study in **what not to do** — chaotic, sprawling, a poor model of the
vision. It is *critical and essential* that rk serves **any** theoretical-research
campaign; rk must never be shaped around AISM particulars.

## Consequences recorded so far

1. **M0.5 (AISM staged cutover): deferred indefinitely.** Improving AISM or adopting
   rk into AISM is not an rk goal. AISM keeps its old scripts unless TJO explicitly
   asks otherwise. rk beads rk-xgo and rk-af8 deferred accordingly.
2. **rk's acceptance path is fresh dogfood repos** (M1.5 onward), not the AISM
   retrofit.
3. AISM remains permissible only as (a) incident-history seed for red fixtures and
   (b) read-only crash-test corpus at scale. Both uses treat it as hostile test data.
4. **Open question for TJO at the relevant milestone boundaries** (not decided here):
   M2's "HTML site generated for AISM", M3.5's token baseline (re-proving AISM
   lemmas), and M4's experiment substrate (the live AISM campaign) all assume AISM as
   the reference campaign. If a fresh campaign has accumulated enough history by
   then, substitute it; otherwise each of these needs an explicit TJO call.
5. rk-side guard: an **AISM-residue audit** bead is filed in rk — any gate contract,
   default, or layout assumption that exists only because AISM does it that way must
   be justified on its own merits or removed at the M1 scaffold boundary (the
   scaffold spec, not AISM convention, is what gates check).
