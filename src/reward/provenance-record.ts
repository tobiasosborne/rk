// PURITY: pure — no fs/network/clock (L3). rk-tlwb: the PRODUCER side of Gate 8 Check 4b's
// independence route. `schemas/provenance-record.v1.json` is the normative shape; this module is
// its runtime validator and the one place an operator-supplied attestation becomes a record.
// The fs edge that writes it is src/cli/reward-attest.ts (`rk reward attest`); the CONSUMER that
// decides whether a record backs a close is src/reward/pma-backing.ts. This module never decides
// backing: it cannot see the claim's prover, so it cannot judge independence, and it deliberately
// accepts a truthful same-model attestation that the gate will then, correctly, refuse to bank.
//
// WHY IT EXISTS (the incident, per L2). Check 4b v2 landed 2026-08-10 requiring a JSON authorship
// record under `.rk/`. Campaign A (../rk-campaign-A) had run seven windows of real cross-vendor
// hostile verification and recorded every event as prose under `docs/worker-output/*.md`; the
// campaign drew 12 `[reward-tier-unbacked]` errors at once, because no rk subcommand had ever
// written the shape the check reads. A check whose artifact no tool produces is a check every
// honest campaign fails.
//
// TRUTHFULNESS IS THE WHOLE POINT. A record whose `author` seam is invented is worse than no
// record: it converts "this close is unbacked" into "this close is backed by a fabricated
// reviewer". So every field here is refused rather than repaired — a seam is never trimmed into
// canonical form, a role is never coerced, a blank reason is never filled in with a default.
// Identity remains driver-supplied and unauthenticated (PRD C3/C9); what this record buys is that
// a lie must be written down explicitly in a committed file.

import { decodeVerifierSeam } from "../drive/identity";
import { isNonBlankString } from "../drive/vocab";

export const PROVENANCE_RECORD_SCHEMA_VERSION = "1";

/** The two seats that can establish backing. `prover` is deliberately absent: a prover attesting
 * to its own claim is the self-report Check 4b refuses, and it must be inexpressible here, not
 * merely rejected downstream. */
export const PROVENANCE_RECORD_ROLES = ["verifier", "reviewer"] as const;
export type ProvenanceRole = (typeof PROVENANCE_RECORD_ROLES)[number];

/** The only outcome a BACKING record can carry. Route (ii) of the same check refuses
 * `VALID-WITH-CORRECTION`; a refutation is recorded by a schema-v2 `demote` event's `evidenceRef`
 * (Gate 8 check 5), never by an attestation carrying a different verdict word. */
export const PROVENANCE_RECORD_VERDICT = "VALID";

export const PROVENANCE_RECORD_REQUIRED_KEYS = [
  "schema_version", "claimId", "claimSha256", "author", "role", "verdict", "reason",
] as const;
export const PROVENANCE_RECORD_OPTIONAL_KEYS = ["sourceRef", "recordedAt"] as const;

const KNOWN_KEYS: ReadonlySet<string> = new Set<string>([
  ...PROVENANCE_RECORD_REQUIRED_KEYS,
  ...PROVENANCE_RECORD_OPTIONAL_KEYS,
]);
const ROLE_SET: ReadonlySet<string> = new Set<string>(PROVENANCE_RECORD_ROLES);

/** Registry-id charset. Narrower than "non-blank" because `provenanceRecordPath` derives the
 * record's own filename from the id: `/`, `..`, and a leading dot would let a caller-supplied id
 * escape `.rk/` or write a dotfile. Every rk campaign's ids already match (`lem-`/`thm-`/`prop-`/
 * `cor-`/`op-`/`obs-<slug>`). */
const CLAIM_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Full sha256 in hex, case-insensitive — kept identical to the consumer's `CLAIM_SHA256_RE`
 * (src/reward/pma-backing.ts). A short prefix, a padded string, or a non-hex value is refused
 * rather than coerced. */
const CLAIM_SHA256_RE = /^[0-9a-fA-F]{64}$/;

/** What an operator supplies. `schema_version`/`verdict` are NOT here — they are constants of the
 * record type, not choices, so no caller can weaken them (the same split src/drive/retraction-
 * record.ts makes between `RetractionInput` and `RetractionRecord`). */
export interface ProvenanceRecordInput {
  claimId: string;
  /** sha256 of the claim-shard bytes the author reviewed (rk-io5l's content binding). Supplied by
   * the edge, which hashes the shard on disk — this module never touches fs. */
  claimSha256: string;
  /** Canonical driver identity seam `modelFamily|backend|model|sessionId` — read off the worker's
   * OWN transcript header, never the identity of the process running the writer. */
  author: string;
  role: ProvenanceRole;
  reason: string;
  /** Repo-relative path of the transcript/report this attestation was transcribed from. */
  sourceRef?: string;
}

