// EDGE — fs. Split out of src/cli/verify-live.ts (rk-t9jm, shard-cap cut): the driverDeps
// ASSEMBLY job, as opposed to that file's PREFLIGHT job (backend/family resolution, the
// before-any-spend prints, ensureSession). Given the already-resolved verifier/prover/
// classification dispatchers, this module wraps the two dispatch hooks with the `--max-turns`/
// `--max-nodes` safety valves (`SafetyValveAbort` + `checkValves`), reads the durable balloon
// counter straight off the shard's own frontmatter (M3 blocker 7), tracks af's per-node `crux`
// flag, and assembles the `DriverDeps` object src/drive/driver-run.ts's loop actually drives
// against. `buildDriverDeps` never spends anything itself -- it only wires together dispatchers
// verify-live.ts already resolved -- so moving it here does not touch the zero-spend-before-
// preflight ordering src/cli/verify-live.ts's header documents.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RegistryNode } from "../graph/types";
import type { AfParseResult, AfWorkspaceView } from "../drive/driver-af";
import { applyVerdictFile } from "../drive/driver-af";
import type { DriverDeps, DispatchedTurn } from "../drive/driver-run";
import type { LiveRoleTierDispatcher } from "../drive/driver-live";
import { liveDispatchClassification, liveDispatchProve, liveDispatchVerify, liveRecordProof } from "../drive/driver-live";
import { encodeVerifierSeam, type VerifierIdentity } from "../drive/identity";
import { parseFrontmatter } from "../gates/snapshot";
import { readBalloonCounterFromFields } from "../drive/driver-balloon";
import type { ModelFamily } from "../drive/vocab";
import type { BudgetConfig } from "../drive/driver-guardrails";
import { appendDriverLog, createBdTaskEdge, writeParseFailure } from "./verify-live-io";

/** Thrown by `checkValves` -- caught in src/cli/verify-live.ts's own try/catch around
 * `runVerifyDriver`, so it stays a distinct, recognizable abort reason (never a generic throw). */
export class SafetyValveAbort extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

export interface BuildDriverDepsParams {
  root: string;
  abs: string;
  node: RegistryNode;
  claimId: string;
  maxTurns: number;
  maxNodes: number;
  budget: BudgetConfig;
  verifierDispatcher: LiveRoleTierDispatcher;
  proverDispatcher: LiveRoleTierDispatcher;
  /** `undefined` iff the classification session failed to resolve -- dispatchClassification then
   * degrades to a no-op, which `parseClassificationReview` rejects, so any balloon aborts
   * UNCLASSIFIED (counter still persisted, no class guessed: src/drive/driver-balloon-run.ts).
   * LB2: that degradation is REPORTED at preflight by src/cli/verify-live.ts
   * (`classificationUnavailableLines`) before any spend -- it is never discovered silently here. */
  classDispatcher: LiveRoleTierDispatcher | undefined;
  verifierFamily: ModelFamily;
  proverFamily: ModelFamily;
  model: string;
  proverModel: string;
  sessionId: string;
  loadBearing: boolean;
  /** The workspace read already done at preflight, so its `crux` flags seed `cruxAfNodes` before
   * the first `queryWorkspace` re-read. */
  initialWsResult: AfParseResult<AfWorkspaceView>;
  readWorkspace: (abs: string, workspaceId: string) => AfParseResult<AfWorkspaceView>;
  afCommand?: readonly string[];
}

export type BuildDriverDepsResult = { ok: true; driverDeps: DriverDeps } | { ok: false; message: string };

/** Assembles the `DriverDeps` record `runVerifyDriver` (src/drive/driver-run.ts) drives against,
 * given dispatchers/families/identity already resolved by verify-live.ts's preflight. Returns
 * `{ok:false}` only when the prover identity cannot be encoded as an af seam (an encoding failure,
 * not a spend failure -- still before the first real call). */
