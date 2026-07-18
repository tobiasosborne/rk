This is a plain prose note someone left directly under `argument/`, with no `---`
frontmatter block at all. It is not named README.md/INDEX.md/DAG.md, so the recursive
scan does not exclude it as documentation — it must be treated as a shard candidate,
and since it carries no frontmatter, that means a parse ERROR, never a silent skip.
