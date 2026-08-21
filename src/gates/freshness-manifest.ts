// PURITY: pure — no fs/network/clock (L3). Gate 7 — freshness: the DECLARED manifest of
// generated artifacts (`.rk/generated.json`, schemas/generated.v1.json): constants, entry/result
// types, and the fail-loud manifest parser. Split out of freshness.ts (rk-tmzl, move-only); the
// contract and rationale are in freshness.ts's header and docs/gate-contracts.md "Gate 7".

import type { Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";

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
/** A pure generator's answer for ONE declared path. `ok: false` is the fail-closed case (rk-nsex):
 * a generator that recognizes the path but cannot produce its bytes — a `cards-v1` entry whose
 * extraction record is absent or malformed — reports a named ERROR, exactly like an edge-supplied
 * generator that could not run. It is never bytes, and never a silent pass. */
export type PureRegenResult = { ok: true; bytes: string } | { ok: false; reason: string };

export interface ParsedManifest {
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
export function parseManifest(snapshot: RepoSnapshot): ParsedManifest {
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
