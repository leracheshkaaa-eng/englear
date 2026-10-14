import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import type { Lesson, StudyLesson, StudyLessonSummary, StudyStage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CEFR_LEVELS } from '../lib/config'
import { Badge, Button, SpeakerButton } from '../lib/ui'
import { LessonPlayer } from './lessons'
import { LeanEmpty, LeanSays } from '../lib/lean'
import * as I from '../lib/icons'
import { GrammarCatalog, GrammarTopicPage } from './grammar'

/* ============================================================
   Lessons: full 40–60 minute lessons made of stages
   (warm-up → presentation → tasks → practice → production → homework).
   A learner goes through them step by step; tasks and practice open the usual player.
   Teachers also see the notes for the teacher and can open the lesson on a board.
   ============================================================ */

export const STAGE_ICONS: Record<string, I.Icon> = { warmup: I.IconSun, presentation: I.IconIdea, tasks: I.IconTasks, practice: I.IconPractice, production: I.IconSpeak, homework: I.IconHomework }
function StageIcon({ kind }: { kind: string }) {
  const C = STAGE_ICONS[kind] ?? I.IconTasks
  return <C />
}

/** **bold**, ~~wrong form~~ (struck through) and line breaks — the stage texts are written this way. */
export function RichText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {text.split('\n').map((line, i) => (
        <p key={i} className={line.trim() ? 'my-1' : 'h-2'}>
          {line.split(/(\*\*[^*]+\*\*|~~[^~]+~~)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? (
              <b key={j}>{part.slice(2, -2)}</b>
            ) : part.startsWith('~~') && part.endsWith('~~') ? (
              <s key={j} className="text-warn decoration-2">
                {part.slice(2, -2)}
              </s>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </p>
      ))}
    </div>
  )
}

// the grammar topic open in the Lessons section (kept while the learner runs a task and comes back)
let openGrammar: string | null = null
let openTab: 'lessons' | 'grammar' | null = null

/** The Lessons section: full lessons (the learner's plan, Plus) and grammar explanations (free). */
export function LessonsHub({
  onOpenLesson,
  onOpenTask,
  onPracticeGrammar,
  onUpgrade,
  onLogin,
}: {
  onOpenLesson: (id: string) => void
  onOpenTask: (id: string) => void
  onPracticeGrammar: (level: string, grammarId: string | null) => void
  onUpgrade: () => void
  onLogin: () => void
}) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [plus, setPlus] = useState<boolean | null>(userId ? null : false)
  const [tab, setTab] = useState<'lessons' | 'grammar' | null>(openTab)
  const [grammarId, setGrammarId] = useState<string | null>(openGrammar)

  useEffect(() => {
    if (!userId) return setPlus(false)
    api.aiStatus().then((s) => setPlus(!!s?.plus)).catch(() => setPlus(false))
  }, [userId])

  const current = tab ?? (plus ? 'lessons' : 'grammar')
  const pick = (x: 'lessons' | 'grammar') => {
    openTab = x
    setTab(x)
  }
  const openTopic = (id: string | null) => {
    openGrammar = id
    setGrammarId(id)
  }

  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <h2 className="font-display text-4xl font-semibold">{t('nav.lessons')}</h2>
      <div className="mt-4 mb-6 flex rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold sm:w-fit">
        {(['lessons', 'grammar'] as const).map((x) => (
          <button key={x} onClick={() => pick(x)} className={`flex-1 rounded-full px-5 py-2 transition-colors sm:flex-none ${current === x ? 'bg-plum text-paper' : 'text-mute hover:text-ink'}`}>
            {t(`grammar.tabs.${x}`)}
          </button>
        ))}
      </div>
      {plus === null && tab === null ? null : current === 'grammar' ? (
        grammarId ? (
          <GrammarTopicPage topicId={grammarId} onBack={() => openTopic(null)} onOpen={openTopic} onOpenTask={onOpenTask} onPractice={onPracticeGrammar} />
        ) : (
          <GrammarCatalog onOpen={openTopic} />
        )
      ) : (
        <StudyCatalog onOpen={onOpenLesson} onUpgrade={onUpgrade} onLogin={onLogin} />
      )}
    </section>
  )
}

