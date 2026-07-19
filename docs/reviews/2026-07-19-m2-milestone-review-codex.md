## LANDING-BLOCKERS

1. **BLOCKER — conflicted or tainted `proved` nodes are still painted and counted as rigorous.**  
   Files: `src/render/styling.ts:32-33`, `src/render/dashboard.ts:21-33`, `src/render/dag.ts:88-103`, `src/render/node-view.ts:69-73,114`.  
   Scenario: the existing `n-conflict` fixture has `status:"proved"` but `contractMatch:false`. It receives the green proved colour, “rigorous” tooltip/tier, contributes to the rigorous dashboard headline, and says `available (monotone-trust): true`; the nearby conflict text does not undo that visual overclaim. The same occurs for `status:"proved"` plus non-clean taint.  
   Resolution: retain the declared status text, but derive an effective presentation state from status + conflicts + computed taint. Any contradiction/non-clean taint must receive defect styling, must not count as rigorous or available, and must be labelled “declared proved; evidence conflicted/tainted.” Extend the corpus to assert every status across panel, DAG, dashboard, and legend, plus an actual unset node, tainted-proved, conflicted-proved, and orphan-proved cases.

2. **MAJOR — structurally incomplete/degraded projections render as complete reports.**  
   Files: `src/graph/from-registry.ts:57-60,79-90`, `src/store/build-graph.ts:58-63`, `src/cli/render.ts:34-56`, `src/cli/graph.ts:164-175`.  
   Scenario: a shard with missing/invalid `kind` produces a parser finding and `RegistrySkip`, but `rk render` discards the report and emits a smaller site with exit 0. Likewise an unavailable/degraded fr source becomes “no fr evidence,” not “fr could not be authoritatively read.”  
   Resolution: make build diagnostics first-class. Structural parse/conversion loss must block render/graph output; degraded af/fr fallbacks and absent optional stores must be visibly distinguished from authoritative empty stores in both terminal output and the HTML. Assert candidate = projected + rejected and raw-log = non-join-surface + join-surface + malformed.

3. **BLOCKER — Gate 7 does not protect M2.4’s actual generated HTML, and unknown generators green-light unchecked artifacts.**  
   Files: `src/gates/freshness.ts:42-45,171-179,207-216`, `src/cli/render.ts:38-45`, `test/gates/freshness.test.ts:94-106`.  
   Scenario: `rk render` writes `build/site/index.html` but neither registers nor updates a manifest entry, while Gate 7 recognizes only the old linker mirrors. Editing the HTML therefore passes `rk check`; even a declared HTML entry with a typo/unsupported generator exits green at `checked 0/1`.  
   Resolution: integrate a real `render-site-v1` regenerate-and-diff path using an edge-prepared authoritative GraphDocument, have `rk render` adopt its repo-relative output in `.rk/generated.json`, and make every unknown generator a blocking manifest ERROR. Gate 7 remains pure by comparing supplied expected bytes; af/fr/fs regeneration belongs at the edge.

4. **MAJOR — the runtime manifest parser does not enforce `schemas/generated.v1.json`.**  
   Files: `src/gates/freshness.ts:52-61,84-119`; contract: `schemas/generated.v1.json:7-33`.  
   Scenario: a manifest missing `schema_version`, carrying `"schema_version":"2"`, top-level extra keys, or per-entry extra keys is accepted despite the versioned schema requiring version `"1"` and `additionalProperties:false`. A future incompatible manifest can silently run under v1 semantics.  
   Resolution: runtime-enforce the complete schema surface—exact version, required/exclusive keys, exact entry shape—and add red fixtures for wrong/missing version and extra properties.

5. **MAJOR — the af join implements whitespace-normalized equality, not the ratified byte-match.**  
   File: `src/graph/from-af.ts:36-37,79-86`.  
   Scenario: registry contract `"A  B"` and af root statement `"A B"` yield `contractMatch:true`, suppressing the mandatory `contract-mismatch`, despite graph v1 defining this as a byte-match verdict.  
   Resolution: compare the two strings exactly. Add a whitespace-only byte-difference fixture; do not reuse Gate 2’s older normalized contract check at this projection boundary.

6. **BLOCKER — unknown verdict freshness is treated as fresh.**  
   Files: `src/store/fr-load.ts:10-17,71-81`, `src/graph/validate-conflicts.ts:69-81`.  
   Scenario: a banked edge with `verdict:"banked"` but no matching oracle freshness record—or any ledger-fallback edge, where freshness cannot be recomputed—has `verdictFresh:undefined`. Because `undefined !== false`, it is considered oracle-backed and the required conflict disappears.  
   Resolution: require `verdictFresh === true`. Add primary-export and degraded-fallback fixtures for `verdict:"banked"` with freshness absent.

