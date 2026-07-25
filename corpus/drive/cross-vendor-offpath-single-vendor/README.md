<!-- ROLE: red-corpus fixture description. UPDATE POLICY: edit only alongside a change to the
     behaviour it pins. TRIGGER: any change to src/drive/cross-vendor.ts's `resolveLoadBearing` /
     `crossVendorPreflightLines`, or to how src/cli/verify-live.ts wires `DriverDeps.isLoadBearing`. -->

# corpus/drive/cross-vendor-offpath-single-vendor

Harness: `test/drive/corpus-cross-vendor-membership.test.ts`. Not under `src/corpus/discovery.ts`'s
`GATE_DIRS` (this is a driver/CLI fixture, not a gate fixture), so it runs under `bun test` rather
than the gate corpus runner — same arrangement as `corpus/graph/` and `corpus/render/`.

## The failure mode it reproduces

Beads **rk-bun** (real critical-path membership never computed) and **rk-id1** (a single-vendor
researcher can promote nothing and is never told).

`src/cli/verify-live.ts` hard-coded `isLoadBearing: () => true` (merge reconciliation `e69efd9`), so
the live hard-tier driver never computed critical-path membership at all. That constant points in the
SAFE direction — cross-vendor required everywhere — so it was never a false green. Its two real costs:

1. PRD §4 C9's `Non-critical-path: same-family allowed, recorded` branch was unreachable. A claim on
   no dep/route path to the north star was treated exactly like the north star itself.
2. A researcher with ONE model vendor configured (claude-only or codex-only — the common academic
   case) could therefore promote NOTHING, anywhere, ever, and the tool never said so before the spend.

## The repo

- `.rk/config.json` — `northStarId: "star"`, plus a SINGLE-VENDOR worker roster (prover and verifier
  both `corpus-fake`). The harness injects a `WorkerBackend` named `corpus-fake` of family `claude`;
  nothing else about the config is injected, so the real `loadGateConfig` read of `northStarId` and
  `workers` is what the fixture exercises.
- `argument/star.md` — the north star. Declares no deps and no routes.
- `argument/lem-a.md` — `af: seeded`, `workspace: proofs/lem-a`. Reachable from `star` by no
  dep/route path, so it is GENUINELY off the critical path (a determined answer, not an unknown).
- `proofs/lem-a/` — a real, empty workspace directory. The af node view itself is injected by the
  harness (two verifier-ready leaves, each carrying a decodable CLAUDE-family prover author seam, so
  the apply-time check lands on PRD C9's `same-family` branch and not `identity-unparseable`).
- `fake-af` — deterministic af stub; see its own header.

## What the harness asserts

| direction | north star | expected |
|---|---|---|
| determined, off the path | `star` (from `.rk/config.json`) | preflight says `off the critical path`; same-family accepts are NOT refused (`cross-vendor-rejected=0`); the single-vendor note states the off-path caveat and that af-crux nodes are still refused |
| indeterminate | `--north-star nope` | preflight says `INDETERMINATE (north-star-unresolved)`; fails CLOSED — every accept refused (`cross-vendor-rejected=2`) |

The second row is the one that must never regress: an unknowable membership answer must never become
the permissive one. It is the same posture `corpus/linker/linker-40` pins for the linker's continuous
half of the rule, and the same posture `src/drive/batch-eligibility.ts` takes on an unresolved north
star.
