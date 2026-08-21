# Workflows

ROLE: how the three saved workflows are used. `scripts/init.sh` copies them into the
project's `.claude/workflows/`, so they run as `/rkl-extract`, `/rkl-attack`, `/rkl-audit`
(or via the Workflow tool by name with `args`). Invoking rk-light is the user's opt-in to
this orchestration; keep runs inside the BRIEF budget. Workflow agents are all Claude and
run with edit rights: the briefs confine them to `notes/`, and `make guard` catches a
breach after the fact. None of them can issue a `proved` — that needs the second-family
receipt (`codex.md`).

Every call passes `root` (absolute project path) and `preamble` (briefs.md PREAMBLE, with
the path filled in) in `args`.

## /rkl-extract — P2, formalise, on the spine

`args: { root, preamble, chunks: [{slug, key, file, from, to, title}] }`
Chunks are the sections the main theorem's proof actually runs through (find them first:
the theorem, its proof, and the lemmas it names), not the whole paper (cut list: global
pre-extraction). Returns per chunk the proposed rows (verbatim statements, hypotheses as
quotes with loci, deps, gaps) and a quote pre-check. You write the `cited`/`def`/
`assumption` rows and the PROVENANCE rows, then `make check` must print `quotes: checked
N/N` with zero `prov.*` errors before P3.

## /rkl-attack — P3, one claim

`args: { root, preamble, id, statement, label, wave, deps, angles? }`
Default one angle (one prover + one refuter). Pass 2-4 angles only for a disputed
load-bearing claim. Returns `{recommendation: {status ∈ sketched|numerical|open|refuted-candidate, best,
gaps, undeclared_premises}, attempts}`. A counterexample is refuted by its own refuter like
a proof; `refuted-candidate` means the witness survived — the row stays `open` with the
witness in `proof` until codex returns VALID on it. You: set the row to the recommended
status, never higher; every `undeclared_premises`
entry becomes an `assumption` row in deps (or a prover task to discharge it); walls become
DEAD-ROUTES entries; a `sketched` load-bearing proof goes to codex for the receipt.

## /rkl-audit — P5, once

`args: { root, preamble }`
Five lenses, every finding checked by a skeptic; FAILS CLOSED (a lens that did not run or an
UNRESOLVED finding is a blocker; `complete:false` means rerun). Returns `{complete,
blockers, followups}`. Before running: `make state-hash` → `AUDIT-OF`. You write
`notes/audit/<date>.md` (`AUDIT-OF`, `## Blockers` checklist, `## Follow-ups`); ONE repair
wave (demote first, then fix text); tick each blocker `- [x] ... -> fixed|demoted`; `make
state-hash` → `CLOSED-AT`; `make release`.

## Writing your own

The saved scripts are ordinary Workflow scripts (`export const meta`, `agent`, `pipeline`,
`parallel`, `log`, `args`). Keep the invariants: agents get the PREAMBLE; agents write only
under `notes/`; verifiers default to INVALID when uncertain; structured output via
`schema`; `.filter(Boolean)` on results; no agent edits the ledgers.
