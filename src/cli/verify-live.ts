// EDGE — fs + subprocess. M3.5-prep: the LIVE half of `rk verify --af <id> --live`
// (src/cli/verify.ts stays the thin arg-parsing dispatcher; this file is the actual wiring so
// verify.ts does not balloon past CLAUDE.md's ~200-line guidance). Builds the real backend
// registry (src/drive/backend-{claude,codex}.ts), resolves + creates the claim's live dispatcher
// (src/drive/driver-live.ts), prints the pre-flight summary BEFORE the first real call, wraps the
// two dispatch hooks with the `--max-turns`/`--max-nodes` safety valves, drives
// src/drive/driver-run.ts's real loop, and prints the M3.9 usage report at the end regardless of
// how the run finished (`reportCommand`, src/cli/verify-report.ts, reads the persisted
// `.rk/driver-log.jsonl` — durable even if the run aborted early).

import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { RegistryNode } from "../graph/types";
import { readAfWorkspace, applyVerdictFile, type AfParseResult, type AfWorkspaceView } from "../drive/driver-af";
import { runVerifyDriver, type DriverDeps, type DispatchedTurn } from "../drive/driver-run";
import { BackendRegistry, type WorkersConfig } from "../drive/backend-registry";
import type { WorkerBackend } from "../drive/backend-types";
import { ClaudeBackend } from "../drive/backend-claude";
import { CodexBackend } from "../drive/backend-codex";
import {
  createLiveDispatcher,
  describeMissingWorkersConfig,
  liveDispatchClassification,
  liveDispatchVerify,
  DEFAULT_MODEL_BY_BACKEND,
} from "../drive/driver-live";
import { buildSharedContext, type DefinitionText } from "../drive/driver-prompts";
import type { VerifierIdentity } from "../drive/identity";
import { loadSnapshot } from "../store/snapshot-load";
import { listDir, parseFrontmatter } from "../gates/snapshot";
import { loadGateConfig } from "../store/config-load";
import type { Out } from "./args";
// Type-only: no runtime binding from src/cli/verify.ts is imported here, so there is no runtime
// circular import between this file and verify.ts (which DOES import `runLiveVerify` from this
// file at runtime) -- src/cli/verify-report.ts is the shared, non-circular home for the printing
// logic both files actually call.
import type { VerifyCommandDeps } from "./verify";
import { reportCommand, driverLogPath } from "./verify-report";

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

/** Reads every `definitions/*.md` shard whose frontmatter `id:` is in `ids`, returning raw file
 * text keyed by id -- reuses the SAME snapshot/frontmatter primitives src/store/registry-load.ts
 * already relies on (never a second, forked frontmatter parser). */
function readDefinitionTexts(root: string, ids: readonly string[]): DefinitionText[] {
  const wanted = new Set(ids);
  if (wanted.size === 0) return [];
  const snapshot = loadSnapshot(root);
  const out: DefinitionText[] = [];
  for (const name of listDir(snapshot, "definitions")) {
    if (name === "README.md" || name === "INDEX.md") continue;
    const content = snapshot.get(`definitions/${name}`);
    if (content === undefined) continue;
    const fm = parseFrontmatter(content);
    if (fm.present && fm.terminated && fm.fields.id && wanted.has(fm.fields.id)) out.push({ id: fm.fields.id, text: content });
  }
  return out;
}

function appendDriverLog(root: string, line: string): void {
  mkdirSync(join(root, ".rk"), { recursive: true });
  appendFileSync(driverLogPath(root), `${line}\n`);
}

/** `bd create <title> -d <description>` -- best-effort, exactly the `which`/spawn discipline
 * src/cli/init.ts's own bd bootstrap uses. Returns false (never throws) when bd is absent or the
 * spawn fails -- src/drive/driver-run.ts already logs a loud, non-fatal skip for that case. */
