export const meta = {
  name: 'rkl-audit',
  description: 'rk-light: five-lens hostile audit of the report; every finding checked by a skeptic; fails CLOSED',
  whenToUse: 'P5 of an rk-light project, exactly once per release',
  phases: [{ title: 'Audit' }, { title: 'Verify' }],
}
// args: { root, preamble }
// Fail-closed: a lens that did not run, or a finding the skeptic could not resolve, is reported as
// a blocker (never silently dropped). Blockers are decided by SEVERITY on every lens.
const { root, preamble } = args
const LENSES = [
  ['overclaim', 'any sentence in report/ stronger than the \\claimstatus tag next to it or than the derived status in CLAIMS.md ("we prove" beside a sketched tag counts)'],
  ['provenance-meaning', 'a PROVENANCE quote that matches the source bytes but is used to support something the source does not say at that locus (direction of an inequality, a stronger quantifier, a dropped hypothesis)'],
  ['convention-drift', 'sign, normalisation, naming or index conventions that differ between sections or from CONVENTIONS.md, or a definition restated differently from its def: environment'],
  ['scope-assumptions', 'hypotheses a proof uses that are not claim ids, not assumption rows, or not actually present in the source at the cited line; and any sentence of the form "the source does not assume/prove X" without an absence note under notes/'],
  ['math-error', 'a step that does not follow, a missing case, a constant that does not work, a limit exchanged without justification'],
]
const F = { type: 'object', required: ['findings'], properties: { findings: { type: 'array', items: { type: 'object', required: ['where', 'what', 'severity', 'fix'], properties: { where: { type: 'string' }, what: { type: 'string' }, severity: { enum: ['BLOCKER', 'MAJOR', 'MINOR'] }, fix: { type: 'string' } } } } } }
const V = { type: 'object', required: ['verdict', 'reason'], properties: { verdict: { enum: ['CONFIRMED', 'DISPROVED', 'UNRESOLVED'] }, reason: { type: 'string' } } }
const out = await pipeline(LENSES,
  ([k, d]) => agent(`${preamble}\nTASK (auditor, lens "${k}"). Project ${root}. Find every instance of: ${d}. Read CLAIMS.md, PROVENANCE.md, report/sections/*.tex and the sources they cite. Write notes/audit/lens-${k}.md.`, { label: `audit:${k}`, phase: 'Audit', schema: F })
    .then(r => ({ lens: k, result: r })),
  ({ lens, result }) => result
    ? parallel(result.findings.map(f => () =>
        agent(`${preamble}\nTASK (skeptic). Project ${root}. Is this audit finding real? "${f.what}" at ${f.where} (lens ${lens}). Open the files and the source. CONFIRMED only if you verified it yourself; DISPROVED only if you can show it is wrong; otherwise UNRESOLVED.`, { label: `verify:${lens}`, phase: 'Verify', schema: V })
          .then(v => ({ ...f, lens, verdict: v ? v.verdict : 'UNRESOLVED', reason: v ? v.reason : 'skeptic did not return' }))))
      .then(vs => ({ lens, ok: true, findings: vs.map((v, i) => v || { ...result.findings[i], lens, verdict: 'UNRESOLVED', reason: 'skeptic died' }) }))
    : { lens, ok: false, findings: [{ where: '-', what: `lens ${lens} did not run`, severity: 'BLOCKER', fix: 'rerun the lens', lens, verdict: 'UNRESOLVED', reason: 'auditor died' }] })
const lenses = out.filter(Boolean)
const all = lenses.flatMap(l => l.findings).filter(f => f.verdict !== 'DISPROVED')
const isBlocker = f => f.severity === 'BLOCKER' || f.severity === 'MAJOR' || f.verdict === 'UNRESOLVED'
const missing = LENSES.length - lenses.filter(l => l.ok).length
log(`${lenses.filter(l => l.ok).length}/${LENSES.length} lenses ran; ${all.length} findings kept (${all.filter(f => f.verdict === 'UNRESOLVED').length} unresolved); ${all.filter(isBlocker).length} blockers`)
return { complete: missing === 0, lenses_missing: missing, blockers: all.filter(isBlocker), followups: all.filter(f => !isBlocker(f)) }
