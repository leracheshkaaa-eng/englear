import { useEffect, useState } from 'react'
import { Badge, Button, SpeakerButton, inputCls } from '../lib/ui'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { Word } from '../lib/api'
import { Avatar, AvatarPicker } from '../lib/avatars'

export function Dictionary() {
  const { role } = useAuth()
  const canEdit = role === 'teacher' || role === 'admin'
  const [words, setWords] = useState<Word[]>([])
  const [q, setQ] = useState('')
  const [form, setForm] = useState({ word: '', translation: '', example: '', part_of_speech: '', cefr_level: '' })

  async function load() {
    setWords(await api.listWords())
  }
  useEffect(() => {
    load()
  }, [])

  async function add() {
    if (!form.word.trim()) return
    await api.upsertWord({ ...form, word: form.word.trim().toLowerCase() })
    setForm({ word: '', translation: '', example: '', part_of_speech: '', cefr_level: '' })
    load()
  }

  const filtered = words.filter((w) => w.word.includes(q.toLowerCase()) || w.translation.includes(q))

  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <h2 className="mb-2 font-display text-4xl font-semibold">Словарь</h2>
      <p className="mb-6 text-mute">Единая база слов. Одно слово хранится один раз и используется везде.</p>

      {canEdit && (
        <div className="mb-6 grid gap-2 rounded-2xl border border-line bg-paper p-4 sm:grid-cols-6">
          <input value={form.word} onChange={(e) => setForm({ ...form, word: e.target.value })} placeholder="word" className={`${inputCls}`} />
          <input value={form.translation} onChange={(e) => setForm({ ...form, translation: e.target.value })} placeholder="перевод" className={`${inputCls}`} />
          <input value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} placeholder="пример" className={`${inputCls} sm:col-span-2`} />
          <input value={form.cefr_level} onChange={(e) => setForm({ ...form, cefr_level: e.target.value })} placeholder="CEFR" className={`${inputCls}`} />
          <Button onClick={add}>Добавить</Button>
        </div>
      )}

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск…" className={`${inputCls} mb-4 w-full`} />

      <div className="grid gap-2 sm:grid-cols-2">
        {filtered.map((w) => (
          <div key={w.id} className="flex items-start justify-between gap-2 rounded-2xl border border-line bg-paper p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-semibold">{w.word}</span>
                <SpeakerButton text={w.word} className="h-6 w-6 text-xs" />
                {w.cefr_level && <Badge>{w.cefr_level}</Badge>}
              </div>
              <p className="text-plum">{w.translation}</p>
              {w.example && <p className="mt-1 text-sm text-mute">{w.example}</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function Settings() {
  const { settings, updateSettings, userId, email, role, profile, refresh } = useAuth()
  const [nickname, setNickname] = useState(profile?.full_name ?? '')
  const [avatar, setAvatar] = useState(profile?.avatar ?? 'cat')
  const [savedMsg, setSavedMsg] = useState('')
  const [reqMsg, setReqMsg] = useState(profile?.teacher_request === 'pending' ? 'pending' : '')

  useEffect(() => {
    setNickname(profile?.full_name ?? '')
    setAvatar(profile?.avatar ?? 'cat')
  }, [profile?.full_name, profile?.avatar])

  async function saveProfile() {
    if (!userId) return
    await api.updateProfile(userId, { full_name: nickname.trim(), avatar })
    await refresh()
    setSavedMsg('Сохранено ✓')
    setTimeout(() => setSavedMsg(''), 1500)
  }

  async function askTeacher() {
    if (!userId) return
    await api.requestTeacher(userId)
    await refresh()
    setReqMsg('pending')
  }

  return (
    <section className="mx-auto max-w-xl px-6 pb-24">
      <h2 className="mb-6 font-display text-4xl font-semibold">Настройки</h2>

      {/* profile: nickname + avatar */}
      <div className="mb-6 space-y-4 rounded-2xl border border-line bg-paper p-6">
        <div className="flex items-center gap-3">
          <Avatar id={avatar} size={56} ring />
          <div>
            <p className="font-body font-semibold">Профиль</p>
            <p className="text-sm text-mute">Ник и аватарка видны учителю и админу.</p>
          </div>
        </div>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="ник" className={`${inputCls} w-full`} />
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <div className="flex items-center gap-3">
          <Button onClick={saveProfile} disabled={!nickname.trim()}>Сохранить профиль</Button>
          {savedMsg && <span className="text-sm text-[var(--color-good)]">{savedMsg}</span>}
        </div>
      </div>

      {/* become a teacher */}
      {role === 'student' && (
        <div className="mb-6 rounded-2xl border border-line bg-paper p-6">
          <p className="font-body font-semibold">Хочешь стать учителем?</p>
          <p className="mb-3 text-sm text-mute">Отправь заявку — администратор её рассмотрит и выдаст доступ.</p>
          {reqMsg === 'pending' ? (
            <Badge>Заявка отправлена — ждём одобрения</Badge>
          ) : (
            <Button variant="soft" onClick={askTeacher}>Отправить заявку</Button>
          )}
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-line bg-paper p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body font-semibold">Перевод слов</p>
            <p className="text-sm text-mute">Показывать перевод при наведении / нажатии на английское слово.</p>
          </div>
          <button
            onClick={() => updateSettings({ translations_enabled: !settings.translations_enabled })}
            className={`relative h-7 w-12 rounded-full transition-colors ${settings.translations_enabled ? 'bg-plum' : 'bg-line'}`}
            aria-pressed={settings.translations_enabled}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-paper transition-all ${settings.translations_enabled ? 'left-6' : 'left-1'}`}
            />
          </button>
        </div>
        <p className="text-xs text-mute">
          Режим переводов (задел на будущее): <b>{settings.translation_mode}</b>. Скоро — уровни A0–A2 / A2–B2 / B2–C1.
        </p>
      </div>

      <div className="mt-6 space-y-1 rounded-2xl border border-line bg-paper p-6 text-sm">
        <p className="font-body font-semibold">Аккаунт</p>
        <p className="text-mute">{email}</p>
        <p className="text-mute">Роль: {role}</p>
        <p className="text-mute">Имя: {profile?.full_name || '—'}</p>
        <p className="mt-2 text-xs text-mute">
          Ваш ID (для учителя): <code className="rounded bg-lilac px-1">{userId}</code>
        </p>
      </div>
    </section>
  )
}
