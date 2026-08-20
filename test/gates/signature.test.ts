// 1:1 test file for src/gates/signature.ts — the Layer 1 SIGNATURE block: where it lives (a
// fenced ```signature block in the shard BODY, never frontmatter — src/gates/snapshot.ts's
// frontmatter grammar is a FLAT `key: value` subset with no nested maps), how it parses, and its
// canonical form. Ground truth: docs/design/NOTES-2026-08-20-qpcp-campaign-plan.md section 6 and
// schemas/signature.v1.json.
//
// The load-bearing rule this file pins: a malformed or unparseable signature is an ERROR, NEVER
// "no signature" (memo section 6; review LB6). A parser that degrades a broken block to "absent"
// would turn every authoring typo into a silent skip of the entailment check.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SIGNATURE_SCHEMA_VERSION,
  canonicalSignature,
  canonicalSignatureText,
  extractSignatureBlock,
} from "../../src/gates/signature";

function shard(body: string): string {
  return `---\nid: lem-a\nkind: lemma\n---\n\n${body}\n`;
}

const CANONICAL = `{
  "post": [
    {
      "gap": "const",
      "obj": "def-promise-gap"
    }
  ],
  "pre": [
    {
      "d": "const",
      "obj": "def-local-hamiltonian"
    }
  ],
  "profile": "qpcp.v1",
  "regime": [
    {
      "n": "to-infinity"
    }
  ],
  "schema_version": "1"
}`;

describe("extractSignatureBlock — where the signature lives", () => {
  test("a shard with no fenced signature block is ABSENT (a legitimate state, not an error)", () => {
    const b = extractSignatureBlock(shard("Some prose. No block here.\n"));
    expect(b.state).toBe("absent");
  });

  test("a canonical fenced ```signature block parses to a Signature", () => {
    const b = extractSignatureBlock(shard("```signature\n" + CANONICAL + "\n```"));
    expect(b.state).toBe("ok");
    if (b.state !== "ok") throw new Error("unreachable");
    expect(b.signature.schema_version).toBe(SIGNATURE_SCHEMA_VERSION);
    expect(b.signature.profile).toBe("qpcp.v1");
    expect(b.signature.pre).toEqual([{ obj: "def-local-hamiltonian", keys: { d: "const" } }]);
    expect(b.signature.post).toEqual([{ obj: "def-promise-gap", keys: { gap: "const" } }]);
    expect(b.signature.regime).toEqual([{ n: "to-infinity" }]);
    expect(b.line).toBeGreaterThan(0);
  });

  test("unparseable JSON is MALFORMED, never absent", () => {
    const b = extractSignatureBlock(shard("```signature\n{not json\n```"));
    expect(b.state).toBe("malformed");
    if (b.state !== "malformed") throw new Error("unreachable");
    expect(b.code).toBe("signature-malformed");
  });

  test("an unterminated fence is MALFORMED, never absent", () => {
    const b = extractSignatureBlock(shard("```signature\n" + CANONICAL));
    expect(b.state).toBe("malformed");
  });

  test("two signature blocks in one shard are MALFORMED (ambiguous claim)", () => {
    const one = "```signature\n" + CANONICAL + "\n```";
    const b = extractSignatureBlock(shard(one + "\n\n" + one));
    expect(b.state).toBe("malformed");
    if (b.state !== "malformed") throw new Error("unreachable");
    expect(b.message).toContain("2");
  });

  test.each([
    ["a numeric value (values are strings; 'no floats' made mechanical)", '{"post":[],"pre":[],"profile":"p","regime":[{"n":1}],"schema_version":"1"}'],
    ["a float anywhere", '{"post":[],"pre":[],"profile":"p","regime":[{"n":0.5}],"schema_version":"1"}'],
    ["an unknown top-level key", '{"extra":"x","post":[],"pre":[],"profile":"p","regime":[],"schema_version":"1"}'],
    ["a wrong schema_version", '{"post":[],"pre":[],"profile":"p","regime":[],"schema_version":"2"}'],
    ["a pre entry with no obj", '{"post":[],"pre":[{"d":"const"}],"profile":"p","regime":[],"schema_version":"1"}'],
    ["a pre entry with obj only (no predicate keys)", '{"post":[],"pre":[{"obj":"def-x"}],"profile":"p","regime":[],"schema_version":"1"}'],
    ["a regime entry carrying obj", '{"post":[],"pre":[],"profile":"p","regime":[{"d":"const","obj":"def-x"}],"schema_version":"1"}'],
    ["a top-level array", '["not","an","object"]'],
    ["a missing required field", '{"pre":[],"profile":"p","regime":[],"schema_version":"1"}'],
  ])("%s is MALFORMED", (_label, json) => {
    const b = extractSignatureBlock(shard("```signature\n" + json + "\n```"));
    expect(b.state).toBe("malformed");
  });

  test("a well-formed but NON-CANONICAL encoding is its own loud code, never silently accepted", () => {
    const scrambled = '{"schema_version":"1","profile":"qpcp.v1","pre":[],"post":[],"regime":[]}';
    const b = extractSignatureBlock(shard("```signature\n" + scrambled + "\n```"));
    expect(b.state).toBe("malformed");
    if (b.state !== "malformed") throw new Error("unreachable");
    expect(b.code).toBe("signature-noncanonical");
  });
});

describe("canonical form", () => {
  test("canonicalSignatureText round-trips the canonical bytes exactly (idempotent)", () => {
    const b = extractSignatureBlock(shard("```signature\n" + CANONICAL + "\n```"));
    if (b.state !== "ok") throw new Error("expected ok");
    expect(canonicalSignatureText(b.signature)).toBe(CANONICAL);
    expect(canonicalSignatureText(canonicalSignature(b.signature))).toBe(CANONICAL);
  });

  test("canonicalisation is order-invariant: array order and key order do not change identity", () => {
    const a = canonicalSignature({
      schema_version: "1",
      profile: "p",
      pre: [
        { obj: "def-b", keys: { z: "1x", a: "2x" } },
        { obj: "def-a", keys: { k: "const" } },
      ],
      post: [],
      regime: [{ b: "y" }, { a: "x" }],
    });
    const b = canonicalSignature({
      schema_version: "1",
      profile: "p",
      pre: [
        { obj: "def-a", keys: { k: "const" } },
        { obj: "def-b", keys: { a: "2x", z: "1x" } },
      ],
      post: [],
      regime: [{ a: "x" }, { b: "y" }],
    });
    expect(canonicalSignatureText(a)).toBe(canonicalSignatureText(b));
  });
});

describe("schemas/signature.v1.json pins the implementation (rule 10)", () => {
  const schema = JSON.parse(
    readFileSync(join(import.meta.dir, "..", "..", "schemas", "signature.v1.json"), "utf8"),
  ) as { required: string[]; properties: Record<string, { const?: string }> };

  test("schema_version const matches SIGNATURE_SCHEMA_VERSION", () => {
    expect(schema.properties.schema_version!.const).toBe(SIGNATURE_SCHEMA_VERSION);
  });

  test("the schema's required set is exactly the parser's required set", () => {
    expect([...schema.required].sort()).toEqual(["post", "pre", "profile", "regime", "schema_version"]);
  });

  test("the schema's property set is exactly the parser's closed key set", () => {
    expect(Object.keys(schema.properties).sort()).toEqual([
      "hardness", "post", "pre", "profile", "regime", "schema_version",
    ]);
  });
});
