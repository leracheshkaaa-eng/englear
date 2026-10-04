import { Suspense, lazy, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import type { BoardKind, BoardShare, BoardSummary, ClassRow, LessonSummary, Profile } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Badge, Button, inputCls } from '../lib/ui'
import { errorMessage } from '../i18n/errors'
import { LeanEmpty } from '../lib/lean'

/* ============================================================
   Whiteboards: my boards (lesson boards and notes), boards shared with me,
   creating from a template, sharing with classes / students.
   The editor (Excalidraw) loads only when a board is opened.
   ============================================================ */

const BoardEditor = lazy(() => import('./boardEditor'))

export function Boards({ openId, onOpen }: { openId: string | null; onOpen: (id: string | null) => void }) {
  const { t } = useTranslation()
  const { userId, role } = useAuth()
  const isTeacher = role === 'teacher' || role === 'admin'
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [tab, setTab] = useState<'mine' | 'shared'>('mine')
  const [folder, setFolder] = useState('')
  const [creating, setCreating] = useState(false)
  const [sharing, setSharing] = useState<BoardSummary | null>(null)
  const [err, setErr] = useState('')

  const load = () => api.listBoards().then(setBoards).catch((e) => setErr(errorMessage(e)))
  useEffect(() => {
    if (!openId) load()
  }, [openId])

  if (openId)
    return (
      <Suspense fallback={<p className="py-24 text-center text-mute">{t('common.loading')}</p>}>
        <BoardEditor boardId={openId} onBack={() => onOpen(null)} />
      </Suspense>
    )

  const mine = boards.filter((b) => b.owner_id === userId)
  const shared = boards.filter((b) => b.owner_id !== userId)
  const list = (tab === 'mine' ? mine : shared).filter((b) => !folder || b.folder === folder)
  const folders = [...new Set(mine.map((b) => b.folder).filter(Boolean))].sort()

  return (
    <section className="mx-auto max-w-5xl px-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-4xl font-semibold">{t('boards.title')}</h2>
          <p className="mt-1 text-mute">{isTeacher ? t('boards.subtitleTeacher') : t('boards.subtitle')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>+ {t('boards.new')}</Button>
      </div>
      {err && <p className="mt-3 text-sm text-warn">{err}</p>}

      {creating && (
        <NewBoard
          isTeacher={isTeacher}
          folders={folders}
          onCancel={() => setCreating(false)}
          onCreated={(b) => {
            setCreating(false)
            onOpen(b.id)
          }}
        />
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {(['mine', 'shared'] as const).map((x) => (
          <button
            key={x}
            onClick={() => {
              setTab(x)
              setFolder('')
            }}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${tab === x ? 'border-plum bg-lilac text-plum-deep' : 'border-line text-mute hover:border-lavender'}`}
          >
            {t(`boards.tabs.${x}`)} · {x === 'mine' ? mine.length : shared.length}
          </button>
        ))}
        {tab === 'mine' && folders.length > 0 && (
          <select value={folder} onChange={(e) => setFolder(e.target.value)} className={`${inputCls} w-48 py-1.5`}>
            <option value="">{t('boards.allFolders')}</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                📁 {f}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((b) => (
          <div key={b.id} className="flex flex-col rounded-2xl border border-line bg-paper p-4">
            <button onClick={() => onOpen(b.id)} className="text-left">
              <p className="font-display text-lg font-semibold">{b.title || t('boards.untitled')}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-mute">
                <Badge>{t(`boards.kinds.${b.kind}`)}</Badge>
                {b.folder && <span>📁 {b.folder}</span>}
                <span>{new Date(b.updated_at).toLocaleDateString()}</span>
              </div>
            </button>
            {b.owner_id === userId && (
              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {isTeacher && (
                  <button onClick={() => setSharing(b)} className="text-plum hover:underline">
                    {t('boards.share')}
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (!confirm(t('boards.deleteConfirm', { title: b.title || t('boards.untitled') }))) return
                    await api.deleteBoard(b.id).catch((e) => setErr(errorMessage(e)))
                    load()
                  }}
                  className="ml-auto text-mute hover:text-warn"
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && <LeanEmpty>{tab === 'mine' ? t('boards.noneMine') : t('boards.noneShared')}</LeanEmpty>}
      </div>

      {sharing && <ShareDialog board={sharing} onClose={() => setSharing(null)} />}
    </section>
  )
}

function NewBoard({
  isTeacher,
  folders,
  onCancel,
  onCreated,
}: {
  isTeacher: boolean
  folders: string[]
  onCancel: () => void
  onCreated: (b: BoardSummary) => void
}) {
  const { t } = useTranslation()
  const { userId, role } = useAuth()
  const [title, setTitle] = useState('')
  const [folder, setFolder] = useState('')
  const [lessons, setLessons] = useState<LessonSummary[]>([])
  const [lessonId, setLessonId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (isTeacher && userId) api.teacherLessons(userId, role === 'admin').then(setLessons).catch(() => {})
  }, [isTeacher, userId, role])

  async function create() {
    if (!userId) return
    setBusy(true)
    setErr('')
    try {
      const b = await api.createBoard(userId, { title: title.trim() || t('boards.untitled'), kind: lessonId ? 'lesson' : 'notes', folder: folder.trim(), lesson_id: lessonId || null })
      onCreated(b)
    } catch (e) {
      setErr(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-plum/30 bg-paper p-5">
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder={t('boards.titlePlaceholder')} className={`${inputCls} w-full`} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="font-semibold">{t('boards.folder')}</span>
          <input list="board-folders" value={folder} onChange={(e) => setFolder(e.target.value.slice(0, 60))} placeholder={t('boards.folderPlaceholder')} className={`${inputCls} mt-1 w-full`} />
          <datalist id="board-folders">
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        {isTeacher && (
          <label className="text-sm">
            <span className="font-semibold">{t('boards.lesson')}</span>
            <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} className={`${inputCls} mt-1 w-full`}>
              <option value="">{t('boards.noLesson')}</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {err && <p className="text-sm text-warn">{err}</p>}
      <div className="flex gap-2">
        <Button onClick={create} disabled={busy}>
          {t('boards.create')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}

function ShareDialog({ board, onClose }: { board: BoardSummary; onClose: () => void }) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [shares, setShares] = useState<BoardShare[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [err, setErr] = useState('')

  const load = async () => {
    if (!userId) return
    const [s, c, st] = await Promise.all([api.boardShares(board.id), api.myClasses(), api.myStudents(userId)])
    setShares(s)
    setClasses(c.filter((x) => !x.archived))
    setStudents(st)
  }
  useEffect(() => {
    load().catch((e) => setErr(errorMessage(e)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.id])

  const act = async (f: () => Promise<unknown>) => {
    setErr('')
    try {
      await f()
      await load()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  const row = (key: string, label: string, share: BoardShare | undefined, add: () => Promise<unknown>) => (
    <div key={key} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-lilac/40">
      <label className="flex flex-1 cursor-pointer items-center gap-2">
        <input type="checkbox" checked={!!share} onChange={() => act(() => (share ? api.unshareBoard(share.id) : add()))} />
        {label}
      </label>
      {share && (
        <select value={share.can_edit ? 'edit' : 'view'} onChange={(e) => act(() => api.setShareEdit(share.id, e.target.value === 'edit'))} className="rounded-lg border border-line bg-paper px-2 py-1 text-xs">
          <option value="view">{t('boards.canView')}</option>
          <option value="edit">{t('boards.canEdit')}</option>
        </select>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink/30 p-4" onClick={onClose}>
      <div className="max-h-[80vh] w-[min(460px,95vw)] overflow-y-auto rounded-2xl border border-line bg-paper p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-semibold">{t('boards.shareTitle', { title: board.title || t('boards.untitled') })}</h3>
        <p className="mt-1 mb-3 text-sm text-mute">{board.kind === 'lesson' && board.lesson_id ? t('boards.shareHintLesson') : t('boards.shareHint')}</p>
        {err && <p className="mb-2 text-sm text-warn">{err}</p>}
        {classes.length > 0 && <p className="mt-2 text-xs font-semibold text-mute">{t('classes.title')}</p>}
        {classes.map((c) => row('c' + c.id, c.name, shares.find((s) => s.class_id === c.id), () => api.shareBoard(board.id, { classId: c.id }, false)))}
        <p className="mt-3 text-xs font-semibold text-mute">{t('classes.students')}</p>
        {students.length === 0 && <p className="px-2 text-sm text-mute">{t('teacher.noStudentsToAssign')}</p>}
        {students.map((s) => row('s' + s.id, s.full_name || s.id.slice(0, 8), shares.find((x) => x.student_id === s.id), () => api.shareBoard(board.id, { studentId: s.id }, false)))}
        <div className="mt-4 text-right">
          <Button onClick={onClose}>{t('boards.done')}</Button>
        </div>
      </div>
    </div>
  )
}
