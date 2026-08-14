// PURITY: pure — no fs/network/clock (L3). Gate 8 Check 4b's ONE backing decision, shared by
// the gate and `rk reward sync`. The provenance route checks recorded role separation; it does
// not authenticate identities. Every identity is driver-supplied, so the trust anchor remains
// the driver's role isolation (PRD C3/C9 honesty stance).
//
// SHAPE: one WITHDRAWAL precondition (src/reward/pma-withdrawal.ts, rk-yic3) binding BOTH routes,
// then the routes in order — (i) provenance record, (ii) L5 verdict. A rule that is a fact about
// the CLAIM rather than about one kind of evidence belongs in the precondition: a rule living in
// only one route is a rule the other route goes around, which is what happened to retraction until
// 2026-08-14.

import type { Lemma } from "../gates/linker-parse";
import { retractionRefusal } from "./pma-withdrawal";
import { introspectRootIdentity } from "../gates/linker-workspace";
import type { RepoSnapshot } from "../gates/snapshot";
import { fileSha256, parseFrontmatter } from "../gates/snapshot";
import { decodeVerifierSeam } from "../drive/identity";
import { l5StoreHealthy, latestVerdictFor, parseL5Log } from "../drive/l5-store";
import { L5_STORE_PATH } from "../gates/linker-l5";

export type PmaBackingDecision =
  | { backed: true; route: "provenance" | "l5" }
  | { backed: false; reason: string };

const BACKING_ROLES = new Set(["verifier", "reviewer"]);

/** The only outcome a record can carry and still back a close. Duplicated from
 * src/reward/provenance-record.ts's `PROVENANCE_RECORD_VERDICT` on purpose, exactly as
 * `CLAIM_SHA256_RE` and `canonicalIdentity` are: this module is the CONSUMER and must not soften
 * because a producer constant moved. test/reward/provenance-record.test.ts's anti-drift block runs
 * both sides over the same records and is what keeps them equal. */
const BACKING_VERDICT = "VALID";

/** A full sha256 in hex. Case-insensitive to match the identity comparison's case-normalization
 * stance (a writer using an uppercase-hex hasher is not a validity event); every other shape —
 * short prefix, padded, non-hex, non-string — is refused rather than coerced. */
const CLAIM_SHA256_RE = /^[0-9a-fA-F]{64}$/;

