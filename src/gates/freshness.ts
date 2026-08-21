// PURITY: pure — no fs/network/clock (L3). Gate 7 — freshness (M2.6, repaired M2 boundary
// review blockers #3/#4). Ground truth: docs/gate-contracts.md "Gate 7 — freshness".
// Regenerate-and-diff over a DECLARED manifest of generated artifacts (`.rk/generated.json`) —
// the general mechanism IMPLEMENTATION_PLAN M2.6 names ("regenerate-and-diff replaces
// mirror-check gates"). Two recognized-generator SHAPES now exist:
//   - PURE generators (`GENERATORS` below) — a `(snapshot) => string` this gate calls itself.
//     `linker-index`/`linker-dag` are the only two.
//   - EDGE-SUPPLIED generators — `render-site-v1` (M2.4 `rk render`'s HTML output) is the first.
//     Rendering the site needs a real GraphDocument (af/fr subprocess calls, fs) this file must
//     never perform itself (L3) — the edge (src/cli/check.ts) regenerates it and hands this gate
//     the resulting bytes (or a structured failure) via `runFreshnessGate`'s third parameter,
//     `externalRegen`. This gate never regenerates render-site-v1 itself; it only diffs SUPPLIED
//     bytes. `freshnessGate.run` (the plain 2-arg `Gate` interface every OTHER caller — the
//     corpus harness, `src/gates/index.ts`'s registry — uses) always passes an EMPTY
//     `externalRegen` map, so a render-site-v1 entry run through that plain interface always
//     reports "cannot be regenerated for verification" — never a silent pass (M2 boundary review
//     blocker #3: "the entry gets a loud ERROR ..., NEVER a silent pass or skip").
//
// Manifest shape (schemas/generated.v1.json): `{"schema_version":"1","entries":[{"path":...,
// "generator":...}]}`, `additionalProperties:false` at BOTH the top level and per-entry.
// Untrusted, hand-editable JSON — same edge-trust posture as `.rk/config.json`
// (src/gates/config.ts's rk-xbm precedent): a malformed manifest is never a crash and never a
// silent no-op. It produces one loud ERROR per malformation (wrong/missing `schema_version`, an
// unrecognized top-level or per-entry key, a malshaped entry — blocker #4) and the affected
// entry is dropped from the checked set (never silently treated as "absent" — a malformed
// manifest is a real, visible defect, distinct from "never adopted").
//
// Unrecognized generator (blocker #3a, M2 boundary review): a declared entry whose `generator`
// id this binary does not recognize AT ALL (neither a pure `GENERATORS` entry nor
// `render-site-v1`) is now a BLOCKING manifest ERROR, never the old silent "not adopted" green
// state — a typo'd or unregistered generator id must never green-light an unchecked artifact at
// `checked 0/1`.
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
import { GENERATORS, isStructuralGenerator } from "./freshness-generators";
import { checkCardBijection } from "./freshness-cards";
import { missingFinding, staleFinding, unattributableFinding } from "./freshness-findings";
import {
  MANIFEST_PATH,
  RENDER_SITE_GENERATOR,
  parseManifest,
  type ExternalRegenResult,
  type ManifestEntry,
} from "./freshness-manifest";

// Public surface (unchanged by the rk-tmzl split): importers keep reading these from here.
export {
  MANIFEST_PATH,
  MANIFEST_SCHEMA_VERSION,
  RENDER_SITE_GENERATOR,
  type ManifestEntry,
  type ExternalRegenResult,
  type PureRegenResult,
} from "./freshness-manifest";

/** Paths Gate 2 Check 11 must stop checking itself, because this gate has fully taken them over —
 * declared in the manifest AND carrying a `generator` id this gate recognizes. A path declared
 * with an unrecognized generator is deliberately NOT superseded, so Check 11 keeps covering it: an
 * empty, stale, or not-yet-updated manifest never opens a silent gap for `argument/INDEX.md`/
 * `DAG.md` (see this file's header comment and docs/gate-contracts.md's Gate 7 boundary note).
 * Malformed manifest content contributes no superseded paths (same reasoning: if this gate cannot
 * even parse the declaration, it cannot be said to have taken the path over). Deliberately scoped
 * to `GENERATORS` (the pure map) only — `render-site-v1` never supersedes anything here; Check 11
 * only ever covered `argument/INDEX.md`/`DAG.md`, never any HTML site output. */
export function freshnessSupersededPaths(snapshot: RepoSnapshot): ReadonlySet<string> {
  const { entries } = parseManifest(snapshot);
  return new Set(entries.filter((e) => e.generator in GENERATORS).map((e) => e.path));
}

/** Repo-relative paths declared in `.rk/generated.json` under exactly `generator`, from
 * well-formed entries only (a malformed manifest/entry contributes no paths here — same
 * conservative posture as `freshnessSupersededPaths`). Lets the edge (`src/cli/check.ts`)
 * discover which artifacts need edge-prepared "expected bytes" — see `ExternalRegenResult` —
 * BEFORE invoking this pure gate, without duplicating manifest-parsing logic at the edge. */
export function declaredGeneratorPaths(snapshot: RepoSnapshot, generator: string): string[] {
  const { entries } = parseManifest(snapshot);
  return entries.filter((e) => e.generator === generator).map((e) => e.path);
}

