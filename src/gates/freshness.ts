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
import { parseRegistry } from "./linker-parse";
import { renderDag, renderIndex } from "./linker-render";
import { MACROS_GENERATOR, renderMacros } from "../render/macros-tex";

export const MANIFEST_PATH = ".rk/generated.json";
export const MANIFEST_SCHEMA_VERSION = "1";

/** The recognized-but-edge-supplied generator id for M2.4 `rk render`'s HTML output (`rk
 * render` upserts a manifest entry `{"path": "<out>/index.html", "generator":
 * "render-site-v1"}`). See this file's header for why this is NOT a `GENERATORS` entry. */
export const RENDER_SITE_GENERATOR = "render-site-v1";

export interface ManifestEntry {
  path: string;
  generator: string;
}

/** The edge's answer to "what would a fresh `render-site-v1` regenerate produce for this path,
 * right now" (src/cli/check-regen.ts's `prepareRenderSiteExternalRegen`) — supplied to
 * `runFreshnessGate`'s `externalRegen` map. `ok:false` covers every reason the edge could not
 * produce trustworthy expected bytes (structurally incomplete build, a regeneration that is not
 * reproducible within the run, a thrown exception) — this gate turns EITHER outcome into a loud,
 * per-path finding, never a silent pass.
 *
 * `degraded` (rk-xbsx, 2026-07-25) is the third state. It is set when the edge DID produce bytes,
 * reproducibly, but at least one live-external reader the render depends on could only reach a
 * REDUCED-FIDELITY fallback (`af: ledger-fallback`, `fr: log-fallback` — the states
 * src/render/diagnostics-view.ts already names). The expected bytes are then a function of the
 * verifier's environment as much as of the repo, so a byte difference is NOT evidence of artifact
 * drift and must not be reported as STALE. It is not evidence of freshness either: this gate
 * ERRORs on it, under its own distinct message. Matching bytes stay clean — a degraded read that
 * AGREES with the artifact has revealed no defect to attribute. */
export type ExternalRegenResult =
  | { readonly ok: true; readonly bytes: string; readonly degraded?: string }
  | { readonly ok: false; readonly reason: string };

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
  // rk-5lzf (LB5): `definitions/notation/macros.tex`, one \newcommand per notation-register
  // shard. A PURE generator like the two above — src/render/macros-tex.ts reads the snapshot and
  // nothing else — so this gate regenerates and byte-diffs it itself, with no `externalRegen`
  // detour. That is what makes a hand-edited macro file a blocking ERROR instead of a silent
  // divergence between the register and the campaign's LaTeX.
  [MACROS_GENERATOR]: (snapshot) => renderMacros(snapshot),
};

interface ParsedManifest {
  entries: ManifestEntry[];
  findings: Finding[];
}

/** schemas/generated.v1.json's exact top-level / per-entry key sets (`additionalProperties:
 * false` at both levels) — blocker #4 (M2 boundary review): the runtime parser previously
 * under-enforced the schema (no `schema_version` check, no extra-key rejection at either level). */
const TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(["schema_version", "entries"]);
const ENTRY_KEYS: ReadonlySet<string> = new Set(["path", "generator"]);

type EntryShapeResult = { ok: true; entry: ManifestEntry } | { ok: false; message: string };

