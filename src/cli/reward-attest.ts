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
//
// DECLARE FIRST, THEN ATTEST (Tier A repair wave 2026-08-12, finding 1). The shard's
// `provenance:` frontmatter line is part of the shard's RAW BYTES, and rk-io5l's content binding
// pins the record to exactly those bytes. So the ordering is not cosmetic: this command used to
// hash, write, and only then print "add this line", which meant an operator following the tool's
// own next-step immediately made the record stale — the workflow's happy path emitted a record
// `rk check` then rejected. The declaration is therefore a PRECONDITION of hashing, checked
// before a single byte is written. This suppresses no truth (the attestation is written on the
// very next run, stale hash and all when `--claim-sha256` says so); it fixes only the ORDER. The
// command still never edits the shard: it names the line and refuses until the researcher has
// written it, which also means the bytes the record binds are bytes a human deliberately
// finalized. What the author must have reviewed is then stated on the way out, because the
// declaration line is itself part of the bound bytes and the author reviewed the claim, not the
// bookkeeping.

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
  out.log("  --out must name the reserved record namespace '.rk/provenance-<name>.json'; rk's own");
  out.log("    control files (.rk/config.json, .rk/generated.json, .rk/oracles.json) are not writable here.");
  out.log("  Writes one file and nothing else, and never edits the claim shard — so the shard must");
  out.log("  ALREADY carry 'provenance: <record path>'. That line is part of the bytes the record");
  out.log("  binds, so adding it afterwards would make the record stale on arrival: when it is");
  out.log("  missing the command prints the exact line and refuses. Add it, re-run, and the command");
  out.log("  reports the gate's real backing decision.");
  out.log("  next: add the 'provenance:' line to the shard, then");
  out.log("        'rk reward attest --claim <id> --author <seam> --role verifier --reason \"...\"'.");
  return 0;
}

/** The record's own path, either operator-chosen or derived. Confined to `.rk/provenance-*.json`:
 * one level under `.rk/` because src/store/snapshot-load.ts text-loads `.rk/` non-recursively
 * (corpus/reward/reward-21, the live campaign-A finding), and inside the reserved `provenance-`
 * namespace because everything else directly under `.rk/` is rk's own — `--out .rk/config.json
 * --force` used to overwrite a campaign's configuration with a provenance record (Tier A review
 * 2026-08-12, finding 4). The namespace is chosen over a denylist because a denylist rots the day
 * a new control file is added; see `isProvenanceRecordPath`. */
function resolveOutPath(claimId: string, override: string | undefined): { ok: true; path: string } | { ok: false; reason: string } {
  if (override === undefined) return provenanceRecordPath(claimId);
  if (!isProvenanceRecordPath(override)) {
    return {
      ok: false,
      reason:
        `--out '${override}' is not a legal record location: it must be '.rk/provenance-<name>.json' — ` +
        `directly under .rk/ (the snapshot text-record boundary Check 4b reads) and inside the reserved ` +
        `'provenance-' namespace, so an attestation can never be written over one of rk's own .rk/ control files`,
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

  const outPath = resolveOutPath(claimId!, outOverride);
  if (!outPath.ok) {
    out.log(`rk reward attest: ${outPath.reason}`);
    return 1;
  }

  // THE DECLARATION IS A PRECONDITION OF HASHING (finding 1). The `provenance:` line lives in the
  // shard's raw bytes, which is exactly what the record binds — so a record written before the
  // line exists is stale the instant the operator adds it. Refusing here, before anything is
  // hashed or written, is what makes the printed next-step safe to follow.
  const declared = (target.provenance ?? "").trim().split(/\s+/)[0];
  if (declared !== outPath.path) {
    out.log(`rk reward attest: '${target.path}' does not declare '${outPath.path}' yet, and this record binds that shard's CURRENT bytes — writing it now and adding the line after would make it stale on arrival.`);
    out.log(`  add to '${target.path}'s frontmatter (Check 4b reads the FIRST whitespace token of it):`);
    out.log(`    provenance: ${outPath.path} — <one line saying what was verified and by whom>`);
    out.log("  next: add that line, then re-run this exact command.");
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
  // Say plainly which bytes were bound, because the author reviewed the CLAIM and the bound bytes
  // include the `provenance:` bookkeeping line the operator added to satisfy the precondition
  // above. That is the one divergence between "what was reviewed" and "what is bound", and it is
  // stated rather than left for a reader to discover.
  if (shaOverride === undefined) {
    out.log(`  it binds '${target.path}'s bytes AS THEY ARE NOW, the 'provenance:' declaration line included —`);
    out.log("  attest only if those are the bytes whose claim and proof the author actually examined; any");
    out.log("  later edit to the shard makes this record stale and the close unbacked, deliberately.");
  } else if (currentSha !== undefined && shaOverride.toLowerCase() !== currentSha.toLowerCase()) {
    out.log(`  NOTE: the recorded bytes are not '${target.path}'s current bytes (${currentSha.slice(0, 12)}) — this is a historical attestation.`);
  } else {
    out.log(`  NOTE: the --claim-sha256 you supplied equals '${target.path}'s current bytes; the record binds those.`);
  }

  // Report the gate's REAL verdict over the repo as it now stands. The shard's own provenance
  // pointer is guaranteed present (it was a precondition), so this is the complete decision.
  const after = loadSnapshot(root);
  const { lemmas: afterLemmas } = parseRegistry(after);
  const afterTarget = afterLemmas.find((l) => l.id === claimId) ?? target;
  const decision = pmaBackingDecision(after, afterTarget, afterLemmas);
  if (decision.backed) {
    out.log(`  this record backs '${claimId}'s proved-mod-audit close (route: ${decision.route}).`);
  } else {
    out.log(`  this record does NOT back '${claimId}'s proved-mod-audit close: ${decision.reason}`);
    out.log("  the record is kept: it states what happened. Banking needs a close the gate accepts.");
  }
  out.log(`  next: 'rk check --root ${root}' to see Gate 8's finding for this claim.`);
  return 0;
}
