// PURITY: pure — no fs/network/clock (L3). M1.4 (`rk upgrade` v0 stub): semver comparison for
// template_version strings (templates/manifest.json's `template_version`, a plain "x.y.z" per
// test/templates/templates.test.ts's `/^\d+\.\d+\.\d+$/` assertion — no pre-release/build
// metadata to parse, so a minimal numeric-triple comparator is the whole contract).

export interface Semver {
  major: number;
  minor: number;
  patch: number;
}

/** Parses a strict "x.y.z" (non-negative integers only) — returns null, never throws, on
 * anything else (a hand-rolled or pre-1.0 repo's `.rk/template-version` might carry garbage; the
 * caller decides what a null parse means, this stays a pure total function). */
export function parseSemver(raw: string): Semver | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** -1 if a<b, 0 if equal, 1 if a>b — standard three-way semver comparison, major then minor then
 * patch. Mutation-proof target (c) of this WP: inverting any comparison here must make
 * `test/scaffold/version.test.ts` go red, since `rk upgrade`'s only verdict-relevant question is
 * "are these the same version," which a sign inversion cannot silently pass. */
export function compareSemver(a: Semver, b: Semver): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

/** True iff two raw version strings denote the same semver triple. Unparseable input on either
 * side is never "equal" (a garbled version string must never be silently treated as matching). */
export function semverEqual(a: string, b: string): boolean {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return false;
  return compareSemver(pa, pb) === 0;
}
