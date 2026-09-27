// Validates dictionary packages in supabase/seed/dictionary/*.json (see the README there).
// Usage: node scripts/dictionary/validate.mjs [file.json ...]   (exit code 1 on errors)
import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

const root = join(import.meta.dirname, '..', '..')
const dir = join(root, 'supabase', 'seed', 'dictionary')
const LANGS = ['uk', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'ru', 'zh', 'ja']
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const WORD_TYPES = ['word', 'collocation', 'phrasal_verb', 'verb']
// British vowels; ɪə/ʊə only on their own (in aɪə "lion", aʊə, oʊə "poem" they are two American sounds)
const BRITISH_IPA = /ɒ|əʊ|ɜː|eə|(?<![aeɔ])ɪə|(?<![ao])ʊə/

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
const meaningRefs = [] // words that meanings packages add meanings to: [label, file]
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
  if (!['words', 'translations', 'meanings'].includes(pkg.kind)) err('file', 'kind must be "words", "translations" or "meanings"')
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
    if (pkg.kind === 'meanings') {
      // only extra meanings of a word defined in another package
      meaningRefs.push([label, name])
      if (!Array.isArray(w.meanings) || !w.meanings.length) err(label, 'meanings package entry without meanings')
    } else if (seenAll.has(key)) err(label, `duplicate (also in ${seenAll.get(key)})`)
    else seenAll.set(key, name)

    const tr = w.translations ?? {}
    for (const lang of pkg.kind === 'meanings' ? [] : LANGS) {
      const v = tr[lang]
      if (typeof v !== 'string' || !v.trim()) err(label, `missing translation "${lang}"`)
      else if (v !== v.trim()) err(label, `translation "${lang}" has leading/trailing spaces`)
    }
    for (const lang of Object.keys(tr)) if (!LANGS.includes(lang)) err(label, `unknown translation language "${lang}"`)

    // extra meanings: same requirements as the main one, identified by a stable key
    if (w.meanings !== undefined) {
      if (!Array.isArray(w.meanings)) err(label, 'meanings must be an array')
      else {
        const keys = new Set()
        for (const m of w.meanings) {
          const ml = `${label} [meaning ${m?.key ?? '?'}]`
          if (typeof m?.key !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(m.key)) err(ml, 'key must be lowercase letters/digits/-/_ (max 32)')
          else if (keys.has(m.key)) err(ml, 'duplicate key')
          else keys.add(m.key)
          if (!m?.part_of_speech) err(ml, 'missing part_of_speech')
          if (m?.cefr != null && !CEFR.includes(m.cefr)) err(ml, `cefr must be one of ${CEFR.join(', ')}`)
          if (!m?.definition?.trim()) err(ml, 'missing definition')
          if (!Array.isArray(m?.examples) || !m.examples.length || m.examples.some((e) => typeof e !== 'string' || !e.trim())) err(ml, 'examples must be a non-empty array of sentences')
          for (const lang of LANGS) if (typeof m?.translations?.[lang] !== 'string' || !m.translations[lang].trim()) err(ml, `missing translation "${lang}"`)
          for (const lang of Object.keys(m?.translations ?? {})) if (!LANGS.includes(lang)) err(ml, `unknown translation language "${lang}"`)
        }
      }
    }

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
for (const [label, file] of meaningRefs) {
  if (!seenAll.has(label.toLowerCase())) {
    errors++
    console.log(`  ✗ [${file}] ${label}: word is not in any words/translations package`)
  }
}
console.log(`\n${seenAll.size} unique word(s) in ${files.length} package(s); ${errors} error(s), ${warnings} warning(s)`)
process.exit(errors ? 1 : 0)
