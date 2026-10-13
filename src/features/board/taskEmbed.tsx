import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../../lib/api'
import type { Lesson } from '../../lib/api'
import { ExerciseView } from '../lessons'
import { MaterialView } from '../practice'
import { AudioPlayerCard } from './audioEmbed'

/* ============================================================
   Interactive pieces of a whiteboard. On the board they are drawn by our own components
   (Excalidraw's renderEmbeddable), so they run with the viewer's session:
     <origin>/embed/task?l=<lesson>&i=<n>   one exercise, checked by the server
     <origin>/embed/material?l=<lesson>     the text or the audio of a practice
     <origin>/embed/audio?b=&f=&n=          an audio file of the board
   The same links also open as pages. Every viewer answers on their own screen.

   On the board each piece is a card: the header is "see-through" for the pointer, so the
   board itself catches it (select, drag); the body takes clicks at once (no activation
   step). The card reports its natural height, and the board resizes the element to fit.
   ============================================================ */

/** The board listens for natural heights of its cards (link → height in px). */
let sizeHandler: ((link: string, height: number) => void) | null = null
export function setEmbedSizeHandler(h: typeof sizeHandler) {
  sizeHandler = h
}

/** A widget inside a card can put a short text into the card's header ("3 / 10"). */
const CardLabel = createContext<((s: string) => void) | null>(null)

const BAR_H = 34

const cache = new Map<string, Promise<Lesson | null>>()
const loadLesson = (id: string) => {
  if (!cache.has(id)) cache.set(id, api.getLesson(id).catch(() => null))
  return cache.get(id)!
}
function useLesson(id: string) {
  const [lesson, setLesson] = useState<Lesson | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    loadLesson(id).then((l) => alive && setLesson(l))
    return () => {
      alive = false
    }
  }, [id])
  return lesson
}

const empty = new Map()

export function TaskWidget({ lessonId, index }: { lessonId: string; index: number }) {
  const { t } = useTranslation()
  const lesson = useLesson(lessonId)
  const setLabel = useContext(CardLabel)
  const total = lesson?.exercises.length ?? 0
  useEffect(() => {
    if (setLabel && total) setLabel(`${index + 1} / ${total}`)
  }, [setLabel, index, total])
  if (lesson === undefined) return <p className="p-4 text-sm text-mute">{t('common.loading')}</p>
  const ex = lesson?.exercises[index]
  if (!lesson || !ex) return <p className="p-4 text-sm text-mute">{t('boards.embedMissing')}</p>
  return (
    <div className="p-1">
      {!setLabel && (
        <p className="mb-1 px-2 text-xs font-semibold text-mute">
          {index + 1} / {lesson.exercises.length}
        </p>
      )}
      <ExerciseView
        key={ex.id}
        ex={ex}
        dict={empty}
        translations={false}
        grade={async (response) => {
          if (!ex.id) return { correct: false, correctAnswer: '' }
          const res = await api.gradeAnswers([{ exerciseId: ex.id, response }])
          return res[ex.id] ?? { correct: false, correctAnswer: '' }
        }}
      />
    </div>
  )
}

export function MaterialWidget({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation()
  const lesson = useLesson(lessonId)
  const [material, setMaterial] = useState<api.Material | null | undefined>(undefined)
  useEffect(() => {
    if (lesson) api.getMaterial(lesson.id).then(setMaterial).catch(() => setMaterial(null))
    else if (lesson === null) setMaterial(null)
  }, [lesson])
  if (lesson === undefined || material === undefined) return <p className="p-4 text-sm text-mute">{t('common.loading')}</p>
  if (!lesson || !material) return <p className="p-4 text-sm text-mute">{t('boards.embedMissing')}</p>
  return (
    <div className="p-2">
      <MaterialView material={material} skill={lesson.skill} dict={empty} translations={false} />
    </div>
  )
}

/** Is this one of our interactive pieces (not a YouTube-like iframe)? */
export const isOurEmbed = (link: string | null | undefined) => !!link && link.startsWith(`${location.origin}/embed/`)

/** Our embed link → the component that draws it on the board (null = not ours: Excalidraw shows an iframe). */
export function ourEmbed(link: string | null | undefined): React.ReactElement | null {
  if (!link || !isOurEmbed(link)) return null
  const u = new URL(link)
  const q = u.searchParams
  let inner: React.ReactElement | null = null
  let kind: 'task' | 'material' | 'audio' = 'task'
  if (u.pathname === '/embed/task') inner = <TaskWidget lessonId={q.get('l') ?? ''} index={Number(q.get('i') ?? 0)} />
  else if (u.pathname === '/embed/material') {
    kind = 'material'
    inner = <MaterialWidget lessonId={q.get('l') ?? ''} />
  } else if (u.pathname === '/embed/audio') {
    kind = 'audio'
    inner = <AudioPlayerCard boardId={q.get('b') ?? ''} fileId={q.get('f') ?? ''} name={q.get('n') || 'Audio'} />
  }
  if (!inner) return null
  return (
    <BoardCard link={link} kind={kind}>
      {inner}
    </BoardCard>
  )
}

/** The card around a piece on the board: a header to grab and a body to work in. */
function BoardCard({ link, kind, children }: { link: string; kind: 'task' | 'material' | 'audio'; children: React.ReactNode }) {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const body = useRef<HTMLDivElement>(null)

  // tell the board how tall the card wants to be
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    let last = 0
    const report = () => {
      // off screen the board hides the card (zero size): nothing to measure then
      if (el.offsetWidth < 50 || el.offsetHeight < 8) return
      const h = Math.ceil(el.offsetHeight) + BAR_H + 6
      if (Math.abs(h - last) < 4) return
      last = h
      sizeHandler?.(link, h)
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    // a backup check: the observer can miss changes (a background tab, late fonts)
    const timer = window.setInterval(report, 1000)
    return () => {
      ro.disconnect()
      window.clearInterval(timer)
    }
  }, [link])

  const title = kind === 'task' ? t('boards.card.task') : kind === 'material' ? t('boards.card.material') : t('boards.card.audio')
  return (
    <div className="englear-embed flex h-full w-full flex-col overflow-hidden rounded-2xl border border-lavender/70 bg-white shadow-sm">
      {/* pointer-events: none — the board under it selects and drags the card */}
      <div className="flex shrink-0 select-none items-center gap-2 bg-lilac/60 px-3 text-xs font-semibold text-plum" style={{ height: BAR_H, pointerEvents: 'none' }}>
        <span aria-hidden className="text-base leading-none opacity-60">
          ⠿
        </span>
        <span>{title}</span>
        {label && <span className="ml-auto font-normal text-mute">{label}</span>}
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto"
        style={{ pointerEvents: 'auto' }}
        // the board must not pan or start a selection from inside the card
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* measured: its natural height is what the card asks for */}
        <div ref={body}>
          <CardLabel.Provider value={setLabel}>{children}</CardLabel.Provider>
        </div>
      </div>
    </div>
  )
}

/* ---------- the same pieces as standalone pages ---------- */

export function TaskEmbed() {
  const q = new URLSearchParams(location.search)
  return <TaskWidget lessonId={q.get('l') ?? ''} index={Number(q.get('i') ?? 0)} />
}
export function MaterialEmbed() {
  const q = new URLSearchParams(location.search)
  return <MaterialWidget lessonId={q.get('l') ?? ''} />
}
