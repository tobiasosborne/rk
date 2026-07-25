<!-- ROLE: authored audit memo — the SC1/SC7 generality audit. It records, item by item, where rk is
     still shaped around its origin campaign (AISM, one researcher, one machine) rather than around
     an arbitrary academic user, ranked by day-one damage, plus a concrete first-stuck trace through
     a real stamped scaffold. Complements (does not replace) docs/memos/2026-07-18-aism-residue-audit.md,
     which audited M0 gate defaults and layout; this one audits the WHOLE day-one surface at M3.
     UPDATE POLICY: authored, APPEND-ONLY — a later audit adds a dated section below; never rewrite a
     settled finding (the standing record of what was found and when is the value).
     TRIGGER: read before any WP that touches templates/, src/scaffold/, the CLI's first-run surface,
     README/install docs, or a gate's report/-tree binding; and at every milestone whose acceptance
     bar cites SC1 (cold start < 30 min) or SC7 (same scaffold, both phases, no tool modification). -->

# Generality audit (2026-07-25)

Question: rk is meant to be cloned by any academic and pointed at their own campaign. Where is it
still shaped around AISM / one researcher / one machine?

Method: read-only. Every claim below was produced by running the shipped binary
(`dist/rk`, built 2026-07-20) against scaffolds stamped in a scratch directory outside this repo,
not by reading code alone. No live model dispatch was run. Two scratch campaigns were used:
`my-conjecture` (stamped, one run bundle) and `c2` (stamped, one definition + one lemma).

Existing beads are cited where a finding is already tracked; the ranking below often disagrees with
the tracked priority, and says so.

---

## 1. Day-one walkthrough: where a mathematician gets stuck first

The literal first command fails.

```
$ git clone <rk> && cd rk
$ bun build --compile src/cli.ts --outfile dist/rk        # README.md:56
24 | import dagre from "dagre";
                       ^
error: Could not resolve: "dagre". Maybe you need to "bun install"?
    at src/render/dag.ts:24:19
```

`README.md:53-57` is the only build documentation in the repository and it omits `bun install`.
Bun's own error names the fix, so the cost is ~10 seconds — but it is the first thing a new user
sees, and it is wrong. There is no `make install` (PRD §3 promises `git clone <rk> && make install`),
no `bun run build` script (`package.json:8-11` defines only `test` and `selftest`), and no
instruction anywhere to put the resulting binary on `PATH`. `rk init` does print a PATH line
(`src/cli/init.ts:219-223`), but only *after* the user has already got a binary.

Past that, the scaffold itself is in good shape. `rk init` on a fresh directory works, and the
result is green:

```
$ rk init "Every almost-idempotent stochastic map is close to an idempotent one"
rk init: stamped 13 files, 9 directories, 5 hooks; fr: ok; bd: ok
$ rk check
... 8 coverage lines, 0 ERRORs ...
rk check: OK (0 ERRORs across all implemented gates).
```

The stamped constitution is clean of this project's own working agreements: no model vendors, no
reviewer names, no `codex exec` cadence, no personnel. `RK_SLOT_MODEL_POLICY` and
`RK_SLOT_COMPUTE_BUDGET` are slots, stamped `UNSET — fill in before first session`
(`src/cli/init.ts:21,122-123`). `shardsPrefix` is derived per-repo (`MC` from `my-conjecture`),
never defaulted. That was the 2026-07-18 audit's one landing-blocker and it is genuinely fixed.

The wall is the *second* hour, and it has three parts, in the order a user meets them:

1. **After the first `rk render`, `rk check` never comes clean again.** `rk render` writes
   `build/site/index.html` and auto-adopts it into `.rk/generated.json`
   (`src/cli/render.ts:150,237`). The freshness gate then re-renders and byte-diffs — but
   `rk check`'s regeneration is missing four of the six options `rk render` passes, so the two can
   never agree. On a pristine scaffold with zero content:

   ```
   $ rk init "Test conjecture" && rk render && rk check
   WARN build/site/index.html:44 build/site/index.html is STALE (regenerate via 'render-site-v1')
     — first difference at line 44: have ".rk-defect-tier .rk-badge{border:2px dashed #e11d48;…",
       want ".rk-defect-tier .rk-badge{border:2px dashed #e11d48;…"
   ```

   Re-running `rk render` does not clear it. In exploration phase it is a WARN; in consolidation it
   is an ERROR, and the stamped `.git/hooks/pre-commit` runs `rk check`, so every commit is blocked.
   The two truncated strings in the message are identical, so the user has no lead at all.

