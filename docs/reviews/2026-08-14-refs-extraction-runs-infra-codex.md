Gate 3 can falsely accept PDF externals whose payload violates its adopted hash pin, and the probe channel can create ambiguous or misbound validity records. The new extractor subprocesses can also hang indefinitely.

Full review comments:

- [P1] Verify the payload against its adopted pin — /home/tobias/Projects/rk/src/gates/refs-extraction.ts:151-155
  When a PDF payload is replaced without repinning `files[].sha256`, `ensureExtraction` can create a sidecar chained to the replacement's current hash, and this resolver compares only `extraction.payload_sha256` to that same hash. A `proofs/*/externals` quote then passes Gate 3 even though the payload differs from its adopted pin; compare `payloadSha` with `entry.sha256` before returning the extraction, as required by the normative validity rules in [AGENTS.md lines 41-50](AGENTS.md#L41-L50).

- [P1] Reserve each probe bundle before checking for output — /home/tobias/Projects/rk/templates/runs/probe-channel.sh.tmpl:38-38
  When two agents launch the same new bundle concurrently, both can pass this non-atomic existence test before either redirection creates `output.txt`; both then truncate/write the same path and append competing ledger rows, so a shard's bundle citation no longer identifies immutable output. The bundle can also be reused after its output is deleted while its old ledger row remains; hold a per-bundle lock or atomic reservation across the check, execution, hashing, and append, and reject already-ledgered bundles.

- [P1] Bound and drain the PDF extractor subprocesses — /home/tobias/Projects/rk/src/refs/extract.ts:122-122
  When marker emits enough stdout to fill its unread pipe, it blocks before exit; either extractor can also stall indefinitely on a malformed PDF. Both new branches await `proc.exited` without a deadline, so `rk refs quote` can hang forever; drain marker stdout and enforce killable timeouts as required by [AGENTS.md lines 80-96](AGENTS.md#L80-L96).

- [P2] Report extraction writes even when no quote matches — /home/tobias/Projects/rk/src/refs/quote-locate.ts:81-87
  When the first quote request for a PDF uses a pattern that is absent, `searchableText` still creates the sidecar and rewrites `sources.lock.json`, but the later `null` return discards `searchable.extraction`; the CLI reports only "pattern not found" and never discloses either write. This also occurs when an earlier PDF entry is extracted but a later payload supplies the match, so mutation metadata must survive non-match paths or extraction should be deferred.

- [P2] Hash the probe script before executing it — /home/tobias/Projects/rk/templates/runs/probe-channel.sh.tmpl:63-63
  If the probe file is edited while it runs or self-modifies, this post-run hash records the new bytes even though `output.txt` was produced by the old bytes, so `script_sha256` does not bind the executed program. Capture the script digest before launch and prevent or detect changes through completion before appending the record.

- [P2] JSON-encode probe ledger fields before appending — /home/tobias/Projects/rk/templates/runs/probe-channel.sh.tmpl:66-72
  When a valid script filename contains `"` or a newline, direct interpolation produces malformed JSONL; an apostrophe also breaks the single-quoted `flock -c` command. Because `<script>` is otherwise unrestricted and these characters are filesystem-valid, serialize the fields with proper JSON escaping and append without evaluating the record through a shell command string.

- [P2] Update HANDOFF with the new fixture and template state — /home/tobias/Projects/rk/src/corpus/discovery.ts:165-165
  This line raises the corpus to 171 and the patch bumps `template_version` to 1.8.0, but `HANDOFF.md` still reports 166/166 at lines 12/101 and version 1.7.0 at lines 30/61. That gives the next session stale ground truth and violates the docs-move-with-content requirement in [AGENTS.md lines 66-67](AGENTS.md#L66-L67); rewrite HANDOFF as part of this change.