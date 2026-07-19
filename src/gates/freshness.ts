// PURITY: pure — no fs/network/clock (L3). Gate 7 — freshness (M2.6). Ground truth:
// docs/gate-contracts.md "Gate 7 — freshness". Regenerate-and-diff over a DECLARED manifest of
// generated artifacts (`.rk/generated.json`) — the general mechanism IMPLEMENTATION_PLAN M2.6
// names ("regenerate-and-diff replaces mirror-check gates"), designed so a FUTURE generator (an
// M2.4 `rk render` HTML output, or any later renderer) registers by adding one entry to
// `GENERATORS` below — no other gate code, no CoverageLine shape, no CLI wiring changes.
//
// Manifest shape (schemas/generated.v1.json): `{"schema_version":"1","entries":[{"path":...,
// "generator":...}]}`. Untrusted, hand-editable JSON — same edge-trust posture as
// `.rk/config.json` (src/gates/config.ts's rk-xbm precedent): a malformed manifest is never a
// crash and never a silent no-op. It produces one loud ERROR per malformation and the affected
// entry is dropped from the checked set (never silently treated as "absent" — a malformed
// manifest is a real, visible defect, distinct from "never adopted").
//
// Check-11 boundary (documented in full in docs/gate-contracts.md's Gate 7 section): a manifest
// entry's `path` is superseded out of Gate 2 Check 11 (src/gates/linker-render.ts's
// `checkGenerated`) ONLY when its `generator` is one this gate actually recognizes
// (`freshnessSupersededPaths` below) — never merely because SOME manifest exists. This keeps a
// freshly-stamped, still-empty manifest from silently opening a staleness gap for
// `argument/INDEX.md`/`DAG.md` before a repo has actually declared them here.

import type { CoverageLine, Finding, Gate, GateResult } from "./framework";
import type { GateConfig } from "./config";
import type { RepoSnapshot } from "./snapshot";
import { parseRegistry } from "./linker-parse";
import { renderDag, renderIndex } from "./linker-render";

export const MANIFEST_PATH = ".rk/generated.json";

export interface ManifestEntry {
  path: string;
  generator: string;
}

/** The one extension point. Each function takes the snapshot and returns the exact bytes a fresh
 * regenerate of its declared artifact would produce — byte-for-byte, no trailing-newline
 * flexibility, same discipline as `linker-render.ts`'s own `checkGenerated` (any formatting
 * drift here false-positives every clean fixture, not just the intentionally-stale one). The two
 * entries below are the pre-existing AISM-mirror generators Gate 2 Check 11 already renders;
 * M2.4's HTML outputs (a different worktree, not integrated here by design) add their own entries
 * later without touching anything else in this file. */
const GENERATORS: Record<string, (snapshot: RepoSnapshot) => string> = {
  "linker-index": (snapshot) => renderIndex(parseRegistry(snapshot).lemmas),
  "linker-dag": (snapshot) => renderDag(parseRegistry(snapshot).lemmas),
};

interface ParsedManifest {
  entries: ManifestEntry[];
  findings: Finding[];
}

function isEntryShape(e: unknown): e is ManifestEntry {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as Record<string, unknown>).path === "string" &&
    ((e as Record<string, unknown>).path as string).length > 0 &&
    typeof (e as Record<string, unknown>).generator === "string" &&
    ((e as Record<string, unknown>).generator as string).length > 0
  );
}

/** Parses + validates `.rk/generated.json`. Never throws, never silently drops a malformation:
 * absent ⇒ `{entries: [], findings: []}` (the presence-conditional golden case, handled by the
 * caller); present-but-unparseable/malshaped ⇒ one ERROR finding per malformation and the
 * offending entry (or the whole file, for a top-level shape error) excluded from `entries`. */
function parseManifest(snapshot: RepoSnapshot): ParsedManifest {
  const raw = snapshot.get(MANIFEST_PATH);
  if (raw === undefined) return { entries: [], findings: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      entries: [],
      findings: [
        { severity: "ERROR", path: MANIFEST_PATH, line: 1, message: `malformed ${MANIFEST_PATH}: not valid JSON (${msg})` },
      ],
    };
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    !Array.isArray((parsed as Record<string, unknown>).entries)
  ) {
    return {
      entries: [],
      findings: [
        {
          severity: "ERROR",
          path: MANIFEST_PATH,
          line: 1,
          message: `malformed ${MANIFEST_PATH}: expected a JSON object with an "entries" array`,
        },
      ],
    };
  }

  const rawEntries = (parsed as { entries: unknown[] }).entries;
  const entries: ManifestEntry[] = [];
  const findings: Finding[] = [];
  rawEntries.forEach((e, i) => {
    if (!isEntryShape(e)) {
      findings.push({
        severity: "ERROR",
        path: MANIFEST_PATH,
        line: 1,
        message: `malformed ${MANIFEST_PATH}: entries[${i}] must be {"path": non-empty string, "generator": non-empty string}`,
      });
      return;
    }
    entries.push(e);
  });

  return { entries, findings };
}

