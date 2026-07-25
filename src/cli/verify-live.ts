// EDGE — fs + subprocess. M3.5-prep: the LIVE half of `rk verify --af <id> --live`
// (src/cli/verify.ts stays the thin arg-parsing dispatcher; this file is the actual wiring so
// verify.ts does not balloon past CLAUDE.md's ~200-line guidance). Builds the real backend
// registry (src/drive/backend-{claude,codex}.ts), resolves + creates the claim's live dispatcher
// (src/drive/driver-live.ts), prints the pre-flight summary BEFORE the first real call, wraps the
// two dispatch hooks with the `--max-turns`/`--max-nodes` safety valves, drives
// src/drive/driver-run.ts's real loop, and prints the M3.9 usage report at the end regardless of
// how the run finished (`reportCommand`, src/cli/verify-report.ts, reads the persisted
// `.rk/driver-log.jsonl` — durable even if the run aborted early).

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphDocument, RegistryNode } from "../graph/types";
import { crossVendorPreflightLines, describeLoadBearing, resolveLoadBearing } from "../drive/cross-vendor";
import { readAfWorkspace, applyVerdictFile, preflightAfWorkspace, type AfParseResult, type AfWorkspaceView } from "../drive/driver-af";
import { runVerifyDriver, type DriverDeps, type DispatchedTurn } from "../drive/driver-run";
import { BackendRegistry, type WorkersConfig } from "../drive/backend-registry";
import type { WorkerBackend } from "../drive/backend-types";
import { ClaudeBackend } from "../drive/backend-claude";
import { CodexBackend } from "../drive/backend-codex";
import {
  createLiveDispatcher,
  describeMissingWorkersConfig,
  familyForBackend,
  liveDispatchClassification,
  liveDispatchProve,
  liveDispatchVerify,
  liveRecordProof,
  resolveModel,
} from "../drive/driver-live";
import { encodeVerifierSeam } from "../drive/identity";
import { parseCampaignBudget } from "./verify-live-budget";
import { buildSharedContext } from "../drive/driver-prompts";
import { readBalloonCounterFromFields } from "../drive/driver-balloon";
import type { VerifierIdentity } from "../drive/identity";
import { parseFrontmatter } from "../gates/snapshot";
import { loadGateConfig } from "../store/config-load";
import type { Out } from "./args";
// Type-only: no runtime binding from src/cli/verify.ts is imported here, so there is no runtime
// circular import between this file and verify.ts (which DOES import `runLiveVerify` from this
// file at runtime) -- src/cli/verify-report.ts is the shared, non-circular home for the printing
// logic both files actually call.
import type { VerifyCommandDeps } from "./verify";
import { reportCommand } from "./verify-report";
import { appendDriverLog, createBdTaskEdge, readDefinitionTexts, writeParseFailure } from "./verify-live-io";

export const DEFAULT_MAX_TURNS = 30;
// Distinct from, and deliberately below, driver-balloon.ts's own DEFAULT_BALLOON_NODE_CAP (40) --
// a live run's OWN safety valve should trip well before the balloon tripwire has a chance to.
export const DEFAULT_MAX_NODES = 20;

const HARD_TIER_GUIDANCE =
  "You are acting as an independent verifier in a bottom-up proof-checking pipeline. Judge each " +
  "node strictly on its own merits against its own stated dependencies; you are not asked to " +
  "improve, rewrite, or extend the proof.";

class SafetyValveAbort extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

export interface LiveRunOptions {
  maxTurns: number;
  maxNodes: number;
  /** rk-bun: the projection src/cli/verify.ts already built and validated as structurally complete
   * — critical-path membership is computed over the SAME document, never a second projection. */
  doc: GraphDocument;
  /** rk-bun: the raw `--north-star` flag value (absent → `.rk/config.json`'s `northStarId`). No
   * default is ever invented; an unresolvable north star fails CLOSED and says so at preflight. */
  northStarId?: string;
  /** rk-s9t: the raw `--max-campaign-tokens` flag value (undefined = flag absent). A `--live` run
   * REFUSES to start unless this parses to a positive integer (src/cli/verify-live-budget.ts) --
   * the fail-closed spend guard the M3 milestone review named (a real-token run with no ceiling is
   * the exact hole). */
  maxCampaignTokensRaw?: string;
  model?: string;
}

