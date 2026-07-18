// PURITY: pure — no fs/network/clock (L3). M1.2 (`rk init`): builds the JSON payloads for
// `.rk/config.json` and `.rk/oracles.json`. `.rk/config.json` is written with ONLY the
// `GateConfig` (src/gates/config.ts) keys this WP's brief names explicitly — "match the ACTUAL
// GateConfig schema, do not invent fields" — never the whole `DEFAULT_GATE_CONFIG` baked in (the
// same "only write what was actually decided" discipline `src/cli/phase.ts`'s `writeRawConfig`
// already follows for the `phase` key alone).

import type { GateConfig } from "../gates/config";

/** The subset of `GateConfig` this WP stamps: `phase` (M1.3), `shardsPrefix` (R12 — per-repo,
 * never a literal default), and `linkerBrittlenessSoftCap` (the brittleness soft cap — audit R9:
 * "surface it as an explicit constitution/config slot," which this mirrors into `.rk/config.json`
 * so `rk check`'s linker gate reads the SAME number the stamped constitution documents). No other
 * `GateConfig` key is stamped: `shardsMaxLines`, `provenanceStatusTableFile`, and
 * `refsMinRunReportingLength` are left to `mergeGateConfig`'s own defaults (R7/R10/R16, already
 * justified in the residue audit) unless a later `rk` command decides otherwise. */
export interface RkConfigStub {
  phase: GateConfig["phase"];
  shardsPrefix: string;
  linkerBrittlenessSoftCap: number;
}

export function buildRkConfig(params: {
  phase: GateConfig["phase"];
  shardsPrefix: string;
  brittlenessSoftCap: number;
}): RkConfigStub {
  return {
    phase: params.phase,
    shardsPrefix: params.shardsPrefix,
    linkerBrittlenessSoftCap: params.brittlenessSoftCap,
  };
}

/** `.rk/oracles.json` — PRD C1's "oracle registry" / C9's backend registry (D8), minimal and
 * empty at stamp time (no campaign has registered a verification oracle yet — that happens at
 * `rk verify`, M3). "id, kind, backend, role" is C9's own vocabulary: `id` (stable, greppable),
 * `kind` (what evidence class it certifies — byte-match | verifier | consensus | numerical-
 * invariant, mirroring the rigour ladder's external-oracle list in CLAUDE.md L0), `backend`
 * (which headless CLI executes it — claude | codex | human | fr, D8's "no backend is
 * privileged"), `role` (prover | verifier | reviewer, C9's per-role×tier assignment). The schema
 * is documented INLINE (a `$schema_note` field) rather than in a separate schemas/ file — there is
 * no versioned oracle-registry schema yet (that is M3 territory, `schemas/verdict.v1.json`'s
 * sibling); this stub exists so the file has a stable, self-explaining shape from day one instead
 * of an undocumented empty array a later WP has to reverse-engineer. */
export interface OraclesStub {
  $schema_note: string;
  oracles: unknown[];
}

export function buildOraclesStub(): OraclesStub {
  return {
    $schema_note:
      "rk oracle registry (PRD C1 scaffold note, C9 backend registry / D8). Each entry: " +
      "{ id: stable greppable string, kind: 'byte-match'|'verifier'|'consensus'|'numerical-invariant', " +
      "backend: 'claude'|'codex'|'human'|'fr', role: 'prover'|'verifier'|'reviewer' }. " +
      "Empty until the campaign registers its first oracle (rk verify, M3) — no backend is " +
      "privileged (D8).",
    oracles: [],
  };
}
