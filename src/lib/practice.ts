/* ============================================================
   Practice lesson after a flashcard set (MVP, no AI yet).
   Builds 5-8 short exercises from the set's own words using the
   dictionary data (translation, definition, example sentence), in the
   regular exercise types so the lesson player UI can be reused.
   generatePractice() is the single place to swap in an AI generator later.
   ============================================================ */
import i18n from '../i18n'
import type { Exercise } from './exercises'

/** One card of a set, whatever its source (own card or dictionary word). */
export type StudyItem = {
  id: string // flashcard id or dictionary word id
  front: string // English
  back: string // translation
  pronunciation?: string
  definition?: string
  example?: string
  cefr?: string
}

const MIN_EXERCISES = 5
const MAX_EXERCISES = 8

type Kind = 'translation' | 'sentence' | 'reverse' | 'context' | 'definition' | 'listen'
const KINDS: Kind[] = ['translation', 'sentence', 'reverse', 'context', 'definition', 'listen']

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** The answer plus up to 3 distinct wrong options, shuffled. */
function options(answer: string, wrong: string[]): string[] {
  const seen = new Set([answer.trim().toLowerCase()])
  const picked: string[] = []
  for (const w of shuffle(wrong)) {
    const k = w.trim().toLowerCase()
    if (!k || seen.has(k)) continue
    seen.add(k)
    picked.push(w)
    if (picked.length === 3) break
  }
  return shuffle([answer, ...picked])
}

/** Replace the word in its example sentence with ___ (null if it does not appear as-is). */
function blankOut(sentence: string, word: string): { text: string; answer: string } | null {
  const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = sentence.match(new RegExp(`\\b${escaped}\\b`, 'i'))
  if (!m || m.index === undefined) return null
  return { text: sentence.slice(0, m.index) + '___' + sentence.slice(m.index + m[0].length), answer: m[0] }
}

export function generatePractice(items: StudyItem[]): Exercise[] {
  const usable = items.filter((i) => i.front.trim())
  if (!usable.length) return []
  const others = (it: StudyItem) => usable.filter((x) => x.id !== it.id)

  const makers: Record<Kind, (it: StudyItem) => Exercise | null> = {
    translation: (it) => {
      if (!it.back) return null
      const opts = options(it.back, others(it).map((x) => x.back).filter(Boolean))
      if (opts.length < 2) return null
      return { type: 'choice', prompt: i18n.t('practice.chooseTranslation', { word: it.front }), options: opts, answer: it.back, explanation: `${it.front} — ${it.back}` }
    },
    reverse: (it) => {
      if (!it.back) return null
      const opts = options(it.front, others(it).map((x) => x.front))
      if (opts.length < 2) return null
      return { type: 'choice', prompt: i18n.t('practice.whichEnglishWord', { translation: it.back }), options: opts, answer: it.front, explanation: `${it.back} — ${it.front}` }
    },
    sentence: (it) => {
      const b = it.example && blankOut(it.example, it.front)
      if (!b) return null
      return { type: 'fill', prompt: b.text, answer: b.answer, explanation: it.back ? `${it.front} — ${it.back}` : '' }
    },
    context: (it) => {
      const b = it.example && blankOut(it.example, it.front)
      if (!b) return null
      const opts = options(b.answer, others(it).map((x) => x.front))
      if (opts.length < 2) return null
      return { type: 'choice', prompt: b.text, options: opts, answer: b.answer, explanation: it.back ? `${it.front} — ${it.back}` : '' }
    },
    definition: (it) => {
      if (!it.definition) return null
      const opts = options(it.front, others(it).map((x) => x.front))
      if (opts.length < 2) return null
      return { type: 'choice', prompt: i18n.t('practice.whichWordFits', { definition: it.definition }), options: opts, answer: it.front, explanation: '' }
    },
    listen: (it) => ({ type: 'listen', text: it.front, explanation: it.back ? `${it.front} — ${it.back}` : '' }),
  }

  const target = Math.min(MAX_EXERCISES, Math.max(MIN_EXERCISES, usable.length))
  const pool = shuffle(usable)
  const uses = new Map<string, number>()
  const done = new Set<string>()
  const out: Exercise[] = []

  // Rotate exercise types; for each type take the least-used word that supports it.
  let k = 0
  let stalled = 0
  while (out.length < target && stalled < KINDS.length) {
    const kind = KINDS[k++ % KINDS.length]
    const candidates = [...pool].sort((a, b) => (uses.get(a.id) ?? 0) - (uses.get(b.id) ?? 0))
    let made = false
    for (const it of candidates) {
      const key = `${kind}:${it.id}`
      if (done.has(key)) continue
      const ex = makers[kind](it)
      if (!ex) continue
      done.add(key)
      uses.set(it.id, (uses.get(it.id) ?? 0) + 1)
      out.push(ex)
      made = true
      break
    }
    stalled = made ? 0 : stalled + 1
  }
  return out
}
