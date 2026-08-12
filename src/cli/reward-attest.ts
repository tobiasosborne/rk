// EDGE — fs. `rk reward attest` (rk-tlwb): the ONE writer of the provenance records Gate 8
// Check 4b's independence route reads (schemas/provenance-record.v1.json; the pure shape logic is
// src/reward/provenance-record.ts, the consumer is src/reward/pma-backing.ts).
//
// WHY A SUBCOMMAND AND NOT DRIVER EMISSION. Route (ii) of the same check — a fresh VALID L5
// verdict — is ALREADY what `rk verify --live` produces: the driver signs its own worker turns
// into `.rk/l5-verdicts.jsonl`, hash-pinned, with the identity it dispatched. Route (i) exists for
// the verification events that happen OUTSIDE the driver, and that is not a hypothetical: campaign
// A ran seven windows of hand-dispatched `codex exec` hostile verification with no
// `.rk/driver-log.jsonl` at all, and campaign C's window 1 the same way. For those events the only
// place the worker's identity exists is its own transcript, so the recording tool CANNOT derive
// the author — it must be handed one, and it must refuse to invent a default (the identity of the
// process running `rk` is the orchestrator's, not the verifier's; defaulting to it would forge
// exactly the independence the record is supposed to evidence). Driver emission remains open as a
// later addition for hard-tier turns rk itself dispatches; it does not replace this surface.
//
// THE STANCE. This command will not write a record whose checkable claims it cannot check: the
// claim must be a real registry shard, the author must decode as a canonical identity seam, a
// cited `--source` must exist on disk, the reviewed-bytes hash is DERIVED from the shard rather
// than asserted, and an existing record is never silently replaced. What it does NOT do is refuse
// a record that will not back the close — a same-model reviewer or a stale hash is a true fact
// about what happened, and suppressing it would leave the campaign with no record at all. It
// writes the truth and then prints the gate's real verdict on it.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseRegistry } from "../gates/linker-parse";
import { fileSha256 } from "../gates/snapshot";
import { pmaBackingDecision } from "../reward/pma-backing";
import {
  PROVENANCE_RECORD_ROLES,
  buildProvenanceRecord,
  isProvenanceRecordPath,
  provenanceRecordPath,
  serializeProvenanceRecord,
  type ProvenanceRole,
} from "../reward/provenance-record";
import { loadSnapshot } from "../store/snapshot-load";
import type { Out } from "./args";
import { extractFlag, extractRoot, hasHelpFlag } from "./args";

export function rewardAttestHelp(out: Out): number {
  out.log("rk reward attest — record an independent verification as the JSON provenance record Gate 8 Check 4b reads");
  out.log("  usage: rk reward attest --claim <id> --author <seam> --role verifier|reviewer --reason <text>");
  out.log("                          [--source <path>] [--claim-sha256 <hex>] [--out .rk/<name>.json] [--force] [--root <dir>]");
  out.log("  --author is a canonical driver identity seam 'modelFamily|backend|model|sessionId'");
  out.log("    (families: claude, gpt, gemini; 'codex' is a BACKEND, so a codex-run OpenAI model is");
  out.log("    gpt|codex|gpt-5.6-sol|<session id>). Read it off the WORKER's own transcript header —");
  out.log("    this command never defaults it to whoever is running rk, because that identity is the");
  out.log("    orchestrator's, not the verifier's, and a fabricated seam is worse than no record.");
  out.log("  --source cites the transcript the seam was read from; it must exist under --root.");
  out.log("  --claim-sha256 overrides the reviewed-bytes hash (default: the claim shard as it is on");
  out.log("    disk now). Use it when backfilling an attestation of bytes that have since changed —");
  out.log("    the record then correctly fails to back, rather than silently claiming current bytes.");
  out.log("  Writes one file and nothing else. It never edits the claim shard: it prints the exact");
  out.log("  'provenance:' frontmatter line to add, then reports the gate's real backing decision.");
  out.log("  next: 'rk reward attest --claim <id> --author <seam> --role verifier --reason \"...\"'.");
  return 0;
}

/** The record's own path, either operator-chosen or derived. Confined to a `.json` file DIRECTLY
 * under `.rk/`: src/store/snapshot-load.ts text-loads `.rk/` one level only, so anywhere else is a
 * record the pure gate cannot read (corpus/reward/reward-21, the live campaign-A finding). */
function resolveOutPath(claimId: string, override: string | undefined): { ok: true; path: string } | { ok: false; reason: string } {
  if (override === undefined) return provenanceRecordPath(claimId);
  if (!isProvenanceRecordPath(override)) {
    return {
      ok: false,
      reason: `--out '${override}' is not a legal record location: it must be a .json file directly under .rk/ (the snapshot text-record boundary Check 4b reads)`,
    };
  }
  return { ok: true, path: override };
}

