// 1:1 test file for src/drive/session-manager.ts (M3.3). Red-first unit tests per rejection class
// (create-once, global sessionId uniqueness, flat-backend repeat-create-is-normal), plus the
// acceptance-bar PROPERTY test: generate long random sequences of create/resume operations over a
// small universe of (backend, model, role, tier, claimId, dispatchModel, sessionId) values —
// deliberately with a SMALL sessionId pool so collisions are frequent — and assert, for every
// resume attempt in the sequence, that it succeeds if and only if a session was actually created
// earlier for that EXACT isolation tuple. This is the M3.1 review's core failure scenario ("a
// verifier request resumes a prover session... nothing binds sessionId to (backend/model, role,
// tier, claim)") checked against an independently-tracked ground truth, not by re-deriving the
// manager's own internal logic — a bug in `createSession`/`resumeSession` that let a mismatched
// tuple through would show up as a spec-level assertion failure here, not just an internal
// consistency check against itself.

import { describe, expect, test } from "bun:test";
import {
  createSession,
  emptySessionManagerState,
  lookupSession,
  resumeSession,
  type SessionManagerState,
} from "../../src/drive/session-manager";
import type { SessionRecord, WorkerRequestIdentity } from "../../src/drive/session";
import type { DispatchModel, Role, Tier } from "../../src/drive/vocab";

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    backend: "claude",
    model: "claude-sonnet-5",
    role: "prover",
    tier: "l5",
    claimId: "claim-01",
    dispatchModel: "session",
    sessionId: "sess-01",
    ...overrides,
  };
}

