// ROLE: Gate 1 — defs (definitions/*.md). Contract: docs/gate-contracts.md "Gate 1 — defs".
// Guards term/alias DRIFT (dedup namespace across shards) and cited-shard provenance
// (source/sha256 REQUIRED for kind=cited, F5 reversed per M0.7 — checks 8-9 below). Ground
// truth for message text and value-check gating: check-defs.py:75-143 (characterized prior
// art, ported per checks 1-14; the M0.7 amendment to checks 8-9 is an intentional rk-stricter
// divergence, not a port of AISM's own `if src`/`if sha` guards — see Divergences in the
// contract and corpus/defs/defs-15).
// PURITY: pure — no fs/network/clock (L3).

import type { CoverageLine, Finding, Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { hasPath, listDir, parseFrontmatter } from "./snapshot";
import type { GateConfig } from "./config";

const KINDS = ["cited", "consensus", "original"] as const;
const KIND_SET = new Set<string>(KINDS);
const STATUSES = ["draft", "locked"] as const;
const STATUS_SET = new Set<string>(STATUSES);
const REQUIRED_FIELDS = ["id", "term", "kind", "status"] as const;
const SKIP_FILES = new Set(["README.md", "INDEX.md"]);
const MANIFEST_PATH = "refs/manifest/checksums.sha256";

/** True iff a frontmatter field value is absent or blank — check-defs.py's `not fm.get(field)`
 * truthiness test, ported (an empty string after `key:` counts as missing, same as no line at
 * all). */
function isMissing(v: string | undefined): boolean {
  return v === undefined || v.trim() === "";
}

interface ManifestInfo {
  present: boolean;
  /** 16-hex sha256 prefix -> manifest-recorded path (relative to `refs/`), check-defs.py:53-72
   * `load_manifest`'s `prefix2path`. */
  prefix2path: Map<string, string>;
  /** Top-level directory name of every manifest path (`refs/<source-id>/...`) — the "known
   * refs/ source-id" set, check-defs.py:69. */
  sourceIds: Set<string>;
}

/** Parses `refs/manifest/checksums.sha256` (a standard `sha256sum`-style manifest: 64-hex hash,
 * two spaces, path) out of the snapshot — check-defs.py:53-72, `load_manifest`. Absent manifest
 * is a legitimate state (check 14), not an error here; the caller emits the WARN. */
function loadManifest(snapshot: RepoSnapshot): ManifestInfo {
  const content = snapshot.get(MANIFEST_PATH);
  if (content === undefined) {
    return { present: false, prefix2path: new Map(), sourceIds: new Set() };
  }
  const prefix2path = new Map<string, string>();
  const sourceIds = new Set<string>();
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const sepIdx = line.indexOf("  ");
    const hash = sepIdx === -1 ? line : line.slice(0, sepIdx);
    const rawPath = sepIdx === -1 ? "" : line.slice(sepIdx + 2);
    const p = rawPath.replace(/^[./]+/, "");
    prefix2path.set(hash.slice(0, 16), p);
    const slash = p.indexOf("/");
    if (slash !== -1) sourceIds.add(p.slice(0, slash));
  }
  return { present: true, prefix2path, sourceIds };
}

/** DEDUP/DRIFT dedup keys for one shard: `term` plus every `;`-separated `aliases` entry,
 * lower-cased, blank entries dropped — check-defs.py:99-100. Exported for unit-testing the
 * dedup namespace in isolation (test/gates/defs.test.ts). */
export function dedupNames(term: string | undefined, aliases: string | undefined): string[] {
  const t = (term ?? "").trim();
  const rest = (aliases ?? "").split(";").map((a) => a.trim()).filter((a) => a.length > 0);
  return [t, ...rest].filter((n) => n.length > 0);
}

/** One shard's checks 2-13 (everything after the frontmatter presence/termination gate),
 * appending findings to `findings` and updating the shared `aliasOwner` dedup map. Exported
 * for unit-testing individual checks against a hand-built `fields` map without needing a full
 * fixture file (test/gates/defs.test.ts). */
