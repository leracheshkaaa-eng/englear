// Checks every interface locale against the English source (src/i18n/locales/en.json):
//  - the same keys (plural forms are compared by their base key),
//  - every plural category the language needs (Intl.PluralRules),
//  - the same {{placeholders}} as English.
// Usage: node scripts/check-locales.mjs   (exit code 1 on problems)
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(import.meta.dirname, '..', 'src', 'i18n', 'locales')
const PLURAL = /_(zero|one|two|few|many|other)$/

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') flatten(v, key, out)
    else out[key] = String(v)
  }
  return out
}
const vars = (s) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).filter((v) => v !== 'count').sort().join(',')

function describe(flat) {
  const base = new Map() // base key -> { plural: Set<category> | null, texts: string[] }
  for (const [key, text] of Object.entries(flat)) {
    const m = key.match(PLURAL)
    const b = m ? key.slice(0, -m[0].length) : key
    const entry = base.get(b) ?? { plural: m ? new Set() : null, texts: [] }
    if (m) (entry.plural ??= new Set()).add(m[1])
    entry.texts.push(text)
    base.set(b, entry)
  }
  return base
}

const en = describe(flatten(JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8'))))
let problems = 0
const report = (lang, msg) => {
  problems++
  console.log(`  [${lang}] ${msg}`)
}

for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const lang = file.replace('.json', '')
  const loc = describe(flatten(JSON.parse(readFileSync(join(dir, file), 'utf8'))))
  const needed = new Intl.PluralRules(lang).resolvedOptions().pluralCategories
  const before = problems
  for (const [key, e] of en) {
    const l = loc.get(key)
    if (!l) {
      report(lang, `missing: ${key}`)
      continue
    }
    if (e.plural) {
      if (!l.plural) report(lang, `${key}: needs plural forms`)
      else for (const c of needed) if (!l.plural.has(c) && !(c === 'many' && l.plural.has('other') && ['fr', 'es', 'it', 'pt'].includes(lang))) report(lang, `${key}: missing plural form "${c}"`)
    }
    const want = vars(e.texts[0])
    for (const t of l.texts) if (vars(t) !== want) report(lang, `${key}: placeholders {{${vars(t)}}} ≠ English {{${want}}}`)
  }
  for (const key of loc.keys()) if (!en.has(key)) report(lang, `unknown key (not in English): ${key}`)
  console.log(`${lang}: ${problems === before ? 'OK' : `${problems - before} problem(s)`} (${loc.size} keys)`)
}
if (problems) {
  console.log(`\n${problems} problem(s) found`)
  process.exit(1)
}
console.log('\nAll locales match English.')
