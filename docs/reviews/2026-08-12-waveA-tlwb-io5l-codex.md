The main attestation workflow can produce an immediately stale record, while the banking consumer accepts records that contradict the new validity schema. The unchanged schema version and unrestricted output path add compatibility and destructive-write risks.

Full review comments:

- [P1] Add the pointer before hashing the claim — /home/tobiasosborne/Projects/rk/src/cli/reward-attest.ts:167-170
  When the shard lacks this provenance path, this branch tells the operator to edit its frontmatter after `claimSha256` was computed. That edit necessarily changes the raw shard bytes, so following the printed `next` instruction immediately makes the new record stale and `rk check` rejects it. Require the declaration before hashing or update the record after inserting it, as required by the raw-byte binding contract (`docs/gate-contracts.md:2537-2548`).

- [P1] Validate the complete record before banking — /home/tobiasosborne/Projects/rk/src/reward/pma-backing.ts:136-136
  For hand-authored or backfilled records, a current `claimSha256` combined with a missing verdict, `verdict: "REFUTED"`, or a blank/missing reason still reaches this return and banks the close. The newly normative schema requires `verdict: "VALID"` and a non-blank reason (`docs/gate-contracts.md:2515-2523`), so the backing path must invoke the full record validator or enforce those fields before returning success.

- [P2] Bump the hash-bound record schema version — /home/tobiasosborne/Projects/rk/schemas/provenance-record.v1.json:11-11
  Repositories and producers using the previously accepted `schema_version: "1"` shape have no `claimSha256`, but this patch makes that field mandatory while retaining version 1. Those records now fail under the same advertised version, and external consumers cannot distinguish the incompatible shapes. Introduce a new version and define legacy/migration behavior as required by the repository's compatibility rule (`AGENTS.md:72-74`).

- [P2] Reserve rk control files from --out — /home/tobiasosborne/Projects/rk/src/reward/provenance-record.ts:240-240
  This predicate accepts every direct `.rk/*.json` path, including `.rk/config.json` and `.rk/generated.json`. Passing one of those names creates an invalid control file when absent, or overwrites existing campaign configuration when combined with `--force`; restrict custom output to a provenance namespace or explicitly reject rk-owned paths.