export function checkShard(
  path: string,
  fields: Record<string, string>,
  manifest: ManifestInfo,
  snapshot: RepoSnapshot,
  aliasOwner: Map<string, string>,
  findings: Finding[],
): { cited: boolean; hashVerified: boolean } {
  for (const field of REQUIRED_FIELDS) {
    if (isMissing(fields[field])) {
      findings.push({ severity: "ERROR", path, message: `missing required field '${field}'` });
    }
  }

  const id = fields.id;
  const stem = path.slice(path.lastIndexOf("/") + 1, -".md".length);
  if (!isMissing(id) && id !== stem) {
    findings.push({ severity: "ERROR", path, message: `id '${id}' != filename stem '${stem}'` });
  }

  const kind = fields.kind;
  if (!isMissing(kind) && !KIND_SET.has(kind!)) {
    findings.push({ severity: "ERROR", path, message: `kind '${kind}' not in ${KINDS.join(", ")}` });
  }

  const status = fields.status;
  if (!isMissing(status) && !STATUS_SET.has(status!)) {
    findings.push({ severity: "ERROR", path, message: `status '${status}' not in ${STATUSES.join(", ")}` });
  }

  // DEDUP/DRIFT — check-defs.py:98-107: one lower-cased name namespace (term + aliases) across
  // every shard; a name already owned by a DIFFERENT shard is DRIFT.
  for (const nm of dedupNames(fields.term, fields.aliases)) {
    const key = nm.toLowerCase();
    const owner = aliasOwner.get(key);
    if (owner !== undefined && owner !== path) {
      findings.push({ severity: "ERROR", path, message: `DRIFT: name '${nm}' claimed by both ${owner} and ${path}` });
    }
    aliasOwner.set(key, path);
  }

  let cited = false;
  let hashVerified = false;

  if (kind === "cited") {
    cited = true;
    const source = fields.source;
    const shaRaw = fields.sha256;
    // checks 8-9 (F5 reversed, M0.7): presence is REQUIRED unconditionally, regardless of
    // manifest state; '-' counts as missing sha256 same as absence (Tier-A boundary-review
    // carry-forward, 2026-07-17).
    const shaMissing = isMissing(shaRaw) || shaRaw === "-";
    if (isMissing(source)) {
      findings.push({ severity: "ERROR", path, message: "cited shard missing required 'source:'" });
    }
    if (shaMissing) {
      findings.push({ severity: "ERROR", path, message: "cited shard missing required 'sha256:'" });
    }
    // value sub-checks: manifest-gated, ported unchanged from check-defs.py:112-118.
    if (!isMissing(source) && manifest.sourceIds.size > 0 && !manifest.sourceIds.has(source!)) {
      findings.push({ severity: "ERROR", path, message: `cited source '${source}' not a refs/ source-id` });
    }
    if (!shaMissing) {
      const sha = shaRaw!;
      if (manifest.prefix2path.size > 0 && !manifest.prefix2path.has(sha)) {
        findings.push({ severity: "ERROR", path, message: `sha256 prefix '${sha}' not in refs manifest` });
      } else if (manifest.prefix2path.has(sha)) {
        hashVerified = true;
        const resolved = manifest.prefix2path.get(sha)!;
        if (!isMissing(source) && !resolved.startsWith(`${source}/`)) {
          findings.push({
            severity: "WARN",
            path,
            message: `sha256 ${sha} -> ${resolved}, not under source '${source}'`,
          });
        }
        if (!hasPath(snapshot, `refs/${resolved}`)) {
          findings.push({
            severity: "WARN",
            path,
            message: `source payload absent locally (${resolved}); hash unverifiable`,
          });
        }
      }
    }
  } else if (kind === "consensus" || kind === "original") {
    if (isMissing(fields.consensus)) {
      findings.push({ severity: "ERROR", path, message: `${kind} shard must record 'consensus:'` });
    }
  }

  if (status === "draft") {
    findings.push({ severity: "WARN", path, message: "status=draft (not yet consensus-gated)" });
  }

  return { cited, hashVerified };
}

export const defsGate: Gate = {
  name: "defs",
  run(snapshot: RepoSnapshot, _config: GateConfig): GateResult {
    // Gate 1 carves out no per-repo GateConfig parameter (contract's "Per-repo parameters"
    // section names only the linker soft cap, provenance status-table file, and shards
    // PREFIX/MAX_LINES) — config is accepted for interface uniformity, unused here.
    const findings: Finding[] = [];
    const manifest = loadManifest(snapshot);
    if (!manifest.present) {
      findings.push({
        severity: "WARN",
        path: MANIFEST_PATH,
        message: `manifest absent: ${MANIFEST_PATH} (cannot verify cited hashes)`,
      });
    }

    const shardNames = listDir(snapshot, "definitions")
      .filter((n) => n.endsWith(".md") && !SKIP_FILES.has(n))
      .sort();

    const aliasOwner = new Map<string, string>();
    let citedCount = 0;
    let hashVerifiedCount = 0;

    for (const name of shardNames) {
      const path = `definitions/${name}`;
      const content = snapshot.get(path) ?? "";
      const fm = parseFrontmatter(content);

      // check 1: present + terminated, or ERROR and skip the rest of this shard entirely —
      // check-defs.py:83-87 (`fm is None -> errors.append(...); continue`), same for an
      // unterminated block: malformed-line scanning below never ran to produce any lines to
      // report in that case (parse_frontmatter returns None before the line loop starts).
      if (!fm.present || !fm.terminated) {
        findings.push({ severity: "ERROR", path, message: "missing/unterminated frontmatter" });
        continue;
      }

      // check 2: a line with no ':' inside an otherwise well-terminated block.
      for (const lineNo of fm.malformedLines) {
        findings.push({ severity: "ERROR", path, line: lineNo, message: "frontmatter line without ':'" });
      }

      const { cited, hashVerified } = checkShard(path, fm.fields, manifest, snapshot, aliasOwner, findings);
      if (cited) citedCount++;
      if (hashVerified) hashVerifiedCount++;
    }

    const total = shardNames.length;
    let unit = "shards";
    if (citedCount > 0) {
      unit += manifest.present
        ? `, ${hashVerifiedCount}/${citedCount} cited shards hash-verified`
        : `, 0/${citedCount} cited shards hash-verified — manifest absent`;
    }
    const coverage: CoverageLine[] = [{ gate: "defs", unit, checked: total, total }];

    return { findings, coverage };
  },
};
