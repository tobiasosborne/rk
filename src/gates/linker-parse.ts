// PURITY: pure — no fs/network/clock (L3). Gate 2 (linker) registry parser: reads
// `argument/**/*.md` frontmatter (RECURSIVE) into `Lemma` records + parse-stage Findings
// (checks 1-5). Ground truth: docs/gate-contracts.md "Gate 2 — argument / linker" Inputs +
// Checks 1-5, ported from argument.py:106-148 (`_parse_frontmatter`/`parse_registry`) and
// `parse_routes` (argument.py:68-90, aism-3ne).
//
// Divergence [F12, crash-to-finding, linker-21]: AISM's parse_registry never defaults/validates
// the `id` key (argument.py:139-140's `if fm.get("id")` is a no-op when id is absent), so every
// downstream `l["id"]` bracket access crashes with an uncaught KeyError. This port instead
// REJECTS a shard with no `id:` line outright (one ERROR finding, shard excluded from `lemmas`)
// so no id-keyed check downstream (acyclicity/status/orphans) can ever see it.
//
// Divergence [rk-9pk, dogfood-1, recursive discovery, 2026-07-18]: AISM's own `parse_registry`
// only ever globs `argument/lemmas/*.md` (argument.py:131-133) — a private subdirectory
// convention rk's scaffold does not stamp (PRD.md:79-85 creates `argument/`, no `lemmas/`). A
// dogfood session wrote three result shards, including the campaign's north-star theorem,
// directly at `argument/*.md`; the old lemmas/-only glob silently reported "0/0 lemma shards"
// and `rk check` PASSED GREEN over an entirely unvalidated registry — the exact silent-skip
// failure class CLAUDE.md L2 forbids. rk's contract now scans `argument/**/*.md` recursively,
// excluding `README.md`/`INDEX.md`/`DAG.md` at ANY depth (non-shard documentation/mirrors); every
// OTHER `.md` under `argument/` MUST parse as a shard. `argument/lemmas/*.md` is a subset of this
// recursive scan, so AISM's own tree (which has zero README/INDEX/DAG collisions inside
// `lemmas/`) discovers byte-identical shards under the new rule — see docs/gate-contracts.md
// Gate 2 Inputs + Divergences for the full amendment text (same footing as commit 3849eb1's
// presence-conditional mirror amendment: a deliberate contract widening, not a strictness triage).

