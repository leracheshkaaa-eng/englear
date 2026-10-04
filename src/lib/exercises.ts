/* ============================================================
   Exercise model + parser.
   Preserves the existing EngLean syntax EXACTLY:
     ___        blank
     =          answer (fill)
     *          correct option (choice)
     /          separates choices
     >>         dialogue turns
     (answer)   dialogue answer
     #          explanation (never spoken by TTS)
   ============================================================ */

import i18n from '../i18n'

// `id` is the DB row id; present on exercises loaded from Supabase, absent in the editor preview.
// Answers (`answer`, `accept`, `order`, `pairs`) are checked on the server; in the app they
// are only needed by the editor preview and by guest-free local practice (flashcards).
export type Fill = { id?: string; type: 'fill'; prompt: string; answer: string; accept?: string[]; bank?: string[]; explanation: string }
export type Choice = { id?: string; type: 'choice'; prompt: string; options: string[]; answer: string; explanation: string }
export type Listen = { id?: string; type: 'listen'; text: string; explanation: string }
export type DlgLine = { speaker: string; text: string; answer?: string }
export type Dialogue = { id?: string; type: 'dialogue'; lines: DlgLine[]; explanation: string }
/** A statement about a text: true / false (A1–A2) or true / false / not given (B1+). */
export type TrueFalse = { id?: string; type: 'truefalse'; prompt: string; options: TFOption[]; answer: string; explanation: string }
export type TFOption = 'true' | 'false' | 'not_given'
/** Put words (a sentence) or sentences (events of a story) in the right order. */
export type Order = { id?: string; type: 'order'; prompt: string; items: string[]; unit: 'word' | 'sentence'; order?: string[]; explanation: string }
/** Match each item on the left with one on the right. */
export type Match = { id?: string; type: 'match'; prompt: string; left: string[]; right: string[]; pairs?: Record<string, string>; explanation: string }
export type Exercise = Fill | Choice | Listen | Dialogue | TrueFalse | Order | Match
export type ExerciseType = Exercise['type']

/** Translated name of an exercise type ("Grammar", "Listening", …). */
export const skillLabel = (type: Exercise['type']) => i18n.t(`skills.${type}`)

export function norm(s: string) {
  return s.trim().toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').replace(/[.,!?;:]+$/g, '')
}

/** Fisher–Yates shuffle (a copy). */
export function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/* ---------- answers: one shape for every exercise type ---------- */

/** Raw student input. fill/listen use `text`, choice/truefalse `picked`, dialogue `blanks`,
 *  order `order` (items in the student's order), match `pairs` (left → right). */
export type Response = {
  text?: string
  picked?: string | null
  blanks?: Record<number, string>
  order?: string[]
  pairs?: Record<string, string>
}

export type Evaluation = {
  answered: boolean // enough input to be checked
  correct: boolean // local verdict: only meaningful when the answer is known in the app
  given: string // human-readable answer
}

/** Check a response against the exercise. For lessons the server's verdict is the one
 *  that counts (grade_exercise in the database uses the same rules). */
export function evaluate(ex: Exercise, r: Response): Evaluation {
  if (ex.type === 'fill') {
    const text = r.text ?? ''
    const ok = [ex.answer, ...(ex.accept ?? [])].filter(Boolean).some((a) => norm(a) === norm(text))
    return { answered: text.trim().length > 0, correct: text.trim().length > 0 && ok, given: text }
  }
  if (ex.type === 'listen') {
    const text = r.text ?? ''
    return { answered: text.trim().length > 0, correct: norm(text) === norm(ex.text), given: text }
  }
  if (ex.type === 'choice' || ex.type === 'truefalse') {
    const picked = r.picked ?? null
    const given = picked === null ? '' : ex.type === 'truefalse' ? tfLabel(picked) : picked
    return { answered: picked !== null, correct: picked === ex.answer, given }
  }
  if (ex.type === 'order') {
    const order = r.order ?? []
    const want = ex.order ?? []
    return {
      answered: order.length === ex.items.length,
      correct: want.length > 0 && order.length === want.length && order.every((x, i) => norm(x) === norm(want[i])),
      given: order.join(ex.unit === 'word' ? ' ' : ' → '),
    }
  }
  if (ex.type === 'match') {
    const pairs = r.pairs ?? {}
    const want = ex.pairs ?? {}
    return {
      answered: ex.left.every((l) => pairs[l]),
      correct: Object.keys(want).length > 0 && Object.entries(want).every(([l, rr]) => pairs[l] === rr),
      given: ex.left.map((l) => `${l} — ${pairs[l] ?? '?'}`).join('; '),
    }
  }
  const blanks = r.blanks ?? {}
  return {
    // a gap is a line with an `answer` key (in lessons its value is hidden: "")
    answered: ex.lines.every((l, i) => l.answer === undefined || (blanks[i] || '').trim()),
    correct: ex.lines.every((l, i) => !l.answer || norm(blanks[i] || '') === norm(l.answer)),
    given: Object.values(blanks).join(', '),
  }
}

