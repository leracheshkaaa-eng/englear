import { convertToExcalidrawElements } from '@excalidraw/excalidraw'
import type { Lesson } from '../../lib/api'
import type { Exercise } from '../../lib/exercises'
import { correctAnswerText, promptText, stableShuffle } from '../../lib/exercises'
import { LABELS, NOTE_COLORS } from './stickers'

/* ============================================================
   Ready-made pieces for the whiteboard, as Excalidraw "skeletons":
   templates, tables, labels, notes, a whole lesson laid out for teaching,
   and embeds (YouTube, audio) built from a rectangle.
   Every builder takes the top-left point where the piece should appear.
   ============================================================ */

export type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>
type El = Skeleton[number]
export type Pt = { x: number; y: number }

const C = { ink: '#3b3340', lilac: '#e9e4fb', cream: '#fbf7f1', sun: '#fff1c7', mint: '#e3f4ea', sky: '#e3eefa', rose: '#fbe3e1', line: '#c9c3d6' }
let seq = 0
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

const box = (x: number, y: number, w: number, h: number, text: string, bg = 'transparent', extra: Partial<El> = {}, fontSize = 20) =>
  ({
    type: 'rectangle',
    id: uid('r'),
    x,
    y,
    width: w,
    height: h,
    backgroundColor: bg,
    fillStyle: 'solid',
    strokeColor: C.ink,
    roundness: { type: 3 },
    ...(text ? { label: { text, fontSize } } : {}),
    ...extra,
  }) as El
const text = (x: number, y: number, s: string, fontSize = 22, extra: Partial<El> = {}) => ({ type: 'text', id: uid('t'), x, y, text: s, fontSize, strokeColor: C.ink, ...extra }) as El

/** Break text into lines of about `max` characters (Excalidraw text does not wrap by itself). */
export function wrap(s: string, max: number): string {
  return s
    .split('\n')
    .map((para) => {
      const words = para.split(' ')
      const lines: string[] = []
      let cur = ''
      for (const w of words) {
        if ((cur + ' ' + w).trim().length > max && cur) {
          lines.push(cur)
          cur = w
        } else cur = (cur + ' ' + w).trim()
      }
      lines.push(cur)
      return lines.join('\n')
    })
    .join('\n')
}

/* ---------------- templates ---------------- */

export function tensesTable(o: Pt, title: string): Skeleton {
  const rows = ['Present', 'Past', 'Future']
  const cols = ['Simple', 'Continuous', 'Perfect']
  const out: Skeleton = [text(o.x, o.y, title, 32)]
  const y0 = o.y + 60
  cols.forEach((c, i) => out.push(box(o.x + 180 + i * 260, y0, 240, 60, c, C.lilac)))
  rows.forEach((r, j) => {
    out.push(box(o.x, y0 + 80 + j * 180, 160, 160, r, C.lilac))
    cols.forEach((_, i) => out.push(box(o.x + 180 + i * 260, y0 + 80 + j * 180, 240, 160, '')))
  })
  return out
}

export function wordCards(o: Pt, title: string): Skeleton {
  const out: Skeleton = [text(o.x, o.y, title, 32)]
  for (let i = 0; i < 6; i++) out.push(box(o.x + (i % 3) * 280, o.y + 60 + Math.floor(i / 3) * 200, 260, 180, 'word — ', NOTE_COLORS[i % NOTE_COLORS.length]))
  return out
}

export type PlanStep = { name: string; minutes: number; text: string }

export function lessonPlan(o: Pt, title: string, steps: PlanStep[]): Skeleton {
  const out: Skeleton = [text(o.x, o.y, title, 32)]
  const colors = [C.sun, C.lilac, C.mint, C.sky, C.rose]
  let y = o.y + 60
  steps.forEach((s, i) => {
    const body = wrap(s.text, 52)
    const h = Math.max(110, 60 + body.split('\n').length * 28)
    out.push(box(o.x, y, 120, h, `${s.minutes}′`, colors[i % colors.length], {}, 26))
    out.push(box(o.x + 130, y, 600, h, '', '#ffffff'))
    out.push(text(o.x + 150, y + 14, s.name, 24))
    out.push(text(o.x + 150, y + 50, body, 20))
    y += h + 16
  })
  return out
}

/* ---------------- tables, labels, notes ---------------- */

export function table(o: Pt, rows: number, cols: number, headerRow: boolean): Skeleton {
  const w = 200
  const h = 70
  const out: Skeleton = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push(box(o.x + c * w, o.y + r * h, w, h, '', headerRow && r === 0 ? C.lilac : '#ffffff', { roundness: null } as Partial<El>))
  return out
}

export const labelBlock = (o: Pt, i: number): Skeleton => [box(o.x, o.y, 260, 70, LABELS[i].text, LABELS[i].bg, {}, 26)]
export const stickyNote = (o: Pt, color: string): Skeleton => [box(o.x, o.y, 220, 200, ' ', color, { strokeColor: 'transparent' } as Partial<El>)]
export const symbol = (o: Pt, s: string): Skeleton => [text(o.x, o.y, s, 48)]

/* ---------------- a lesson laid out for teaching ---------------- */

const gapped = (s: string) => s.replace(/___/g, '________')

