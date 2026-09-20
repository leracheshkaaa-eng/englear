import { useEffect, useState } from 'react'
import { Badge, Button, inputCls } from '../lib/ui'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { Lesson } from '../lib/api'
import { AVATARS, Avatar, AvatarPicker, DEFAULT_AVATAR } from '../lib/avatars'

export function Login({ onClose }: { onClose?: () => void }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setErr('')
    try {
      if (mode === 'in') {
        await signIn(email, password)
      } else {
        if (!nickname.trim()) throw new Error('Придумай ник')
        await signUp({ email, password, nickname: nickname.trim(), avatar })
      }
      onClose?.()
    } catch (e: any) {
      setErr(e.message ?? 'Что-то пошло не так')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto max-w-sm px-6 pt-16 pb-24">
      <div className="mb-6 flex rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold">
        {(['in', 'up'] as const).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setErr('') }}
            className={`flex-1 rounded-full py-2 transition-colors ${mode === m ? 'bg-plum text-paper' : 'text-mute'}`}
          >
            {m === 'in' ? 'Вход' : 'Регистрация'}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {mode === 'up' && (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3">
              <Avatar id={avatar} size={52} ring />
              <div>
                <p className="font-body font-semibold">{nickname || 'Твой ник'}</p>
                <p className="text-xs text-mute">{AVATARS.find((a) => a.id === avatar)?.label}</p>
              </div>
            </div>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="ник (например, Lera)" className={`${inputCls} w-full`} />
            <div>
              <p className="mb-2 text-sm text-mute">Выбери зверька:</p>
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </div>
          </>
        )}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" className={`${inputCls} w-full`} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="пароль" className={`${inputCls} w-full`} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        {err && <p className="text-sm text-warn">{err}</p>}
        <Button onClick={submit} disabled={busy || !email || !password} className="w-full">
          {busy ? '…' : mode === 'in' ? 'Войти' : 'Создать аккаунт'}
        </Button>
      </div>
      <p className="mt-4 text-center text-xs text-mute">
        {mode === 'in' ? 'Нет аккаунта? Нажми «Регистрация».' : 'Учителем можно стать позже — с одобрения администратора.'}
      </p>
    </section>
  )
}

export function StudentProgress({ lessons }: { lessons: Lesson[] }) {
  const { userId } = useAuth()
  const [progress, setProgress] = useState<api.LessonProgress[]>([])
  const [cards, setCards] = useState<any[]>([])

  useEffect(() => {
    if (!userId) return
    api.myProgress(userId).then(setProgress)
    api.cardProgress(userId).then(setCards)
  }, [userId])

  const byLesson = Object.fromEntries(progress.map((p) => [p.lesson_id, p]))
  const completed = progress.filter((p) => p.status === 'completed').length
  const known = cards.filter((c) => c.state === 'known').length

  return (
    <section className="mx-auto max-w-3xl px-6 pb-24">
      <h2 className="mb-6 font-display text-4xl font-semibold">Мой прогресс</h2>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="Уроков пройдено" value={completed} />
        <Stat label="Слов знаю" value={known} />
        <Stat label="Карточек в работе" value={cards.length} />
      </div>

      <div className="space-y-2">
        {lessons.map((l) => {
          const p = byLesson[l.id]
          return (
            <div key={l.id} className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4">
              <span className="font-body font-semibold">{l.title}</span>
              {p?.status === 'completed' ? (
                <Badge>✓ {p.score}%</Badge>
              ) : p?.status === 'in_progress' ? (
                <span className="text-sm text-mute">в процессе</span>
              ) : (
                <span className="text-sm text-mute">не начат</span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4 text-center">
      <p className="font-display text-3xl font-semibold text-plum">{value}</p>
      <p className="text-xs text-mute">{label}</p>
    </div>
  )
}
