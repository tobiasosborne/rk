import { describe, expect, test } from "bun:test";
import { formatCoverageLine, formatFinding } from "../src/gates/framework";
import type { Finding, CoverageLine } from "../src/gates/framework";

describe("formatFinding", () => {
  test("renders SEVERITY path:line message", () => {
    const f: Finding = { severity: "ERROR", path: "definitions/foo.md", line: 12, message: "bad thing" };
    expect(formatFinding(f)).toBe("ERROR definitions/foo.md:12 bad thing");
  });

  test("defaults line to 1 when absent (a JSON/whole-registry check with no source line)", () => {
    const f: Finding = { severity: "WARN", path: "proofs/x/externals/y.json", message: "no quote" };
    expect(formatFinding(f)).toBe("WARN proofs/x/externals/y.json:1 no quote");
  });
});

describe("formatCoverageLine", () => {
  test("renders checked <gate>: <checked>/<total> <unit>, no error/warning suffix", () => {
    const c: CoverageLine = { gate: "defs", unit: "shards", checked: 15, total: 15 };
    expect(formatCoverageLine(c)).toBe("checked defs: 15/15 shards");
  });

  test("renders 0/0 explicitly (a legitimate empty-corpus state, never omitted)", () => {
    const c: CoverageLine = { gate: "runs", unit: "run bundle(s)", checked: 0, total: 0 };
    expect(formatCoverageLine(c)).toBe("checked runs: 0/0 run bundle(s)");
  });
});
