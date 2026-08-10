<!-- ROLE: red-corpus fixture description. UPDATE POLICY: edit only alongside a change to the
     verifier-fence contract it pins. TRIGGER: changes to src/drive/verifier-fence.ts or verifier
     brief assembly. -->

# corpus/drive/verifier-fence-citable-record

Harness: `test/drive/verifier-fence.test.ts`. This is a drive-layer fixture, so it runs under
`bun test` and is not counted by `src/corpus/discovery.ts`.

## Incident reproduced

Campaign A, window 3: a verifier brief said an unverified input had already survived cross-vendor
passes and must not be re-litigated. The assertion cited no verdict record, fencing the input from
the only scrutiny available. The campaign initially diagnosed this as mechanically uncatchable.

`brief.json` expresses five fences through the only admissible structured field. Four must be
refused: a nonexistent record, a stale hash-bound record, a live-retracted record, and a record for
a different claim. The fifth cites the latest fresh, unretracted `VALID` record and is confirmed.
The fixture's L5 and retraction logs both have intact ordinal chains; no refusal can be attributed
to store corruption instead of its intended failure mode.
