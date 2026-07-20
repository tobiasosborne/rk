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
  items: Array<{ node: string; verdict: "accept" | "challenge"; reason: string; target?: string; severity?: string; category?: string }>;
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
    // rk-gn4: af's OWN authoritative per-node job classification (vibefeld d4493c8,
    // ../vibefeld/internal/jobs via `af export --graph json`). `omitempty` on the af side means a
    // false flag is ABSENT from the JSON, so an absent key reads as `false` here. An OLD af that
    // predates these flags therefore reports every node not-ready → driver-plan.ts's readiness
    // dispatches nothing → the driver aborts root-unvalidated (fail closed, loud), never a
    // wrong-role dispatch on a guessed readiness.
    proverReady: n.prover_ready === true,
    verifierReady: n.verifier_ready === true,
  }));
  const root = doc.nodes.find((n: any) => String(n.id) === "1");
  const nodeCount = typeof doc.validation?.total_nodes === "number" ? doc.validation.total_nodes : nodes.length;
  return { ok: true, value: { workspaceId, rootStatement: root?.statement, nodes, nodeCount } };
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

/** EDGE (rk-gn4): records a prover turn's decomposition into af — the seam `DriverDeps.recordProof`
 * drives at the live edge. Claims `nodeId` as a PROVER, then `af refine`s it with the produced
 * children (which auto-releases the claim). Faithful to ../vibefeld/cmd/af/refine.go's `childSpec`:
 * the JSON child keys are `statement`/`type`/`inference` — a ProofChild's `justification` maps to
 * af's `inference` field; per-child `depends` has no --children JSON slot (af's `--depends` is a
 * whole-refine flag), so it is dropped here (a named live-seam limitation, not a silent guess — see
 * the bead). Fail-closed: any non-zero af exit is a `{ok:false}` reason, never a partial record. */
export function recordProofRefine(absWorkspace: string, nodeId: string, owner: string, proof: ProofContent, afCommand: readonly string[] = ["af"]): RecordProofResult {
  const claim = Bun.spawnSync([...afCommand, "claim", nodeId, "--owner", owner, "--role", "prover", "--format", "json", "--dir", absWorkspace]);
  if (claim.exitCode !== 0) {
    const stderr = claim.stderr.toString().trim();
    return { ok: false, reason: `af claim --role prover exit ${claim.exitCode}${stderr ? `: ${stderr}` : ""}` };
  }
  const children = proof.children.map((c) => (c.justification ? { statement: c.statement, inference: c.justification } : { statement: c.statement }));
  const refine = Bun.spawnSync([...afCommand, "refine", nodeId, "--owner", owner, "--children", JSON.stringify(children), "--format", "json", "--dir", absWorkspace]);
  if (refine.exitCode !== 0) {
    const stderr = refine.stderr.toString().trim();
    return { ok: false, reason: `af refine exit ${refine.exitCode}${stderr ? `: ${stderr}` : ""}` };
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
