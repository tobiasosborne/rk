// ROLE: Gate 2 — argument/linker (argument/lemmas/*.md). Contract: docs/gate-contracts.md
// "Gate 2 — argument / linker". Orchestrates parseRegistry (linker-parse.ts, checks 1-5),
// checkAcyclic/checkImports/checkStatus/checkContracts/checkOrphans/checkBrittleness +
// af-workspace introspection (linker-graph.ts, checks 6-10, 12) and checkGenerated
// (linker-render.ts, check 11).
// PURITY: pure — no fs/network/clock (L3).

import type { Gate, GateResult } from "./framework";
import type { RepoSnapshot } from "./snapshot";
import { listDir } from "./snapshot";
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
    const { lemmas, errors: parseErrors } = parseRegistry(snapshot);
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

    const findings = [
      ...parseErrors,
      ...checkAcyclic(lemmas),
      ...checkImports(lemmas, defIds),
      ...checkStatus(lemmas),
      ...checkContracts(lemmas, wsContracts),
      ...checkOrphans(lemmas, wsDirs),
      ...checkGenerated(snapshot, lemmas),
      ...checkBrittleness(lemmas, nodeCounts, config.linkerBrittlenessSoftCap),
    ];

    const total = listDir(snapshot, "argument/lemmas").filter(
      (n) => n.endsWith(".md") && n !== "README.md" && n !== "INDEX.md",
    ).length;

    return {
      findings,
      coverage: [{ gate: "linker", unit: "lemma shards", checked: total, total }],
    };
  },
};
