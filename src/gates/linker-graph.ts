// PURITY: pure — no fs/network/clock (L3). Gate 2 (linker) checks 6-10 + 12: acyclicity, import
// resolution, status propagation (the monotone-trust rigour ladder), contract match, orphans,
// brittleness. Ground truth: docs/gate-contracts.md "Gate 2" Checks 6-10, 12; ported from
// argument.py's check_acyclic/check_imports/check_status/check_contracts/check_orphans/
// check_brittleness (argument.py:153-273). af-workspace introspection (scanWorkspaces/
// introspectWorkspace, argument.py:517-541) lives in linker-workspace.ts — split out to stay
// clear of CLAUDE.md's 280-line shard cap; re-exported here so callers of this module keep one
// import surface for "everything checks 6-10+12 need".

import type { Finding } from "./framework";
import type { Lemma } from "./linker-parse";
import { allDepIds, isMandatoryReview } from "./linker-parse";

export { scanWorkspaces, introspectWorkspace } from "./linker-workspace";
export type { WorkspaceFacts } from "./linker-workspace";

function pyListRepr(items: Iterable<string>): string {
  return `[${[...items].map((i) => `'${i}'`).join(", ")}]`;
}

/** `" ".join(s.split())` — collapse any whitespace run to one space, strip ends
 * (argument.py:64-65, `normalize`). Used only for the contract-drift comparison (check 9). */
function normalizeContract(s: string): string {
  return s.split(/\s+/).filter((x) => x.length > 0).join(" ");
}

// ---------------------------------------------------------------------------------------
// Check 6 — acyclic (argument.py:153-176)
// ---------------------------------------------------------------------------------------

/** DFS over the UNION of `deps` + every route's members; reports the FIRST cycle found (matches
 * argument.py's single-cycle-then-stop behavior, not an exhaustive cycle enumeration). Attributed
 * to the first id in the reported cycle's own shard path. */