interface CanonicalIdentity {
  seam: string;
  modelFamily: string;
  backend: string;
  model: string;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalIdentity(seam: string): { ok: true; identity: CanonicalIdentity } | { ok: false; reason: string } {
  const decoded = decodeVerifierSeam(seam);
  if (!decoded.ok) return decoded;
  const values = [
    decoded.identity.modelFamily,
    decoded.identity.backend,
    decoded.identity.model,
    decoded.identity.sessionId,
  ];
  if (values.some((value) => value !== value.trim())) {
    return { ok: false, reason: "identity seam components must not carry leading or trailing whitespace" };
  }
  return {
    ok: true,
    identity: {
      seam,
      modelFamily: decoded.identity.modelFamily.toLowerCase(),
      backend: decoded.identity.backend.toLowerCase(),
      model: decoded.identity.model.toLowerCase(),
    },
  };
}

function claimProver(snapshot: RepoSnapshot, target: Lemma): { ok: true; identity: CanonicalIdentity } | { ok: false; reason: string } {
  const identity = target.workspace === undefined
    ? null
    : introspectRootIdentity(snapshot, target.workspace);
  const shard = parseFrontmatter(snapshot.get(target.path) ?? "");
  const seam = identity?.proofAuthor ?? identity?.author ?? shard.fields.prover;
  if (seam === undefined || seam.trim().length === 0) {
    return { ok: false, reason: `claim '${target.id}' has no recoverable prover-of-record (record af proof authorship or a canonical 'prover:' seam)` };
  }
  const decoded = canonicalIdentity(seam);
  if (!decoded.ok) {
    return { ok: false, reason: `claim '${target.id}' prover-of-record is not a canonical driver identity seam: ${decoded.reason}` };
  }
  return { ok: true, identity: decoded.identity };
}

function provenanceDecision(snapshot: RepoSnapshot, target: Lemma): PmaBackingDecision {
  const declaration = (target.provenance ?? "").trim();
  if (declaration.length === 0) return { backed: false, reason: "no provenance record is declared" };

  const path = declaration.split(/\s+/)[0]!;
  if (path === target.path) return { backed: false, reason: "the provenance path is the claim shard itself" };
  if (fileSha256(snapshot, path) === undefined) return { backed: false, reason: `provenance path '${path}' does not exist` };

  // Provenance records must be TEXT-loaded into the snapshot so authorship can be recovered.
  // Direct `.rk/*.json` records satisfy the current loader contract. A merely hash-visible file
  // is anonymous to the pure core and therefore cannot establish independence.
  const text = snapshot.get(path);
  if (text === undefined) {
    return {
      backed: false,
      reason:
        `provenance path '${path}' exists but is outside the snapshot text-record boundary; ` +
        `move the record to canonical '.rk/<name>.json' (directly under .rk/)`,
    };
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { backed: false, reason: `provenance path '${path}' is not a JSON authorship record` };
  }
  if (!plainObject(value)) return { backed: false, reason: `provenance path '${path}' is not a JSON object` };
  if (value.schema_version !== "1") return { backed: false, reason: `provenance path '${path}' must carry schema_version '1'` };
  if (value.claimId !== target.id) return { backed: false, reason: `provenance path '${path}' does not identify claim '${target.id}'` };
  if (typeof value.role !== "string" || !BACKING_ROLES.has(value.role)) {
    return { backed: false, reason: `provenance path '${path}' must record role 'verifier' or 'reviewer'` };
  }

  // WHAT THE RECORD SAYS (rk-xrgn, Tier A review 2026-08-12 finding 2). Until this landed the
  // banking site read WHO wrote the record, for WHICH claim, and against WHICH bytes — never its
  // OUTCOME. A hand-authored record carrying `verdict: "REFUTED"`, no verdict at all, or a blank
  // reason therefore reached the success return and banked a proved-mod-audit close: the reviewer
  // banked a close on a record stating the claim is false. `rk reward attest` could never emit
  // one (`verdict` is a constant of the record type there, not a caller choice), but Check 4b
  // reads records nobody's tool wrote — that is precisely why route (i) exists.
  //
  // PLACEMENT, deliberate: these clauses sit with the record's other INTRINSIC-shape checks
  // (schema_version, claimId, role) and BEFORE the identity/independence machinery, because
  // recovering the claim's prover-of-record is a cross-document lookup that can fail with its own
  // reason ("no recoverable prover-of-record") and would then mask the far more actionable fact
  // that the record says REFUTED. Nothing downstream is reordered: the content binding stays last
  // for the reason its own header gives, and no existing corpus fixture's reported reason moves,
  // because every one of them carries an honest `verdict: "VALID"` and a non-blank reason.
  if (typeof value.verdict !== "string") {
    return {
      backed: false,
      reason: `provenance path '${path}' records no 'verdict' — a record stating no outcome endorses nothing`,
    };
  }
  if (value.verdict !== BACKING_VERDICT) {
    return {
      backed: false,
      reason:
        `provenance path '${path}' records verdict '${value.verdict}', not '${BACKING_VERDICT}' — only an ` +
        `endorsement backs a close; a refutation is recorded by a demote event's evidenceRef (check 5), ` +
        `never by an attestation carrying a different verdict word`,
    };
  }
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) {
    return {
      backed: false,
      reason:
        `provenance path '${path}' has no non-blank 'reason' — an unexplained attestation is the ` +
        `prose-free twin of the prose-only record this route exists to replace, and is not auditable`,
    };
  }

  if (typeof value.author !== "string" || value.author.trim().length === 0) {
    return { backed: false, reason: `provenance path '${path}' has no recoverable author` };
  }
  const author = canonicalIdentity(value.author);
  if (!author.ok) {
    return { backed: false, reason: `provenance path '${path}' author is not a canonical driver identity seam: ${author.reason}` };
  }

  const prover = claimProver(snapshot, target);
  if (!prover.ok) return { backed: false, reason: prover.reason };
  if (value.author === prover.identity.seam) {
    return {
      backed: false,
      reason: `provenance path '${path}' carries the same recorded identity seam as claim '${target.id}'s prover-of-record — self-report never banks`,
    };
  }
  const sameModel = author.identity.modelFamily === prover.identity.modelFamily
    && author.identity.backend === prover.identity.backend
    && author.identity.model === prover.identity.model;
  if (sameModel) {
    return {
      backed: false,
      reason:
        `provenance path '${path}' is authored by the same decoded model as claim '${target.id}'s prover-of-record ` +
        `(modelFamily/backend/model comparison is case-normalized; changing sessionId never establishes independence)`,
    };
  }
  return contentBinding(snapshot, target, path, value);
}

