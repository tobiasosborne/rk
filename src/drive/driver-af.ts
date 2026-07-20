// EDGE — subprocess (`af export --graph json`, `af verdicts apply --format json`) + fs (a temp
// verdict file). The af seam the M3.6 hard-tier driver drives: it QUERIES af for the workspace's
// current node state (af's state machine is the truth — src/drive/driver-plan.ts reads readiness off
// it, never re-derives it) and APPLIES a composed verdict file through af's own ingestion verb,
// returning the per-item outcome report verbatim. The pure parsers (`parseAfExport`,
// `parseVerdictReport`) are separated out so the run loop's behavior is unit-testable on canned
// JSON without a real af binary; the two `run*` functions are the only spawns.
//
// crux is read RAW here (bead rk-mnp: rk's own graph schema does not thread the per-node `crux`
// flag, so the driver reads it straight off `af export --graph json`'s node objects —
// ../vibefeld/docs/export-graph-v1.md). The apply path mirrors ../vibefeld/docs/verdicts-apply.md
// byte-for-byte: file order = dependency order (children before parent), `--format json`, exit codes
// 0 (all applied) / 3 (file invalid) / 5 (partial) / 6 (none applied), and `VerdictReport`'s
// `{items:[{node,verdict,status,detail}], applied, blocked, rejected, aborted}` shape
// (internal/service/verdicts_apply.go).

import { writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AfNodeView } from "./driver-plan";
import type { VerdictFileSkeleton } from "./batch-plan";
import type { ProofContent, RecordProofResult } from "./driver-prove-node";

export interface AfWorkspaceView {
  workspaceId: string;
  rootStatement?: string;
  nodes: AfNodeView[];
  nodeCount: number;
}

export interface VerdictItemOutcome {
  node: string;
  verdict: string;
  /** "applied" | "blocked-by:<reason>" | "rejected:<reason>" — never ambiguous, every item present
   * in file order even on abort (../vibefeld/docs/verdicts-apply.md). */
  status: string;
  detail?: string;
}

export interface ApplyReport {
  /** af's own exit code: 0 all-applied, 3 file-invalid, 5 partial, 6 none-applied, other = failure. */
  exit: number;
  batchId: string;
  items: VerdictItemOutcome[];
  applied: number;
  blocked: number;
  rejected: number;
  aborted: boolean;
}

/** A filled verdict file: the skeleton (src/drive/batch-plan.ts) with `verified_by` overwritten to a
 * real identity seam and each item's verdict/reason filled by the driver after dispatch. Kept as an
 * open record here since this edge only serializes it. */
export type FilledVerdictFile = Omit<VerdictFileSkeleton, "items"> & {
  items: Array<{ node: string; verdict: "accept" | "challenge"; reason: string; target?: string; severity?: string; category?: string; expect_hash?: string }>;
};

export type AfParseResult<T> = { ok: true; value: T } | { ok: false; reason: string };

/** Pure: parses `af export --graph json` stdout into the driver's node view. Reads only recorded
 * axes; `crux` defaults false (omitted-if-false in the export). */
export function parseAfExport(rawJson: string, workspaceId: string): AfParseResult<AfWorkspaceView> {
  let doc: any;
  try {
    doc = JSON.parse(rawJson);
  } catch {
    return { ok: false, reason: "af export produced unparseable JSON" };
  }
  if (doc === null || typeof doc !== "object" || !Array.isArray(doc.nodes)) {
    return { ok: false, reason: "af export missing a nodes[] array" };
  }
  const nodes: AfNodeView[] = doc.nodes.map((n: any) => ({
    id: String(n.id),
    epistemicState: typeof n.epistemic_state === "string" ? n.epistemic_state : "pending",
    workflowState: typeof n.workflow_state === "string" ? n.workflow_state : "available",
    crux: n.crux === true,
    contentHash: typeof n.content_hash === "string" ? n.content_hash : "",
    author: typeof n.author === "string" && n.author.length > 0 ? n.author : undefined,
    // M3.5-prep additive read (src/drive/driver-plan.ts's AfNodeView doc comment): `statement` and
    // `child_ids` are already real v1 export fields; threaded through for live prompt assembly.
    statement: typeof n.statement === "string" ? n.statement : undefined,
    childIds: Array.isArray(n.child_ids) ? n.child_ids.map((c: unknown) => String(c)) : undefined,
    // rk-jit (STOP-4): the af `inference` rule, threaded through so `isProoflessNode` can tell a
    // derived leaf from a bare un-proven claim (af defaults an unjustified node's inference to
    // "assumption"). Non-string/absent → undefined. Data-carrying only; no readiness read touches it.
    inference: typeof n.inference === "string" ? n.inference : undefined,
    // rk-gn4: af's OWN authoritative per-node job classification (vibefeld d4493c8,
    // ../vibefeld/internal/jobs via `af export --graph json`). `omitempty` on the af side means a
    // false flag is ABSENT from the JSON, so an absent key reads as `false` here. An OLD af that
    // predates these flags therefore reports every node not-ready → driver-plan.ts's readiness
    // dispatches nothing → the driver aborts root-unvalidated (fail closed, loud), never a
    // wrong-role dispatch on a guessed readiness.
    proverReady: n.prover_ready === true,
    verifierReady: n.verifier_ready === true,
    // rk B2: the prover's recorded reference dependencies (additive `dependencies[]`,
    // ../vibefeld/internal/export FeatureNodeDependencies). Omitted → undefined (no deps).
    deps: Array.isArray(n.dependencies) ? n.dependencies.map((d: unknown) => String(d)) : undefined,
    // rk B3: af's authoritative bottom-up closure flag (additive `closed`, FeatureClosureFlag).
    // omitempty on the af side → an absent key reads as false here.
    closed: n.closed === true,
  }));
  const root = doc.nodes.find((n: any) => String(n.id) === "1");
  const nodeCount = typeof doc.validation?.total_nodes === "number" ? doc.validation.total_nodes : nodes.length;
  return { ok: true, value: { workspaceId, rootStatement: root?.statement, nodes, nodeCount } };
}

