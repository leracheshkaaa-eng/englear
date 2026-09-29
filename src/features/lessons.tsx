import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, TranslatableText, inputCls } from '../lib/ui'
import { speak } from '../lib/supabase'
import {
  correctAnswerText,
  displayAnswer,
  evaluate,
  norm,
  promptText,
  sameResponse,
  skillLabel,
  tfLabel,
  type Evaluation,
  type Exercise,
  type Match,
  type Order,
  type Response,
} from '../lib/exercises'
import { useAuth } from '../lib/auth'
import { MaterialView, materialLength, materialTypeLabel } from './practice'
import * as api from '../lib/api'
import type { Lesson, LessonPass, PassSummary, SavedAnswer, WordHint } from '../lib/api'
import { CEFR_LEVELS, TOPICS, lessonLevelLabel, lessonSkillLabel, topicLabel } from '../lib/config'

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

/** One exercise. `initial` restores a saved answer; `onChange` fires on every edit (autosave).
 *  `grade` checks on the server (lessons); without it the answer is checked here
 *  (flashcard practice, where the exercises are built in the app). */
export function ExerciseView({
  ex,
  dict,
  translations,
  initial,
  onChange,
  grade,
  onCheck,
}: {
  ex: Exercise
  dict: Map<string, WordHint>
  translations: boolean
  initial?: { response: Response; checked: boolean; correct: boolean; correctAnswer?: string }
  onChange?: (r: Response) => void
  grade?: (r: Response, given: string) => Promise<api.Verdict>
  onCheck?: (r: Response, result: Evaluation) => void
}) {
  const { t } = useTranslation()
  const [checked, setChecked] = useState(initial?.checked ?? false)
  const [correct, setCorrect] = useState(initial?.correct ?? false)
  const [answerText, setAnswerText] = useState(initial?.correctAnswer ?? '')
  const [response, setResponse] = useState<Response>(initial?.response ?? {})
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const text = response.text ?? ''
  const picked = response.picked ?? null
  const blanks = response.blanks ?? {}

  const T = (s: string) => <TranslatableText text={s} dict={dict} enabled={translations} />

  // Any edit after a check hides the old verdict, so the new answer can be checked.
  function update(next: Response) {
    setResponse(next)
    setChecked(false)
    setError('')
    onChange?.(next)
  }
  const setText = (v: string) => update({ text: v })
  const setPicked = (v: string) => update({ picked: v })
  const setBlanks = (f: (b: Record<number, string>) => Record<number, string>) => update({ blanks: f(blanks) })

  const local = evaluate(ex, response)
  const canCheck = local.answered && !checking

  async function check() {
    if (!canCheck) return
    setChecking(true)
    setError('')
    try {
      const v = grade ? await grade(response, local.given) : { correct: local.correct, correctAnswer: correctAnswerText(ex) }
      setCorrect(v.correct)
      setAnswerText(displayAnswer(ex, v.correctAnswer))
      setChecked(true)
      onCheck?.(response, { ...local, correct: v.correct })
    } catch {
      setError(t('player.errors.saveCheck'))
    } finally {
      setChecking(false)
    }
  }

  const optionCls = (active: boolean) =>
    `rounded-xl border px-4 py-2 font-body font-semibold transition-colors ${
      active ? 'border-plum bg-lilac text-plum-deep' : 'border-line bg-paper text-ink hover:border-lavender'
    }`

  return (
    <div className="rounded-3xl border border-line bg-paper p-6 shadow-[0_10px_30px_-18px_rgba(60,42,112,0.5)] sm:p-8">
      <Badge>{skillLabel(ex.type)}</Badge>

      {ex.type === 'fill' && (
        <div className="mt-5">
          <p className="font-display text-2xl leading-snug">{T(ex.prompt.replace('___', '_____'))}</p>
          {ex.bank && ex.bank.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {ex.bank.map((w) => (
                <button key={w} onClick={() => !checked && setText(w)} className={optionCls(norm(text) === norm(w))}>
                  {w}
                </button>
              ))}
            </div>
          )}
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('player.typeWord')}
            className={`${inputCls} mt-4 w-full sm:w-72`}
            onKeyDown={(e) => e.key === 'Enter' && !checked && check()}
          />
        </div>
      )}

      {(ex.type === 'choice' || ex.type === 'truefalse') && (
        <div className="mt-5">
          {ex.type === 'truefalse' && <p className="text-sm text-mute">{t('player.tfInstruction')}</p>}
          <p className="mt-1 font-display text-2xl leading-snug">{T(ex.prompt.replace('___', '_____'))}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ex.options.map((o) => (
              <button key={o} onClick={() => !checked && setPicked(o)} className={optionCls(picked === o)}>
                {ex.type === 'truefalse' ? tfLabel(o) : o}
              </button>
            ))}
          </div>
        </div>
      )}

      {ex.type === 'order' && <OrderTask ex={ex} value={response.order ?? []} locked={checked} onChange={(order) => update({ order })} />}

      {ex.type === 'match' && <MatchTask ex={ex} value={response.pairs ?? {}} locked={checked} onChange={(pairs) => update({ pairs })} />}

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
            onKeyDown={(e) => e.key === 'Enter' && !checked && check()}
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
          {checking ? t('common.loading') : t('player.check')}
        </Button>
        {checked && !correct && (
          <Button variant="ghost" onClick={() => update({})}>
            {t('player.tryAgain')}
          </Button>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-warn">{error}</p>}

      {checked && <Verdict correct={correct} explanation={ex.explanation} answer={ex.type === 'dialogue' ? undefined : answerText || undefined} />}
    </div>
  )
}