export function runFreshnessGate(
  snapshot: RepoSnapshot,
  _config: GateConfig,
  externalRegen: ReadonlyMap<string, ExternalRegenResult> = new Map(),
): GateResult {
  // BL4: the bijection runs BEFORE the manifest-absence early return. "No manifest" is a legitimate
  // non-adoption of the freshness mechanism in general, but it is NOT a licence to hold reviewed
  // extraction records whose cards nothing checks.
  const bijection = checkCardBijection(snapshot, []);

  if (!snapshot.has(MANIFEST_PATH)) {
    // Presence-conditional, whole-mechanism (generalizing the per-file precedent set by Gate 2
    // Check 11 / Gate 6's report/ guard — linker-25, shards-15): a repo that has never adopted
    // the freshness manifest has nothing declared to check. Never a finding; the non-adoption
    // is named on the coverage line, never a silent skip (CLAUDE.md L2).
    const coverage: CoverageLine[] = [
      {
        gate: "freshness",
        unit:
          `generated artifacts (manifest not adopted: ${MANIFEST_PATH} absent)` +
          (bijection.length > 0 ? `, ${bijection.length} card(s) unadopted/undeclared` : ""),
        checked: 0,
        total: 0,
      },
    ];
    return { findings: bijection, coverage };
  }

  const { entries, findings: manifestFindings } = parseManifest(snapshot);
  const findings: Finding[] = [...manifestFindings, ...checkCardBijection(snapshot, entries)];
  let checked = 0;
  const unrecognized: string[] = [];

  for (const entry of entries) {
    const pureGenerate = GENERATORS[entry.generator];
    if (pureGenerate) {
      checked += 1;
      const have = snapshot.get(entry.path);
      if (have === undefined) {
        findings.push(missingFinding(entry.path, entry.generator));
        continue;
      }
      const want = pureGenerate(snapshot, entry.path);
      if (!want.ok) {
        // rk-nsex: recognized, but this run cannot say what the artifact SHOULD contain (the
        // record behind a card is gone or malformed). Counted in `checked` — the binary did
        // recognize the generator and attempt verification — and reported, never passed.
        findings.push({
          severity: "ERROR",
          path: entry.path,
          line: 1,
          message: `${entry.path} cannot be regenerated for verification (generator '${entry.generator}'): ${want.reason}`,
          ...(isStructuralGenerator(entry.generator) ? { structural: true as const } : {}),
        });
        continue;
      }
      if (have !== want.bytes) findings.push(staleFinding(entry.path, entry.generator, have, want.bytes));
      continue;
    }

    if (entry.generator === RENDER_SITE_GENERATOR) {
      // Blocker #3 (M2 boundary review): recognized, but this pure gate never regenerates it
      // itself — the edge (src/cli/check.ts) must have supplied the expected bytes (or a
      // structured failure) via `externalRegen`. Counted in `checked` either way: this binary DID
      // recognize the generator and attempt verification, whether that verification succeeded,
      // found staleness, or could not be performed at all.
      checked += 1;
      const regen = externalRegen.get(entry.path);
      if (!regen) {
        findings.push({
          severity: "ERROR",
          path: entry.path,
          line: 1,
          message:
            `${entry.path} cannot be regenerated for verification (generator '${RENDER_SITE_GENERATOR}'): ` +
            `no edge-prepared expected bytes were supplied for this entry — this pure gate never regenerates ` +
            `'${RENDER_SITE_GENERATOR}' itself (src/cli/check.ts prepares it at the edge before invoking the ` +
            `gate); a manifest declaring this path must never silently pass unverified`,
        });
        continue;
      }
      if (!regen.ok) {
        findings.push({
          severity: "ERROR",
          path: entry.path,
          line: 1,
          message: `${entry.path} cannot be regenerated for verification (generator '${RENDER_SITE_GENERATOR}'): ${regen.reason}`,
        });
        continue;
      }
      const have = snapshot.get(entry.path);
      if (have === undefined) {
        findings.push(missingFinding(entry.path, entry.generator));
        continue;
      }
      if (have !== regen.bytes) {
        // rk-xbsx: a difference is only DRIFT when the regeneration it was measured against was
        // authoritative. Otherwise it is named as unattributable — still an ERROR, never a STALE.
        findings.push(
          regen.degraded === undefined
            ? staleFinding(entry.path, entry.generator, have, regen.bytes)
            : unattributableFinding(entry.path, entry.generator, have, regen.bytes, regen.degraded),
        );
      }
      continue;
    }

    // Blocker #3a (M2 boundary review): a truly unrecognized generator id used to report the
    // benign "not adopted" state with NO finding and exit green at `checked 0/1` — a typo'd or
    // unregistered generator therefore green-lit an entirely unchecked artifact. Now a BLOCKING
    // manifest ERROR, excluded from `checked` (never attempted) but still counted in `total`.
    unrecognized.push(`${entry.path} (generator '${entry.generator}')`);
    findings.push({
      severity: "ERROR",
      path: entry.path,
      line: 1,
      message:
        `${entry.path} is declared in ${MANIFEST_PATH} with an unrecognized generator '${entry.generator}' — ` +
        `this binary cannot verify it, and a manifest declaring an unverifiable artifact must never exit green ` +
        `(register '${entry.generator}' in src/gates/freshness.ts's GENERATORS, or fix the manifest entry)`,
    });
  }

  const total = entries.length;
  const unit =
    unrecognized.length === 0
      ? "generated artifacts"
      : `generated artifacts (${unrecognized.length} unrecognized generator: ${unrecognized.join(", ")})`;

  return {
    findings,
    coverage: [{ gate: "freshness", unit, checked, total }],
  };
}

export const freshnessGate: Gate = {
  name: "freshness",
  run(snapshot: RepoSnapshot, config: GateConfig): GateResult {
    return runFreshnessGate(snapshot, config);
  },
};