2. **`rk phase consolidation` fails on the first lemma.** With exactly one definition and one lemma
   in the scaffold:

   ```
   $ rk phase consolidation && rk check
   ERROR argument/lem-widget-bound.md:1 lem-widget-bound: maps to NO report label and is NOT in
     report/UNWIRED.md (dropped from the paper, or never wired in — anchor it or whitelist it)
   rk check: FAILED (>=1 ERROR above).
   ```

   `report/UNWIRED.md` is AISM's LaTeX-paper whitelist. `rk init` does not stamp a `report/` tree —
   `templates/manifest.json:5` says so explicitly ("no report/ tree … prior-tool residue") — and no
   stamped document mentions the file. One ERROR per registry shard, unbounded, with no documented
   remedy inside the campaign repo.

3. **The flagship command has an undocumented prerequisite.** `rk verify` needs an af workspace:

   ```
   $ rk verify --af lem-widget-bound
   rk verify --af: node 'lem-widget-bound' declares no 'workspace:' — nothing to verify (af=none).
     next: add a 'workspace:' field to the shard, or seed an af workspace for this contract.
   ```

   No command is given for "seed an af workspace". rk never creates one; `af` is a separate binary
   whose repository URL appears nowhere in rk, and `rk init` never checks whether it is installed.

**Answer to the question asked:** the first *stop* is `bun build` without `bun install`
(README.md:56) — trivial to recover from. The first *wall* is `rk render` → `rk check`, which
turns the pre-commit gate permanently red within minutes of stamping. The first wall a user cannot
solve from anything inside their own repository is the `report/UNWIRED.md` ERROR on entering
consolidation phase — the phase the tool is designed for.

---

## 2. Findings

Tags: **[origin]** = leaks the AISM/this-machine origin; **[undoc]** = genuinely general
machinery that no stamped artifact explains. They need different fixes: [origin] items get
deleted or made presence-conditional; [undoc] items get stamped or printed.

### BLOCKER

**B1 — Gate 4's anchor check ERRORs every registry shard when `report/` is absent. [origin]**
`src/gates/provenance.ts:117-131` (`checkAnchor`); whitelist source `src/gates/provenance-md.ts:119-124`
(`report/UNWIRED.md`), label source `provenance-md.ts:49` (`report/PROVENANCE.md`).
The check is unconditional: a shard with no `\label` in a `report/sections/*.tex` tree and no row in
`report/UNWIRED.md` is an ERROR. rk's scaffold has neither file and, per `templates/manifest.json:5`,
deliberately never will. Demonstrated above: consolidation-phase `rk check` FAILS on a two-shard
scaffold. Damage: **consolidation phase is unusable on a stamped repo**, which is SC7's stated bar
("the same scaffold runs a consolidation-phase and an exploration-phase campaign with NO tool
modification") failing outright. Fix: bind Gate 4's report-facing checks (anchor, forward-label,
reverse-orphan, `tab:status`) to the presence of the `report/` root, exactly as Gate 6 was bound at
`src/gates/shards.ts:23-40`, with the same visible coverage note (`report/: absent (not adopted)`)
so it is never a silent skip. Tracked partially as **rk-au6 (P2)** — the priority is wrong; this is
the acceptance bar for SC7, not a cleanup.

**B2 — `rk render` makes `rk check` permanently fail: the freshness regeneration is not the
generator. [undoc, but a validity defect]**
`src/cli/render.ts:203-210` calls `renderSite(doc, {northStarId, title, sources, runGallery,
defsData, frResiduals})`. `src/cli/check.ts:108` calls `renderSite(buildResult.doc, {northStarId})`.
Four options are dropped, so the "expected" bytes differ from the real output on every repo, always.
`src/cli/check.ts:105-107` documents only the `--title`/`--north-star` flag case as a known
limitation — the four missing data options are not known. The freshness gate is the mechanism SC2
rests on ("`rk check` proves freshness"), and it is producing a false STALE: an L6 validity-semantics
defect (truthful freshness), not a cosmetic one. Compounding: `rk render` adopts the entry into
`.rk/generated.json` automatically (`src/cli/render.ts:237`), so the user does not opt in to the
failure. Why no test caught it: `test/cli-check.test.ts:181-185` builds its "clean" golden with
`renderSite(doc, {})` — the same call shape the gate itself uses — so the assertion compares the
gate against itself and the real generator (`renderCommand`) is never in the loop. That is exactly
the L1 "runs without errors is never a passing test" trap. Fix: `rk check` must regenerate through
the same option-assembly path `rk render` uses (extract it), and the red fixture must be a genuine
`renderCommand` → `checkCommand` round trip. Related but distinct: **rk-95h (P2)**.

