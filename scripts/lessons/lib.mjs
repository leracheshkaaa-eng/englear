// Shared by validate.mjs and to-sql.mjs: turns a package lesson into database rows,
// exactly as the app's exerciseToRow() does (src/lib/exercises.ts).

export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const LESSON_SKILLS = ['vocabulary', 'grammar', 'mixed']
export const PRACTICE_SKILLS = ['reading', 'listening']
export const MATERIAL_TYPES = ['article', 'story', 'blog', 'email', 'letter', 'notice', 'advert', 'review', 'interview_text', 'podcast', 'dialogue', 'interview', 'announcement', 'monologue', 'radio']
export const TYPES = ['fill', 'choice', 'listen', 'dialogue', 'truefalse', 'order', 'match']
/** "Not given" only from B1 (as in Cambridge exams); A1–A2 use true / false. */
export const tfOptions = (cefr) => (['A1', 'A2'].includes(cefr) ? ['true', 'false'] : ['true', 'false', 'not_given'])

export const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').replace(/[.,!?;:]+$/g, '')

/** Same as stableShuffle() in the app — the same items always give the same order. */
export function stableShuffle(items) {
  const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)
  const out = [...items].sort((a, b) => hash(a) - hash(b) || a.localeCompare(b))
  return out.every((x, i) => x === items[i]) ? [...items].reverse() : out
}

export function materialText(l) {
  const m = l.material ?? {}
  return m.segments?.length ? m.segments.map((s) => s.text).join('\n') : (m.body ?? '')
}
export const wordCount = (text) => (text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length
/** listening: about 130 words a minute */
export const durationSec = (l) => (l.skill === 'listening' ? Math.round((wordCount(materialText(l)) / 130) * 60) : 0)

const hashText = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)
const NUMBERISH = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|half|nothing|free)\b/i

export function exerciseRow(ex, position, cefr) {
  const base = { type: ex.type, position, prompt: ex.prompt ?? '', answer: '', options: [], explanation: ex.explanation ?? '', dialogue: [], data: {}, solution: {} }
  switch (ex.type) {
    case 'fill':
      return { ...base, answer: ex.answer, data: ex.bank?.length ? { bank: ex.bank } : {}, solution: ex.accept?.length ? { accept: ex.accept } : {} }
    case 'choice':
      // mixed, so the right answer is not always in the same place; numbers and times keep their natural order
      if (ex.keepOrder || ex.options.every((o) => NUMBERISH.test(o))) return { ...base, options: ex.options, answer: ex.answer }
      {
        // the wrong options mixed; the right one at a place that depends on the task, so it is not always in the same spot
        const others = stableShuffle(ex.options.filter((o) => o !== ex.answer))
        const at = Math.abs(hashText(`${ex.prompt}|${position}`)) % ex.options.length
        others.splice(at, 0, ex.answer)
        return { ...base, options: others, answer: ex.answer }
      }
    case 'truefalse':
      return { ...base, options: ex.options ?? tfOptions(cefr), answer: ex.answer }
    case 'listen':
      return { ...base, prompt: '', answer: ex.text, data: { text: ex.text } }
    case 'order': {
      const unit = ex.order.every((x) => !/\s/.test(x)) ? 'word' : 'sentence'
      return { ...base, data: { items: stableShuffle(ex.order), unit }, solution: { order: ex.order } }
    }
    case 'match':
      return { ...base, data: { left: Object.keys(ex.pairs), right: stableShuffle(Object.values(ex.pairs)) }, solution: { pairs: ex.pairs } }
    case 'dialogue':
      return { ...base, prompt: '', dialogue: ex.lines }
    default:
      throw new Error(`unknown exercise type ${ex.type}`)
  }
}