export function checkAcyclic(lemmas: Lemma[]): Finding[] {
  const ids = new Set(lemmas.map((l) => l.id));
  const byId = new Map(lemmas.map((l) => [l.id, l]));
  const adj = new Map<string, string[]>();
  for (const l of lemmas) adj.set(l.id, allDepIds(l).filter((d) => ids.has(d)));

  const errors: Finding[] = [];
  const state = new Map<string, 0 | 1 | 2>(); // 0=unvisited 1=in-stack 2=done

  function dfs(u: string, stack: string[]): boolean {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const vs = state.get(v) ?? 0;
      if (vs === 1) {
        const idx = stack.indexOf(v);
        const cyc = [...stack.slice(idx), v];
        // structural: dependency cycle (docs/gate-contracts.md "Phase matrix").
        errors.push({
          severity: "ERROR",
          path: byId.get(cyc[0]!)!.path,
          message: `cycle detected: ${cyc.join(" -> ")}`,
          structural: true,
        });
        return true;
      }
      if (vs === 0 && dfs(v, [...stack, v])) return true;
    }
    state.set(u, 2);
    return false;
  }

  for (const l of lemmas) {
    if ((state.get(l.id) ?? 0) === 0) {
      if (dfs(l.id, [l.id])) break;
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------------------
// Check 7 — imports resolve (argument.py:179-194)
// ---------------------------------------------------------------------------------------

// structural: broken cross-shard reference (docs/gate-contracts.md "Phase matrix") — every ERROR
// below.
export function checkImports(lemmas: Lemma[], defIds: Set<string>): Finding[] {
  const ids = new Set(lemmas.map((l) => l.id));
  const errors: Finding[] = [];
  for (const l of lemmas) {
    for (const d of l.deps) {
      if (!ids.has(d)) {
        errors.push({ severity: "ERROR", path: l.path, message: `unknown dep '${d}' (not a registry id)`, structural: true });
      }
    }
    l.routes.forEach((route, ri) => {
      for (const m of route) {
        if (!ids.has(m)) {
          errors.push({
            severity: "ERROR",
            path: l.path,
            message: `unknown route member '${m}' (route ${ri + 1}, not a registry id)`,
            structural: true,
          });
        }
      }
    });
    for (const df of l.defs) {
      if (!defIds.has(df)) {
        errors.push({ severity: "ERROR", path: l.path, message: `unknown def '${df}' (not in definitions/)`, structural: true });
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------------------
// Check 8 — status propagation, the monotone-trust rigour ladder (argument.py:197-236)
// ---------------------------------------------------------------------------------------

/** A dep is AVAILABLE iff its af is validated OR it is a ground-truth leaf (status=cited) — only
 * `status=='cited'` counts, never consensus/open/obstruction/disproved/proved
 * (argument.py:200-204). This is the monotone-trust invariant: an `af: validated` shard can never
 * be satisfied by a dep that is neither validated nor cited. */
export function isAvailable(id: string, afOf: Map<string, string>, statusOf: Map<string, string | undefined>): boolean {
  return afOf.get(id) === "validated" || statusOf.get(id) === "cited";
}

export function checkStatus(lemmas: Lemma[]): Finding[] {
  const afOf = new Map(lemmas.map((l) => [l.id, l.af]));
  const statusOf = new Map(lemmas.map((l) => [l.id, l.status]));
  const available = (id: string) => isAvailable(id, afOf, statusOf);

  function requirementsMet(l: Lemma): boolean {
    if (!l.deps.every(available)) return false;
    // Disjunctive OR-route generalisation: no routes -> reduces byte-for-byte to "all deps
    // available"; routes present -> ALSO needs at least one route's members ALL available.
    if (l.routes.length > 0 && !l.routes.some((r) => r.every(available))) return false;
    return true;
  }

  const errors: Finding[] = [];
  for (const l of lemmas) {
    const met = requirementsMet(l);
    if (l.af === "validated" && !met) {
      const bad = l.deps.filter((d) => !available(d));
      if (l.routes.length > 0) {
        errors.push({
          severity: "ERROR",
          path: l.path,
          message: `af=validated but no route is fully validated/cited (unconditional bad deps: ${pyListRepr(bad)})`,
        });
      } else {
        errors.push({
          severity: "ERROR",
          path: l.path,
          message: `af=validated but dep(s) not validated: ${pyListRepr(bad)}`,
        });
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------------------
// Check 9 — contract match (argument.py:239-248)
// ---------------------------------------------------------------------------------------

export function checkContracts(lemmas: Lemma[], wsContracts: Map<string, string>): Finding[] {
  const byId = new Map(lemmas.map((l) => [l.id, l]));
  const errors: Finding[] = [];
  for (const [lid, wsStmt] of wsContracts) {
    const l = byId.get(lid);
    if (!l) continue;
    if (normalizeContract(wsStmt) !== normalizeContract(l.contract)) {
      errors.push({ severity: "ERROR", path: l.path, message: `contract drift: ${lid} — af root conjecture != registry contract` });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------------------
// Check 10 — orphans (argument.py:262-273)
// ---------------------------------------------------------------------------------------

/** `[message-only]` divergence (linker-15): AISM's `af_introspect("")` resolves an absent
 * `workspace:` field to `ROOT/""`, so its own `check_orphans` message leaks a Python `None`
 * literal ("workspace dir missing: None"). Same trigger, same ERROR verdict — only the text is
 * corrected to a real sentence. */
export function checkOrphans(lemmas: Lemma[], wsDirs: string[]): Finding[] {
  const errors: Finding[] = [];
  const declared = new Set(lemmas.map((l) => l.workspace).filter((w): w is string => w !== undefined));

  for (const l of lemmas) {
    if (l.af === "none") continue;
    if (l.workspace === undefined) {
      errors.push({
        severity: "ERROR",
        path: l.path,
        message: `af=${l.af} but workspace field is absent (cannot resolve a workspace dir)`,
      });
    } else if (!wsDirs.includes(l.workspace)) {
      errors.push({ severity: "ERROR", path: l.path, message: `af=${l.af} but workspace dir missing: ${l.workspace}` });
    }
  }
  for (const ws of wsDirs) {
    if (!declared.has(ws)) {
      errors.push({ severity: "ERROR", path: ws, message: `orphan workspace (no registry entry): ${ws}` });
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------------------
// Check 12 — brittleness (WARN only; argument.py:251-259)
// ---------------------------------------------------------------------------------------

export function checkBrittleness(lemmas: Lemma[], nodeCounts: Map<string, number>, cap: number): Finding[] {
  const warnings: Finding[] = [];
  for (const l of lemmas) {
    const nc = nodeCounts.get(l.id);
    if (nc !== undefined && nc > cap) {
      const ws = l.workspace ?? `proofs/${l.id}`;
      warnings.push({
        severity: "WARN",
        path: l.path,
        message: `REFACTOR: ${ws} has ${nc} nodes (>${cap}) — factor ${l.id} into sub-lemmas`,
      });
    }
  }
  return warnings;
}

// ---------------------------------------------------------------------------------------
// Mandatory-review balloon flag (M3 blocker 7c — PRD C9 / M3.6 balloon feedback loop)
// ---------------------------------------------------------------------------------------

/** Surfaces a shard whose persisted balloon state (`Lemma.balloons`, read back off its own
 * frontmatter by `linker-parse.ts`'s `readBalloonCounterFromFields`) has crossed the
 * mandatory-review threshold (`isMandatoryReview`) — a REPEAT balloon on this contract, or a
 * `genuine-gap` classification at any point in its history. WARN, same tier as `checkBrittleness`
 * (check 12): this is a driver-state flag on an otherwise well-formed shard, not a structural
 * defect in ITS declared facts. NOT YET wired into `linkerGate`'s findings (linker.ts) — see the
 * repair-wave return notes for the follow-up bead; the board-facing surfacing this wave commits to
 * is `linker-render.ts`'s renderIndex/renderDag flag, which rides the EXISTING checkGenerated
 * pipeline unchanged. */
export function checkMandatoryReview(lemmas: Lemma[]): Finding[] {
  const warnings: Finding[] = [];
  for (const l of lemmas) {
    if (!isMandatoryReview(l.balloons)) continue;
    warnings.push({
      severity: "WARN",
      path: l.path,
      message:
        `MANDATORY-REVIEW: ${l.id} has ballooned ${l.balloons.count} time${l.balloons.count === 1 ? "" : "s"} ` +
        `(classifications: ${l.balloons.classifications.join("; ") || "(none)"}) — the contract's hypotheses are suspect, review before further decomposition`,
    });
  }
  return warnings;
}

