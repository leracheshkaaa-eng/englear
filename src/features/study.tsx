import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import type { Lesson, StudyLesson, StudyLessonSummary, StudyStage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CEFR_LEVELS } from '../lib/config'
import { Badge, Button, SpeakerButton } from '../lib/ui'
import { LessonPlayer } from './lessons'
import { LeanEmpty } from '../lib/lean'

/* ============================================================
   Lessons: full 40–60 minute lessons made of stages
   (warm-up → presentation → tasks → practice → production → homework).
   A learner goes through them step by step; tasks and practice open the usual player.
   Teachers also see the notes for the teacher and can open the lesson on a board.
   ============================================================ */

export const STAGE_ICONS: Record<string, string> = { warmup: '☀️', presentation: '💡', tasks: '✏️', practice: '📖', production: '🗣️', homework: '🏠' }

/** **bold** and line breaks — the stage texts are written this way. */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.split('\n').map((line, i) => (
        <p key={i} className={line.trim() ? 'my-1' : 'h-2'}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? <b key={j}>{part.slice(2, -2)}</b> : <Fragment key={j}>{part}</Fragment>,
          )}
        </p>
      ))}
    </div>
  )
}

export function StudyCatalog({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useTranslation()
  const { settings } = useAuth()
  const [level, setLevel] = useState<string | null>(settings.english_level ?? null)
  const [items, setItems] = useState<StudyLessonSummary[] | null>(null)

  useEffect(() => {
    setItems(null)
    api.listStudyLessons({ cefr: level }).then(setItems).catch(() => setItems([]))
  }, [level])

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${on ? 'border-plum bg-lilac text-plum-deep' : 'border-line text-mute hover:border-lavender'}`
  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <h2 className="font-display text-4xl font-semibold">{t('nav.lessons')}</h2>
      <p className="mt-2 mb-6 text-mute">{t('course.intro')}</p>
      <div className="mb-6 flex flex-wrap gap-1.5">
        <button onClick={() => setLevel(null)} className={chip(level === null)}>
          {t('course.allLevels')}
        </button>
        {CEFR_LEVELS.map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={chip(level === l)}>
            {l}
          </button>
        ))}
      </div>
      {items === null && <p className="text-mute">{t('common.loading')}</p>}
      {items?.length === 0 && <LeanEmpty>{t('course.none')}</LeanEmpty>}
      <div className="grid gap-4 sm:grid-cols-2">
        {items?.map((l) => (
          <button key={l.id} onClick={() => onOpen(l.id)} className="rounded-3xl border border-line bg-paper p-5 text-left transition-shadow hover:shadow-[0_12px_30px_-18px_rgba(60,42,112,0.6)]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{l.cefr}</Badge>
              <span className="text-xs text-mute">⏱ {t('course.minutes', { n: l.duration_min })}</span>
              {l.status === 'draft' && <span className="text-xs text-mute">· {t('teacher.draft')}</span>}
            </div>
            <p className="mt-2 font-display text-2xl font-semibold">{l.title}</p>
            <p className="mt-1 text-sm text-mute">{l.description}</p>
          </button>
        ))}
      </div>
    </section>
  )
}

export function StudyPlayer({ lessonId, onBack, onOpenOnBoard }: { lessonId: string; onBack: () => void; onOpenOnBoard?: (lesson: StudyLesson) => void }) {
  const { t } = useTranslation()
  const { role } = useAuth()
  const isTeacher = role === 'teacher' || role === 'admin'
  const [lesson, setLesson] = useState<StudyLesson | null | undefined>(undefined)
  const [step, setStep] = useState(0)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [inner, setInner] = useState<Lesson | null>(null) // task / practice being played inside a stage
  const [showNotes, setShowNotes] = useState(isTeacher)

  useEffect(() => {
    api.getStudyLesson(lessonId).then(setLesson).catch(() => setLesson(null))
  }, [lessonId])

  if (lesson === undefined) return <p className="py-24 text-center text-mute">{t('common.loading')}</p>
  if (lesson === null)
    return (
      <section className="mx-auto max-w-md px-6 pt-16 text-center">
        <p className="text-mute">{t('course.notFound')}</p>
        <Button className="mt-4" onClick={onBack}>
          ← {t('nav.lessons')}
        </Button>
      </section>
    )

  const stages = lesson.content.stages
  const stage = stages[step]

  if (inner)
    return (
      <LessonPlayer
        lesson={inner}
        onDone={() => {
          setInner(null)
          setDone((d) => new Set(d).add(step))
        }}
      />
    )

  async function openInner(s: StudyStage) {
    if (!s.task_id) return
    const l = await api.getLesson(s.task_id).catch(() => null)
    if (l) setInner(l)
  }
  function next() {
    setDone((d) => new Set(d).add(step))
    if (step < stages.length - 1) setStep(step + 1)
  }

  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onBack}>
          ← {t('nav.lessons')}
        </Button>
        <div className="flex flex-wrap gap-2">
          {isTeacher && (
            <button onClick={() => setShowNotes((v) => !v)} className="text-sm text-mute hover:text-ink">
              {showNotes ? t('course.hideNotes') : t('course.showNotes')}
            </button>
          )}
          {isTeacher && onOpenOnBoard && (
            <Button variant="soft" onClick={() => onOpenOnBoard(lesson)}>
              📋 {t('course.onBoard')}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge>{lesson.cefr}</Badge>
        <span className="text-sm text-mute">⏱ {t('course.minutes', { n: lesson.duration_min })}</span>
      </div>
      <h2 className="mt-1 font-display text-4xl font-semibold">{lesson.title}</h2>
      <p className="mt-1 text-mute">{lesson.description}</p>

      {/* stages */}
      <div className="mt-6 flex gap-1.5 overflow-x-auto pb-1">
        {stages.map((s, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${
              i === step ? 'border-plum bg-plum text-paper' : done.has(i) ? 'border-plum/40 bg-lilac text-plum-deep' : 'border-line text-mute hover:border-lavender'
            }`}
          >
            <span>{done.has(i) && i !== step ? '✓' : STAGE_ICONS[s.kind]}</span>
            {t(`course.stages.${s.kind}`)}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-3xl border border-line bg-paper p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-2xl font-semibold">
            {STAGE_ICONS[stage.kind]} {stage.title}
          </h3>
          <span className="text-sm text-mute">{t('course.minutes', { n: stage.minutes })}</span>
        </div>
        {showNotes && stage.teacher && (
          <div className="mt-3 rounded-2xl bg-[rgba(255,215,122,0.25)] px-4 py-3 text-sm">
            <b>{t('course.teacherNotes')}:</b> {stage.teacher}
          </div>
        )}
        <RichText text={stage.body} className="mt-4 text-[17px] leading-relaxed" />
        {stage.examples.length > 0 && (
          <div className="mt-4 space-y-2">
            {stage.examples.map((e) => (
              <div key={e} className="flex items-center gap-2 rounded-xl bg-lilac/40 px-4 py-2">
                <SpeakerButton text={e} />
                <span className="text-[17px]">{e}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          {stage.task_id && (stage.kind === 'tasks' || stage.kind === 'practice') && (
            <Button onClick={() => openInner(stage)}>{stage.kind === 'tasks' ? t('course.startTasks') : t('course.startPractice')}</Button>
          )}
          {step < stages.length - 1 ? (
            <Button variant={stage.task_id ? 'soft' : 'solid'} onClick={next}>
              {t('course.next')} →
            </Button>
          ) : (
            <Button
              variant="soft"
              onClick={() => {
                next()
                onBack()
              }}
            >
              {t('course.finish')} 🎉
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
