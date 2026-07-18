// PURITY: pure — no fs/network/clock (L3). M1.2 (`rk init`): derives the per-repo `shardsPrefix`
// (GateConfig.shardsPrefix, Gate 6 Inputs) from the project name — never from the north-star
// contract, never a literal default (audit R12/bead rk-psm: "a general tool must never default a
// shard-id prefix to a specific campaign's name").
//
// Rule (deterministic, documented — this WP's brief explicitly leaves the exact scheme to the
// implementer, "pick a deterministic, documented rule"):
//   1. Split the project name on any run of non-alphanumeric characters into words, dropping
//      empty words (so "my-conjecture" -> ["my", "conjecture"], "My_Cool  Thing!" ->
//      ["My", "Cool", "Thing"]).
//   2. Two or more words: take the first character of EVERY word, uppercased, concatenated —
//      initials, one per word, uncapped ("my-conjecture" -> "MC", the example this WP names).
//   3. Exactly one word: take its first 3 characters (or the whole word if shorter), uppercased
//      ("myconjecture" -> "MYC", "ai" -> "AI").
//   4. Degenerate input (no alphanumeric characters at all — should not occur since PROJECT_NAME
//      is derived from a real directory basename, but handled rather than crashing): "PROJECT".
// No cross-repo collision check: shardsPrefix is a per-repo parameter (Gate 6 Inputs), so nothing
// else needs to be consulted (this WP's brief: "collisions with nothing, it's per-repo").
export function deriveShardPrefix(projectName: string): string {
  const words = projectName.split(/[^a-zA-Z0-9]+/).filter((w) => w.length > 0);
  if (words.length === 0) return "PROJECT";
  if (words.length === 1) {
    return words[0]!.slice(0, 3).toUpperCase();
  }
  return words.map((w) => w[0]!.toUpperCase()).join("");
}