**B3 — No installation path for rk or for the three binaries it requires. [undoc]**
`README.md:53-57` (build block missing `bun install`); `package.json:8-11` (no build script); the
whole repo contains exactly one URL, `https://bun.sh` (`README.md:50`). `rk` needs `af`, `fr`, and
`bd` on PATH; the stamped `.claude/settings.json` invokes `bd prime`, `fr board`, `fr turn-begin`,
`fr check` on every session start, prompt, and stop (`src/scaffold/hooks.ts:35-44`). A user without
them gets a hook error on every single turn of the orchestrator session that is supposed to be the
product. `rk doctor`'s remediation text points at sibling working directories on this machine —
`"rebuild ../vibefeld (go build ./cmd/af)"`, `"rebuild ../knowledge-frontier (bun run build)"`,
`"reinstall bd from its release channel"` (`src/doctor.ts:145-149`) — directories a new user does
not have, for repositories whose names they cannot guess (the fr repo's actual remote is
`tobiasosborne/frontier`, not `knowledge-frontier`). All three repos are public; none is linked.
Fix: an install section in README with clone URLs and version requirements, `bun install` in the
build block, a `build` script in package.json, and remediation strings in `src/doctor.ts` that name
a URL rather than a relative path on one machine.

### MAJOR

**M1 — `rk init` never checks for `af`, the validity kernel. [origin/undoc]**
`src/cli/init.ts:197-211` probes `which("fr")` and `which("bd")` and warns loudly when either is
missing. It never probes `af`. af is the one binary the rigour ladder's `proved` rung depends on
(stamped `CLAUDE.md` L0, L5), and its absence surfaces only much later, inside `rk verify`. Fix:
probe all three at init, or run the `rk doctor` classification as part of init and print its report.

**M2 — The stamped constitution understates the tool by two milestones. [undoc]**
`templates/CLAUDE.md.tmpl` mentions `rk check` (§5), `rk phase` (§3), `rk upgrade`, and `fr board`.
It never mentions `rk verify`, `rk graph`, `rk refs`, or `rk doctor`, and it hedges `rk render` as
"a rendering command that may not exist yet in this binary" (`templates/CLAUDE.md.tmpl:18-19` and
again at :153-155) — text written before M2.4 shipped and never revised. Concretely damaging:
stamped L1 (`:57-61`) instructs the user to "recompute the hash, `grep -F` the quote" by hand for
every `cited` claim, while `rk refs add` / `rk refs status` / `rk refs quote` exist to do exactly
that and are never named. A new user hand-rolls a subsystem the tool ships. Fix: a "what this
binary can do" section generated from the command registry, or at minimum a revised §5.

**M3 — Two config keys the tool depends on are undocumented in the stamped repo. [undoc]**
`northStarId` and `workers` (`src/gates/config.ts:90,98`) are documented only in
`docs/gate-contracts.md` and `docs/memos/2026-07-19-m2.5-path-queries.md` — neither of which is
stamped into a campaign. Consequence for `northStarId`: `rk graph --critical-path`, `rk graph
--blocks`, and the render dashboard's "what blocks the north star" all degrade to "no north star
configured", and the linker gate's critical-path provenance check — PRD C2's continuously-checked
cross-vendor guarantee, the tool's central validity claim — silently covers nothing:
`critical-path provenance: no north star configured`. `rk init` is *given* the north-star contract
and stamps it into three documents, but does not stamp a `northStarId`. Fix: stamp `northStarId`
when the campaign's root registry id is known (or prompt at first `rk link`), and mirror both keys
into the stamped `CLAUDE.md`'s config section. The runtime messages themselves are good
(`src/render/dashboard.ts:166`, `src/cli/graph.ts`) — this is a discoverability gap, not a silent one.

