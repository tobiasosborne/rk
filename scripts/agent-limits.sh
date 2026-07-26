# ROLE: authored guardrail, sourced into every agent-spawned shell. UPDATE POLICY: edited
# only when the cap or its escape hatch changes. TRIGGER: wired by .claude/settings.json as
# BASH_ENV, which bash sources for EVERY non-interactive shell — so this file must stay
# silent (any output would corrupt the output of every tool call).
#
# Why this exists. On 2026-07-25 two runaway `bun` processes — 34.5 GB and 61.5 GB RSS,
# 120 GB and 148 GB virtual — drained the WSL VM's 62 GB of RAM and all 16 GB of swap and
# froze it twice in one afternoon. Neither was a large workload. One was an un-timeout'd
# `bun test` run while loop-exit conditions were being mutated; the other was an ad-hoc
# scratchpad script looping over every node with no teardown between iterations. Both are
# unbounded loops, and an unbounded loop is indistinguishable from a real workload until
# it is too late.
#
# A soft RLIMIT_DATA changes the failure mode from "the VM dies and takes the session with
# it" to "one process dies with a catchable Out of memory". It costs nothing when nothing
# is wrong.
#
# Headroom (measured 2026-07-26, this machine):
#   bun test (150 files, 2327 tests)  279 MB
#   bun run selftest                   66 MB
#   bun build --compile               324 MB
#   vite build / bunx tsc            ~700 MB
# The cap below is >10x the worst of these. If a step legitimately needs more, raise it
# explicitly rather than removing the guard:
#
#   AGENT_MEM_LIMIT_KB=16777216 bun run some-genuinely-big-thing   # 16 GiB
#   AGENT_MEM_LIMIT_KB=unlimited bun run ...                       # opt out entirely
#
# Only the SOFT limit is set; the hard limit is left untouched, so the escape hatch above
# always works. This is a guardrail, not a security boundary.

case "${AGENT_MEM_LIMIT_KB:-8388608}" in
  unlimited) ;;
  *) ulimit -S -d "${AGENT_MEM_LIMIT_KB:-8388608}" 2>/dev/null || : ;;
esac
