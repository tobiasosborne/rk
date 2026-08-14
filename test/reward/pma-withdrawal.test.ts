// Gate 8 Check 4b's withdrawal precondition, tested DIRECTLY (bead rk-yic3, P1 Tier A).
// test/gates/reward.test.ts proves the wiring — that `pmaBackingDecision` consults this ahead of
// BOTH backing routes, so a live retraction can no longer be walked around via a `.rk/` provenance
// record. This file proves the precondition's own contract: which ledger states refuse, which do
// not, and that the reason names enough to be acted on.

import { describe, expect, test } from "bun:test";
import { retractionRefusal } from "../../src/reward/pma-withdrawal";
import type { Lemma } from "../../src/gates/linker-parse";
import { snapshotFromFiles } from "../../src/gates/snapshot";
import { sha256Hex } from "../../src/gates/sha256";

const CLAIM_PATH = "argument/lem-claim.md";
const RETRACTIONS = ".rk/retractions.jsonl";

const SHARD = ["---", "id: lem-claim", "kind: lemma", "status: proved-mod-audit", "af: none", "---", ""].join("\n");
const SHARD_HASH = sha256Hex(new TextEncoder().encode(SHARD));

function claim(): Lemma {
  return {
    id: "lem-claim",
    path: CLAIM_PATH,
    kind: "lemma",
    status: "proved-mod-audit",
    af: "none",
    contract: "The claim under review.",
    defs: [],
    deps: [],
    routes: [],
    balloons: { count: 0, classifications: [] },
  };
}

function retraction(overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    schemaVersion: "1",
    ordinal: 0,
    itemId: "lem-claim",
    contentHash: SHARD_HASH,
    hashDomain: "l5-shard-bytes",
    retractedBy: "audit:2026-08-14-independent-sweep",
    reason: "the endorsed argument reuses the very bound it is meant to establish",
    ...overrides,
  })}\n`;
}

function refusal(ledger?: string): string | undefined {
  const files: Record<string, string> = { [CLAIM_PATH]: SHARD };
  if (ledger !== undefined) files[RETRACTIONS] = ledger;
  return retractionRefusal(snapshotFromFiles(files), claim(), [claim()]);
}

describe("retractionRefusal — which ledger states bar backing", () => {
  test("an ABSENT ledger bars nothing (presence-conditional, never an error on its own)", () => {
    expect(refusal(undefined)).toBeUndefined();
  });

  test("an EMPTY ledger bars nothing", () => {
    expect(refusal("")).toBeUndefined();
  });

  test("a live l5-shard-bytes retraction bars backing and names domain, ordinal, issuer, cause", () => {
    const reason = refusal(retraction());
    expect(reason).toBeDefined();
    expect(reason).toContain("live retraction");
    expect(reason).toContain("l5-shard-bytes");
    expect(reason).toContain("ordinal 0");
    expect(reason).toContain("audit:2026-08-14-independent-sweep");
    expect(reason).toContain("reuses the very bound");
    // The remedy is stated, matching Check 16's own wording (src/gates/linker-retraction.ts).
    expect(reason).toContain("demote the shard");
  });

  test("an af-canonical retraction bars backing FAIL-CLOSED, whatever its recorded hash", () => {
    // rk cannot observe an item's current af-canonical hash, so such a record binds until rk can
    // (src/gates/linker-retraction.ts's header). A hash matching nothing must still bar.
    const reason = refusal(retraction({ hashDomain: "af-canonical", contentHash: "b".repeat(64) }));
    expect(reason).toContain("af-canonical");
  });

  test("a retraction whose l5-shard-bytes hash no longer binds bars nothing", () => {
    // The green control: an edit releases the binding, so this must not degrade into "any
    // retraction record naming this id bars backing forever".
    expect(refusal(retraction({ contentHash: "c".repeat(64) }))).toBeUndefined();
  });

  test("a retraction naming a different item bars nothing", () => {
    expect(refusal(retraction({ itemId: "lem-some-other-claim" }))).toBeUndefined();
  });

  test("an UNHEALTHY ledger bars backing fail-closed, carrying the store's own problems", () => {
    // A poisoned store yields ZERO live retractions by construction, so this state is NOT reachable
    // through any of the live-retraction cases above — it is the separately-breakable half, which
    // is why corpus/reward/reward-28 exists alongside reward-27.
    const reason = refusal(retraction().trim().slice(0, 60));
    expect(reason).toBeDefined();
    expect(reason).toContain("retraction ledger is unhealthy");
    expect(reason).toContain("fail closed");
  });

  test("a broken ordinal chain is an unhealthy ledger, not a partially-trusted one", () => {
    const ledger = `${retraction()}${retraction({ ordinal: 7, itemId: "lem-other" })}`;
    const reason = refusal(ledger);
    expect(reason).toContain("retraction ledger is unhealthy");
  });

  test("a claim absent from the registry is never resolved as retracted", () => {
    // Liveness is resolved against the lemma list; an id no shard carries produces no live record
    // (readRetractionFacts surfaces it as unmatched on Gate 2's coverage line instead).
    const snapshot = snapshotFromFiles({ [CLAIM_PATH]: SHARD, [RETRACTIONS]: retraction() });
    expect(retractionRefusal(snapshot, claim(), [])).toBeUndefined();
  });
});
