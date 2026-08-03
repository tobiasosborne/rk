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
import { statusTableSource, type SourceRow, type StatusRow } from "./provenance-md";

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

/** Why check 5 compared the number of rows it did (rk-lkeh, 2026-07-25). Three states, never
 * conflated — the same discipline `src/drive/cross-vendor.ts` applies to `identity-unparseable`
 * vs `same-family`: an unenforceable configuration and a genuine table/registry disagreement
 * produce the SAME symptom (zero comparisons) and must never be reported as one another.
 *   - `joined`          — at least one parsed row was actually compared (or there were no rows
 *                         to compare, the vacuous provenance-13 state).
 *   - `no-join-universe`— NO registry result maps to any report label at all, so the join could
 *                         not have succeeded for any row whatsoever. This is the relocated-
 *                         status-table shape: `provenanceStatusTableFile` re-points the ROWS,
 *                         but the LABELS are still scanned from `report/sections/*.tex`
 *                         (`texLabels`), so a table moved out of a campaign that has no
 *                         `report/sections/` joins against an empty universe.
 *   - `labels-disjoint` — a non-empty label universe exists; this table simply cites none of it
 *                         (a stale table, a table written ahead of the registry, a typo). */
export type StatusJoinCause = "joined" | "no-join-universe" | "labels-disjoint";

/** What check 5 was actually able to COMPARE, as distinct from what the status-table parser
 * handed it. `rows` is the parser's own count (the coverage line's `S`); `joinedRows` is the
 * subset whose labels resolved to a registry result — the only rows check 5 can draw a verdict
 * from. `S > 0 && joinedRows === 0` is a check reporting green while verifying nothing. */
export interface StatusJoinReport {
  rows: number;
  joinedRows: number;
  /** Size of the label -> registry-result map the join goes through (explicit `report <label>`
   * tokens plus resolved id-transform candidates). */
  universe: number;
  cause: StatusJoinCause;
}

