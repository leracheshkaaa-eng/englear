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

export type Fill = { type: 'fill'; prompt: string; answer: string; explanation: string }
export type Choice = { type: 'choice'; prompt: string; options: string[]; answer: string; explanation: string }
export type Listen = { type: 'listen'; text: string; explanation: string }
export type DlgLine = { speaker: string; text: string; answer?: string }
export type Dialogue = { type: 'dialogue'; lines: DlgLine[]; explanation: string }
export type Exercise = Fill | Choice | Listen | Dialogue

export const SKILL_LABEL: Record<Exercise['type'], string> = {
  fill: 'Грамматика',
  choice: 'Выбор',
  listen: 'Аудирование',
  dialogue: 'Диалог',
}

export function norm(s: string) {
  return s.trim().toLowerCase().replace(/[.,!?;:]+$/g, '')
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
    if (ex.type === 'fill' && !ex.answer) issues.push(`Задание ${n} (fill): нет ответа после «=».`)
    if (ex.type === 'choice' && !ex.answer) issues.push(`Задание ${n} (choice): отметьте верный вариант «*».`)
    if (ex.type === 'dialogue') {
      // Rule: blank (___) only in the SECOND turn (B).
      const blankLines = ex.lines
        .map((l, idx) => ({ idx, has: /___/.test(l.text) || l.answer !== undefined }))
        .filter((x) => x.has)
      if (blankLines.length === 0) {
        issues.push(`Задание ${n} (dialogue): нет пропуска ___ во второй реплике.`)
      } else if (blankLines.some((x) => x.idx !== 1)) {
        issues.push(`Задание ${n} (dialogue): пропуск ___ допустим только во второй реплике (B).`)
      }
      if (ex.lines[1] && ex.lines[1].answer === undefined && /___/.test(ex.lines[1].text)) {
        issues.push(`Задание ${n} (dialogue): у пропуска нет ответа в скобках (…).`)
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
  if (row.type === 'fill') return { type: 'fill', prompt: row.prompt, answer: row.answer, explanation: row.explanation }
  if (row.type === 'choice')
    return { type: 'choice', prompt: row.prompt, options: row.options || [], answer: row.answer, explanation: row.explanation }
  if (row.type === 'listen')
    return { type: 'listen', text: (row.data?.text as string) || row.answer, explanation: row.explanation }
  return { type: 'dialogue', lines: row.dialogue || [], explanation: row.explanation }
}
