import * as api from '../../lib/api'
import type { Lesson } from '../../lib/api'
import { practiceBoard, studyBoard, tasksBoard, type BoardLabels, type BoardMode, type MaterialLike, type Pt, type Skeleton } from './elements'

/* Loads our content (full lessons, tasks, practice) and lays it out for the whiteboard.
   Used by the Insert panel and by "Teach on a board" in a lesson. */

type T = (k: string, o?: Record<string, unknown>) => string

export const boardLabels = (t: T): BoardLabels => ({
  exercises: t('boards.insert.exercisesFrame'),
  answers: t('boards.insert.answersFrame'),
  plan: t('boards.tpl.planTitle'),
  text: t('boards.insert.textFrame'),
  script: t('boards.insert.scriptFrame'),
  questions: t('boards.insert.questionsFrame'),
})

async function loadWithMaterial(id: string, withSolutions: boolean): Promise<{ lesson: Lesson; material: MaterialLike | null } | null> {
  const lesson = (await api.getLesson(id, { withSolutions }).catch(() => null)) ?? (await api.getLesson(id).catch(() => null))
  if (!lesson) return null
  const material = lesson.kind === 'practice' ? ((await api.getMaterial(id).catch(() => null)) as MaterialLike | null) : null
  return { lesson, material }
}

/** Layout of a full lesson: every stage with its text, examples and the stage's tasks / practice. */
export async function studySkeleton(id: string, at: () => Pt, mode: BoardMode, t: T, withSolutions: boolean): Promise<Skeleton> {
  const study = await api.getStudyLesson(id)
  if (!study) throw new Error('not found')
  const linked: Record<string, { lesson: Lesson; material: MaterialLike | null }> = {}
  for (const st of study.content.stages) {
    if (st.task_id && !linked[st.task_id]) {
      const l = await loadWithMaterial(st.task_id, withSolutions)
      if (l) linked[st.task_id] = l
    }
  }
  const stageNames = Object.fromEntries(api.STAGE_KINDS.map((k) => [k, t(`course.stages.${k}`)]))
  return studyBoard(at(), { ...study, stages: study.content.stages }, linked, mode, { ...boardLabels(t), stageNames, teacher: t('course.teacherNotes') })
}

/** Layout of a task set or a practice (no lesson plan). */
export async function lessonSkeleton(id: string, at: () => Pt, mode: BoardMode, t: T, withSolutions: boolean): Promise<Skeleton> {
  const l = await loadWithMaterial(id, withSolutions)
  if (!l) throw new Error('not found')
  return l.lesson.kind === 'practice' ? practiceBoard(at(), l.lesson, l.material, mode, boardLabels(t)) : tasksBoard(at(), l.lesson, mode, boardLabels(t))
}

/** A board created from "Teach on a board" carries the lesson to lay out when it opens for the first time. */
const PENDING = 'englear.boardInsert'
export function setPendingInsert(boardId: string, studyId: string) {
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({ boardId, studyId }))
  } catch {
    // the board just opens empty
  }
}
export function takePendingInsert(boardId: string): string | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') as { boardId: string; studyId: string } | null
    if (p?.boardId !== boardId) return null
    sessionStorage.removeItem(PENDING)
    return p.studyId
  } catch {
    return null
  }
}
