/* ============================================================
   Exercise model + parser.
   Preserves the existing EngLear syntax EXACTLY:
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
export type Fill = { id?: string; type: 'fill'; prompt: string; answer: string; explanation: string }
export type Choice = { id?: string; type: 'choice'; prompt: string; options: string[]; answer: string; explanation: string }
export type Listen = { id?: string; type: 'listen'; text: string; explanation: string }
export type DlgLine = { speaker: string; text: string; answer?: string }
export type Dialogue = { id?: string; type: 'dialogue'; lines: DlgLine[]; explanation: string }
export type Exercise = Fill | Choice | Listen | Dialogue

/** Translated name of an exercise type ("Grammar", "Listening", …). */
export const skillLabel = (type: Exercise['type']) => i18n.t(`skills.${type}`)

export function norm(s: string) {
  return s.trim().toLowerCase().replace(/[.,!?;:]+$/g, '')
}

/* ---------- answers: one shape for every exercise type ---------- */

/** Raw student input. fill/listen use `text`, choice uses `picked`, dialogue uses `blanks`. */
export type Response = { text?: string; picked?: string | null; blanks?: Record<number, string> }

export type Evaluation = {
  answered: boolean // enough input to be checked
  correct: boolean
  given: string // human-readable answer
}

/** Check a response against the exercise (same rules as the "Check" button). */
export function evaluate(ex: Exercise, r: Response): Evaluation {
  if (ex.type === 'fill') {
    const text = r.text ?? ''
    return { answered: text.trim().length > 0, correct: norm(text) === norm(ex.answer), given: text }
  }
  if (ex.type === 'listen') {
    const text = r.text ?? ''
    return { answered: text.trim().length > 0, correct: norm(text) === norm(ex.text), given: text }
  }
  if (ex.type === 'choice') {
    const picked = r.picked ?? null
    return { answered: picked !== null, correct: picked === ex.answer, given: picked ?? '' }
  }
  const blanks = r.blanks ?? {}
  return {
    answered: ex.lines.every((l, i) => !l.answer || (blanks[i] || '').trim()),
    correct: ex.lines.every((l, i) => !l.answer || norm(blanks[i] || '') === norm(l.answer)),
    given: Object.values(blanks).join(', '),
  }
}

/** The task as one line of text, for result lists. */
export function promptText(ex: Exercise): string {
  if (ex.type === 'fill' || ex.type === 'choice') return ex.prompt
  if (ex.type === 'listen') return i18n.t('player.listenInstruction')
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
  if (ex.type === 'listen') return ex.text
  return ex.lines.filter((l) => l.answer).map((l) => l.answer).join(', ')
}

/** Parse one lesson's raw text into structured exercises. */
export function parseExercises(raw: string): Exercise[] {
  const out: Exercise[] = []
  for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(fill|choice|listen|dialogue)\s*:\s*(.*)$/i)
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
      const [prompt, answer = ''] = body.split('=').map((s) => s.trim())
      if (prompt) out.push({ type: 'fill', prompt, answer, explanation })
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
}

export function exerciseToRow(ex: Exercise, position: number): ExerciseRow {
  const base = { type: ex.type, position, prompt: '', answer: '', options: [] as string[], explanation: ex.explanation, dialogue: [] as DlgLine[], data: {} }
  if (ex.type === 'fill') return { ...base, prompt: ex.prompt, answer: ex.answer }
  if (ex.type === 'choice') return { ...base, prompt: ex.prompt, options: ex.options, answer: ex.answer }
  if (ex.type === 'listen') return { ...base, answer: ex.text, data: { text: ex.text } }
  return { ...base, dialogue: ex.lines }
}

export function rowToExercise(row: ExerciseRow): Exercise {
  const id = row.id
  if (row.type === 'fill') return { id, type: 'fill', prompt: row.prompt, answer: row.answer, explanation: row.explanation }
  if (row.type === 'choice')
    return { id, type: 'choice', prompt: row.prompt, options: row.options || [], answer: row.answer, explanation: row.explanation }
  if (row.type === 'listen')
    return { id, type: 'listen', text: (row.data?.text as string) || row.answer, explanation: row.explanation }
  return { id, type: 'dialogue', lines: row.dialogue || [], explanation: row.explanation }
}