export interface ProvenanceRecord {
  schema_version: typeof PROVENANCE_RECORD_SCHEMA_VERSION;
  claimId: string;
  claimSha256: string;
  author: string;
  role: ProvenanceRole;
  verdict: typeof PROVENANCE_RECORD_VERDICT;
  reason: string;
  sourceRef?: string;
  /** Edge-supplied ISO-8601 string; explicitly non-identity (nothing reads it). */
  recordedAt?: string;
}

export type ProvenanceRecordResult =
  | { ok: true; record: ProvenanceRecord }
  | { ok: false; reason: string };

/** The canonical-seam predicate, kept BYTE-FOR-BYTE equivalent to the consumer's
 * (src/reward/pma-backing.ts's `canonicalIdentity`): decodes through the one seam encoding, then
 * refuses any component carrying leading/trailing whitespace — whitespace is rejected, never
 * trimmed into acceptability, because ` gpt` comparing unequal to `gpt` is exactly how a
 * same-model review would slip past the independence comparison. The duplication is deliberate
 * (the consumer does not export its predicate) and is guarded by the anti-drift block in
 * test/reward/provenance-record.test.ts, which runs both over the same seam matrix. */
function canonicalSeamProblem(seam: string): string | undefined {
  const decoded = decodeVerifierSeam(seam);
  if (!decoded.ok) return decoded.reason;
  const components = [
    decoded.identity.modelFamily,
    decoded.identity.backend,
    decoded.identity.model,
    decoded.identity.sessionId,
  ];
  if (components.some((c) => c !== c.trim())) {
    return "identity seam components must not carry leading or trailing whitespace";
  }
  return undefined;
}

function validateInput(input: ProvenanceRecordInput): string | undefined {
  if (!isNonBlankString(input.claimId) || !CLAIM_ID_RE.test(input.claimId)) {
    return `claimId must be a registry id matching ${CLAIM_ID_RE.source} (a record path is derived from it)`;
  }
  if (typeof input.claimSha256 !== "string" || !CLAIM_SHA256_RE.test(input.claimSha256)) {
    return "claimSha256 must be the 64-hex sha256 of the claim-shard bytes the author reviewed — a record naming no reviewed bytes can never be shown stale";
  }
  if (!isNonBlankString(input.author)) {
    return "author must be a canonical driver identity seam 'modelFamily|backend|model|sessionId' — an anonymous attestation cannot establish independence";
  }
  const seam = canonicalSeamProblem(input.author);
  if (seam !== undefined) return `author is not a canonical driver identity seam: ${seam}`;
  if (!ROLE_SET.has(input.role)) {
    return `role must be one of ${PROVENANCE_RECORD_ROLES.join(", ")} — a prover never attests to its own claim`;
  }
  if (!isNonBlankString(input.reason)) {
    return "reason must be a non-blank string (an unexplained attestation is not auditable)";
  }
  if (input.sourceRef !== undefined && !isNonBlankString(input.sourceRef)) {
    return "sourceRef must be a non-blank repo-relative path when present";
  }
  return undefined;
}

/** Builds the record from an operator-supplied input plus the edge's optional wall-clock stamp.
 * Rejects (never throws) every shape violation: this is the ONE place an input becomes a record. */
export function buildProvenanceRecord(input: ProvenanceRecordInput, recordedAt?: string): ProvenanceRecordResult {
  if (recordedAt !== undefined && !isNonBlankString(recordedAt)) {
    return { ok: false, reason: "recordedAt must be a non-blank ISO-8601 string when present" };
  }
  const problem = validateInput(input);
  if (problem !== undefined) return { ok: false, reason: problem };
  return {
    ok: true,
    record: {
      schema_version: PROVENANCE_RECORD_SCHEMA_VERSION,
      claimId: input.claimId,
      claimSha256: input.claimSha256,
      author: input.author,
      role: input.role,
      verdict: PROVENANCE_RECORD_VERDICT,
      reason: input.reason,
      ...(input.sourceRef !== undefined ? { sourceRef: input.sourceRef } : {}),
      ...(recordedAt !== undefined ? { recordedAt } : {}),
    },
  };
}

/** Serializes a record as the file's whole contents: 2-space-indented JSON with a trailing
 * newline. Human-legible on purpose — unlike a JSONL ledger line, this file is read by auditors
 * far more often than by machines, and `git diff` on a one-line JSON blob hides which field moved.
 * Key order is never relied on; every reader parses by name. */