**M4 — Repo-root `INDEX.md`: the first run bundle is a finding. [origin]**
`src/gates/runs.ts:41-43,128-134`. Check 5 requires the bundle dirname to appear as a substring of a
repo-root `INDEX.md`. That file is AISM's manual reverse-lookup index; it is not in the PRD scaffold
(PRD.md:79-85), `templates/manifest.json:5` explicitly disclaims it, and no stamped document
mentions it. Demonstrated: a valid run bundle produces
`WARN runs/2026-07-25-first-numerics:1 not referenced in INDEX.md (add a reverse-lookup row)` in
exploration, `ERROR` in consolidation. An exploration-phase campaign (numerics-heavy by definition —
PRD §2) meets this on its first numerical result. Tracked as **rk-775 (P2)**, still framed as
"decide"; the decision is overdue and the exploration-phase framing raises it.

**M5 — `CONVENTIONS.md` tells the user to name shards in a scheme no gate accepts. [origin]**
`templates/CONVENTIONS.md.tmpl:19-20` stamps: "Shard ids use the prefix `{{RK_SLOT_SHARD_PREFIX}}-`
with the layer convention (`MC-def-<slug>`, `-lem-`, `-thm-`, …)". But `shardsPrefix` is Gate 6's
*LaTeX report-shard* prefix (`src/gates/config.ts:65-72`; format
`^PREFIX-[0-9]{2}[A-Z]?-[A-Z0-9-]+$`, e.g. `AISM-01-INTRO`), an entirely different namespace from
registry and definition ids. The two other stamped schema docs contradict it: `definitions/README.md`
example is `def-widget`, `argument/README.md` example is `lem-widget-bound`, and the linker's id
convention is `lem-|thm-|prop-|cor-|op-|obs-` with no campaign prefix. A user who follows
`CONVENTIONS.md` produces ids that match neither the README examples nor Gate 6's format. This is
R12's residue surviving a level up: the *default* string `"AISM"` was deleted, but the *concept* of a
campaign-wide id prefix was carried into a template where it does not belong. Fix: delete the prefix
sentence from `CONVENTIONS.md.tmpl` or restrict it explicitly to report shards.

**M6 — `rk.compat.json` under-pins af; `rk doctor` green-lights a binary the driver rejects. [origin]**
`rk.compat.json:2` pins `af {min: "0.1.3", tested: ["0.1.3"]}`. `src/drive/driver-af.ts:119`
requires `features[] ⊇ {readiness-flags, closure-flag, node-dependencies}`, which arrived in af
0.1.5 (HANDOFF.md:81 — every M3.5 live run used 0.1.5, a version `tested[]` does not list). A user
with af 0.1.3 gets `af 0.1.3: ok (min 0.1.3)` from `rk doctor` and then a preflight failure inside
`rk verify --live`. D6 names `rk doctor` as *the* fix for the stale-binary bug class; a stale pin
inside it reinstates the bug class it exists to prevent. Fix: raise `min` to the version that emits
the required features, list 0.1.5 in `tested[]`, and derive the minimum from
`REQUIRED_AF_FEATURES` rather than maintaining two numbers by hand.

**M7 — `EXTPROP_REFS_CACHE` / `EXTPROP_REFS_CACHE_URL`: another campaign's acronym in rk's public
env-var namespace. [origin]**
`src/refs/status.ts:18-21,58-59`, `src/refs/quote-locate.ts:50`, and — user-facing —
`src/cli/refs.ts:37-39`, which prints `set EXTPROP_REFS_CACHE=<dir> here.` These names are inherited
verbatim from AISM's `fetch-refs.py:193-194`. A new academic is told to set an environment variable
named after an abbreviation of a different researcher's project. Fix: `RK_REFS_CACHE` /
`RK_REFS_CACHE_URL`, reading the old names as a deprecated fallback with a warning (this is a
compat surface under Rule 10). Missed entirely by the 2026-07-18 audit, which did not cover
`src/refs/`.

### MINOR

