// ROLE: Gate 3 — refs (proofs/<ws>/externals/*.json). Contract: docs/gate-contracts.md
// "Gate 3 — refs" (Checks 1-7); corpus/refs/*'s 11 fixtures. Calls src/refs/quote.ts's
// `wholeQuoteMatch` for the PASS/FAIL verdict — never re-derives the whole-quote-match rule
// (Tier-A boundary-review carry-forward, docs/reviews/2026-07-17-tier-a-boundary-review.md).
// The ">=40-char best matched run" FAIL diagnostic below is a longest-run computation for the
// finding MESSAGE ONLY — it must never feed the pass/fail decision, per that same carry-forward.
// Checks 6-7 (rk-wkzh / P2, docs/memos/2026-08-03-rk-improvement-plan-from-aism.md) are the two
// AISM-incident-driven tightenings: a matched quote must fall at the CLAIMED locus (I2), and an
// external naming a refs/ path with no extractable quote is an ERROR rather than a WARN skip (I3).
// The window arithmetic lives in ./refs-locus.ts (I4's form-feed ambiguity, and the 280-line cap).
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult, Finding } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";
import { normalizeQuoteText, wholeQuoteMatch } from "../refs/quote";
import { checkQuoteAtLocus } from "./refs-locus";
import { checkShardCitations } from "./refs-shard-citations";
import { readLockFacts, resolveQuotableText } from "./refs-extraction";

/** check-refs.py:44 — a refs/ locus embedded in freeform source text, e.g.
 * "refs/hos/joa-m.md:2300" or "refs/kitaev-2405.02434/approximate_algebras.tex:503-532". No
 * global flag: `.exec` on a fresh RegExp always finds the FIRST match only, mirroring AISM's
 * single `_REFS_RE.search(src)` (check-refs.py:114) — a source naming two or more refs/ loci is
 * checked against the first one only (gate-contracts.md Gate 3 Inputs, "Locus extraction takes
 * only the FIRST match"). */
const REFS_LOCUS_RE = /refs\/[A-Za-z0-9_./-]+(:[\d,-]+)?/;

/** check-refs.py:46 — a proofs/<ws> reference (the IMPORT marker). */
const PROOFS_REF_RE = /proofs\/[A-Za-z0-9_-]+/;

/** proofs/<ws>/externals/<file>.json — check-refs.py:168-172's glob, restated as a snapshot-key
 * pattern (RepoSnapshot has no directory walk of its own; see src/gates/snapshot.ts). */
const EXTERNAL_PATH_RE = /^proofs\/([^/]+)\/externals\/[^/]+\.json$/;

interface ExternalFile {
  path: string;
  raw: string;
}

