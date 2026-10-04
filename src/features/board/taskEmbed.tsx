import { useEffect, useState } from 'react'
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
   ============================================================ */

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
  if (lesson === undefined) return <p className="p-4 text-sm text-mute">{t('common.loading')}</p>
  const ex = lesson?.exercises[index]
  if (!lesson || !ex) return <p className="p-4 text-sm text-mute">{t('boards.embedMissing')}</p>
  return (
    <div className="p-1">
      <p className="mb-1 px-2 text-xs font-semibold text-mute">
        {index + 1} / {lesson.exercises.length}
      </p>
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
  if (u.pathname === '/embed/task') inner = <TaskWidget lessonId={q.get('l') ?? ''} index={Number(q.get('i') ?? 0)} />
  else if (u.pathname === '/embed/material') inner = <MaterialWidget lessonId={q.get('l') ?? ''} />
  else if (u.pathname === '/embed/audio') inner = <AudioPlayerCard boardId={q.get('b') ?? ''} fileId={q.get('f') ?? ''} name={q.get('n') || 'Audio'} />
  if (!inner) return null
  return (
    <div className="h-full w-full overflow-auto rounded-xl bg-white" onWheel={(e) => e.stopPropagation()}>
      {inner}
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
