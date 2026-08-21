// ROLE: convention-profile lattice validation.
// PURITY: pure — no fs/network/clock (L3).

import type { Lattice } from "./profile-types";

const CHAIN_KEYS = new Set(["kind", "values"]);
const POSET_KEYS = new Set(["kind", "values", "edges"]);

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

function posetEdges(
  key: string,
  values: readonly string[],
  raw: unknown,
  errors: string[],
): [string, string][] | undefined {
  if (!Array.isArray(raw)) {
    errors.push(`lattices["${key}"].edges must be an array of [weaker, stronger] pairs`);
    return undefined;
  }
  const declared = new Set(values);
  const edges: [string, string][] = [];
  let bad = false;
  raw.forEach((edge, index) => {
    if (!Array.isArray(edge) || edge.length !== 2 || typeof edge[0] !== "string" || typeof edge[1] !== "string") {
      errors.push(`lattices["${key}"].edges[${index}] must be a [weaker, stronger] pair of strings`);
      bad = true;
      return;
    }
    const pair = edge as [string, string];
    for (const endpoint of pair) {
      if (!declared.has(endpoint)) {
        errors.push(`lattices["${key}"].edges[${index}] names "${endpoint}", which is not in this lattice's values`);
        bad = true;
      }
    }
    edges.push(pair);
  });
  if (bad) return undefined;

  const adjacency = new Map<string, string[]>();
  for (const [from, to] of edges) adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  let cycle: string[] | undefined;
  const visit = (at: string): boolean => {
    if (state.get(at) === 1) {
      cycle = [...stack.slice(stack.indexOf(at)), at];
      return true;
    }
    if (state.get(at) === 2) return false;
    state.set(at, 1);
    stack.push(at);
    for (const next of adjacency.get(at) ?? []) if (visit(next)) return true;
    stack.pop();
    state.set(at, 2);
    return false;
  };
  for (const value of values) if (visit(value)) break;
  if (cycle) {
    errors.push(
      `lattices["${key}"].edges contain a cycle (${cycle.join(" -> ")}) — a partial order cannot ` +
        "make two distinct values mutually entailing",
    );
    return undefined;
  }
  return edges;
}

export function readLattices(raw: unknown, errors: string[]): Record<string, Lattice> {
  const lattices: Record<string, Lattice> = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push('"lattices" must be an object (an empty one is legitimate)');
    return lattices;
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(
        `lattices["${key}"] must be a tagged object — {kind: "chain", values} or ` +
          `{kind: "poset", values, edges} — never a bare array`,
      );
      continue;
    }
    const lattice = value as Record<string, unknown>;
    if (lattice.kind !== "chain" && lattice.kind !== "poset") {
      errors.push(`lattices["${key}"].kind is ${JSON.stringify(lattice.kind)}, expected "chain" or "poset"`);
      continue;
    }
    const allowed = lattice.kind === "chain" ? CHAIN_KEYS : POSET_KEYS;
    const extra = Object.keys(lattice).filter((field) => !allowed.has(field));
    if (extra.length > 0) {
      errors.push(`lattices["${key}"] (${lattice.kind}) has unrecognized properties ${extra.map((field) => `"${field}"`).join(", ")}`);
    }
    if (!stringArray(lattice.values) || lattice.values.length < 2 || new Set(lattice.values).size !== lattice.values.length) {
      errors.push(`lattices["${key}"].values must be an array of >= 2 distinct non-empty strings`);
      continue;
    }
    const values = [...lattice.values];
    if (lattice.kind === "chain") lattices[key] = { kind: "chain", values };
    else {
      const edges = posetEdges(key, values, lattice.edges, errors);
      if (edges) lattices[key] = { kind: "poset", values, edges };
    }
  }
  return lattices;
}