/** "True" / "False" / "Not given" in the interface language. */
export const tfLabel = (v: string) => i18n.t(`player.tf.${v}`, { defaultValue: v })

/** The task as one line of text, for result lists. */
export function promptText(ex: Exercise): string {
  if (ex.type === 'fill' || ex.type === 'choice' || ex.type === 'truefalse') return ex.prompt
  if (ex.type === 'listen') return i18n.t('player.listenInstruction')
  if (ex.type === 'order') return ex.prompt || i18n.t(ex.unit === 'word' ? 'player.orderWords' : 'player.orderSentences')
  if (ex.type === 'match') return ex.prompt || i18n.t('player.matchInstruction')
  return ex.lines.map((l) => `${l.speaker}: ${l.text}`).join(' · ')
}

/** Compare two responses regardless of key order. */
export function sameResponse(a: Response | null | undefined, b: Response | null | undefined): boolean {
  const canon = (r: Response | null | undefined) =>
    JSON.stringify(r ?? {}, (_k, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([x], [y]) => x.localeCompare(y)))
        : v,
    )
  return canon(a) === canon(b)
}

/** The expected answer as text, for showing mistakes. */
export function correctAnswerText(ex: Exercise): string {
  if (ex.type === 'fill' || ex.type === 'choice') return ex.answer
  if (ex.type === 'truefalse') return tfLabel(ex.answer)
  if (ex.type === 'listen') return ex.text
  if (ex.type === 'order') return (ex.order ?? []).join(ex.unit === 'word' ? ' ' : ' → ')
  if (ex.type === 'match') return Object.entries(ex.pairs ?? {}).map(([l, r]) => `${l} — ${r}`).join('; ')
  return ex.lines.filter((l) => l.answer).map((l) => l.answer).join(', ')
}

/** The server's answer text for display: true/false/not_given become words. */
export const displayAnswer = (ex: Exercise, serverText: string) =>
  ex.type === 'truefalse' ? tfLabel(serverText) : serverText

/** A mixed-up order that is the same every time for the same items (so saving an
 *  unchanged lesson keeps its exercises), and never the original order. */
export function stableShuffle(items: string[]): string[] {
  const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)
  const out = [...items].sort((a, b) => hash(a) - hash(b) || a.localeCompare(b))
  return out.every((x, i) => x === items[i]) ? [...items].reverse() : out
}

