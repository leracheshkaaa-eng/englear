import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, inputCls } from '../lib/ui'
import { correctAnswerText, parseExercises, promptText, skillLabel, validateRaw, type Exercise } from '../lib/exercises'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { Lesson, LessonSummary, Profile } from '../lib/api'
import { CEFR_LEVELS, TOPICS, lessonLevelCode, lessonSkillLabel, topicLabel } from '../lib/config'
import { errorMessage } from '../i18n/errors'
import { lessonWords } from './lessons'
import { TeacherSets } from './teacherSets'
import { materialTypeLabel } from './practice'

const LEGACY_CEFR = { beginner: 'A1', intermediate: 'B1', advanced: 'C1' } as const

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
        cefr: LEGACY_CEFR[lessonLevelCode(l.level)],
        skill: 'mixed' as const,
        topic: null,
        scope: 'teacher' as const,
        status: 'draft' as const,
        sequence: 0,
        exercises: l.exercises as Exercise[],
      }))
  } catch {
    return []
  }
}

/* ============================================================
   Teacher Mode — tabs
   ============================================================ */

export function TeacherMode({ reload }: { reload: () => void }) {
  const { t } = useTranslation()
  const { userId, role } = useAuth()
  const [tab, setTab] = useState<'lessons' | 'cards' | 'students' | 'progress'>('lessons')
  const [lessons, setLessons] = useState<LessonSummary[]>([])

  // own lessons (an admin: all lessons, library + teacher)
  const refresh = useCallback(async () => {
    if (!userId) return
    setLessons(await api.teacherLessons(userId, role === 'admin').catch(() => []))
  }, [userId, role])
  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <h2 className="font-display text-4xl font-semibold">{t('teacher.title')}</h2>
      <div className="mt-5 mb-8 flex flex-wrap gap-2">
        {(['lessons', 'cards', 'students', 'progress'] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`rounded-full border px-4 py-1.5 font-body font-semibold transition-colors ${
              tab === tb ? 'border-plum bg-lilac text-plum-deep' : 'border-line bg-paper text-mute hover:border-lavender'
            }`}
          >
            {t(`teacher.tabs.${tb}`)}
          </button>
        ))}
      </div>

      {tab === 'lessons' && <LessonManager lessons={lessons} reload={() => { refresh(); reload() }} />}
      {tab === 'cards' && <TeacherSets />}
      {tab === 'students' && <StudentManager />}
      {tab === 'progress' && <ProgressBoard lessons={lessons} />}
    </section>
  )
}

/* ---------- lessons ---------- */

function LessonManager({ lessons, reload }: { lessons: LessonSummary[]; reload: () => void }) {
  const { t } = useTranslation()
  const { userId, role } = useAuth()
  const [editing, setEditing] = useState<Lesson | 'new' | null>(null)
  const [opening, setOpening] = useState<string | null>(null)
  const [importMsg, setImportMsg] = useState('')
  const local = useMemo(readLocalLessons, [])

  async function doImport() {
    if (!userId) return
    const res = await api.importLessons(userId, local)
    setImportMsg(t('teacher.importResult', { imported: res.imported, skipped: res.skipped }))
    reload()
  }

  async function edit(id: string) {
    setOpening(id)
    try {
      const full = await api.getLesson(id, { withSolutions: true })
      if (full) setEditing(full)
    } finally {
      setOpening(null)
    }
  }

  if (editing) return <LessonEditor lesson={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setEditing('new')}>{t('teacher.newLesson')}</Button>
        {local.length > 0 && (
          <Button variant="soft" onClick={doImport}>
            {t('teacher.importLocal', { count: local.length })}
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
                  {role === 'admin' && <Badge>{l.scope === 'library' ? t('teacher.libraryBadge') : t('teacher.teacherBadge')}</Badge>}
                  {l.status === 'published' ? <Badge>{t('teacher.published')}</Badge> : <span className="text-xs text-mute">{t('teacher.draft')}</span>}
                </div>
                <p className="text-sm text-mute">
                  {[l.cefr, lessonSkillLabel(l.skill), l.topic && topicLabel(l.topic), t('lessons.exerciseCount', { count: l.exercise_count })]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={l.status === 'published' ? 'ghost' : 'solid'}
                  onClick={async () => {
                    // only the status changes — the lesson and its exercises stay as they are
                    await api.updateLesson(l.id, { status: l.status === 'published' ? 'draft' : 'published' })
                    reload()
                  }}
                >
                  {l.status === 'published' ? t('teacher.unpublish') : t('teacher.publish')}
                </Button>
                <Button variant="soft" onClick={() => edit(l.id)} disabled={opening === l.id}>
                  {opening === l.id ? t('common.loading') : t('common.edit')}
                </Button>
                <AssignMenu lesson={l} />
                <Button
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(`${location.origin}/lesson/${l.id}`)
                  }}
                >
                  🔗 {t('teacher.link')}
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (confirm(t('teacher.confirmDelete', { title: l.title }))) {
                      await api.deleteLesson(l.id)
                      reload()
                    }
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          </div>
        ))}
        {lessons.length === 0 && <p className="text-mute">{t('teacher.noLessons')}</p>}
      </div>
    </div>
  )
}

