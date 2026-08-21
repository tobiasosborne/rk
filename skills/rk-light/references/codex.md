# Second family — codex as verifier (proofs AND refutations)

ROLE: invocation recipe. The orchestrator is Claude; a second model family is what makes
"reviewer ≠ author" mean something. codex (`codex exec`, GPT-5.x) is the default second
family. The verifier is always READ-ONLY: it writes nothing but its note, which you save
from its output.

## Invocation

Run from inside a git repository (codex refuses untrusted non-git directories). Write the
brief to a file; include the RECEIPT line(s) from `make receipt ID=<id>` for each claim.

```sh
make receipt ID=lem-a                      # -> RECEIPT lem-a <sha256>   (paste into the brief)
cat > notes/reviews/lem-a-2026-08-21.brief.md <<'EOF'
<PREAMBLE + verifier block from briefs.md, with the RECEIPT line(s)>
EOF
timeout 3600 codex exec -s read-only -c model_reasoning_effort="xhigh" \
  -o notes/reviews/lem-a-2026-08-21.md \
  "$(cat notes/reviews/lem-a-2026-08-21.brief.md)" < /dev/null 2> notes/reviews/lem-a-2026-08-21.log
head -5 notes/reviews/lem-a-2026-08-21.log     # the log header names the model actually used
```

- `-s read-only` always for verification. Never `workspace-write` for a verifier.
- `xhigh` for any verdict that promotes a claim; the default effort for extraction.
- `< /dev/null` always (codex otherwise waits on stdin). Tracked background task if long;
  never detached; always `timeout`.
- The `-o` file IS the review note. It must contain, per id, `RECEIPT <id> <hash>`,
  `PREMISES <id>: ...`, `VERDICT <id>: VALID|INVALID`. Missing lines = INVALID for ledger
  purposes (`make check` says which line is missing).
- Review cell: `codex:<model from the log> <date> notes/reviews/<file>` — copy the model
  name from the log header, do not type it from memory.
- **Batch.** One verifier call may cover several related rows (one RECEIPT/PREMISES/VERDICT
  triple each). Batch siblings; keep the main theorem's review separate.

## When the receipt goes stale

Any edit to the statement, deps, proof file, the theorem text printed in report/, CONVENTIONS.md or sources changes the hash
and `make check` reports `review.stale`. That is the point: the review certified a specific
text. Re-issue the receipt and re-run the verifier (cheap when the change is small — say
what changed in the brief).

## When codex is unavailable

A fresh Claude subagent (Agent tool, no conversation context, the REFUTE brief, proof file
only — never the author's transcript), and `single-family` in the review cell. The banner
prints it. Do not call it two-family.

## Cheap classifier lane (optional)

Bulk, low-stakes classification (triaging a reading list, tagging notes) can use a free
model via `pi`: `pi -p --provider openrouter --model stealth/ox-alpha --thinking low
--no-tools --no-session --no-context-files --no-extensions --no-skills --no-prompt-templates
"<prompt>"`. Never for verdicts. Never two calls in parallel. Set the thinking level.
