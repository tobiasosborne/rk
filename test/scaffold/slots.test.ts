import { describe, expect, test } from "bun:test";
import { fillTemplate, findUnfilledSlots } from "../../src/scaffold/slots";

describe("fillTemplate (pure)", () => {
  test("substitutes every occurrence of a known slot", () => {
    const text = "Hello {{RK_SLOT_NAME}}, welcome to {{RK_SLOT_NAME}}'s project.";
    const out = fillTemplate(text, { RK_SLOT_NAME: "Foo" });
    expect(out).toBe("Hello Foo, welcome to Foo's project.");
  });

  test("leaves slots with no matching key untouched", () => {
    const text = "{{RK_SLOT_A}} and {{RK_SLOT_B}}";
    const out = fillTemplate(text, { RK_SLOT_A: "x" });
    expect(out).toBe("x and {{RK_SLOT_B}}");
  });

  test("does not touch text with no slot syntax at all", () => {
    expect(fillTemplate("plain text", { RK_SLOT_A: "x" })).toBe("plain text");
  });
});

describe("findUnfilledSlots (pure) — the manifest's unfilled_slot_grep contract", () => {
  test("empty list when every slot was substituted", () => {
    expect(findUnfilledSlots("no placeholders here")).toEqual([]);
  });

  test("reports a single leftover placeholder", () => {
    expect(findUnfilledSlots("value: {{RK_SLOT_NORTH_STAR}}")).toEqual(["{{RK_SLOT_NORTH_STAR}}"]);
  });

  test("reports every DISTINCT leftover placeholder, deduplicated and sorted", () => {
    const text = "{{RK_SLOT_B}} ... {{RK_SLOT_A}} ... {{RK_SLOT_B}}";
    expect(findUnfilledSlots(text)).toEqual(["{{RK_SLOT_A}}", "{{RK_SLOT_B}}"]);
  });

  test("a fully-filled real template (fillTemplate composed with every manifest slot) reports nothing", () => {
    const text = "{{RK_SLOT_GOAL}} / {{RK_SLOT_NORTH_STAR}} / {{RK_SLOT_PROJECT_NAME}}";
    const filled = fillTemplate(text, {
      RK_SLOT_GOAL: "goal",
      RK_SLOT_NORTH_STAR: "north star",
      RK_SLOT_PROJECT_NAME: "proj",
    });
    expect(findUnfilledSlots(filled)).toEqual([]);
  });
});
