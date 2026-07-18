// ROLE: Gate 2 — argument/linker (argument/**/*.md, recursive). Contract: docs/gate-contracts.md
// "Gate 2 — argument / linker". Orchestrates parseRegistry (linker-parse.ts, checks 1-5),
// checkAcyclic/checkImports/checkStatus/checkContracts/checkOrphans/checkBrittleness +
// af-workspace introspection (linker-graph.ts, checks 6-10, 12) and checkGenerated
// (linker-render.ts, check 11).
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
import { checkGenerated } from "./linker-render";

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
    for (const l of lemmas) {
      if (l.af === "none" || l.workspace === undefined) continue;
      const facts = introspectWorkspace(snapshot, l.workspace);
      if (facts) {
        wsContracts.set(l.id, facts.contract);
        nodeCounts.set(l.id, facts.nodes);
      }
    }

    const { findings: generatedFindings, mirrorStatus } = checkGenerated(snapshot, lemmas);

    const findings = [
      ...parseErrors,
      ...checkAcyclic(lemmas),
      ...checkImports(lemmas, defIds),
      ...checkStatus(lemmas),
      ...checkContracts(lemmas, wsContracts),
      ...checkOrphans(lemmas, wsDirs),
      ...generatedFindings,
      ...checkBrittleness(lemmas, nodeCounts, config.linkerBrittlenessSoftCap),
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
      .map((m) => `${m.label} ${m.present ? "present" : "absent (not adopted)"}`)
      .join(", ");

    return {
      findings,
      coverage: [
        {
          gate: "linker",
          unit: `lemma shards (${ignoredNote}); mirrors: ${mirrorsNote}`,
          checked: total,
          total,
        },
      ],
    };
  },
};