function exerciseBody(ex: Exercise): { head: string; chips: string[]; columns?: [string[], string[]] } {
  switch (ex.type) {
    case 'choice':
      return { head: gapped(ex.prompt), chips: ex.options }
    case 'fill':
      return { head: gapped(ex.prompt), chips: [] }
    case 'truefalse':
      return { head: ex.prompt, chips: ex.options.map((o) => (o === 'not_given' ? 'Not given' : o === 'true' ? 'True' : 'False')) }
    case 'order':
      return { head: promptText(ex), chips: ex.items }
    case 'match':
      return { head: promptText(ex), chips: [], columns: [ex.left, stableShuffle(ex.right)] }
    case 'dialogue':
      return { head: ex.lines.map((l) => `${l.speaker}: ${gapped(l.text)}`).join('\n'), chips: [] }
    case 'listen':
      return { head: '🎧 Listen and write:\n______________________________', chips: [] }
  }
}

/** Title, every exercise as a card (options as chips), a lesson plan and a separate "Answers" frame. */
export function lessonLayout(o: Pt, lesson: Lesson, labels: { exercises: string; answers: string; plan: string }, plan: PlanStep[]): Skeleton {
  const out: Skeleton = []
  const W = 640
  out.push(box(o.x, o.y, W + 80 + 760, 90, lesson.title, C.lilac, {}, 36))
  let y = o.y + 120
  if (lesson.description) {
    out.push(text(o.x, y, wrap(lesson.description, 110), 20))
    y += 30 * Math.ceil(lesson.description.length / 110) + 20
  }
  y += 40 // room for the frame name

  // exercises column
  const exIds: string[] = []
  const exTop = y
  let cy = y + 40
  lesson.exercises.forEach((ex, i) => {
    const body = exerciseBody(ex)
    const head = wrap(`${i + 1}. ${body.head}`, 46)
    const headH = head.split('\n').length * 30
    const chipRows = body.chips.length ? Math.ceil(body.chips.length / 3) : 0
    const colRows = body.columns ? Math.max(body.columns[0].length, body.columns[1].length) : 0
    const h = 30 + headH + chipRows * 60 + colRows * 56 + 10
    const card = box(o.x + 20, cy, W - 40, h, '', C.cream, { strokeColor: C.line } as Partial<El>)
    const head$ = text(o.x + 40, cy + 16, head, 22)
    exIds.push(card.id as string, head$.id as string)
    out.push(card, head$)
    let iy = cy + 24 + headH
    body.chips.forEach((c, k) => {
      const chip = box(o.x + 40 + (k % 3) * 190, iy + Math.floor(k / 3) * 60, 175, 46, c, '#ffffff', { strokeColor: C.line } as Partial<El>, 18)
      exIds.push(chip.id as string)
      out.push(chip)
    })
    iy += chipRows * 60
    if (body.columns) {
      body.columns[0].forEach((l, k) => {
        const a = box(o.x + 40, iy + k * 56, 240, 44, l, C.sky, { strokeColor: C.line } as Partial<El>, 18)
        exIds.push(a.id as string)
        out.push(a)
      })
      body.columns[1].forEach((r, k) => {
        const b = box(o.x + 330, iy + k * 56, 240, 44, r, C.sun, { strokeColor: C.line } as Partial<El>, 18)
        exIds.push(b.id as string)
        out.push(b)
      })
    }
    cy += h + 24
  })
  out.push({ type: 'frame', id: uid('f'), x: o.x, y: exTop, width: W, height: cy - exTop + 10, name: labels.exercises, children: exIds } as El)

  // plan on the right
  const px = o.x + W + 80
  const planEls = lessonPlan({ x: px, y: exTop }, labels.plan, plan)
  out.push(...planEls)

  // answers frame under the plan
  const answers = lesson.exercises
    .map((ex, i) => {
      const a = correctAnswerText(ex)
      return a ? `${i + 1} — ${a}` : ''
    })
    .filter(Boolean)
  if (answers.length) {
    const planBottom = exTop + 60 + plan.reduce((s, p) => s + Math.max(110, 60 + wrap(p.text, 52).split('\n').length * 28) + 16, 0)
    const ay = planBottom + 40
    const body = wrap(answers.join('\n'), 60)
    const t$ = text(px + 20, ay + 40, body, 20)
    out.push(t$)
    out.push({ type: 'frame', id: uid('f'), x: px, y: ay, width: 730, height: body.split('\n').length * 28 + 70, name: labels.answers, children: [t$.id as string] } as El)
  }
  return out
}

/** A plan without AI: warm-up, presentation, the lesson's exercises, production, homework. */
export function defaultPlan(lesson: Lesson, t: (k: string, o?: Record<string, unknown>) => string): PlanStep[] {
  const n = lesson.exercises.length
  return [
    { name: 'Warm-up', minutes: 5, text: t('boards.plan.warmup', { topic: lesson.title }) },
    { name: 'Presentation', minutes: 10, text: lesson.description || t('boards.plan.presentation') },
    { name: 'Practice', minutes: 20, text: t('boards.plan.practice', { n }) },
    { name: 'Production', minutes: 10, text: t('boards.plan.production') },
    { name: 'Homework', minutes: 0, text: t('boards.plan.homework') },
  ]
}

/* ---------------- embeds ---------------- */

/** An embedded web player (YouTube, Vimeo… or our audio player), built from a rectangle. */
export function embed(o: Pt, link: string, w = 560, h = 315) {
  const [r] = convertToExcalidrawElements([box(o.x, o.y, w, h, '', 'transparent')])
  return { ...r, type: 'embeddable' as const, link, roundness: null }
}

/** YouTube id from any usual link (watch, youtu.be, shorts, embed). */
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/)
  return m ? m[1] : null
}