describe("createSession — rejection classes", () => {
  test("first create for a fresh tuple succeeds", () => {
    const outcome = createSession(emptySessionManagerState(), record());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.reused).toBe(false);
  });

  test("re-announcing the SAME sessionId for the SAME tuple is idempotent (reused: true)", () => {
    const first = createSession(emptySessionManagerState(), record());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = createSession(first.state, record());
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.reused).toBe(true);
  });

  test("create-once: a SECOND session for the SAME tuple with a DIFFERENT sessionId is rejected", () => {
    const first = createSession(emptySessionManagerState(), record({ sessionId: "sess-01" }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = createSession(first.state, record({ sessionId: "sess-02" }));
    expect(second.ok).toBe(false);
  });

  test("global uniqueness: the SAME sessionId reused under a DIFFERENT tuple (different role) is rejected", () => {
    const first = createSession(emptySessionManagerState(), record({ role: "prover" }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = createSession(first.state, record({ role: "verifier" }));
    expect(second.ok).toBe(false);
  });

  test("global uniqueness: the SAME sessionId reused under a DIFFERENT claimId is rejected", () => {
    const first = createSession(emptySessionManagerState(), record({ claimId: "claim-A" }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = createSession(first.state, record({ claimId: "claim-B" }));
    expect(second.ok).toBe(false);
  });

  test("flat dispatchModel: repeat creation under the SAME tuple with a FRESH sessionId every time is the norm, not a violation", () => {
    let state = emptySessionManagerState();
    for (const sessionId of ["attempt-1", "attempt-2", "attempt-3"]) {
      const outcome = createSession(state, record({ dispatchModel: "flat", sessionId }));
      expect(outcome.ok).toBe(true);
      if (outcome.ok) state = outcome.state;
    }
  });

  test("flat dispatchModel still enforces global sessionId uniqueness against an unrelated tuple", () => {
    const first = createSession(emptySessionManagerState(), record({ dispatchModel: "flat", sessionId: "shared-id", claimId: "claim-A" }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = createSession(first.state, record({ dispatchModel: "flat", sessionId: "shared-id", claimId: "claim-B" }));
    expect(second.ok).toBe(false);
  });

  test("blank sessionId/backend/model/claimId are each rejected", () => {
    expect(createSession(emptySessionManagerState(), record({ sessionId: "" })).ok).toBe(false);
    expect(createSession(emptySessionManagerState(), record({ backend: "" })).ok).toBe(false);
    expect(createSession(emptySessionManagerState(), record({ model: "" })).ok).toBe(false);
    expect(createSession(emptySessionManagerState(), record({ claimId: "" })).ok).toBe(false);
  });
});

function resumeRequest(overrides: Partial<WorkerRequestIdentity> = {}): WorkerRequestIdentity {
  return {
    backend: "claude",
    model: "claude-sonnet-5",
    role: "prover",
    tier: "l5",
    claimId: "claim-01",
    turnId: "turn-02",
    session: { mode: "resume", sessionId: "sess-01" },
    ...overrides,
  };
}

describe("resumeSession", () => {
  test("resuming a session with a matching tuple succeeds", () => {
    const created = createSession(emptySessionManagerState(), record());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(resumeSession(created.state, resumeRequest(), "session")).toEqual([]);
  });

  test("THE core scenario: resuming with role=verifier a session recorded for role=prover is rejected", () => {
    const created = createSession(emptySessionManagerState(), record({ role: "prover" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const issues = resumeSession(created.state, resumeRequest({ role: "verifier" }), "session");
    expect(issues.length).toBeGreaterThan(0);
  });

  test("resuming an unknown sessionId is rejected", () => {
    const issues = resumeSession(emptySessionManagerState(), resumeRequest(), "session");
    expect(issues.length).toBeGreaterThan(0);
  });

  test("a flat backend attempting resume is rejected regardless of a matching record", () => {
    const created = createSession(emptySessionManagerState(), record({ dispatchModel: "flat" }));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const issues = resumeSession(created.state, resumeRequest(), "flat");
    expect(issues.length).toBeGreaterThan(0);
  });

  test("lookupSession returns the record created, undefined otherwise", () => {
    const created = createSession(emptySessionManagerState(), record());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(lookupSession(created.state, "sess-01")).toEqual(record());
    expect(lookupSession(created.state, "no-such-id")).toBeUndefined();
  });
});

// --- Deterministic seeded PRNG (mulberry32) — no Math.random(), so a failing property test always
// reproduces with the same fixed seed below; this file is a test, not a PURITY-marked module, so a
// non-cryptographic PRNG here is unrelated to L3's fs/network/clock purity rule. ---
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, xs: readonly T[]): T {
  return xs[Math.floor(rng() * xs.length)]!;
}

const BACKENDS = ["claude", "codex"] as const;
const MODELS = ["model-a", "model-b"] as const;
const ROLES: readonly Role[] = ["prover", "verifier", "reviewer"];
const TIERS: readonly Tier[] = ["l5", "hard"];
const CLAIM_IDS = ["claim-1", "claim-2", "claim-3"] as const;
const DISPATCH_MODELS: readonly DispatchModel[] = ["session", "flat"];
const SESSION_ID_POOL = ["s1", "s2", "s3", "s4", "s5"] as const; // small pool -> frequent collisions

interface GroundTruthEntry {
  sessionId: string;
  backend: string;
  model: string;
  role: Role;
  tier: Tier;
  claimId: string;
  dispatchModel: DispatchModel;
}

function tupleEquals(a: GroundTruthEntry, b: GroundTruthEntry): boolean {
  return a.backend === b.backend && a.model === b.model && a.role === b.role && a.tier === b.tier && a.claimId === b.claimId && a.dispatchModel === b.dispatchModel;
}

describe("property: session isolation never crosses the tuple, across arbitrary interleavings", () => {
  test("1000 randomized create/resume operations, seeded and reproducible", () => {
    const rng = mulberry32(0xc0ffee);
    let state: SessionManagerState = emptySessionManagerState();
    const groundTruth: GroundTruthEntry[] = [];

    for (let i = 0; i < 1000; i++) {
      const doCreate = rng() < 0.5 || groundTruth.length === 0;
      if (doCreate) {
        const spec: SessionRecord = {
          backend: pick(rng, BACKENDS),
          model: pick(rng, MODELS),
          role: pick(rng, ROLES),
          tier: pick(rng, TIERS),
          claimId: pick(rng, CLAIM_IDS),
          dispatchModel: pick(rng, DISPATCH_MODELS),
          sessionId: pick(rng, SESSION_ID_POOL),
        };
        const outcome = createSession(state, spec);
        if (outcome.ok) {
          state = outcome.state;
          if (!outcome.reused) {
            // Invariant: no prior ground-truth entry for this sessionId may have a different
            // tuple — if one existed, createSession should have rejected this as a NEW entry.
            for (const e of groundTruth) {
              if (e.sessionId === spec.sessionId) {
                expect(tupleEquals(e, spec)).toBe(true);
              }
            }
            groundTruth.push({ ...spec });
          }
        } else {
          // A rejection must be explained by an actual conflict in ground truth: either the same
          // sessionId already recorded under a different tuple, or (dispatchModel:"session" only)
          // this exact tuple already holding a different sessionId.
          const sessionIdConflict = groundTruth.some((e) => e.sessionId === spec.sessionId && !tupleEquals(e, spec));
          const tupleConflict =
            spec.dispatchModel === "session" &&
            groundTruth.some((e) => e.dispatchModel === "session" && e.backend === spec.backend && e.model === spec.model && e.role === spec.role && e.tier === spec.tier && e.claimId === spec.claimId && e.sessionId !== spec.sessionId);
          expect(sessionIdConflict || tupleConflict).toBe(true);
        }
      } else {
        // Resume attempt: pick a sessionId (usually one that exists), and independently roll a
        // tuple that may or may not match what it was actually created with.
        const sessionId = rng() < 0.85 ? pick(rng, groundTruth).sessionId : pick(rng, SESSION_ID_POOL);
        const request: WorkerRequestIdentity = {
          backend: pick(rng, BACKENDS),
          model: pick(rng, MODELS),
          role: pick(rng, ROLES),
          tier: pick(rng, TIERS),
          claimId: pick(rng, CLAIM_IDS),
          turnId: `turn-${i}`,
          session: { mode: "resume", sessionId },
        };
        const backendDispatchModel = pick(rng, DISPATCH_MODELS);
        const issues = resumeSession(state, request, backendDispatchModel);

        const matchExists =
          backendDispatchModel === "session" &&
          groundTruth.some(
            (e) =>
              e.sessionId === sessionId &&
              e.backend === request.backend &&
              e.model === request.model &&
              e.role === request.role &&
              e.tier === request.tier &&
              e.claimId === request.claimId &&
              e.dispatchModel === backendDispatchModel,
          );

        if (matchExists) {
          expect(issues).toEqual([]);
        } else {
          expect(issues.length).toBeGreaterThan(0);
        }
      }
    }

    expect(groundTruth.length).toBeGreaterThan(0); // sanity: the run actually exercised creation
  });
});
