export const meta = {
  name: 'rkl-extract',
  description: 'rk-light: extract claims + every hypothesis (verbatim, with loci) from source chunks, then pre-check the quotes',
  whenToUse: 'P2 of an rk-light formalise project, on the spine of the paper (main theorem and what it uses), not the whole paper',
  phases: [{ title: 'Extract' }, { title: 'Pre-check' }],
}
// args: { root, preamble, chunks: [{slug, key, file, from, to, title}] }
// Agents write under notes/extract/ only; the orchestrator writes the ledgers.
const { root, preamble, chunks } = args
const ROW = { type: 'object', required: ['id', 'kind', 'statement', 'locus', 'hypotheses', 'deps', 'gaps'],
  properties: { id: { type: 'string' }, kind: { type: 'string' }, statement: { type: 'string' }, locus: { type: 'string' },
    hypotheses: { type: 'array', items: { type: 'object', required: ['quote', 'locus'], properties: { quote: { type: 'string' }, locus: { type: 'string' } } } },
    deps: { type: 'array', items: { type: 'string' } }, gaps: { type: 'array', items: { type: 'string' } } } }
const OUT = { type: 'object', required: ['rows', 'file'], properties: { rows: { type: 'array', items: ROW }, file: { type: 'string' } } }
const CHECK = { type: 'object', required: ['ok', 'problems'], properties: { ok: { type: 'boolean' }, problems: { type: 'array', items: { type: 'string' } } } }
const results = await pipeline(chunks,
  c => agent(`${preamble}\nTASK (extractor). Project ${root}. Read sources/${c.key}/${c.file} lines ${c.from}-${c.to} ("${c.title}"). For every definition, assumption, theorem, lemma, proposition, corollary: propose an id, give the statement as VERBATIM bytes with locus ${c.key}:<line>, list every hypothesis as a verbatim quote with its locus, list the results it depends on, and list every "clearly"/"it is easy to see"/"we assume"/"standard" phrase as a gap. Write the table to notes/extract/${c.slug}.md and return the rows. Never paraphrase; never fill a gap.`,
    { label: `extract:${c.slug}`, phase: 'Extract', schema: OUT }),
  (out, c) => out && agent(`${preamble}\nTASK (quote pre-check). Project ${root}. For each row in ${out.file}, open sources/${c.key}/${c.file} at the stated locus and confirm the statement and every hypothesis quote occur there verbatim. Report each mismatch as "<id>: <quote> -> what the source says at <locus>".`,
    { label: `precheck:${c.slug}`, phase: 'Pre-check', schema: CHECK }).then(p => ({ chunk: c.slug, file: out.file, rows: out.rows, precheck: p })))
const got = results.filter(Boolean)
log(`${got.length}/${chunks.length} chunks extracted; ${got.filter(g => !(g.precheck && g.precheck.ok)).length} with quote problems`)
return got
