// PURITY: pure — no fs/network/clock (L3). Shared closed vocabularies for the worker-contract
// surface (docs/worker-contract.md), used across src/drive/{identity,session,verdict-raw,
// verdict-schema,bind-verdicts,worker-result}.ts so no two modules can silently diverge on what
// counts as a valid tier/severity/family. Split out on its own (mirrors src/graph/validate-issue.ts's
// role: a shared leaf the sibling modules import without a circular dependency on each other).
//
// M3.1 repair wave (Tier A review, landing-blockers 5): `modelFamily` is a DRIVER-REGISTRY value,
// never worker output — see src/drive/identity.ts. `codex` and `other` are removed from the
// family enum here: `codex` is a backend/product name, not a model lineage (the same vendor's
// model could be fronted by more than one backend), and `other` cannot distinguish future
// families from each other, which is exactly the false-cross-vendor-independence risk the review
// flagged. The set below is closed and extensible ONLY by a schema_version bump (CLAUDE.md rule
// 10) plus a fixture — never a silent string-literal addition.

export type Role = "prover" | "verifier" | "reviewer";
export const ROLES = new Set<Role>(["prover", "verifier", "reviewer"]);

export type Tier = "l5" | "hard";
export const TIERS = new Set<Tier>(["l5", "hard"]);

/** How a backend delivers turns: `"session"` (native resume/continuation, the required default
 * per docs/worker-contract.md section (a)) or `"flat"` (no continuation primitive — every turn is
 * an independent process invocation with no cache credit assumed). A backend's dispatch model is
 * a driver-registry fact (`.rk/config`'s backend registry, M3.2), never inferred from a single
 * response. */
export type DispatchModel = "session" | "flat";
export const DISPATCH_MODELS = new Set<DispatchModel>(["session", "flat"]);

/** Closed model-lineage namespace (review blocker 5). Real vendor/lineages only — a backend
 * (`claude`, `codex`, `human`, `fr` — src/scaffold/config-stub.ts's oracle-registry vocabulary)
 * is a DIFFERENT axis from family: `codex` fronts OpenAI models, so its family is `gpt`, not a
 * family of its own. Extending this set is a schema_version bump, not a code edit alone. */
export type ModelFamily = "claude" | "gpt" | "gemini";
export const MODEL_FAMILIES = new Set<ModelFamily>(["claude", "gpt", "gemini"]);

/** The L5 soft-tier's three-way verdict (PRD C9 rigour ladder / "L5 soft tier (default)"). */
export type L5Verdict = "VALID" | "VALID-WITH-CORRECTION" | "INVALID";
export const L5_VERDICTS = new Set<L5Verdict>(["VALID", "VALID-WITH-CORRECTION", "INVALID"]);

/** Byte-identical to ../vibefeld's `ChallengeSeverity` enum (internal/schema/severity.go:
 * SeverityCritical="critical", SeverityMajor="major", SeverityMinor="minor", SeverityNote="note").
 * Kept in lockstep on purpose — a verdict document's challenge maps onto `af verdicts apply` (V2)
 * without a translation table. test/drive/vibefeld-seam-fixture.test.ts (follow-up 8) reads
 * ../vibefeld's own source and fails if these ever drift apart. */
export type Severity = "critical" | "major" | "minor" | "note";
export const SEVERITIES = new Set<Severity>(["critical", "major", "minor", "note"]);

/** Byte-identical to ../vibefeld's `ChallengeCategory` enum (internal/schema/category.go:
 * gap/missing/dependency/incorrect/unclear/other). Same lockstep rationale as `Severity` above. */
export type Category = "gap" | "missing" | "dependency" | "incorrect" | "unclear" | "other";
export const CATEGORIES = new Set<Category>(["gap", "missing", "dependency", "incorrect", "unclear", "other"]);

/** Lowercase hex SHA-256 digest shape, shared by every hash-binding field in this contract
 * (docs/worker-contract.md section (d), landing-blocker 4's pinned hash domains). Format matches
 * src/gates/sha256.ts / src/refs/hash.ts's existing convention (plain hex, no algorithm prefix). */
export const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export function isNonBlankString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}
