<!-- ROLE: current state + next steps. UPDATE POLICY: rewritten whole at session close,
     ≤150 lines. TRIGGER: read at session start (item 4 of the CLAUDE.md read order). -->

# HANDOFF

## State (2026-08-14, session close — campaign-D tooling escalations cleared)

This session (Fable orchestrating; 4 Opus implementer lanes; codex gpt-5.6-sol xhigh
for the Tier A review): all three rk-side bugs escalated by campaign D are fixed,
reviewed, repaired, and closed — **rk-we5i** (refs quote/gate matched raw payload
bytes; kind:cited unreachable for PDF sources), **rk-z93m** (runs gate WARNed on the
constitutionally-required probe ledger as strays), **rk-tyl6** (refs add ENOENT on
fresh scaffold left partial lock state). All green at close: 2977 tests / 0 fail,
corpus **172/172**, selftest OK. Template **1.8.0** (unreleased until a campaign
copies it). **dist/rk and ~/.local/bin/rk REBUILT** at close (gates changed; rk-4rrq
hazard handled for this wave).

**What landed (commits b0abb6c..9086af4):**
- **rk-we5i**: PDF payloads (magic %PDF) now resolve through an extraction sidecar
  (`<payload>.extracted.txt`) whose sha256 is recorded in the lock chained to the
  payload hash AND (post-repair) to the ADOPTED pin. pdftotext -layout fallback
  beside marker, both bounded via new `src/refs/bounded-spawn.ts` (drained pipes,
  killable 120s deadline, verified process-group kill). Fail-closed everywhere:
  stale chain / missing sidecar / partial record / violated pin ⇒ one counted ERROR;
  no raw-bytes fallback. Non-PDF sources byte-identical behavior. Corpus refs-17
  (bug flip), refs-18 (stale chain), refs-19 (missing layer), refs-20 (reviewer's
  pin-swap exploit, red-first per reward-26 precedent).
- **rk-z93m**: runs gate sanctions exactly `runs/probe-channel.sh` +
  `runs/probe-ledger.jsonl` (both phases, coverage-named, exact-name/files-only —
  .bak/renames/subdirs still WARN, a dir with a sanctioned name is still a malformed
  bundle). `rk init` stamps the channel script; post-repair it holds ONE flock (fd on
  runs/ itself, no stray lockfile) across reservation→run→hash→append, the LEDGER is
  the source of truth for already-run (exit 4), pre-run script digest with
  POISONED.txt on self-modification (exit 6), fail-closed field validation (exit 2),
  bounded lock wait (exit 5). Corpus runs-09/10. Honest correction recorded: check 6
  WARNs in BOTH phases — the bead's "would ERROR in consolidation" was wrong.
- **rk-tyl6**: prepare-then-commit in refs add — write order payload → SOURCES.md
  row → checksums → lock; no failure point leaves a pin without its manifest row
  (mutation-proven on the ordering). Shared seed-if-absent reader for add/adopt.
  `rk init` stamps `refs/manifest/SOURCES.md` ONLY — stamping empty checksums/lock
  would silence the truthful "manifest absent" WARN (rationale in 1.8.0 changelog).

**L6 process held**: one codex xhigh review over the two-lane diff
(`docs/reviews/2026-08-14-refs-extraction-runs-infra-codex.md`, 3 P1 + 4 P2), one
repair wave (R1 refs: pin check + bounded spawns + write disclosure; R2 probe
channel: atomic reservation + pre-run hashing + field validation; P2-7 was this
HANDOFF). Repairs verified mechanically against file:line claims; NOT re-reviewed
(anti-Zeno). Review record committed verbatim before repairs (c506015).

## Next steps

1. **TJO decision queue below** — unchanged from 2026-08-12; wave 3 and the escrow
   implementation still block on it.
2. **Campaign D can now reach `cited`**: its three standing escalations
   (rk-campaign-D-8w4/-qe1/-r6e) are fixed rk-side and `~/.local/bin/rk` is current.
   Next campaign session: `rk refs quote` its PDF sources (extraction now works),
   and note the 1.8.0 changelog's re-copy advice if it wants the hardened channel —
   its layout already uses the sanctioned names.