const chipCls = (on: boolean) =>
  `rounded-full border px-4 py-1.5 font-body font-semibold transition-colors ${
    on ? 'border-plum bg-lilac text-plum-deep' : 'border-line bg-paper text-mute hover:border-lavender'
  }`

function LessonEditor({ lesson, onClose, onSaved }: { lesson: Lesson | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const { userId, role } = useAuth()
  const isAdmin = role === 'admin'
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [description, setDescription] = useState(lesson?.description ?? '')
  const [cefr, setCefr] = useState<string>(lesson?.cefr ?? 'A1')
  const [skill, setSkill] = useState<api.LessonSkill>(lesson?.skill ?? 'mixed')
  const [topic, setTopic] = useState(lesson?.topic ?? '')
  const [library, setLibrary] = useState(lesson ? lesson.scope === 'library' : false)
  const [sequence, setSequence] = useState(lesson?.sequence ?? 0)
  const [published, setPublished] = useState(lesson ? lesson.status === 'published' : false)
  const [raw, setRaw] = useState(lesson ? serialize(lesson.exercises) : '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // Practice (admin): the lesson is a reading text / listening script with questions
  const [kind, setKind] = useState<api.LessonKind>(lesson?.kind ?? 'lesson')
  const [materialType, setMaterialType] = useState<api.MaterialType>('article')
  const [materialText, setMaterialText] = useState('') // reading: paragraphs; listening: "Speaker: line" per line
  const practiceSkill = skill === 'reading' || skill === 'listening'
  const practice = kind === 'practice' && practiceSkill
  useEffect(() => {
    if (lesson?.kind !== 'practice') return
    api
      .getMaterial(lesson.id)
      .then((m) => {
        if (!m) return
        setMaterialType(m.material_type)
        setMaterialText(m.segments.length ? m.segments.map((x) => (x.speaker ? `${x.speaker}: ${x.text}` : x.text)).join('\n') : m.body)
      })
      .catch(() => {})
  }, [lesson])

  // dictionary words linked to the lesson
  const [words, setWords] = useState<api.Word[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [finding, setFinding] = useState(false)
  const [nothingFound, setNothingFound] = useState(false)

  useEffect(() => {
    if (!lesson) return
    api
      .lessonWordIds(lesson.id)
      .then(async (ids) => {
        setWords(await api.wordsByIds(ids))
        setPicked(new Set(ids))
      })
      .catch(() => {})
  }, [lesson])

  const preview = useMemo(() => parseExercises(raw), [raw])
  const issues = useMemo(() => validateRaw(raw), [raw])
  const valid = title.trim() && preview.length > 0 && issues.length === 0

  async function findWords() {
    setFinding(true)
    setNothingFound(false)
    try {
      const found = await api.lessonHints([...lessonWords([title, description, preview])])
      const known = new Set(words.map((w) => w.id))
      const fresh = (await api.wordsByIds(found.map((h) => h.id).filter((id) => !known.has(id))))
        .filter((w) => w.topic !== 'Basic Words') // pronouns, be-forms, articles…
      setWords((ws) => [...ws, ...fresh])
      setPicked((p) => new Set([...p, ...fresh.map((w) => w.id)]))
      setNothingFound(fresh.length === 0 && words.length === 0)
    } finally {
      setFinding(false)
    }
  }

  async function save() {
    if (!userId || !valid) return
    setSaving(true)
    setErr('')
    try {
      const payload: api.NewLesson = {
        title: title.trim(),
        description: description.trim(),
        cefr,
        skill,
        topic: topic || null,
        scope: isAdmin && library ? 'library' : 'teacher',
        status: published ? 'published' : lesson?.status === 'review' ? 'review' : 'draft',
        sequence: isAdmin ? sequence : (lesson?.sequence ?? 0),
        // the editor syntax has no titles for order / match tasks: keep the ones the lesson had
        exercises: preview.map((ex, i) => {
          const old = lesson?.exercises[i]
          return (ex.type === 'order' || ex.type === 'match') && !ex.prompt && old?.type === ex.type ? { ...ex, prompt: old.prompt } : ex
        }),
        kind: practice ? 'practice' : 'lesson',
      }
      let id = lesson?.id
      if (lesson) {
        // Removing exercises deletes students' answers to them — ask first.
        const impact = await api.saveLessonExercises(lesson.id, payload.exercises, true)
        const history = impact.affected_answers + impact.affected_attempts
        if (impact.deleted > 0 && history > 0 && !confirm(t('teacher.confirmRemoveExercises', { deleted: impact.deleted, answers: history }))) {
          return
        }
        await api.updateLesson(lesson.id, payload)
      } else {
        id = await api.createLesson(userId, payload)
      }
      if (id) await api.setLessonWords(id, [...picked])
      if (id && practice) await api.saveMaterial(id, materialFromText(materialType, skill, materialText))
      onSaved()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <button onClick={onClose} className="font-body text-sm text-mute hover:text-ink">
        ← {t('teacher.backToLessons')}
      </button>
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('teacher.lessonTitle')} className={`${inputCls} w-full`} />
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('teacher.lessonDescription')} className={`${inputCls} w-full`} />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-mute">{t('teacher.cefr')}</p>
            <div className="flex flex-wrap gap-2">
              {CEFR_LEVELS.map((lv) => (
                <button key={lv} onClick={() => setCefr(lv)} className={chipCls(cefr === lv)}>
                  {lv}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-mute">
              {t('teacher.skill')}
              <select value={skill} onChange={(e) => setSkill(e.target.value as api.LessonSkill)} className={`${inputCls} mt-1 w-full font-normal text-ink`}>
                {api.LESSON_SKILLS.map((s) => <option key={s} value={s}>{lessonSkillLabel(s)}</option>)}
              </select>
            </label>
            <label className="text-sm font-semibold text-mute">
              {t('teacher.topic')}
              <select value={topic} onChange={(e) => setTopic(e.target.value)} className={`${inputCls} mt-1 w-full font-normal text-ink`}>
                <option value="">{t('teacher.noTopic')}</option>
                {TOPICS.map((tp) => <option key={tp} value={tp}>{topicLabel(tp)}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {isAdmin && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={library} onChange={(e) => setLibrary(e.target.checked)} />
                {t('teacher.libraryCheckbox')}
              </label>
            )}
            {isAdmin && library && (
              <label className="flex items-center gap-2 text-sm">
                {t('teacher.sequence')}
                <input type="number" value={sequence} onChange={(e) => setSequence(Number(e.target.value) || 0)} className={`${inputCls} w-24`} />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
              {t('teacher.publishedCheckbox')}
            </label>
          </div>

          {isAdmin && practiceSkill && (
            <div className="space-y-3 rounded-2xl border border-line bg-paper p-4">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={kind === 'practice'} onChange={(e) => setKind(e.target.checked ? 'practice' : 'lesson')} />
                {t('teacher.practiceCheckbox')}
              </label>
              {practice && (
                <>
                  <select value={materialType} onChange={(e) => setMaterialType(e.target.value as api.MaterialType)} className={inputCls}>
                    {(skill === 'listening' ? LISTENING_TYPES : READING_TYPES).map((mt) => (
                      <option key={mt} value={mt}>
                        {materialTypeLabel(mt)}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={materialText}
                    onChange={(e) => setMaterialText(e.target.value)}
                    rows={10}
                    placeholder={skill === 'listening' ? t('teacher.materialScript') : t('teacher.materialText')}
                    className={`${inputCls} w-full text-sm leading-relaxed`}
                  />
                </>
              )}
            </div>
          )}

          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={12}
            placeholder={t('teacher.exercisesPlaceholder')}
            className={`${inputCls} w-full font-mono text-sm leading-relaxed`}
          />

          <div className="rounded-2xl border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                {t('teacher.lessonWords')}
                {words.length > 0 && <span className="ml-2 text-sm font-normal text-mute">{t('teacher.wordsSelected', { count: picked.size })}</span>}
              </p>
              <Button variant="soft" onClick={findWords} disabled={finding}>
                {finding ? t('common.loading') : t('teacher.findWords')}
              </Button>
            </div>
            {nothingFound && <p className="mt-2 text-sm text-mute">{t('teacher.noWordsFound')}</p>}
            {words.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {words.map((w) => {
                  const on = picked.has(w.id)
                  const tr = api.wordTranslation(w)
                  return (
                    <label key={w.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${on ? 'border-plum bg-lilac' : 'border-line text-mute'}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPicked((p) => {
                            const n = new Set(p)
                            if (n.has(w.id)) n.delete(w.id)
                            else n.add(w.id)
                            return n
                          })
                        }
                      />
                      <b>{w.word}</b>
                      {tr && <span className="text-mute">— {tr}</span>}
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={!valid || saving}>
              {saving ? t('common.saving') : t('teacher.saveLesson')}
            </Button>
            <Button variant="ghost" onClick={() => setRaw(t('teacher.sample'))}>
              {t('teacher.insertSample')}
            </Button>
          </div>
          {err && <p className="text-sm text-warn">{err}</p>}

          <details className="rounded-2xl border border-line bg-paper p-4 text-sm text-mute">
            <summary className="cursor-pointer font-semibold text-ink">{t('teacher.syntaxTitle')}</summary>
            <div className="mt-3 space-y-2 font-mono text-xs leading-relaxed">
              <p>fill: I ___ home. = go # {t('teacher.syntaxExplanation')}</p>
              <p>choice: She ___ here. * is / are / am # {t('teacher.syntaxExplanation')}</p>
              <p>listen: door # {t('teacher.syntaxListen')}</p>
              <p>dialogue: A: How are you? &gt;&gt; B: I ___ fine. (am) # {t('teacher.syntaxExplanation')}</p>
              <p>fill: I ___ to school. = go | walk # {t('teacher.syntaxAccept')}</p>
              <p>tf: Tom lives in a big city. = false # {t('teacher.syntaxTf')}</p>
              <p>tfng: Tom has a sister. = not given # {t('teacher.syntaxTfng')}</p>
              <p>order: Tom | goes | to | school # {t('teacher.syntaxOrder')}</p>
              <p>match: cat = кошка | dog = собака # {t('teacher.syntaxMatch')}</p>
            </div>
            <p className="mt-3">{t('teacher.syntaxDialogueRule')}</p>
          </details>
        </div>

        <div className="space-y-4">
          <h3 className="font-display text-xl font-semibold">
            {t('teacher.preview')} {preview.length ? `· ${preview.length}` : ''}
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
              {t('teacher.previewEmpty')}
            </p>
          ) : (
            <div className="space-y-2">
              {preview.map((ex, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-xl border border-line bg-paper p-3 text-sm">
                  <Badge>{skillLabel(ex.type)}</Badge>
                  <span className="text-ink/80">
                    {ex.type === 'listen' ? ex.text : promptText(ex)}
                    <span className="block text-xs text-[var(--color-good)]">✓ {correctAnswerText(ex)}</span>
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

const READING_TYPES: api.MaterialType[] = ['article', 'story', 'blog', 'email', 'letter', 'notice', 'advert', 'review', 'interview_text']
const LISTENING_TYPES: api.MaterialType[] = ['podcast', 'dialogue', 'interview', 'announcement', 'monologue', 'radio']

/** Reading: the text as it is. Listening: one "Speaker: line" per line (the speaker is optional). */
function materialFromText(type: api.MaterialType, skill: string, text: string): Omit<api.Material, 'lesson_id'> {
  const words = (text.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length
  if (skill !== 'listening') return { material_type: type, body: text.trim(), segments: [], audio_url: '', word_count: words, duration_sec: 0 }
  const segments = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^([^:]{1,30}):\s*(.+)$/)
      return m ? { speaker: m[1].trim(), text: m[2].trim() } : { speaker: '', text: l }
    })
  return { material_type: type, body: '', segments, audio_url: '', word_count: words, duration_sec: Math.round((words / 130) * 60) }
}

function serialize(exs: Exercise[]): string {
  return exs
    .map((ex) => {
      const tail = ex.explanation ? ` # ${ex.explanation}` : ''
      if (ex.type === 'fill') return `fill: ${ex.prompt} = ${[ex.answer, ...(ex.accept ?? [])].join(' | ')}${tail}`
      if (ex.type === 'listen') return `listen: ${ex.text}${tail}`
      if (ex.type === 'choice')
        return `choice: ${ex.prompt} ${ex.options.map((o) => (o === ex.answer ? `* ${o}` : o)).join(' / ')}${tail}`
      if (ex.type === 'truefalse') return `${ex.options.includes('not_given') ? 'tfng' : 'tf'}: ${ex.prompt} = ${ex.answer.replace('_', ' ')}${tail}`
      if (ex.type === 'order') return `order: ${(ex.order ?? ex.items).join(' | ')}${tail}`
      if (ex.type === 'match') return `match: ${Object.entries(ex.pairs ?? {}).map(([l, r]) => `${l} = ${r}`).join(' | ')}${tail}`
      return `dialogue: ${ex.lines
        .map((l) => `${l.speaker}: ${l.answer ? l.text.replace('___', `___ (${l.answer})`) : l.text}`)
        .join(' >> ')}${tail}`
    })
    .join('\n')
}

/* ---------- assign menu ---------- */

function AssignMenu({ lesson }: { lesson: { id: string } }) {
  const { t } = useTranslation()
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
        {t('teacher.assign')}
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-line bg-paper p-2 shadow-[0_16px_40px_-24px_rgba(60,42,112,0.6)]">
          {students.length === 0 && <p className="p-2 text-sm text-mute">{t('teacher.noStudentsToAssign')}</p>}
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
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [students, setStudents] = useState<Profile[]>([])
  const [newId, setNewId] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    if (userId) setStudents(await api.myStudents(userId))
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function add() {
    if (!userId || !newId.trim()) return
    try {
      await api.linkStudent(userId, newId.trim())
      setNewId('')
      setMsg(t('teacher.studentAdded'))
      load()
    } catch (e) {
      setMsg(`${t('teacher.studentAddFailed')} ${errorMessage(e)}`)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-mute">{t('teacher.addStudentHint')}</p>
      <div className="flex flex-wrap gap-2">
        <input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder={t('teacher.studentIdPlaceholder')} className={`${inputCls} w-80`} />
        <Button onClick={add}>{t('common.add')}</Button>
      </div>
      {msg && <p className="text-sm text-mute">{msg}</p>}
      <div className="space-y-2">
        {students.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4">
            <div>
              <p className="font-body font-semibold">{s.full_name || t('common.noName')}</p>
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
              {t('common.remove')}
            </Button>
          </div>
        ))}
        {students.length === 0 && <p className="text-mute">{t('teacher.noStudents')}</p>}
      </div>
    </div>
  )
}

/* ---------- progress board ---------- */

function ProgressBoard({ lessons }: { lessons: LessonSummary[] }) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [students, setStudents] = useState<Profile[]>([])
  const [selected, setSelected] = useState<Profile | null>(null)

  useEffect(() => {
    if (userId) api.myStudents(userId).then(setStudents)
  }, [userId])

  if (selected) return <StudentDetail student={selected} lessons={lessons} onBack={() => setSelected(null)} />

  return (
    <div className="space-y-3">
      {students.length === 0 && <p className="text-mute">{t('teacher.addStudentsToSeeProgress')}</p>}
      {students.map((s) => (
        <button
          key={s.id}
          onClick={() => setSelected(s)}
          className="flex w-full items-center justify-between rounded-2xl border border-line bg-paper p-4 text-left hover:border-lavender"
        >
          <span className="font-display text-lg font-semibold">{s.full_name || s.id.slice(0, 8)}</span>
          <span className="text-plum">{t('common.open')} →</span>
        </button>
      ))}
    </div>
  )
}

function StudentDetail({ student, lessons: own, onBack }: { student: Profile; lessons: LessonSummary[]; onBack: () => void }) {
  const { t } = useTranslation()
  const [progress, setProgress] = useState<api.LessonProgress[]>([])
  const [passes, setPasses] = useState<Record<string, api.PassSummary>>({})
  const [openLesson, setOpenLesson] = useState<Lesson | null>(null)
  const [others, setOthers] = useState<LessonSummary[]>([]) // library lessons the student worked on
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
  // the teacher's own lessons + any other lesson this student has progress in
  const ownIds = useMemo(() => new Set(own.filter((l) => l.scope === 'teacher').map((l) => l.id)), [own])
  const extraIds = [...new Set([...progress.map((p) => p.lesson_id), ...Object.keys(passes)])].filter((id) => !ownIds.has(id)).sort().join(',')
  useEffect(() => {
    api.lessonSummaries(extraIds ? extraIds.split(',') : []).then(setOthers).catch(() => setOthers([]))
  }, [extraIds])
  const lessons = [...own.filter((l) => ownIds.has(l.id)), ...others]

  async function toggleDetails(id: string) {
    if (openLesson?.id === id) return setOpenLesson(null)
    setOpenLesson(await api.getLesson(id).catch(() => null))
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="font-body text-sm text-mute hover:text-ink">
        ← {t('teacher.allStudents')}
      </button>
      <h3 className="font-display text-2xl font-semibold">{student.full_name || t('teacher.student')}</h3>

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
                        ? t('teacher.completedWithPasses', {
                            last: fmt(s.last),
                            score: p?.score ?? 0,
                            best: fmt(s.best ?? s.last),
                            passes: s.completed,
                            seconds: s.last.time_spent_sec,
                          })
                        : t('teacher.completedLegacy', { score: p?.score ?? 0, seconds: p?.time_spent_sec ?? 0 })
                      : status === 'in_progress'
                        ? t('progress.inProgress')
                        : t('progress.notStarted')}
                    {status === 'completed' && s?.open && ` · ${t('teacher.newPassStarted')}`}
                  </p>
                </div>
                {status !== 'not_started' && (
                  <Button variant="soft" onClick={() => toggleDetails(l.id)}>
                    {t('teacher.details')}
                  </Button>
                )}
              </div>
              {openLesson?.id === l.id && (
                <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                  {Object.keys(answers).length > 0 && (
                    <>
                      <p className="font-semibold">
                        {s?.last ? t('teacher.answersOfPass', { n: s.last.pass_number }) : t('teacher.answersCurrentPass')}
                      </p>
                      {openLesson.exercises.map((ex, idx) => {
                        const a = ex.id ? answers[ex.id] : undefined
                        const ok = api.countsAsCorrect(a)
                        return (
                          <p key={ex.id ?? idx} className={!a ? 'text-mute' : ok ? 'text-[var(--color-good)]' : 'text-warn'}>
                            {idx + 1}. {promptText(ex)} — {a ? `${ok ? '✓' : '✗'} «${a.given_answer || '—'}»` : t('review.noAnswer')}
                            {a && (
                              <span className="text-mute">
                                {' '}
                                · {a.checked ? t('teacher.checkedTimes', { count: a.attempts_count }) : t('review.notChecked')}
                              </span>
                            )}
                          </p>
                        )
                      })}
                      <p className="pt-2 font-semibold">{t('teacher.checkHistory')}</p>
                    </>
                  )}
                  {attempts.length === 0 && <p className="text-mute">{t('teacher.noAttempts')}</p>}
                  {attempts.map((a, i) => (
                    <p key={i} className={a.is_correct ? 'text-[var(--color-good)]' : 'text-warn'}>
                      {a.is_correct ? '✓' : '✗'} {t('teacher.attemptN', { n: a.attempt_number })}: «{a.given_answer || '—'}»
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
