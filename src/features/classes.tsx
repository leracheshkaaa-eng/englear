import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import type { ClassAssignment, ClassRow, HomeworkItem, JoinPreview, Profile } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Avatar } from '../lib/avatars'
import { Badge, Button, inputCls } from '../lib/ui'
import { errorMessage } from '../i18n/errors'
import { Login } from './account'

/* ============================================================
   Teacher mode: students and classes, invite links, assigning with due dates.
   Student side: joining by link/code and the homework list.
   ============================================================ */

const card = 'rounded-2xl border border-line bg-paper p-5'
/** end of the chosen day in local time, as ISO */
const dueFromInput = (v: string) => (v ? new Date(`${v}T23:59:00`).toISOString() : null)

function useCopy() {
  const [copied, setCopied] = useState('')
  return {
    copied,
    copy(text: string) {
      navigator.clipboard?.writeText(text).catch(() => {})
      setCopied(text)
      setTimeout(() => setCopied(''), 1500)
    },
  }
}

/** Code + link with copy buttons. */
function InviteBox({ code, onRegenerate }: { code: string; onRegenerate: () => void }) {
  const { t } = useTranslation()
  const { copied, copy } = useCopy()
  const link = api.joinLink(code)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <code className="rounded-lg bg-lilac px-2 py-1 font-semibold tracking-widest text-plum-deep">{code}</code>
      <button onClick={() => copy(link)} className="rounded-full border border-line px-3 py-1 hover:border-lavender">
        {copied === link ? t('classes.copied') : t('classes.copyLink')}
      </button>
      <button onClick={() => copy(code)} className="rounded-full border border-line px-3 py-1 hover:border-lavender">
        {copied === code ? t('classes.copied') : t('classes.copyCode')}
      </button>
      <button
        onClick={() => {
          if (confirm(t('classes.regenerateConfirm'))) onRegenerate()
        }}
        className="text-xs text-mute hover:text-ink"
      >
        {t('classes.regenerate')}
      </button>
    </div>
  )
}

/* ---------------- teacher: students and classes ---------------- */

