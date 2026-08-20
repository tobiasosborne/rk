<!-- ROLE: manifest for vendored evidence and campaign bundles. AUTHORED. UPDATE
     POLICY: edited when vendored content is added/refreshed. TRIGGER: read by
     anyone materializing rk on a new device (scripts/restore-siblings.sh). -->

# vendor — stranded-sibling evidence, made durable

rk's contracts, memos, and bd issues cite evidence living in sibling
directories that have no git remote (or are not git repositories at all). This
directory makes rk self-contained (rk-he3r, TJO directive 2026-08-12): a fresh
clone of rk carries everything needed to continue development. af
(`../vibefeld`), fr (`../knowledge-frontier`), bd, and AISM are NOT here — they
have their own remotes and are cloned separately (D6).

## Contents

- `bundles/rk-campaign-A.bundle`, `bundles/rk-campaign-C.bundle`,
  `bundles/rk-campaign-D.bundle`, `bundles/rk-campaign-E.bundle` — full-history `git bundle --all` snapshots of
  the campaign repositories (none has a remote). History matters: e.g. the campaign-A backing waiver reasons from
  specific historical commits. Both campaign working trees are fully tracked
  and clean at bundle time, so a bundle restore reproduces the working tree
  byte-for-byte (verified by `diff -r` on 2026-08-12; only gitignored local
  state — `.beads/` dolt internals, `build/` — regenerates instead).
  **Caveat: a campaign's bd issues live in the gitignored dolt database and are
  NOT in the bundle.** A restored campaign starts with an empty `bd` database
  (`bd init --prefix <name>` after cloning); bead ids cited in its HANDOFF /
  worklog then resolve only on the device that ran the sessions. Campaign-D was
  restored this way on 2026-08-20 (clone from bundle, `origin` remote removed
  to match the other siblings, fresh `bd init`).
- `evidence/rk-bench/` — the benchmark trial's master record (campaign A
  windows 1–5 + campaign B analyst notes, paper-B grading). Not a git repo;
  plain copy.
- `evidence/rk-m3.5-baseline/` — the SC4 baseline run/stop reports and logs.
  Not a git repo; plain copy.

## Restore (new device)

`sh scripts/restore-siblings.sh` — clones each bundle to `../<name>` and copies
each evidence dir to `../<name>`, skipping any that already exist. The `../`
locations are the LIVE homes; everything under `vendor/` is the durable
snapshot.

## Refresh (session close, when a sibling changed)

`make refresh-bundles` — regenerates both bundles from `../` and re-copies the
evidence dirs (delete-then-copy, so deletions propagate). CLAUDE.md §6 item 5:
a session that changed a campaign sibling commits refreshed vendor content, or
that change is stranded on one machine.