/** Parse one lesson's raw text into structured exercises. */
export function parseExercises(raw: string): Exercise[] {
  const out: Exercise[] = []
  for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(fill|choice|listen|dialogue|tfng|tf|order|match)\s*:\s*(.*)$/i)
    if (!m) continue
    const type = m[1].toLowerCase()
    let body = m[2]

    let explanation = ''
    const hash = body.indexOf('#')
    if (hash !== -1) {
      explanation = body.slice(hash + 1).trim()
      body = body.slice(0, hash).trim()
    }

    if (type === 'fill') {
      // fill: I ___ home. = go | walk   (several accepted answers separated by |)
      const [prompt, answers = ''] = body.split('=').map((s) => s.trim())
      const [answer = '', ...accept] = answers.split('|').map((s) => s.trim()).filter(Boolean)
      if (prompt) out.push({ type: 'fill', prompt, answer, ...(accept.length ? { accept } : {}), explanation })
    } else if (type === 'tf' || type === 'tfng') {
      // tf: Tom lives in a city. = false      tfng: … = not given
      const [prompt, raw = ''] = body.split('=').map((s) => s.trim())
      const v = raw.toLowerCase().replace(/[\s-]+/g, '_')
      const answer = v === 'true' || v === 'false' || v === 'not_given' ? v : ''
      const options: TFOption[] = type === 'tfng' ? ['true', 'false', 'not_given'] : ['true', 'false']
      if (prompt) out.push({ type: 'truefalse', prompt, options, answer, explanation })
    } else if (type === 'order') {
      // order: Tom | goes | to | school     (written in the right order; shown shuffled)
      const order = body.split('|').map((s) => s.trim()).filter(Boolean)
      const unit = order.every((x) => !/\s/.test(x)) ? 'word' : 'sentence'
      if (order.length > 1) out.push({ type: 'order', prompt: '', items: stableShuffle(order), unit, order, explanation })
    } else if (type === 'match') {
      // match: cat = кошка | dog = собака
      const pairs: Record<string, string> = {}
      for (const p of body.split('|')) {
        const [l, r] = p.split('=').map((s) => s.trim())
        if (l && r) pairs[l] = r
      }
      const left = Object.keys(pairs)
      if (left.length > 1) out.push({ type: 'match', prompt: '', left, right: stableShuffle(Object.values(pairs)), pairs, explanation })
    } else if (type === 'listen') {
      if (body) out.push({ type: 'listen', text: body, explanation })
    } else if (type === 'choice') {
      const eq = body.indexOf('?')
      const slash = body.indexOf('/')
      const starIdx = body.indexOf('*')
      const cut = starIdx !== -1 ? starIdx : eq !== -1 ? eq + 1 : slash
      let prompt = body
      let optsRaw = ''
      if (cut > 0) {
        prompt = body.slice(0, cut).replace(/[?*]\s*$/, '').trim()
        optsRaw = body.slice(cut).trim()
      }
      let answer = ''
      const options = optsRaw
        .split('/')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => {
          if (o.startsWith('*')) {
            answer = o.slice(1).trim()
            return answer
          }
          return o
        })
      if (prompt && options.length) out.push({ type: 'choice', prompt, options, answer, explanation })
    } else if (type === 'dialogue') {
      const lines: DlgLine[] = body
        .split('>>')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((seg) => {
          const cm = seg.match(/^([^:]+):\s*(.*)$/)
          const speaker = cm ? cm[1].trim() : ''
          let text = cm ? cm[2].trim() : seg
          const am = text.match(/\(([^)]+)\)/)
          const answer = am ? am[1].trim() : undefined
          if (answer) text = text.replace(/\s*\([^)]+\)/, '').trim()
          return { speaker, text, answer }
        })
      if (lines.length) out.push({ type: 'dialogue', lines, explanation })
    }
  }
  return out
}

/** Validate raw teacher input; returns human-readable issues (empty = ok). */
export function validateRaw(raw: string): string[] {
  const issues: string[] = []
  const parsed = parseExercises(raw)
  parsed.forEach((ex, i) => {
    const n = i + 1
    if (ex.type === 'fill' && !ex.answer) issues.push(i18n.t('teacher.validation.fillNoAnswer', { n }))
    if (ex.type === 'choice' && !ex.answer) issues.push(i18n.t('teacher.validation.choiceNoAnswer', { n }))
    if (ex.type === 'truefalse' && !ex.options.includes(ex.answer as TFOption)) issues.push(i18n.t('teacher.validation.tfNoAnswer', { n }))
    if ((ex.type === 'order' || ex.type === 'match') && new Set(ex.type === 'order' ? ex.items : ex.right).size !== (ex.type === 'order' ? ex.items : ex.right).length)
      issues.push(i18n.t('teacher.validation.duplicateItems', { n }))
    if (ex.type === 'dialogue') {
      // Rule: blank (___) only in the SECOND turn (B).
      const blankLines = ex.lines
        .map((l, idx) => ({ idx, has: /___/.test(l.text) || l.answer !== undefined }))
        .filter((x) => x.has)
      if (blankLines.length === 0) {
        issues.push(i18n.t('teacher.validation.dialogueNoBlank', { n }))
      } else if (blankLines.some((x) => x.idx !== 1)) {
        issues.push(i18n.t('teacher.validation.dialogueBlankOnlyB', { n }))
      }
      if (ex.lines[1] && ex.lines[1].answer === undefined && /___/.test(ex.lines[1].text)) {
        issues.push(i18n.t('teacher.validation.dialogueBlankNoAnswer', { n }))
      }
    }
  })
  return issues
}

