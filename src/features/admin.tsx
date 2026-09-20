import { useEffect, useState } from 'react'
import { Badge, Button } from '../lib/ui'
import * as api from '../lib/api'
import type { Profile, Role } from '../lib/api'
import { Avatar } from '../lib/avatars'

export function AdminDashboard() {
  const [users, setUsers] = useState<Profile[]>([])
  const [err, setErr] = useState('')

  async function load() {
    try {
      setUsers(await api.adminListUsers())
    } catch (e: any) {
      setErr(e.message)
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
    } catch (e: any) {
      setErr(e.message)
    }
  }

  const pending = users.filter((u) => u.teacher_request === 'pending' && u.role !== 'teacher')

  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <h2 className="mb-6 font-display text-4xl font-semibold">Admin</h2>
      {err && <p className="mb-4 text-sm text-warn">{err}</p>}

      {pending.length > 0 && (
        <div className="mb-8 rounded-2xl border border-plum/40 bg-lilac/60 p-5">
          <h3 className="mb-3 font-display text-xl font-semibold text-plum-deep">
            Заявки на роль учителя ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-2xl bg-paper p-3">
                <div className="flex items-center gap-3">
                  <Avatar id={u.avatar} size={40} />
                  <span className="font-body font-semibold">{u.full_name || 'Без имени'}</span>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setRole(u.id, 'teacher')}>Одобрить</Button>
                  <Button variant="ghost" onClick={() => setRole(u.id, 'student')}>Отклонить</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 className="mb-3 font-display text-xl font-semibold">Пользователи ({users.length})</h3>
      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-paper p-4">
            <div className="flex items-center gap-3">
              <Avatar id={u.avatar} size={40} />
              <div>
                <p className="font-body font-semibold">{u.full_name || 'Без имени'}</p>
                {u.teacher_request === 'pending' && u.role !== 'teacher' && (
                  <p className="text-xs text-plum">хочет стать учителем</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {u.role === 'admin' && <Badge>admin</Badge>}
              {u.role !== 'admin' &&
                (['student', 'teacher'] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(u.id, r)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      u.role === r ? 'border-plum bg-lilac text-plum-deep' : 'border-line text-mute hover:border-lavender'
                    }`}
                  >
                    {r}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
