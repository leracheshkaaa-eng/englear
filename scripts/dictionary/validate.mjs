// Validates dictionary packages in supabase/seed/dictionary/*.json (see the README there).
// Usage: node scripts/dictionary/validate.mjs [file.json ...]   (exit code 1 on errors)
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const dir = join(root, 'supabase', 'seed', 'dictionary')
const LANGS = ['uk', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'ru', 'zh', 'ja']
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const WORD_TYPES = ['word', 'collocation', 'phrasal_verb', 'verb']
const BRITISH_IPA = /ɒ|əʊ|ɜː|eə|ɪə|ʊə/

// topics and IELTS categories come from the app config, so there is one list
const config = readFileSync(join(root, 'src', 'lib', 'config.ts'), 'utf8')
const listFrom = (name) => [...config.match(new RegExp(`${name} = \\[([\\s\\S]*?)\\]`))[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
const TOPICS = listFrom('TOPICS')
const IELTS = listFrom('IELTS_CATEGORIES')

const files = process.argv.slice(2).length
  ? process.argv.slice(2).map((f) => join(dir, basename(f)))
  : readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f))

let errors = 0
let warnings = 0
const seenAll = new Map() // lower(word) -> file
for (const file of files) {
  const name = basename(file)
  const err = (w, msg) => {
    errors++
    console.log(`  ✗ [${name}] ${w}: ${msg}`)
  }
  const warn = (w, msg) => {
    warnings++
    console.log(`  ! [${name}] ${w}: ${msg}`)
  }
  let pkg
  try {
    pkg = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    err('file', `invalid JSON: ${e.message}`)
    continue
  }
  if (!['words', 'translations'].includes(pkg.kind)) err('file', 'kind must be "words" or "translations"')
  if (!Array.isArray(pkg.words) || !pkg.words.length) {
    err('file', 'words must be a non-empty array')
    continue
  }
  const before = errors
  for (const w of pkg.words) {
    const word = typeof w.word === 'string' ? w.word.trim() : ''
    const label = word || '(empty)'
    if (!word) err(label, 'empty word')
    if (word !== w.word) err(label, 'leading/trailing spaces')
    const key = word.toLowerCase()
    if (seenAll.has(key)) err(label, `duplicate (also in ${seenAll.get(key)})`)
    else seenAll.set(key, name)

    const tr = w.translations ?? {}
    for (const lang of LANGS) {
      const v = tr[lang]
      if (typeof v !== 'string' || !v.trim()) err(label, `missing translation "${lang}"`)
      else if (v !== v.trim()) err(label, `translation "${lang}" has leading/trailing spaces`)
    }
    for (const lang of Object.keys(tr)) if (!LANGS.includes(lang)) err(label, `unknown translation language "${lang}"`)

    if (pkg.kind !== 'words') continue
    if (!w.part_of_speech) err(label, 'missing part_of_speech')
    if (!CEFR.includes(w.cefr)) err(label, `cefr must be one of ${CEFR.join(', ')}`)
    if (!TOPICS.includes(w.topic)) err(label, `unknown topic "${w.topic}"`)
    if (w.ielts_category != null && !IELTS.includes(w.ielts_category)) err(label, `unknown ielts_category "${w.ielts_category}"`)
    if (w.word_type != null && !WORD_TYPES.includes(w.word_type)) err(label, `invalid word_type "${w.word_type}"`)
    if (typeof w.ipa !== 'string' || !/^\/[^/\s][^/]*[^/\s]\/$|^\/[^/\s]\/$/.test(w.ipa)) err(label, `ipa must look like /…/ without inner edge spaces (${w.ipa})`)
    else if (BRITISH_IPA.test(w.ipa)) err(label, `ipa looks British (${w.ipa}); use American`)
    if (!w.definition?.trim()) err(label, 'missing definition')
    if (!Array.isArray(w.examples) || !w.examples.length || w.examples.some((e) => typeof e !== 'string' || !e.trim())) {
      err(label, 'examples must be a non-empty array of sentences')
    } else {
      const stem = key.split(' ')[0].replace(/(e|y)$/, '')
      if (!w.examples.some((e) => e.toLowerCase().includes(stem))) warn(label, 'no example contains the word (check inflection)')
    }
  }
  console.log(`${name}: ${pkg.words.length} word(s), ${errors - before ? `${errors - before} error(s)` : 'OK'}`)
}
console.log(`\n${seenAll.size} unique word(s) in ${files.length} package(s); ${errors} error(s), ${warnings} warning(s)`)
process.exit(errors ? 1 : 0)
