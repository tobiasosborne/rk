// PURITY: pure — no fs/network/clock (L3). Version-compat decision logic (D6,
// IMPLEMENTATION_PLAN.md §0, "the D6 mechanism"): compares the af/fr/bd binaries actually probed
// on this machine against rk.compat.json's pinned `{min, tested[]}` per binary, and renders a
// verdict. Every raw version string arrives as INPUT — the caller (src/cli/doctor.ts) is the
// edge that spawns `af version`/`--version`, `fr version`, `bd version` and captures stdout; this
// module never touches a subprocess itself.
//
// Verdict classes (fixed set, per this WP's brief):
//   ok                  — parsed version >= min, and its major matches a tested[] entry's major.
//   untested-major      — parsed version >= min, but no tested[] entry shares its major (a real
//                          version was probed, just not one rk has verified compat with yet).
//   below-min           — parsed version < min.
//   missing             — the binary is not on PATH at all.
//   no-version-support  — the binary is on PATH, but no invocation produced a parseable version
//                          (the stale-fr-predates-F0 case this WP documents on the live machine).

export type BinaryName = "af" | "fr" | "bd";

export interface CompatEntry {
  min: string;
  tested: string[];
}

export interface CompatManifest {
  af: CompatEntry;
  fr: CompatEntry;
  bd: CompatEntry;
}

export type Verdict = "ok" | "untested-major" | "below-min" | "missing" | "no-version-support";

export interface BinaryVerdict {
  binary: BinaryName;
  verdict: Verdict;
  /** Parsed "X.Y.Z", or null when no invocation yielded one (missing/no-version-support). */
  version: string | null;
  min: string;
  tested: string[];
  /** First line of the raw probe output when a command *responded* but its text wasn't a
   * parseable version (e.g. an unstamped build's placeholder "af version dev") — null when no
   * probed command variant produced any output at all (missing binary, or a command variant that
   * genuinely isn't recognized/predates support). Only ever non-null for "no-version-support";
   * describeVerdict uses it to tell "understood the command, wasn't built with real version info"
   * apart from "doesn't understand the command at all" — collapsing those two into one message
   * is the confusing-message defect found 2026-07-25 (this WP's brief). */
  rawSample: string | null;
}

export interface DoctorReport {
  binaries: BinaryVerdict[];
  /** true iff every binary verdict is "ok". */
  ok: boolean;
}

interface Semver {
  major: number;
  minor: number;
  patch: number;
}

const SEMVER_RE = /(\d+)\.(\d+)\.(\d+)/;

/** Extracts the first "X.Y.Z" run of digits from a raw version-command's FIRST LINE ONLY. All
 * three binaries' current formats put their version token on line one on success (af:
 * "af version 0.1.3"; fr per F0: "fr 0.2.0"; bd: "bd version 1.0.0 (<hash>...)"), and none on
 * failure/unstamped output (af's ldflags-unset "af version dev"; fr's stale-binary "unknown
 * command 'version'"). Restricting to the first line is load-bearing, not cosmetic: af's `version`
 * subcommand prints a trailing "  Go:      go1.25.5" line, and a naive whole-text scan would
 * mis-extract "1.25.5" as af's own version — a real trap found probing the actual installed
 * binary (see the doctor test suite's regression case). Same extraction rule for all three
 * binaries — kept as one function because the *shape* differs only in surrounding text, never in
 * what a semver triple looks like; per-binary probe-command ordering lives in the caller
 * (src/cli/doctor.ts), not here. */
export function parseVersion(raw: string): string | null {
  const firstLine = raw.split("\n")[0] ?? "";
  const m = SEMVER_RE.exec(firstLine);
  if (!m) return null;
  return `${m[1]}.${m[2]}.${m[3]}`;
}

function parseSemver(v: string): Semver | null {
  const m = SEMVER_RE.exec(v);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Numeric (never lexicographic) semver comparison: -1 if a<b, 0 if equal, 1 if a>b. Throws on
 * unparseable input — callers only ever pass already-`parseVersion`-validated strings or
 * manifest-pinned literals, both guaranteed parseable, so a throw here means rk.compat.json
 * itself is malformed, not bad probe data. Numeric comparison matters: "0.10.0" vs "0.9.0" is a
 * real trap for a string-based comparator ('1' < '9' lexicographically makes 0.10.0 sort BEFORE
 * 0.9.0, which is wrong) — see the mutation-proving test for this exact pair. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`compareSemver: unparseable version ('${a}' vs '${b}')`);
  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1;
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1;
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1;
  return 0;
}

/** True iff `a >= b` under `compareSemver`. */
export function gte(a: string, b: string): boolean {
  return compareSemver(a, b) >= 0;
}

function majorOf(v: string): number {
  const p = parseSemver(v);
  if (!p) throw new Error(`majorOf: unparseable version '${v}'`);
  return p.major;
}