3. **rk-r0j3 (P1, Tier A)**: Gate 3's externals half (src/gates/refs.ts) never
   pin-checks and the resolver's pin gate is PDF-only — text sources on that path
   are unpinned. Fixing flips refs-01..11 fixture semantics: a deliberate decision
   for the NEXT milestone's single review, alongside rk-yic3 (live retraction vs
   backing route). Do not smuggle either.
4. Review follow-ups filed this session: rk-o85b (P2 — quote still re-chains a
   sidecar onto pin-violating bytes at acquisition; gate catches it, quote
   shouldn't emit it), rk-0s3u (P3 — extract at add/adopt time per PRD C7),
   rk-k7ez (P3 — constitution prose lags channel exit codes 4/5/6; init exec-bit).
5. **Wave 3 — worker contract / unattended operation** (rk-4w2y, rk-p037, rk-j8xo,
   rk-7the needs ratification), then wave 4 (rk-5man), wave 5 (rk-czzc/rk-g7fc +
   Tier C batch). rk-mief and rk-afyf still gate campaign C window 2 if unattended.

## TJO decision queue (blocking, carried from 2026-08-12)

1. rk-cz1h memo §6.1 — four questions, chief: do no-number-change appends need a §7
   re-registration point; does the roster waiver make a probe seat cheap single-vendor?
2. rk-7the — ratify no-pattern-kill (template clause stamped "pending ratification").
3. rk-23pr — ratify remaining autonomy plan items.
4. rk-mief — campaign C: attest backfill vs waiver for the 6 window-1 closes.
5. Roster policy: window-5 same-family waiver — standing or per-campaign?
6. Campaign codas (decaying): rk-2h33, rk-iup9, rk-mxl3.

## Key facts for the next session

- **Corpus counts are 172** in all three places (test/corpus.test.ts title+assertion,
  EXPECTED_FIXTURE_COUNT, corpus/README.md Totals). Keep them in step.
- **Extraction-chain semantics (Gate 3, PDFs)**: a citation verifies only if the
  lock entry's pin == current payload sha256, the entry carries a complete
  4-field `extraction` record, `extraction.payload_sha256` == payload sha256, the
  sidecar's sha256 == `extraction.sha256`, and the whole normalized quote matches
  the extraction text. Everything else is a counted ERROR — no raw-bytes fallback.
  `rk refs quote` throws actionable (never "pattern not found") when no extractor
  binary exists; sidecar/lock writes are disclosed even on non-match.
- **Probe channel exit codes** (stamped 1.8.0 script): 2 validation, 3 output
  exists, 4 already ledgered, 5 channel busy, 6 poisoned; else the probe's own
  status, ledgered. Probes serialize campaign-wide by design (header notes why).
- **template_version 1.8.0**: probe-channel.sh + refs/manifest/SOURCES.md now
  stamped; changelog carries the rename hazard and the re-copy advice. Campaigns on
  1.7.0 diff manually via `rk upgrade`.
- Repo self-contained since fed740c (rk-he3r): design record in `docs/design/`,
  stranded siblings in `vendor/`, `make bootstrap` / `refresh-bundles`. Full suite
  still needs `../vibefeld` cloned (2 seam tests, by design). No campaign sibling
  changed this session — no bundle refresh needed.
- Codex review invocation that works for committed work:
  `codex exec review --base <sha> -c model_reasoning_effort="xhigh" -o <file>`
  (`--uncommitted` for diffs; neither accepts a prompt argument).
- Orchestration pattern that worked (again): 2 implementer lanes max on disjoint
  paths + 1 worktree lane; lanes report shared-surface deltas (corpus counts,
  README totals) as exact text; orchestrator is single writer for those; tree stays
  still while a review runs; repair lanes get the review's file:line claims
  verbatim and the orchestrator verifies mechanically, never re-reviews.

## Governance (standing)

- Anti-Zeno held: one review round + one repair wave; repairs verified mechanically.
- L1/L2 never relaxed: reviewer exploits became red fixtures (refs-20, after
  reward-26's precedent) before fixes; mutation proofs on every repair.
- D1-D8 + Amendment A1 stand. bd for all tracking. Campaign A wound down, B closed,
  C between windows 1 and 2, D between w1s3 and w1s4 (its s4 opens on the P1 queue:
  -eem gate approval, -2e3 elegance re-ruling — both now unblocked from tooling).
