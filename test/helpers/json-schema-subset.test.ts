import { describe, expect, test } from "bun:test";
import { validateJsonSchema } from "./json-schema-subset";

const schema = {
  type: "object",
  required: ["kind", "choice", "values", "meta"],
  additionalProperties: false,
  properties: {
    kind: { const: "record" },
    choice: { enum: ["a", "b"] },
    values: { type: "array", minItems: 1, maxItems: 2, items: { $ref: "#/$defs/token" } },
    meta: {
      type: "object", minProperties: 1, not: { required: ["obj"] },
      additionalProperties: { type: "string", minLength: 2 },
    },
  },
  $defs: {
    token: {
      oneOf: [
        { type: "string", minLength: 2, pattern: "^[a-z]+$" },
        { const: null },
      ],
    },
  },
};

describe("test-only JSON Schema subset", () => {
  test("accepts a value exercising refs, oneOf, items, properties and additionalProperties schema", () => {
    expect(validateJsonSchema(schema, {
      kind: "record", choice: "a", values: ["ok", null], meta: { note: "yes" },
    })).toEqual([]);
  });

  test.each([
    ["type", []],
    ["required", { kind: "record", choice: "a", values: ["ok"] }],
    ["additionalProperties", { kind: "record", choice: "a", values: ["ok"], meta: { note: "yes" }, extra: true }],
    ["const", { kind: "wrong", choice: "a", values: ["ok"], meta: { note: "yes" } }],
    ["enum", { kind: "record", choice: "z", values: ["ok"], meta: { note: "yes" } }],
    ["minLength", { kind: "record", choice: "a", values: ["x"], meta: { note: "yes" } }],
    ["pattern", { kind: "record", choice: "a", values: ["UP"], meta: { note: "yes" } }],
    ["minItems", { kind: "record", choice: "a", values: [], meta: { note: "yes" } }],
    ["maxItems", { kind: "record", choice: "a", values: ["ok", "yes", null], meta: { note: "yes" } }],
    ["minProperties", { kind: "record", choice: "a", values: ["ok"], meta: {} }],
    ["not", { kind: "record", choice: "a", values: ["ok"], meta: { obj: "no" } }],
  ])("rejects a %s violation", (_keyword, value) => {
    expect(validateJsonSchema(schema, value).length).toBeGreaterThan(0);
  });
});
