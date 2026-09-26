import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, TranslatableText, inputCls } from '../lib/ui'
import { speak } from '../lib/supabase'
import {
  correctAnswerText,
  evaluate,
  norm,
  promptText,
  sameResponse,
  skillLabel,
  type Evaluation,
  type Exercise,
  type Response,
} from '../lib/exercises'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { Lesson, LessonPass, PassSummary, SavedAnswer, Word } from '../lib/api'
import { lessonLevelLabel } from '../lib/config'

function Verdict({ correct, explanation, answer }: { correct: boolean; explanation: string; answer?: string }) {
  const { t } = useTranslation()
  return (
    <div
      className="mt-4 rounded-2xl border px-4 py-3 text-sm"
      style={
        correct
          ? { borderColor: 'rgba(63,143,107,.3)', background: 'rgba(63,143,107,.08)', color: 'var(--color-good)' }
          : { borderColor: 'rgba(180,85,47,.3)', background: 'rgba(180,85,47,.08)', color: 'var(--color-warn)' }
      }
    >
      {correct ? (
        <p className="font-semibold">✓ {t('player.correct')}</p>
      ) : (
        <>
          <p className="font-semibold">✗ {t('player.notYet')}</p>
          {answer && (
            <p className="mt-1 text-ink/80">
              {t('player.correctAnswer')} <b>{answer}</b>
            </p>
          )}
          {explanation && <p className="mt-1 text-ink/70">💬 {explanation}</p>}
        </>
      )}
    </div>
  )
}

/** One exercise. Behaviour, checking, explanations and TTS preserved.
 *  `initial` restores a saved answer; `onChange` fires on every edit (autosave). */
