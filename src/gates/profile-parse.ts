// ROLE: total parser for one convention-profile JSON document.
// PURITY: pure — no fs/network/clock (L3).

import { readLattices } from "./profile-lattices";
import { readChoices, readEnums, readTrackedClasses } from "./profile-sections";
import { PROFILE_SCHEMA_VERSION, type ConventionProfile, type ProfileParseResult } from "./profile-types";

const TOP_LEVEL_KEYS = new Set([
  "schema_version", "name", "version", "predecessor_sha256", "notation",
  "tracked_classes", "lattices", "choices", "enums",
]);

export function parseConventionProfile(text: string, expectedName: string): ProfileParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { errors: [`not valid JSON (${error instanceof Error ? error.message : String(error)})`] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { errors: ['expected a JSON object (schemas/convention-profile.v1.json)'] };
  }
  const object = parsed as Record<string, unknown>;
  const errors: string[] = [];
  const extra = Object.keys(object).filter((field) => !TOP_LEVEL_KEYS.has(field));
  if (extra.length > 0) {
    errors.push(`unrecognized top-level properties ${extra.map((field) => `"${field}"`).join(", ")} — additionalProperties:false`);
  }
  if (object.schema_version !== PROFILE_SCHEMA_VERSION) {
    errors.push(`"schema_version" is ${JSON.stringify(object.schema_version)}, expected exactly "${PROFILE_SCHEMA_VERSION}"`);
  }
  if (typeof object.name !== "string" || object.name !== expectedName) {
    errors.push(`"name" is ${JSON.stringify(object.name)} but the file is ${expectedName}.v<n>.json`);
  }
  if (typeof object.version !== "number" || !Number.isInteger(object.version) || object.version < 1) {
    errors.push(`"version" is ${JSON.stringify(object.version)}, expected a positive integer`);
  }
  if (object.predecessor_sha256 !== undefined &&
      (typeof object.predecessor_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(object.predecessor_sha256))) {
    errors.push(`"predecessor_sha256" is ${JSON.stringify(object.predecessor_sha256)}, expected 64 lowercase hex characters`);
  }
  if (object.notation !== undefined && object.notation !== "draft" && object.notation !== "complete") {
    errors.push(`"notation" is ${JSON.stringify(object.notation)}, expected "draft" or "complete"`);
  }

  const trackedClasses = readTrackedClasses(object.tracked_classes, errors);
  const lattices = readLattices(object.lattices, errors);
  const choices = readChoices(object.choices, errors);
  const enums = readEnums(object.enums, errors);
  if (errors.length > 0) return { errors };

  const profile: ConventionProfile = {
    schema_version: PROFILE_SCHEMA_VERSION,
    name: object.name as string,
    version: object.version as number,
    ...(typeof object.predecessor_sha256 === "string" ? { predecessor_sha256: object.predecessor_sha256 } : {}),
    notation: object.notation === "complete" ? "complete" : "draft",
    tracked_classes: trackedClasses,
    lattices,
    choices,
    enums,
  };
  return { profile, errors: [] };
}