function checkEntryShape(e: unknown, index: number): EntryShapeResult {
  const shapeMessage = `malformed ${MANIFEST_PATH}: entries[${index}] must be {"path": non-empty string, "generator": non-empty string}`;
  if (typeof e !== "object" || e === null || Array.isArray(e)) {
    return { ok: false, message: shapeMessage };
  }
  const rec = e as Record<string, unknown>;
  const extraKeys = Object.keys(rec).filter((k) => !ENTRY_KEYS.has(k));
  if (extraKeys.length > 0) {
    return {
      ok: false,
      message:
        `malformed ${MANIFEST_PATH}: entries[${index}] has unrecognized propert${extraKeys.length === 1 ? "y" : "ies"} ` +
        `${extraKeys.map((k) => `"${k}"`).join(", ")} — schemas/generated.v1.json's entry shape is exactly ` +
        `{path, generator}, additionalProperties:false`,
    };
  }
  if (
    typeof rec.path !== "string" ||
    rec.path.length === 0 ||
    typeof rec.generator !== "string" ||
    rec.generator.length === 0
  ) {
    return { ok: false, message: shapeMessage };
  }
  return { ok: true, entry: { path: rec.path, generator: rec.generator } };
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

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      entries: [],
      findings: [
        {
          severity: "ERROR",
          path: MANIFEST_PATH,
          line: 1,
          message: `malformed ${MANIFEST_PATH}: expected a JSON object with "schema_version" and "entries"`,
        },
      ],
    };
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.entries)) {
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

  const findings: Finding[] = [];

  // Blocker #4 (M2 boundary review): the runtime parser used to accept a manifest missing
  // `schema_version` entirely, a wrong version (e.g. `"2"`), or extra top-level/per-entry keys —
  // under-enforcing schemas/generated.v1.json's `const "1"` + `additionalProperties:false` at
  // both levels. A future incompatible manifest shape must never silently run under v1 semantics.
  if (!("schema_version" in obj)) {
    findings.push({
      severity: "ERROR",
      path: MANIFEST_PATH,
      line: 1,
      message: `malformed ${MANIFEST_PATH}: missing required "schema_version" (schemas/generated.v1.json requires the exact const "${MANIFEST_SCHEMA_VERSION}")`,
    });
  } else if (obj.schema_version !== MANIFEST_SCHEMA_VERSION) {
    findings.push({
      severity: "ERROR",
      path: MANIFEST_PATH,
      line: 1,
      message: `malformed ${MANIFEST_PATH}: "schema_version" is ${JSON.stringify(obj.schema_version)}, expected exactly "${MANIFEST_SCHEMA_VERSION}" (schemas/generated.v1.json) — an incompatible manifest must never silently run under v1 semantics`,
    });
  }

  const extraTop = Object.keys(obj).filter((k) => !TOP_LEVEL_KEYS.has(k));
  if (extraTop.length > 0) {
    findings.push({
      severity: "ERROR",
      path: MANIFEST_PATH,
      line: 1,
      message:
        `malformed ${MANIFEST_PATH}: unrecognized top-level propert${extraTop.length === 1 ? "y" : "ies"} ` +
        `${extraTop.map((k) => `"${k}"`).join(", ")} — schemas/generated.v1.json requires additionalProperties:false`,
    });
  }

  const rawEntries = obj.entries as unknown[];
  const entries: ManifestEntry[] = [];
  rawEntries.forEach((e, i) => {
    const result = checkEntryShape(e, i);
    if (!result.ok) {
      findings.push({ severity: "ERROR", path: MANIFEST_PATH, line: 1, message: result.message });
      return;
    }
    entries.push(result.entry);
  });

  return { entries, findings };
}

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

function missingFinding(path: string, generatorId: string): Finding {
  return {
    severity: "ERROR",
    path,
    line: 1,
    message: `${path} is declared in ${MANIFEST_PATH} (generator '${generatorId}') but is absent from the repo — regenerate it or remove the manifest entry`,
  };
}

function staleFinding(path: string, generatorId: string, have: string, want: string): Finding {
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
  };
}

/** rk-xbsx: the artifact differs from the regeneration, but the regeneration was not authoritative
 * — so the difference is unattributable, and this gate refuses to call it drift. ERROR (never
 * fresh, never silently passed), deliberately NOT the word STALE and deliberately not sharing
 * `staleFinding`'s "regenerate via" remedy, which would be wrong advice here: re-rendering under
 * the same degraded reader re-pins the artifact to the degraded output. Same discipline
 * src/drive/cross-vendor.ts applies to `identity-unparseable` vs `same-family` — an unknown is
 * never reported as a confirmed violation, and never as a pass. */
function unattributableFinding(path: string, generatorId: string, have: string, want: string, degraded: string): Finding {
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

/** The pure core of Gate 7 (M2 boundary review blockers #3/#4). `externalRegen` carries the
 * edge-prepared "expected bytes" (or a structured failure reason) for every `render-site-v1`
 * entry the manifest declares — see this file's header and `ExternalRegenResult`'s own doc
 * comment. Defaults to an empty map so `freshnessGate.run` (the plain 2-arg `Gate` interface) can
 * still be called directly (the corpus harness, `src/gates/index.ts`'s registry) — under that
 * default, ANY declared `render-site-v1` entry reports "cannot be regenerated for verification",
 * never a silent pass, because this pure function never regenerates it itself. */
export function runFreshnessGate(
  snapshot: RepoSnapshot,
  _config: GateConfig,
  externalRegen: ReadonlyMap<string, ExternalRegenResult> = new Map(),
): GateResult {
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
      const want = pureGenerate(snapshot);
      if (have !== want) findings.push(staleFinding(entry.path, entry.generator, have, want));
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