**m1 — A user-facing error message names AISM.** `src/gates/shards.ts:213`: "shardsPrefix is not
configured (required to validate SHARD-ID headers, e.g. 'AISM-01-INTRO')". The example should use
the repo's own derived prefix or a neutral placeholder. This is the last literal `AISM` string
reachable by a user (verified: the only other occurrence outside comments is `src/refs/add.ts:82`,
a comment).

**m2 — README describes a scaffold rk does not stamp.** `README.md:20-21` says `rk init` scaffolds
"(definitions, argument shards, references, runs, report mirrors)". `report mirrors` is exactly the
tree `templates/manifest.json:5` disclaims as prior-tool residue.

**m3 — Help text still says "six M0 gates".** `src/cli.ts:49,134`. Eight gates exist and
`rk check` prints eight coverage lines. Tracked as **rk-cki (P3)**.

**m4 — `rk render`'s default title is `rk campaign report`.** `src/render/site.ts:119`. The project
name is available (it is stamped into every other document); a site titled after the tool rather
than the campaign reads as a demo. SC5 asks a third party to orient in ten minutes.

**m5 — The scaffold is Claude-Code-shaped for hooks.** `src/scaffold/hooks.ts:35-44` writes
`.claude/settings.json`; there is no equivalent for any other harness, though `AGENTS.md` is stamped
byte-identical to `CLAUDE.md` for exactly that reason. PRD C1 lists the hook set as part of the
product; on a non-Claude harness only the git pre-commit hook survives, and nothing says so.

**m6 — `build/` is not gitignored.** `rk init` stamps `build/` as a directory but writes no
`.gitignore` entry for it (the stamped `.gitignore` in the trace came from `bd init` and covers only
dolt files). PRD §3 says build outputs are "gitignored or committed per config"; no config exists and
no default is stamped, so the render output lands in the user's first commit by accident.

---

## 3. What the 2026-07-18 residue audit missed, and what regressed

The prior audit (`docs/memos/2026-07-18-aism-residue-audit.md`) covered M0 gate contracts, gate
defaults, and layout conventions. Its dispositions held up: R12 (`shardsPrefix: "AISM"`) is fixed
and mechanically enforced, R14 (markdown mirrors) is fixed and fixtured (`linker-25`), R9's
brittleness cap is surfaced as a documented slot in the stamped constitution, and the four-layer
layout is confirmed as spec, not residue. What it missed:

1. **Its own R13 landing-blocker call was wrong.** The memo concluded (`:229-232`) that R13 is not a
   landing-blocker because "on a fresh rk repo Gates 4 and 6 correctly no-op via their empty-scaffold
   exemptions". True for Gate 6, and Gate 6 was subsequently made presence-conditional on the
   `report/` root (`src/gates/shards.ts:23-40`, fixture `shards-15`). **Gate 4 was not.** Gate 4's
   no-op on a fresh repo is vacuous — it holds only while the registry is empty. The moment the
   campaign has one shard, `checkAnchor` fires (finding B1). The repair wave fixed the two gates the
   2026-07-18 live-fire happened to hit on a *zero-shard* scaffold and stopped there.

2. **The red corpus has the matching hole.** Every `provenance-*` fixture assumes a `report/` tree.
   There is no provenance fixture for "registry shards present, `report/` absent" — the state of
   every stamped campaign. `shards-15` and `linker-25` were created for exactly this shape at Gate 6
   and Gate 2; the Gate 4 sibling was never written. Under L2 a gate whose failure mode has no red
   fixture does not exist; here the *absence* of a fixture let the residue survive the audit that
   named it.

