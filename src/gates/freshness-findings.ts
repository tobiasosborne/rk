// PURITY: pure — no fs/network/clock (L3). Gate 7 — freshness: the per-entry finding
// constructors (missing / stale / unattributable) and the first-diff-line locator. Split out of
// freshness.ts (rk-tmzl, move-only); message text is byte-identical to what freshness.ts emitted.

import type { Finding } from "./framework";
import { isStructuralGenerator } from "./freshness-generators";
import { MANIFEST_PATH } from "./freshness-manifest";

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

export function missingFinding(path: string, generatorId: string): Finding {
  return {
    severity: "ERROR",
    path,
    line: 1,
    message: `${path} is declared in ${MANIFEST_PATH} (generator '${generatorId}') but is absent from the repo — regenerate it or remove the manifest entry`,
    ...(isStructuralGenerator(generatorId) ? { structural: true as const } : {}),
  };
}

export function staleFinding(path: string, generatorId: string, have: string, want: string): Finding {
  const line = firstDiffLine(have, want);
  const haveLines = have.split("\n");
  const wantLines = want.split("\n");
  return {
    severity: "ERROR",
    path,
    line,
    message:
      `${path} is STALE (regenerate via '${generatorId}') — first difference at line ${line}: ` +
      `have "${snippet(haveLines[line - 1])}", want "${snippet(wantLines[line - 1])}"`,
    ...(isStructuralGenerator(generatorId) ? { structural: true as const } : {}),
  };
}

/** rk-xbsx: the artifact differs from the regeneration, but the regeneration was not authoritative
 * — so the difference is unattributable, and this gate refuses to call it drift. ERROR (never
 * fresh, never silently passed), deliberately NOT the word STALE and deliberately not sharing
 * `staleFinding`'s "regenerate via" remedy, which would be wrong advice here: re-rendering under
 * the same degraded reader re-pins the artifact to the degraded output. Same discipline
 * src/drive/cross-vendor.ts applies to `identity-unparseable` vs `same-family` — an unknown is
 * never reported as a confirmed violation, and never as a pass. */
export function unattributableFinding(path: string, generatorId: string, have: string, want: string, degraded: string): Finding {
  const line = firstDiffLine(have, want);
  const haveLines = have.split("\n");
  const wantLines = want.split("\n");
  return {
    severity: "ERROR",
    path,
    line,
    message:
      `${path} DIFFERS from a fresh '${generatorId}' regeneration, but that regeneration's live-external ` +
      `inputs were NOT authoritative (${degraded}) — the difference is NOT attributable to artifact ` +
      `drift, since the degraded read is an equally consistent explanation. First difference at line ` +
      `${line}: have "${snippet(haveLines[line - 1])}", want "${snippet(wantLines[line - 1])}". ` +
      `next: restore the degraded source and re-run 'rk check' — a real drift is then reported as ` +
      `STALE; re-rendering NOW would only re-pin the artifact to the degraded output`,
  };
}
