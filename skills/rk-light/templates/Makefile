# ROLE: the verbs of an rk-light project. Every target is bounded; none detaches.
# guard runs the INSTALLED skill copy when present (a worker could edit scripts/ here).
RK_LIGHT ?= $(HOME)/.claude/skills/rk-light
GUARD := $(if $(wildcard $(RK_LIGHT)/scripts/guard.sh),$(RK_LIGHT)/scripts/guard.sh,scripts/guard.sh)
.PHONY: check regen build fetch guard receipt release status test state-hash
check:          ## ledgers, quotes, envs, receipts, banner -- exit 1 on any ERROR
	@timeout 120 python3 scripts/check.py --check
regen:          ## rewrite report/generated/status.tex from CLAIMS.md
	@timeout 120 python3 scripts/check.py --regen >/dev/null; echo "regenerated report/generated/status.tex"
build:          ## fresh compile of report/main.pdf; fails on compiler error, undefined refs/citations, dup labels
	@sh scripts/build.sh
fetch:          ## make fetch ID=2206.13228 [KEY=abn2022]
	@sh scripts/fetch_arxiv.sh "$(ID)" $(KEY)
guard:          ## after a harvest: only notes/ changed since HEAD; append-only ledgers intact
	@sh "$(GUARD)"
receipt:        ## make receipt ID=lem-a  -> the RECEIPT line to paste into the verifier's brief
	@timeout 120 python3 scripts/check.py --receipt "$(ID)"
state-hash:     ## the hash for AUDIT-OF (before repairs) and CLOSED-AT (after)
	@timeout 120 python3 scripts/check.py --state-hash
release: build  ## fresh build + check + recorded audit (AUDIT-OF, CLOSED-AT == now, blockers closed); writes RELEASE.md
	@timeout 120 python3 scripts/check.py --release
status:         ## one-screen state
	@timeout 120 python3 scripts/check.py | grep -E 'INFO|ERROR|WARN' | sed 's/^/  /'
test:           ## the gate's own red/green tests
	@timeout 120 python3 scripts/tests/test_check.py
