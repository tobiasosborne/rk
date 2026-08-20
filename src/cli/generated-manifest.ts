// EDGE — fs. The ONE `.rk/generated.json` upsert used by every command that produces an adopted
// generated artifact (`rk render`, `rk render macros`). Extracted from src/cli/render.ts by rk-5lzf
// so a second producer cannot grow a second, quietly divergent manifest writer — the manifest is
// Gate 7's declared input, and two writers disagreeing about its shape is a validity-semantics
// defect, not a style one.
//
// Discipline, unchanged from render.ts's original: absent manifest -> a fresh empty one (the
// legitimate presence-conditional case, same stance src/gates/freshness.ts takes);
// present-but-unparseable or wrong-shaped -> a loud error and NO write (never silently clobber a
// manifest we cannot understand, CLAUDE.md L2); present-and-well-shaped -> every existing entry
// carried forward untouched, only the caller's own entry (matched by `path`) inserted or replaced.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MANIFEST_PATH, MANIFEST_SCHEMA_VERSION } from "../gates/freshness";

interface GeneratedManifest {
  schema_version: string;
  entries: { path: string; generator: string }[];
}

type ManifestLoad = { manifest: GeneratedManifest; manifestPath: string } | { error: string };

function loadManifestForUpsert(root: string, command: string): ManifestLoad {
  const manifestPath = join(root, MANIFEST_PATH);
  if (!existsSync(manifestPath)) {
    return { manifest: { schema_version: MANIFEST_SCHEMA_VERSION, entries: [] }, manifestPath };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      error: `${command}: ${MANIFEST_PATH} exists but is not valid JSON (${msg}) -- fix or remove it before '${command}' can adopt its output there.`,
    };
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    !Array.isArray((parsed as Record<string, unknown>).entries)
  ) {
    return {
      error:
        `${command}: ${MANIFEST_PATH} exists but is not the expected shape ` +
        `({"schema_version": ..., "entries": [...]}) -- fix or remove it before '${command}' can adopt its output there.`,
    };
  }
  const obj = parsed as { schema_version?: unknown; entries: unknown[] };
  const entries = obj.entries.filter(
    (e): e is { path: string; generator: string } =>
      typeof e === "object" && e !== null && typeof (e as Record<string, unknown>).path === "string" &&
      typeof (e as Record<string, unknown>).generator === "string",
  );
  return {
    manifest: {
      schema_version: typeof obj.schema_version === "string" ? obj.schema_version : MANIFEST_SCHEMA_VERSION,
      entries,
    },
    manifestPath,
  };
}

/** Upserts one `{path, generator}` entry into `.rk/generated.json`, creating the file if absent and
 * replacing an existing entry for the same `path` in place. `command` appears in any error message
 * so the caller is named. Returns an error string (and writes nothing) when the existing manifest
 * could not be understood; `undefined` on success. */
export function adoptGeneratedEntry(
  root: string,
  entryPath: string,
  generator: string,
  command: string,
): string | undefined {
  const loaded = loadManifestForUpsert(root, command);
  if ("error" in loaded) return loaded.error;
  const { manifest, manifestPath } = loaded;
  const newEntry = { path: entryPath, generator };
  const idx = manifest.entries.findIndex((e) => e.path === entryPath);
  if (idx >= 0) manifest.entries[idx] = newEntry;
  else manifest.entries.push(newEntry);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return undefined;
}
