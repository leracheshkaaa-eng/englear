import { useEffect, useMemo, useState } from 'react'

/* ============================================================
   Englear — семейная практика английского
   Упражнения: вставить слово, выбор, аудирование, диалог.
   Учитель вставляет задания простым текстом → они сами
   превращаются в упражнения с проверкой и пояснениями.
   ============================================================ */

/* ---------- модель ---------- */

type Fill = { type: 'fill'; prompt: string; answer: string; explanation: string }
type Choice = { type: 'choice'; prompt: string; options: string[]; answer: string; explanation: string }
type Listen = { type: 'listen'; text: string; explanation: string }
type DlgLine = { speaker: string; text: string; answer?: string }
type Dialogue = { type: 'dialogue'; lines: DlgLine[]; explanation: string }
type Exercise = Fill | Choice | Listen | Dialogue

type Lesson = {
  id: string
  title: string
  level: string
  description: string
  exercises: Exercise[]
}

const STORAGE_KEY = 'englear-lessons-v1'

/* ---------- парсер заданий учителя ----------
   Каждая строка — одно задание:
     fill:     I ___ to school every day. = go # Present Simple: go.
     choice:   She ___ a doctor. * is / are / am # is для she/he/it.
     listen:   The weather is lovely today. # Слушай окончания слов.
     dialogue: A: Hi, how ___ you? (are) >> B: I'm great! # Глагол to be.
   После # — пояснение (появится при ошибке). Оно необязательно.
--------------------------------------------------------------- */

function parseExercises(raw: string): Exercise[] {
  const out: Exercise[] = []
  for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^(fill|choice|listen|dialogue)\s*:\s*(.*)$/i)
    if (!m) continue
    const type = m[1].toLowerCase()
    let body = m[2]

    let explanation = ''
    const hash = body.indexOf('#')
    if (hash !== -1) {
      explanation = body.slice(hash + 1).trim()
      body = body.slice(0, hash).trim()
    }

    if (type === 'fill') {
      const [prompt, answer = ''] = body.split('=').map((s) => s.trim())
      if (prompt) out.push({ type: 'fill', prompt, answer, explanation })
    } else if (type === 'listen') {
      if (body) out.push({ type: 'listen', text: body, explanation })
    } else if (type === 'choice') {
      const eq = body.indexOf('?')
      // разрешаем и "prompt ? opt / opt" и "prompt * opt / opt"
      let prompt = body
      let optsRaw = ''
      const slash = body.indexOf('/')
      // берём последнюю часть предложения как список опций после первого '*' или после '?'
      const starIdx = body.indexOf('*')
      const cut = starIdx !== -1 ? starIdx : eq !== -1 ? eq + 1 : slash
      if (cut > 0) {
        prompt = body.slice(0, cut).replace(/[?*]\s*$/, '').trim()
        optsRaw = body.slice(cut).trim()
      }
      let answer = ''
      const options = optsRaw
        .split('/')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => {
          if (o.startsWith('*')) {
            answer = o.slice(1).trim()
            return answer
          }
          return o
        })
      if (prompt && options.length) out.push({ type: 'choice', prompt, options, answer, explanation })
    } else if (type === 'dialogue') {
      const lines: DlgLine[] = body
        .split('>>')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((seg) => {
          const cm = seg.match(/^([^:]+):\s*(.*)$/)
          const speaker = cm ? cm[1].trim() : ''
          let text = cm ? cm[2].trim() : seg
          const am = text.match(/\(([^)]+)\)/)
          const answer = am ? am[1].trim() : undefined
          if (answer) text = text.replace(/\s*\([^)]+\)/, '').trim()
          return { speaker, text, answer }
        })
      if (lines.length) out.push({ type: 'dialogue', lines, explanation })
    }
  }
  return out
}

/* ---------- сид-уроки ---------- */

const SAMPLE = `fill: I ___ to school every day. = go # Present Simple с I — глагол без окончания.
choice: She ___ a teacher. * is / are / am # Для she/he/it используем is.
listen: The weather is lovely today. # Слушай окончания слов -s и -ly.
dialogue: A: Hi, how ___ you? (are) >> B: I'm great, ___ you? (and) >> A: I'm fine too! # Глагол to be и союз and.`

