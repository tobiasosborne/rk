// ROLE: Gate 2 — argument/linker (argument/**/*.md, recursive). Contract: docs/gate-contracts.md
// "Gate 2 — argument / linker". Orchestrates parseRegistry (linker-parse.ts, checks 1-5),
// checkAcyclic/checkImports/checkStatus/checkContracts/checkOrphans/checkBrittleness +
// af-workspace introspection (linker-graph.ts, checks 6-10, 12), checkGenerated
// (linker-render.ts, check 11), checkCriticalPathProvenance (linker-crossvendor.ts, check 13 —
// M3.8), and checkL5Promotion (linker-l5.ts, check 14 — M3.8).
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import type { GateConfig } from "./config";
import { loadDefIds, parseRegistry } from "./linker-parse";
import {
  checkAcyclic,
  checkBrittleness,
  checkContracts,
  checkImports,
  checkOrphans,
  checkStatus,
  introspectWorkspace,
  scanWorkspaces,
} from "./linker-graph";
import { introspectRootIdentity, type RootIdentityFacts } from "./linker-workspace";
import { checkGenerated } from "./linker-render";
import { freshnessSupersededPaths } from "./freshness";
// M3.8 (EDIT flagged for the M3 boundary review — this is Gate 2, L6 validity semantics): the
// critical-path cross-vendor/batch provenance check (PRD C2/C9) and the L5-promotion integration
// (l5-promote.ts's own module header names this file as the wiring point).
import { checkCriticalPathProvenance } from "./linker-crossvendor";
import { checkL5Promotion } from "./linker-l5";

export const linkerGate: Gate = {
  name: "linker",
  run(snapshot: RepoSnapshot, config: GateConfig): GateResult {
    const { lemmas, errors: parseErrors, total, ignored } = parseRegistry(snapshot);
    const defIds = loadDefIds(snapshot);
    const wsDirs = scanWorkspaces(snapshot);

    // af-workspace facts (contract text + node count), gathered only for shards with an
    // introspectable workspace — argument.py:684-690. A shard with af != "none" but no
    // `workspace:` field, or one whose declared dir has no ledger, is simply absent from both
    // maps (silently skipped from the contract/brittleness checks; still caught by checkOrphans).
    const wsContracts = new Map<string, string>();
    const nodeCounts = new Map<string, number>();
    // M3.8: root identity provenance (author/validatedBy/validationBatchId), gathered over the
    // SAME introspectable-workspace population as wsContracts/nodeCounts above — a shard with no
    // introspectable workspace is already absent from those maps (silently skipped from the
    // contract/brittleness checks; caught by checkOrphans), and is likewise simply absent here.
    const identityOf = new Map<string, RootIdentityFacts>();
    for (const l of lemmas) {
      if (l.af === "none" || l.workspace === undefined) continue;
      const facts = introspectWorkspace(snapshot, l.workspace);
      if (facts) {
        wsContracts.set(l.id, facts.contract);
        nodeCounts.set(l.id, facts.nodes);
      }
      const identity = introspectRootIdentity(snapshot, l.workspace);
      if (identity) identityOf.set(l.id, identity);
    }

    // M2.6 (bead-tracked via docs/gate-contracts.md's Gate 7 "Check 11 boundary"): a manifest
    // entry supersedes Check 11's own byte-diff for its path ONLY when src/gates/freshness.ts
    // recognizes that entry's generator — never merely because SOME .rk/generated.json exists
    // (see freshness.ts's own doc comment for why the boundary is drawn per-path, not per-repo).
    const superseded = freshnessSupersededPaths(snapshot);
    const { findings: generatedFindings, mirrorStatus } = checkGenerated(snapshot, lemmas, superseded);

    // M3.8 (Check 13): critical-path cross-vendor/batch provenance — presence-conditional on
    // config.northStarId (M2.5's own "no default" stance; PRD C2's own contract).
    const crossVendor = checkCriticalPathProvenance(lemmas, config.northStarId, identityOf);
    // M3.8 (Check 14): L5 stated->proved-mod-audit promotion — presence-conditional on
    // `.rk/l5-verdicts.jsonl` (M3.7's store).
    const l5 = checkL5Promotion(snapshot, lemmas);

    const findings = [
      ...parseErrors,
      ...checkAcyclic(lemmas),
      ...checkImports(lemmas, defIds),
      ...checkStatus(lemmas),
      ...checkContracts(lemmas, wsContracts),
      ...checkOrphans(lemmas, wsDirs),
      ...generatedFindings,
      ...checkBrittleness(lemmas, nodeCounts, config.linkerBrittlenessSoftCap),
      ...crossVendor.findings,
      ...l5.findings,
    ];

    // rk-9pk (dogfood-1): the count of README.md/INDEX.md/DAG.md files excluded from the
    // recursive argument/**/*.md scan is always named on the coverage line, zero included — never
    // a silent skip (CLAUDE.md L2). Names are paths relative to argument/, so a root-level file
    // reads as its bare name ("README.md") and a nested one carries its subpath
    // ("lemmas/README.md"), disambiguating same-named files at different depths.
    const ignoredNote =
      ignored.length === 0
        ? "0 non-shard files ignored"
        : `${ignored.length} non-shard file${ignored.length === 1 ? "" : "s"} ignored: ${ignored.join(", ")}`;

    // R14 (bead rk-1rv): each mirror's adoption status is always named in the coverage line,
    // present or absent — never a silent skip when a repo hasn't adopted the transitional
    // markdown mirror (docs/gate-contracts.md Gate 2 Check 11).
    const mirrorsNote = mirrorStatus
      .map(
        (m) =>
          `${m.label} ${m.superseded ? "superseded (see freshness gate)" : m.present ? "present" : "absent (not adopted)"}`,
      )
      .join(", ");

    // M3.8: both new checks are presence-conditional (no north star / no L5 store are legitimate
    // states, never silent — CLAUDE.md L2) — named explicitly rather than folded silently into
    // the primary checked/total pair, which stays the shard-scan denominator unchanged.
    const crossVendorNote = !crossVendor.northStarConfigured
      ? "critical-path provenance: no north star configured"
      : !crossVendor.northStarFound
        ? "critical-path provenance: configured north star not found in registry"
        : `critical-path provenance: ${crossVendor.checked} checked / ${crossVendor.criticalPathSize} on path`;
    const l5Note = !l5.present ? "L5 store: absent (no promotions)" : `L5 store: ${l5.promotable}/${l5.checked} 'stated' shards promotable`;

    return {
      findings,
      coverage: [
        {
          gate: "linker",
          unit: `lemma shards (${ignoredNote}); mirrors: ${mirrorsNote}; ${crossVendorNote}; ${l5Note}`,
          checked: total,
          total,
        },
      ],
    };
  },
};
