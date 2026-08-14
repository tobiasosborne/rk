#!/usr/bin/env bash
# ROLE: the sanctioned probe execution channel (constitution section 4b, I.3) — the ONE way a
#   numeric probe record cited by any shard gets produced. Bounded, single-threaded, output kept,
#   with a hash-bound append-only entry in runs/probe-ledger.jsonl.
# Stamped by `rk init` (templates/manifest.json, template_version 1.8.0), classification
#   campaign-seed: `rk upgrade` never rewrites it.
set -euo pipefail

BUNDLE="${1:?usage: probe-channel.sh <bundle-dir> <script> [timeout-s]}"
SCRIPT="${2:?usage: probe-channel.sh <bundle-dir> <script> [timeout-s]}"
echo "probe-channel: would run ${BUNDLE}/${SCRIPT} and append to runs/probe-ledger.jsonl" >&2