const SEED: Lesson[] = [
  {
    id: 'daily',
    title: 'Каждый день',
    level: 'Начальный',
    description: 'Present Simple, привычные действия и короткий диалог.',
    exercises: parseExercises(SAMPLE),
  },
  {
    id: 'family',
    title: 'Моя семья',
    level: 'Начальный',
    description: 'Слова о близких и притяжательные формы.',
    exercises: parseExercises(`fill: This is ___ mother. She is kind. = my # my — притяжательное для I.
choice: My parents ___ at home now. * are / is / am # parents — множественное число.
listen: We are a happy family. # Обрати внимание на слово are.
dialogue: A: Who is ___? (this) >> B: This is my little brother. # this для того, кто рядом.`),
  },
  {
    id: 'cafe',
    title: 'В кафе',
    level: 'Средний',
    description: 'Вежливые просьбы и заказ еды.',
    exercises: parseExercises(`choice: ___ I have a menu, please? * Could / Do / Am # Could — вежливая просьба.
fill: I would ___ a cup of tea. = like # would like — «я бы хотел».
listen: Here is your order, enjoy your meal. # Слушай фразу enjoy your meal.
dialogue: A: Are you ready to ___? (order) >> B: Yes, a coffee please. # to order — сделать заказ.`),
  },
]

function loadLessons(): Lesson[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const clean = parsed
          .filter((l) => l && typeof l.id === 'string')
          .map((l) => ({ ...l, exercises: Array.isArray(l.exercises) ? l.exercises : [] }))
        if (clean.length) return clean as Lesson[]
      }
    }
  } catch {
    /* ignore */
  }
  return SEED
}

/* ---------- утилиты ---------- */

function norm(s: string) {
  return s.trim().toLowerCase().replace(/[.,!?;:]+$/g, '')
}

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = 0.9
  window.speechSynthesis.speak(u)
}

function plural(n: number, forms: [string, string, string]) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return forms[0]
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1]
  return forms[2]
}

const SKILL_LABEL: Record<Exercise['type'], string> = {
  fill: 'Грамматика',
  choice: 'Выбор',
  listen: 'Аудирование',
  dialogue: 'Диалог',
}

/* ---------- базовые элементы ---------- */

