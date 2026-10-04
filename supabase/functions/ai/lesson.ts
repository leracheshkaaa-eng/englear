// AI lesson generator for teachers.
// 1. The model writes exercises as JSON (schema below).
// 2. Rule checks drop anything that is broken or ambiguous by construction.
// 3. A second model solves the remaining exercises WITHOUT the answers; exercises it answers
//    differently are dropped as ambiguous.
// 4. What is left is turned into the editor syntax (the teacher reviews it before saving).

export type GenRequest = {
  level: string
  focus: 'grammar' | 'vocabulary' | 'mixed'
  grammar: string // grammar topic (English title), may be empty
  topic: string // theme of the lesson, may be empty
  count: number
  types: string[]
  wishes: string
  explainLang: string // language name for the explanations
}

export const GEN_TYPES = ['choice', 'fill', 'truefalse', 'order', 'match', 'dialogue', 'listen'] as const

export const LESSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'exercises'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    exercises: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'prompt', 'options', 'answer', 'accept', 'items', 'pairs', 'lines', 'explanation'],
        properties: {
          type: { type: 'string', enum: [...GEN_TYPES] },
          prompt: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
          accept: { type: 'array', items: { type: 'string' } },
          items: { type: 'array', items: { type: 'string' } },
          pairs: {
            type: 'array',
            items: { type: 'object', additionalProperties: false, required: ['left', 'right'], properties: { left: { type: 'string' }, right: { type: 'string' } } },
          },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['speaker', 'text', 'answer'],
              properties: { speaker: { type: 'string' }, text: { type: 'string' }, answer: { type: 'string' } },
            },
          },
          explanation: { type: 'string' },
        },
      },
    },
  },
}

export type GenExercise = {
  type: (typeof GEN_TYPES)[number]
  prompt: string
  options: string[]
  answer: string
  accept: string[]
  items: string[]
  pairs: { left: string; right: string }[]
  lines: { speaker: string; text: string; answer: string }[]
  explanation: string
}

export function lessonSystem(r: GenRequest) {
  const tfng = !['A1', 'A2'].includes(r.level)
  return `You are an expert ELT materials writer creating an English lesson for the EngLean platform.
Level: ${r.level} (CEFR). Every word, sentence and situation must fit this level.
The learners include children, so all content must be suitable for a child.

Write the explanations in ${r.explainLang}; keep English examples in English. Explanations are short (one sentence): why the answer is right.

THE MOST IMPORTANT RULE: every exercise must have exactly ONE correct answer that a learner at this level can find from the exercise itself. No trick questions, no answers that depend on outside facts, no second acceptable answer. If a gap could be filled correctly in two ways, add context or choose another sentence.

Exercise formats (fill only the fields of the chosen type; leave the others as "" or []):
- choice: "prompt" is one sentence with exactly one gap "___"; "options" 3 or 4 different short options; "answer" equals one of the options exactly. Distractors must be clearly wrong in this sentence.
- fill: "prompt" has exactly one gap "___", with a hint in brackets when the form is not obvious, e.g. "She ___ (go) to school every day."; "answer" is the only correct filler; "accept" lists equally correct spellings/contractions only (e.g. "doesn't" and "does not"), else [].
- truefalse: "prompt" is a statement that can be judged with no outside knowledge, e.g. about grammar: "“She go to school” is a correct sentence." ; "answer" is "true" or "false"${tfng ? '' : ' (never "not_given")'}.
- order: "items" are the words (or short chunks) of ONE sentence in the CORRECT order, 3–9 items, all different; there must be only one natural order; "prompt" is "".
- match: "pairs" 3–6 pairs {left, right} (e.g. word = meaning, or question = answer); every left and right is different and each left has exactly one right; "prompt" is a short instruction.
- dialogue: exactly 2 "lines" (speakers "A" and "B"); line 1 has no gap and "answer" ""; line 2 has exactly one "___" and its "answer" is the filler.
- listen: "prompt" is a short sentence (3–10 words) the learner will hear and write down; "answer" is the same sentence.

Do not use the characters "#", "|", "/", "*", "=" or ">>" inside any text.
"title" is a short lesson title in English; "description" is one sentence in ${r.explainLang} saying what the learner will practise.`
}

