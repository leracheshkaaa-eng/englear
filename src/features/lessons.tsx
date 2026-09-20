import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, TranslatableText, inputCls } from '../lib/ui'
import { speak } from '../lib/supabase'
import { norm, SKILL_LABEL, type Exercise } from '../lib/exercises'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { Lesson, Word } from '../lib/api'

function plural(n: number, forms: [string, string, string]) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return forms[0]
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1]
  return forms[2]
}

function Verdict({ correct, explanation, answer }: { correct: boolean; explanation: string; answer?: string }) {
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
        <p className="font-semibold">✓ Верно! Отличная работа.</p>
      ) : (
        <>
          <p className="font-semibold">✗ Пока не так.</p>
          {answer && (
            <p className="mt-1 text-ink/80">
              Правильный ответ: <b>{answer}</b>
            </p>
          )}
          {explanation && <p className="mt-1 text-ink/70">💬 {explanation}</p>}
        </>
      )}
    </div>
  )
}

/** One exercise. Behaviour, checking, explanations and TTS preserved. */
export function ExerciseView({
  ex,
  dict,
  translations,
  onResult,
}: {
  ex: Exercise
  dict: Map<string, Word>
  translations: boolean
  onResult?: (isCorrect: boolean, given: string) => void
}) {
  const [checked, setChecked] = useState(false)
  const [correct, setCorrect] = useState(false)
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [blanks, setBlanks] = useState<Record<number, string>>({})

  const T = (t: string) => <TranslatableText text={t} dict={dict} enabled={translations} />

  function check() {
    let ok = false
    let given = ''
    if (ex.type === 'fill') {
      ok = norm(text) === norm(ex.answer)
      given = text
    } else if (ex.type === 'listen') {
      ok = norm(text) === norm(ex.text)
      given = text
    } else if (ex.type === 'choice') {
      ok = picked === ex.answer
      given = picked ?? ''
    } else {
      ok = ex.lines.every((l, i) => !l.answer || norm(blanks[i] || '') === norm(l.answer))
      given = Object.values(blanks).join(', ')
    }
    setCorrect(ok)
    setChecked(true)
    onResult?.(ok, given)
  }

  const canCheck =
    ex.type === 'choice'
      ? picked !== null
      : ex.type === 'dialogue'
        ? ex.lines.every((l, i) => !l.answer || (blanks[i] || '').trim())
        : text.trim().length > 0

  return (
    <div className="rounded-3xl border border-line bg-paper p-6 shadow-[0_10px_30px_-18px_rgba(60,42,112,0.5)] sm:p-8">
      <Badge>{SKILL_LABEL[ex.type]}</Badge>

      {ex.type === 'fill' && (
        <div className="mt-5">
          <p className="font-display text-2xl leading-snug">{T(ex.prompt.replace('___', '_____'))}</p>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Впиши слово"
            className={`${inputCls} mt-4 w-full sm:w-72`}
            onKeyDown={(e) => e.key === 'Enter' && canCheck && check()}
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
          <p className="text-mute">Прослушай слово и запиши его по-английски.</p>
          <button
            onClick={() => speak(ex.text)}
            className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-line bg-lilac px-5 py-4 font-body font-semibold text-plum-deep transition-colors hover:bg-lavender/40"
          >
            <span className="grid h-10 w-10 place-items-center rounded-full bg-plum text-paper">▶</span>
            Прослушать
          </button>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Запиши, что услышал(а)"
            className={`${inputCls} mt-4 block w-full`}
            onKeyDown={(e) => e.key === 'Enter' && canCheck && check()}
          />
        </div>
      )}

      {ex.type === 'dialogue' && (
        <div className="mt-5 space-y-3">
          <p className="text-mute">Прочитай диалог и заполни пропуск во второй реплике.</p>
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
                  aria-label="Прослушать реплику"
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
        <Button onClick={check} disabled={!canCheck || (checked && correct)}>
          Проверить
        </Button>
        {checked && !correct && (
          <Button
            variant="ghost"
            onClick={() => {
              setChecked(false)
              setText('')
              setPicked(null)
              setBlanks({})
            }}
          >
            Ещё раз
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

/** Lesson player. Records progress + attempts for signed-in students. */
export function LessonPlayer({
  lesson,
  dict,
  onDone,
}: {
  lesson: Lesson
  dict: Map<string, Word>
  onDone: () => void
}) {
  const { userId, role, settings } = useAuth()
  const [i, setI] = useState(0)
  const ex = lesson.exercises[i]
  const progress = ((i + 1) / lesson.exercises.length) * 100

  const startedAt = useRef(Date.now())
  const rows = useRef<{ id: string; position: number }[]>([])
  const attemptCount = useRef<Record<number, number>>({})
  const firstCorrect = useRef<Record<number, boolean>>({})

  const isStudent = !!userId // guests just practice; nothing saved

  useEffect(() => {
    if (!isStudent) return
    startedAt.current = Date.now()
    api.startLesson(userId!, lesson.id).catch(() => {})
    api.getExerciseRows(lesson.id).then((r) => (rows.current = r)).catch(() => {})
  }, [lesson.id, isStudent, userId])

  async function handleResult(isCorrect: boolean, given: string) {
    if (!isStudent) return
    const n = (attemptCount.current[i] = (attemptCount.current[i] ?? 0) + 1)
    if (firstCorrect.current[i] === undefined) firstCorrect.current[i] = isCorrect
    const row = rows.current.find((r) => r.position === i)
    if (row) {
      api
        .recordAttempt({
          studentId: userId!,
          lessonId: lesson.id,
          exerciseId: row.id,
          attemptNumber: n,
          givenAnswer: given,
          isCorrect,
        })
        .catch(() => {})
    }
  }

  async function finish() {
    if (isStudent) {
      const total = lesson.exercises.length
      const correct = Object.values(firstCorrect.current).filter(Boolean).length
      const score = total ? Math.round((correct / total) * 100) : 0
      const secs = Math.round((Date.now() - startedAt.current) / 1000)
      await api.completeLesson(userId!, lesson.id, score, secs).catch(() => {})
    }
    onDone()
  }

  return (
    <section className="mx-auto max-w-2xl px-6 pb-24">
      <button onClick={onDone} className="mb-4 font-body text-sm text-mute hover:text-ink">
        ← Все уроки
      </button>
      <div className="flex items-center gap-2">
        <h2 className="font-display text-3xl font-semibold">{lesson.title}</h2>
        {lesson.visibility === 'private' && <Badge>приватный</Badge>}
      </div>
      {!isStudent && (
        <p className="mt-2 text-sm text-mute">Вы не вошли — прогресс не сохранится. Войдите, чтобы отслеживать результаты.</p>
      )}
      <div className="my-5 h-2 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full bg-plum transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <ExerciseView key={`${lesson.id}-${i}`} ex={ex} dict={dict} translations={settings.translations_enabled && role !== 'guest'} onResult={handleResult} />

      <div className="mt-6 flex items-center justify-between">
        <Button variant="soft" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>
          ← Назад
        </Button>
        <span className="font-body text-sm text-mute">
          {i + 1} / {lesson.exercises.length}
        </span>
        {i === lesson.exercises.length - 1 ? (
          <Button onClick={finish}>Завершить ✓</Button>
        ) : (
          <Button onClick={() => setI((v) => Math.min(lesson.exercises.length - 1, v + 1))}>Далее →</Button>
        )}
      </div>
    </section>
  )
}

/** Catalog of lessons the current viewer can see (RLS-filtered). */
export function LessonsCatalog({
  lessons,
  progress,
  onOpen,
}: {
  lessons: Lesson[]
  progress: Record<string, api.LessonProgress>
  onOpen: (l: Lesson) => void
}) {
  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <h2 className="mb-8 font-display text-4xl font-semibold">Уроки</h2>
      {lessons.length === 0 && <p className="text-mute">Пока нет доступных уроков.</p>}
      <div className="grid gap-4">
        {lessons.map((l) => {
          const skills = Array.from(new Set(l.exercises.map((e) => SKILL_LABEL[e.type])))
          const pr = progress[l.id]
          return (
            <button
              key={l.id}
              onClick={() => onOpen(l)}
              className="group flex flex-col gap-3 rounded-3xl border border-line bg-paper p-6 text-left transition-all hover:border-lavender hover:shadow-[0_16px_40px_-24px_rgba(60,42,112,0.5)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-2xl font-semibold">{l.title}</h3>
                  <Badge>{l.level}</Badge>
                  {l.visibility === 'public' ? <Badge>public</Badge> : <Badge>private</Badge>}
                  {pr?.status === 'completed' && (
                    <span className="rounded-full bg-[rgba(63,143,107,.12)] px-2.5 py-0.5 text-xs font-semibold text-[var(--color-good)]">
                      ✓ {pr.score}%
                    </span>
                  )}
                </div>
                <p className="mt-1 text-mute">{l.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {skills.map((s) => (
                    <span key={s} className="rounded-full border border-line px-2.5 py-0.5 font-body text-xs text-mute">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <span className="shrink-0 font-body font-semibold text-plum">
                {l.exercises.length} {plural(l.exercises.length, ['задание', 'задания', 'заданий'])} →
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export { plural }
