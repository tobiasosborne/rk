import { describe, expect, test } from "bun:test";
import { TEMPLATE_MANIFEST, TEMPLATE_TEXT } from "../../src/scaffold/templates-embed";

describe("templates-embed (compile-time data)", () => {
  test("manifest parses with the expected template_version", () => {
    expect(TEMPLATE_MANIFEST.template_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("every non-null template named by the manifest has embedded text", () => {
    for (const entry of TEMPLATE_MANIFEST.stamped) {
      if (entry.template === null) continue;
      expect(TEMPLATE_TEXT[entry.template]).toBeDefined();
      expect(TEMPLATE_TEXT[entry.template]!.length).toBeGreaterThan(0);
    }
  });

  test("every embedded template is actually referenced by the manifest (no orphaned embed)", () => {
    const referenced = new Set(TEMPLATE_MANIFEST.stamped.map((e) => e.template).filter((t): t is string => t !== null));
    for (const key of Object.keys(TEMPLATE_TEXT)) {
      expect(referenced.has(key)).toBe(true);
    }
  });
});
