// ROLE: Gate 1 validation for one ordinary definition shard plus checksum-manifest parsing.
// PURITY: pure — no fs/network/clock (L3).

import type { Finding } from "./framework";
import { hasPath, type RepoSnapshot } from "./snapshot";

const KINDS = ["cited", "consensus", "original"] as const;
const STATUSES = ["draft", "locked"] as const;
const REQUIRED_FIELDS = ["id", "term", "kind", "status"] as const;
export const DEFS_MANIFEST_PATH = "refs/manifest/checksums.sha256";

export interface DefsManifestInfo {
  present: boolean;
  prefix2path: Map<string, string>;
  sourceIds: Set<string>;
}

function missing(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

export function loadDefsManifest(snapshot: RepoSnapshot): DefsManifestInfo {
  const content = snapshot.get(DEFS_MANIFEST_PATH);
  if (content === undefined) return { present: false, prefix2path: new Map(), sourceIds: new Set() };
  const prefix2path = new Map<string, string>();
  const sourceIds = new Set<string>();
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const separator = line.indexOf("  ");
    const hash = separator === -1 ? line : line.slice(0, separator);
    const path = (separator === -1 ? "" : line.slice(separator + 2)).replace(/^[./]+/, "");
    prefix2path.set(hash.slice(0, 16), path);
    const slash = path.indexOf("/");
    if (slash !== -1) sourceIds.add(path.slice(0, slash));
  }
  return { present: true, prefix2path, sourceIds };
}

export function dedupNames(term: string | undefined, aliases: string | undefined): string[] {
  const canonical = (term ?? "").trim();
  const rest = (aliases ?? "").split(";").map((alias) => alias.trim()).filter(Boolean);
  return [canonical, ...rest].filter(Boolean);
}

export function checkShard(
  path: string,
  fields: Record<string, string>,
  manifest: DefsManifestInfo,
  snapshot: RepoSnapshot,
  aliasOwner: Map<string, string>,
  findings: Finding[],
): { cited: boolean; hashVerified: boolean } {
  for (const field of REQUIRED_FIELDS) {
    if (missing(fields[field])) {
      findings.push({ severity: "ERROR", path, message: `missing required field '${field}'`, structural: field === "id" });
    }
  }

  const id = fields.id;
  const stem = path.slice(path.lastIndexOf("/") + 1, -".md".length);
  if (!missing(id) && id !== stem) {
    findings.push({ severity: "ERROR", path, message: `id '${id}' != filename stem '${stem}'`, structural: true });
  }
  const kind = fields.kind;
  if (!missing(kind) && !KINDS.includes(kind as (typeof KINDS)[number])) {
    findings.push({ severity: "ERROR", path, message: `kind '${kind}' not in ${KINDS.join(", ")}` });
  }
  const status = fields.status;
  if (!missing(status) && !STATUSES.includes(status as (typeof STATUSES)[number])) {
    findings.push({ severity: "ERROR", path, message: `status '${status}' not in ${STATUSES.join(", ")}` });
  }

  for (const name of dedupNames(fields.term, fields.aliases)) {
    const key = `term:${name.toLowerCase()}`;
    const owner = aliasOwner.get(key);
    if (owner !== undefined && owner !== path) {
      findings.push({ severity: "ERROR", path, message: `DRIFT: name '${name}' claimed by both ${owner} and ${path}`, structural: true });
    }
    aliasOwner.set(key, path);
  }

  let result: { cited: boolean; hashVerified: boolean } = { cited: false, hashVerified: false };
  if (kind === "cited") result = checkCited(path, fields, manifest, snapshot, findings);
  if ((kind === "consensus" || kind === "original") && missing(fields.consensus)) {
    findings.push({ severity: "ERROR", path, message: `${kind} shard must record 'consensus:'` });
  }
  if (status === "draft") findings.push({ severity: "WARN", path, message: "status=draft (not yet consensus-gated)" });
  return result;
}

function checkCited(
  path: string,
  fields: Record<string, string>,
  manifest: DefsManifestInfo,
  snapshot: RepoSnapshot,
  findings: Finding[],
): { cited: true; hashVerified: boolean } {
  const source = fields.source;
  const sha = fields.sha256;
  const shaMissing = missing(sha) || sha === "-";
  if (missing(source)) findings.push({ severity: "ERROR", path, message: "cited shard missing required 'source:'" });
  if (shaMissing) findings.push({ severity: "ERROR", path, message: "cited shard missing required 'sha256:'" });
  if (!missing(source) && manifest.sourceIds.size > 0 && !manifest.sourceIds.has(source!)) {
    findings.push({ severity: "ERROR", path, message: `cited source '${source}' not a refs/ source-id` });
  }
  if (shaMissing) return { cited: true, hashVerified: false };
  if (manifest.prefix2path.size > 0 && !manifest.prefix2path.has(sha!)) {
    findings.push({ severity: "ERROR", path, message: `sha256 prefix '${sha}' not in refs manifest` });
    return { cited: true, hashVerified: false };
  }
  if (!manifest.prefix2path.has(sha!)) return { cited: true, hashVerified: false };

  const resolved = manifest.prefix2path.get(sha!)!;
  if (!missing(source) && !resolved.startsWith(`${source}/`)) {
    findings.push({ severity: "WARN", path, message: `sha256 ${sha} -> ${resolved}, not under source '${source}'` });
  }
  if (!hasPath(snapshot, `refs/${resolved}`)) {
    findings.push({ severity: "WARN", path, message: `source payload absent locally (${resolved}); hash unverifiable` });
  }
  return { cited: true, hashVerified: true };
}
