// PURITY: pure — no fs/network/clock (L3). BFS citation-closure computation for `rk refs
// snowball` (bead rk-hzla, NOTES-2026-08-20-qpcp-campaign-plan.md section 3). Given a seed list
// and an oracle answering "what does paper X reference, and what cites it", computes the
// deterministic forward+backward citation closure to a fixed depth. All network/caching/rate-
// limiting lives at the edge (src/refs/snowball-fetch.ts) — this module only ever sees a plain
// function or a Map-backed lookup, so its output is reproducible from the same oracle data with
// no wall-clock or IO involvement.
//
// Oracle contract, one documented liberty on top of the plain `(id) => {refs, cites}` shape the
// WP spec names: each `OracleResult` may also carry an optional `self` — the QUERIED paper's own
// metadata (title/year/externalIds). Non-seed papers already arrive with full metadata inline (a
// reference/citation entry from the S2 API always describes the paper it points at), but a bare
// seed id has no such entry pointing at it, so `self` is how the edge supplies a seed's own
// title/year without changing the "plain id in, closure out" shape of this function. An oracle
// that never sets `self` still works; seed rows then simply carry no title/year.

export interface SnowballPaper {
  /** The id this paper would itself be queried by (an S2 paperId, or the same string as
   * `arxiv` when that is all the oracle needs) — used to EXPAND it, not necessarily the
   * canonical id the closure dedupes on. */
  id: string;
  arxiv?: string;
  s2?: string;
  title?: string;
  year?: number;
}

export interface OracleResult {
  self?: SnowballPaper;
  refs: SnowballPaper[];
  cites: SnowballPaper[];
}

export type SnowballOracle = (id: string) => OracleResult;

export type SnowballDirection = "seed" | "ref" | "cite" | "both";

export interface ClosureEntry {
  id: string;
  arxiv?: string;
  s2?: string;
  title?: string;
  year?: number;
  depth: number;
  via: string[];
  direction: SnowballDirection;
}

export interface SnowballOptions {
  minYear?: number;
}

interface NodeInternal {
  canonical: string;
  arxiv?: string;
  s2?: string;
  title?: string;
  year?: number;
  depth: number;
  via: Set<string>;
  direction: SnowballDirection;
  expandId: string;
}

/** Canonical id: prefer arXiv id, else S2 paperId, else whatever raw id the oracle used. */
function canonicalOf(p: Pick<SnowballPaper, "id" | "arxiv" | "s2">): string {
  return p.arxiv ?? p.s2 ?? p.id;
}

function fillMissing(target: NodeInternal, p: SnowballPaper): void {
  if (target.arxiv === undefined && p.arxiv !== undefined) target.arxiv = p.arxiv;
  if (target.s2 === undefined && p.s2 !== undefined) target.s2 = p.s2;
  if (target.title === undefined && p.title !== undefined) target.title = p.title;
  if (target.year === undefined && p.year !== undefined) target.year = p.year;
}

/** Computes the deterministic BFS citation closure of `seeds` to `maxDepth` hops, then applies
 * `options.minYear` (if given) as a pure post-filter that only ever removes rows — an entry with
 * an unknown year is never dropped (we only remove what we positively know is too old), and
 * filtering never changes a surviving row's fields. Output is sorted by (depth, id), independent
 * of the oracle's own array/iteration order. Depth is the SHORTEST path length from any seed —
 * a longer path discovered later (deeper expansion) never bumps an already-fixed depth, though
 * it can still enrich `via`/`direction` (e.g. a paper found by `ref` at depth 1 can later also be
 * found by `cite` from a depth-1 parent, becoming `direction: "both"` while staying at depth 1). */
export function snowballClosure(
  seeds: string[],
  maxDepth: number,
  oracle: SnowballOracle,
  options: SnowballOptions = {},
): ClosureEntry[] {
  const visited = new Map<string, NodeInternal>();
  const oracleCache = new Map<string, OracleResult>();

  function callOracle(id: string): OracleResult {
    let r = oracleCache.get(id);
    if (r === undefined) {
      r = oracle(id);
      oracleCache.set(id, r);
    }
    return r;
  }

  function upsert(
    p: SnowballPaper,
    atDepth: number,
    parent: string | null,
    dir: SnowballDirection,
  ): { entry: NodeInternal; isNew: boolean } {
    const cid = canonicalOf(p);
    let entry = visited.get(cid);
    let isNew = false;
    if (!entry) {
      isNew = true;
      entry = {
        canonical: cid,
        arxiv: p.arxiv,
        s2: p.s2,
        title: p.title,
        year: p.year,
        depth: atDepth,
        via: new Set<string>(),
        direction: dir,
        expandId: p.id,
      };
      visited.set(cid, entry);
    } else {
      fillMissing(entry, p);
      if (entry.direction !== "seed") {
        if (dir === "seed") entry.direction = "seed";
        else if (dir !== entry.direction) entry.direction = "both";
      }
    }
    if (parent !== null) entry.via.add(parent);
    return { entry, isNew };
  }

  let frontier: NodeInternal[] = [];
  for (const seedId of seeds) {
    const result = callOracle(seedId);
    const selfPaper: SnowballPaper = result.self ?? { id: seedId };
    const { entry, isNew } = upsert(selfPaper, 0, null, "seed");
    entry.expandId = seedId; // always expand via the literal seed id, reusing the cached call above
    if (isNew) frontier.push(entry);
  }

  for (let level = 0; level < maxDepth; level++) {
    const nextFrontier: NodeInternal[] = [];
    for (const parentEntry of frontier) {
      const result = callOracle(parentEntry.expandId);
      if (result.self) fillMissing(parentEntry, result.self);
      for (const refPaper of result.refs) {
        const { entry: child, isNew } = upsert(refPaper, level + 1, parentEntry.canonical, "ref");
        if (isNew) nextFrontier.push(child);
      }
      for (const citePaper of result.cites) {
        const { entry: child, isNew } = upsert(citePaper, level + 1, parentEntry.canonical, "cite");
        if (isNew) nextFrontier.push(child);
      }
    }
    frontier = nextFrontier;
  }

  let entries: ClosureEntry[] = [...visited.values()].map((n) => {
    const e: ClosureEntry = { id: n.canonical, depth: n.depth, via: [...n.via].sort(), direction: n.direction };
    if (n.arxiv !== undefined) e.arxiv = n.arxiv;
    if (n.s2 !== undefined) e.s2 = n.s2;
    if (n.title !== undefined) e.title = n.title;
    if (n.year !== undefined) e.year = n.year;
    return e;
  });

  if (options.minYear !== undefined) {
    const minYear = options.minYear;
    entries = entries.filter((e) => e.year === undefined || e.year >= minYear);
  }

  entries.sort((a, b) => a.depth - b.depth || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return entries;
}