function collectExternals(snapshot: RepoSnapshot): ExternalFile[] {
  const out: ExternalFile[] = [];
  for (const [path, raw] of snapshot) {
    if (EXTERNAL_PATH_RE.test(path)) out.push({ path, raw });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Port of check-refs.py:63-74 `extract_quote`. Prefer the double-quoted run immediately
 * following the literal token VERBATIM anywhere in `src` (dotall — the quote may itself span
 * newlines); else fall back to the LONGEST double-quoted run anywhere in `src`, first-of-equal-
 * length winning ties (mirrors Python's `max`, which keeps the first maximal element it sees).
 * Returns the raw, un-normalized quote text, or null when `src` has no double-quoted text at
 * all. Exported for the extraction-preference-order unit tests. */
export function extractQuote(src: string): string | null {
  const verbatimMatch = /VERBATIM[^"]*"([\s\S]*?)"/.exec(src);
  if (verbatimMatch) return verbatimMatch[1]!;
  const re = /"([\s\S]*?)"/g;
  let best: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const cand = m[1]!;
    if (cand.trim() === "") continue;
    if (best === null || cand.length > best.length) best = cand;
  }
  return best;
}

/** refs/<path>:<lines> -> <path> (check-refs.py:101-105 `refs_file_for`'s path half; the
 * line-range suffix is advisory and stripped, never used for lookup). Exported for the
 * locus-selection unit tests. */
export function refsFilePath(locus: string): string {
  return locus.replace(/:[\d,-]+$/, "").replace(/[:;,]+$/, "");
}

/** Longest contiguous run of `qn` (length >= minRun) that appears literally as a substring of
 * `tn`. MESSAGE-ONLY diagnostic (carry-forward, docs/reviews/2026-07-17-tier-a-boundary-
 * review.md: "the n/m diagnostic requires a longest-run computation ... for the message ONLY —
 * it must never touch the verdict"). Mirrors check-refs.py:90-98's search shape (longest length
 * first, first-found start wins) but this function's return value must NEVER be compared against
 * `minRun` to decide pass/fail — only `wholeQuoteMatch` (src/refs/quote.ts) decides that. Returns
 * 0 when no run of at least `minRun` chars matches (including when `qn` itself is shorter than
 * `minRun`). Exported for direct unit testing of the diagnostic in isolation from the gate. */
export function longestMatchingRunLength(qn: string, tn: string, minRun: number): number {
  const L = qn.length;
  if (L < minRun) return 0;
  for (let length = L; length >= minRun; length--) {
    for (let start = 0; start + length <= L; start++) {
      if (tn.includes(qn.slice(start, start + length))) return length;
    }
  }
  return 0;
}

export type ExternalVerdict = "pass" | "fail" | "skip_import" | "skip_noquote";

/** Classification only (check-refs.py:108-133's branching, without the payload/match checks) —
 * exported so skip_import vs skip_noquote can be unit-tested directly, never merged into one
 * bucket (docs/gate-contracts.md Gate 3 Divergences: "a skip is always visible with a count", the
 * two skip reasons must stay distinguishable). */
export function classifyExternal(src: string): {
  verdict: "skip_import" | "skip_noquote" | "quote";
  refsLocus: string | null;
  quote: string | null;
} {
  const proofsRef = PROOFS_REF_RE.exec(src);
  const refsLocusMatch = REFS_LOCUS_RE.exec(src);
  const refsLocus = refsLocusMatch ? refsLocusMatch[0] : null;
  const quote = extractQuote(src);
  const hasQuote = !!(quote && quote.trim() !== "");

  if (proofsRef && !refsLocus) {
    return { verdict: "skip_import", refsLocus: null, quote: null };
  }
  if (!(refsLocus && hasQuote)) {
    return { verdict: "skip_noquote", refsLocus, quote: hasQuote ? quote : null };
  }
  return { verdict: "quote", refsLocus, quote };
}

export const refsGate: Gate = {
  name: "refs",
  run(snapshot: RepoSnapshot, config: GateConfig): GateResult {
    const externals = collectExternals(snapshot);
    const lockFacts = readLockFacts(snapshot);
    const shardCitations = checkShardCitations(snapshot);
    const findings: Finding[] = [];

    let passed = 0;
    let failed = 0;
    let importSkipped = 0;
    let noQuoteSkipped = 0;

    for (const ext of externals) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ext.raw);
      } catch (e) {
        failed++;
        // structural: parse error (docs/gate-contracts.md "Phase matrix").
        findings.push({
          severity: "ERROR",
          path: ext.path,
          message: `unparseable JSON: ${(e as Error).message}`,
          structural: true,
        });
        continue;
      }
      // rk-6r3 / M0.3 review finding 7: a syntactically-valid JSON document that isn't an object
      // (`null`, an array, a bare string/number/boolean) must never reach the `obj.source` access
      // below uncast — same hard-FAIL treatment as the unparseable-JSON branch just above (never a
      // skip, never a thrown exception that would kill the rest of the composed `rk check`).
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        failed++;
        const shape = parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed;
        // structural: parse error (docs/gate-contracts.md "Phase matrix") — same class as the
        // unparseable-JSON branch just above.
        findings.push({
          severity: "ERROR",
          path: ext.path,
          message: `malformed external: expected a JSON object, got ${shape}`,
          structural: true,
        });
        continue;
      }
      const obj = parsed as { source?: unknown };
      const src = typeof obj.source === "string" ? obj.source : "";

      const cls = classifyExternal(src);

      if (cls.verdict === "skip_import") {
        importSkipped++;
        continue;
      }

      if (cls.verdict === "skip_noquote") {
        // Check 7 (rk-wkzh / P2 item 2; AISM incident I3, docs/memos/2026-08-03-aism-postmortem/
        // 07-refs-report.md): a source that NAMES a refs/ path but carries no extractable quote is
        // a citation the fabrication gate cannot check at all — "green must never mean we couldn't
        // parse." In AISM five of the campaign's newest citations drifted off the freeform
        // `refs/...:lines VERBATIM: "..."` convention and rode this WARN straight past the gate.
        // A source with NO refs/ locus is a different animal (numerical evidence, prose notes —
        // nothing was ever claimed to be quoted) and keeps the WARN skip.
        if (cls.refsLocus) {
          failed++;
          findings.push({
            severity: "ERROR",
            path: ext.path,
            message:
              `external names refs locus ${cls.refsLocus} but carries no double-quoted verbatim ` +
              `text — the claimed citation cannot be byte-verified at all (a skip here is a silent ` +
              `exemption from the fabrication gate, not a legitimate no-quote external)`,
          });
          continue;
        }
        noQuoteSkipped++;
        const reasons = ["no refs/ locus"];
        if (!cls.quote) reasons.push("no double-quoted verbatim text");
        findings.push({
          severity: "WARN",
          path: ext.path,
          message: `skip_noquote: ${reasons.join("; ")}`,
        });
        continue;
      }

      // refs-quote external — checks 2-4. Which bytes to match against is ./refs-extraction.ts's
      // decision, not this loop's: a PDF payload resolves to its chained extraction layer and an
      // unresolvable one (absent payload, absent/stale/tampered extraction) is a counted FAIL —
      // never a silent fallback to raw PDF streams that no quote can ever occur in (rk-we5i).
      const fp = refsFilePath(cls.refsLocus!);
      const resolved = resolveQuotableText(snapshot, lockFacts, fp);
      if (!resolved.ok) {
        failed++;
        findings.push({ severity: "ERROR", path: ext.path, message: resolved.reason });
        continue;
      }
      const refsText = resolved.text;

      const { matched, normalizedQuote } = wholeQuoteMatch(cls.quote!, refsText);
      if (matched) {
        // Check 6 (rk-wkzh / P2 item 1; AISM incident I2). Runs ONLY after the whole-quote match
        // has already succeeded: it constrains WHERE a matched quote may fall and can never
        // rescue a quote that failed the match (the FAIL branch below is unreachable from here).
        // See src/gates/refs-locus.ts for the dual-convention (\n vs \n+\x0c) rule the I4
        // form-feed ambiguity forces.
        const atLocus = checkQuoteAtLocus(
          cls.refsLocus!,
          cls.quote!,
          refsText,
          config.refsLocusToleranceLines,
        );
        if (atLocus.ok) {
          passed++;
          continue;
        }
        failed++;
        findings.push({ severity: "ERROR", path: ext.path, message: atLocus.message! });
        continue;
      }

      failed++;
      const minRun = config.refsMinRunReportingLength;
      const normalizedRefs = normalizeQuoteText(refsText);
      const runLen = longestMatchingRunLength(normalizedQuote, normalizedRefs, minRun);
      if (normalizedQuote.length >= minRun && runLen >= minRun) {
        findings.push({
          severity: "ERROR",
          path: ext.path,
          message:
            `claimed VERBATIM quote NOT found as a whole (best matched run: ${runLen}/${normalizedQuote.length} ` +
            `chars) — word-level mismatch / fabrication, or a genuine quote wrapped in paraphrase`,
        });
      } else {
        findings.push({
          severity: "ERROR",
          path: ext.path,
          message: `claimed VERBATIM quote NOT found (word-level mismatch / fabrication)`,
        });
      }
    }

    findings.push(...shardCitations.findings);
    const total = externals.length;
    return {
      findings,
      coverage: [
        {
          gate: "refs",
          checked: passed,
          total,
          unit: `externals byte-verified, ${failed} failed, ${importSkipped} import-skipped, ${noQuoteSkipped} no-quote-skipped; checked ${shardCitations.checked}/${shardCitations.total} shard citations`,
        },
      ],
    };
  },
};
