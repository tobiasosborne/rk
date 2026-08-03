// Unit tests for src/gates/refs-locus.ts — Gate 3's quote-at-locus window check (P2 item 1,
// docs/memos/2026-08-03-rk-improvement-plan-from-aism.md; incidents I2/I4 in
// docs/memos/2026-08-03-aism-postmortem/07-refs-report.md). Pure: no fs, no fixture directory.
//
// The three properties this file exists to pin:
//  - the `:<lines>` grammar (N, N-M, N,M, absent) is parsed the way the AISM locus regex
//    `(:[\d,-]+)?` allows, and an absent/digit-less suffix makes the check VACUOUS (never a
//    fabricated window);
//  - line arithmetic runs on the RAW refs text under BOTH conventions (`\n`-only, like grep -n /
//    wc -l; and `\n`+`\x0c`, like Python's splitlines) — I4: the same recorded locus resolves
//    ~546 lines apart depending on the reader, so a window satisfied under EITHER convention
//    PASSes;
//  - `normalizeWithOffsets` never drifts from `normalizeQuoteText` (src/refs/quote.ts) — the
//    offsets are only meaningful if the text they index is byte-identical to what
//    `wholeQuoteMatch` matched against.

import { describe, expect, test } from "bun:test";
import {
  checkQuoteAtLocus,
  lineNumbersAt,
  normalizeWithOffsets,
  parseLocusWindow,
} from "../../src/gates/refs-locus";
import { normalizeQuoteText } from "../../src/refs/quote";

const FF = "\x0c";

describe("parseLocusWindow — the `:<lines>` grammar", () => {
  test("single line number N -> the degenerate window N..N", () => {
    expect(parseLocusWindow("refs/src-x/paper.md:5")).toEqual({ start: 5, end: 5 });
  });

  test("range N-M -> N..M", () => {
    expect(parseLocusWindow("refs/kitaev-2405.02434/approximate_algebras.tex:503-532")).toEqual({
      start: 503,
      end: 532,
    });
  });

  test("comma list N,M -> the SPAN N..M (settled: a list is read as its enclosing span)", () => {
    expect(parseLocusWindow("refs/hos/joa-m.md:10,12,15")).toEqual({ start: 10, end: 15 });
  });

  test("a locus with NO line suffix has no window at all (check is vacuous)", () => {
    expect(parseLocusWindow("refs/src-x/paper.md")).toBeNull();
  });

  test("a suffix with separators but no digits is NOT a window (never a fabricated 0..0)", () => {
    expect(parseLocusWindow("refs/src-x/paper.md:-")).toBeNull();
    expect(parseLocusWindow("refs/src-x/paper.md:,")).toBeNull();
  });

  test("only a TRAILING suffix counts — a colon inside the path is not a line window", () => {
    expect(parseLocusWindow("refs/src:9/paper.md")).toBeNull();
  });
});

describe("normalizeWithOffsets — never drifts from normalizeQuoteText", () => {
  const CASES = [
    "",
    "   ",
    "plain text",
    "  leading and trailing  ",
    "a * b", // star removal must let the two whitespace runs collapse into ONE space
    "a*b",
    "a  b",
    "\\$100 and \\$200",
    "\\\\$x", // backslash-backslash-dollar: the SECOND backslash pairs with $
    "\\*$",
    `line one${FF}line two`,
    `${FF}${FF}leading form feeds`,
    "***",
    "tabs\tand\nnewlines\r\nmixed",
  ];

  for (const [i, s] of CASES.entries()) {
    test(`case ${i}: text is byte-identical to normalizeQuoteText`, () => {
      expect(normalizeWithOffsets(s).text).toBe(normalizeQuoteText(s));
    });
  }

  test("fuzz (deterministic LCG, 500 bounded samples): text is byte-identical", () => {
    const alphabet = ["a", "b", " ", "\t", "\n", FF, "*", "\\", "$", '"'];
    let seed = 20260803;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let n = 0; n < 500; n++) {
      let s = "";
      const len = next() % 40;
      for (let k = 0; k < len; k++) s += alphabet[next() % alphabet.length]!;
      expect(normalizeWithOffsets(s).text).toBe(normalizeQuoteText(s));
    }
  });

  test("offsets index the RAW string: each normalized char maps to where it came from", () => {
    const raw = "  ab*c  de";
    const { text, offsets } = normalizeWithOffsets(raw);
    expect(text).toBe("abc de");
    // a->2, b->3, c->5 (the `*` at 4 is dropped), ' '->6 (the run's FIRST char), d->8, e->9
    expect(offsets).toEqual([2, 3, 5, 6, 8, 9]);
  });

  test("a collapsed whitespace run maps to the run's first raw character", () => {
    const raw = `x${FF}\n\n y`;
    const { text, offsets } = normalizeWithOffsets(raw);
    expect(text).toBe("x y");
    expect(offsets).toEqual([0, 1, 5]);
  });
});