function createBdTaskEdge(task: { title: string; description: string }): boolean {
  if (!Bun.which("bd")) return false;
  try {
    const proc = Bun.spawnSync(["bd", "create", task.title, "-d", task.description]);
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

export interface LiveRunOptions {
  maxTurns: number;
  maxNodes: number;
  model?: string;
}

async function defaultLoadWorkersConfig(root: string): Promise<WorkersConfig | undefined> {
  return (await loadGateConfig(root)).workers;
}

/** `rk verify --af <id> --live`: drives `node`'s workspace to convergence with REAL backend calls
 * (or fails loudly before the first one, per the task's own gate). Returns the process exit code.
 * `deps.loadWorkersConfig` (src/cli/verify.ts's `VerifyCommandDeps`) is the one injectable seam a
 * test needs -- everything else here is either pure (src/drive/driver-live.ts, driver-prompts.ts)
 * or driven off a FAKE `WorkerBackend` reachable only through the registry that config builds. */
export async function runLiveVerify(root: string, node: RegistryNode, out: Out, deps: VerifyCommandDeps, opts: LiveRunOptions): Promise<number> {
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
  const resolvedBackend = registry.resolve("verifier", "hard");
  const claimId = `claim-${node.id}`;

  const defsText = readDefinitionTexts(root, node.defs);
  const sharedContext = buildSharedContext({ conjecture: wsResult.value.rootStatement ?? node.contract, definitions: defsText, contractGuidance: HARD_TIER_GUIDANCE });
  const model = opts.model ?? (resolvedBackend ? DEFAULT_MODEL_BY_BACKEND[resolvedBackend.name] ?? resolvedBackend.name : "unknown");

  const created = createLiveDispatcher({ registry, role: "verifier", tier: "hard", claimId, model, sharedContext });
  if (!created.ok) {
    out.log(created.reason);
    return 1;
  }
  // The classification turn is rare (only fires on a balloon tripwire) and gets its OWN session
  // (a different tier -- l5, "cheap" -- is a different isolation tuple than the hard-tier verify
  // session above), but still benefits from knowing the conjecture, so it reuses the SAME
  // sharedContext rather than an empty one.
  const classCreated = createLiveDispatcher({ registry, role: "verifier", tier: "l5", claimId: `${claimId}-balloon`, model, sharedContext });

  out.log(`rk verify --af ${node.id} --live: preflight`);
  out.log(`  backend resolved: verifier/hard -> '${created.dispatcher.backendName}' (model '${model}')`);
  out.log(`  session plan: ONE shared session for claim '${claimId}' (turn 1 = shared context, every node after = a resume turn)`);
  out.log(`  workspace: ${node.workspace} (${wsResult.value.nodeCount} node(s) total)`);
  out.log(`  estimated turn count: <= ${Math.min(opts.maxTurns, wsResult.value.nodeCount)} (bounded by --max-turns ${opts.maxTurns} and --max-nodes ${opts.maxNodes})`);
  out.log("  no worker has been called yet -- the next line, if any, is the first real call.");

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
  const dispatchVerify: DriverDeps["dispatchVerify"] = (n): Promise<DispatchedTurn | undefined> => {
    checkValves(n.id);
    return rawDispatchVerify(n);
  };
  const dispatchClassification = classCreated.ok ? liveDispatchClassification(classCreated.dispatcher) : async () => undefined;

  const identity: VerifierIdentity = { modelFamily: created.dispatcher.backendName === "codex" ? "gpt" : "claude", backend: created.dispatcher.backendName, model, sessionId: ensured.sessionId };

  const driverDeps: DriverDeps = {
    contractId: node.id,
    claimId,
    identity,
    queryWorkspace: () => readWorkspace(abs, node.workspace!),
    dispatchVerify,
    dispatchClassification,
    applyVerdicts: (file) => applyVerdictFile(abs, file, deps.afCommand),
    // Merge reconciliation (M3.8 cross-vendor rule + M3.5 live wiring): DriverDeps.isLoadBearing
    // is required (PRD C9, apply-time cross-vendor half). The live CLI does not yet compute a
    // critical path here, so use M3.8's documented strict default for a caller with no graph/
    // north-star available: () => true — treat every node as load-bearing, enforcing cross-vendor
    // on all accepts. (`() => false` would opt out of the rule, a validity regression.)
    isLoadBearing: () => true,
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
    now: () => new Date().toISOString(),
    priorBalloonCount: node.balloons.count,
    priorClassifications: node.balloons.classifications,
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
