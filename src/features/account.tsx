import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, inputCls } from '../lib/ui'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { Lesson, SetProgress } from '../lib/api'
import { Avatar, AvatarPicker, DEFAULT_AVATAR, avatarLabel } from '../lib/avatars'
import { LanguageSelect } from '../i18n/LanguageSelect'
import { currentLanguage } from '../i18n'
import { errorMessage } from '../i18n/errors'
import { libraryTitle } from './flashcards'

export function Login({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation()
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [avatar, setAvatar] = useState(DEFAULT_AVATAR)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setErr('')
    setInfo('')
    try {
      if (mode === 'in') {
        await signIn(email, password)
        onClose?.()
      } else {
        if (!nickname.trim()) {
          setErr(t('auth.nicknameRequired'))
          return
        }
        // the language picked in the form (or detected) is the current UI language
        const { needsConfirmation } = await signUp({ email, password, nickname: nickname.trim(), avatar, interfaceLanguage: currentLanguage() })
        if (needsConfirmation) {
          // Account exists but email must be confirmed first — don't fake a login.
          setMode('in')
          setInfo(t('auth.confirmEmail'))
          return
        }
        onClose?.()
      }
    } catch (e) {
      setErr(errorMessage(e))
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
            {m === 'in' ? t('auth.signInTab') : t('auth.signUpTab')}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {mode === 'up' && (
          <>
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3">
              <Avatar id={avatar} size={52} ring />
              <div>
                <p className="font-body font-semibold">{nickname || t('auth.yourNickname')}</p>
                <p className="text-xs text-mute">{avatarLabel(avatar)}</p>
              </div>
            </div>
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t('auth.nicknamePlaceholder')} className={`${inputCls} w-full`} />
            <div>
              <p className="mb-2 text-sm text-mute">{t('auth.pickAnimal')}</p>
              <AvatarPicker value={avatar} onChange={setAvatar} />
            </div>
            <div>
              <p className="mb-2 text-sm text-mute">{t('auth.interfaceLanguage')}</p>
              <LanguageSelect />
            </div>
          </>
        )}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.email')} className={`${inputCls} w-full`} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={t('auth.password')} className={`${inputCls} w-full`} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        {err && <p className="text-sm text-warn">{err}</p>}
        {info && <p className="rounded-xl bg-lilac/70 p-3 text-sm text-plum-deep">{info}</p>}
        <Button onClick={submit} disabled={busy || !email || !password} className="w-full">
          {busy ? '…' : mode === 'in' ? t('auth.signInButton') : t('auth.signUpButton')}
        </Button>
      </div>
      <p className="mt-4 text-center text-xs text-mute">{mode === 'in' ? t('auth.noAccountHint') : t('auth.teacherLaterHint')}</p>
    </section>
  )
}

export function StudentProgress({ lessons, onOpenSet }: { lessons: Lesson[]; onOpenSet: (p: SetProgress) => void }) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [progress, setProgress] = useState<api.LessonProgress[]>([])
  const [cards, setCards] = useState<any[]>([])
  const [known, setKnown] = useState(0)
  const [sets, setSets] = useState<SetProgress[]>([])

  useEffect(() => {
    if (!userId) return
    api.myProgress(userId).then(setProgress)
    api.cardProgress(userId).then(setCards)
    api.knownWordsCount(userId).then(setKnown).catch(() => setKnown(0))
    api.mySetProgress(userId).then(setSets).catch(() => setSets([]))
  }, [userId])

  const byLesson = Object.fromEntries(progress.map((p) => [p.lesson_id, p]))
  const completed = progress.filter((p) => p.status === 'completed').length

  return (
    <section className="mx-auto max-w-3xl px-6 pb-24">
      <h2 className="mb-6 font-display text-4xl font-semibold">{t('progress.title')}</h2>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label={t('progress.lessonsCompleted')} value={completed} />
        <Stat label={t('progress.wordsKnown')} value={known} />
        <Stat label={t('progress.cardsInProgress')} value={cards.length} />
      </div>

      {sets.length > 0 && (
        <>
          <h3 className="mb-3 font-display text-2xl font-semibold">{t('progress.flashcardSets')}</h3>
          <div className="mb-8 space-y-2">
            {sets.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper p-4">
                <div>
                  <p className="font-body font-semibold">{s.library_key ? libraryTitle(s.library_key) : s.title}</p>
                  <p className="text-sm text-mute">
                    {t('progress.wordsCount', { known: s.known_count, total: s.total_count })} · {t(`sets.status.${s.status}`)}
                    {s.status === 'completed' && s.practice_total
                      ? ` · ${t('progress.practiceScore', { correct: s.practice_correct ?? 0, total: s.practice_total })}`
                      : ''}
                  </p>
                </div>
                <Button variant={s.status === 'in_progress' ? 'solid' : 'soft'} onClick={() => onOpenSet(s)}>
                  {s.status === 'in_progress' ? t('sets.continue') : s.status === 'practice_available' ? t('sets.takePractice') : t('sets.review')}
                </Button>
              </div>
            ))}
          </div>
          <h3 className="mb-3 font-display text-2xl font-semibold">{t('progress.lessons')}</h3>
        </>
      )}

      <div className="space-y-2">
        {lessons.map((l) => {
          const p = byLesson[l.id]
          return (
            <div key={l.id} className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4">
              <span className="font-body font-semibold">{l.title}</span>
              {p?.status === 'completed' ? (
                <Badge>✓ {p.score}%</Badge>
              ) : p?.status === 'in_progress' ? (
                <span className="text-sm text-mute">{t('progress.inProgress')}</span>
              ) : (
                <span className="text-sm text-mute">{t('progress.notStarted')}</span>
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