/** Paths Gate 2 Check 11 must stop checking itself, because this gate has fully taken them over —
 * declared in the manifest AND carrying a `generator` id this gate recognizes. A path declared
 * with an unrecognized generator is deliberately NOT superseded, so Check 11 keeps covering it: an
 * empty, stale, or not-yet-updated manifest never opens a silent gap for `argument/INDEX.md`/
 * `DAG.md` (see this file's header comment and docs/gate-contracts.md's Gate 7 boundary note).
 * Malformed manifest content contributes no superseded paths (same reasoning: if this gate cannot
 * even parse the declaration, it cannot be said to have taken the path over). */
export function freshnessSupersededPaths(snapshot: RepoSnapshot): ReadonlySet<string> {
  const { entries } = parseManifest(snapshot);
  return new Set(entries.filter((e) => e.generator in GENERATORS).map((e) => e.path));
}

/** 1-indexed line number of the first line at which `have` and `want` diverge — matching by
 * exact line content. When one is a strict prefix of the other, the divergence starts at the
 * line immediately after the shared prefix (an added/removed trailing region). */
function firstDiffLine(have: string, want: string): number {
  const haveLines = have.split("\n");
  const wantLines = want.split("\n");
  const n = Math.min(haveLines.length, wantLines.length);
  for (let i = 0; i < n; i++) {
    if (haveLines[i] !== wantLines[i]) return i + 1;
  }
  return n + 1;
}

function snippet(line: string | undefined): string {
  if (line === undefined) return "<end of file>";
  return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

export const freshnessGate: Gate = {
  name: "freshness",
  run(snapshot: RepoSnapshot, _config: GateConfig): GateResult {
    if (!snapshot.has(MANIFEST_PATH)) {
      // Presence-conditional, whole-mechanism (generalizing the per-file precedent set by Gate 2
      // Check 11 / Gate 6's report/ guard — linker-25, shards-15): a repo that has never adopted
      // the freshness manifest has nothing declared to check. Never a finding; the non-adoption
      // is named on the coverage line, never a silent skip (CLAUDE.md L2).
      const coverage: CoverageLine[] = [
        { gate: "freshness", unit: `generated artifacts (manifest not adopted: ${MANIFEST_PATH} absent)`, checked: 0, total: 0 },
      ];
      return { findings: [], coverage };
    }

    const { entries, findings: manifestFindings } = parseManifest(snapshot);
    const findings: Finding[] = [...manifestFindings];
    let checked = 0;
    const notAdopted: string[] = [];

    for (const entry of entries) {
      const generate = GENERATORS[entry.generator];
      if (!generate) {
        // A declared entry this binary doesn't know how to regenerate — e.g. a forward-declared
        // M2.4 render output on a binary predating that generator. Named, never silently dropped;
        // never an ERROR (this binary genuinely cannot verify it, one way or the other).
        notAdopted.push(`${entry.path} (generator '${entry.generator}' not available)`);
        continue;
      }
      checked += 1;
      const have = snapshot.get(entry.path);
      if (have === undefined) {
        findings.push({
          severity: "ERROR",
          path: entry.path,
          line: 1,
          message: `${entry.path} is declared in ${MANIFEST_PATH} (generator '${entry.generator}') but is absent from the repo — regenerate it or remove the manifest entry`,
        });
        continue;
      }
      const want = generate(snapshot);
      if (have !== want) {
        const line = firstDiffLine(have, want);
        const haveLines = have.split("\n");
        const wantLines = want.split("\n");
        findings.push({
          severity: "ERROR",
          path: entry.path,
          line,
          message:
            `${entry.path} is STALE (regenerate via '${entry.generator}') — first difference at line ${line}: ` +
            `have "${snippet(haveLines[line - 1])}", want "${snippet(wantLines[line - 1])}"`,
        });
      }
    }

    const total = entries.length;
    const unit =
      notAdopted.length === 0
        ? "generated artifacts"
        : `generated artifacts (${notAdopted.length} not adopted: ${notAdopted.join(", ")})`;

    return {
      findings,
      coverage: [{ gate: "freshness", unit, checked, total }],
    };
  },
};