export async function rewardAttestCommand(args: string[], out: Out): Promise<number> {
  if (hasHelpFlag(args)) return rewardAttestHelp(out);
  const { rest, root } = extractRoot(args);
  const { rest: r1, value: claimId } = extractFlag(rest, "--claim");
  const { rest: r2, value: author } = extractFlag(r1, "--author");
  const { rest: r3, value: role } = extractFlag(r2, "--role");
  const { rest: r4, value: reason } = extractFlag(r3, "--reason");
  const { rest: r5, value: sourceRef } = extractFlag(r4, "--source");
  const { rest: r6, value: shaOverride } = extractFlag(r5, "--claim-sha256");
  const { rest: r7, value: outOverride } = extractFlag(r6, "--out");
  const force = r7.includes("--force");

  const missing = [
    ["--claim", claimId], ["--author", author], ["--role", role], ["--reason", reason],
  ].filter(([, v]) => v === undefined).map(([f]) => f);
  if (missing.length > 0) {
    out.log(`rk reward attest: missing required ${missing.join(", ")}.`);
    rewardAttestHelp(out);
    return 2;
  }
  if (!(PROVENANCE_RECORD_ROLES as readonly string[]).includes(role!)) {
    out.log(`rk reward attest: --role '${role}' is not one of ${PROVENANCE_RECORD_ROLES.join(", ")} — a prover never attests to its own claim.`);
    return 2;
  }

  const snapshot = loadSnapshot(root);

  // The claim must be a real registry shard. An attestation for an id no shard carries is a record
  // about nothing, and it would sit in .rk/ looking like evidence forever.
  const { lemmas } = parseRegistry(snapshot);
  const target = lemmas.find((l) => l.id === claimId);
  if (target === undefined) {
    out.log(`rk reward attest: no argument/ shard carries id '${claimId}' — refusing to attest to a claim that does not exist.`);
    out.log(`  next: 'rk check --root ${root}' to see the registry this repo actually has.`);
    return 1;
  }

  // A cited transcript must exist. `--source` is what makes `--author` auditable rather than
  // merely asserted, so a dangling citation defeats its whole purpose.
  if (sourceRef !== undefined && fileSha256(snapshot, sourceRef) === undefined) {
    out.log(`rk reward attest: --source '${sourceRef}' names no file under ${root} — a cited transcript must exist.`);
    return 1;
  }

  // The reviewed-bytes hash is DERIVED by default. An operator asserting a different one is
  // recording a historical attestation, which the gate will (correctly) call stale.
  const currentSha = fileSha256(snapshot, target.path);
  if (currentSha === undefined && shaOverride === undefined) {
    out.log(`rk reward attest: claim shard '${target.path}' has no readable bytes to hash — pass --claim-sha256 with the bytes actually reviewed.`);
    return 1;
  }
  const claimSha256 = shaOverride ?? currentSha!;

  const outPath = resolveOutPath(claimId!, outOverride);
  if (!outPath.ok) {
    out.log(`rk reward attest: ${outPath.reason}`);
    return 1;
  }
  const abs = join(root, ...outPath.path.split("/"));
  if (existsSync(abs) && !force) {
    out.log(`rk reward attest: ${outPath.path} already exists — an attestation records an event and is never silently replaced.`);
    out.log("  next: re-run with --force if the earlier record was wrong, or attest under a different --out.");
    return 1;
  }

  const built = buildProvenanceRecord({
    claimId: claimId!,
    claimSha256,
    author: author!,
    role: role as ProvenanceRole,
    reason: reason!,
    ...(sourceRef !== undefined ? { sourceRef } : {}),
  }, new Date().toISOString());
  if (!built.ok) {
    out.log(`rk reward attest: ${built.reason}`);
    return 1;
  }

  mkdirSync(join(root, ".rk"), { recursive: true });
  writeFileSync(abs, serializeProvenanceRecord(built.record), "utf8");
  out.log(`wrote ${outPath.path} (${built.record.role} ${built.record.author}, claim bytes ${claimSha256.slice(0, 12)})`);
  if (shaOverride !== undefined && currentSha !== undefined && shaOverride.toLowerCase() !== currentSha.toLowerCase()) {
    out.log(`  NOTE: the recorded bytes are not '${target.path}'s current bytes (${currentSha.slice(0, 12)}) — this is a historical attestation.`);
  }

  // Report the gate's REAL verdict over the repo as it now stands, including the shard's own
  // provenance pointer. The command never edits the shard: naming the line to add is self-teaching,
  // rewriting a researcher's frontmatter is not this tool's job.
  const after = loadSnapshot(root);
  const { lemmas: afterLemmas } = parseRegistry(after);
  const afterTarget = afterLemmas.find((l) => l.id === claimId);
  const declared = (afterTarget?.provenance ?? "").trim().split(/\s+/)[0];
  if (declared !== outPath.path) {
    out.log(`  the claim shard does not point at this record yet. Add to ${target.path}'s frontmatter:`);
    out.log(`    provenance: ${outPath.path} — <one line saying what was verified and by whom>`);
    out.log("  next: add that line, then 'rk check' — Check 4b reads the FIRST whitespace token of it.");
    return 0;
  }
  const decision = pmaBackingDecision(after, afterTarget!, afterLemmas);
  if (decision.backed) {
    out.log(`  this record backs '${claimId}'s proved-mod-audit close (route: ${decision.route}).`);
  } else {
    out.log(`  this record does NOT back '${claimId}'s proved-mod-audit close: ${decision.reason}`);
    out.log("  the record is kept: it states what happened. Banking needs a close the gate accepts.");
  }
  out.log(`  next: 'rk check --root ${root}' to see Gate 8's finding for this claim.`);
  return 0;
}
