import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, inputCls } from '../lib/ui'
import { parseExercises, promptText, validateRaw, SKILL_LABEL, type Exercise } from '../lib/exercises'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { Lesson, Profile } from '../lib/api'

const SAMPLE = `fill: I ___ to school every day. = go # Present Simple с I — глагол без окончания.
choice: She ___ a teacher. * is / are / am # Для she/he/it используем is.
listen: door # Прослушай английское слово и запиши его.
dialogue: A: Where are you? >> B: I ___ here. (am) # We use "am" with "I".`

/* ---------- read legacy localStorage lessons ---------- */
type LegacyLesson = { title: string; description?: string; level?: string; exercises?: Exercise[] }
function readLocalLessons(): api.NewLesson[] {
  try {
    const raw = localStorage.getItem('englear-lessons-v1')
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((l: LegacyLesson) => l && l.title && Array.isArray(l.exercises))
      .map((l: LegacyLesson) => ({
        title: l.title,
        description: l.description ?? '',
        level: l.level ?? 'Начальный',
        visibility: 'private' as const,
        is_published: false,
        exercises: l.exercises as Exercise[],
      }))
  } catch {
    return []
  }
}

/* ============================================================
   Teacher Mode — tabs
   ============================================================ */

export function TeacherMode({ lessons, reload }: { lessons: Lesson[]; reload: () => void }) {
  const { userId, role } = useAuth()
  const [tab, setTab] = useState<'lessons' | 'students' | 'progress'>('lessons')
  const mine = lessons.filter((l) => l.author_id === userId || role === 'admin')

  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <h2 className="font-display text-4xl font-semibold">Teacher Mode</h2>
      <div className="mt-5 mb-8 flex flex-wrap gap-2">
        {(['lessons', 'students', 'progress'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-4 py-1.5 font-body font-semibold transition-colors ${
              tab === t ? 'border-plum bg-lilac text-plum-deep' : 'border-line bg-paper text-mute hover:border-lavender'
            }`}
          >
            {t === 'lessons' ? 'Мои уроки' : t === 'students' ? 'Мои ученики' : 'Прогресс'}
          </button>
        ))}
      </div>

      {tab === 'lessons' && <LessonManager lessons={mine} reload={reload} />}
      {tab === 'students' && <StudentManager />}
      {tab === 'progress' && <ProgressBoard lessons={mine} />}
    </section>
  )
}

/* ---------- lessons ---------- */

function LessonManager({ lessons, reload }: { lessons: Lesson[]; reload: () => void }) {
  const { userId, role } = useAuth()
  const [editing, setEditing] = useState<Lesson | 'new' | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const local = useMemo(readLocalLessons, [])

  async function doImport() {
    if (!userId) return
    const res = await api.importLessons(userId, local)
    setImportMsg(`Импортировано: ${res.imported}, пропущено (дубликаты): ${res.skipped}. localStorage сохранён как резерв.`)
    reload()
  }

  if (editing) return <LessonEditor lesson={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setEditing('new')}>+ Новый урок</Button>
        {local.length > 0 && (
          <Button variant="soft" onClick={doImport}>
            Импортировать локальные уроки ({local.length})
          </Button>
        )}
      </div>
      {importMsg && <p className="rounded-xl border border-line bg-paper p-3 text-sm text-mute">{importMsg}</p>}

      <div className="space-y-3">
        {lessons.map((l) => (
          <div key={l.id} className="rounded-2xl border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-lg font-semibold">{l.title}</p>
                  <Badge>{l.visibility}</Badge>
                  {l.is_published ? <Badge>published</Badge> : <span className="text-xs text-mute">черновик</span>}
                </div>
                <p className="text-sm text-mute">
                  {l.exercises.length} заданий · {l.level}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="soft" onClick={() => setEditing(l)}>
                  Редактировать
                </Button>
                <AssignMenu lesson={l} />
                <Button
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${location.origin}/lesson/${l.id}`)
                  }}
                >
                  🔗 Ссылка
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (confirm(`Удалить урок «${l.title}»?`)) {
                      await api.deleteLesson(l.id)
                      reload()
                    }
                  }}
                >
                  Удалить
                </Button>
              </div>
            </div>
          </div>
        ))}
        {lessons.length === 0 && <p className="text-mute">Пока нет уроков. Создайте первый.</p>}
      </div>
      {role === 'admin' && (
        <p className="text-xs text-mute">
          Вы admin: можете делать уроки публичными (доступны по ссылке без входа). Учителя создают только приватные уроки.
        </p>
      )}
    </div>
  )
}