export function serializeProvenanceRecord(record: ProvenanceRecord): string {
  return JSON.stringify(record, null, 2) + "\n";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Validates an already-parsed JSON value against the full v1 surface, including
 * `additionalProperties:false`. Used by the writer to refuse clobbering an unreadable record and
 * available to any auditor wanting the schema enforced in code rather than by eye. */
export function validateProvenanceRecord(value: unknown): ProvenanceRecordResult {
  if (!isPlainObject(value)) return { ok: false, reason: "must be a JSON object" };
  for (const key of Object.keys(value)) {
    if (!KNOWN_KEYS.has(key)) {
      return { ok: false, reason: `unknown field '${key}' (schemas/provenance-record.v1.json is additionalProperties:false)` };
    }
  }
  if (value.schema_version !== PROVENANCE_RECORD_SCHEMA_VERSION) {
    return {
      ok: false,
      reason: `schema_version must be the STRING '${PROVENANCE_RECORD_SCHEMA_VERSION}', got ${JSON.stringify(value.schema_version)}`,
    };
  }
  if (value.verdict !== PROVENANCE_RECORD_VERDICT) {
    return {
      ok: false,
      reason: `verdict must be '${PROVENANCE_RECORD_VERDICT}' — a refutation is recorded by a demote event's evidenceRef, never by an attestation`,
    };
  }
  if (value.recordedAt !== undefined && typeof value.recordedAt !== "string") {
    return { ok: false, reason: "recordedAt must be a string when present" };
  }
  const problem = validateInput({
    claimId: value.claimId as string,
    claimSha256: value.claimSha256 as string,
    author: value.author as string,
    role: value.role as ProvenanceRole,
    reason: value.reason as string,
    ...(value.sourceRef !== undefined ? { sourceRef: value.sourceRef as string } : {}),
  });
  if (problem !== undefined) return { ok: false, reason: problem };
  return { ok: true, record: value as unknown as ProvenanceRecord };
}

/** Parses a record file's whole text. Returns `{ok:false}` — never throws — so an unreadable
 * record is a reported refusal, not an exception that would abort the writer mid-run. */
export function parseProvenanceRecord(text: string): ProvenanceRecordResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `not valid JSON (${e instanceof Error ? e.message : String(e)})` };
  }
  return validateProvenanceRecord(parsed);
}

/** The canonical location. `.rk/` one level deep is not a style choice: src/store/snapshot-load.ts
 * text-loads `.rk/` non-recursively, so a record anywhere else is invisible to the pure gate that
 * must read its author field (corpus/reward/reward-21 is the campaign-A red case). */
export function provenanceRecordPath(claimId: string): { ok: true; path: string } | { ok: false; reason: string } {
  if (!isNonBlankString(claimId) || !CLAIM_ID_RE.test(claimId)) {
    return { ok: false, reason: `claimId must match ${CLAIM_ID_RE.source} — a record path is derived from it` };
  }
  return { ok: true, path: `.rk/provenance-${claimId}.json` };
}

/** The reserved filename prefix `.rk/` records are written under. Everything else directly under
 * `.rk/` belongs to rk itself. */
export const PROVENANCE_RECORD_PREFIX = "provenance-";

/** True iff `path` is a legal WRITE location for a record: `.rk/provenance-<name>.json`, one level
 * deep, no traversal. Two constraints, one predicate:
 *
 * LOCATION — a `.json` file DIRECTLY under `.rk/`, because src/store/snapshot-load.ts text-loads
 * `.rk/` one level only and a record anywhere else is invisible to the pure gate that must read
 * its author field (corpus/reward/reward-21, the live campaign-A finding).
 *
 * NAMESPACE (Tier A review 2026-08-12, finding 4) — the `provenance-` prefix. The predicate used
 * to accept every direct `.rk/*.json`, which meant `rk reward attest --out .rk/config.json
 * --force` overwrote a campaign's own configuration with a provenance record, and without
 * `--force` fabricated an invalid control file where none existed. A RESERVED NAMESPACE is chosen
 * over a denylist of today's control filenames (`config.json`, `generated.json`, `oracles.json`)
 * deliberately: a denylist is wrong the day someone adds a new `.rk/*.json` control file and
 * nobody remembers this predicate, whereas the namespace stays correct by construction. It is
 * strictly narrower than what the CONSUMER reads — src/reward/pma-backing.ts accepts any
 * `.rk/<name>.json` a shard declares, because hand-written records predate this tool and refusing
 * to READ them would be the gate lying about what it can see. Writer strict, reader honest. */
export function isProvenanceRecordPath(path: string): boolean {
  return /^\.rk\/provenance-[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(path);
}