import type { Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { listDir, parseFrontmatter } from "./snapshot";
// M3 blocker 7b/7c (durable repeat-balloon state, graph/board surfacing): `readBalloonCounterFromFields`
// is the SAME pure read-back src/cli/verify-live.ts uses to recover `priorBalloonCount`/
// `priorClassifications` off a shard's frontmatter (src/drive/driver-balloon.ts) — reused here
// rather than re-implemented so the linker parses EXACTLY the field format
// src/drive/driver-frontmatter.ts's `applyBalloonMark` writes, with one degradation path, not two.
import { readBalloonCounterFromFields } from "../drive/driver-balloon";
import type { BalloonCounter } from "../graph/types";

export interface Lemma {
  id: string;
  /** repo-relative path to this shard's own file, e.g. "argument/lemmas/lem-x.md" or
   * "argument/lem-x.md" (root-level, dogfood-1 shape) — used to
   * attribute every id-keyed finding back to a real path (AISM's console output has no path at
   * all for these; the Shared conventions' uniform SEVERITY path:line format requires one). */
  path: string;
  kind?: string;
  status?: string;
  /** Defaults to "none" only when the `af:` line is entirely ABSENT — mirrors Python's
   * `fm.get("af", "none")`, whose default applies on a missing key, never on a present-but-empty
   * value (argument.py:145). */
  af: string;
  contract: string;
  owner?: string;
  /** Freeform, "not parsed here" (Gate 4's own field — docs/gate-contracts.md Gate 2 Inputs).
   * M3.8 (EDIT flagged): Gate 2's own critical-path provenance check reads this RAW value for one
   * specific token, `legacy-same-family` — the explicit grandfathering marker
   * (docs/gate-contracts.md Gate 2's "Critical-path provenance" section) — a substring match, not
   * a grammar this module owns; Gate 4 remains the owner of `provenance:`'s "report <label>"
   * grammar. */
  provenance?: string;
  defs: string[];
  deps: string[];
  /** OR-route groups: each inner array is one route (conjunction); the outer array is the
   * disjunction (any one route suffices). [] when `routes:` is absent/blank (aism-3ne
   * backward-compat: byte-identical to a deps-only shard). */
  routes: string[][];
  workspace?: string;
  /** M3 blocker 7b: the persisted balloon counter/classification history, read back off this
   * shard's own `balloons:`/`balloon_classifications:` frontmatter (the SAME fields
   * `driver-frontmatter.ts`'s `applyBalloonMark` writes) via `readBalloonCounterFromFields`.
   * Never absent — a shard with no balloon marks parses to `{count: 0, classifications: []}`,
   * matching `RegistryNode.balloons`'s own "never undefined" invariant (graph/types.ts). */
  balloons: BalloonCounter;
}

const KINDS = new Set(["lemma", "proposition", "theorem", "corollary", "open-problem", "obstruction"]);
const MATH_STATUS = new Set([
  "proved", "cited", "consensus", "open", "obstruction", "disproved", "stated",
  "proved-mod-audit", "conjecture", "heuristic", "numerical",
]);
const AF_STATES = new Set(["none", "seeded", "validated"]);

/** Python-repr-style list rendering (`['a', 'b']`) — used only for message-text fidelity with
 * argument.py's f"... not in {sorted(SET)}" formatting; never load-bearing for a check's verdict
 * (subset-match tests only assert a message SUBSTRING, per corpus/README.md). */
function pyListRepr(items: Iterable<string>): string {
  return `[${[...items].map((i) => `'${i}'`).join(", ")}]`;
}

/** `;`-separated list field (`deps`, `defs`) — argument.py:120-121, `LIST_FIELDS`. */
function parseList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(";")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** OPTIONAL `routes:` grammar (argument.py:68-90, aism-3ne): `[a; b] | [c]` — each bracketed
 * group is one route (conjunction of its members); groups are separated by `|` (disjunction).
 * Whitespace around `|`/brackets/`;` is ignored; empty groups are dropped. `""`/absent -> []. */
export function parseRoutes(raw: string | undefined): string[][] {
  const s = (raw ?? "").trim();
  if (!s) return [];
  const routes: string[][] = [];
  for (let group of s.split("|")) {
    group = group.trim();
    if (group.startsWith("[") && group.endsWith("]")) group = group.slice(1, -1);
    const members = group
      .split(";")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    if (members.length > 0) routes.push(members);
  }
  return routes;
}

/** `deps` ∪ every route's members — the edge set for acyclicity and the (conservative,
 * union-over-routes) ancestor/descendant closures (argument.py:98-103). */
export function allDepIds(l: Lemma): string[] {
  return [...l.deps, ...l.routes.flat()];
}

const ARGUMENT_DIR = "argument";

/** File basenames excluded from the shard scan at ANY depth under `argument/` — non-shard
 * documentation/mirrors, not results (rk-9pk, docs/gate-contracts.md Gate 2 Inputs). `DAG.md` is
 * new here vs. the pre-rk-9pk exclusion set (which only ever named README.md/INDEX.md because the
 * old lemmas/-only glob never even reached argument/'s own root-level DAG.md/INDEX.md/README.md
 * mirror files in the first place — the recursive scan now walks through them, so they must be
 * excluded explicitly). */
const NON_SHARD_NAMES = new Set(["README.md", "INDEX.md", "DAG.md"]);

/** Every `.md` file under `argument/`, RECURSIVE, returned as paths relative to `argument/`
 * (e.g. "lem-x.md" for a root-level shard, "lemmas/lem-y.md", "lemmas/sub/lem-z.md"), sorted
 * lexicographically. Reads directly off the snapshot's text-map keys — `RepoSnapshot`'s only
 * shape for "what files does this tree contain" (there is no separate recursive-listing fact;
 * `src/gates/snapshot.ts`'s `listDir` is deliberately one-level-only for its other callers). */
function listArgumentMdFilesRelative(snapshot: RepoSnapshot): string[] {
  const prefix = `${ARGUMENT_DIR}/`;
  const out: string[] = [];
  for (const path of snapshot.keys()) {
    if (path.startsWith(prefix) && path.endsWith(".md")) out.push(path.slice(prefix.length));
  }
  return out.sort();
}

export interface ParseRegistryResult {
  lemmas: Lemma[];
  errors: Finding[];
  /** Total shard CANDIDATES considered this run (every non-excluded `argument/**\/*.md` file,
   * whether it went on to parse cleanly into `lemmas` or was rejected as a structural error) —
   * the coverage line's denominator; `checked` always equals this (every candidate is processed,
   * never silently skipped, CLAUDE.md L2). */
  total: number;
  /** Paths of excluded non-shard files (`README.md`/`INDEX.md`/`DAG.md` at any depth), relative
   * to `argument/`, sorted — surfaced on the linker gate's coverage line so a repo's mirror/
   * documentation files are never confused with "0 shards found" (rk-9pk). */
  ignored: string[];
}

/** Parses every `argument/**\/*.md` shard, RECURSIVE (excluding README.md/INDEX.md/DAG.md at any
 * depth — rk-9pk, see the file header), into `Lemma` records + parse-stage Findings (Checks 1-5).
 * A shard whose frontmatter is missing/unterminated, or which carries no `id:` line at all [F12],
 * is excluded from the returned `lemmas` array entirely — every OTHER check still runs against
 * whatever shards remain (contract's trigger-preserving-fix shape, see the file header). */
export function parseRegistry(snapshot: RepoSnapshot): ParseRegistryResult {
  const errors: Finding[] = [];
  const lemmas: Lemma[] = [];
  const ignored: string[] = [];
  const candidates: string[] = [];
  // rk-sj6 (M1 review B3): id -> the MOST RECENTLY registered path claiming it, so recursive
  // discovery (rk-9pk) can no longer let two files at different paths silently share one `id`
  // (each individually passes its own id==stem check; only the CROSS-file collision needs
  // catching here, at the parse boundary, before linker-graph.ts's Map/Set construction ever gets
  // a chance to collapse the two into one overwritten identity). Same rolling-owner shape as
  // defs.ts's DRIFT dedup map (checkShard's `aliasOwner`): every occurrence after the first is
  // flagged against whichever path most recently held the id, not fixed to the very first one.
  const idOwner = new Map<string, string>();

  for (const rel of listArgumentMdFilesRelative(snapshot)) {
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    if (NON_SHARD_NAMES.has(base)) {
      ignored.push(rel);
      continue;
    }
    candidates.push(rel);
  }

  for (const rel of candidates) {
    const path = `${ARGUMENT_DIR}/${rel}`;
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    const stem = base.slice(0, -".md".length);
    const content = snapshot.get(path) ?? "";
    const fm = parseFrontmatter(content);

    // M1.3 phase matrix (docs/gate-contracts.md "Phase matrix"): frontmatter parse failure,
    // missing id, and an id/filename mismatch are all structural — they break this shard's own
    // cross-referenceable identity, which acyclicity/status/orphan/import-resolution all key on.
    if (!fm.present || !fm.terminated) {
      errors.push({ severity: "ERROR", path, message: "missing/unterminated frontmatter", structural: true });
      continue;
    }

    // rk-wc3 (dogfood-2): a line inside an otherwise well-terminated frontmatter block that is
    // STILL genuinely malformed (no ':', and not a valid multi-line list continuation —
    // src/gates/snapshot.ts's parseFrontmatter) must be loud, mirroring defs.ts's own check 2
    // exactly (same message, same structural classification: a parse error breaks this shard's
    // cross-referenceable identity same as Check 1). Pre-fix, the linker gate never read
    // `fm.malformedLines` at all — only defs.ts did — so a malformed line here was silently
    // invisible to Gate 2's own coverage/verdict.
    for (const lineNo of fm.malformedLines) {
      errors.push({
        severity: "ERROR",
        path,
        line: lineNo,
        message: "frontmatter line without ':'",
        structural: true,
      });
    }

    const id = fm.fields.id;
    if (!id) {
      errors.push({
        severity: "ERROR",
        path,
        message: "missing required field 'id' (cannot register this shard for acyclicity/status/orphan checks)",
        structural: true,
      });
      continue;
    }
    if (id !== stem) {
      errors.push({ severity: "ERROR", path, message: `id '${id}' != filename stem '${stem}'`, structural: true });
    }

    // rk-sj6 (M1 review B3): a SECOND (or later) file claiming an id already registered by an
    // EARLIER-processed file (candidates are walked in sorted argument/-relative order) is
    // structural — duplicate ids are explicitly one of the four structural classes
    // (docs/gate-contracts.md:186: "parse errors, dependency cycles, duplicate ids/aliases, or
    // broken cross-shard references"). Gate 1 precedent (defs.ts checkShard's DRIFT check): flag,
    // do not silently exclude — the shard still registers into `lemmas` below so every other
    // check still runs against it; the duplicate-id ERROR itself is structural and blocks the
    // gate regardless of phase.
    const priorOwner = idOwner.get(id);
    if (priorOwner !== undefined) {
      errors.push({
        severity: "ERROR",
        path,
        message: `duplicate id '${id}': claimed by both ${priorOwner} and ${path}`,
        structural: true,
      });
    }
    idOwner.set(id, path);

    // [rk-aft, 2026-07-18 review finding 3] `kind` is required (gate-contracts.md:303, same row
    // shape as `id`). The old `if (kind && ...)` gate skipped validation entirely when `kind` was
    // absent/empty, so a kind-less shard registered with zero findings (corpus/linker/linker-24).
    // Absent `kind` does NOT exclude the shard from `lemmas` (unlike absent `id`, [F12] above) —
    // `kind` stays optional on the `Lemma` type and every other check must still see this shard.
    const kind = fm.fields.kind;
    if (!kind) {
      errors.push({
        severity: "ERROR",
        path,
        message: `missing required field 'kind' (must be one of ${pyListRepr([...KINDS].sort())})`,
      });
    } else if (!KINDS.has(kind)) {
      errors.push({ severity: "ERROR", path, message: `kind '${kind}' not in ${pyListRepr([...KINDS].sort())}` });
    }
    const status = fm.fields.status;
    if (status && !MATH_STATUS.has(status)) {
      errors.push({
        severity: "ERROR",
        path,
        message: `status '${status}' not in ${pyListRepr([...MATH_STATUS].sort())}`,
      });
    }
    const af = fm.fields.af !== undefined ? fm.fields.af : "none";
    if (!AF_STATES.has(af)) {
      errors.push({ severity: "ERROR", path, message: `af '${af}' not in ${pyListRepr([...AF_STATES].sort())}` });
    }

    lemmas.push({
      id,
      path,
      kind,
      status,
      af,
      contract: fm.fields.contract ?? "",
      owner: fm.fields.owner,
      provenance: fm.fields.provenance,
      defs: parseList(fm.fields.defs),
      deps: parseList(fm.fields.deps),
      routes: parseRoutes(fm.fields.routes),
      workspace: fm.fields.workspace,
      balloons: readBalloonCounterFromFields(fm.fields),
    });
  }

  return { lemmas, errors, total: candidates.length, ignored };
}

/** M3 blocker 7c: true iff a shard's persisted balloon state has crossed the mandatory-review
 * threshold `src/drive/driver-balloon.ts`'s `routeBalloon` defines — reconstructed here from the
 * persisted counter alone, since the routing decision ITSELF is never persisted (only the count +
 * classification history; see `driver-run.ts`'s `handleBalloon`, which marks the shard on EVERY
 * balloon, not only mandatory-review ones). Two independent ways in:
 *   - a REPEAT balloon (`count >= 2`) is ALWAYS mandatory-review regardless of classification
 *     (`routeBalloon`'s `priorBalloonCount >= 1` clause — the persisted `count` already includes
 *     the balloon that made it a repeat, so `>= 2` here is `>= 1` prior-count there);
 *   - a `genuine-gap` classification is ALWAYS mandatory-review even on the very first balloon,
 *     so its presence ANYWHERE in the classification history is sufficient on its own. */
export function isMandatoryReview(balloons: BalloonCounter): boolean {
  return balloons.count >= 2 || balloons.classifications.includes("genuine-gap");
}

/** `definitions/*.md` id set (excluding README.md/INDEX.md), for check 7's `defs:` resolution —
 * argument.py:506-514 `load_def_ids`. A definitions shard with absent/unterminated frontmatter or
 * no `id:` is silently skipped here (defs gate owns validating ITS OWN shards; this is only a
 * lookup table). */
export function loadDefIds(snapshot: RepoSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const name of listDir(snapshot, "definitions")) {
    if (name === "README.md" || name === "INDEX.md") continue;
    const content = snapshot.get(`definitions/${name}`);
    if (content === undefined) continue;
    const fm = parseFrontmatter(content);
    if (fm.present && fm.terminated && fm.fields.id) ids.add(fm.fields.id);
  }
  return ids;
}