3. **Scope: the audit covered `src/gates/` only.** It did not look at `src/refs/` (M7's
   `EXTPROP_*` env vars), at `src/doctor.ts` (B3's sibling-directory remediation text), at
   `templates/` (M5's prefix contradiction — the templates did not exist yet at M1.1), or at the
   install surface (B3). Those are the four places origin residue now lives.

4. **Regression since 2026-07-18: the freshness mechanism itself.** R13 and R14 both discharged
   their residue *onto* M2.6 regenerate-and-diff ("the general concept survives into the M2.4 render
   + M2.6 freshness mechanism"). That mechanism ships today and is wrong in the general case (B2):
   it compares `rk render`'s output against a differently-parameterised re-render, so it reports
   STALE forever on any repo. The successor the residue audit trusted needs the same scrutiny the
   gates it replaced received.

5. **The template set froze at M1.** `templates/manifest.json:2` is `template_version 1.3.0`; the
   stamped constitution still describes `rk render` as possibly nonexistent while M2 and M3 shipped
   (M2). Templates are a compat surface (Rule 10) and are not being carried forward with the tool,
   which is the copy-paste-drift disease `rk upgrade` exists to cure, reintroduced one level up.

---

## 4. Proposed beads

Filed by the orchestrator, not by this audit (concurrent tracker writes).

| title | pri | one-line |
|---|---|---|
| Gate 4: bind report-facing checks to `report/` presence (SC7 blocker) | P0 | `checkAnchor` + label/orphan/tab:status checks ERROR on every shard when `report/` is absent — consolidation phase is unusable on a stamped scaffold; mirror `shards.ts`'s root guard. Extends rk-au6. |
| corpus: provenance fixture for `report/` absent + registry shards present | P0 | The Gate 4 sibling of `shards-15`/`linker-25` was never written; its absence is why B1 survived the 2026-07-18 audit. |
| `rk check` freshness regenerates through a different call than `rk render` | P0 | `check.ts:108` drops `sources`/`runGallery`/`defsData`/`frResiduals` vs `render.ts:203-210`; every repo reports permanent false STALE, blocking pre-commit in consolidation. L6 (truthful freshness). |
| corpus/test: real `rk render` → `rk check` round-trip fixture | P0 | `test/cli-check.test.ts:181-185` builds its golden with the gate's own call shape, so the generator is never tested; replace with a `renderCommand` round trip. |
| README: install section, `bun install`, `build` script, af/fr/bd clone URLs | P1 | The first documented command fails; three required binaries have no acquisition path anywhere in the repo. SC1. |
| `src/doctor.ts`: remediation text names sibling dirs on one machine | P1 | `../vibefeld` / `../knowledge-frontier` / "its release channel" → clone URLs; the fr repo is actually named `frontier`. |
| `rk init`: probe `af` alongside `fr`/`bd` | P1 | The validity kernel is the one binary init never checks; absence surfaces only inside `rk verify`. |
| `rk.compat.json`: af `min` predates `REQUIRED_AF_FEATURES` | P1 | doctor greens af 0.1.3 while the driver requires 0.1.5's features; derive the pin from `REQUIRED_AF_FEATURES`, list 0.1.5 in `tested[]`. |
| templates: refresh the constitution for M2/M3 commands | P1 | `rk verify`/`graph`/`refs`/`doctor` unmentioned, `rk render` hedged as maybe-absent; stamped L1 tells users to hash-and-grep by hand while `rk refs` exists. Bump template_version. |
| `CONVENTIONS.md.tmpl`: shard-prefix sentence contradicts every gate | P1 | `{{RK_SLOT_SHARD_PREFIX}}-def-<slug>` is Gate 6's LaTeX report namespace, not registry ids; contradicts both stamped schema READMEs. |
| Stamp/prompt `northStarId`; document `workers` in the stamped repo | P1 | Critical-path provenance — PRD C2's continuous guarantee — covers nothing until it is set, and the key is documented only in rk's own docs. |
| runs gate: decide repo-root `INDEX.md` (adopt-or-drop) | P1 | Raise rk-775: the first run bundle of any exploration-phase campaign is a finding naming an undocumented, unstamped file. |
| Rename `EXTPROP_REFS_CACHE*` → `RK_REFS_CACHE*` with fallback | P2 | Another campaign's acronym in rk's public env-var namespace, printed at `src/cli/refs.ts:39`. Compat event (Rule 10). |
| `src/gates/shards.ts:213`: AISM in a user-facing error example | P2 | Last reachable literal `AISM` string; use the repo's derived prefix. |
| `rk init`: stamp a `.gitignore` covering `build/` | P2 | PRD §3 says gitignored-or-committed per config; neither is stamped, so render output enters the first commit by accident. |
| `rk render`: default the site title to the project name | P3 | `src/render/site.ts:119` titles every campaign "rk campaign report". SC5. |
| README: `rk init` does not stamp "report mirrors" | P3 | `README.md:21` describes the exact tree `templates/manifest.json:5` disclaims. |
| Document harness coverage of the stamped hooks | P3 | `.claude/settings.json` is Claude-Code-only; on another harness only pre-commit survives and nothing says so. |
