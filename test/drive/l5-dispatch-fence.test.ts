// Edge wiring for rk-fs8v: structured verifier fences are checked against the on-disk validity
// stores before an L5 worker session opens, reported in both the outcome and driver log, and only
// confirmed evidence reaches the verifier.

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveBatchId } from "../../src/drive/batch-composer";
import { dispatchL5Plan, type L5DispatchDeps } from "../../src/drive/l5-dispatch";
import type { L5DispatchPlan } from "../../src/drive/l5-dispatch-plan";
import type { L5StoredVerdict } from "../../src/drive/l5-record";
import { sha256Bytes } from "../../src/refs/hash";
import type { WorkerBackend, TurnItem } from "../../src/drive/backend-types";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const hashOf = (text: string): string => sha256Bytes(new TextEncoder().encode(text));
const TARGET = "target shard bytes";
const PREMISE = "premise bytes";

function rootWithVerdict(contentHash: string): string {
  const root = mkdtempSync(join(tmpdir(), "rk-fence-dispatch-"));
  roots.push(root);
  mkdirSync(join(root, ".rk"), { recursive: true });
  const record: L5StoredVerdict = {
    schemaVersion: "1",
    ordinal: 0,
    itemId: "premise",
    l5ContentHash: contentHash,
    verdict: "VALID",
    justification: "independently checked",
    verifierSeam: "gpt|codex|gpt-5.6-sol|prior",
  };
  writeFileSync(join(root, ".rk", "l5-verdicts.jsonl"), JSON.stringify(record) + "\n");
  return root;
}

function plan(): L5DispatchPlan {
  const batchId = deriveBatchId("north", ["target"]);
  return {
    northStarId: "north",
    cap: 10,
    batches: [{
      batchId,
      composedBatchId: batchId,
      claimId: `l5:${batchId}`,
      members: [{ itemId: "target", order: 0, contentHash: hashOf(TARGET) }],
      score: 0,
    }],
    excluded: [],
  };
}

function backend(): { value: WorkerBackend; turns: TurnItem[]; sessions: string[] } {
  const turns: TurnItem[] = [];
  const sessions: string[] = [];
  return {
    turns,
    sessions,
    value: {
      name: "fake",
      modelFamily: "gpt",
      capabilities: { sessionResume: true },
      async createSession() {
        sessions.push("opened");
        return { sessionId: "session" };
      },
      async runTurn(_sessionId, item) {
        turns.push(item);
        return {
          exit: 0,
          usage: { input: 1, output: 1, cache_read: 0, cache_creation: 0 },
          rawText: JSON.stringify({ verdict: "VALID", justification: "checked target" }),
          dispatchModel: "session",
        };
      },
    },
  };
}

function deps(worker: WorkerBackend, premise: string, logs: Record<string, unknown>[]): L5DispatchDeps {
  return {
    backend: worker,
    model: "gpt-5.6-sol",
    content: new Map([["target", TARGET], ["premise", premise]]),
    sharedContext: "rubric",
    assumedVerified: new Map([["target", [{
      claimId: "premise",
      verdictRef: ".rk/l5-verdicts.jsonl#ordinal=0",
    }]]]),
    appendLog: (line) => logs.push(JSON.parse(line)),
    nowIso: () => "2026-08-10T00:00:00.000Z",
  };
}

describe("dispatchL5Plan — structured verifier fences", () => {
  test("a stale cited fence refuses dispatch before any session and is loud in output and log", async () => {
    const root = rootWithVerdict(hashOf(PREMISE));
    const worker = backend();
    const logs: Record<string, unknown>[] = [];
    const [outcome] = await dispatchL5Plan(root, plan(), deps(worker.value, PREMISE + " edited", logs));

    expect(worker.sessions).toEqual([]);
    expect(outcome!.fenceCoverage).toEqual({ checked: 1, total: 1, confirmed: 0, refused: 1 });
    expect(outcome!.rejected).toEqual([expect.objectContaining({
      itemId: "target",
      stage: "verifier-fence-refused",
      issues: [expect.objectContaining({ message: expect.stringContaining("stale") })],
    })]);
    expect(logs).toContainEqual(expect.objectContaining({
      kind: "verifier-fence",
      checked: 1,
      total: 1,
      confirmed: 0,
      refused: 1,
      refusals: [expect.objectContaining({ itemId: "target", claimId: "premise", reason: "stale" })],
    }));
  });

  test("a fresh cited fence reaches the verifier with hash/locus while the verdict binds raw target bytes", async () => {
    const root = rootWithVerdict(hashOf(PREMISE));
    const worker = backend();
    const logs: Record<string, unknown>[] = [];
    const [outcome] = await dispatchL5Plan(root, plan(), deps(worker.value, PREMISE, logs));

    expect(worker.sessions).toHaveLength(1);
    expect(worker.turns).toHaveLength(1);
    expect(worker.turns[0]!.content).toStartWith(TARGET);
    expect(worker.turns[0]!.assumedVerified).toEqual([expect.objectContaining({
      claimId: "premise",
      verdictRef: ".rk/l5-verdicts.jsonl#ordinal=0",
      contentHash: hashOf(PREMISE),
      locus: ".rk/l5-verdicts.jsonl:1",
    })]);
    expect(worker.turns[0]!.content).toContain("Assumed verified (structured, driver-confirmed) (1):");
    expect(worker.turns[0]!.content).toContain(hashOf(PREMISE));
    expect(worker.turns[0]!.content).toContain('"locus":".rk/l5-verdicts.jsonl:1"');
    expect(outcome!.fenceCoverage).toEqual({ checked: 1, total: 1, confirmed: 1, refused: 0 });
    expect(outcome!.applied[0]!.l5ContentHash).toBe(hashOf(TARGET));
    expect(logs).toContainEqual(expect.objectContaining({ kind: "verifier-fence", checked: 1, total: 1, confirmed: 1, refused: 0 }));
  });

  test("a declaration keyed to an item outside the batch is counted and refused as unknown", async () => {
    const root = rootWithVerdict(hashOf(PREMISE));
    const worker = backend();
    const logs: Record<string, unknown>[] = [];
    const dispatchDeps = deps(worker.value, PREMISE, logs);
    dispatchDeps.assumedVerified = new Map([["ghost", [{
      claimId: "premise",
      verdictRef: ".rk/l5-verdicts.jsonl#ordinal=0",
    }]]]);
    const [outcome] = await dispatchL5Plan(root, plan(), dispatchDeps);

    expect(outcome!.fenceCoverage).toEqual({ checked: 1, total: 1, confirmed: 0, refused: 1 });
    expect(outcome!.rejected).toContainEqual(expect.objectContaining({
      itemId: "ghost",
      stage: "verifier-fence-refused",
      issues: [expect.objectContaining({ message: expect.stringContaining("unknown item") })],
    }));
    expect(logs).toContainEqual(expect.objectContaining({
      kind: "verifier-fence",
      checked: 1,
      total: 1,
      confirmed: 0,
      refused: 1,
      refusals: [expect.objectContaining({ itemId: "ghost", reason: "unknown item" })],
    }));
  });
});
