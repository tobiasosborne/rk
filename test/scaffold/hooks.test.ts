import { describe, expect, test } from "bun:test";
import { buildClaudeSettings, buildPreCommitHookScript } from "../../src/scaffold/hooks";

describe("buildClaudeSettings (pure)", () => {
  const settings = buildClaudeSettings();

  test("SessionStart runs bd prime then fr board", () => {
    expect(settings.hooks.SessionStart[0]!.hooks.map((h) => h.command)).toEqual(["bd prime", "fr board"]);
  });
  test("UserPromptSubmit runs fr turn-begin then fr board", () => {
    expect(settings.hooks.UserPromptSubmit[0]!.hooks.map((h) => h.command)).toEqual(["fr turn-begin", "fr board"]);
  });
  test("Stop runs fr check", () => {
    expect(settings.hooks.Stop[0]!.hooks.map((h) => h.command)).toEqual(["fr check"]);
  });
  test("PreCompact runs bd prime", () => {
    expect(settings.hooks.PreCompact[0]!.hooks.map((h) => h.command)).toEqual(["bd prime"]);
  });
  test("every hook entry type is 'command'", () => {
    for (const group of Object.values(settings.hooks)) {
      for (const g of group) for (const h of g.hooks) expect(h.type).toBe("command");
    }
  });
});

describe("buildPreCommitHookScript (pure)", () => {
  test("is a shebang script that execs rk check", () => {
    const script = buildPreCommitHookScript();
    expect(script.startsWith("#!/bin/sh\n")).toBe(true);
    expect(script).toContain("exec rk check");
  });
});
