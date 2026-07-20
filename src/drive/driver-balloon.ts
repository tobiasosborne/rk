// PURITY: pure — no fs/network/clock (L3). M3.6's distinctive piece: the balloon feedback loop's
// DECISION CORE (PRD C9's "ballooning as an epistemic signal, not just an abort"). Every routing
// choice, event shape, and log line is computed here as a pure function of caller-supplied data;
// the impure side (spawning the classification worker turn, `bd create`, the frontmatter EDGE write,
// appending to .rk/driver-log.jsonl) lives in src/drive/driver-run.ts and its edges. This module
// decides WHAT must happen; those edges DO it.
//
// The BalloonClassification vocabulary is imported from src/graph/types.ts (read-only) — the ONE
// place it is defined (`BALLOON_CLASSIFICATIONS`), so the driver, the graph schema, and the linker's
// board can never drift on the three classes. `RegistryNode.balloons` (BalloonCounter) is the same
// reserved counter this loop populates; the frontmatter EDGE (src/drive/driver-frontmatter.ts) is
// what serializes it back onto the shard so the linker surfaces the flag.

import { BALLOON_CLASSIFICATIONS, type BalloonClassification } from "../graph/types";

export const DEFAULT_BALLOON_NODE_CAP = 40;

const CLASSIFICATION_SET = new Set<BalloonClassification>(BALLOON_CLASSIFICATIONS);

// --- Tripwire ---------------------------------------------------------------------------------

/** The node-count tripwire. A workspace whose live node count exceeds `cap` has ballooned — its
 * proof tree grew past the point where continued decomposition is more likely a symptom of a
 * mis-stated contract than of genuine depth (PRD C9). Returns the boolean plus the observed count so
 * the caller never re-reads it from a different source than the one that fired the wire. */
export function detectBalloon(nodeCount: number, cap: number = DEFAULT_BALLOON_NODE_CAP): { ballooned: boolean; nodeCount: number; cap: number } {
  return { ballooned: nodeCount > cap, nodeCount, cap };
}

/** M3 blocker 7 (durable repeat-balloon detection): reads a persisted balloon counter back out of a
 * registry shard's parsed frontmatter fields — the SAME fields src/drive/driver-frontmatter.ts's
 * `applyBalloonMark` writes (`balloons:` scalar count + a `balloon_classifications:` block list,
 * which src/gates/snapshot.ts's `parseFrontmatter` surfaces as a "; "-joined string). This is the
 * read half of the persist/read-back loop that makes a repeat balloon detectable across runs: the
 * driver persists via `applyBalloonMark`, the CLI reads it back through here to set
 * `priorBalloonCount`/`priorClassifications`. A missing/blank/non-numeric count degrades to 0 and an
 * unrecognized classification token is dropped — never guessed, never a throw. */
export function readBalloonCounterFromFields(fields: Record<string, string | undefined>): { count: number; classifications: BalloonClassification[] } {
  const rawCount = fields.balloons;
  const count = rawCount !== undefined && /^\d+$/.test(rawCount.trim()) ? Number.parseInt(rawCount.trim(), 10) : 0;
  const rawList = fields.balloon_classifications ?? "";
  const classifications = rawList
    .split(";")
    .map((s) => s.trim())
    .filter((s): s is BalloonClassification => CLASSIFICATION_SET.has(s as BalloonClassification));
  return { count, classifications };
}

// --- Classification (from a real verifier-role review turn over the offending subtree) ---------

export interface ClassificationReview {
  classification: BalloonClassification;
  rationale: string;
}

export type ClassificationParseResult =
  | { ok: true; review: ClassificationReview }
  | { ok: false; reason: string };

/** Parses the classification-worker turn's output. The classification is NEVER guessed by the
 * driver — it comes from a real dispatch (a verifier-role worker over the offending subtree, cheap
 * tier) whose structured output this validates. A missing/unknown classification is a hard parse
 * failure the caller must surface (never a silent default to one class), exactly as the worker
 * contract treats an unparseable verdict. */