/** "My lessons": the plan of full lessons for a level. Plus opens everything; without Plus a learner can
 *  open any one lesson as a trial (a teacher: three); the rest are locked. */
export function StudyCatalog({ onOpen, onUpgrade, onLogin }: { onOpen: (id: string) => void; onUpgrade: () => void; onLogin: () => void }) {
  const { t } = useTranslation()
  const { userId, role, settings } = useAuth()
  const [level, setLevel] = useState<string>(CEFR_LEVELS.includes(settings.english_level as never) ? settings.english_level : 'A1')
  const [items, setItems] = useState<StudyLessonSummary[] | null>(null)
  const [access, setAccess] = useState<api.StudyAccess | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [err, setErr] = useState('')

  useEffect(() => {
    setItems(null)
    api.listStudyLessons({ cefr: level }).then(setItems).catch(() => setItems([]))
  }, [level])
  useEffect(() => {
    api.studyAccess().then(setAccess).catch(() => setAccess({ signed_in: !!userId, plus: false, used: 0, limit: 0, unlocked: [] }))
    if (userId) api.studyDone(userId).then(setDone).catch(() => {})
  }, [userId])

  const canOpen = (l: StudyLessonSummary) => !!access && (access.plus || access.unlocked.includes(l.id) || (!!userId && l.author_id === userId))
  const left = access ? Math.max(0, access.limit - access.used) : 0
  const teacher = role === 'teacher' || role === 'admin'

  async function open(l: StudyLessonSummary) {
    setErr('')
    if (canOpen(l)) return onOpen(l.id)
    if (!access?.signed_in) return onLogin()
    if (left <= 0) return onUpgrade()
    const ask = teacher ? t('course.confirmUnlockTeacher', { title: l.title, n: left }) : t('course.confirmUnlock', { title: l.title })
    if (!confirm(ask)) return
    try {
      await api.unlockStudyLesson(l.id)
      onOpen(l.id)
    } catch (e) {
      setErr(String((e as Error).message) === 'no_unlocks_left' ? t('course.noTrial') : t('course.unlockFailed'))
    }
  }

  const list = items ?? []
  const next = access?.plus ? list.find((l) => !done.has(l.id)) : undefined
  const doneHere = list.filter((l) => done.has(l.id)).length
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${on ? 'border-plum bg-lilac text-plum-deep' : 'border-line text-mute hover:border-lavender'}`

  return (
    <div>
      <p className="mb-4 text-mute">{t('course.intro')}</p>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {CEFR_LEVELS.map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={chip(level === l)}>
            {l}
          </button>
        ))}
      </div>

      {access && (
        <div className="mb-5 rounded-3xl border border-line bg-gradient-to-br from-cream via-paper to-mist/50 p-5">
          {access.plus ? (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-semibold">{t('course.planTitle', { level })}</p>
                <p className="text-sm text-mute">{t('course.planProgress', { done: doneHere, total: list.length })}</p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-line sm:w-56">
                <div className="h-full rounded-full bg-plum transition-all" style={{ width: `${list.length ? (doneHere / list.length) * 100 : 0}%` }} />
              </div>
            </div>
          ) : (
            <LeanSays pose="sly" size={64}>
              <span className="block">
                {!access.signed_in ? t('course.guestIntro') : left > 0 ? (teacher ? t('course.teacherIntro', { n: left }) : t('course.trialIntro')) : t('course.noTrial')}
              </span>
              <span className="mt-2 flex flex-wrap gap-2">
                {!access.signed_in ? (
                  <Button onClick={onLogin}>{t('common.signIn')}</Button>
                ) : (
                  <Button variant={left > 0 ? 'soft' : 'solid'} onClick={onUpgrade}>
                    <I.IconSparkle /> {t('course.getPlus')}
                  </Button>
                )}
              </span>
            </LeanSays>
          )}
        </div>
      )}
      {err && <p className="mb-3 text-sm text-warn">{err}</p>}

      {items === null && <p className="text-mute">{t('common.loading')}</p>}
      {items?.length === 0 && <LeanEmpty>{t('course.none')}</LeanEmpty>}
      <div className="space-y-3">
        {list.map((l, i) => {
          const isOpen = canOpen(l)
          const finished = done.has(l.id)
          const isNext = next?.id === l.id
          return (
            <button
              key={l.id}
              onClick={() => open(l)}
              className={`flex w-full items-center gap-4 rounded-3xl border bg-paper p-4 text-left transition-shadow hover:shadow-[0_12px_30px_-18px_rgba(60,42,112,0.6)] ${isNext ? 'border-plum ring-2 ring-plum/20' : 'border-line'}`}
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display text-xl font-semibold ${finished ? 'bg-[rgba(63,143,107,.15)] text-[var(--color-good)]' : isNext ? 'bg-plum text-paper' : 'bg-cream text-plum'}`}>
                {finished ? '✓' : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-mute"><I.IconTime /> {t('course.minutes', { n: l.duration_min })}</span>
                  {isNext && <span className="rounded-full bg-lilac px-2 py-0.5 text-xs font-semibold text-plum-deep">{t('course.upNext')}</span>}
                  {l.status === 'draft' && <span className="text-xs text-mute">· {t('teacher.draft')}</span>}
                </span>
                <span className="mt-0.5 block font-display text-xl font-semibold">{l.title}</span>
                <span className="block truncate text-sm text-mute">{l.description}</span>
              </span>
              {!isOpen && <span className="shrink-0 rounded-full bg-honey/50 px-3 py-1 text-xs font-semibold"><I.IconLock /> Plus</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function StudyPlayer({
  lessonId,
  onBack,
  onOpenOnBoard,
  onUpgrade,
}: {
  lessonId: string
  onBack: () => void
  onOpenOnBoard?: (lesson: StudyLesson) => void
  onUpgrade?: () => void
}) {
  const { t } = useTranslation()
  const { role, userId } = useAuth()
  const [locked, setLocked] = useState(false)
  const isTeacher = role === 'teacher' || role === 'admin'
  const [lesson, setLesson] = useState<StudyLesson | null | undefined>(undefined)
  const [step, setStep] = useState(0)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [inner, setInner] = useState<Lesson | null>(null) // task / practice being played inside a stage
  const [showNotes, setShowNotes] = useState(isTeacher)

  useEffect(() => {
    setLocked(false)
    api
      .getStudyLesson(lessonId)
      .then(setLesson)
      .catch((e) => {
        if (e instanceof api.StudyLockedError) setLocked(true)
        setLesson(null)
      })
  }, [lessonId])

  if (lesson === undefined) return <p className="py-24 text-center text-mute">{t('common.loading')}</p>
  if (lesson === null && locked)
    return (
      <section className="mx-auto max-w-md px-6 pt-16 text-center">
        <LeanSays pose="sly" size={90}>
          <b className="block font-display text-xl">{t('course.lockedTitle')}</b>
          {t('course.lockedText')}
        </LeanSays>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="ghost" onClick={onBack}>
            ← {t('nav.lessons')}
          </Button>
          {onUpgrade && <Button onClick={onUpgrade}><I.IconSparkle /> {t('course.getPlus')}</Button>}
        </div>
      </section>
    )
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
              <I.IconBoardPlan /> {t('course.onBoard')}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge>{lesson.cefr}</Badge>
        <span className="text-sm text-mute"><I.IconTime /> {t('course.minutes', { n: lesson.duration_min })}</span>
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
            <span>{done.has(i) && i !== step ? '✓' : <StageIcon kind={s.kind} />}</span>
            {t(`course.stages.${s.kind}`)}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-3xl border border-line bg-paper p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-2xl font-semibold">
            <span className="text-plum"><StageIcon kind={stage.kind} /></span> {stage.title}
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
                if (userId) api.markStudyDone(userId, lesson.id).catch(() => {})
                onBack()
              }}
            >
              {t('course.finish')} <I.IconDone />
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
