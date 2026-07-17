<!-- ROLE: committed review record (Fable Tier-A boundary review pre-M0.3, of ef74eac
     + M0.6 quote slice). UPDATE POLICY: append-only. TRIGGER: read by the corrections
     implementer and by all M0.3 gate implementers (see Carry-forward). -->

# Fable Tier-A boundary review — pre-M0.3 (contract @ ef74eac, M0.6 quote slice)

Overall verdict: **GREEN-WITH-CORRECTIONS** for the M0.3 fan-out.

## Ruling ratifications

- **F5 reversal: RATIFIED.** Zero-cost verified stronger than claimed: `git log --all
  -S "kind: cited"` shows the string only ever existed in definitions/README.md (which
  is in check-defs.py's SKIP set) — zero cost by construction over all history.
- **#4/#5 reframes: RATIFIED** (architectural gap verified — check-refs.py has no
  registry import; M2.6 plan text covers both runs and shards mirrors).
- **F4 repurposing: RATIFIED WITH TWO CORRECTIONS** (baseline re-pin; flood number).
- **Triage tags: refs-07 rk-stricter-intended ratified; provenance-11
  rk-stricter-intended ratified** (not message-only: it changes what gets scanned).

## Corrections (owner in brackets)

1. **[code, Major]** `wholeQuoteMatch` false-PASSes quotes that normalize to empty —
   `src/refs/quote.ts:32-36`, `""`.includes ⇒ always true; `"***"` matches anything.
   AISM guards this (check-refs.py:84-85). Reachable via extract_quote (`"***"`
   survives the strip filter). Fix: empty-normalized-quote ⇒ never matched, + red test
   (degenerate cases: `""`, `"***"`, `"* \n *"`). Becomes a Blocker the moment M0.3
   consumes the function; no refs-gate code may land on the unguarded version.
2. **[contract, Major]** Gate 3 check 4: add "an empty normalized quote never matches
   ⇒ FAIL" (mirror check-refs.py:84-85).
3. **[contract, Major]** Re-pin the robustness-run baseline: AISM HEAD scripts replayed
   on each historical tree via the module-import harness (the pin was lost in the F4
   rewrite; "rk's HEAD-contract gates" is a category mix-up).
4. **[contract, Major]** Operational "finding-flood" definition: a single check
   emitting >25 findings on one tree, or a check erroring on a majority of its checked
   units, unless attributable to one triaged root cause. (N=25 per reviewer suggestion;
   TJO may retune.)
5. **[contract, Minor]** Gate 1 check 9 garbled sentence (dangling "otherwise") — use
   check 8's "if absent/empty" pattern.
6. **[contract, Minor]** sha256 table cell: "ERROR when absent or `-`" (align with
   check 9); cell format now contradictory for cited shards.
7. **[contract, Minor]** Tag taxonomy note: `[message-only]`/`[crash-to-finding]` are
   verdict-neutral, trigger-preserving subclasses outside the L5 triad (state once, so
   mechanical triage audits don't flag them); state the provenance-11 vs shards
   PREFIX/MAX_LINES tag asymmetry justification where the tags diverge.
8. **[fixture, Minor]** defs-15 expected.json: stale "not yet landed" note; weak
   `message_pattern: "cited"` (matches the value-validation error too — use "missing
   required" + add a second finding entry for sha256). refs-07 notes cite renamed
   "Deviations" section.
9. **[code, Minor]** quote.ts:4 citation wrong: normalize is check-refs.py:49-61,
   not 38-45.
10. **[contract, Question→one line]** Whitespace-class divergence JS vs Python `\s`
    (U+FEFF): one Known-limitations line; no code change. Neither side does Unicode
    NFC/NFD (parity false-RED both sides — acceptable).

## Regression audit

77a488e → ef74eac: beyond intended F5 + F4 changes, **no check's pass/fail semantics
changed**. Authority preamble consistent with L5/D9. Harness-pitfall claims verified.

## M0.6 slice — remaining edges all clean

Multi-line quotes, 40-char boundary (correctly no branch), duplicate-occurrence,
refs-07 unit analog, round-trip test, path traversal — all covered. Nit (Tier B/C):
CLI arg guard for `rk refs quote <id> ""`.

## Carry-forward for M0.3 gate implementers

- Call `wholeQuoteMatch` (post-guard); never re-derive the rule. The ≥40-char "best
  matched run: n/m chars" FAIL diagnostic needs a longest-run computation implemented
  in the GATE for the message only — it must never touch the verdict.
- Gate 1 checks 8–9: presence sub-checks unconditional; value sub-checks
  manifest-gated; `-` counts as missing sha256; defs-15's shard yields TWO ERRORs.
- Robustness run: AISM HEAD scripts via module-import harness (never cd+run);
  GIT_CEILING_DIRECTORIES pinned for check-report-shards.sh; per-gate comparison;
  L5-triad triage; zero rk-bug is the bar.
- expected.json findings are subset-match (severity + path + message substring); empty
  findings array is a legal golden case.
