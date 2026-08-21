// ROLE: immutable convention-profile predecessor chain and class-shrink compatibility.
// PURITY: pure — no fs/network/clock (L3).

import type { Finding } from "./framework";
import { fileSha256, type RepoSnapshot } from "./snapshot";
import { parseConventionProfile } from "./profile-parse";
import { profileError, profileFilePath, type ConventionProfile } from "./profile-types";

export function checkProfileHistory(
  snapshot: RepoSnapshot,
  name: string,
  filenameVersion: number,
  current: ConventionProfile,
  path: string,
): Finding[] {
  if (filenameVersion === 1) {
    return current.predecessor_sha256 === undefined
      ? []
      : [profileError(path, "predecessor-unexpected: a .v1 profile is the history root and must not declare predecessor_sha256")];
  }
  const predecessorPath = profileFilePath(`${name}.v${filenameVersion - 1}`);
  if (current.predecessor_sha256 === undefined) {
    return [profileError(path, `predecessor-hash-missing: ${path} must declare predecessor_sha256 for required ${predecessorPath}`)];
  }
  const predecessorText = snapshot.get(predecessorPath);
  if (predecessorText === undefined) {
    return [profileError(path, `predecessor-missing: required ${predecessorPath} is absent — every successor must retain its immediate same-family predecessor`)];
  }
  const actualSha = fileSha256(snapshot, predecessorPath);
  if (actualSha !== current.predecessor_sha256) {
    return [
      profileError(
        path,
        `predecessor-hash-mismatch: ${path} pins ${current.predecessor_sha256} for ${predecessorPath}, ` +
          `but the present predecessor hashes ${actualSha ?? "unavailable"}`,
      ),
    ];
  }
  const predecessor = parseConventionProfile(predecessorText, name);
  if (!predecessor.profile) {
    return [profileError(path, `predecessor-unusable: ${predecessorPath} matches its pinned hash but cannot be parsed (${predecessor.errors[0]})`)];
  }

  const currentClasses = new Set(current.tracked_classes.map((trackedClass) => trackedClass.class));
  const removed = predecessor.profile.tracked_classes
    .map((trackedClass) => trackedClass.class)
    .filter((className) => !currentClasses.has(className));
  const findings: Finding[] = [];
  if (removed.length > 0 && current.version <= predecessor.profile.version) {
    findings.push(
      profileError(
        path,
        `class-removed-without-bump: tracked class${removed.length === 1 ? "" : "es"} ` +
          `${removed.map((className) => `"${className}"`).join(", ")} present in ${predecessorPath} ` +
          `${removed.length === 1 ? "is" : "are"} absent here, but "version" is ${current.version} ` +
          `and ${predecessorPath}'s is ${predecessor.profile.version}. Shrinking Gate 9 coverage is ` +
          `a compat event: bump "version" deliberately, or restore the class`,
      ),
    );
  }
  findings.push(...checkProfileHistory(snapshot, name, filenameVersion - 1, predecessor.profile, predecessorPath));
  return findings;
}
