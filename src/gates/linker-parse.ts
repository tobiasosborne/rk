// PURITY: pure — no fs/network/clock (L3). Gate 2 (linker) registry parser: reads
// `argument/lemmas/*.md` frontmatter into `Lemma` records + parse-stage Findings (checks 1-5).
// Ground truth: docs/gate-contracts.md "Gate 2 — argument / linker" Inputs + Checks 1-5, ported
// from argument.py:106-148 (`_parse_frontmatter`/`parse_registry`) and `parse_routes`
// (argument.py:68-90, aism-3ne).
//
// Divergence [F12, crash-to-finding, linker-21]: AISM's parse_registry never defaults/validates
// the `id` key (argument.py:139-140's `if fm.get("id")` is a no-op when id is absent), so every
// downstream `l["id"]` bracket access crashes with an uncaught KeyError. This port instead
// REJECTS a shard with no `id:` line outright (one ERROR finding, shard excluded from `lemmas`)
// so no id-keyed check downstream (acyclicity/status/orphans) can ever see it.

import type { Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { listDir, parseFrontmatter } from "./snapshot";

export interface Lemma {
  id: string;
  /** repo-relative path to this shard's own file, e.g. "argument/lemmas/lem-x.md" — used to
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
  defs: string[];
  deps: string[];
  /** OR-route groups: each inner array is one route (conjunction); the outer array is the
   * disjunction (any one route suffices). [] when `routes:` is absent/blank (aism-3ne
   * backward-compat: byte-identical to a deps-only shard). */
  routes: string[][];
  workspace?: string;
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

const LEMMA_DIR = "argument/lemmas";

/** Parses every `argument/lemmas/*.md` shard (excluding README.md/INDEX.md) into `Lemma`
 * records + parse-stage Findings (Checks 1-5). A shard whose frontmatter is missing/unterminated,
 * or which carries no `id:` line at all [F12], is excluded from the returned `lemmas` array
 * entirely — every OTHER check still runs against whatever shards remain (contract's
 * trigger-preserving-fix shape, see the file header). */
export function parseRegistry(snapshot: RepoSnapshot): { lemmas: Lemma[]; errors: Finding[] } {
  const errors: Finding[] = [];
  const lemmas: Lemma[] = [];
  const names = listDir(snapshot, LEMMA_DIR)
    .filter((n) => n.endsWith(".md") && n !== "README.md" && n !== "INDEX.md")
    .sort();

  for (const name of names) {
    const path = `${LEMMA_DIR}/${name}`;
    const stem = name.slice(0, -".md".length);
    const content = snapshot.get(path) ?? "";
    const fm = parseFrontmatter(content);

    // M1.3 phase matrix (docs/gate-contracts.md "Phase matrix"): frontmatter parse failure,
    // missing id, and an id/filename mismatch are all structural — they break this shard's own
    // cross-referenceable identity, which acyclicity/status/orphan/import-resolution all key on.
    if (!fm.present || !fm.terminated) {
      errors.push({ severity: "ERROR", path, message: "missing/unterminated frontmatter", structural: true });
      continue;
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
      defs: parseList(fm.fields.defs),
      deps: parseList(fm.fields.deps),
      routes: parseRoutes(fm.fields.routes),
      workspace: fm.fields.workspace,
    });
  }

  return { lemmas, errors };
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
