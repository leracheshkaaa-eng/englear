import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button } from '../lib/ui'
import * as api from '../lib/api'
import type { Profile, Role } from '../lib/api'
import { Avatar } from '../lib/avatars'
import { errorMessage } from '../i18n/errors'

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
