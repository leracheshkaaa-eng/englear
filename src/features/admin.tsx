import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button } from '../lib/ui'
import * as api from '../lib/api'
import type { Profile, Role } from '../lib/api'
import { Avatar } from '../lib/avatars'
import { errorMessage } from '../i18n/errors'
import { prewarmSpeech } from '../lib/supabase'

export function AdminDashboard() {
  const { t } = useTranslation()
  const [users, setUsers] = useState<Profile[]>([])
  const [err, setErr] = useState('')

  async function load() {
    try {
      setUsers(await api.adminListUsers())
    } catch (e) {
      setErr(errorMessage(e))
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function setRole(id: string, role: Role) {
    setErr('')
    try {
      await api.adminSetRole(id, role)
      load()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  const pending = users.filter((u) => u.teacher_request === 'pending' && u.role !== 'teacher')

  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <h2 className="mb-6 font-display text-4xl font-semibold">{t('admin.title')}</h2>
      {err && <p className="mb-4 text-sm text-warn">{err}</p>}

      {pending.length > 0 && (
        <div className="mb-8 rounded-2xl border border-plum/40 bg-lilac/60 p-5">
          <h3 className="mb-3 font-display text-xl font-semibold text-plum-deep">
            {t('admin.teacherRequests', { count: pending.length })}
          </h3>
          <div className="space-y-2">
            {pending.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-2xl bg-paper p-3">
                <div className="flex items-center gap-3">
                  <Avatar id={u.avatar} size={40} />
                  <span className="font-body font-semibold">{u.full_name || t('common.noName')}</span>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setRole(u.id, 'teacher')}>{t('admin.approve')}</Button>
                  <Button variant="ghost" onClick={() => setRole(u.id, 'student')}>{t('admin.decline')}</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AudioPrewarm />

      <h3 className="mb-3 font-display text-xl font-semibold">{t('admin.users', { count: users.length })}</h3>
      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-paper p-4">
            <div className="flex items-center gap-3">
              <Avatar id={u.avatar} size={40} />
              <div>
                <p className="font-body font-semibold">{u.full_name || t('common.noName')}</p>
                {u.teacher_request === 'pending' && u.role !== 'teacher' && (
                  <p className="text-xs text-plum">{t('admin.wantsToTeach')}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {u.role === 'admin' && <Badge>{t('roles.admin')}</Badge>}
              {u.role !== 'admin' &&
                (['student', 'teacher'] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(u.id, r)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      u.role === r ? 'border-plum bg-lilac text-plum-deep' : 'border-line text-mute hover:border-lavender'
                    }`}
                  >
                    {t(`roles.${r}`)}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Pre-generate the cached pronunciation of every dictionary word and example. */
function AudioPrewarm() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [msg, setMsg] = useState('')

  async function run() {
    setBusy(true)
    setMsg('')
    try {
      const words = await api.listWords()
      const texts = words.flatMap((w) => [w.word, ...(w.examples?.length ? w.examples : w.example ? [w.example] : [])])
      const res = await prewarmSpeech(texts, (done, total) => setProgress({ done, total }))
      setMsg(res.notConfigured ? t('admin.prewarmNotConfigured') : t('admin.prewarmDone', { ready: res.ready, total: res.total, failed: res.failed }))
    } catch (e) {
      setMsg(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-line bg-paper p-5">
      <h3 className="font-display text-xl font-semibold">{t('admin.audioTitle')}</h3>
      <p className="mt-1 mb-3 text-sm text-mute">{t('admin.prewarmHint')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="soft" onClick={run} disabled={busy}>
          {busy && progress ? t('admin.prewarmProgress', { done: progress.done, total: progress.total }) : t('admin.prewarmButton')}
        </Button>
        {msg && <span className="text-sm text-mute">{msg}</span>}
      </div>
    </div>
  )
}