export function ClassesManager() {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [students, setStudents] = useState<Profile[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [members, setMembers] = useState<Record<string, string[]>>({})
  const [work, setWork] = useState<ClassAssignment[]>([])
  const [invite, setInvite] = useState('')
  const [newName, setNewName] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [err, setErr] = useState('')

  async function load() {
    if (!userId) return
    try {
      const [s, c, m, w, code] = await Promise.all([api.myStudents(userId), api.myClasses(), api.classMembers(), api.classAssignments(), api.myInviteCode()])
      setStudents(s)
      setClasses(c)
      setMembers(m)
      setWork(w)
      setInvite(code)
    } catch (e) {
      setErr(errorMessage(e))
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const run = (f: () => Promise<unknown>) => async () => {
    setErr('')
    try {
      await f()
      await load()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  const visible = classes.filter((c) => c.archived === showArchived)
  const byId = Object.fromEntries(students.map((s) => [s.id, s]))
  const classesOf = (sid: string) => classes.filter((c) => !c.archived && members[c.id]?.includes(sid))

  return (
    <div className="space-y-6">
      {err && <p className="text-sm text-warn">{err}</p>}

      {/* personal invite */}
      <div className={card}>
        <h3 className="font-display text-xl font-semibold">{t('classes.inviteTitle')}</h3>
        <p className="mb-3 mt-1 text-sm text-mute">{t('classes.inviteHint')}</p>
        {invite && <InviteBox code={invite} onRegenerate={run(async () => setInvite(await api.regenerateCode(null)))} />}
      </div>

      {/* classes */}
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-2xl font-semibold">{t('classes.title')}</h3>
          <button onClick={() => setShowArchived((v) => !v)} className="text-sm text-mute hover:text-ink">
            {showArchived ? t('classes.showActive') : t('classes.showArchived')}
          </button>
        </div>
        {!showArchived && (
          <div className="mb-4 flex flex-wrap gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value.slice(0, 60))}
              onKeyDown={(e) => e.key === 'Enter' && newName.trim() && run(async () => { await api.createClass(newName); setNewName('') })()}
              placeholder={t('classes.namePlaceholder')}
              className={`${inputCls} w-72`}
            />
            <Button disabled={!newName.trim()} onClick={run(async () => { await api.createClass(newName); setNewName('') })}>
              {t('classes.create')}
            </Button>
          </div>
        )}
        <div className="space-y-4">
          {visible.length === 0 && <p className="text-mute">{showArchived ? t('classes.noArchived') : t('classes.none')}</p>}
          {visible.map((c) => (
            <ClassCard
              key={c.id}
              cls={c}
              memberIds={members[c.id] ?? []}
              byId={byId}
              students={students}
              work={work.filter((w) => w.class_id === c.id)}
              run={run}
            />
          ))}
        </div>
      </div>

      {/* all students */}
      <div>
        <h3 className="mb-3 font-display text-2xl font-semibold">{t('classes.allStudents', { n: students.length })}</h3>
        {students.length === 0 && <p className="text-mute">{t('classes.noStudents')}</p>}
        <div className="space-y-2">
          {students.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-paper p-3">
              <div className="flex items-center gap-3">
                <Avatar id={s.avatar} size={36} />
                <div>
                  <p className="font-body font-semibold">{s.full_name || t('common.noName')}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {classesOf(s.id).map((c) => (
                      <Badge key={c.id}>{c.name}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <Button
                variant="danger"
                onClick={() => {
                  if (userId && confirm(t('classes.removeStudentConfirm', { name: s.full_name || '' }))) run(() => api.unlinkStudent(userId, s.id))()
                }}
              >
                {t('common.remove')}
              </Button>
            </div>
          ))}
        </div>
        <AddById onAdded={load} />
      </div>
    </div>
  )
}

function ClassCard({
  cls,
  memberIds,
  byId,
  students,
  work,
  run,
}: {
  cls: ClassRow
  memberIds: string[]
  byId: Record<string, Profile>
  students: Profile[]
  work: ClassAssignment[]
  run: (f: () => Promise<unknown>) => () => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(cls.name)
  const [adding, setAdding] = useState('')
  const outside = students.filter((s) => !memberIds.includes(s.id))

  return (
    <div className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 60))}
          onBlur={() => name.trim() && name !== cls.name && run(() => api.updateClass(cls.id, { name: name.trim() }))()}
          className="min-w-0 flex-1 bg-transparent font-display text-xl font-semibold outline-none focus:underline"
        />
        <button onClick={run(() => api.updateClass(cls.id, { archived: !cls.archived }))} className="text-sm text-mute hover:text-ink">
          {cls.archived ? t('classes.restore') : t('classes.archive')}
        </button>
      </div>
      {!cls.archived && (
        <div className="mt-2">
          <p className="mb-1 text-xs text-mute">{t('classes.classInviteHint')}</p>
          <InviteBox code={cls.join_code} onRegenerate={run(() => api.regenerateCode(cls.id))} />
        </div>
      )}

      <p className="mt-4 mb-2 text-sm font-semibold">{t('classes.members', { n: memberIds.length })}</p>
      <div className="flex flex-wrap gap-2">
        {memberIds.map((id) => (
          <span key={id} className="flex items-center gap-1.5 rounded-full border border-line py-1 pr-2 pl-1 text-sm">
            <Avatar id={byId[id]?.avatar} size={22} />
            {byId[id]?.full_name || t('common.noName')}
            <button onClick={run(() => api.removeFromClass(cls.id, id))} title={t('classes.removeFromClass')} className="text-mute hover:text-warn">
              ×
            </button>
          </span>
        ))}
        {memberIds.length === 0 && <span className="text-sm text-mute">{t('classes.emptyClass')}</span>}
      </div>
      {outside.length > 0 && !cls.archived && (
        <div className="mt-3 flex flex-wrap gap-2">
          <select value={adding} onChange={(e) => setAdding(e.target.value)} className={`${inputCls} w-60`}>
            <option value="">{t('classes.addExisting')}</option>
            {outside.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <Button variant="soft" disabled={!adding} onClick={run(async () => { await api.addToClass(cls.id, adding); setAdding('') })}>
            {t('common.add')}
          </Button>
        </div>
      )}

      <p className="mt-4 mb-2 text-sm font-semibold">{t('classes.homework')}</p>
      {work.length === 0 ? (
        <p className="text-sm text-mute">{t('classes.noHomework')}</p>
      ) : (
        <div className="divide-y divide-line rounded-xl border border-line">
          {work.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                {w.lesson_id ? '📘' : '🃏'} {w.title}
              </span>
              <span className="flex items-center gap-3">
                <span className="text-xs text-mute">{w.due_at ? t('classes.due', { date: new Date(w.due_at).toLocaleDateString() }) : t('classes.noDue')}</span>
                <button
                  onClick={() => {
                    if (confirm(t('classes.unassignConfirm'))) run(() => api.unassignFromClass(w.id))()
                  }}
                  className="text-mute hover:text-warn"
                >
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** The old way: add a student by their ID (kept for students who already shared their ID). */
function AddById({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [id, setId] = useState('')
  const [msg, setMsg] = useState('')
  return (
    <details className="mt-4 text-sm">
      <summary className="cursor-pointer text-mute">{t('classes.byId')}</summary>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder={t('teacher.studentIdPlaceholder')} className={`${inputCls} w-80`} />
        <Button
          variant="soft"
          onClick={async () => {
            if (!userId || !id.trim()) return
            try {
              await api.linkStudent(userId, id.trim())
              setId('')
              setMsg(t('teacher.studentAdded'))
              onAdded()
            } catch (e) {
              setMsg(`${t('teacher.studentAddFailed')} ${errorMessage(e)}`)
            }
          }}
        >
          {t('common.add')}
        </Button>
      </div>
      {msg && <p className="mt-1 text-mute">{msg}</p>}
    </details>
  )
}

/* ---------------- teacher: assign a lesson to classes / students ---------------- */

export function AssignMenu({ lesson }: { lesson: { id: string } }) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [open, setOpen] = useState(false)
  const [students, setStudents] = useState<Profile[]>([])
  const [assigned, setAssigned] = useState<string[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [work, setWork] = useState<ClassAssignment[]>([])
  const [due, setDue] = useState('')
  const [err, setErr] = useState('')

  async function load() {
    if (!userId) return
    const [s, a, c, w] = await Promise.all([api.myStudents(userId), api.lessonAssignees(lesson.id), api.myClasses(), api.classAssignments()])
    setStudents(s)
    setAssigned(a)
    setClasses(c.filter((x) => !x.archived))
    setWork(w.filter((x) => x.lesson_id === lesson.id))
  }
  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, lesson.id])

  const act = async (f: () => Promise<unknown>) => {
    setErr('')
    try {
      await f()
      await load()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  return (
    <div className="relative">
      <Button variant="soft" onClick={() => setOpen((o) => !o)}>
        {t('teacher.assign')}
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 space-y-2 rounded-2xl border border-line bg-paper p-3 shadow-[0_16px_40px_-24px_rgba(60,42,112,0.6)]">
          <label className="block text-xs text-mute">
            {t('classes.dueLabel')}
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={`${inputCls} mt-1 w-full py-1.5`} />
          </label>
          {err && <p className="text-xs text-warn">{err}</p>}
          {classes.length > 0 && <p className="pt-1 text-xs font-semibold text-mute">{t('classes.title')}</p>}
          {classes.map((c) => {
            const w = work.find((x) => x.class_id === c.id)
            return (
              <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-1.5 text-sm hover:bg-lilac/50">
                <input
                  type="checkbox"
                  checked={!!w}
                  onChange={() => act(() => (w ? api.unassignFromClass(w.id) : api.assignToClass(c.id, { lessonId: lesson.id }, dueFromInput(due))))}
                />
                <span className="flex-1">{c.name}</span>
                {w?.due_at && <span className="text-xs text-mute">{new Date(w.due_at).toLocaleDateString()}</span>}
              </label>
            )
          })}
          <p className="pt-1 text-xs font-semibold text-mute">{t('classes.students')}</p>
          {students.length === 0 && <p className="p-1 text-sm text-mute">{t('teacher.noStudentsToAssign')}</p>}
          {students.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-1.5 text-sm hover:bg-lilac/50">
              <input
                type="checkbox"
                checked={assigned.includes(s.id)}
                onChange={() =>
                  act(() => (assigned.includes(s.id) ? api.unassignLesson(lesson.id, s.id) : api.assignLessonDue(userId!, s.id, lesson.id, dueFromInput(due))))
                }
              />
              {s.full_name || s.id.slice(0, 8)}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------------- student: join by link / code ---------------- */

export function JoinPage({ code, onDone }: { code: string; onDone: () => void }) {
  const { t } = useTranslation()
  const { userId, role } = useAuth()
  const [preview, setPreview] = useState<JoinPreview | null | undefined>(undefined)
  const [state, setState] = useState<'idle' | 'busy' | 'joined'>('idle')
  const [err, setErr] = useState('')

  useEffect(() => {
    api.joinPreview(code).then(setPreview).catch(() => setPreview(null))
  }, [code])

  async function join() {
    setState('busy')
    setErr('')
    try {
      await api.joinByCode(code)
      setState('joined')
    } catch (e) {
      const hint = (e as { hint?: string }).hint
      setErr(hint && ['bad_code', 'own_code', 'not_student'].includes(hint) ? t(`classes.errors.${hint}` as 'classes.errors.bad_code') : errorMessage(e))
      setState('idle')
    }
  }

  return (
    <section className="mx-auto max-w-md px-6 pt-12 pb-16 text-center">
      {preview === undefined ? (
        <p className="text-mute">{t('common.loading')}</p>
      ) : preview === null ? (
        <>
          <h2 className="font-display text-3xl font-semibold">{t('classes.join.badTitle')}</h2>
          <p className="mt-2 text-mute">{t('classes.join.badText')}</p>
          <Button className="mt-6" onClick={onDone}>
            {t('nav.home')}
          </Button>
        </>
      ) : (
        <>
          <div className="mx-auto w-fit">
            <Avatar id={preview.teacher_avatar ?? undefined} size={72} />
          </div>
          <h2 className="mt-4 font-display text-3xl font-semibold">
            {preview.class ? t('classes.join.titleClass', { teacher: preview.teacher, class: preview.class }) : t('classes.join.title', { teacher: preview.teacher })}
          </h2>
          {state === 'joined' ? (
            <>
              <p className="mt-3 text-mute">{t('classes.join.done')}</p>
              <Button className="mt-6" onClick={onDone}>
                {t('classes.join.toHomework')}
              </Button>
            </>
          ) : userId ? (
            <>
              <p className="mt-3 text-mute">{t('classes.join.text')}</p>
              {err && <p className="mt-3 text-sm text-warn">{err}</p>}
              <Button className="mt-6" onClick={join} disabled={state === 'busy' || role === 'teacher'}>
                {state === 'busy' ? '…' : t('classes.join.button')}
              </Button>
            </>
          ) : (
            <>
              <p className="mt-3 text-mute">{t('classes.join.signInFirst')}</p>
              <div className="text-left">
                <Login />
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}

/* ---------------- student: homework ---------------- */

export function Homework({ onOpenLesson, onOpenSets }: { onOpenLesson: (id: string) => void; onOpenSets: () => void }) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [items, setItems] = useState<HomeworkItem[]>([])
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    if (userId) api.myHomework(userId).then(setItems).catch(() => {})
  }, [userId])

  if (items.length === 0) return null
  const open = items.filter((i) => !i.done)
  const shown = showDone ? items : open
  const now = Date.now()

  return (
    <section className="mx-auto max-w-5xl px-6 pb-2">
      <div className="rounded-2xl border border-plum/30 bg-lilac/40 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-xl font-semibold">
            📝 {t('classes.hw.title')} {open.length > 0 && <span className="text-plum">· {open.length}</span>}
          </h3>
          {items.length > open.length && (
            <button onClick={() => setShowDone((v) => !v)} className="text-sm text-mute hover:text-ink">
              {showDone ? t('classes.hw.hideDone') : t('classes.hw.showDone', { n: items.length - open.length })}
            </button>
          )}
        </div>
        {shown.length === 0 && <p className="mt-2 text-sm text-mute">{t('classes.hw.allDone')}</p>}
        <div className="mt-3 space-y-2">
          {shown.map((i) => {
            const late = !i.done && i.due_at && new Date(i.due_at).getTime() < now
            return (
              <button
                key={i.kind + i.id}
                onClick={() => (i.kind === 'lesson' ? onOpenLesson(i.id) : onOpenSets())}
                className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-4 py-2.5 text-left hover:ring-2 hover:ring-lavender"
              >
                <span className={i.done ? 'text-mute line-through' : ''}>
                  {i.kind === 'lesson' ? '📘' : '🃏'} {i.title}
                  {i.teacher && <span className="ml-2 text-xs text-mute">{t('classes.hw.from', { name: i.teacher })}</span>}
                </span>
                <span className={`text-xs ${late ? 'font-semibold text-warn' : 'text-mute'}`}>
                  {i.done ? '✓ ' + t('classes.hw.done') : i.due_at ? (late ? t('classes.hw.late') + ' · ' : '') + t('classes.due', { date: new Date(i.due_at).toLocaleDateString() }) : t('classes.noDue')}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