async function defaultLoadWorkersConfig(root: string): Promise<WorkersConfig | undefined> {
  return (await loadGateConfig(root)).workers;
}

/** rk-bun: the same `.rk/config.json` field `rk graph --critical-path` reads (src/cli/graph.ts's
 * `resolveNorthStar`). Absent is a legitimate state, reported at preflight and failed closed. */
async function defaultLoadNorthStarId(root: string): Promise<string | undefined> {
  return (await loadGateConfig(root)).northStarId;
}

/** `rk verify --af <id> --live`: drives `node`'s workspace to convergence with REAL backend calls
 * (or fails loudly before the first one, per the task's own gate). Returns the process exit code.
 * `deps.loadWorkersConfig` (src/cli/verify.ts's `VerifyCommandDeps`) is the one injectable seam a
 * test needs -- everything else here is either pure (src/drive/driver-live.ts, driver-prompts.ts)
 * or driven off a FAKE `WorkerBackend` reachable only through the registry that config builds. */
export async function runLiveVerify(root: string, node: RegistryNode, out: Out, deps: VerifyCommandDeps, opts: LiveRunOptions): Promise<number> {
  // rk-s9t: fail closed on the spend guard FIRST -- before reading the workspace, building the
  // registry, or making any backend call. A `--live` run with no campaign token cap must never
  // start (the exact hole the M3 milestone review named).
  const budgetResult = parseCampaignBudget(opts.maxCampaignTokensRaw);
  if (!budgetResult.ok) {
    out.log(budgetResult.message);
    return 1;
  }
  const budget = budgetResult.budget;

  if (!node.workspace) {
    out.log(`rk verify --af --live: node '${node.id}' declares no 'workspace:' -- nothing to verify.`);
    return 1;
  }
  const abs = join(root, ...node.workspace.split("/"));
  const readWorkspace = deps.readWorkspace ?? ((a: string, id: string) => readAfWorkspace(a, id, deps.afCommand));
  const wsResult: AfParseResult<AfWorkspaceView> = readWorkspace(abs, node.workspace);
  if (!wsResult.ok) {
    out.log(`rk verify --af --live: could not read af workspace '${node.workspace}': ${wsResult.reason}`);
    return 1;
  }

  const loadWorkersConfig = deps.loadWorkersConfig ?? defaultLoadWorkersConfig;
  const workers = await loadWorkersConfig(root);
  if (!workers) {
    out.log(describeMissingWorkersConfig("verifier", "hard"));
    return 1;
  }

  const registry = new BackendRegistry<WorkerBackend>(workers, deps.backends ?? [new ClaudeBackend(), new CodexBackend()]);
  const claimId = `claim-${node.id}`;

  const defsText = readDefinitionTexts(root, node.defs);
  const sharedContext = buildSharedContext({ conjecture: wsResult.value.rootStatement ?? node.contract, definitions: defsText, contractGuidance: HARD_TIER_GUIDANCE });
  // rk-7hi: config's per-assignment model > global --model > default (driver-live.ts's resolveModel).
  const model = resolveModel(registry, "verifier", "hard", opts.model);

  const created = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId, model, sharedContext });
  if (!created.ok) {
    out.log(created.reason);
    return 1;
  }
  // rk-gn4: the PROVER dispatcher — its OWN session (role "prover", hard tier, distinct claim id), so
  // the adversarial "no agent plays both roles" invariant holds at the session level (../vibefeld
  // Law 2). A `--live` run REFUSES to start without a prover backend too: a workspace with any
  // prover-ready node needs one, and starting a spend that cannot make prover progress is the exact
  // half-wired hole rk-gn4 fixes. The prover may use a different backend/model than the verifier.
  const proverModel = resolveModel(registry, "prover", "hard", opts.model);
  const proverCreated = createLiveDispatcher({ registry, role: "prover", tier: "hard", claimId: `${claimId}-prover`, model: proverModel, sharedContext });
  if (!proverCreated.ok) {
    out.log(proverCreated.reason);
    return 1;
  }
  // The classification turn is rare (only fires on a balloon tripwire) and gets its OWN session
  // (a different tier -- l5, "cheap" -- is a different isolation tuple than the hard-tier verify
  // session above), but still benefits from knowing the conjecture, so it reuses the SAME
  // sharedContext rather than an empty one.
  const classCreated = createLiveDispatcher({ registry, role: "verifier", tier: "l5", claimId: `${claimId}-balloon`, model, sharedContext });

  // rk-9zd (Tier A, cross-vendor input): resolve BOTH sides' model families from the RESOLVED
  // BACKEND INSTANCES' own registry-declared `modelFamily` — never re-derived from a backend name
  // string, which is what used to fail OPEN (any name != "codex" silently became family "claude").
  // Done HERE, before the af preflight and before `ensureSession`, so an unresolvable family aborts
  // the run with ZERO spend: a run that cannot establish both families cannot honestly apply PRD
  // C9's cross-vendor check to any accept it would produce, so it must not start.
  const verifierFamily = familyForBackend(created.dispatcher.backendName, created.dispatcher.declaredModelFamily);
  if (!verifierFamily.ok) {
    out.log(`rk verify --af ${node.id} --live: verifier backend family unresolvable -- ${verifierFamily.reason}`);
    return 1;
  }
  const proverFamily = familyForBackend(proverCreated.dispatcher.backendName, proverCreated.dispatcher.declaredModelFamily);
  if (!proverFamily.ok) {
    out.log(`rk verify --af ${node.id} --live: prover backend family unresolvable -- ${proverFamily.reason}`);
    return 1;
  }

  // rk-bun (Tier A): REAL critical-path membership, replacing the hard-coded `isLoadBearing: () =>
  // true`. Uses the same `computeCriticalPath` query src/drive/batch-eligibility.ts screens with, so
  // the two enforcement points cannot disagree about what "on the path" means. An unresolvable north
  // star (today's common case) fails CLOSED and is printed as INDETERMINATE, never silently assumed.
  const northStarId = opts.northStarId ?? (await (deps.loadNorthStarId ?? defaultLoadNorthStarId)(root));
  const membership = resolveLoadBearing(opts.doc, northStarId, node.id);

  out.log(`rk verify --af ${node.id} --live: preflight`);
  out.log(`  backend resolved: verifier/hard -> '${created.dispatcher.backendName}' (model '${model}', family '${verifierFamily.family}')`);
  out.log(`  backend resolved: prover/hard -> '${proverCreated.dispatcher.backendName}' (model '${proverModel}', family '${proverFamily.family}')`);
  out.log(`  ${describeLoadBearing(membership)}`);
  // rk-id1: the single-vendor consequence, stated BEFORE any spend. Weakens nothing — it is the tool
  // saying what its own rule already implies for this roster.
  for (const line of crossVendorPreflightLines(proverFamily.family, verifierFamily.family, membership.loadBearing)) out.log(`  ${line}`);
  out.log(`  session plan: ONE shared verifier session for claim '${claimId}' + ONE prover session '${claimId}-prover' (per-node prove-then-verify; turn 1 = shared context, every node after = a resume turn)`);
  out.log(`  workspace: ${node.workspace} (${wsResult.value.nodeCount} node(s) total)`);
  out.log(`  estimated turn count: <= ${Math.min(opts.maxTurns, wsResult.value.nodeCount)} (bounded by --max-turns ${opts.maxTurns} and --max-nodes ${opts.maxNodes})`);
  out.log(`  campaign token cap: ${budget.maxCampaignTokens} total tokens (input+output+cache across all turns) -- the run ABORTS before any call it cannot afford (per-call reserve ${budget.perCallReserve}).`);
  out.log("  no worker has been called yet -- the next line, if any, is the first real call.");

  // rk FU5: af capability/version preflight — the LAST gate before the first real model call. An af
  // too old to emit the readiness/closure/dependencies flags reads as "nothing ready" → a false
  // root-unvalidated; fail LOUDLY. Injectable like readWorkspace (default: driver-af preflightAfWorkspace).
  const pf = (deps.preflightAf ?? ((a: string) => preflightAfWorkspace(a, deps.afCommand)))(abs);
  if (!pf.ok) { out.log(`rk verify --af ${node.id} --live: af capability preflight failed — ${pf.reason}`); return 1; }

  const ensured = await created.dispatcher.ensureSession();
  if (!ensured.ok) {
    out.log(`rk verify --af ${node.id} --live: session creation failed -- ${ensured.error}`);
    return 1;
  }

  let turnsUsed = 0;
  const nodesTouched = new Set<string>();
  function checkValves(nodeId: string): void {
    if (!nodesTouched.has(nodeId) && nodesTouched.size >= opts.maxNodes) {
      throw new SafetyValveAbort(`max-nodes (${opts.maxNodes}) reached`);
    }
    nodesTouched.add(nodeId);
    if (turnsUsed >= opts.maxTurns) throw new SafetyValveAbort(`max-turns (${opts.maxTurns}) reached`);
    turnsUsed++;
  }

  const rawDispatchVerify = liveDispatchVerify(created.dispatcher, "hard");
  const dispatchVerify: DriverDeps["dispatchVerify"] = (n, allNodes): Promise<DispatchedTurn | undefined> => {
    checkValves(n.id);
    // GAP 10: forward the round's full node set so verifierItemFor can resolve n's declared
    // dependencies to their content for the verifier's context.
    return rawDispatchVerify(n, allNodes);
  };
  // rk-gn4: prover dispatch shares the SAME safety valves (a prover turn is a real spend too) and the
  // SAME campaign budget (enforced in the driver loop). The prover session is created lazily on its
  // first dispatch (createLiveDispatcher's ensureSession), so a workspace with no prover-ready node
  // never opens it.
  const rawDispatchProve = liveDispatchProve(proverCreated.dispatcher);
  const dispatchProve: DriverDeps["dispatchProve"] = (n): Promise<DispatchedTurn | undefined> => {
    checkValves(n.id);
    return rawDispatchProve(n);
  };
  // The prover's identity seam, recorded as the af node author on refine (so the apply-time
  // cross-vendor rule can parse it against the verifier's seam). rk-9zd: the family comes from the
  // resolved prover BACKEND INSTANCE's own declared `modelFamily`, already validated against the
  // closed vocabulary above — never re-derived from its name.
  const proverIdentity: VerifierIdentity = { modelFamily: proverFamily.family, backend: proverCreated.dispatcher.backendName, model: proverModel, sessionId: `${claimId}-prover` };
  const proverSeam = encodeVerifierSeam(proverIdentity);
  if (!proverSeam.ok) {
    out.log(`rk verify --af ${node.id} --live: prover identity is not encodable -- ${proverSeam.reason}`);
    return 1;
  }
  const recordProof = liveRecordProof(abs, proverSeam.value, deps.afCommand);
  const dispatchClassification = classCreated.ok ? liveDispatchClassification(classCreated.dispatcher) : async () => undefined;

  const identity: VerifierIdentity = { modelFamily: verifierFamily.family, backend: created.dispatcher.backendName, model, sessionId: ensured.sessionId };

  // M3 blocker 7: the DURABLE balloon counter lives in the shard frontmatter the driver itself
  // writes (src/drive/driver-frontmatter.ts's applyBalloonMark), NOT in `node.balloons` — the graph
  // projection currently hard-codes `balloons: 0` (src/graph/from-registry.ts; see the repair-wave
  // coordination note on threading it into the graph/board), so reading `node.balloons` would leave
  // every balloon "first" forever and never escalate a repeat to mandatory-review. Read the counter
  // straight off the shard the driver persists to, falling back to the (currently-zero) projection
  // only when the shard itself cannot be read.
  const shardText = ((): string | undefined => { try { return readFileSync(join(root, node.path), "utf8"); } catch { return undefined; } })();
  const persistedBalloons = ((): { count: number; classifications: typeof node.balloons.classifications } => {
    if (shardText === undefined) return { count: node.balloons.count, classifications: node.balloons.classifications };
    const fm = parseFrontmatter(shardText);
    if (!fm.present || !fm.terminated) return { count: node.balloons.count, classifications: node.balloons.classifications };
    return readBalloonCounterFromFields(fm.fields);
  })();

  // rk-bun: af's OWN per-node `crux` flag (../vibefeld/docs/export-graph-v1.md: "True if the node is
  // marked critical-path") — the ADDITIONAL, strictly-stricter filter over the claim-level
  // membership above, never a way to relax it. Refreshed on every `queryWorkspace` (the driver
  // re-queries at the top of each round, before any verify dispatch), so a crux node the prover adds
  // mid-run is seen in the same round. Accumulating and never cleared is the fail-closed direction:
  // a node ever reported crux stays load-bearing even if a later export omits the flag.
  const cruxAfNodes = new Set<string>();
  const noteCrux = (r: AfParseResult<AfWorkspaceView>): AfParseResult<AfWorkspaceView> => {
    if (r.ok) for (const n of r.value.nodes) if (n.crux) cruxAfNodes.add(n.id);
    return r;
  };
  noteCrux(wsResult);

  const driverDeps: DriverDeps = {
    contractId: node.id,
    claimId,
    identity,
    queryWorkspace: () => noteCrux(readWorkspace(abs, node.workspace!)),
    // M3 blocker 1: re-read af's authoritative node hashes immediately before an apply — a real
    // fresh `af export`, so a content edit during the model turn cannot validate unreviewed bytes.
    // A failed re-read yields an empty map, discarding every pending verdict (fail closed).
    reReadContentHashes: () => {
      const fresh = readWorkspace(abs, node.workspace!);
      return fresh.ok ? new Map(fresh.value.nodes.map((n) => [n.id, n.contentHash])) : new Map();
    },
    dispatchVerify,
    dispatchProve,
    recordProof,
    dispatchClassification,
    applyVerdicts: (file) => applyVerdictFile(abs, file, deps.afCommand),
    // rk-bun: REAL membership, replacing the `() => true` merge reconciliation e69efd9 left behind.
    // Two inputs, ORed so the answer can only get STRICTER than the claim-level determination:
    // (1) `membership.loadBearing` — is THIS registry claim on the path to the configured north star
    //     (src/drive/cross-vendor.ts's `resolveLoadBearing`); every indeterminate answer is `true`,
    //     printed as INDETERMINATE at preflight; (2) `cruxAfNodes` — af's own per-node marking.
    // The permissive branch is reachable ONLY when: a north star is configured AND resolves, the
    // claim is in the graph, it is reachable from the north star by no dep/route path at all, and af
    // did not mark this node crux. That is exactly PRD C9's "Non-critical-path: same-family allowed,
    // recorded" case, and nothing weaker.
    isLoadBearing: (afNodeId: string) => membership.loadBearing || cruxAfNodes.has(afNodeId),
    readShard: () => {
      try {
        return readFileSync(join(root, node.path), "utf8");
      } catch {
        return undefined;
      }
    },
    writeShard: (content) => writeFileSync(join(root, node.path), content),
    createBdTask: createBdTaskEdge,
    appendLog: (line) => appendDriverLog(root, line),
    // rk-d1n: persist a parse/extraction failure's full raw output to `.rk/parse-failures/` so the
    // exact bytes (an unterminated verbose reason, the attempt-11 exit-12 deaths) are inspectable.
    writeParseFailure: (nodeId, rawText) => writeParseFailure(root, nodeId, rawText),
    now: () => new Date().toISOString(),
    priorBalloonCount: persistedBalloons.count,
    priorClassifications: persistedBalloons.classifications,
    // rk-s9t: the validated campaign token cap the driver enforces per-dispatch (fail closed above
    // if the flag was absent, so this is always a real, positive ceiling by the time we get here).
    budget,
  };

  let code: number;
  try {
    const result = await runVerifyDriver(driverDeps);
    out.log(`rk verify --af ${node.id} --live: ${result.status} -- ${result.message}`);
    out.log(`  applied ${result.appliedNodeIds.length} node(s): ${result.appliedNodeIds.join(", ") || "none"}`);
    code = result.status === "converged" ? 0 : 4;
  } catch (e) {
    if (e instanceof SafetyValveAbort) {
      out.log(`rk verify --af ${node.id} --live: ABORTED (safety valve) -- ${e.reason}`);
      out.log("  any node(s) already applied before this point are durable on the af ledger and in .rk/driver-log.jsonl.");
      code = 4;
    } else {
      throw e;
    }
  }

  out.log("");
  out.log(`rk verify --af ${node.id} --live: final accounting (rk verify --report)`);
  reportCommand(root, out, undefined);
  return code;
}
