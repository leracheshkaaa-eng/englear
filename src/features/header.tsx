import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Wallet } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Avatar } from '../lib/avatars'
import { LeanLogo } from '../lib/lean'
import { Button } from '../lib/ui'
import { WalletChip } from './shop'

/* ============================================================
   The site header: logo with Lean, the main sections, an "More" menu, the account menu;
   on phones a bottom bar with the main places and a sheet with everything else.
   ============================================================ */

export type NavItem = { view: string; label: string; icon: string }

export function Header({
  view,
  go,
  wallet,
}: {
  view: string
  go: (v: string) => void
  wallet: Wallet
}) {
  const { t } = useTranslation()
  const { userId, role, profile, signOut } = useAuth()
  const isTeacher = role === 'teacher' || role === 'admin'
  const [moreOpen, setMoreOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [sheet, setSheet] = useState(false)

  const main: NavItem[] = [
    { view: 'home', label: t('nav.home'), icon: '🏠' },
    { view: 'study', label: t('nav.lessons'), icon: '📚' },
    { view: 'lessons', label: t('nav.tasks'), icon: '✏️' },
    { view: 'practice', label: t('nav.practice'), icon: '📖' },
  ]
  const more: NavItem[] = userId
    ? [
        { view: 'ai', label: t('nav.ai'), icon: '🦊' },
        { view: 'boards', label: t('nav.boards'), icon: '🖍️' },
        { view: 'flashcards', label: t('nav.flashcards'), icon: '🃏' },
        { view: 'dictionary', label: t('nav.dictionary'), icon: '📕' },
        { view: 'progress', label: t('nav.progress'), icon: '📈' },
        ...(isTeacher ? [{ view: 'teacher', label: t('nav.teacher'), icon: '🧑‍🏫' }] : []),
        ...(role === 'admin' ? [{ view: 'admin', label: t('nav.admin'), icon: '⚙️' }] : []),
      ]
    : [{ view: 'pricing', label: t('nav.pricing'), icon: '💶' }]

  const pick = (v: string) => {
    setMoreOpen(false)
    setAccountOpen(false)
    setSheet(false)
    go(v)
  }
  const navCls = (active: boolean) => `rounded-full px-3.5 py-1.5 transition-colors ${active ? 'bg-plum text-paper' : 'text-mute hover:text-ink'}`
  const moreActive = more.some((m) => m.view === view)

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line/60 bg-sand/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button onClick={() => pick('home')} className="pt-3 transition-transform hover:-rotate-2" aria-label="Englear">
            <LeanLogo className="text-[32px] sm:text-[34px]" />
          </button>

          {/* desktop navigation */}
          <nav className="hidden items-center gap-1 rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold md:flex">
            {main.map((m) => (
              <button key={m.view} onClick={() => pick(m.view)} className={navCls(view === m.view)}>
                {m.label}
              </button>
            ))}
            {userId ? (
              <Dropdown
                open={moreOpen}
                setOpen={setMoreOpen}
                button={<span className={navCls(moreActive)}>{t('nav.more')} ▾</span>}
              >
                {more.map((m) => (
                  <MenuItem key={m.view} active={view === m.view} onClick={() => pick(m.view)}>
                    <span className="w-6 text-center">{m.icon}</span> {m.label}
                  </MenuItem>
                ))}
              </Dropdown>
            ) : (
              more.map((m) => (
                <button key={m.view} onClick={() => pick(m.view)} className={navCls(view === m.view)}>
                  {m.label}
                </button>
              ))
            )}
          </nav>

          <div className="flex items-center gap-2">
            {userId ? (
              <>
                <WalletChip wallet={wallet} onClick={() => pick('shop')} />
                <Dropdown
                  open={accountOpen}
                  setOpen={setAccountOpen}
                  align="right"
                  button={
                    <span className="block rounded-full transition-transform hover:scale-105" title={profile?.full_name ?? ''}>
                      <Avatar id={profile?.avatar} size={36} frame={profile?.frame} />
                    </span>
                  }
                >
                  <p className="px-3 pt-1 pb-2 text-sm font-semibold">{profile?.full_name}</p>
                  <MenuItem onClick={() => pick('settings')}>⚙️ {t('nav.settings')}</MenuItem>
                  <MenuItem onClick={() => pick('shop')}>🪙 {t('shop.title')}</MenuItem>
                  <MenuItem onClick={() => pick('progress')}>📈 {t('nav.progress')}</MenuItem>
                  <MenuItem
                    onClick={() => {
                      setAccountOpen(false)
                      signOut()
                    }}
                  >
                    🚪 {t('common.signOut')}
                  </MenuItem>
                </Dropdown>
              </>
            ) : (
              <Button variant="soft" onClick={() => pick('login')}>
                {t('common.signIn')}
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* phones: bottom bar + a sheet with everything */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {[...main, { view: userId ? 'ai' : 'pricing', label: userId ? t('nav.aiShort') : t('nav.pricing'), icon: userId ? '🦊' : '💶' }].map((m) => (
            <button key={m.view} onClick={() => pick(m.view)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${view === m.view ? 'text-plum' : 'text-mute'}`}>
              <span className="text-lg leading-none">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
        {userId && (
          <button onClick={() => setSheet(true)} className="absolute -top-11 right-3 rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-semibold text-mute shadow">
            ☰ {t('nav.more')}
          </button>
        )}
      </nav>
      {sheet && (
        <div className="fixed inset-0 z-50 bg-graphite/30 md:hidden" onClick={() => setSheet(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-paper p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
            <div className="grid grid-cols-3 gap-2">
              {more.map((m) => (
                <button key={m.view} onClick={() => pick(m.view)} className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-sm font-semibold ${view === m.view ? 'border-plum bg-lilac text-plum-deep' : 'border-line'}`}>
                  <span className="text-2xl">{m.icon}</span>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Dropdown({
  open,
  setOpen,
  button,
  children,
  align = 'left',
}: {
  open: boolean
  setOpen: (v: boolean) => void
  button: React.ReactNode
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open, setOpen])
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}>{button}</button>
      {open && (
        <div className={`lean-pop absolute top-full z-40 mt-2 w-56 rounded-2xl border border-line bg-paper p-1.5 shadow-[0_16px_40px_-20px_rgba(47,42,51,0.5)] ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold ${active ? 'bg-lilac text-plum-deep' : 'text-ink hover:bg-lilac/50'}`}>
      {children}
    </button>
  )
}