function LessonEditor({ lesson, onClose, onSaved }: { lesson: Lesson | null; onClose: () => void; onSaved: () => void }) {
  const { userId, role } = useAuth()
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [description, setDescription] = useState(lesson?.description ?? '')
  const [level, setLevel] = useState(lesson?.level ?? 'Начальный')
  const [visibility, setVisibility] = useState<'public' | 'private'>(lesson?.visibility ?? (role === 'admin' ? 'public' : 'private'))
  const [published, setPublished] = useState(lesson?.is_published ?? false)
  const [raw, setRaw] = useState(lesson ? serialize(lesson.exercises) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const preview = useMemo(() => parseExercises(raw), [raw])
  const issues = useMemo(() => validateRaw(raw), [raw])
  const valid = title.trim() && preview.length > 0 && issues.length === 0

  async function save() {
    if (!userId || !valid) return
    setSaving(true)
    setErr('')
    try {
      const payload: api.NewLesson = {
        title: title.trim(),
        description: description.trim(),
        level,
        visibility: role === 'admin' ? visibility : 'private',
        is_published: published,
        exercises: preview,
      }
      if (lesson) await api.updateLesson(lesson.id, payload)
      else await api.createLesson(userId, payload)
      onSaved()
    } catch (e: any) {
      setErr(e.message ?? 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <button onClick={onClose} className="font-body text-sm text-mute hover:text-ink">
        ← Назад к урокам
      </button>
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
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

          <div className="flex flex-wrap items-center gap-4">
            {role === 'admin' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={visibility === 'public'} onChange={(e) => setVisibility(e.target.checked ? 'public' : 'private')} />
                Публичный (доступен по ссылке без входа)
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
              Опубликован
            </label>
          </div>

          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={12}
            placeholder="Вставьте задания сюда…"
            className={`${inputCls} w-full font-mono text-sm leading-relaxed`}
          />
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={!valid || saving}>
              {saving ? 'Сохранение…' : 'Сохранить урок'}
            </Button>
            <Button variant="ghost" onClick={() => setRaw(SAMPLE)}>
              Вставить пример
            </Button>
          </div>
          {err && <p className="text-sm text-warn">{err}</p>}

          <details className="rounded-2xl border border-line bg-paper p-4 text-sm text-mute">
            <summary className="cursor-pointer font-semibold text-ink">Как писать задания</summary>
            <div className="mt-3 space-y-2 font-mono text-xs leading-relaxed">
              <p>fill: I ___ home. = go # пояснение</p>
              <p>choice: She ___ here. * is / are / am # пояснение</p>
              <p>listen: door # пояснение (озвучивается только «door»)</p>
              <p>dialogue: A: How are you? &gt;&gt; B: I ___ fine. (am) # пояснение</p>
            </div>
            <p className="mt-3">В диалоге пропуск ___ должен быть только во второй реплике (B).</p>
          </details>
        </div>

        <div className="space-y-4">
          <h3 className="font-display text-xl font-semibold">
            Превью {preview.length ? `· ${preview.length}` : ''}
          </h3>
          {issues.length > 0 && (
            <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
              {issues.map((x, i) => (
                <p key={i}>⚠ {x}</p>
              ))}
            </div>
          )}
          {preview.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line bg-paper/60 p-6 text-center text-sm text-mute">
              Задания появятся здесь по мере ввода.
            </p>
          ) : (
            <div className="space-y-2">
              {preview.map((ex, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-xl border border-line bg-paper p-3 text-sm">
                  <Badge>{SKILL_LABEL[ex.type]}</Badge>
                  <span className="text-ink/80">
                    {ex.type === 'dialogue'
                      ? ex.lines.map((l) => `${l.speaker}: ${l.text}`).join(' · ')
                      : (ex as any).prompt || (ex as any).text}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function serialize(exs: Exercise[]): string {
  return exs
    .map((ex) => {
      const tail = ex.explanation ? ` # ${ex.explanation}` : ''
      if (ex.type === 'fill') return `fill: ${ex.prompt} = ${ex.answer}${tail}`
      if (ex.type === 'listen') return `listen: ${ex.text}${tail}`
      if (ex.type === 'choice')
        return `choice: ${ex.prompt} ${ex.options.map((o) => (o === ex.answer ? `* ${o}` : o)).join(' / ')}${tail}`
      return `dialogue: ${ex.lines
        .map((l) => `${l.speaker}: ${l.answer ? l.text.replace('___', `___ (${l.answer})`) : l.text}`)
        .join(' >> ')}${tail}`
    })
    .join('\n')
}

/* ---------- assign menu ---------- */

function AssignMenu({ lesson }: { lesson: Lesson }) {
  const { userId } = useAuth()
  const [open, setOpen] = useState(false)
  const [students, setStudents] = useState<Profile[]>([])
  const [assigned, setAssigned] = useState<string[]>([])

  useEffect(() => {
    if (!open || !userId) return
    api.myStudents(userId).then(setStudents)
    api.lessonAssignees(lesson.id).then(setAssigned)
  }, [open, userId, lesson.id])

  async function toggle(sid: string) {
    if (!userId) return
    if (assigned.includes(sid)) {
      await api.unassignLesson(lesson.id, sid)
      setAssigned((a) => a.filter((x) => x !== sid))
    } else {
      await api.assignLesson(userId, sid, lesson.id)
      setAssigned((a) => [...a, sid])
    }
  }

  return (
    <div className="relative">
      <Button variant="soft" onClick={() => setOpen((o) => !o)}>
        Назначить
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-line bg-paper p-2 shadow-[0_16px_40px_-24px_rgba(60,42,112,0.6)]">
          {students.length === 0 && <p className="p-2 text-sm text-mute">Нет учеников. Добавьте во вкладке «Мои ученики».</p>}
          {students.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-sm hover:bg-lilac/50">
              <input type="checkbox" checked={assigned.includes(s.id)} onChange={() => toggle(s.id)} />
              {s.full_name || s.id.slice(0, 8)}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- students ---------- */

function StudentManager() {
  const { userId } = useAuth()
  const [students, setStudents] = useState<Profile[]>([])
  const [newId, setNewId] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    if (userId) setStudents(await api.myStudents(userId))
  }
  useEffect(() => {
    load()
  }, [userId])

  async function add() {
    if (!userId || !newId.trim()) return
    try {
      await api.linkStudent(userId, newId.trim())
      setNewId('')
      setMsg('Ученик добавлен.')
      load()
    } catch (e: any) {
      setMsg(e.message ?? 'Не удалось добавить (проверьте ID).')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-mute">Добавьте ученика по его ID (ученик найдёт свой ID в разделе «Прогресс»).</p>
      <div className="flex flex-wrap gap-2">
        <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="ID ученика (uuid)" className={`${inputCls} w-80`} />
        <Button onClick={add}>Добавить</Button>
      </div>
      {msg && <p className="text-sm text-mute">{msg}</p>}
      <div className="space-y-2">
        {students.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4">
            <div>
              <p className="font-body font-semibold">{s.full_name || 'Без имени'}</p>
              <p className="text-xs text-mute">{s.id}</p>
            </div>
            <Button
              variant="danger"
              onClick={async () => {
                if (userId) {
                  await api.unlinkStudent(userId, s.id)
                  load()
                }
              }}
            >
              Убрать
            </Button>
          </div>
        ))}
        {students.length === 0 && <p className="text-mute">Пока нет учеников.</p>}
      </div>
    </div>
  )
}

/* ---------- progress board ---------- */

function ProgressBoard({ lessons }: { lessons: Lesson[] }) {
  const { userId } = useAuth()
  const [students, setStudents] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile | null>(null)

  useEffect(() => {
    if (userId) api.myStudents(userId).then(setStudents)
  }, [userId])

  if (selected) return <StudentDetail student={selected} lessons={lessons} onBack={() => setSelected(null)} />

  return (
    <div className="space-y-3">
      {students.length === 0 && <p className="text-mute">Добавьте учеников, чтобы видеть их прогресс.</p>}
      {students.map((s) => (
        <button
          key={s.id}
          onClick={() => setSelected(s)}
          className="flex w-full items-center justify-between rounded-2xl border border-line bg-paper p-4 text-left hover:border-lavender"
        >
          <span className="font-display text-lg font-semibold">{s.full_name || s.id.slice(0, 8)}</span>
          <span className="text-plum">Открыть →</span>
        </button>
      ))}
    </div>
  )
}

function StudentDetail({ student, lessons, onBack }: { student: Profile; lessons: Lesson[]; onBack: () => void }) {
  const [progress, setProgress] = useState<api.LessonProgress[]>([])
  const [passes, setPasses] = useState<Record<string, api.PassSummary>>({})
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null)
  const [attempts, setAttempts] = useState<any[]>([])
  const [answers, setAnswers] = useState<Record<string, api.SavedAnswer>>({})

  useEffect(() => {
    api.myProgress(student.id).then(setProgress)
    api.studentPasses(student.id).then((p) => setPasses(api.summarizePasses(p))).catch(() => setPasses({}))
  }, [student.id])

  useEffect(() => {
    setAnswers({})
    if (!openLesson) return
    api.studentAttempts(student.id, openLesson.id).then(setAttempts)
    // answers of the last completed pass, or of the pass in progress
    const s = passes[openLesson.id]
    const pass = s?.last ?? s?.open
    if (pass) {
      api
        .passAnswers([pass.id])
        .then((rows) => setAnswers(Object.fromEntries(rows.map((a) => [a.exercise_id, a]))))
        .catch(() => setAnswers({}))
    }
  }, [openLesson, student.id, passes])

  const byLesson = Object.fromEntries(progress.map((p) => [p.lesson_id, p]))

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="font-body text-sm text-mute hover:text-ink">
        ← Все ученики
      </button>
      <h3 className="font-display text-2xl font-semibold">{student.full_name || 'Ученик'}</h3>

      <div className="space-y-2">
        {lessons.map((l) => {
          const p = byLesson[l.id]
          const s = passes[l.id]
          const status = p?.status ?? 'not_started'
          const fmt = (x: api.LessonPass) => `${x.correct_count ?? 0}/${x.total_count ?? 0}`
          return (
            <div key={l.id} className="rounded-2xl border border-line bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-body font-semibold">{l.title}</p>
                  <p className="text-sm text-mute">
                    {status === 'completed'
                      ? s?.last
                        ? `Completed · last ${fmt(s.last)} (${p?.score ?? 0}%) · best ${fmt(s.best ?? s.last)} · passes: ${s.completed} · ${s.last.time_spent_sec}s`
                        : `Completed · ${p?.score ?? 0}% · ${p?.time_spent_sec ?? 0}s`
                      : status === 'in_progress'
                        ? 'In progress'
                        : 'Not started'}
                    {status === 'completed' && s?.open && ' · новое прохождение начато'}
                  </p>
                </div>
                {status !== 'not_started' && (
                  <Button variant="soft" onClick={() => setOpenLesson(openLesson?.id === l.id ? null : l)}>
                    Детали
                  </Button>
                )}
              </div>
              {openLesson?.id === l.id && (
                <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                  {Object.keys(answers).length > 0 && (
                    <>
                      <p className="font-semibold">
                        Ответы {s?.last ? `(прохождение ${s.last.pass_number})` : '(текущее прохождение)'}
                      </p>
                      {l.exercises.map((ex, idx) => {
                        const a = ex.id ? answers[ex.id] : undefined
                        const ok = api.countsAsCorrect(a)
                        return (
                          <p key={ex.id ?? idx} className={!a ? 'text-mute' : ok ? 'text-[var(--color-good)]' : 'text-warn'}>
                            {idx + 1}. {promptText(ex)} — {a ? `${ok ? '✓' : '✗'} «${a.given_answer || '—'}»` : 'нет ответа'}
                            {a && (
                              <span className="text-mute">
                                {' '}
                                · {a.checked ? `проверено (${a.attempts_count})` : 'не проверено'}
                              </span>
                            )}
                          </p>
                        )
                      })}
                      <p className="pt-2 font-semibold">История проверок</p>
                    </>
                  )}
                  {attempts.length === 0 && <p className="text-mute">Нет попыток.</p>}
                  {attempts.map((a, i) => (
                    <p key={i} className={a.is_correct ? 'text-[var(--color-good)]' : 'text-warn'}>
                      {a.is_correct ? '✓' : '✗'} попытка {a.attempt_number}: «{a.given_answer || '—'}»
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
