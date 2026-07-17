No frontmatter block at all — `_parse_frontmatter` returns `None` (argument.py:106-112), so `parse_registry` records an ERROR and skips this shard.