7. **MAJOR — superseded fr evidence still creates live conflicts.**  
   File: `src/graph/validate-conflicts.ts:69-83`; contrary contract: `src/graph/types-edges.ts:101-105`.  
   Scenario: cycle 2 supersedes a banked-without-oracle cycle 1, but cycle 1 continues producing a conflict indefinitely.  
   Resolution: derive the set of superseded cycle IDs from all `supersedes` fields and exclude those edges from promotion/conflict computation. Add superseded and unsuperseded sibling fixtures.

8. **MAJOR — two live banked-without-oracle edges resolving to one node produce an invalid freshly assembled document.**  
   Files: `src/graph/validate-conflicts.ts:34-35,69-85,107-128`, `src/graph/assemble.ts:67-74`.  
   Scenario: two unsuperseded banked cycles without fresh oracle verdicts resolve to the same node. Assembly emits two conflicts with the same `(kind,edge,nodeId)` identity; validation then reports them as duplicates.  
   Resolution: define this v1 conflict as one node-level existential defect and coalesce qualifying cycles per node. The individual cycles remain visible in `edges.fr`; no schema bump is needed.

9. **MAJOR — malformed raw fr lines silently disappear and can hide a banked conflict.**  
   File: `src/store/fr-load.ts:105-123`.  
   Scenario: a malformed nonblank JSONL row is skipped and `totalLogRecords` is incorrectly set to the number of successfully parsed rows. A corrupted banked record therefore vanishes from both accounting and conflict detection.  
   Resolution: count raw nonblank rows separately, carry parse failures as structural reader diagnostics, and prevent a degraded-but-corrupt source from rendering as an authoritative projection.

## FOLLOW-UPS

1. **Reject the built-in layout as the permanent M2.4 layout.** `src/render/dag.ts:5-14,65-77,129-139` provides neither crossing minimization nor zooming, and no AISM SC5 usability result supports overturning the settled vendored-dagre decision. This is layout/acceptance debt, not a validity blocker.

2. `src/render/site.ts:87-102` implements dashboard, DAG, and node panels only. Definitions/conventions views, dead-route graveyard, run gallery, provenance chains, af tree/events/verdict drill-down, and the SC5 third-party dry-run remain unfulfilled M2.4 scope.

3. `scripts/selftest.ts:210-240` should execute and report separate `corpus/graph` and `corpus/render` harness counts. Bun-test-only coverage makes these corpus trees easier to orphan despite the existing gate-corpus guard.

4. The proposed `proofs/<workspace>/...` resolver is sound only as an exact, segment-boundary, unique match against `RegistryNode.workspace`. Add a distinct discountable `workspace-prefix` resolution method; ambiguous, absolute, traversing, or non-normalized paths remain unresolved. Because `resolutionMethod` is closed in graph v1, this belongs in graph v2 rather than being mislabeled as `path`.

5. `rk render --out` should be a safe repo-relative managed path. Reject absolute paths and `..` escapes for this command so every output can be freshness-declared; add a separately named unmanaged export option later if scratch/central output is genuinely needed.

6. `src/graph/assemble.ts:78-89` should distinguish source-record counts from af node-attempt counts. Two nodes sharing one workspace currently yield `afRecordsIn=1` but two resolved edges, making the report’s apparent accounting equation misleading.

7. Add a regression test proving the one-level `.rk/` snapshot inclusion leaves all prior gates byte-identical. Current consumers are prefix-scoped, so no existing gate appears affected.

8. Update CLI/help wording that still says “six M0 gates” after config and freshness are included.

**Verdict:** Under the repository’s two-list policy, M2 is sound to close after the nine validity fixes above are mechanically verified and branches B and C are merged; the critical-path over-inclusion rule is ratified because every real node reachable through any AND dependency or OR member is included, so M3.4 can lose batching opportunities but cannot under-exclude on a schema-valid document, and `northStarId` validation is adequate provided consumers fail closed on absent/unknown IDs. Explicitly: **(a)** reject the built-in layout as the permanent replacement for dagre; **(b)** ratify the exact, unique workspace-prefix method as a discountable graph-v2 method; **(c)** defer a conflict schema bump and coalesce v1 conflicts at node level; **(d)** yes, selftest should execute/count graph and render harnesses; **(e)** reject current absolute-path semantics for managed `--out`; **(f)** keep `freshness-05` permanently. The per-path Check-11 supersession rule itself is ratified, declared-but-missing semantics are correct, and malformed-manifest coverage must remain.