/* ---------- DB row <-> in-memory exercise mapping ---------- */

export type ExerciseRow = {
  id?: string
  type: Exercise['type']
  position: number
  prompt: string
  answer: string
  options: string[]
  explanation: string
  dialogue: DlgLine[]
  data: Record<string, unknown>
  /** what only the server needs to check new exercise types */
  solution?: Record<string, unknown>
}

export function exerciseToRow(ex: Exercise, position: number): ExerciseRow {
  const base = { type: ex.type, position, prompt: '', answer: '', options: [] as string[], explanation: ex.explanation, dialogue: [] as DlgLine[], data: {}, solution: {} }
  if (ex.type === 'fill')
    return { ...base, prompt: ex.prompt, answer: ex.answer, data: ex.bank?.length ? { bank: ex.bank } : {}, solution: ex.accept?.length ? { accept: ex.accept } : {} }
  if (ex.type === 'choice') return { ...base, prompt: ex.prompt, options: ex.options, answer: ex.answer }
  if (ex.type === 'truefalse') return { ...base, prompt: ex.prompt, options: ex.options, answer: ex.answer }
  if (ex.type === 'listen') return { ...base, answer: ex.text, data: { text: ex.text } }
  if (ex.type === 'order') return { ...base, prompt: ex.prompt, data: { items: ex.items, unit: ex.unit }, solution: { order: ex.order ?? [] } }
  if (ex.type === 'match') return { ...base, prompt: ex.prompt, data: { left: ex.left, right: ex.right }, solution: { pairs: ex.pairs ?? {} } }
  return { ...base, dialogue: ex.lines }
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function rowToExercise(row: ExerciseRow): Exercise {
  const id = row.id
  const data = row.data ?? {}
  const sol = row.solution ?? {}
  if (row.type === 'fill') {
    const accept = strings(sol.accept)
    const bank = strings(data.bank)
    return { id, type: 'fill', prompt: row.prompt, answer: row.answer, ...(accept.length ? { accept } : {}), ...(bank.length ? { bank } : {}), explanation: row.explanation }
  }
  if (row.type === 'choice')
    return { id, type: 'choice', prompt: row.prompt, options: row.options || [], answer: row.answer, explanation: row.explanation }
  if (row.type === 'truefalse')
    return { id, type: 'truefalse', prompt: row.prompt, options: (row.options?.length ? row.options : ['true', 'false']) as TFOption[], answer: row.answer, explanation: row.explanation }
  if (row.type === 'listen')
    return { id, type: 'listen', text: (data.text as string) || row.answer, explanation: row.explanation }
  if (row.type === 'order') {
    const order = strings(sol.order)
    return { id, type: 'order', prompt: row.prompt, items: strings(data.items), unit: data.unit === 'sentence' ? 'sentence' : 'word', ...(order.length ? { order } : {}), explanation: row.explanation }
  }
  if (row.type === 'match') {
    const pairs = sol.pairs && typeof sol.pairs === 'object' ? (sol.pairs as Record<string, string>) : undefined
    return { id, type: 'match', prompt: row.prompt, left: strings(data.left), right: strings(data.right), ...(pairs ? { pairs } : {}), explanation: row.explanation }
  }
  return { id, type: 'dialogue', lines: row.dialogue || [], explanation: row.explanation }
}
