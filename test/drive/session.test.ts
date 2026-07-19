// 1:1 test file for src/drive/session.ts — M3.1 repair wave landing-blocker 2: "role/claim
// isolation is prose-only and `claimId` is absent from the request." `validateSessionRequest` is
// the runtime invariant check the review asked for (Q4 ruling: "TypeScript types alone are
// insufficient — add runtime request/session invariant validation and property tests"). This is a
// property-test-heavy file: the review's core failure scenario was "a verifier request resumes a
// prover session... nothing binds sessionId to (backend/model, role, tier, claim)" — every field
// of the isolation tuple gets its own dedicated mismatch test below, matching that scenario
// exactly, plus a property sweep over the full tuple.

import { describe, expect, test } from "bun:test";
import { validateSessionRequest, type SessionRecord, type WorkerRequestIdentity } from "../../src/drive/session";

function baseRecord(): SessionRecord {
  return { backend: "claude", model: "claude-sonnet-5", role: "prover", tier: "l5", claimId: "claim-01", dispatchModel: "session", sessionId: "sess-01" };
}

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

describe("validateSessionRequest — valid requests", () => {
  test("a resume request matching the record's full tuple is accepted", () => {
    expect(validateSessionRequest(resumeRequest(), "session", baseRecord())).toEqual([]);
  });

  test("a new-session request with well-formed identity fields is accepted (no record needed)", () => {
    const request: WorkerRequestIdentity = {
      backend: "codex", model: "gpt-5.6-sol", role: "verifier", tier: "hard", claimId: "claim-99", turnId: "turn-01", session: { mode: "new" },
    };
    expect(validateSessionRequest(request, "session", undefined)).toEqual([]);
  });

  test("a flat-dispatch backend's new-session request is accepted", () => {
    const request: WorkerRequestIdentity = {
      backend: "codex", model: "gpt-5.6-sol", role: "verifier", tier: "l5", claimId: "claim-flat", turnId: "turn-01", session: { mode: "new" },
    };
    expect(validateSessionRequest(request, "flat", undefined)).toEqual([]);
  });
});

describe("validateSessionRequest — rejection classes", () => {
  test("blank backend is rejected", () => {
    const issues = validateSessionRequest(resumeRequest({ backend: "" }), "session", baseRecord());
    expect(issues.some((i) => i.path === "backend")).toBe(true);
  });

  test("blank claimId is rejected", () => {
    const issues = validateSessionRequest(resumeRequest({ claimId: "" }), "session", undefined);
    expect(issues.some((i) => i.path === "claimId")).toBe(true);
  });

  test("blank turnId is rejected", () => {
    const issues = validateSessionRequest(resumeRequest({ turnId: "" }), "session", baseRecord());
    expect(issues.some((i) => i.path === "turnId")).toBe(true);
  });

  test("invalid role is rejected", () => {
    const issues = validateSessionRequest(resumeRequest({ role: "auditor" as any }), "session", baseRecord());
    expect(issues.some((i) => i.path === "role")).toBe(true);
  });

  test("invalid tier is rejected", () => {
    const issues = validateSessionRequest(resumeRequest({ tier: "medium" as any }), "session", baseRecord());
    expect(issues.some((i) => i.path === "tier")).toBe(true);
  });

  test("THE core failure scenario: a verifier request resuming a session recorded for role=prover is rejected", () => {
    const record = baseRecord(); // role: "prover"
    const request = resumeRequest({ role: "verifier" });
    const issues = validateSessionRequest(request, "session", record);
    expect(issues.some((i) => i.path === "session.resume.role")).toBe(true);
  });

  test("a request resuming a session recorded for a different claimId is rejected", () => {
    const record = baseRecord(); // claimId: "claim-01"
    const request = resumeRequest({ claimId: "claim-02" });
    const issues = validateSessionRequest(request, "session", record);
    expect(issues.some((i) => i.path === "session.resume.claimId")).toBe(true);
  });

  test("a request resuming a session recorded for a different tier is rejected", () => {
    const record = baseRecord(); // tier: "l5"
    const request = resumeRequest({ tier: "hard" });
    const issues = validateSessionRequest(request, "session", record);
    expect(issues.some((i) => i.path === "session.resume.tier")).toBe(true);
  });

  test("a request resuming a session recorded for a different backend is rejected", () => {
    const record = baseRecord(); // backend: "claude"
    const request = resumeRequest({ backend: "codex" });
    const issues = validateSessionRequest(request, "session", record);
    expect(issues.some((i) => i.path === "session.resume.backend")).toBe(true);
  });

  test("a request resuming a session recorded for a different model is rejected", () => {
    const record = baseRecord();
    const request = resumeRequest({ model: "claude-haiku-4-5" });
    const issues = validateSessionRequest(request, "session", record);
    expect(issues.some((i) => i.path === "session.resume.model")).toBe(true);
  });

  test("a flat-dispatch backend attempting resume is rejected regardless of any record", () => {
    const issues = validateSessionRequest(resumeRequest(), "flat", baseRecord());
    expect(issues.some((i) => i.path === "session.mode")).toBe(true);
  });

  test("a flat-dispatch backend attempting resume with NO record is still rejected (the flat check comes first)", () => {
    const issues = validateSessionRequest(resumeRequest(), "flat", undefined);
    expect(issues.some((i) => i.path === "session.mode")).toBe(true);
  });

  test("resume with no matching record at all is rejected", () => {
    const issues = validateSessionRequest(resumeRequest(), "session", undefined);
    expect(issues.some((i) => i.path === "session.sessionId")).toBe(true);
  });

  test("resume with a blank sessionId is rejected", () => {
    const issues = validateSessionRequest(resumeRequest({ session: { mode: "resume", sessionId: "" } }), "session", undefined);
    expect(issues.some((i) => i.path === "session.sessionId")).toBe(true);
  });
});

describe("property: every single-field isolation-tuple mismatch is rejected", () => {
  const fields: Array<[string, Partial<WorkerRequestIdentity>]> = [
    ["backend", { backend: "codex" }],
    ["model", { model: "different-model" }],
    ["role", { role: "reviewer" }],
    ["tier", { tier: "hard" }],
    ["claimId", { claimId: "some-other-claim" }],
  ];
  for (const [field, override] of fields) {
    test(`mismatch on ${field} alone is rejected`, () => {
      const record = baseRecord();
      const request = resumeRequest(override);
      const issues = validateSessionRequest(request, "session", record);
      expect(issues.length).toBeGreaterThan(0);
    });
  }

  test("matching every field in the tuple (the control case) produces zero issues", () => {
    expect(validateSessionRequest(resumeRequest(), "session", baseRecord())).toEqual([]);
  });
});
