<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-07-18, session close — M1 orchestration session)

**M1 is functionally complete and review-round done; NOT yet accepted.** All five WPs
(M1.1–M1.5 sessions 1–2) landed; the single boundary review returned 5 landing-blockers
(below). Per the anti-Zeno cap the next session runs ONE repair wave, verifies fixes
mechanically against the review's file:line claims, runs dogfood session 3, and closes
the milestone — no re-review.
Tree: 671 tests / 0 fail / 1 skip; `bun run selftest` OK (92/92 fixtures, purity clean,
gates-dir allowlist now EMPTY); compiled binary current at dist/rk.
No git remote configured — all commits local (TJO: add one if pushing is wanted).

## Milestone scorecard

- M1.1 templates (rk-b8p), M1.2 init (rk-9ir), M1.3 phase (rk-oom), M1.4 upgrade stub
  (rk-cg9): DONE. Templates embedded in binary; residue bar is a grep test.
- M1.5 dogfood (rk-bi4, OPEN): sessions 1–2 done on the K6 campaign at
  ../rk-dogfood-1 (SC1 PASS 3.2 min; audit trigger fired/blocked/reset live;
  upgrade 1.0.0→1.1.0 followed for real). Session 3 = post-repair verification.
- Residue work: rk-hq9 audit DONE (memo docs/memos/2026-07-18-aism-residue-audit.md);
  R12 "AISM" default removed; presence-conditional amendments landed (3849eb1);
  recursive linker discovery landed (936aa54). rk-au6 remains open (M2 scope).
- Wave-1 extras: rk-7uc relocation DONE (src/store/); rk-8ux fr refresh DONE.

## M1 boundary review (docs/reviews/2026-07-18-m1-milestone-review-codex.md)

codex gpt-5.6-sol at HIGH (TJO relaxed xhigh this session), ONE round. 12/15 flags
ratified. **Landing-blockers, all orchestrator-verified at cited lines — this is the
next session's repair wave, plus rk-wc3:**

1. rk-xbm (P1): .rk/config.json values unvalidated — `phase:"typo"` silently demotes
   (phase.ts:40 treats non-"consolidation" as exploration); bad shardsMaxLines
   false-greens shards.ts:152.
2. rk-2t8 (P1): Gate 4 provenance still hardcodes argument/lemmas
   (provenance-parse.ts:17,58) — root-level shards escape the OVERCLAIM check.
3. rk-sj6 (P1): duplicate registry ids across recursive discovery collapse silently
   (linker-parse.ts:217 / linker-graph.ts:35); duplicates are structural per contract.
4. rk-huq (P1): `rk phase consolidation` writes no fr event (plan M1.3 acceptance +
   stamped constitution both promise it).
5. rk-19i (P1): stamped constitution promises a build/ freshness check that ships M2.6.
6. rk-wc3 (P1, dogfood-2, NOT visible to the review): multi-line YAML `deps:`/`defs:`
   silently parse empty (parseList is single-line `;`-grammar) — DAG/unknown-id checks
   run on an edgeless graph with zero diagnostic.

Follow-ups (batched, non-gating): rk-gvx + rk-mdx (schema READMEs teach wrong
path/field — truthfulness, do with repair wave), rk-ax5 (init overwrites hooks
without --force), rk-czv (upgrade marks slot-filled files safe to overwrite), rk-ssu,
rk-6l2, rk-dh0. Review follow-up F5 (stale HANDOFF) fixed by this rewrite.

## Next steps (in order)

1. **Repair wave** (single wave, then mechanical verification — NO re-review): rk-xbm,
   rk-2t8, rk-sj6, rk-huq, rk-19i, rk-wc3; batch rk-gvx/rk-mdx/rk-czv/rk-ax5 alongside
   (same territories). Repair rigor per finding tier; red fixture per validity fix.
2. **Dogfood session 3** on ../rk-dogfood-1: verify repairs as the user (multi-line
   deps now loud/accepted, upgrade instructions safe, constitution honest), then close
   rk-bi4 and mark M1 ACCEPTED (bd + worklog entry).
3. **M2 entry** (projection + render): schedule V4 (`af export --graph json`) in
   ../vibefeld FIRST (plan sequencing); M2.1 graph schema; rk-au6 report-decoupling
   lands here; AISM touchpoints need explicit TJO calls (2026-07-18 stance memory).
4. Backlog: rk-ssu, rk-6l2, rk-dh0 (fr versioning), rk-fdl, rk-rko, rk-t14, rk-zjq,
   rk-w91, plus dogfood P3s rk-uon, rk-i2o, rk-610, rk-8r9.

## Governance this session (TJO directives, in bd memory)

- Reviews at gpt-5.6-sol HIGH suffice (xhigh no longer default).
- Breaking changes to fr are acceptable; af/fr work unrestricted for rk's needs.
- Vision restated: rk serves ANY academic theoretical-research campaign — generality
  is the acceptance lens (drove the residue audit + all template decisions).

## Standing cautions

- Shared working tree for parallel agents: disjoint file scopes, explicit-path commits
  only, hold commits while a codex review is reading the tree.
- bd `update --notes` REPLACES the field (a dossier was nearly lost). Append manually.
- A `pgrep -f` watcher matches its own command line — use a distinctive token or
  pattern that cannot appear in the watcher (cost: 1.5 h this session).
- codex exec: health-check via ~/.codex/sessions rollout file; ~17 min for an M1-sized
  diff review at high; log to file, never pipe through tail.
- CLAUDE.md==AGENTS.md byte-identity applies to the TEMPLATE too (stamped repos).
- Campaign repo ../rk-dogfood-1 is live dogfood state — read-only unless a dogfood
  session owns it.