/** Check 4b(i)'s CONTENT BINDING (rk-io5l, ported from campaign C's record-integrity oracle,
 * ../rk-campaign-C/scripts/oracle-record-integrity.py:45-55). Route (ii) has bound a verdict to
 * the exact reviewed bytes since M3.7 — `latestVerdictFor` calls a verdict fresh iff the shard
 * still hashes to its `l5ContentHash` — while route (i) checked only WHO wrote the record and for
 * WHICH id, so a record survived arbitrary later rewrites of the claim it endorsed. This closes
 * that asymmetry with the same rule: a record backs only the bytes it names.
 *
 * Recorded-and-checkable, not authentication (the V1/V2 honesty stance, as everywhere else in
 * this module): a writer who copies the shard's current hash into a record it never read is not
 * detected here. What IS detected is staleness — the edit-after-endorsement case the campaigns
 * actually produce ("ENDORSE WITH REVISIONS applied") — and it fails closed, so an endorsement
 * has to be re-recorded against the final bytes rather than silently inherited.
 *
 * Deliberately LAST in the provenance route: it changes no other clause's verdict (a record that
 * already fails independence still reports independence), only the reason a reader is handed. */
function contentBinding(
  snapshot: RepoSnapshot,
  target: Lemma,
  path: string,
  record: Record<string, unknown>,
): PmaBackingDecision {
  const bound = record.claimSha256;
  if (typeof bound !== "string" || !CLAIM_SHA256_RE.test(bound)) {
    return {
      backed: false,
      reason:
        `provenance path '${path}' must record 'claimSha256', the 64-hex sha256 of the claim-shard ` +
        `bytes it reviewed — a record naming no reviewed bytes can never be shown stale`,
    };
  }
  const current = fileSha256(snapshot, target.path);
  if (current === undefined) {
    return { backed: false, reason: `claim shard '${target.path}' has no current byte hash` };
  }
  if (bound.toLowerCase() !== current.toLowerCase()) {
    return {
      backed: false,
      reason:
        `provenance path '${path}' is stale: it was recorded against claim bytes ${bound.slice(0, 12).toLowerCase()} ` +
        `but '${target.path}' now hashes to ${current.slice(0, 12)} — re-record the endorsement against the current bytes`,
    };
  }
  return { backed: true, route: "provenance" };
}

function l5Decision(snapshot: RepoSnapshot, target: Lemma): PmaBackingDecision {
  const text = snapshot.get(L5_STORE_PATH);
  if (text === undefined) return { backed: false, reason: "no L5 verdict store exists" };
  const parsed = parseL5Log(text);
  const health = l5StoreHealthy(parsed);
  if (!health.healthy) return { backed: false, reason: `the L5 verdict store is unhealthy: ${health.problems.join("; ")}` };
  // The retraction clauses that used to live here are now `retractionRefusal`, enforced by the ONE
  // caller below ahead of BOTH routes (rk-yic3) — hence no `lemmas` parameter. Not duplicated here:
  // a second copy would be unreachable, and an unreachable copy of a validity rule reads like
  // enforcement while proving nothing.
  const hash = fileSha256(snapshot, target.path);
  if (hash === undefined) return { backed: false, reason: `claim shard '${target.path}' has no current byte hash` };
  const latest = latestVerdictFor(parsed.records, target.id, hash);
  if (latest === undefined) return { backed: false, reason: `claim '${target.id}' has no L5 verdict` };
  if (!latest.fresh) return { backed: false, reason: `claim '${target.id}'s latest L5 verdict is stale` };
  if (latest.verdict !== "VALID") return { backed: false, reason: `claim '${target.id}'s latest L5 verdict is '${latest.verdict}', not VALID` };
  return { backed: true, route: "l5" };
}

/** Check 4b's complete decision. A bad provenance declaration never suppresses an independently
 * sufficient fresh VALID L5 verdict; when neither route backs, the provenance reason is the most
 * actionable one and the L5 reason is retained for diagnosis.
 * The retraction precondition (rk-yic3) runs BEFORE either route and short-circuits both: a
 * withdrawn claim — or an unknowable withdrawal status — is refused once, with one reason. */
export function pmaBackingDecision(snapshot: RepoSnapshot, target: Lemma, lemmas: readonly Lemma[]): PmaBackingDecision {
  const withdrawn = retractionRefusal(snapshot, target, lemmas);
  if (withdrawn !== undefined) return { backed: false, reason: withdrawn };
  const provenance = provenanceDecision(snapshot, target);
  if (provenance.backed) return provenance;
  const l5 = l5Decision(snapshot, target);
  if (l5.backed) return l5;
  return { backed: false, reason: `${provenance.reason}; ${l5.reason}` };
}

export function pmaBacked(snapshot: RepoSnapshot, target: Lemma, lemmas: readonly Lemma[]): boolean {
  return pmaBackingDecision(snapshot, target, lemmas).backed;
}
