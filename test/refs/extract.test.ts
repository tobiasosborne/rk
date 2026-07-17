import { describe, expect, test } from "bun:test";
import { markerAvailable, extractWithMarker } from "../../src/refs/extract";

describe("markerAvailable", () => {
  test("returns false when the marker binary is not on PATH (the sandbox's actual state)", () => {
    // This environment genuinely has no `marker` binary installed — confirmed via `Bun.which`
    // before writing this module. That makes this a real assertion, not a mocked one, and
    // doubles as the live exercise of the "graceful visible skip" path required by the plan.
    expect(markerAvailable()).toBe(false);
  });

  test("respects an injected which() for a hermetic true-branch test", () => {
    expect(markerAvailable(() => "/usr/local/bin/marker")).toBe(true);
    expect(markerAvailable(() => null)).toBe(false);
  });
});

describe("extractWithMarker — graceful skip when the binary is absent", () => {
  test("never throws; reports skipped:true with a visible reason when marker is unavailable", async () => {
    const result = await extractWithMarker("/some/paper.pdf", "/some/out", () => null);
    expect(result).toEqual({ skipped: true, reason: "marker not found" });
  });
});
