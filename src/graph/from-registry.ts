// PURITY: pure — no fs/network/clock (L3). The registry conversion boundary (M2.2, memo question
// 5): the ONE place a `Lemma` (src/gates/linker-parse.ts, Gate 2's parse-recovery shape) is ever
// converted into a `RegistryNode` (./types.ts, the graph projection's spine). `RegistryNode` and
// `Lemma` stay permanently separate types (M2.1 review, confirmed) — this module is the seam.
//
// TOTAL conversion (M2.2 acceptance): every `Lemma` `parseRegistry` handed back either becomes a
// `RegistryNode` or is recorded in `skipped` with a reason — never silently vanishes. A `Lemma`
// can only reach here already carrying a non-empty `id` (parseRegistry excludes id-less shards
// itself, [F12]); the one thing this boundary still must guard is `kind`, which `Lemma.kind` types
// as an untyped optional string (Gate 2 tolerates a missing/invalid `kind` mid-parse so every
// OTHER check still runs against the shard) but `RegistryNode.kind` types as the closed
// `RegistryKind` enum (a graph node needs a definite kind to be projectable at all). A shard with
// no recognized `kind` is Gate 2's own finding to report (`rk check` already ERRORs it); this
// boundary counts it as skipped rather than fabricating a kind or silently including a
// mistyped node.

import type { Lemma } from "../gates/linker-parse";
import {
  AF_FLAGS,
  REGISTRY_KINDS,
  RIGOUR_STATUSES,
  type AfFlag,
  type RegistryKind,
  type RegistryNode,
  type RigourStatus,
} from "./types";

export interface RegistrySkip {
  path: string;
  id: string;
  reason: string;
}

function asRegistryKind(kind: string | undefined): RegistryKind | undefined {
  return kind !== undefined && (REGISTRY_KINDS as readonly string[]).includes(kind) ? (kind as RegistryKind) : undefined;
}

function asRigourStatus(status: string | undefined): RigourStatus | undefined {
  return status !== undefined && (RIGOUR_STATUSES as readonly string[]).includes(status)
    ? (status as RigourStatus)
    : undefined;
}

function asAfFlag(af: string): AfFlag {
  return (AF_FLAGS as readonly string[]).includes(af) ? (af as AfFlag) : "none";
}

/** Converts one `Lemma` to a `RegistryNode`, or returns `null` when it cannot be projected at all
 * (no recognized `kind` — see the file header). Every other field maps directly; `status` that
 * fails to match `RigourStatus` is dropped to `undefined` rather than skipping the whole node
 * (status is optional on `RegistryNode` already, and an unrecognized status is Gate 2's own
 * finding, not a reason to exclude an otherwise-projectable node). `af` similarly degrades to
 * `"none"` on an unrecognized value — the SAME default `parseRegistry` itself already applies
 * when the field is entirely absent, so this is not a new failure mode. `balloons` is always the
 * zero-valued reserved counter (PRD C9 / M3.6 — not populated until the balloon feedback loop
 * lands). */
export function convertLemma(l: Lemma): RegistryNode | null {
  const kind = asRegistryKind(l.kind);
  if (kind === undefined) return null;
  return {
    id: l.id,
    kind,
    path: l.path,
    status: asRigourStatus(l.status),
    contract: l.contract,
    owner: l.owner,
    workspace: l.workspace,
    af: asAfFlag(l.af),
    deps: [...l.deps],
    routes: l.routes.map((r) => [...r]),
    defs: [...l.defs],
    balloons: { count: 0, classifications: [] },
  };
}

/** Converts every `Lemma` to a `RegistryNode` (TOTAL — see file header): `nodes.length +
 * skipped.length === lemmas.length` always holds, proven by `test/graph/from-registry.test.ts`'s
 * property test. */
export function convertRegistry(lemmas: readonly Lemma[]): { nodes: RegistryNode[]; skipped: RegistrySkip[] } {
  const nodes: RegistryNode[] = [];
  const skipped: RegistrySkip[] = [];
  for (const l of lemmas) {
    const node = convertLemma(l);
    if (node === null) {
      skipped.push({ path: l.path, id: l.id, reason: `unrecognized or missing kind '${l.kind ?? ""}'` });
    } else {
      nodes.push(node);
    }
  }
  return { nodes, skipped };
}