/** Put the pieces in order: tap a piece to add it to the answer, tap it there to take it back. */
function OrderTask({ ex, value, locked, onChange }: { ex: Order; value: string[]; locked: boolean; onChange: (v: string[]) => void }) {
  const { t } = useTranslation()
  // items may repeat ("the … the"), so they are tracked by index
  const used = new Set<number>()
  const chosen = value.map((v) => {
    const i = ex.items.findIndex((x, k) => x === v && !used.has(k))
    used.add(i)
    return i
  })
  const pool = ex.items.map((x, i) => ({ x, i })).filter(({ i }) => !used.has(i))
  const sentence = ex.unit === 'sentence'
  const chip = 'rounded-xl border border-line bg-paper px-3 py-1.5 text-left font-body font-semibold hover:border-lavender disabled:opacity-60'
  return (
    <div className="mt-5">
      <p className="text-mute">{promptText(ex)}</p>
      <div className={`mt-4 min-h-14 rounded-2xl border-2 border-dashed border-line p-3 ${sentence ? 'space-y-2' : 'flex flex-wrap gap-2'}`}>
        {chosen.length === 0 && <span className="text-sm text-mute">{t('player.orderHint')}</span>}
        {chosen.map((i, k) => (
          <button key={`${i}-${k}`} disabled={locked} onClick={() => onChange(value.filter((_, j) => j !== k))} className={`${chip} border-plum bg-lilac ${sentence ? 'block w-full' : ''}`}>
            {sentence && <span className="mr-2 text-plum">{k + 1}.</span>}
            {ex.items[i]}
          </button>
        ))}
      </div>
      <div className={`mt-3 ${sentence ? 'space-y-2' : 'flex flex-wrap gap-2'}`}>
        {pool.map(({ x, i }) => (
          <button key={i} disabled={locked} onClick={() => onChange([...value, x])} className={`${chip} ${sentence ? 'block w-full' : ''}`}>
            {x}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Match each item on the left with one on the right (a list to choose from per row). */
function MatchTask({ ex, value, locked, onChange }: { ex: Match; value: Record<string, string>; locked: boolean; onChange: (v: Record<string, string>) => void }) {
  const { t } = useTranslation()
  const taken = new Set(Object.values(value))
  return (
    <div className="mt-5">
      <p className="text-mute">{promptText(ex)}</p>
      <div className="mt-4 space-y-2">
        {ex.left.map((l) => (
          <div key={l} className="grid items-center gap-2 rounded-2xl bg-sand/70 p-3 sm:grid-cols-[1fr_1fr]">
            <span className="font-body text-lg font-semibold">{l}</span>
            <select
              value={value[l] ?? ''}
              disabled={locked}
              onChange={(e) => {
                const next = { ...value }
                if (e.target.value) next[l] = e.target.value
                else delete next[l]
                onChange(next)
              }}
              className={`${inputCls} w-full`}
            >
              <option value="">{t('player.matchChoose')}</option>
              {ex.right.map((r) => (
                <option key={r} value={r} disabled={taken.has(r) && value[l] !== r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
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

/** Every English word that appears anywhere in the given values (strings, arrays, objects). */
export function lessonWords(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    for (const m of value.matchAll(/[A-Za-z][A-Za-z'-]*/g)) out.add(m[0].replace(/[-']+$/, '').toLowerCase())
  } else if (Array.isArray(value)) {
    for (const v of value) lessonWords(v, out)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) lessonWords(v, out)
  }
  return out
}

/** Inline translation hints for the words of this lesson only (not the whole dictionary). */
function useLessonHints(lesson: Lesson, exercises: Exercise[], material?: api.Material | null): Map<string, WordHint> {
  const { i18n } = useTranslation()
  const { settings } = useAuth()
  const [hints, setHints] = useState<Map<string, WordHint>>(new Map())
  const words = [...lessonWords([lesson.title, lesson.description, exercises, material?.body ?? '', material?.segments ?? []])].sort().join(' ')
  useEffect(() => {
    let cancelled = false
    api
      .lessonHints(words ? words.split(' ') : [])
      .then((ws) => { if (!cancelled) setHints(new Map(ws.map((w) => [w.word.toLowerCase(), w]))) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [words, i18n.language, settings.native_language])
  return hints
}

/** Lesson player. For signed-in students every answer is saved (checked or not),
 *  an unfinished pass is resumed, and a finished lesson opens on its last result. */
export function LessonPlayer({
  lesson,
  onDone,
}: {
  lesson: Lesson
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { userId, role, settings } = useAuth()
  const signedIn = !!userId // guests just practice; nothing saved
  const [phase, setPhase] = useState<'loading' | 'play' | 'result' | 'review'>('loading')
  const [exs, setExs] = useState<Exercise[]>(lesson.exercises)
  const [material, setMaterial] = useState<api.Material | null>(null)
  // practice: the text / recording comes first, the questions after it
  const [showIntro, setShowIntro] = useState(true)
  const dict = useLessonHints(lesson, exs, material)
  const [i, setI] = useState(0)
  const [pass, setPass] = useState<LessonPass | null>(null)
  const [answers, setAnswers] = useState<Record<string, Ans>>({})
  // correct answers as text, known after a check (and for the whole lesson once it is completed)
  const [solutions, setSolutions] = useState<Record<string, string>>({})
  const [reviewExs, setReviewExs] = useState<Exercise[] | null>(null)
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
    const [saved, sol, solved] = await Promise.all([
      api.passAnswers([last.id]),
      api.lessonSolutions(lesson.id).catch(() => ({})),
      // the exercises with their answers, for the review of a completed lesson
      api.getLesson(lesson.id, { withSolutions: true }).then((l) => l?.exercises ?? null).catch(() => null),
    ])
    if (!alive()) return
    setSolutions(sol)
    setReviewExs(solved)
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
      if ((fresh ?? lesson).kind === 'practice') {
        const m = await api.getMaterial(lesson.id).catch(() => null)
        if (!alive) return
        setMaterial(m)
      }
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
          return api.saveAnswer(p, id, r, evaluate(ex, r).given)
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

  /** "Check" on the server: a student's check is saved and logged; a guest's is only graded. */
  async function grade(ex: Exercise, idx: number, r: Response, given: string): Promise<api.Verdict> {
    const key = exKey(ex, idx)
    const p = passRef.current
    if (!ex.id) return { correct: evaluate(ex, r).correct, correctAnswer: correctAnswerText(ex) }
    if (signedIn && p) {
      delete pending.current[ex.id]
      const res = await api.checkExercise(p.id, ex.id, r, given)
      // if the student already edited again, keep the newer input
      setAnswers((prev) => {
        const cur = prev[key]
        return {
          ...prev,
          [key]: cur && !sameResponse(cur.response, r)
            ? { ...res.answer, response: cur.response, given_answer: cur.given_answer, is_correct: cur.is_correct }
            : res.answer,
        }
      })
      setSolutions((s) => ({ ...s, [key]: res.correctAnswer }))
      return res
    }
    const v = (await api.gradeAnswers([{ exerciseId: ex.id, response: r }]))[ex.id] ?? { correct: false, correctAnswer: '' }
    setAnswers((prev) => {
      const a = prev[key] ?? blankAns()
      if (a.checked && sameResponse(a.last_checked_response, r)) return prev
      return {
        ...prev,
        [key]: {
          ...a,
          response: r,
          given_answer: given,
          is_correct: v.correct,
          checked: true,
          first_check_correct: a.first_check_correct ?? v.correct,
          attempts_count: a.attempts_count + 1,
          last_checked_response: r,
        },
      }
    })
    setSolutions((s) => ({ ...s, [key]: v.correctAnswer }))
    return v
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
        // a guest: grade the answers that were never checked, and get every correct answer for the review
        const verdicts = await api.gradeAnswers(
          exs.filter((ex) => ex.id).map((ex, idx) => ({ exerciseId: ex.id!, response: answers[exKey(ex, idx)]?.response ?? {} })),
        )
        const graded = Object.fromEntries(
          exs.map((ex, idx) => {
            const key = exKey(ex, idx)
            const a = answers[key]
            const v = ex.id ? verdicts[ex.id] : undefined
            return [key, a && !a.checked && v ? { ...a, is_correct: v.correct } : a]
          }).filter(([, a]) => a),
        ) as Record<string, Ans>
        setSolutions((s) => ({ ...s, ...Object.fromEntries(Object.entries(verdicts).map(([id, v]) => [id, v.correctAnswer])) }))
        const correct = exs.filter((ex, idx) => api.countsAsCorrect(graded[exKey(ex, idx)])).length
        setOutcome({ correct, total: exs.length, best: null, completed: 1, answers: graded })
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
        ← {lesson.kind === 'practice' ? t('practice.back') : t('lessons.allLessons')}
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
          <AnswersReview exs={reviewExs?.length === exs.length ? reviewExs : exs} answers={outcome.answers ?? {}} solutions={solutions} initialFilter={reviewFilter} onBack={() => setPhase('result')} />
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

  const translationsOn = settings.translations_enabled && role !== 'guest'
  const started = Object.values(answers).some((a) => a && (a.checked || Object.keys(a.response ?? {}).length > 0))
  if (material && showIntro && !started) {
    return (
      <section className="mx-auto max-w-2xl px-6 pb-24">
        {header}
        <p className="mt-3 mb-5 text-mute">{lesson.skill === 'listening' ? t('practice.introListening') : t('practice.introReading')}</p>
        <MaterialView material={material} skill={lesson.skill} dict={dict} translations={translationsOn} />
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setShowIntro(false)}>{t('practice.toQuestions', { count: exs.length })} →</Button>
        </div>
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

      {material && (
        <div className="mb-4">
          <MaterialView material={material} skill={lesson.skill} dict={dict} translations={translationsOn} compact />
        </div>
      )}

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
            correctAnswer: solutions[exKey(ex, i)] ? displayAnswer(ex, solutions[exKey(ex, i)]) : undefined,
          }
        }
        onChange={(r) => handleChange(ex, i, r)}
        grade={(r, given) => grade(ex, i, r, given)}
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
  solutions,
  initialFilter,
  onBack,
}: {
  exs: Exercise[]
  answers: Record<string, Ans>
  solutions: Record<string, string>
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
              if (l.answer === undefined) return null
              const given = (a?.response.blanks ?? {})[li]?.trim() ?? ''
              // the answer of a gap is known after completion; a guest only sees the whole verdict
              const blankOk = given !== '' && (l.answer ? norm(given) === norm(l.answer) : ok)
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
                {t('player.correctAnswer')} <b className="text-[var(--color-good)]">{solutions[exKey(ex, idx)] ? displayAnswer(ex, solutions[exKey(ex, idx)]) : correctAnswerText(ex)}</b>
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

/** Catalog of the Lessons section (kind 'lesson': pick a level and grammar / vocabulary / both)
 *  or of the Practice section (kind 'practice': pick a level and reading / listening).
 *  Lessons also have a separate tab for lessons from the student's teacher (or a teacher's own).
 *  Loaded page by page. */
const CATALOG_PAGE = 30

type Focus = 'all' | 'grammar' | 'vocabulary'
const FOCUS_SKILLS: Record<Focus, string[] | undefined> = { all: undefined, grammar: ['grammar'], vocabulary: ['vocabulary'] }

export function LessonsCatalog({
  kind = 'lesson',
  progress,
  passes,
  onOpen,
}: {
  kind?: api.LessonKind
  progress: Record<string, api.LessonProgress>
  passes?: Record<string, PassSummary>
  onOpen: (id: string) => void
}) {
  const { t, i18n } = useTranslation()
  const { userId, role, settings } = useAuth()
  const practice = kind === 'practice'
  const [scope, setScope] = useState<api.LessonScope>('library')
  const [hasTeacherLessons, setHasTeacherLessons] = useState(false)
  // start at the student's own level (Settings); "All levels" is one tap away
  const [level, setLevel] = useState(userId && (CEFR_LEVELS as readonly string[]).includes(settings.english_level) ? settings.english_level : '')
  const [focus, setFocus] = useState<Focus>('all')
  const [skill, setSkill] = useState<string>('reading')
  const [grammar, setGrammar] = useState('') // grammar topic id
  const [grammarList, setGrammarList] = useState<api.GrammarTopic[]>([])
  useEffect(() => {
    api.grammarTopics().then(setGrammarList).catch(() => setGrammarList([]))
  }, [])
  const grammarById = new Map(grammarList.map((g) => [g.id, g]))
  const [topic, setTopic] = useState('')
  const [q, setQ] = useState('')
  const [lessons, setLessons] = useState<api.CatalogLesson[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const request = useRef(0) // ignores answers to an older search

  // show the "from my teacher" / "my lessons" tab only when there is something in it
  useEffect(() => {
    if (!userId || practice) {
      setHasTeacherLessons(false)
      setScope('library')
      return
    }
    api
      .lessonCatalog({ scope: 'teacher' }, 0, 1)
      .then((r) => setHasTeacherLessons(r.total > 0))
      .catch(() => setHasTeacherLessons(false))
  }, [userId, practice])

  const filters = (): api.LessonFilters => ({
    scope,
    kind,
    cefr: level ? [level] : undefined,
    skills: practice ? [skill] : FOCUS_SKILLS[focus],
    grammarTopicId: !practice && focus === 'grammar' ? grammar : undefined,
    topic,
    q,
  })

  async function load() {
    const id = ++request.current
    setLoading(true)
    try {
      const page = await api.lessonCatalog(filters(), 0, CATALOG_PAGE)
      if (id !== request.current) return
      setLessons(page.lessons)
      setTotal(page.total)
    } catch {
      if (id === request.current) {
        setLessons([])
        setTotal(0)
      }
    } finally {
      if (id === request.current) setLoading(false)
    }
  }

  async function loadMore() {
    const id = request.current
    setLoadingMore(true)
    try {
      const page = await api.lessonCatalog(filters(), lessons.length, CATALOG_PAGE)
      if (id !== request.current) return
      setLessons((ls) => [...ls, ...page.lessons])
      setTotal(page.total)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0) // debounce typing
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, scope, level, focus, skill, grammar, topic, q, userId, i18n.language])

  const filtered = !!(topic || q.trim() || (focus === 'grammar' && grammar))
  const teacherTabLabel = role === 'student' ? t('library.fromTeacher') : t('teacher.tabs.lessons')
  const pill = (on: boolean) => `rounded-full px-4 py-1.5 transition-colors ${on ? 'bg-plum text-paper' : 'text-mute hover:text-ink'}`
  const chip = (on: boolean) =>
    `rounded-full border px-4 py-1.5 font-body text-sm font-semibold transition-colors ${on ? 'border-plum bg-plum text-paper' : 'border-line bg-paper text-mute hover:border-lavender'}`

  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <h2 className="font-display text-4xl font-semibold">{practice ? t('nav.practice') : t('nav.lessons')}</h2>
      <p className="mt-2 mb-6 text-mute">{practice ? t('library.practiceIntro') : t('library.lessonsIntro')}</p>

      {hasTeacherLessons && (
        <div className="mb-5 inline-flex rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold">
          {(['library', 'teacher'] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} className={pill(scope === s)}>
              {s === 'library' ? t('library.libraryTab') : teacherTabLabel}
            </button>
          ))}
        </div>
      )}

      {/* 1. level */}
      <p className="mb-2 text-sm font-semibold">{t('library.chooseLevel')}</p>
      <div className="mb-5 flex flex-wrap gap-2">
        <button onClick={() => setLevel('')} className={chip(level === '')}>
          {t('dictionary.allLevels')}
        </button>
        {CEFR_LEVELS.map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={chip(level === l)}>
            {l}
          </button>
        ))}
      </div>

      {/* 2. what to learn / which skill */}
      <p className="mb-2 text-sm font-semibold">{practice ? t('library.chooseSkill') : t('library.chooseFocus')}</p>
      <div className="mb-5 inline-flex flex-wrap rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold">
        {practice
          ? api.PRACTICE_SKILLS.map((s) => (
              <button key={s} onClick={() => setSkill(s)} className={pill(skill === s)}>
                {lessonSkillLabel(s)}
              </button>
            ))
          : (['all', 'grammar', 'vocabulary'] as const).map((f) => (
              <button key={f} onClick={() => setFocus(f)} className={pill(focus === f)}>
                {f === 'all' ? t('library.focusAll') : lessonSkillLabel(f)}
              </button>
            ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {!practice && focus === 'grammar' && (
          <select value={grammar} onChange={(e) => setGrammar(e.target.value)} className={`${inputCls} min-w-0 max-w-full`}>
            <option value="">{t('library.allGrammar')}</option>
            {grammarList
              .filter((g) => !level || g.cefr === level)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.cefr} · {api.grammarTitle(g, i18n.language)}
                </option>
              ))}
          </select>
        )}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('library.search')} className={`${inputCls} min-w-0 flex-1`} />
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={inputCls}>
          <option value="">{t('dictionary.allTopics')}</option>
          {TOPICS.map((tp) => (
            <option key={tp} value={tp}>
              {topicLabel(tp)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-mute">{t('common.loading')}</p>
      ) : lessons.length === 0 ? (
        <p className="rounded-3xl border border-dashed border-line bg-paper/60 p-8 text-center text-mute">
          {filtered ? t('library.noResults') : scope === 'teacher' ? t('lessons.none') : practice ? t('library.practiceEmpty') : t('library.empty')}
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-mute">{t('library.count', { count: total })}</p>
          <div className="grid gap-4">
            {lessons.map((l) => (
              <LessonCard key={l.id} lesson={l} grammar={l.grammar_topic_id ? grammarById.get(l.grammar_topic_id) : undefined} progress={progress[l.id]} pass={passes?.[l.id]} onOpen={() => onOpen(l.id)} />
            ))}
          </div>
          {lessons.length < total && (
            <div className="mt-6 flex justify-center">
              <Button variant="soft" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? t('common.loading') : t('dictionary.showMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function LessonCard({
  lesson: l,
  grammar,
  progress: pr,
  pass: s,
  onOpen,
}: {
  lesson: api.CatalogLesson
  grammar?: api.GrammarTopic
  progress?: api.LessonProgress
  pass?: PassSummary
  onOpen: () => void
}) {
  const { t, i18n } = useTranslation()
  const done = pr?.status === 'completed' || !!s?.last
  // last result as N/M; lessons finished before passes existed only have a percent
  const lastResult = s?.last ? `${s.last.correct_count ?? 0}/${s.last.total_count ?? 0}` : pr?.status === 'completed' ? `${pr.score}%` : null
  const open = s?.open
  const practice = l.kind === 'practice'
  const length = practice ? materialLength(l) : ''
  return (
    <button
      onClick={onOpen}
      className={`group flex flex-col gap-3 rounded-3xl border border-line p-6 text-left transition-all hover:border-lavender hover:shadow-[0_16px_40px_-24px_rgba(60,42,112,0.5)] sm:flex-row sm:items-center sm:justify-between ${
        done ? 'bg-paper/70' : 'bg-paper'
      }`}
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`font-display text-2xl font-semibold ${done ? 'text-ink/75' : ''}`}>{l.title}</h3>
          {l.cefr && <Badge>{l.cefr}</Badge>}
          <Badge>{practice && l.material_type ? materialTypeLabel(l.material_type) : lessonSkillLabel(l.skill)}</Badge>
          {l.status !== 'published' && <span className="text-xs text-mute">{t('teacher.draft')}</span>}
          {done && (
            <span className="rounded-full bg-[rgba(63,143,107,.12)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-good)]">
              ✓ {t('lessons.completedBadge')}
            </span>
          )}
        </div>
        {l.description && <p className="mt-1 text-mute">{l.description}</p>}
        {(grammar || l.topic || length) && (
          <p className="mt-1 text-xs text-mute">{[grammar && api.grammarTitle(grammar, i18n.language), l.topic && topicLabel(l.topic), length].filter(Boolean).join(' · ')}</p>
        )}
        {done && lastResult && <p className="mt-1 text-sm font-semibold text-[var(--color-good)]">{t('lessons.lastResult', { result: lastResult })}</p>}
        {open ? (
          <p className="mt-1 text-sm text-plum">
            {done ? t('lessons.newPass') : t('progress.inProgress')} ·{' '}
            {t('lessons.exerciseOf', { n: Math.min(open.current_index + 1, l.exercise_count), total: l.exercise_count })}
          </p>
        ) : (
          !done && pr?.status === 'in_progress' && <p className="mt-1 text-sm text-plum">{t('progress.inProgress')}</p>
        )}
      </div>
      <span className="shrink-0 font-body font-semibold text-plum">
        {practice ? t('practice.questions', { count: l.exercise_count }) : t('lessons.exerciseCount', { count: l.exercise_count })} →
      </span>
    </button>
  )
}