export function lessonUser(r: GenRequest) {
  const focus = r.focus === 'grammar' ? 'grammar' : r.focus === 'vocabulary' ? 'vocabulary' : 'grammar and vocabulary'
  return [
    `Create a ${r.level} lesson focused on ${focus}.`,
    r.grammar ? `Grammar point: ${r.grammar}.` : '',
    r.topic ? `Theme / vocabulary topic: ${r.topic}.` : '',
    `Write ${r.count} exercises, using these formats (mix them, easier ones first): ${r.types.join(', ')}.`,
    r.wishes ? `Teacher's wishes: ${r.wishes}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/* ---------------- rule checks ---------------- */

const norm = (s: string) => s.trim().toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').replace(/[.,!?;:]+$/g, '')
const FORBIDDEN = /[#|*=]|>>/
const clean = (s: string) => String(s ?? '').replace(/\s+/g, ' ').trim()
const gaps = (s: string) => (s.match(/___/g) ?? []).length

/** null = keep; string = why it was dropped */
export function ruleProblem(ex: GenExercise, level: string): string | null {
  const texts = [ex.prompt, ex.answer, ex.explanation, ...ex.options, ...ex.accept, ...ex.items, ...ex.pairs.flatMap((p) => [p.left, p.right]), ...ex.lines.flatMap((l) => [l.text, l.answer])]
  if (texts.some((t) => FORBIDDEN.test(t ?? ''))) return 'forbidden characters'
  switch (ex.type) {
    case 'choice': {
      const opts = ex.options.map(clean).filter(Boolean)
      if (gaps(ex.prompt) !== 1) return 'choice needs one gap'
      if (opts.length < 2 || opts.length > 4) return 'choice needs 2–4 options'
      if (opts.some((o) => o.includes('/'))) return 'slash in option'
      if (new Set(opts.map(norm)).size !== opts.length) return 'duplicate options'
      if (opts.filter((o) => norm(o) === norm(ex.answer)).length !== 1) return 'answer not exactly one option'
      return null
    }
    case 'fill':
      if (gaps(ex.prompt) !== 1) return 'fill needs one gap'
      if (!clean(ex.answer)) return 'no answer'
      return null
    case 'truefalse': {
      const a = norm(ex.answer).replace(' ', '_')
      if (!clean(ex.prompt)) return 'no statement'
      if (!['true', 'false', ...(['A1', 'A2'].includes(level) ? [] : ['not_given'])].includes(a)) return 'bad true/false answer'
      return null
    }
    case 'order': {
      const it = ex.items.map(clean).filter(Boolean)
      if (it.length < 3 || it.length > 10) return 'order needs 3–10 items'
      if (new Set(it.map(norm)).size !== it.length) return 'duplicate items'
      return null
    }
    case 'match': {
      const ps = ex.pairs.map((p) => ({ left: clean(p.left), right: clean(p.right) })).filter((p) => p.left && p.right)
      if (ps.length < 3 || ps.length > 6) return 'match needs 3–6 pairs'
      if (new Set(ps.map((p) => norm(p.left))).size !== ps.length || new Set(ps.map((p) => norm(p.right))).size !== ps.length) return 'duplicate match items'
      return null
    }
    case 'dialogue': {
      const ls = ex.lines
      if (ls.length !== 2) return 'dialogue needs 2 lines'
      if (gaps(ls[0].text) !== 0 || gaps(ls[1].text) !== 1 || !clean(ls[1].answer)) return 'dialogue gap must be in line 2'
      return null
    }
    case 'listen': {
      const w = clean(ex.prompt).split(' ').length
      if (w < 2 || w > 14) return 'listen sentence length'
      return null
    }
  }
  return 'unknown type'
}

/* ---------------- independent solver ---------------- */

export const SOLVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answers'],
  properties: { answers: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'answer'], properties: { n: { type: 'integer' }, answer: { type: 'string' } } } } },
}

/** The exercises as a learner sees them (no answers). Listen tasks are not sent (nothing to solve). */
export function solverPrompt(list: { n: number; ex: GenExercise }[], level: string) {
  const lines = list.map(({ n, ex }) => {
    switch (ex.type) {
      case 'choice':
        return `${n}. [choose one option] ${ex.prompt} Options: ${ex.options.map((o) => `"${o}"`).join(', ')}`
      case 'fill':
        return `${n}. [write the word(s) for the gap] ${ex.prompt}`
      case 'truefalse':
        return `${n}. [answer true or false${['A1', 'A2'].includes(level) ? '' : ' or not_given'}] ${ex.prompt}`
      case 'order': {
        const shuffled = [...ex.items].sort((a, b) => a.localeCompare(b))
        return `${n}. [put in order; answer with the items joined by " | "] ${shuffled.join(' | ')}`
      }
      case 'match':
        return `${n}. [match; answer as "left=right" pairs joined by " | "] Left: ${ex.pairs.map((p) => p.left).join(' | ')}. Right: ${[...ex.pairs.map((p) => p.right)].sort().join(' | ')}`
      case 'dialogue':
        return `${n}. [write the word(s) for the gap] A: ${ex.lines[0].text} B: ${ex.lines[1].text}`
      default:
        return ''
    }
  })
  return `Solve these ${level} English exercises. Give exactly one best answer for each, in the requested format.\n\n${lines.join('\n')}`
}

/** Does the solver's answer agree with the intended one? */
export function agrees(ex: GenExercise, given: string): boolean {
  const g = norm(given)
  switch (ex.type) {
    case 'choice':
      return g === norm(ex.answer)
    case 'fill':
      return [ex.answer, ...ex.accept].some((a) => norm(a) === g)
    case 'truefalse':
      return g.replace(' ', '_') === norm(ex.answer).replace(' ', '_')
    case 'order':
      return given.split('|').map(norm).join(' ') === ex.items.map(norm).join(' ')
    case 'match': {
      const want = new Map(ex.pairs.map((p) => [norm(p.left), norm(p.right)]))
      const got = given.split('|').map((x) => x.split('=').map(norm))
      return got.length === want.size && got.every(([l, r]) => want.get(l) === r)
    }
    case 'dialogue':
      return g === norm(ex.lines[1].answer)
    default:
      return true
  }
}

/* ---------------- editor syntax ---------------- */

export function toEditorLine(ex: GenExercise, level: string): string {
  const tail = clean(ex.explanation) ? ` # ${clean(ex.explanation)}` : ''
  switch (ex.type) {
    case 'choice':
      return `choice: ${clean(ex.prompt)} ${ex.options.map(clean).map((o) => (norm(o) === norm(ex.answer) ? `* ${o}` : o)).join(' / ')}${tail}`
    case 'fill':
      return `fill: ${clean(ex.prompt)} = ${[ex.answer, ...ex.accept].map(clean).filter(Boolean).join(' | ')}${tail}`
    case 'truefalse':
      return `${['A1', 'A2'].includes(level) ? 'tf' : 'tfng'}: ${clean(ex.prompt)} = ${norm(ex.answer).replace('_', ' ')}${tail}`
    case 'order':
      return `order: ${ex.items.map(clean).join(' | ')}${tail}`
    case 'match':
      return `match: ${ex.pairs.map((p) => `${clean(p.left)} = ${clean(p.right)}`).join(' | ')}${tail}`
    case 'dialogue':
      return `dialogue: A: ${clean(ex.lines[0].text)} >> B: ${clean(ex.lines[1].text).replace('___', `___ (${clean(ex.lines[1].answer)})`)}${tail}`
    case 'listen':
      return `listen: ${clean(ex.prompt)}${tail}`
  }
}