export function parseClassificationReview(parsed: unknown): ClassificationParseResult {
  if (parsed === null || typeof parsed !== "object") {
    return { ok: false, reason: "classification review output is not a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;
  const classification = obj.classification;
  if (typeof classification !== "string" || !CLASSIFICATION_SET.has(classification as BalloonClassification)) {
    return { ok: false, reason: `classification must be one of ${[...CLASSIFICATION_SET].join(", ")}, got ${JSON.stringify(classification)}` };
  }
  const rationale = obj.rationale;
  if (typeof rationale !== "string" || rationale.trim().length === 0) {
    return { ok: false, reason: "classification review must carry a non-blank 'rationale'" };
  }
  return { ok: true, review: { classification: classification as BalloonClassification, rationale } };
}

// --- Routing ----------------------------------------------------------------------------------

/** Where a balloon routes (PRD C9's exact table):
 * - `bd-provision`  — missing-fact → a definition/assumption provisioning bd task.
 * - `bd-factoring`  — dag-dep → a factoring bd task.
 * - `mandatory-review` — genuine-gap, OR a REPEAT balloon on the same contract regardless of
 *   classification: the hypotheses are suspect, the shard is marked, the linker surfaces it. */
export type BalloonRouting = "bd-provision" | "bd-factoring" | "mandatory-review";

/** THE routing decision. `priorBalloonCount` is how many times THIS contract has ALREADY ballooned
 * before this event (0 on the first ever balloon). A repeat balloon (`priorBalloonCount >= 1`) is
 * ALWAYS mandatory-review — the "repeat balloon on the same contract" clause outranks the
 * per-classification routing, because a contract that balloons twice is itself the suspect, whatever
 * this particular subtree's local classification says. */
export function routeBalloon(classification: BalloonClassification, priorBalloonCount: number): BalloonRouting {
  if (priorBalloonCount >= 1) return "mandatory-review";
  if (classification === "genuine-gap") return "mandatory-review";
  if (classification === "dag-dep") return "bd-factoring";
  return "bd-provision"; // missing-fact
}

/** True iff this routing mandates writing the `balloons:` mark into the registry shard's
 * frontmatter (mandatory-contract-review state — genuine-gap or repeat). The bd-task routings do
 * NOT mark the shard; they file a provisioning/factoring task instead. The frontmatter mark and the
 * driver-log append are separate obligations (see the event/log builders below). */
export function routingMarksShard(routing: BalloonRouting): boolean {
  return routing === "mandatory-review";
}

// --- Structured event + log line --------------------------------------------------------------

/** The structured balloon event PRD C9 mandates: {contract id, node count, classification, offending
 * subtree}, plus the driver-computed routing/priorCount so the append-only log is a complete record
 * of the decision, not just its inputs. */
export interface BalloonEvent {
  contractId: string;
  nodeCount: number;
  cap: number;
  classification: BalloonClassification;
  /** The node ids of the offending subtree the classification turn reviewed. */
  offendingSubtree: string[];
  priorBalloonCount: number;
  routing: BalloonRouting;
  rationale: string;
}

export function buildBalloonEvent(input: {
  contractId: string;
  nodeCount: number;
  cap: number;
  review: ClassificationReview;
  offendingSubtree: string[];
  priorBalloonCount: number;
}): BalloonEvent {
  return {
    contractId: input.contractId,
    nodeCount: input.nodeCount,
    cap: input.cap,
    classification: input.review.classification,
    offendingSubtree: [...input.offendingSubtree].sort(),
    priorBalloonCount: input.priorBalloonCount,
    routing: routeBalloon(input.review.classification, input.priorBalloonCount),
    rationale: input.review.rationale,
  };
}

/** One append-only JSONL line for .rk/driver-log.jsonl. `at` is a caller-supplied ISO timestamp
 * (this pure module never reads a clock — L3); the driver's edge stamps it. Deterministic key
 * order via an explicit object literal so a log-diff test sees stable bytes. */
export function balloonLogLine(event: BalloonEvent, at: string): string {
  return JSON.stringify({
    kind: "balloon",
    at,
    contractId: event.contractId,
    nodeCount: event.nodeCount,
    cap: event.cap,
    classification: event.classification,
    routing: event.routing,
    priorBalloonCount: event.priorBalloonCount,
    offendingSubtree: event.offendingSubtree,
    rationale: event.rationale,
  });
}

/** The templated bd task an event routes to (bd-provision / bd-factoring). Pure content only — the
 * `bd create` spawn is an edge (src/drive/driver-run.ts), which skips loudly if bd is absent. */
export function balloonBdTask(event: BalloonEvent): { title: string; description: string } {
  const kind = event.routing === "bd-factoring" ? "factoring" : "assumption/definition provisioning";
  return {
    title: `[balloon:${event.classification}] ${kind} for contract ${event.contractId}`,
    description:
      `Balloon tripwire fired on contract '${event.contractId}': ${event.nodeCount} nodes > cap ${event.cap}. ` +
      `Classification: ${event.classification} (${event.rationale}). ` +
      `Offending subtree: ${event.offendingSubtree.join(", ") || "(none reported)"}. ` +
      `Routed to a ${kind} task per PRD C9. The verification claim was aborted; resolve this task, then re-run rk verify --af.`,
  };
}