export function ExerciseView({
  ex,
  dict,
  translations,
  initial,
  onChange,
  onCheck,
}: {
  ex: Exercise
  dict: Map<string, Word>
  translations: boolean
  initial?: { response: Response; checked: boolean; correct: boolean }
  onChange?: (r: Response) => void
  onCheck?: (r: Response, result: Evaluation) => void
}) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState(initial?.checked ?? false)
  const [correct, setCorrect] = useState(initial?.correct ?? false)
  const [response, setResponse] = useState<Response>(initial?.response ?? {})
  const text = response.text ?? ''
  const picked = response.picked ?? null
  const blanks = response.blanks ?? {}

  const T = (t: string) => <TranslatableText text={t} dict={dict} enabled={translations} />

  // Any edit after a check hides the old verdict, so the new answer can be checked.
  function update(next: Response) {
    setResponse(next)
    setChecked(false)
    onChange?.(next)
  }
  const setText = (v: string) => update({ text: v })
  const setPicked = (v: string) => update({ picked: v })
  const setBlanks = (f: (b: Record<number, string>) => Record<number, string>) => update({ blanks: f(blanks) })

  function check() {
    const result = evaluate(ex, response)
    setCorrect(result.correct)
    setChecked(true)
    onCheck?.(response, result)
  }

  const canCheck = evaluate(ex, response).answered

  return (
    <div className="rounded-3xl border border-line bg-paper p-6 shadow-[0_10px_30px_-18px_rgba(60,42,112,0.5)] sm:p-8">
      <Badge>{skillLabel(ex.type)}</Badge>

      {ex.type === 'fill' && (
        <div className="mt-5">
          <p className="font-display text-2xl leading-snug">{T(ex.prompt.replace('___', '_____'))}</p>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('player.typeWord')}
            className={`${inputCls} mt-4 w-full sm:w-72`}
            onKeyDown={(e) => e.key === 'Enter' && canCheck && !checked && check()}
          />
        </div>
      )}

      {ex.type === 'choice' && (
        <div className="mt-5">
          <p className="font-display text-2xl leading-snug">{T(ex.prompt.replace('___', '_____'))}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ex.options.map((o) => {
              const active = picked === o
              return (
                <button
                  key={o}
                  onClick={() => !checked && setPicked(o)}
                  className={`rounded-xl border px-4 py-2 font-body font-semibold transition-colors ${
                    active ? 'border-plum bg-lilac text-plum-deep' : 'border-line bg-paper text-ink hover:border-lavender'
                  }`}
                >
                  {o}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {ex.type === 'listen' && (
        <div className="mt-5">
          <p className="text-mute">{t('player.listenAndWrite')}</p>
          <button
            onClick={() => speak(ex.text)}
            className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-line bg-lilac px-5 py-4 font-body font-semibold text-plum-deep transition-colors hover:bg-lavender/40"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-plum text-paper">▶</span>
            {t('player.listen')}
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('player.typeWhatYouHeard')}
            className={`${inputCls} mt-4 block w-full`}
            onKeyDown={(e) => e.key === 'Enter' && canCheck && !checked && check()}
          />
        </div>
      )}

      {ex.type === 'dialogue' && (
        <div className="mt-5 space-y-3">
          <p className="text-mute">{t('player.dialogueInstruction')}</p>
          {ex.lines.map((l, i) => {
            const parts = l.text.split('___')
            return (
              <div key={i} className="flex gap-3 rounded-2xl bg-sand/70 p-3">
                <span className="mt-1 shrink-0 font-display font-semibold text-plum">{l.speaker}</span>
                <p className="flex flex-1 flex-wrap items-center gap-1 font-body text-lg leading-relaxed">
                  {T(parts[0])}
                  {l.answer !== undefined && (
                    <input
                      value={blanks[i] || ''}
                      onChange={(e) => setBlanks((b) => ({ ...b, [i]: e.target.value }))}
                      className={`${inputCls} mx-1 w-28 py-1`}
                      placeholder="…"
                    />
                  )}
                  {parts[1] ? T(parts[1]) : ''}
                </p>
                <button
                  onClick={() => speak(`${l.text.replace('___', l.answer || '')}`)}
                  aria-label={t('player.listenLine')}
                  className="mt-0.5 shrink-0 self-start rounded-full bg-lilac px-3 py-1 text-plum-deep hover:bg-lavender/40"
                >
                  ▶
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={check} disabled={!canCheck || checked}>
          {t('player.check')}
        </Button>
        {checked && !correct && (
          <Button variant="ghost" onClick={() => update({})}>
            {t('player.tryAgain')}
          </Button>
        )}
      </div>

      {checked && (
        <Verdict
          correct={correct}
          explanation={ex.explanation}
          answer={
            ex.type === 'fill'
              ? ex.answer
              : ex.type === 'choice'
                ? ex.answer
                : ex.type === 'listen'
                  ? ex.text
                  : undefined
          }
        />
      )}
    </div>
  )
}

/** State of one answer: loaded from the DB for students, kept in memory for guests. */
type Ans = Omit<SavedAnswer, 'pass_id' | 'exercise_id'>

const blankAns = (): Ans => ({
  response: {},
  given_answer: '',
  is_correct: false,
  checked: false,
  first_check_correct: null,
  attempts_count: 0,
  last_checked_response: null,
})

/** Answers are keyed by exercise id (index for exercises without one). */
const exKey = (ex: Exercise, idx: number) => ex.id ?? `#${idx}`

type Outcome = {
  correct: number
  total: number
  legacyScore?: number // result saved before passes existed: percent only, no answers
  best: LessonPass | null
  completed: number
  answers: Record<string, Ans> | null
}

const SAVE_DELAY_MS = 500

/** Lesson player. For signed-in students every answer is saved (checked or not),
 *  an unfinished pass is resumed, and a finished lesson opens on its last result. */
export function LessonPlayer({
  lesson,
  dict,
  onDone,
}: {
  lesson: Lesson
  dict: Map<string, Word>
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { userId, role, settings } = useAuth()
  const signedIn = !!userId // guests just practice; nothing saved
  const [phase, setPhase] = useState<'loading' | 'play' | 'result' | 'review'>('loading')
  const [exs, setExs] = useState<Exercise[]>(lesson.exercises)
  const [i, setI] = useState(0)
  const [pass, setPass] = useState<LessonPass | null>(null)
  const [answers, setAnswers] = useState<Record<string, Ans>>({})
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'mistakes'>('all')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // Refs so that autosave (timers, page hide, unmount) always sees current values.
  const passRef = useRef<LessonPass | null>(null)
  const exsRef = useRef<Exercise[]>(lesson.exercises)
  const pending = useRef<Record<string, Response>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const startedAt = useRef(Date.now())

  function openPass(p: LessonPass | null, saved: Record<string, Ans>, index: number) {
    passRef.current = p
    setPass(p)
    setAnswers(saved)
    setI(Math.min(Math.max(index, 0), Math.max(exsRef.current.length - 1, 0)))
    startedAt.current = Date.now()
    setError('')
    setPhase('play')
  }

  async function resume(p: LessonPass, alive: () => boolean) {
    const saved = await api.passAnswers([p.id])
    if (!alive()) return
    openPass(p, Object.fromEntries(saved.map((a) => [a.exercise_id, a])), p.current_index)
  }

  async function showOutcome(s: PassSummary, alive: () => boolean) {
    const last = s.last!
    const saved = await api.passAnswers([last.id])
    if (!alive()) return
    setOutcome({
      correct: last.correct_count ?? 0,
      total: last.total_count ?? 0,
      best: s.best,
      completed: s.completed,
      answers: Object.fromEntries(saved.map((a) => [a.exercise_id, a])),
    })
    setPhase('result')
  }

  // Load: fresh exercises (with ids) + where this student left off.
  useEffect(() => {
    let alive = true
    const isAlive = () => alive
    ;(async () => {
      setPhase('loading')
      const fresh = await api.getLesson(lesson.id).catch(() => null)
      const list = fresh?.exercises.length ? fresh.exercises : lesson.exercises
      if (!alive) return
      exsRef.current = list
      setExs(list)
      if (!userId) return openPass(null, {}, 0)

      const s = api.summarizePasses(await api.studentPasses(userId, lesson.id))[lesson.id]
      if (!alive) return
      if (s?.open) return resume(s.open, isAlive)
      if (s?.last) return showOutcome(s, isAlive)

      const legacy = (await api.myProgress(userId)).find((p) => p.lesson_id === lesson.id && p.status === 'completed')
      if (!alive) return
      if (legacy) {
        setOutcome({ correct: 0, total: list.length, legacyScore: legacy.score, best: null, completed: 1, answers: null })
        setPhase('result')
        return
      }
      await resume(await api.startPass(lesson.id), isAlive)
    })().catch(() => {
      if (!alive) return
      setError(t('player.errors.load'))
      setPhase('result')
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id, userId])

  /** Send queued autosaves now. Returns false if something could not be saved. */
  async function flush(): Promise<boolean> {
    clearTimeout(timer.current)
    const p = passRef.current
    const items = Object.entries(pending.current)
    pending.current = {}
    if (!p || !items.length) return true
    try {
      await Promise.all(
        items.map(([id, r]) => {
          const ex = exsRef.current.find((e) => e.id === id)
          if (!ex) return
          const e = evaluate(ex, r)
          return api.saveAnswer(p, id, r, e.given, e.correct)
        }),
      )
      return true
    } catch {
      // keep them queued (newer edits win) and retry on the next save
      pending.current = { ...Object.fromEntries(items), ...pending.current }
      setError(t('player.errors.saveAnswer'))
      return false
    }
  }

  // Save when the tab is hidden/closed and when the player unmounts.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleChange(ex: Exercise, idx: number, r: Response) {
    const key = exKey(ex, idx)
    const e = evaluate(ex, r)
    setAnswers((prev) => ({ ...prev, [key]: { ...(prev[key] ?? blankAns()), response: r, given_answer: e.given, is_correct: e.correct } }))
    if (signedIn && ex.id) {
      pending.current[ex.id] = r
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, SAVE_DELAY_MS)
    }
  }

  async function handleCheck(ex: Exercise, idx: number, r: Response, e: Evaluation) {
    const key = exKey(ex, idx)
    const p = passRef.current
    if (signedIn && p && ex.id) {
      delete pending.current[ex.id]
      try {
        const saved = await api.recordCheck(p.id, ex.id, r, e.given, e.correct)
        // if the student already edited again, keep the newer input
        setAnswers((prev) => {
          const cur = prev[key]
          return {
            ...prev,
            [key]: cur && !sameResponse(cur.response, r)
              ? { ...saved, response: cur.response, given_answer: cur.given_answer, is_correct: cur.is_correct }
              : saved,
          }
        })
      } catch {
        setError(t('player.errors.saveCheck'))
      }
      return
    }
    setAnswers((prev) => {
      const a = prev[key] ?? blankAns()
      if (a.checked && sameResponse(a.last_checked_response, r)) return prev
      return {
        ...prev,
        [key]: {
          ...a,
          response: r,
          given_answer: e.given,
          is_correct: e.correct,
          checked: true,
          first_check_correct: a.first_check_correct ?? e.correct,
          attempts_count: a.attempts_count + 1,
          last_checked_response: r,
        },
      }
    })
  }

  function goTo(n: number) {
    flush()
    const p = passRef.current
    // the position is a convenience for resuming; a failed save only means starting a bit earlier
    if (p) api.savePassPosition(p.id, n).catch(() => {})
    setI(n)
  }

  async function leave() {
    await flush()
    onDone()
  }

  async function finish() {
    setBusy(true)
    setError('')
    try {
      if (!(await flush())) return
      const p = passRef.current
      if (signedIn && p) {
        await api.completePass(p.id, Math.round((Date.now() - startedAt.current) / 1000))
        const s = api.summarizePasses(await api.studentPasses(userId!, lesson.id))[lesson.id]
        passRef.current = null
        setPass(null)
        await showOutcome(s, () => true)
      } else {
        const correct = exs.filter((ex, idx) => api.countsAsCorrect(answers[exKey(ex, idx)])).length
        setOutcome({ correct, total: exs.length, best: null, completed: 1, answers })
        setPhase('result')
      }
    } catch {
      setError(t('player.errors.finish'))
    } finally {
      setBusy(false)
    }
  }

  async function tryAgain() {
    if (!signedIn) return openPass(null, {}, 0)
    setBusy(true)
    setError('')
    try {
      await resume(await api.startPass(lesson.id), () => true)
    } catch {
      setError(t('player.errors.restart'))
    } finally {
      setBusy(false)
    }
  }

  const header = (
    <>
      <button onClick={leave} className="mb-4 font-body text-sm text-mute hover:text-ink">
        ← {t('lessons.allLessons')}
      </button>
      <div className="flex items-center gap-2">
        <h2 className="font-display text-3xl font-semibold">{lesson.title}</h2>
        {lesson.visibility === 'private' && <Badge>{t('visibility.private')}</Badge>}
      </div>
    </>
  )

  if (phase === 'loading') {
    return (
      <section className="mx-auto max-w-2xl px-6 pb-24">
        {header}
        <p className="mt-6 text-mute">{t('common.loading')}</p>
      </section>
    )
  }

  if (phase === 'result' || phase === 'review') {
    return (
      <section className="mx-auto max-w-2xl px-6 pb-24">
        {header}
        {!outcome ? (
          <p className="mt-6 text-sm text-warn">{error}</p>
        ) : phase === 'review' ? (
          <AnswersReview exs={exs} answers={outcome.answers ?? {}} initialFilter={reviewFilter} onBack={() => setPhase('result')} />
        ) : (
          <LessonResult
            outcome={outcome}
            busy={busy}
            error={error}
            onReview={(f) => {
              setReviewFilter(f)
              setPhase('review')
            }}
            onRetry={tryAgain}
            onDone={leave}
          />
        )}
      </section>
    )
  }

  if (exs.length === 0) {
    return (
      <section className="mx-auto max-w-2xl px-6 pb-24">
        {header}
        <p className="mt-6 text-mute">{t('player.noExercises')}</p>
      </section>
    )
  }

  const ex = exs[i]
  const saved = answers[exKey(ex, i)]
  const progress = ((i + 1) / exs.length) * 100

  return (
    <section className="mx-auto max-w-2xl px-6 pb-24">
      {header}
      {!signedIn && (
        <p className="mt-2 text-sm text-mute">{t('player.guestNotice')}</p>
      )}
      <div className="my-5 h-2 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full bg-plum transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <ExerciseView
        key={`${pass?.id ?? 'guest'}-${i}`}
        ex={ex}
        dict={dict}
        translations={settings.translations_enabled && role !== 'guest'}
        initial={
          saved && {
            response: saved.response,
            // show the verdict only if the answer on screen is the one that was checked
            checked: saved.checked && sameResponse(saved.last_checked_response, saved.response),
            correct: saved.is_correct,
          }
        }
        onChange={(r) => handleChange(ex, i, r)}
        onCheck={(r, e) => handleCheck(ex, i, r, e)}
      />

      <div className="mt-6 flex items-center justify-between">
        <Button variant="soft" onClick={() => goTo(Math.max(0, i - 1))} disabled={i === 0}>
          ← {t('common.back')}
        </Button>
        <span className="font-body text-sm text-mute">
          {i + 1} / {exs.length}
        </span>
        {i === exs.length - 1 ? (
          <Button onClick={finish} disabled={busy}>
            {busy ? t('common.saving') : `${t('player.finish')} ✓`}
          </Button>
        ) : (
          <Button onClick={() => goTo(Math.min(exs.length - 1, i + 1))}>{t('common.next')} →</Button>
        )}
      </div>
      {error && <p className="mt-4 text-sm text-warn">{error}</p>}
    </section>
  )
}

/** Shown after finishing a lesson and when opening an already completed one. */
function LessonResult({
  outcome,
  busy,
  error,
  onReview,
  onRetry,
  onDone,
}: {
  outcome: Outcome
  busy: boolean
  error: string
  onReview: (filter: 'all' | 'mistakes') => void
  onRetry: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { correct, total, best } = outcome
  const legacy = outcome.legacyScore !== undefined
  const pct = legacy ? outcome.legacyScore! : total ? Math.round((correct / total) * 100) : 0
  const mistakes = total - correct

  return (
    <div className="mt-6 rounded-3xl border border-line bg-paper p-8 text-center shadow-[0_10px_30px_-18px_rgba(60,42,112,0.5)]">
      <span className="rounded-full bg-[rgba(63,143,107,.12)] px-3 py-1 text-sm font-semibold text-[var(--color-good)]">
        ✓ {t('result.completed')}
      </span>
      {legacy ? (
        <p className="mt-5 font-display text-6xl font-semibold text-plum">{pct}%</p>
      ) : (
        <>
          <p className="mt-5 font-display text-6xl font-semibold text-plum">
            {correct} / {total}
          </p>
          <p className="mt-1 text-xl text-mute">{pct}%</p>
          <p className="mt-4 font-body">
            {t('result.correct')} <b className="text-[var(--color-good)]">{correct}</b> · {t('result.mistakes')} <b className="text-warn">{mistakes}</b>
          </p>
        </>
      )}
      {best && (
        <p className="mt-2 text-sm text-mute">
          {t('result.best', { best: `${best.correct_count ?? 0}/${best.total_count ?? 0}`, passes: outcome.completed })}
        </p>
      )}
      {legacy && <p className="mt-3 text-sm text-mute">{t('result.legacyNoAnswers')}</p>}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {outcome.answers && (
          <Button variant="soft" onClick={() => onReview('all')}>
            {t('result.allAnswers')}
          </Button>
        )}
        {outcome.answers && mistakes > 0 && (
          <Button variant="soft" onClick={() => onReview('mistakes')}>
            {t('result.viewMistakes')}
          </Button>
        )}
        <Button onClick={onRetry} disabled={busy}>
          {t('result.tryAgain')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('lessons.backToLessons')}
        </Button>
      </div>
      {error && <p className="mt-4 text-sm text-warn">{error}</p>}
    </div>
  )
}

/** Answers of a pass: the task, the student's answer, the right answer, ✓/✗. */
function AnswersReview({
  exs,
  answers,
  initialFilter,
  onBack,
}: {
  exs: Exercise[]
  answers: Record<string, Ans>
  initialFilter: 'all' | 'mistakes'
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState(initialFilter)
  const all = exs.map((ex, idx) => {
    const a = answers[exKey(ex, idx)]
    return { ex, idx, a, ok: api.countsAsCorrect(a) }
  })
  const items = filter === 'all' ? all : all.filter(({ ok }) => !ok)
  const mistakes = all.filter(({ ok }) => !ok).length

  return (
    <div className="mt-6 space-y-3">
      <button onClick={onBack} className="font-body text-sm text-mute hover:text-ink">
        ← {t('review.backToResult')}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-2xl font-semibold">{filter === 'all' ? t('review.myAnswers') : t('review.mistakes')}</h3>
        <div className="flex rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold">
          {(['all', 'mistakes'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3.5 py-1 transition-colors ${filter === f ? 'bg-plum text-paper' : 'text-mute hover:text-ink'}`}
            >
              {f === 'all' ? t('review.filterAll', { count: all.length }) : t('review.filterMistakes', { count: mistakes })}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 && <p className="text-mute">{t('review.noMistakes')}</p>}
      {items.map(({ ex, idx, a, ok }) => (
        <div
          key={exKey(ex, idx)}
          className="rounded-2xl border bg-paper p-4"
          style={{ borderColor: ok ? 'rgba(63,143,107,.35)' : 'rgba(180,85,47,.35)' }}
        >
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`font-semibold ${ok ? 'text-[var(--color-good)]' : 'text-warn'}`}>{ok ? '✓' : '✗'}</span>
            <span className="font-semibold">{t('review.exerciseN', { n: idx + 1 })}</span>
            <Badge>{skillLabel(ex.type)}</Badge>
            {a && !a.checked && <span className="text-xs text-mute">{t('review.notChecked')}</span>}
          </div>
          <p className="mt-2 font-body">{promptText(ex)}</p>
          {ex.type === 'dialogue' ? (
            ex.lines.map((l, li) => {
              if (!l.answer) return null
              const given = (a?.response.blanks ?? {})[li]?.trim() ?? ''
              const blankOk = given !== '' && norm(given) === norm(l.answer)
              return (
                <p key={li} className="mt-2 text-sm">
                  {t('review.blankInLine', { speaker: l.speaker })}{' '}
                  {given ? (
                    <b className={blankOk ? 'text-[var(--color-good)]' : 'text-warn'}>{given}</b>
                  ) : (
                    <span className="text-mute">{t('review.noAnswer')}</span>
                  )}{' '}
                  {blankOk ? '✓' : '✗'}
                </p>
              )
            })
          ) : (
            <p className="mt-2 text-sm">
              {t('review.yourAnswer')}{' '}
              {a?.given_answer ? (
                <b className={a.is_correct ? 'text-[var(--color-good)]' : 'text-warn'}>{a.given_answer}</b>
              ) : (
                <span className="text-mute">{t('review.noAnswer')}</span>
              )}
            </p>
          )}
          {!ok && (
            <>
              <p className="mt-1 text-sm">
                {t('player.correctAnswer')} <b className="text-[var(--color-good)]">{correctAnswerText(ex)}</b>
              </p>
              {a?.checked && a.first_check_correct === false && a.is_correct && (
                <p className="mt-1 text-xs text-mute">{t('review.fixedAfterCheck')}</p>
              )}
              {ex.explanation && <p className="mt-1 text-sm text-ink/70">💬 {ex.explanation}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  )
}

/** Catalog of lessons the current viewer can see (RLS-filtered). */
export function LessonsCatalog({
  lessons,
  progress,
  passes,
  onOpen,
}: {
  lessons: Lesson[]
  progress: Record<string, api.LessonProgress>
  passes?: Record<string, PassSummary>
  onOpen: (l: Lesson) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <h2 className="mb-8 font-display text-4xl font-semibold">{t('nav.lessons')}</h2>
      {lessons.length === 0 && <p className="text-mute">{t('lessons.none')}</p>}
      <div className="grid gap-4">
        {lessons.map((l) => {
          const skills = Array.from(new Set(l.exercises.map((e) => skillLabel(e.type))))
          const pr = progress[l.id]
          const s = passes?.[l.id]
          const done = pr?.status === 'completed' || !!s?.last
          // last result as N/M; lessons finished before passes existed only have a percent
          const lastResult = s?.last
            ? `${s.last.correct_count ?? 0}/${s.last.total_count ?? 0}`
            : pr?.status === 'completed'
              ? `${pr.score}%`
              : null
          const open = s?.open
          return (
            <button
              key={l.id}
              onClick={() => onOpen(l)}
              className={`group flex flex-col gap-3 rounded-3xl border border-line p-6 text-left transition-all hover:border-lavender hover:shadow-[0_16px_40px_-24px_rgba(60,42,112,0.5)] sm:flex-row sm:items-center sm:justify-between ${
                done ? 'bg-paper/70' : 'bg-paper'
              }`}
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`font-display text-2xl font-semibold ${done ? 'text-ink/75' : ''}`}>{l.title}</h3>
                  <Badge>{lessonLevelLabel(l.level)}</Badge>
                  <Badge>{t(`visibility.${l.visibility}`)}</Badge>
                  {done && (
                    <span className="rounded-full bg-[rgba(63,143,107,.12)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-good)]">
                      ✓ {t('lessons.completedBadge')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-mute">{l.description}</p>
                {done && lastResult && (
                  <p className="mt-1 text-sm font-semibold text-[var(--color-good)]">{t('lessons.lastResult', { result: lastResult })}</p>
                )}
                {open ? (
                  <p className="mt-1 text-sm text-plum">
                    {done ? t('lessons.newPass') : t('progress.inProgress')} ·{' '}
                    {t('lessons.exerciseOf', { n: Math.min(open.current_index + 1, l.exercises.length), total: l.exercises.length })}
                  </p>
                ) : (
                  !done && pr?.status === 'in_progress' && <p className="mt-1 text-sm text-plum">{t('progress.inProgress')}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <span key={s} className="rounded-full border border-line px-2.5 py-0.5 font-body text-xs text-mute">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 font-body font-semibold text-plum">
                {t('lessons.exerciseCount', { count: l.exercises.length })} →
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