export function buildDriverDeps(p: BuildDriverDepsParams): BuildDriverDepsResult {
  let turnsUsed = 0;
  const nodesTouched = new Set<string>();
  function checkValves(nodeId: string): void {
    if (!nodesTouched.has(nodeId) && nodesTouched.size >= p.maxNodes) {
      throw new SafetyValveAbort(`max-nodes (${p.maxNodes}) reached`);
    }
    nodesTouched.add(nodeId);
    if (turnsUsed >= p.maxTurns) throw new SafetyValveAbort(`max-turns (${p.maxTurns}) reached`);
    turnsUsed++;
  }

  const rawDispatchVerify = liveDispatchVerify(p.verifierDispatcher, "hard");
  const dispatchVerify: DriverDeps["dispatchVerify"] = (n, allNodes): Promise<DispatchedTurn | undefined> => {
    checkValves(n.id);
    // GAP 10: forward the round's full node set so verifierItemFor can resolve n's declared
    // dependencies to their content for the verifier's context.
    return rawDispatchVerify(n, allNodes);
  };
  // rk-gn4: prover dispatch shares the SAME safety valves (a prover turn is a real spend too) and
  // the SAME campaign budget (enforced in the driver loop).
  const rawDispatchProve = liveDispatchProve(p.proverDispatcher);
  const dispatchProve: DriverDeps["dispatchProve"] = (n): Promise<DispatchedTurn | undefined> => {
    checkValves(n.id);
    return rawDispatchProve(n);
  };
  // The prover's identity seam, recorded as the af node author on refine (so the apply-time
  // cross-vendor rule can parse it against the verifier's seam). rk-9zd: the family comes from the
  // resolved prover BACKEND INSTANCE's own declared `modelFamily`, already validated against the
  // closed vocabulary by verify-live.ts's preflight -- never re-derived from its name.
  const proverIdentity: VerifierIdentity = { modelFamily: p.proverFamily, backend: p.proverDispatcher.backendName, model: p.proverModel, sessionId: `${p.claimId}-prover` };
  const proverSeam = encodeVerifierSeam(proverIdentity);
  if (!proverSeam.ok) {
    return { ok: false, message: `rk verify --af ${p.node.id} --live: prover identity is not encodable -- ${proverSeam.reason}` };
  }
  const recordProof = liveRecordProof(p.abs, proverSeam.value, p.afCommand);
  const dispatchClassification = p.classDispatcher ? liveDispatchClassification(p.classDispatcher) : async () => undefined;

  const identity: VerifierIdentity = { modelFamily: p.verifierFamily, backend: p.verifierDispatcher.backendName, model: p.model, sessionId: p.sessionId };

  // M3 blocker 7: the DURABLE balloon counter lives in the shard frontmatter the driver itself
  // writes (src/drive/driver-frontmatter.ts's applyBalloonMark), NOT in `node.balloons` -- the graph
  // projection currently hard-codes `balloons: 0` (src/graph/from-registry.ts). Read the counter
  // straight off the shard the driver persists to, falling back to the (currently-zero) projection
  // only when the shard itself cannot be read.
  const shardText = ((): string | undefined => { try { return readFileSync(join(p.root, p.node.path), "utf8"); } catch { return undefined; } })();
  const persistedBalloons = ((): { count: number; classifications: typeof p.node.balloons.classifications } => {
    if (shardText === undefined) return { count: p.node.balloons.count, classifications: p.node.balloons.classifications };
    const fm = parseFrontmatter(shardText);
    if (!fm.present || !fm.terminated) return { count: p.node.balloons.count, classifications: p.node.balloons.classifications };
    return readBalloonCounterFromFields(fm.fields);
  })();

  // rk-bun: af's OWN per-node `crux` flag (../vibefeld/docs/export-graph-v1.md), the ADDITIONAL,
  // strictly-stricter filter over the claim-level membership, never a way to relax it. Refreshed on
  // every `queryWorkspace`. Accumulating and never cleared is the fail-closed direction: a node ever
  // reported crux stays load-bearing even if a later export omits the flag.
  const cruxAfNodes = new Set<string>();
  const noteCrux = (r: AfParseResult<AfWorkspaceView>): AfParseResult<AfWorkspaceView> => {
    if (r.ok) for (const n of r.value.nodes) if (n.crux) cruxAfNodes.add(n.id);
    return r;
  };
  noteCrux(p.initialWsResult);

  const driverDeps: DriverDeps = {
    contractId: p.node.id,
    claimId: p.claimId,
    identity,
    queryWorkspace: () => noteCrux(p.readWorkspace(p.abs, p.node.workspace!)),
    // M3 blocker 1: re-read af's authoritative node hashes immediately before an apply -- a real
    // fresh `af export`, so a content edit during the model turn cannot validate unreviewed bytes.
    // A failed re-read yields an empty map, discarding every pending verdict (fail closed).
    reReadContentHashes: () => {
      const fresh = p.readWorkspace(p.abs, p.node.workspace!);
      return fresh.ok ? new Map(fresh.value.nodes.map((n) => [n.id, n.contentHash])) : new Map();
    },
    dispatchVerify,
    dispatchProve,
    recordProof,
    dispatchClassification,
    applyVerdicts: (file) => applyVerdictFile(p.abs, file, p.afCommand),
    // rk-bun: REAL membership. Two inputs, ORed so the answer can only get STRICTER than the
    // claim-level determination: (1) `p.loadBearing` -- is THIS registry claim on the path to the
    // configured north star (src/drive/cross-vendor.ts's `resolveLoadBearing`, resolved by
    // verify-live.ts's preflight); (2) `cruxAfNodes` -- af's own per-node marking.
    isLoadBearing: (afNodeId: string) => p.loadBearing || cruxAfNodes.has(afNodeId),
    readShard: () => {
      try {
        return readFileSync(join(p.root, p.node.path), "utf8");
      } catch {
        return undefined;
      }
    },
    writeShard: (content) => writeFileSync(join(p.root, p.node.path), content),
    createBdTask: createBdTaskEdge,
    appendLog: (line) => appendDriverLog(p.root, line),
    // rk-d1n: persist a parse/extraction failure's full raw output to `.rk/parse-failures/` so the
    // exact bytes are inspectable.
    writeParseFailure: (nodeId, rawText) => writeParseFailure(p.root, nodeId, rawText),
    now: () => new Date().toISOString(),
    priorBalloonCount: persistedBalloons.count,
    priorClassifications: persistedBalloons.classifications,
    // rk-s9t: the validated campaign token cap the driver enforces per-dispatch (fail closed at
    // verify-live.ts's preflight if the flag was absent, so this is always a real, positive ceiling).
    budget: p.budget,
  };

  return { ok: true, driverDeps };
}