/** rk FU5: the af export capabilities this build of rk depends on. Each corresponds to an additive
 * export field whose ABSENCE (an af predating it) would be silently misread as "false" — an old af
 * would report every node not-ready and no root closed, which the driver would mistake for a stalled
 * `root-unvalidated`. The preflight below requires all of them, so an old af fails LOUDLY at startup.
 * Mirrors ../vibefeld/internal/export.GraphFeatures. */
export const REQUIRED_AF_FEATURES = ["readiness-flags", "closure-flag", "node-dependencies"] as const;
export const REQUIRED_AF_SCHEMA_VERSION = "1";

/** Pure: rk FU5 capability/version preflight over a single `af export --graph json` document. A live
 * run calls this ONCE at startup and refuses to run on a mismatch, rather than silently reading an
 * older af's absent flags as "nothing ready / not closed." Requires `schema_version === "1"` AND the
 * always-present `features[]` array to include every capability in REQUIRED_AF_FEATURES. An af too
 * old to emit `features` at all fails here (the array is absent), which is the whole point. */
export function preflightAfExport(rawJson: string): { ok: true } | { ok: false; reason: string } {
  let doc: any;
  try {
    doc = JSON.parse(rawJson);
  } catch {
    return { ok: false, reason: "af export produced unparseable JSON at preflight" };
  }
  if (doc === null || typeof doc !== "object") {
    return { ok: false, reason: "af export is not a JSON object at preflight" };
  }
  if (doc.schema_version !== REQUIRED_AF_SCHEMA_VERSION) {
    return { ok: false, reason: `af export schema_version is '${doc.schema_version}', require '${REQUIRED_AF_SCHEMA_VERSION}' — incompatible af binary` };
  }
  if (!Array.isArray(doc.features)) {
    return { ok: false, reason: "af export carries no features[] capability list — this af binary is too old for rk's live driver (needs the readiness/closure/dependencies capabilities); rebuild + reinstall af" };
  }
  const have = new Set(doc.features.map((f: unknown) => String(f)));
  const missing = REQUIRED_AF_FEATURES.filter((f) => !have.has(f));
  if (missing.length > 0) {
    return { ok: false, reason: `af export is missing required capabilities [${missing.join(", ")}] — this af binary is too old for rk's live driver; rebuild + reinstall af` };
  }
  return { ok: true };
}

/** EDGE (rk FU5): spawns one raw `af export --graph json --dir <abs>` and runs the capability/
 * version preflight on its output. A live run calls this ONCE at startup (via the injectable
 * `deps.preflightAf` seam) and refuses to run on a mismatch — an af that cannot spawn, exits
 * non-zero, or is too old to advertise the required capabilities fails LOUDLY here rather than
 * silently mis-driving a real-token run. Kept here (not in the CLI shard) so driver-af.ts owns every
 * af spawn and src/cli/verify-live.ts stays under the shard cap. */
export function preflightAfWorkspace(absWorkspace: string, afCommand: readonly string[] = ["af"]): { ok: true } | { ok: false; reason: string } {
  let proc: ReturnType<typeof Bun.spawnSync>;
  try {
    proc = Bun.spawnSync([...afCommand, "export", "--graph", "json", "--dir", absWorkspace]);
  } catch {
    return { ok: false, reason: "af binary unavailable for capability preflight" };
  }
  if (proc.exitCode !== 0) return { ok: false, reason: `af export exited ${proc.exitCode} during capability preflight` };
  return preflightAfExport(proc.stdout.toString());
}

/** Pure: parses `af verdicts apply --format json` stdout + the process exit code into an
 * `ApplyReport`. A body that will not parse but a known exit code (e.g. 3 file-invalid, which may
 * print to stderr) still yields a report carrying the exit — the driver never loses the code. */
