// ROLE: convention-profile public facade and reference resolver. Parsing, section validation, and
// history walking live in focused sibling shards.
// PURITY: pure — profile bytes arrive via RepoSnapshot (L3).

import { listFilesRecursive, type RepoSnapshot } from "./snapshot";
import { checkProfileHistory } from "./profile-history";
import { parseConventionProfile } from "./profile-parse";
import {
  CONVENTIONS_DIR,
  profileError,
  profileFilePath,
  type ProfileValidation,
} from "./profile-types";

export * from "./profile-types";
export { parseConventionProfile } from "./profile-parse";

const REF_RE = /^([a-z0-9][a-z0-9-]*)\.v([1-9]\d*)$/;

/** Resolves, validates, and history-checks `.rk/config.json`'s optional profile reference. */
export function validateConventionProfile(snapshot: RepoSnapshot, ref: string | undefined): ProfileValidation {
  if (ref === undefined) return { findings: [], checked: 0, total: 0 };

  const match = REF_RE.exec(ref);
  if (!match) {
    return {
      findings: [
        profileError(
          ".rk/config.json",
          `conventionProfile ${JSON.stringify(ref)} is not a valid profile reference — it must be ` +
            `<name>.v<n> (lowercase name, positive integer n, no path separators, no ".json" suffix), ` +
            `naming ${CONVENTIONS_DIR}/<name>.v<n>.json`,
        ),
      ],
      checked: 0,
      total: 1,
    };
  }
  const name = match[1]!;
  const filenameVersion = Number(match[2]!);
  const path = profileFilePath(ref);
  const text = snapshot.get(path);
  if (text === undefined) {
    const present = listFilesRecursive(snapshot, CONVENTIONS_DIR, ".json");
    return {
      findings: [
        profileError(
          ".rk/config.json",
          `conventionProfile "${ref}" names ${path}, which is not present` +
            `${present.length > 0 ? ` (present: ${present.join(", ")})` : ` (${CONVENTIONS_DIR}/ holds no profile at all)`}` +
            ` — an unknown profile is never treated as "no profile configured"`,
        ),
      ],
      checked: 0,
      total: 1,
    };
  }

  const parsed = parseConventionProfile(text, name);
  if (!parsed.profile) {
    return {
      findings: parsed.errors.map((error) => profileError(path, `malformed ${path}: ${error}`)),
      checked: 0,
      total: 1,
    };
  }
  const findings = checkProfileHistory(snapshot, name, filenameVersion, parsed.profile, path);
  const blocked = findings.some((finding) => finding.severity === "ERROR");
  return {
    findings,
    checked: blocked ? 0 : 1,
    total: 1,
    ...(blocked ? {} : { profile: parsed.profile }),
  };
}