describe("lineNumbersAt — dual-convention line counting over RAW text (I4)", () => {
  test("`\\n`-only and `\\x0c`-aware agree when there are no form feeds", () => {
    const raw = "one\ntwo\nthree";
    const [a, b, c] = lineNumbersAt(raw, [0, 4, 8]);
    expect(a).toEqual({ lf: 1, ff: 1 });
    expect(b).toEqual({ lf: 2, ff: 2 });
    expect(c).toEqual({ lf: 3, ff: 3 });
  });

  test("a form feed terminates a line under the `\\x0c`-aware convention only (I4)", () => {
    const raw = `one${FF}two\nthree`;
    const [a, b, c] = lineNumbersAt(raw, [0, 4, 8]);
    expect(a).toEqual({ lf: 1, ff: 1 });
    expect(b).toEqual({ lf: 1, ff: 2 }); // grep -n says line 1; splitlines says line 2
    expect(c).toEqual({ lf: 2, ff: 3 });
  });

  test("indices are answered correctly regardless of the order they are asked in", () => {
    const raw = "a\nb\nc\nd";
    expect(lineNumbersAt(raw, [6, 0, 4, 2])).toEqual([
      { lf: 4, ff: 4 },
      { lf: 1, ff: 1 },
      { lf: 3, ff: 3 },
      { lf: 2, ff: 2 },
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// checkQuoteAtLocus — the actual check. Every case below assumes whole-quote-match ALREADY
// succeeded (that is the only caller); this function constrains WHERE the match may fall.
// ---------------------------------------------------------------------------------------------

/** `n` lines of filler, then `quote` on its own line, then filler — quote lands on line `at`. */
function payloadWithQuoteAtLine(at: number, quote: string, trailing = 3): string {
  const lines: string[] = [];
  for (let i = 1; i < at; i++) lines.push(`filler line ${i} of the reference payload`);
  lines.push(quote);
  for (let i = 0; i < trailing; i++) lines.push("trailing filler");
  return lines.join("\n");
}

const QUOTE = "the always-tight hulls are disjoint";

describe("checkQuoteAtLocus — window semantics", () => {
  test("no line suffix on the locus: vacuous PASS (today's behavior, unchanged)", () => {
    const r = checkQuoteAtLocus("refs/src-x/paper.md", QUOTE, payloadWithQuoteAtLine(400, QUOTE), 50);
    expect(r.ok).toBe(true);
    expect(r.window).toBeNull();
    expect(r.message).toBeNull();
  });

  test("match exactly at the claimed line: PASS", () => {
    const r = checkQuoteAtLocus("refs/src-x/paper.md:100", QUOTE, payloadWithQuoteAtLine(100, QUOTE), 50);
    expect(r.ok).toBe(true);
  });

  test("tolerance boundary: +50 from the claimed line PASSes, +51 FAILs", () => {
    const inside = checkQuoteAtLocus("refs/src-x/paper.md:100", QUOTE, payloadWithQuoteAtLine(150, QUOTE), 50);
    expect(inside.ok).toBe(true);
    const outside = checkQuoteAtLocus("refs/src-x/paper.md:100", QUOTE, payloadWithQuoteAtLine(151, QUOTE), 50);
    expect(outside.ok).toBe(false);
  });

  test("tolerance boundary, the other direction: -50 PASSes, -51 FAILs", () => {
    const inside = checkQuoteAtLocus("refs/src-x/paper.md:100", QUOTE, payloadWithQuoteAtLine(50, QUOTE), 50);
    expect(inside.ok).toBe(true);
    const outside = checkQuoteAtLocus("refs/src-x/paper.md:100", QUOTE, payloadWithQuoteAtLine(49, QUOTE), 50);
    expect(outside.ok).toBe(false);
  });

  test("the tolerance is the CONFIGURED number, not a hardcoded 50", () => {
    const payload = payloadWithQuoteAtLine(160, QUOTE);
    expect(checkQuoteAtLocus("refs/src-x/paper.md:100", QUOTE, payload, 50).ok).toBe(false);
    expect(checkQuoteAtLocus("refs/src-x/paper.md:100", QUOTE, payload, 60).ok).toBe(true);
  });

  test("a claimed RANGE is satisfied by a match anywhere inside it (span overlap, not point)", () => {
    const r = checkQuoteAtLocus("refs/src-x/paper.md:500-540", QUOTE, payloadWithQuoteAtLine(520, QUOTE), 0);
    expect(r.ok).toBe(true);
  });

  test("a multi-line quote whose SPAN overlaps the window PASSes", () => {
    const multi = "first half of the sentence\nsecond half of the sentence";
    const payload = payloadWithQuoteAtLine(100, multi);
    // Quote occupies raw lines 100-101; claimed 101 with zero tolerance still overlaps.
    expect(checkQuoteAtLocus("refs/src-x/paper.md:101", multi, payload, 0).ok).toBe(true);
    expect(checkQuoteAtLocus("refs/src-x/paper.md:103", multi, payload, 0).ok).toBe(false);
  });

  test("multiple occurrences: ONE inside the window is enough (never accuse on the first)", () => {
    const lines: string[] = [];
    for (let i = 1; i <= 300; i++) lines.push(i === 10 || i === 200 ? QUOTE : `filler ${i}`);
    const r = checkQuoteAtLocus("refs/src-x/paper.md:200", QUOTE, lines.join("\n"), 5);
    expect(r.ok).toBe(true);
    expect(r.occurrences).toHaveLength(2);
  });
});

describe("checkQuoteAtLocus — the I4 either-convention rule", () => {
  /** Quote at `\n`-line 10 but `\x0c`-line 300: 290 form feeds sit above it. */
  function formFeedPayload(): string {
    const head: string[] = [];
    for (let i = 1; i <= 9; i++) head.push(`filler line ${i}`);
    return `${head.join("\n")}\n${FF.repeat(290)}${QUOTE}\ntail`;
  }

  test("plausible under the `\\x0c`-aware convention only: PASS (I4 is not a fabrication)", () => {
    const r = checkQuoteAtLocus("refs/lee-smooth/lee.txt:300", QUOTE, formFeedPayload(), 50);
    expect(r.ok).toBe(true);
  });

  test("plausible under the `\\n`-only convention only: PASS", () => {
    const r = checkQuoteAtLocus("refs/lee-smooth/lee.txt:10", QUOTE, formFeedPayload(), 50);
    expect(r.ok).toBe(true);
  });

  test("outside BOTH conventions: FAIL, and the message reports both readings and the tolerance", () => {
    const r = checkQuoteAtLocus("refs/lee-smooth/lee.txt:2000", QUOTE, formFeedPayload(), 50);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("2000");
    expect(r.message).toContain("10"); // the \n-only reading
    expect(r.message).toContain("300"); // the \x0c-aware reading
    expect(r.message).toContain("50"); // the tolerance
    expect(r.message).toContain("\\x0c");
    expect(r.occurrences[0]).toEqual({ lfStart: 10, lfEnd: 10, ffStart: 300, ffEnd: 300 });
  });
});

describe("checkQuoteAtLocus — never accuses when it cannot locate", () => {
  test("a quote that does not occur in the payload at all is NOT a locus failure", () => {
    // Defensive: unreachable from the gate (whole-quote-match runs first and would have FAILed),
    // but the window check must never manufacture a second finding for a content mismatch.
    const r = checkQuoteAtLocus("refs/src-x/paper.md:100", "never written here", payloadWithQuoteAtLine(5, QUOTE), 50);
    expect(r.ok).toBe(true);
    expect(r.occurrences).toEqual([]);
  });

  test("an empty-normalized quote is NOT a locus failure (the match rule already rejected it)", () => {
    const r = checkQuoteAtLocus("refs/src-x/paper.md:100", "***", payloadWithQuoteAtLine(5, QUOTE), 50);
    expect(r.ok).toBe(true);
  });
});