/** One probed binary's raw evidence: whether it's on PATH at all, and the first raw stdout string
 * (if any) that yielded a parseable version across every command variant the edge tried (e.g. af
 * tries `version` then falls back to `--version`). `raw` is the caller's chosen winning attempt —
 * this module doesn't retry commands itself, it only classifies the outcome handed to it. */
export interface ProbeOutcome {
  found: boolean;
  raw: string | null;
}

/** The core decision: classifies one binary's probe outcome against its pinned compat entry.
 * Order matters and is deliberate: missing beats everything (no version to even look at);
 * unparseable beats below-min (we don't know a number, so we can't say it's low, only that
 * support is absent); below-min beats untested-major (a version that's too old is "below-min",
 * full stop — its major is irrelevant to that verdict). */
export function classifyBinary(binary: BinaryName, entry: CompatEntry, outcome: ProbeOutcome): BinaryVerdict {
  if (!outcome.found) {
    return { binary, verdict: "missing", version: null, min: entry.min, tested: entry.tested, rawSample: null };
  }
  const version = outcome.raw !== null ? parseVersion(outcome.raw) : null;
  if (version === null) {
    const rawSample = outcome.raw !== null ? (outcome.raw.split("\n")[0] ?? null) : null;
    return { binary, verdict: "no-version-support", version: null, min: entry.min, tested: entry.tested, rawSample };
  }
  if (!gte(version, entry.min)) {
    return { binary, verdict: "below-min", version, min: entry.min, tested: entry.tested, rawSample: null };
  }
  const testedMajors = new Set(entry.tested.map(majorOf));
  if (!testedMajors.has(majorOf(version))) {
    return { binary, verdict: "untested-major", version, min: entry.min, tested: entry.tested, rawSample: null };
  }
  return { binary, verdict: "ok", version, min: entry.min, tested: entry.tested, rawSample: null };
}

/** Classifies all three binaries and folds to one report. `outcomes` is keyed by binary name so
 * the caller (src/cli/doctor.ts) can hand over its three probes in one call. */
export function classifyAll(manifest: CompatManifest, outcomes: Record<BinaryName, ProbeOutcome>): DoctorReport {
  const binaries: BinaryVerdict[] = (["af", "fr", "bd"] as const).map((b) => classifyBinary(b, manifest[b], outcomes[b]));
  return { binaries, ok: binaries.every((v) => v.verdict === "ok") };
}

// Sources a stranger (no sibling checkouts on this machine) can actually act on — clone URLs,
// not relative paths (`../vibefeld`, `../knowledge-frontier`) that only resolve on the original
// developer's disk. Names verified against the real remotes, not assumed: af's repo is
// `vibefeld` (github.com/tobiasosborne/vibefeld); fr's is `frontier`
// (github.com/tobiasosborne/frontier) — NOT "knowledge-frontier", a name that appears nowhere in
// that repo's own remote and that a stranger following the old hint could not have found. See
// README.md's Install section for the same URLs plus version requirements.
const REBUILD_HINT: Record<BinaryName, string> = {
  af: "clone https://github.com/tobiasosborne/vibefeld and run ./scripts/build.sh install (stamps a real version), then reinstall",
  fr: "clone https://github.com/tobiasosborne/frontier and run 'bun install && bun run install:global' (stamps a real version), then reinstall",
  bd: "install via 'brew install beads', 'npm install -g @beads/bd', or see https://github.com/steveyegge/beads#installation",
};

/** Renders one binary's verdict as a self-teaching output line: what's wrong (if anything) and
 * what to run next. Pure formatting — src/cli/doctor.ts just prints these, one per binary. */
export function describeVerdict(v: BinaryVerdict): string {
  const label = v.version ? `${v.binary} ${v.version}` : v.binary;
  switch (v.verdict) {
    case "ok":
      return `${label}: ok (min ${v.min}).`;
    case "untested-major":
      return (
        `${label}: untested major (min ${v.min}, tested majors [${v.tested.join(", ")}]) — ` +
        `compat with this major is unverified. Pin it in rk.compat.json once confirmed, or pass ` +
        `--override to proceed with a loud warning.`
      );
    case "below-min":
      return `${label}: below minimum ${v.min} — ${REBUILD_HINT[v.binary]}.`;
    case "missing":
      return `${v.binary}: not found on PATH — install it (${REBUILD_HINT[v.binary]} if building from source) and ensure it's on PATH.`;
    case "no-version-support":
      if (v.rawSample !== null) {
        // The command DID respond — it just isn't a parseable version. The overwhelmingly likely
        // cause is an unstamped/local build reporting a placeholder ("af version dev", ldflags
        // unset); say that plainly instead of the misleading "doesn't understand the command".
        return (
          `${v.binary}: reported '${v.rawSample}', which isn't a parseable version — looks like ` +
          `an unstamped/local build (a placeholder string, not a real release); ${REBUILD_HINT[v.binary]}.`
        );
      }
      return (
        `${v.binary}: no version support — installed binary doesn't understand the version ` +
        `command at all (predates it, or is broken); ${REBUILD_HINT[v.binary]}.`
      );
  }
}
