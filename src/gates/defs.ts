// ROLE: Gate 1 orchestration — recursive definition discovery, per-shard checks, flat-id
// collisions, and notation-register checks.
// PURITY: pure — no fs/network/clock (L3).

import type { CoverageLine, Finding, Gate, GateResult } from "./framework";
import type { GateConfig } from "./config";
import { idCollisions, readDefinitionShards } from "./definitions-scan";
import { checkNotationRegister } from "./defs-notation";
import {
  DEFS_MANIFEST_PATH,
  checkShard,
  loadDefsManifest,
} from "./defs-shard";
import { validateConventionProfile } from "./profile";

export { checkShard, dedupNames } from "./defs-shard";

export const defsGate: Gate = {
  name: "defs",
  run(snapshot, config: GateConfig): GateResult {
    const findings: Finding[] = [];
    const manifest = loadDefsManifest(snapshot);
    if (!manifest.present) {
      findings.push({
        severity: "WARN",
        path: DEFS_MANIFEST_PATH,
        message: `manifest absent: ${DEFS_MANIFEST_PATH} (cannot verify cited hashes)`,
      });
    }

    const definitionShards = readDefinitionShards(snapshot);
    const aliasOwner = new Map<string, string>();
    const shardTypes = new Map<string, string>();
    let citedCount = 0;
    let hashVerifiedCount = 0;

    for (const shard of definitionShards) {
      if (!shard.frontmatterOk) {
        findings.push({
          severity: "ERROR",
          path: shard.path,
          message: "missing/unterminated frontmatter",
          structural: true,
        });
        continue;
      }
      for (const line of shard.malformedLines) {
        findings.push({
          severity: "ERROR",
          path: shard.path,
          line,
          message: "frontmatter line without ':'",
          structural: true,
        });
      }
      const shardType = shard.fields.shard_type?.trim();
      if (shardType) shardTypes.set(shard.path, shardType);
      const result = checkShard(shard.path, shard.fields, manifest, snapshot, aliasOwner, findings);
      if (result.cited) citedCount++;
      if (result.hashVerified) hashVerifiedCount++;
    }

    for (const collision of idCollisions(definitionShards)) {
      for (const path of collision.paths) {
        findings.push({
          severity: "ERROR",
          path,
          structural: true,
          message:
            `def-id-collision: id '${collision.id}' is claimed by ${collision.paths.length} shards ` +
            `(${collision.paths.join(", ")}) — every consumer resolves a definition by id alone, so ` +
            "two files answering to one id resolve arbitrarily",
        });
      }
    }

    const { profile } = validateConventionProfile(snapshot, config.conventionProfile);
    const notation = checkNotationRegister(snapshot, profile, shardTypes, aliasOwner);
    findings.push(...notation.findings);

    let unit = "shards";
    if (citedCount > 0) {
      unit += manifest.present
        ? `, ${hashVerifiedCount}/${citedCount} cited shards hash-verified`
        : `, 0/${citedCount} cited shards hash-verified — manifest absent`;
    }
    if (notation.shards > 0) {
      unit +=
        `, ${notation.shards} notation shard${notation.shards === 1 ? "" : "s"}` +
        `, ${notation.verified}/${notation.rows} translations verified` +
        (profile === undefined ? " — no convention profile configured, classes unchecked" : "");
    }
    const total = definitionShards.length;
    const coverage: CoverageLine[] = [{ gate: "defs", unit, checked: total, total }];
    return { findings, coverage };
  },
};