export function parseVerdictReport(rawJson: string, exit: number): ApplyReport {
  let doc: any = {};
  try {
    doc = JSON.parse(rawJson);
  } catch {
    doc = {};
  }
  const items: VerdictItemOutcome[] = Array.isArray(doc.items)
    ? doc.items.map((i: any) => ({ node: String(i.node), verdict: String(i.verdict ?? ""), status: String(i.status ?? ""), detail: i.detail || undefined }))
    : [];
  return {
    exit,
    batchId: typeof doc.batch_id === "string" ? doc.batch_id : "",
    items,
    applied: typeof doc.applied === "number" ? doc.applied : 0,
    blocked: typeof doc.blocked === "number" ? doc.blocked : 0,
    rejected: typeof doc.rejected === "number" ? doc.rejected : 0,
    aborted: doc.aborted === true,
  };
}

/** EDGE: spawns `af export --graph json --dir <absWorkspace>`. Returns the parsed view or a reason. */
export function readAfWorkspace(absWorkspace: string, workspaceId: string, afCommand: readonly string[] = ["af"]): AfParseResult<AfWorkspaceView> {
  let proc: ReturnType<typeof Bun.spawnSync>;
  try {
    proc = Bun.spawnSync([...afCommand, "export", "--graph", "json", "--dir", absWorkspace]);
  } catch {
    return { ok: false, reason: "af binary unavailable on $PATH" };
  }
  if (proc.exitCode !== 0) {
    const stderr = proc.stderr.toString().trim();
    return { ok: false, reason: stderr.length > 0 ? stderr : `af export exited ${proc.exitCode}` };
  }
  return parseAfExport(proc.stdout.toString(), workspaceId);
}

/** Pure (rk B2/FU3): maps a prover's `ProofContent` to af `record-proof --children` JSON. Faithful
 * to ../vibefeld/cmd/af/refine.go's `childSpec`: keys are `statement`/`inference`/`depends` — a
 * ProofChild's `justification` maps to af's `inference` field, and per-child `depends` is now
 * carried through (af resolves a `#N` entry to the N-th earlier child in this batch, or an existing
 * node id — rk B2, no longer dropped). An empty `depends` is omitted. Separated out so the mapping
 * is unit-testable without spawning af. */
export function buildRecordProofChildren(proof: ProofContent): Array<{ statement: string; inference?: string; depends?: string[] }> {
  return proof.children.map((c) => {
    const child: { statement: string; inference?: string; depends?: string[] } = { statement: c.statement };
    if (c.justification) child.inference = c.justification;
    if (c.depends && c.depends.length > 0) child.depends = c.depends;
    return child;
  });
}

/** EDGE (rk-gn4 + B1 + B2 + FU3): records a prover turn's decomposition into af through the ATOMIC
 * `af record-proof` verb (../vibefeld/cmd/af/record_proof.go). In one af transition this: verifies
 * `nodeId` is still a prover job AND its content hash still equals `expectHash` (B1 — a proof
 * generated for bytes/role that changed mid-turn is REFUSED); creates the children WITH per-child
 * `depends` (B2); disposes the open blocking challenge(s); and releases the node (FU3 — so the
 * hand-off cycles instead of leaving the parent prover-claimed forever). Fail-closed and matching
 * the blocker-1 DISCARD posture: any non-zero af exit (a stale-role/stale-hash rejection included)
 * is a `{ok:false}` reason, never a partial record — the driver logs a skip and counts NO progress. */
export function recordProofRefine(absWorkspace: string, nodeId: string, owner: string, proof: ProofContent, expectHash?: string, afCommand: readonly string[] = ["af"]): RecordProofResult {
  const children = buildRecordProofChildren(proof);
  const args = [...afCommand, "record-proof", nodeId, "--owner", owner, "--children", JSON.stringify(children), "--format", "json", "--dir", absWorkspace];
  if (expectHash) args.push("--expect-hash", expectHash);
  const proc = Bun.spawnSync(args);
  if (proc.exitCode !== 0) {
    const stderr = proc.stderr.toString().trim();
    return { ok: false, reason: `af record-proof exit ${proc.exitCode}${stderr ? `: ${stderr}` : ""}` };
  }
  return { ok: true };
}

/** EDGE: writes `file` to a temp path under `absWorkspace`, spawns
 * `af verdicts apply <tmp> --format json --dir <absWorkspace>`, parses the report, and removes the
 * temp file. The batch's file order is trusted as-supplied (the driver composed it children-first). */
export function applyVerdictFile(absWorkspace: string, file: FilledVerdictFile, afCommand: readonly string[] = ["af"]): ApplyReport {
  const tmp = join(absWorkspace, `.rk-verdict-${file.batch_id || "batch"}.json`);
  writeFileSync(tmp, JSON.stringify(file, null, 2));
  try {
    const proc = Bun.spawnSync([...afCommand, "verdicts", "apply", tmp, "--format", "json", "--dir", absWorkspace]);
    return parseVerdictReport(proc.stdout.toString(), proc.exitCode ?? 1);
  } finally {
    try {
      rmSync(tmp);
    } catch {
      /* best-effort cleanup */
    }
  }
}
