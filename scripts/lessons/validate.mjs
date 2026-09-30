// Checks lesson packages (supabase/seed/lessons/*.json) before import.
// Every task must be solvable: exactly one right option, answers taken from the text,
// "not given" only from B1, no duplicate items. Usage: node scripts/lessons/validate.mjs [file…]
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { CEFR, LESSON_SKILLS, MATERIAL_TYPES, PRACTICE_SKILLS, TYPES, materialText, norm, tfOptions, wordCount } from './lib.mjs'

const dir = join(import.meta.dirname, '..', '..', 'supabase', 'seed', 'lessons')
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f))

let errors = 0
let warnings = 0
const titles = new Set()

for (const file of files) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'))
  console.log(`${file}: ${pkg.lessons.length} lessons`)
  for (const l of pkg.lessons) {
    const where = `[${l.cefr} ${l.kind}/${l.skill}] ${l.title}`
    const err = (m) => (errors++, console.log(`  ✗ ${where}: ${m}`))
    const warn = (m) => (warnings++, console.log(`  ! ${where}: ${m}`))

    if (!l.title?.trim()) err('no title')
    const key = `${l.kind}|${norm(l.title)}`
    if (titles.has(key)) err('duplicate title')
    titles.add(key)
    if (!CEFR.includes(l.cefr)) err(`bad cefr ${l.cefr}`)
    if (!['lesson', 'practice'].includes(l.kind)) err(`bad kind ${l.kind}`)
    const skills = l.kind === 'practice' ? PRACTICE_SKILLS : LESSON_SKILLS
    if (!skills.includes(l.skill)) err(`skill ${l.skill} is not allowed for ${l.kind}`)
    if (l.grammar && !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(l.grammar)) err(`bad grammar topic code ${l.grammar}`)
    if (l.skill === 'grammar' && !l.grammar) warn('grammar lesson without a grammar topic')

    const text = l.kind === 'practice' ? materialText(l) : ''
    if (l.kind === 'practice') {
      if (!MATERIAL_TYPES.includes(l.material?.type)) err(`bad material type ${l.material?.type}`)
      if (!text.trim()) err('practice without a text / script')
      if (l.skill === 'listening' && !l.material?.segments?.length) err('listening needs segments')
      const words = wordCount(text)
      const limits = { A1: [30, 150], A2: [80, 250], B1: [150, 450], B2: [180, 700], C1: [200, 900], C2: [250, 1100] }[l.cefr]
      if (limits && (words < limits[0] || words > limits[1])) warn(`${words} words (usual for ${l.cefr}: ${limits[0]}–${limits[1]})`)
    }
    const inText = (s) => norm(text).includes(norm(s))

    if (!l.exercises?.length) err('no exercises')
    if (l.exercises?.length < 4) warn(`only ${l.exercises.length} exercises`)
    l.exercises?.forEach((ex, i) => {
      const n = `#${i + 1} ${ex.type}`
      if (!TYPES.includes(ex.type)) return err(`${n}: unknown type`)
      if (ex.type === 'choice') {
        const opts = ex.options ?? []
        if (opts.length < 2) err(`${n}: needs at least 2 options (has ${opts.length})`)
        if (opts.length === 2 && !ex.binary) warn(`${n}: only 2 options — mark it "binary": true if that is intended (a / an)`)
        if (new Set(opts.map(norm)).size !== opts.length) err(`${n}: duplicate options`)
        if (opts.filter((o) => o === ex.answer).length !== 1) err(`${n}: the answer must be exactly one of the options`)
      }
      if (ex.type === 'truefalse') {
        const opts = ex.options ?? tfOptions(l.cefr)
        if (!opts.includes(ex.answer)) err(`${n}: answer must be one of ${opts.join(' / ')}`)
        if (ex.answer === 'not_given' && ['A1', 'A2'].includes(l.cefr)) err(`${n}: "not given" is used from B1`)
        if (!ex.prompt?.trim()) err(`${n}: no statement`)
      }
      if (ex.type === 'fill') {
        if (!ex.answer) err(`${n}: no answer`)
        if (!ex.prompt?.includes('___')) err(`${n}: no gap ___ in the prompt`)
        // in practice the answer comes from the text / recording
        if (l.kind === 'practice' && ![ex.answer, ...(ex.accept ?? [])].some(inText)) err(`${n}: the answer "${ex.answer}" is not in the text`)
      }
      if (ex.type === 'listen') {
        if (!ex.text?.trim()) err(`${n}: no text`)
        if (/[,;:!?.](?!$)/.test(ex.text.trim().replace(/[.!?]$/, ''))) err(`${n}: dictation with punctuation inside — hard to type exactly`)
        if (l.kind === 'practice' && !inText(ex.text)) err(`${n}: the dictation is not in the script`)
      }
      if (ex.type === 'order') {
        if ((ex.order ?? []).length < 3) err(`${n}: needs at least 3 items`)
        if (new Set(ex.order.map(norm)).size !== ex.order.length) err(`${n}: duplicate items`)
      }
      if (ex.type === 'match') {
        const left = Object.keys(ex.pairs ?? {})
        const right = Object.values(ex.pairs ?? {})
        if (left.length < 3) err(`${n}: needs at least 3 pairs`)
        if (new Set(right.map(norm)).size !== right.length) err(`${n}: two items on the right are the same`)
      }
    })
  }
}
console.log(errors ? `\n${errors} error(s), ${warnings} warning(s)` : `\nOK — ${warnings} warning(s)`)
process.exit(errors ? 1 : 0)
