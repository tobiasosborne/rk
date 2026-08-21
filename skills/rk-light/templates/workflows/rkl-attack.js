export const meta = {
  name: 'rkl-attack',
  description: 'rk-light: one or more independent proof attempts on a claim, each adversarially refuted, then judged',
  whenToUse: 'P3 of an rk-light project. Default ONE angle; more only for a disputed load-bearing claim',
  phases: [{ title: 'Prove' }, { title: 'Refute' }, { title: 'Judge' }],
}
// args: { root, preamble, id, statement, label, wave, angles: [string] (default one), deps: [ids] }
// Provers write notes/<wave>/attempt-<i>/proof.md; refuters write .../refute.md. Nobody edits ledgers.
// The judge recommends a ledger status from {sketched, numerical, open, refuted-candidate}. Neither
// `proved` nor `refuted` can come out of this workflow: both need the second-family receipt
// (references/codex.md). A refuted-candidate carries a witness file that the verifier must check.
const { root, preamble, id, statement, label, wave, deps } = args
const angles = (args.angles && args.angles.length) ? args.angles : ['direct']
const PROOF = { type: 'object', required: ['status', 'file', 'gaps', 'premises', 'new_assumptions'],
  properties: { status: { enum: ['proved-here', 'sketched', 'refuted', 'open'] }, file: { type: 'string' },
    gaps: { type: 'array', items: { type: 'string' } }, premises: { type: 'array', items: { type: 'string' } },
    new_assumptions: { type: 'array', items: { type: 'string' } } } }
const VERDICT = { type: 'object', required: ['verdict', 'issues', 'file', 'premises'],
  properties: { verdict: { enum: ['VALID', 'INVALID'] }, file: { type: 'string' }, premises: { type: 'array', items: { type: 'string' } },
    issues: { type: 'array', items: { type: 'object', required: ['severity', 'what'], properties: { severity: { enum: ['BLOCKER', 'MAJOR', 'MINOR'] }, what: { type: 'string' }, where: { type: 'string' } } } } } }
const attempts = await pipeline(angles,
  (angle, _, i) => agent(`${preamble}\nTASK (prover). Project ${root}. Claim ${id} "${statement}" (label ${label}). Declared deps: ${JSON.stringify(deps || [])}. Angle: ${angle}. Write notes/${wave}/attempt-${i}/proof.md: full proof, every step justified; a "Gaps" section; the premises actually used (claim ids); any NEW assumption you had to introduce. If the claim is false, write the witness to the same file, verify it against the definitions in report/sections/02_setup.tex, and return status refuted.`,
    { label: `prove:${i}`, phase: 'Prove', schema: PROOF }),
  (p, angle, i) => (p && p.status !== 'open')
    ? agent(`${preamble}\nTASK (verifier, REFUTE stance). Project ${root}. The ${p.status === 'refuted' ? 'claimed counterexample' : 'proof'} at ${p.file} for claim ${id} "${statement}". You did not write it. ${p.status === 'refuted' ? 'Check the witness against the exact definitions and hypotheses; a witness that violates a hypothesis refutes nothing.' : 'Find the step that fails, the hypothesis used but not declared in ' + JSON.stringify(deps || []) + ', the definition used differently from report/sections/02_setup.tex, the cited fact the local source does not say (open sources/<key> at the locus).'} List every premise actually used. Write notes/${wave}/attempt-${i}/refute.md. Default INVALID when uncertain.`,
        { label: `refute:${i}`, phase: 'Refute', schema: VERDICT }).then(v => ({ angle, proof: p, verdict: v }))
    : { angle, proof: p, verdict: null })
const live = attempts.filter(a => a && a.proof)
const survivors = live.filter(a => a.verdict && a.verdict.verdict === 'VALID')
log(`${live.length} attempt(s); ${survivors.length} survived refutation`)
const judge = await agent(`${preamble}\nTASK (judge). Project ${root}. Claim ${id}. Attempts: ${JSON.stringify(live.map(a => ({ proof: a.proof.file, status: a.proof.status, refute: a.verdict && a.verdict.file, verdict: a.verdict && a.verdict.verdict })))}. Recommend ONE ledger status: sketched (a proof survived or nearly did), numerical, open, or refuted-candidate (a witness survived its refuter; the orchestrator still needs the second-family receipt before writing refuted). proved is not yours to grant. Name the best file, list remaining gaps, and list every premise or NEW assumption reported by any prover or verifier that is not in ${JSON.stringify(deps || [])}.`,
  { phase: 'Judge', schema: { type: 'object', required: ['status', 'best', 'gaps', 'undeclared_premises'], properties: { status: { enum: ['sketched', 'numerical', 'open', 'refuted-candidate'] }, best: { type: 'string' }, gaps: { type: 'array', items: { type: 'string' } }, undeclared_premises: { type: 'array', items: { type: 'string' } } } } })
return { recommendation: judge, attempts: live }