function Button({
  children,
  onClick,
  variant = 'solid',
  className = '',
  type = 'button',
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'solid' | 'soft' | 'ghost'
  className?: string
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  const styles =
    variant === 'solid'
      ? 'bg-plum text-paper hover:bg-plum-deep'
      : variant === 'soft'
        ? 'bg-lilac text-plum-deep hover:bg-lavender/40'
        : 'text-mute hover:text-ink'
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-body font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-plum/20 ${styles} ${className}`}
    >
      {children}
    </button>
  )
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

const inputCls =
  'rounded-xl border border-line bg-paper px-3 py-2 font-body text-ink outline-none focus:border-plum focus:ring-4 focus:ring-plum/15'

/* ---------- проигрыватель одного упражнения ---------- */

function ExerciseView({ ex }: { ex: Exercise }) {
  const [checked, setChecked] = useState(false)
  const [correct, setCorrect] = useState(false)

  // fill / listen
  const [text, setText] = useState('')
  // choice
  const [picked, setPicked] = useState<string | null>(null)
  // dialogue
  const [blanks, setBlanks] = useState<Record<number, string>>({})

  function check() {
    let ok = false
    if (ex.type === 'fill') ok = norm(text) === norm(ex.answer)
    else if (ex.type === 'listen') ok = norm(text) === norm(ex.text)
    else if (ex.type === 'choice') ok = picked === ex.answer
    else ok = ex.lines.every((l, i) => !l.answer || norm(blanks[i] || '') === norm(l.answer))
    setCorrect(ok)
    setChecked(true)
  }

  const canCheck =
    ex.type === 'choice'
      ? picked !== null
      : ex.type === 'dialogue'
        ? ex.lines.every((l, i) => !l.answer || (blanks[i] || '').trim())
        : text.trim().length > 0

  return (
    <div className="rounded-3xl border border-line bg-paper p-6 shadow-[0_10px_30px_-18px_rgba(60,42,112,0.5)] sm:p-8">
      <span className="inline-block rounded-full bg-lilac px-3 py-1 font-body text-xs font-semibold uppercase tracking-wide text-plum-deep">
        {SKILL_LABEL[ex.type]}
      </span>

      {/* FILL */}
      {ex.type === 'fill' && (
        <div className="mt-5">
          <p className="font-display text-2xl leading-snug">{ex.prompt.replace('___', '_____')}</p>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Впиши слово"
            className={`${inputCls} mt-4 w-full sm:w-72`}
            onKeyDown={(e) => e.key === 'Enter' && canCheck && check()}
          />
        </div>
      )}

      {/* CHOICE */}
      {ex.type === 'choice' && (
        <div className="mt-5">
          <p className="font-display text-2xl leading-snug">{ex.prompt.replace('___', '_____')}</p>
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

      {/* LISTEN */}
      {ex.type === 'listen' && (
        <div className="mt-5">
          <p className="text-mute">Прослушай фразу и запиши её по-английски.</p>
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

      {/* DIALOGUE */}
      {ex.type === 'dialogue' && (
        <div className="mt-5 space-y-3">
          <p className="text-mute">Прочитай диалог и заполни пропуски. Нажми ▶, чтобы услышать реплику.</p>
          {ex.lines.map((l, i) => {
            const parts = l.text.split('___')
            return (
              <div key={i} className="flex gap-3 rounded-2xl bg-sand/70 p-3">
                <span className="mt-1 shrink-0 font-display font-semibold text-plum">{l.speaker}</span>
                <p className="flex flex-1 flex-wrap items-center gap-1 font-body text-lg leading-relaxed">
                  {parts[0]}
                  {l.answer !== undefined && (
                    <input
                      value={blanks[i] || ''}
                      onChange={(e) => setBlanks((b) => ({ ...b, [i]: e.target.value }))}
                      className={`${inputCls} mx-1 w-28 py-1`}
                      placeholder="…"
                    />
                  )}
                  {parts[1] || ''}
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
          answer={ex.type === 'fill' ? ex.answer : ex.type === 'choice' ? ex.answer : ex.type === 'listen' ? ex.text : undefined}
        />
      )}
    </div>
  )
}

/* ---------- экраны ---------- */

function Home({ onStart, onTeacher, count }: { onStart: () => void; onTeacher: () => void; count: number }) {
  return (
    <section className="mx-auto max-w-3xl px-6 pt-20 pb-24 text-center">
      <span className="inline-block rounded-full border border-line bg-paper px-4 py-1 font-body text-sm text-mute">
        английский всей семьёй
      </span>
      <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] sm:text-7xl">
        Учитесь спокойно,
        <br />
        <span className="italic text-plum">шаг за шагом</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-lg text-mute">
        Полноценные упражнения на все навыки: вставить слово, выбрать вариант, послушать и разобрать
        диалог. Одна кнопка — и вы на уроке.
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button onClick={onStart} className="px-8 py-4 text-lg">
          Начать урок
        </Button>
        <Button variant="ghost" onClick={onTeacher}>
          Режим учителя →
        </Button>
      </div>
      <p className="mt-6 font-body text-sm text-mute/80">
        Сейчас доступно {count} {plural(count, ['урок', 'урока', 'уроков'])}
      </p>
    </section>
  )
}

function Lessons({ lessons, onOpen }: { lessons: Lesson[]; onOpen: (l: Lesson) => void }) {
  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <h2 className="mb-8 font-display text-4xl font-semibold">Уроки</h2>
      <div className="grid gap-4">
        {lessons.map((l) => {
          const skills = Array.from(new Set(l.exercises.map((e) => SKILL_LABEL[e.type])))
          return (
            <button
              key={l.id}
              onClick={() => onOpen(l)}
              className="group flex flex-col gap-3 rounded-3xl border border-line bg-paper p-6 text-left transition-all hover:border-lavender hover:shadow-[0_16px_40px_-24px_rgba(60,42,112,0.5)] sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="font-display text-2xl font-semibold">{l.title}</h3>
                  <span className="rounded-full bg-lilac px-2.5 py-0.5 font-body text-xs font-semibold text-plum-deep">
                    {l.level}
                  </span>
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

function Practice({ lesson, onDone }: { lesson: Lesson; onDone: () => void }) {
  const [i, setI] = useState(0)
  const ex = lesson.exercises[i]
  const progress = ((i + 1) / lesson.exercises.length) * 100

  return (
    <section className="mx-auto max-w-2xl px-6 pb-24">
      <button onClick={onDone} className="mb-4 font-body text-sm text-mute hover:text-ink">
        ← Все уроки
      </button>
      <h2 className="font-display text-3xl font-semibold">{lesson.title}</h2>
      <div className="my-5 h-2 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full bg-plum transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <ExerciseView key={`${lesson.id}-${i}`} ex={ex} />

      <div className="mt-6 flex items-center justify-between">
        <Button variant="soft" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>
          ← Назад
        </Button>
        <span className="font-body text-sm text-mute">
          {i + 1} / {lesson.exercises.length}
        </span>
        {i === lesson.exercises.length - 1 ? (
          <Button onClick={onDone}>Завершить ✓</Button>
        ) : (
          <Button onClick={() => setI((v) => Math.min(lesson.exercises.length - 1, v + 1))}>Далее →</Button>
        )}
      </div>
    </section>
  )
}

function Teacher({
  lessons,
  onAdd,
  onDelete,
}: {
  lessons: Lesson[]
  onAdd: (l: Lesson) => void
  onDelete: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState('Начальный')
  const [description, setDescription] = useState('')
  const [raw, setRaw] = useState('')

  const preview = useMemo(() => parseExercises(raw), [raw])
  const valid = title.trim() && preview.length > 0

  function save() {
    if (!valid) return
    onAdd({
      id: `l-${Date.now()}`,
      title: title.trim(),
      level,
      description: description.trim() || 'Урок от учителя.',
      exercises: preview,
    })
    setTitle('')
    setDescription('')
    setRaw('')
  }

  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <h2 className="font-display text-4xl font-semibold">Режим учителя</h2>
      <p className="mt-2 max-w-2xl text-mute">
        Вставьте задания текстом — Englear сам соберёт из них упражнения с кнопкой проверки. После{' '}
        <code className="rounded bg-lilac px-1">#</code> напишите пояснение: оно покажется, если ответ неверный.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название урока" className={`${inputCls} w-full`} />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание" className={`${inputCls} w-full`} />
          </div>
          <div className="flex flex-wrap gap-2">
            {['Начальный', 'Средний', 'Продвинутый'].map((lv) => (
              <button
                key={lv}
                onClick={() => setLevel(lv)}
                className={`rounded-full border px-4 py-1.5 font-body font-semibold transition-colors ${
                  level === lv ? 'border-plum bg-lilac text-plum-deep' : 'border-line bg-paper text-mute hover:border-lavender'
                }`}
              >
                {lv}
              </button>
            ))}
          </div>

          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={12}
            placeholder="Вставьте задания сюда…"
            className={`${inputCls} w-full font-mono text-sm leading-relaxed`}
          />

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={!valid}>
              Сохранить урок
            </Button>
            <Button variant="ghost" onClick={() => setRaw(SAMPLE)}>
              Вставить пример
            </Button>
          </div>

          <details className="rounded-2xl border border-line bg-paper p-4 text-sm text-mute">
            <summary className="cursor-pointer font-semibold text-ink">Как писать задания</summary>
            <div className="mt-3 space-y-2 font-mono text-xs leading-relaxed">
              <p>fill: I ___ home. = go # пояснение</p>
              <p>choice: She ___ here. * is / are / am # пояснение</p>
              <p>listen: Nice to meet you. # пояснение</p>
              <p>dialogue: A: How ___ you? (are) &gt;&gt; B: Fine! # пояснение</p>
            </div>
            <p className="mt-3">
              <code>___</code> — пропуск, <code>=</code> — ответ, <code>*</code> — верный вариант,{' '}
              <code>/</code> — разделяет варианты, <code>&gt;&gt;</code> — реплики диалога, <code>(...)</code> —
              ответ в диалоге, <code>#</code> — ваше пояснение при ошибке.
            </p>
          </details>
        </div>

        {/* превью + список */}
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 font-display text-xl font-semibold">
              Превью {preview.length ? `· ${preview.length} ${plural(preview.length, ['задание', 'задания', 'заданий'])}` : ''}
            </h3>
            {preview.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line bg-paper/60 p-6 text-center text-sm text-mute">
                Задания появятся здесь по мере ввода.
              </p>
            ) : (
              <div className="space-y-2">
                {preview.map((ex, idx) => (
                  <div key={idx} className="flex items-start gap-2 rounded-xl border border-line bg-paper p-3 text-sm">
                    <span className="rounded-full bg-lilac px-2 py-0.5 text-xs font-semibold text-plum-deep">
                      {SKILL_LABEL[ex.type]}
                    </span>
                    <span className="text-ink/80">
                      {ex.type === 'dialogue' ? ex.lines.map((l) => `${l.speaker}: ${l.text}`).join(' · ') : (ex as any).prompt || (ex as any).text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 font-display text-xl font-semibold">Все уроки</h3>
            <div className="space-y-2">
              {lessons.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4">
                  <div className="min-w-0">
                    <p className="truncate font-body font-semibold">{l.title}</p>
                    <p className="text-sm text-mute">
                      {l.level} · {l.exercises.length} {plural(l.exercises.length, ['задание', 'задания', 'заданий'])}
                    </p>
                  </div>
                  <button
                    onClick={() => onDelete(l.id)}
                    aria-label={`Удалить урок ${l.title}`}
                    className="rounded-full border border-line px-3 py-1 font-body text-sm text-mute hover:border-warn hover:text-warn"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------- корень ---------- */

type View = 'home' | 'lessons' | 'practice' | 'teacher'

export default function App() {
  const [view, setView] = useState<View>('home')
  const [lessons, setLessons] = useState<Lesson[]>(loadLessons)
  const [active, setActive] = useState<Lesson | null>(null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lessons))
  }, [lessons])

  const activeLesson = useMemo(() => lessons.find((l) => l.id === active?.id) ?? active, [lessons, active])

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <button onClick={() => setView('home')} className="flex items-center gap-2 font-display text-2xl font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-plum text-paper">E</span>
          Englear
        </button>
        <nav className="flex items-center gap-1 rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold">
          <NavBtn active={view === 'home'} onClick={() => setView('home')}>
            Главная
          </NavBtn>
          <NavBtn active={view === 'lessons' || view === 'practice'} onClick={() => setView('lessons')}>
            Уроки
          </NavBtn>
          <NavBtn active={view === 'teacher'} onClick={() => setView('teacher')}>
            Учитель
          </NavBtn>
        </nav>
      </header>

      <main>
        {view === 'home' && (
          <Home onStart={() => setView('lessons')} onTeacher={() => setView('teacher')} count={lessons.length} />
        )}
        {view === 'lessons' && (
          <Lessons
            lessons={lessons}
            onOpen={(l) => {
              setActive(l)
              setView('practice')
            }}
          />
        )}
        {view === 'practice' && activeLesson && <Practice lesson={activeLesson} onDone={() => setView('lessons')} />}
        {view === 'teacher' && (
          <Teacher
            lessons={lessons}
            onAdd={(l) => setLessons((ls) => [l, ...ls])}
            onDelete={(id) => setLessons((ls) => ls.filter((l) => l.id !== id))}
          />
        )}
      </main>
    </div>
  )
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 transition-colors ${active ? 'bg-plum text-paper' : 'text-mute hover:text-ink'}`}
    >
      {children}
    </button>
  )
}
