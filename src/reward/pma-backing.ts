// PURITY: pure — no fs/network/clock (L3). Gate 8 Check 4b's ONE backing decision, shared by
// the gate and `rk reward sync`. The provenance route checks recorded role separation; it does
// not authenticate identities. Every identity is driver-supplied, so the trust anchor remains
// the driver's role isolation (PRD C3/C9 honesty stance).

import type { Lemma } from "../gates/linker-parse";
import { readRetractionFacts } from "../gates/linker-retraction";
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

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function claimProver(snapshot: RepoSnapshot, target: Lemma): { ok: true; seam: string } | { ok: false; reason: string } {
  const identity = target.workspace === undefined
    ? null
    : introspectRootIdentity(snapshot, target.workspace);
  const shard = parseFrontmatter(snapshot.get(target.path) ?? "");
  const seam = identity?.proofAuthor ?? identity?.author ?? shard.fields.prover;
  if (seam === undefined || seam.trim().length === 0) {
    return { ok: false, reason: `claim '${target.id}' has no recoverable prover-of-record (record af proof authorship or a canonical 'prover:' seam)` };
  }
  const decoded = decodeVerifierSeam(seam);
  if (!decoded.ok) {
    return { ok: false, reason: `claim '${target.id}' prover-of-record is not a canonical driver identity seam: ${decoded.reason}` };
  }
  return { ok: true, seam };
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
  if (text === undefined) return { backed: false, reason: `provenance path '${path}' exists but no authorship record is readable` };

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
  if (typeof value.author !== "string" || value.author.trim().length === 0) {
    return { backed: false, reason: `provenance path '${path}' has no recoverable author` };
  }
  const author = decodeVerifierSeam(value.author);
  if (!author.ok) {
    return { backed: false, reason: `provenance path '${path}' author is not a canonical driver identity seam: ${author.reason}` };
  }

  const prover = claimProver(snapshot, target);
  if (!prover.ok) return { backed: false, reason: prover.reason };
  if (value.author === prover.seam) {
    return { backed: false, reason: `provenance path '${path}' is authored by claim '${target.id}'s own prover-of-record — self-report never banks` };
  }
  return { backed: true, route: "provenance" };
}

function l5Decision(snapshot: RepoSnapshot, target: Lemma, lemmas: readonly Lemma[]): PmaBackingDecision {
  const text = snapshot.get(L5_STORE_PATH);
  if (text === undefined) return { backed: false, reason: "no L5 verdict store exists" };
  const parsed = parseL5Log(text);
  const health = l5StoreHealthy(parsed);
  if (!health.healthy) return { backed: false, reason: `the L5 verdict store is unhealthy: ${health.problems.join("; ")}` };
  const retractions = readRetractionFacts(snapshot, lemmas);
  if (!retractions.healthy) return { backed: false, reason: "the retraction ledger is unhealthy" };
  if (retractions.liveL5.has(target.id) || retractions.liveAf.has(target.id)) {
    return { backed: false, reason: `claim '${target.id}' has a live retraction` };
  }
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
 * actionable one and the L5 reason is retained for diagnosis. */
export function pmaBackingDecision(snapshot: RepoSnapshot, target: Lemma, lemmas: readonly Lemma[]): PmaBackingDecision {
  const provenance = provenanceDecision(snapshot, target);
  if (provenance.backed) return provenance;
  const l5 = l5Decision(snapshot, target, lemmas);
  if (l5.backed) return l5;
  return { backed: false, reason: `${provenance.reason}; ${l5.reason}` };
}

export function pmaBacked(snapshot: RepoSnapshot, target: Lemma, lemmas: readonly Lemma[]): boolean {
  return pmaBackingDecision(snapshot, target, lemmas).backed;
}
