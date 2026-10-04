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
export function lessonLayout(o: Pt, lesson: Lesson, labels: { exercises: string; answers: string; plan: string }, plan: PlanStep[] | null, withTitle = true): Skeleton {
  const out: Skeleton = []
  const W = 640
  if (withTitle) out.push(box(o.x, o.y, plan ? W + 80 + 760 : W, 90, lesson.title, C.lilac, {}, 36))
  let y = withTitle ? o.y + 120 : o.y
  if (withTitle && lesson.description) {
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

  // plan on the right (full lessons only)
  const px = o.x + W + 80
  if (plan) out.push(...lessonPlan({ x: px, y: exTop }, labels.plan, plan))

  // answers frame under the plan
  const answers = lesson.exercises
    .map((ex, i) => {
      const a = correctAnswerText(ex)
      return a ? `${i + 1} — ${a}` : ''
    })
    .filter(Boolean)
  if (answers.length) {
    const planBottom = !plan ? exTop - 40 : exTop + 60 + plan.reduce((s, p) => s + Math.max(110, 60 + wrap(p.text, 52).split('\n').length * 28) + 16, 0)
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

/* ---------------- interactive pieces (embedded exercises and material) ---------------- */

/** About how tall an exercise widget is, by type and size. */
export function exerciseHeight(ex: Exercise): number {
  switch (ex.type) {
    case 'match':
      return 240 + Math.max(ex.left.length, ex.right.length) * 70
    case 'order':
      return 300 + Math.ceil(ex.items.length / 4) * 50
    case 'dialogue':
      return 300
    case 'choice':
      return 250 + Math.ceil(ex.options.length / 3) * 50
    default:
      return 260
  }
}
const taskLink = (lessonId: string, i: number) => `${location.origin}/embed/task?l=${lessonId}&i=${i}`
const materialLink = (lessonId: string) => `${location.origin}/embed/material?l=${lessonId}`

/** Every exercise as an interactive widget, in one column. Returns the pieces and the height used. */
function interactiveColumn(o: Pt, lesson: Lesson, width = 560): { els: Skeleton; ids: string[]; height: number } {
  const els: Skeleton = []
  const ids: string[] = []
  let y = o.y
  lesson.exercises.forEach((ex, i) => {
    const h = exerciseHeight(ex)
    const e = embed({ x: o.x, y }, taskLink(lesson.id, i), width, h)
    els.push(e as unknown as El)
    ids.push(e.id)
    y += h + 24
  })
  return { els, ids, height: y - o.y }
}

export type BoardMode = 'interactive' | 'cards'
export type BoardLabels = { exercises: string; answers: string; plan: string; text: string; script: string; questions: string }

/** A task set on the board (no plan): a title, then interactive widgets or cards. */
export function tasksBoard(o: Pt, lesson: Lesson, mode: BoardMode, labels: BoardLabels): Skeleton {
  if (mode === 'cards') return lessonLayout(o, lesson, labels, null)
  const out: Skeleton = [box(o.x, o.y, 560, 80, lesson.title, C.lilac, {}, 30)]
  const col = interactiveColumn({ x: o.x, y: o.y + 140 }, lesson)
  out.push(...col.els)
  out.push({ type: 'frame', id: uid('f'), x: o.x - 20, y: o.y + 110, width: 600, height: col.height + 30, name: labels.exercises, children: col.ids } as El)
  return out
}

export type MaterialLike = { material_type: string; body: string; segments: { speaker?: string | null; text: string }[] }

const scriptOf = (m: MaterialLike) => (m.segments.length ? m.segments.map((x) => (x.speaker ? `${x.speaker}: ${x.text}` : x.text)).join('\n') : m.body)

/** A practice on the board: the text (as text you can mark up) or the audio player with its script, and the questions. */
export function practiceBoard(o: Pt, lesson: Lesson, material: MaterialLike | null, mode: BoardMode, labels: BoardLabels): Skeleton {
  const out: Skeleton = [box(o.x, o.y, 1260, 80, lesson.title, C.lilac, {}, 30)]
  const top = o.y + 140
  const scriptText = material ? scriptOf(material) : ''
  if (lesson.skill === 'listening') {
    const player = embed({ x: o.x, y: top }, materialLink(lesson.id), 600, 230)
    out.push(player as unknown as El)
    if (scriptText) {
      const sy = top + 260
      const body = wrap(scriptText, 62)
      const t$ = text(o.x + 20, sy + 40, body, 18)
      out.push(t$)
      out.push({ type: 'frame', id: uid('f'), x: o.x, y: sy, width: 600, height: body.split('\n').length * 25 + 70, name: labels.script, children: [t$.id as string] } as El)
    }
  } else if (scriptText) {
    const body = wrap(scriptText, 58)
    const t$ = text(o.x + 24, top + 30, body, 20)
    out.push(t$)
    out.push({ type: 'frame', id: uid('f'), x: o.x, y: top, width: 600, height: body.split('\n').length * 28 + 60, name: labels.text, children: [t$.id as string] } as El)
  }
  const qx = o.x + 660
  if (mode === 'cards') out.push(...lessonLayout({ x: qx, y: top - 40 }, lesson, labels, null, false))
  else {
    const col = interactiveColumn({ x: qx + 20, y: top + 20 }, lesson)
    out.push(...col.els)
    out.push({ type: 'frame', id: uid('f'), x: qx, y: top, width: 600, height: col.height + 30, name: labels.questions, children: col.ids } as El)
  }
  return out
}

/* ---------------- a full lesson: stages left to right ---------------- */

export type StageLike = { kind: string; title: string; minutes: number; teacher: string; body: string; examples: string[]; task_id: string | null }
const plain = (s: string) => s.replace(/\*\*/g, '')

/** Each stage is a frame (name with minutes); inside: the teacher's note, the text, examples and the stage's tasks/practice. */
export function studyBoard(
  o: Pt,
  lesson: { title: string; description: string; cefr: string; duration_min: number; stages: StageLike[] },
  linked: Record<string, { lesson: Lesson; material: MaterialLike | null }>,
  mode: BoardMode,
  labels: BoardLabels & { stageNames: Record<string, string>; teacher: string },
): Skeleton {
  const COL = 680
  const GAP = 90
  const out: Skeleton = []
  const width = lesson.stages.length * (COL + GAP) - GAP
  out.push(box(o.x, o.y, Math.max(width, 900), 100, `${lesson.title} · ${lesson.cefr} · ${lesson.duration_min}′`, C.lilac, {}, 40))
  if (lesson.description) out.push(text(o.x, o.y + 120, wrap(lesson.description, 140), 22))
  const top = o.y + 220
  const colors = [C.sun, C.lilac, C.mint, C.sky, C.rose, C.cream]
  lesson.stages.forEach((st, i) => {
    const x = o.x + i * (COL + GAP)
    const ids: string[] = []
    let y = top + 30
    const head = box(x + 20, y, COL - 40, 70, st.title, colors[i % colors.length], {}, 26)
    ids.push(head.id as string)
    out.push(head)
    y += 90
    if (st.teacher) {
      const note = wrap(`${labels.teacher}: ${st.teacher}`, 64)
      const h = note.split('\n').length * 22 + 30
      const n$ = box(x + 20, y, COL - 40, h, '', '#fff4cc', { strokeColor: 'transparent' } as Partial<El>)
      const nt = text(x + 36, y + 14, note, 16)
      ids.push(n$.id as string, nt.id as string)
      out.push(n$, nt)
      y += h + 20
    }
    if (st.body) {
      const b = wrap(plain(st.body), 52)
      const bt = text(x + 24, y, b, 22)
      ids.push(bt.id as string)
      out.push(bt)
      y += b.split('\n').length * 31 + 16
    }
    st.examples.forEach((ex) => {
      const e = box(x + 24, y, COL - 48, 52, ex, '#ffffff', { strokeColor: C.line } as Partial<El>, 20)
      ids.push(e.id as string)
      out.push(e)
      y += 64
    })
    const link = st.task_id ? linked[st.task_id] : null
    if (link) {
      y += 10
      if (link.lesson.kind === 'practice' && link.material) {
        if (link.lesson.skill === 'listening') {
          const p = embed({ x: x + 20, y }, materialLink(link.lesson.id), COL - 40, 230)
          out.push(p as unknown as El)
          ids.push(p.id)
          y += 250
        } else {
          const b = wrap(scriptOf(link.material), 56)
          const r = box(x + 20, y, COL - 40, b.split('\n').length * 26 + 40, '', '#ffffff', { strokeColor: C.line } as Partial<El>)
          const tx = text(x + 40, y + 20, b, 18)
          ids.push(r.id as string, tx.id as string)
          out.push(r, tx)
          y += b.split('\n').length * 26 + 60
        }
      }
      if (mode === 'interactive') {
        const col = interactiveColumn({ x: x + 20, y }, link.lesson, COL - 40)
        out.push(...col.els)
        ids.push(...col.ids)
        y += col.height
      } else {
        link.lesson.exercises.forEach((ex, k) => {
          const body = exerciseBody(ex)
          const head$ = wrap(`${k + 1}. ${body.head}${body.chips.length ? '\n   ' + body.chips.join('  ·  ') : ''}`, 50)
          const h = head$.split('\n').length * 28 + 30
          const c = box(x + 20, y, COL - 40, h, '', C.cream, { strokeColor: C.line } as Partial<El>)
          const ct = text(x + 36, y + 14, head$, 20)
          ids.push(c.id as string, ct.id as string)
          out.push(c, ct)
          y += h + 14
        })
      }
    }
    out.push({ type: 'frame', id: uid('f'), x, y: top, width: COL, height: y - top + 30, name: `${i + 1}. ${labels.stageNames[st.kind] ?? st.kind} · ${st.minutes}′`, children: ids } as El)
  })
  return out
}
