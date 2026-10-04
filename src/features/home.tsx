import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import { useAuth } from '../lib/auth'
import { Lean, LeanSays, type LeanPose } from '../lib/lean'
import { Button } from '../lib/ui'

/* ============================================================
   The home page: a landing for guests, a small dashboard for signed-in learners.
   Lean greets both.
   ============================================================ */

export function Landing({ go, count }: { go: (v: string) => void; count: number }) {
  const { t } = useTranslation()
  const features: { icon: string; key: string; view: string }[] = [
    { icon: '📚', key: 'lessons', view: 'study' },
    { icon: '✏️', key: 'tasks', view: 'lessons' },
    { icon: '📖', key: 'practice', view: 'practice' },
    { icon: '🦊', key: 'ai', view: 'login' },
    { icon: '🖍️', key: 'boards', view: 'login' },
    { icon: '👨‍👩‍👧', key: 'family', view: 'login' },
  ]
  const faq = ['free', 'age', 'teacher', 'level'] as const
  return (
    <>
      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-6 px-6 pt-6 pb-16 md:gap-10 md:grid-cols-[1.2fr_1fr] md:pt-16">
        <div className="text-center md:text-left">
          <span className="inline-block rounded-full border border-line bg-paper px-4 py-1 font-body text-sm text-mute">{t('home.tagline')}</span>
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] sm:text-6xl">
            {t('home.titleLine1')}
            <br />
            <span className="italic text-plum">{t('home.titleLine2')}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-mute md:mx-0">{t('home.subtitle')}</p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row md:justify-start">
            <Button onClick={() => go('login')} className="px-8 py-4 text-lg">
              {t('landing.startFree')}
            </Button>
            <Button variant="ghost" onClick={() => go('study')}>
              {t('landing.look')}
            </Button>
          </div>
          <p className="mt-5 font-body text-sm text-mute/80">{t('home.available', { count })}</p>
        </div>
        <div className="relative order-first mx-auto flex flex-col items-center md:order-none">
          <div className="absolute inset-x-6 top-10 bottom-4 -z-10 rounded-[3rem] bg-gradient-to-br from-honey/40 via-blush/40 to-mist/60" />
          <div className="lean-pop mb-2 rounded-2xl border border-line bg-paper px-5 py-3 font-display text-xl shadow-[0_8px_24px_-16px_rgba(47,42,51,0.5)]">
            {t('landing.hi')}
          </div>
          <Lean pose="front" size={340} motion="breathe" className="max-h-[48vw] md:max-h-none" />
        </div>
      </section>

      {/* what's inside */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="text-center font-display text-3xl font-semibold sm:text-4xl">{t('landing.insideTitle')}</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <button key={f.key} onClick={() => go(f.view)} className="group rounded-3xl border border-line bg-paper p-6 text-left transition hover:-translate-y-0.5 hover:border-plum/40 hover:shadow-[0_16px_40px_-28px_rgba(47,42,51,0.6)]">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-cream text-2xl">{f.icon}</span>
              <h3 className="mt-4 font-display text-xl font-semibold">{t(`landing.f.${f.key}.title` as 'landing.f.lessons.title')}</h3>
              <p className="mt-1.5 text-mute">{t(`landing.f.${f.key}.text` as 'landing.f.lessons.text')}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Lean's pitch */}
      <section className="mx-auto max-w-5xl px-6 pb-16">
        <div className="flex flex-col items-center gap-6 rounded-[2rem] bg-graphite p-8 text-paper sm:flex-row sm:p-10">
          <Lean pose="sly" size={150} motion="breathe" />
          <div>
            <h2 className="font-display text-3xl font-semibold">{t('landing.leanTitle')}</h2>
            <p className="mt-2 max-w-xl text-paper/80">{t('landing.leanText')}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => go('pricing')}>{t('landing.seePricing')}</Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h2 className="text-center font-display text-3xl font-semibold">{t('landing.faqTitle')}</h2>
        <div className="mt-6 space-y-3">
          {faq.map((k) => (
            <details key={k} className="group rounded-2xl border border-line bg-paper p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                {t(`landing.faq.${k}.q` as 'landing.faq.free.q')}
                <span className="text-plum transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-mute">{t(`landing.faq.${k}.a` as 'landing.faq.free.a')}</p>
            </details>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center gap-4 text-center">
          <LeanSays pose="happy" size={90}>{t('landing.finalCall')}</LeanSays>
          <Button onClick={() => go('login')} className="px-8 py-4 text-lg">
            {t('landing.startFree')}
          </Button>
        </div>
      </section>
    </>
  )
}

/** Signed-in home: Lean's greeting, streak and coins, the next lesson, homework. */
export function Dashboard({
  go,
  wallet,
  onOpenStudy,
  homework,
}: {
  go: (v: string) => void
  wallet: api.Wallet
  onOpenStudy: (id: string) => void
  homework: React.ReactNode
}) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [next, setNext] = useState<api.StudyLessonSummary | null>(null)

  useEffect(() => {
    api.listStudyLessons().then((l) => setNext(l[0] ?? null)).catch(() => {})
  }, [])

  const h = new Date().getHours()
  const part = h < 5 ? 'night' : h < 12 ? 'morning' : h < 18 ? 'day' : h < 23 ? 'evening' : 'night'
  const streak = api.liveStreak(wallet)
  const pose: LeanPose = streak >= 3 ? 'happy' : part === 'night' ? 'sly' : 'neutral'
  const name = profile?.full_name ?? ''

  const tiles: { icon: string; view: string; label: string }[] = [
    { icon: '✏️', view: 'lessons', label: t('nav.tasks') },
    { icon: '📖', view: 'practice', label: t('nav.practice') },
    { icon: '🃏', view: 'flashcards', label: t('nav.flashcards') },
    { icon: '🦊', view: 'ai', label: t('nav.ai') },
  ]

  return (
    <section className="mx-auto max-w-5xl px-6 pt-6 pb-16">
      <div className="flex flex-col gap-6 rounded-[2rem] bg-gradient-to-br from-cream via-paper to-mist/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <LeanSays pose={pose} size={110}>
          <span className="font-display text-xl font-semibold">{t(`dash.hello.${part}` as 'dash.hello.morning', { name })}</span>
          <br />
          <span className="text-mute">{streak > 0 ? t('dash.keepStreak', { n: streak }) : t('dash.startStreak')}</span>
        </LeanSays>
        <div className="flex gap-3 self-center">
          <Stat icon="🔥" value={streak} label={t('dash.streak')} />
          <Stat icon="🪙" value={wallet.balance} label={t('dash.coins')} onClick={() => go('shop')} />
        </div>
      </div>

      {next && (
        <button onClick={() => onOpenStudy(next.id)} className="mt-6 flex w-full items-center gap-5 rounded-3xl bg-plum p-6 text-left text-paper transition hover:bg-plum-deep">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-paper/15 text-3xl">📚</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-paper/70">{t('dash.continue')}</span>
            <span className="block truncate font-display text-2xl font-semibold">{next.title}</span>
            <span className="text-sm text-paper/70">
              {next.cefr} · {t('course.minutes', { n: next.duration_min })}
            </span>
          </span>
          <span className="text-2xl">→</span>
        </button>
      )}

      <div className="mt-6">{homework}</div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((x) => (
          <button key={x.view} onClick={() => go(x.view)} className="rounded-2xl border border-line bg-paper p-4 text-left font-semibold transition hover:border-plum/40">
            <span className="block text-2xl">{x.icon}</span>
            <span className="mt-2 block">{x.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

function Stat({ icon, value, label, onClick }: { icon: string; value: number; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="min-w-24 rounded-2xl border border-line bg-paper px-4 py-3 text-center">
      <span className="block font-display text-2xl font-semibold">
        {icon} {value}
      </span>
      <span className="text-xs text-mute">{label}</span>
    </button>
  )
}

/** Unknown address: Lean got lost. */
export function NotFound({ onHome }: { onHome: () => void }) {
  const { t } = useTranslation()
  return (
    <section className="mx-auto flex max-w-md flex-col items-center px-6 pt-16 pb-24 text-center">
      <Lean pose="lying" size={130} motion="breathe" />
      <p className="mt-6 font-display text-6xl font-semibold text-plum">404</p>
      <h1 className="mt-2 font-display text-3xl font-semibold">{t('notFound.title')}</h1>
      <p className="mt-2 text-mute">{t('notFound.text')}</p>
      <Button onClick={onHome} className="mt-6">
        {t('notFound.home')}
      </Button>
    </section>
  )
}