// check 5 — status OVERCLAIM (ERROR) / underclaim (WARN): check-provenance.py:293,317-321.
// Returns its own JOIN coverage (rk-lkeh) — see `StatusJoinReport`.
export function checkStatusDrift(
  statusRows: { statusCell: string; labels: string[] }[],
  shards: RegistryShard[],
  tex: TexLabels,
  findings: Finding[],
): StatusJoinReport {
  const idOfLabel = new Map<string, string>();
  for (const s of shards) for (const lab of labelsOf(s, tex)) idOfLabel.set(lab, s.id);
  const shardOf = new Map(shards.map((s) => [s.id, s]));
  const cellsOf = new Map<string, Set<string>>();
  let joinedRows = 0;
  for (const { statusCell, labels } of statusRows) {
    let joined = false;
    for (const lab of labels) {
      const rid = idOfLabel.get(lab);
      if (!rid) continue;
      joined = true;
      if (!cellsOf.has(rid)) cellsOf.set(rid, new Set());
      cellsOf.get(rid)!.add(statusCell);
    }
    if (joined) joinedRows += 1;
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
  const cause: StatusJoinCause =
    statusRows.length === 0 || joinedRows > 0 ? "joined" : idOfLabel.size === 0 ? "no-join-universe" : "labels-disjoint";
  return { rows: statusRows.length, joinedRows, universe: idOfLabel.size, cause };
}

/** rk-lkeh: the JOIN half of check 5's coverage duty (CLAUDE.md L2, "a silent skip is a bug").
 * `S` (rows parsed) has been on the coverage line since F3/`provenance-13`, but a table can parse
 * S>0 rows and still compare NOTHING — every label unresolvable — leaving check 5 (this gate's #1
 * guarded failure mode, OVERCLAIM) verifying zero things while the gate reports clean. That is the
 * exact silent-skip shape `provenance-13` exists to remove, one join further in.
 *
 * WARN, not ERROR, deliberately: a zero-join table is unverified coverage, not a proven validity
 * defect, and a legitimately transient state exists (a table drafted ahead of the registry). The
 * defect this closes is the SILENCE, not the state. The two causes are named separately and never
 * conflated — see `StatusJoinCause`. Returns `undefined` when there is nothing to report. */
function statusJoinWarning(tabStatusFile: string, join: StatusJoinReport): Finding | undefined {
  if (join.rows === 0 || join.joinedRows > 0) return undefined;
  const cause =
    join.cause === "no-join-universe"
      ? `no registry result maps to ANY report label (the join universe is empty): the table's ROWS come from ` +
        `the configured '${tabStatusFile}', but the LABELS they join against are scanned from ` +
        `report/sections/*.tex and no shard carries an explicit 'report <label>' token either — ` +
        `relocating the status table does NOT relocate the label scan (docs/gate-contracts.md Gate 4, ` +
        `provenance-11 scope)`
      : `${join.universe} registry-mapped report label(s) exist, but this table cites none of them ` +
        `(stale table, table written ahead of the registry, or a label typo)`;
  return {
    severity: "WARN",
    path: tabStatusFile,
    message:
      `tab:status parsed ${join.rows} row(s) but check 5 (OVERCLAIM/underclaim) compared 0 of ${join.rows} ` +
      `— ${cause}. Reported as unverified coverage, never as a passing status check.`,
  };
}

/** rk-lkeh (2026-07-25): a CONFIGURED status table that exists on disk but was never text-loaded.
 * `provenanceStatusTableFile` can name any repo-relative path, but `src/store/snapshot-load.ts`
 * text-loads only the six gates' declared Inputs — so pointing it at, say, `paper/status.tex`
 * yields `statusTableRows() === []`, byte-identical in every visible way to "this campaign has no
 * status table": check 5 verifies nothing and the gate reports clean.
 *
 * ERROR, not WARN: this is a check the repo explicitly CONFIGURED and that cannot run. Gate 7's
 * unrecognized-generator rule already ratifies the principle in this codebase — "a manifest
 * declaring an unverifiable artifact must never exit green ... regardless of WHY this binary
 * cannot verify it". A GENUINELY absent file stays a non-finding: that is the ordinary day-1 /
 * no-report state (`provenance-13`, and every repo running the default value with no report/). */
function statusTableSourceError(
  snapshot: RepoSnapshot,
  tabStatusFile: string,
  explicitlyConfigured: boolean,
): Finding | undefined {
  const source = statusTableSource(snapshot, tabStatusFile);
  if (source === "present-but-unloaded") {
    return {
      severity: "ERROR",
      path: tabStatusFile,
      message:
        `configured provenanceStatusTableFile '${tabStatusFile}' is present on disk but its text was ` +
        `NOT loaded — it lies outside src/store/snapshot-load.ts's include rules (definitions/, ` +
        `argument/**, proofs/**, refs/**, runs/**, report/**/*.{tex,md}, .rk/). check 5 read ZERO rows ` +
        `from a table that exists, so an OVERCLAIM in it cannot be seen. Move the table under report/ ` +
        `(its labels are scanned from report/sections/*.tex either way — see docs/gate-contracts.md ` +
        `Gate 4, provenance-11 scope) or drop the override.`,
    };
  }
  // LB6 (2026-08-03 M3-close review): EXPLICITLY CONFIGURED but absent from the snapshot entirely.
  // This is provenance-22's reasoning one step further, and it reproduces AISM incident (a): a
  // renamed status-table file left check 5 — this gate's #1 guarded failure mode, OVERCLAIM —
  // verifying NOTHING, green, coverage `0 tab:status rows (0 joined)`, byte-identical to the state
  // of a campaign that simply has no status table. `provenanceStatusTableFile` has a non-undefined
  // DEFAULT (src/gates/config.ts:131), so the value alone cannot tell the two apart; the
  // `overriddenKeys` fact carried on `config._configValidation` (LB6) can, and that is the whole
  // reason it was threaded in.
  if (source === "absent" && explicitlyConfigured) {
    return {
      severity: "ERROR",
      path: tabStatusFile,
      message:
        `provenanceStatusTableFile is EXPLICITLY SET in .rk/config.json to '${tabStatusFile}', but no ` +
        `such file exists in this repo — check 5 (OVERCLAIM/underclaim) verified NOTHING and would ` +
        `otherwise have reported clean, indistinguishable from a campaign with no status table at ` +
        `all. A configured check that cannot run must never exit green (the same principle Gate 7 ` +
        `applies to an unverifiable declared artifact). next: fix the path (was the table renamed or ` +
        `moved?), or drop the override to fall back to the default.`,
    };
  }
  return undefined;
}

/** Check 5's whole surface in one call (rk-lkeh): the source-availability ERROR, the
 * OVERCLAIM/underclaim drift check itself, and the JOIN coverage the caller renders on the
 * coverage line. Three distinct states, never conflated — a table that could not be READ, a table
 * that was read but compared NOTHING, and a table that actually constrained the registry. */
export function checkStatusTable(
  snapshot: RepoSnapshot,
  tabStatusFile: string,
  statusRows: StatusRow[],
  shards: RegistryShard[],
  tex: TexLabels,
  findings: Finding[],
  /** LB6: whether `provenanceStatusTableFile` was EXPLICITLY set in `.rk/config.json` (as opposed
   * to being `DEFAULT_GATE_CONFIG`'s value). Defaults to `false` so every existing caller — unit
   * tests, corpus fixtures with no config — keeps the pre-LB6 day-1 semantics byte-for-byte. */
  explicitlyConfigured = false,
): StatusJoinReport {
  const sourceError = statusTableSourceError(snapshot, tabStatusFile, explicitlyConfigured);
  if (sourceError) findings.push(sourceError);
  const join = checkStatusDrift(statusRows, shards, tex, findings);
  // Suppressed when the table could not be read at all: the source ERROR above already names the
  // cause exactly, and a second finding saying "0 rows joined" would report the same defect twice
  // under a weaker, misleading description.
  if (!sourceError) {
    const joinWarning = statusJoinWarning(tabStatusFile, join);
    if (joinWarning) findings.push(joinWarning);
  }
  return join;
}
