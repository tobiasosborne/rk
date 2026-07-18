// PURITY: pure — no fs/network/clock (L3). Gate 4 (provenance) checks 4 (hash freshness) and 5
// (status OVERCLAIM/underclaim), split out of provenance.ts to stay under the ~200-line shard
// target / 280 hard cap (CLAUDE.md Rule 4) — provenance-sha256.ts (the shard this file's check 4
// half used to live in) was folded into snapshot.ts's fileSha256/isTracked accessors during the
// rk-399 snapshot-facts redesign, freeing this slot. Contract: docs/gate-contracts.md "Gate 4 —
// provenance", checks 4-5. Ported from check-provenance.py per CLAUDE.md L5: characterized,
// never canon.

import type { Finding } from "./framework";
import { fileSha256, isTracked, type RepoSnapshot } from "./snapshot";
import { labelsOf, type RegistryShard, type TexLabels } from "./provenance-parse";
import type { SourceRow } from "./provenance-md";

const SHA16_RE = /^[0-9a-f]{16}$/;

function pyListRepr(items: Iterable<string>): string {
  return `[${[...items].map((i) => `'${i}'`).join(", ")}]`;
}

// check 4 — hash freshness (ERROR/WARN): check-provenance.py:368-404. Consumes the edge's
// byte-faithful `snapshot.sha256` fact and real `isTracked` state (see provenance.ts's file-header
// boundary note) — the gate never re-hashes text. tracked+stale ⇒ ERROR (AISM parity); present-
// but-untracked (gitignored) + stale ⇒ ERROR [rk-stricter-intended]; absent ⇒ WARN, never ERROR.
export function checkSourceHashes(
  sourceRows: SourceRow[],
  snapshot: RepoSnapshot,
  findings: Finding[],
  provenancePath: string,
): void {
  const unverifiable = new Set<string>();
  for (const { key, path, sha } of sourceRows) {
    if (!SHA16_RE.test(sha)) {
      findings.push({ severity: "ERROR", path: provenancePath, message: `source '${key}': sha '${sha}' is not 16 lowercase hex` });
      continue;
    }
    if (path.startsWith("/")) {
      findings.push({
        severity: "WARN",
        path: provenancePath,
        message: `source '${key}': absolute path '${path}' (not refs/-relative); hash unverifiable`,
      });
      continue;
    }
    const full = fileSha256(snapshot, path);
    if (full === undefined) {
      // No byte-faithful hash measured for this path => it is genuinely ABSENT from disk. The edge
      // hashes EVERY file present on disk — tracked or not, inside the include rules or not, and
      // (round-3 landing-blocker 1) under any directory except the repo-root `.git` — so "no hash
      // fact" can only mean the path is not on disk at all, never "present but unloaded".
      // Unverifiable, WARN — never a false ERROR (contract Gate 4 check 4, "genuinely absent ⇒ WARN").
      unverifiable.add(key);
      continue;
    }
    const actual = full.slice(0, 16);
    if (actual !== sha) {
      const suffix = isTracked(snapshot, path)
        ? ""
        : " [present on disk but git-untracked; rk-stricter-intended ERROR — see docs/gate-contracts.md Gate 4 check 4]";
      findings.push({
        severity: "ERROR",
        path: provenancePath,
        message: `source '${key}': recorded ${sha} != actual ${actual} (${path}) — file edited, hash stale${suffix}`,
      });
    }
  }
  if (unverifiable.size > 0) {
    findings.push({
      severity: "WARN",
      path: provenancePath,
      message:
        `${unverifiable.size} source payload(s) not hash-verifiable here (untracked/absent from this ` +
        `snapshot): ${[...unverifiable].sort().join(", ")}`,
    });
  }
}

// check 5 — status OVERCLAIM (ERROR) / underclaim (WARN): check-provenance.py:293,317-321.
export function checkStatusDrift(
  statusRows: { statusCell: string; labels: string[] }[],
  shards: RegistryShard[],
  tex: TexLabels,
  findings: Finding[],
): void {
  const idOfLabel = new Map<string, string>();
  for (const s of shards) for (const lab of labelsOf(s, tex)) idOfLabel.set(lab, s.id);
  const shardOf = new Map(shards.map((s) => [s.id, s]));
  const cellsOf = new Map<string, Set<string>>();
  for (const { statusCell, labels } of statusRows) {
    for (const lab of labels) {
      const rid = idOfLabel.get(lab);
      if (!rid) continue;
      if (!cellsOf.has(rid)) cellsOf.set(rid, new Set());
      cellsOf.get(rid)!.add(statusCell);
    }
  }
  for (const [rid, cells] of cellsOf) {
    const shard = shardOf.get(rid)!;
    const anyOpen = [...cells].some((c) => c === "open");
    const anyNonopen = [...cells].some((c) => c !== "open");
    if (shard.status === "open" && !anyOpen) {
      findings.push({
        severity: "ERROR",
        path: shard.path,
        message:
          `OVERCLAIM ${rid}: registry status=open but tab:status frames it ${pyListRepr([...cells].sort())} ` +
          `(never 'open') — the paper claims an open result is settled`,
      });
    }
    if ((shard.af === "validated" || shard.status === "proved") && !anyNonopen) {
      findings.push({
        severity: "WARN",
        path: shard.path,
        message: `${rid}: registry ${shard.status}/${shard.af} but tab:status frames it only 'open'`,
      });
    }
  }
}
