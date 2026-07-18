import { describe, expect, test } from "bun:test";
import { planStamp } from "../../src/scaffold/plan";
import type { Manifest } from "../../src/scaffold/manifest-types";

const MANIFEST: Manifest = {
  template_version: "1.0.0",
  slot_syntax: "{{RK_SLOT_<NAME>}}",
  unfilled_slot_grep: "\\{\\{RK_SLOT_",
  note: "test manifest",
  slots: [{ name: "RK_SLOT_GOAL", description: "goal", unique: true }],
  stamped: [
    { path: "CLAUDE.md", template: "CLAUDE.md.tmpl", classification: "rewritten-whole" },
    { path: "definitions/", template: null, classification: "directory" },
  ],
};

const TEMPLATE_TEXT = {
  "CLAUDE.md.tmpl": "# {{RK_SLOT_GOAL}}\n",
};

describe("planStamp (pure)", () => {
  test("fully-filled slots: one planned file, one dir, no unfilled entries", () => {
    const plan = planStamp(MANIFEST, TEMPLATE_TEXT, { RK_SLOT_GOAL: "Prove the thing" });
    expect(plan.files).toEqual([{ path: "CLAUDE.md", content: "# Prove the thing\n" }]);
    expect(plan.dirs).toEqual(["definitions/"]);
    expect(plan.unfilled).toEqual([]);
  });

  test("a missing slot value is reported in `unfilled`, never silently written as a placeholder", () => {
    const plan = planStamp(MANIFEST, TEMPLATE_TEXT, {});
    expect(plan.unfilled).toEqual([{ path: "CLAUDE.md", slots: ["{{RK_SLOT_GOAL}}"] }]);
    // the file is still recorded (so the caller can show its content in a diagnostic), but the
    // presence of ANY `unfilled` entry is what the edge caller must treat as refuse-to-write.
    expect(plan.files).toEqual([{ path: "CLAUDE.md", content: "# {{RK_SLOT_GOAL}}\n" }]);
  });

  test("a manifest entry naming a template not present in templateText is reported, not thrown", () => {
    const badManifest: Manifest = {
      ...MANIFEST,
      stamped: [{ path: "MISSING.md", template: "missing.tmpl", classification: "rewritten-whole" }],
    };
    const plan = planStamp(badManifest, {}, {});
    expect(plan.unfilled).toEqual([{ path: "MISSING.md", slots: ["<template-missing>"] }]);
  });
});
