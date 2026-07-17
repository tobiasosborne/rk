import { describe, expect, test } from "bun:test";
import { locateQuote, normalizeQuoteText, wholeQuoteMatch } from "../../src/refs/quote";

describe("normalizeQuoteText", () => {
  test("unescapes markdown dollar-escaping", () => {
    expect(normalizeQuoteText("a \\$x\\$ b")).toBe("a $x$ b");
  });

  test("drops markdown emphasis asterisks", () => {
    expect(normalizeQuoteText("a *b* c")).toBe("a b c");
  });

  test("collapses whitespace runs (including newlines) to one space", () => {
    expect(normalizeQuoteText("a   b\n\nc\t d")).toBe("a b c d");
  });

  test("trims leading/trailing whitespace", () => {
    expect(normalizeQuoteText("  a b  ")).toBe("a b");
  });

  test("keeps LaTeX command names and $ (fabrications differ in words, not formatting)", () => {
    expect(normalizeQuoteText("\\circ \\tilde{x} $y$")).toBe("\\circ \\tilde{x} $y$");
  });
});

describe("wholeQuoteMatch — ruling #3 (whole-quote match, no partial-run pass)", () => {
  test("matches when the whole normalized quote is a substring of the normalized source", () => {
    const r = wholeQuoteMatch("the map is idempotent", "Recall that the map is idempotent on X.");
    expect(r.matched).toBe(true);
  });

  test("tolerates whitespace/markdown noise on both sides", () => {
    const quote = "the  map *is*\nidempotent";
    const source = "Recall that the map is idempotent on X.";
    expect(wholeQuoteMatch(quote, source).matched).toBe(true);
  });

  test("FAILS a paraphrase-wrapped verbatim core (a >=40-char inner run matches but the whole quote does not) — the AISM deviation this gate closes", () => {
    // A genuine long verbatim run, wrapped in paraphrased outer wording that never appears
    // in the source. AISM's own longest-run rule would PASS this; rk's whole-quote rule must FAIL it.
    const verbatimCore =
      "the fundamental structure theorem for idempotent probability measures on a locally compact semigroup";
    expect(verbatimCore.length).toBeGreaterThanOrEqual(40);
    const source = `Section 2.2 states: ${verbatimCore}, proved in Hognas-Mukherjea.`;
    const quote = `As the authors explain, ${verbatimCore}, which settles the classification.`;
    expect(wholeQuoteMatch(quote, source).matched).toBe(false);
  });

  test("FAILS a fabricated quote with no match at all", () => {
    expect(wholeQuoteMatch("this text is nowhere in the source", "completely unrelated content").matched).toBe(
      false,
    );
  });

  test("a short (<40 char) exact match still passes (short quotes are always held to exact match)", () => {
    expect(wholeQuoteMatch("idempotent map", "the idempotent map on X").matched).toBe(true);
  });
});

describe("locateQuote", () => {
  test("finds the first literal occurrence and reports its 1-indexed line", () => {
    const content = "line one\nline two has the target phrase here\nline three";
    const r = locateQuote(content, "the target phrase");
    expect(r).not.toBeNull();
    expect(r!.quote).toBe("the target phrase");
    expect(r!.line).toBe(2);
  });

  test("byte-verbatim: the returned quote is an exact substring of the raw content", () => {
    const content = "Recall that \\tilde{x} *emphasis* survives verbatim.";
    const r = locateQuote(content, "\\tilde{x} *emphasis*");
    expect(r).not.toBeNull();
    expect(content.includes(r!.quote)).toBe(true);
    expect(r!.quote).toBe("\\tilde{x} *emphasis*");
  });

  test("returns null when the pattern is not present", () => {
    expect(locateQuote("nothing to see here", "absent phrase")).toBeNull();
  });

  test("line number accounts for multiple preceding newlines", () => {
    const content = "a\nb\nc\nd target e";
    const r = locateQuote(content, "target");
    expect(r!.line).toBe(4);
  });

  test("locates on line 1 when the match is on the first line", () => {
    const r = locateQuote("hello world", "world");
    expect(r!.line).toBe(1);
  });

  test("the located quote round-trips through wholeQuoteMatch against its own source", () => {
    const content = "Theorem 3: every idempotent map on a compact semigroup is a projection.";
    const r = locateQuote(content, "every idempotent map on a compact semigroup");
    expect(r).not.toBeNull();
    expect(wholeQuoteMatch(r!.quote, content).matched).toBe(true);
  });
});
