import { describe, expect, test } from "bun:test";
import { deriveShardPrefix } from "../../src/scaffold/shard-prefix";

describe("deriveShardPrefix (pure)", () => {
  test("multi-word hyphenated name -> initials (the WP's own example)", () => {
    expect(deriveShardPrefix("my-conjecture")).toBe("MC");
  });

  test("single-word name -> first 3 chars uppercased", () => {
    expect(deriveShardPrefix("myconjecture")).toBe("MYC");
  });

  test("short single word shorter than 3 chars -> whole word uppercased", () => {
    expect(deriveShardPrefix("ai")).toBe("AI");
  });

  test("underscore/space/mixed separators all split words", () => {
    expect(deriveShardPrefix("My_Cool  Thing!")).toBe("MCT");
  });

  test("many words: uses every word's initial, uncapped", () => {
    expect(deriveShardPrefix("a-b-c-d-e")).toBe("ABCDE");
  });

  test("degenerate input with no alphanumeric characters falls back to PROJECT", () => {
    expect(deriveShardPrefix("---")).toBe("PROJECT");
    expect(deriveShardPrefix("")).toBe("PROJECT");
  });

  test("digits participate as word characters", () => {
    expect(deriveShardPrefix("cft-anyons-v2")).toBe("CAV");
  });
});
