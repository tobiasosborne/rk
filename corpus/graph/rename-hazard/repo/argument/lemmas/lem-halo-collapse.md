---
id: lem-halo-collapse
kind: lemma
contract: Every halo collapses within finite time under the flow.
status: proved
af: validated
workspace: proofs/halo-collapse-v2
---

The rename hazard fixture (IMPLEMENTATION_PLAN.md M2.1 acceptance row, bead rk-bsj): this shard's
own filename stem/id (`lem-halo-collapse`) deliberately does NOT match its declared `workspace:`
directory (`proofs/halo-collapse-v2`) — af workspace directories can be renamed independently of
the registry id (`../vibefeld/docs/export-graph-v1.md`'s own note: af records no rename-stable
workspace identifier of its own). A DECOY workspace directory also exists at
`proofs/lem-halo-collapse/` (this shard's id, coincidentally shaped like a plausible but WRONG
workspace path) with a deliberately wrong ledger, so a reader that ever derived the af join key
from `id` instead of copying the shard's own `workspace:` field would resolve against the decoy's
WRONG contract/node-count instead of failing loudly or resolving correctly — see
test/graph/corpus-rename-hazard.test.ts.
