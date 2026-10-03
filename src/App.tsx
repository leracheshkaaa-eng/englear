import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import * as api from './lib/api'
import type { Lesson } from './lib/api'
import { Button } from './lib/ui'
import { LessonsCatalog, LessonPlayer } from './features/lessons'
import { Login, NewPassword, StudentProgress } from './features/account'
import { Avatar } from './lib/avatars'
import { Shop, WalletChip } from './features/shop'
import { useTranslation } from 'react-i18next'
import { Homework, JoinPage } from './features/classes'
import { Footer, Pricing, Privacy, Refund, Terms, pageFromPath, type PublicPage } from './features/legal'

// sections most visitors never open load on demand
const TeacherMode = lazy(() => import('./features/teacher').then((m) => ({ default: m.TeacherMode })))
const Dictionary = lazy(() => import('./features/dictionary').then((m) => ({ default: m.Dictionary })))
const Settings = lazy(() => import('./features/dictionary').then((m) => ({ default: m.Settings })))
const Flashcards = lazy(() => import('./features/flashcards').then((m) => ({ default: m.Flashcards })))
const AiTutor = lazy(() => import('./features/ai').then((m) => ({ default: m.AiTutor })))
const Boards = lazy(() => import('./features/boards').then((m) => ({ default: m.Boards })))
const AdminDashboard = lazy(() => import('./features/admin').then((m) => ({ default: m.AdminDashboard })))

type View = 'home' | 'lessons' | 'practice' | 'player' | 'shop' | 'teacher' | 'flashcards' | 'dictionary' | 'settings' | 'admin' | 'progress' | 'login' | 'ai' | 'boards' | PublicPage

function Shell() {
  const { loading, userId, role, profile, signOut, settings, recovering } = useAuth()
  const { t, i18n } = useTranslation()
  const [view, setView] = useState<View>(() => pageFromPath(location.pathname) ?? 'home')
  const [lessonCount, setLessonCount] = useState(0) // library + teacher lessons this viewer can open
  const [progress, setProgress] = useState<Record<string, api.LessonProgress>>({})
  const [passes, setPasses] = useState<Record<string, api.PassSummary>>({})
  const [active, setActive] = useState<Lesson | null>(null)
  const [wallet, setWallet] = useState<api.Wallet>(api.EMPTY_WALLET)
  const [backTo, setBackTo] = useState<'lessons' | 'practice'>('lessons') // where the player returns
  const [flashTarget, setFlashTarget] = useState<api.SetProgress | null>(null) // set opened from Progress
  const [deepLink, setDeepLink] = useState<{ id: string; lesson: Lesson | null; denied: boolean } | null>(null)
  const [joinCode, setJoinCode] = useState<string | null>(null) // /join/<CODE> from a teacher's invite
  const [boardId, setBoardId] = useState<string | null>(null) // open whiteboard
  const [lessonBoardId, setLessonBoardId] = useState<string | null>(null) // board attached to the open lesson

  const reload = useCallback(async () => {
    // only totals here: the catalog loads its own pages
    Promise.all([
      api.lessonCatalog({ scope: 'library' }, 0, 1).then((r) => r.total).catch(() => 0),
      userId ? api.lessonCatalog({ scope: 'teacher' }, 0, 1).then((r) => r.total).catch(() => 0) : 0,
    ]).then(([a, b]) => setLessonCount(a + b))
    if (userId) {
      const p = await api.myProgress(userId)
      setProgress(Object.fromEntries(p.map((x) => [x.lesson_id, x])))
      setPasses(api.summarizePasses(await api.studentPasses(userId).catch(() => [])))
    } else {
      setProgress({})
      setPasses({})
    }
  }, [userId])


  useEffect(() => {
    if (!loading) reload()
  }, [loading, reload])

  // a whiteboard attached to the lesson being played (visible if shared / assigned)
  useEffect(() => {
    setLessonBoardId(null)
    if (view !== 'player' || !active || !userId) return
    api.lessonBoard(active.id).then((b) => setLessonBoardId(b?.id ?? null)).catch(() => {})
  }, [view, active, userId])

  // coins and streak: refreshed on every page change (one small query)
  useEffect(() => {
    if (!userId) return setWallet(api.EMPTY_WALLET)
    api.myWallet(userId).then(setWallet).catch(() => {})
  }, [userId, view])

  // Deep link /lesson/<id> — works for guests (public lessons) and is RLS-protected.
  useEffect(() => {
    async function resolvePath() {
      const j = location.pathname.match(/^\/join\/([A-Za-z0-9]{4,12})\/?$/)
      setJoinCode(j ? j[1].toUpperCase() : null)
      const m = location.pathname.match(/^\/lesson\/([0-9a-f-]{10,})/i)
      if (m) {
        const lesson = await api.getLesson(m[1]).catch(() => null)
        setDeepLink({ id: m[1], lesson, denied: !lesson })
      } else {
        setDeepLink(null)
        const page = pageFromPath(location.pathname)
        if (page) setView(page)
        else if (location.pathname === '/') setView((v) => (pageFromPath('/' + v) ? 'home' : v))
      }
    }
    resolvePath()
    const onPop = () => resolvePath()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [loading, userId])

  function go(v: View) {
    setView(v)
    setFlashTarget(null)
    setBoardId(null)
    const path = pageFromPath('/' + v) ? '/' + v : '/'
    if (location.pathname !== path) history.pushState({}, '', path)
    window.scrollTo(0, 0)
    setDeepLink(null)
  }

  if (loading) return <div className="grid min-h-screen place-items-center text-mute">{t('common.loading')}</div>

  // ---- the user came from a password-reset email ----
  if (recovering) {
    return (
      <Page>
        <NewPassword onDone={() => go('home')} />
      </Page>
    )
  }

  // ---- invite link from a teacher ----
  if (joinCode) {
    return (
      <Page>
        <JoinPage
          code={joinCode}
          onDone={() => {
            history.pushState({}, '', '/')
            setJoinCode(null)
            setView('lessons')
            reload()
          }}
        />
      </Page>
    )
  }

  // ---- deep-linked lesson takes over the whole screen ----
  if (deepLink) {
    return (
      <Page>
        {deepLink.lesson ? (
          <LessonPlayer
            lesson={deepLink.lesson}
            onDone={() => {
              history.pushState({}, '', '/')
              setDeepLink(null)
              setView('lessons')
              reload()
            }}
          />
        ) : (
          <section className="mx-auto max-w-md px-6 pt-24 text-center">
            <h2 className="font-display text-3xl font-semibold">{t('lessons.unavailableTitle')}</h2>
            <p className="mt-3 text-mute">{t('lessons.unavailableText')}</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={() => { history.pushState({}, '', '/'); setDeepLink(null); setView('lessons') }}>{t('lessons.backToLessons')}</Button>
              {!userId && <Button variant="soft" onClick={() => { history.pushState({}, '', '/'); setDeepLink(null); setView('login') }}>{t('common.signIn')}</Button>}
            </div>
          </section>
        )}
      </Page>
    )
  }

  const isTeacher = role === 'teacher' || role === 'admin'
  const nav: [View, string][] = [
    ['home', t('nav.home')],
    ['lessons', t('nav.lessons')],
    ['practice', t('nav.practice')],
  ]
  if (!userId) nav.push(['pricing', t('nav.pricing')])
  if (userId) nav.push(['ai', t('nav.ai')], ['boards', t('nav.boards')], ['flashcards', t('nav.flashcards')], ['dictionary', t('nav.dictionary')], ['progress', t('nav.progress')])
  if (isTeacher) nav.push(['teacher', t('nav.teacher')])
  if (role === 'admin') nav.push(['admin', t('nav.admin')])

  return (
    <Page>
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6">
        <button onClick={() => go('home')} className="flex items-center gap-2 font-display text-2xl font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-plum text-paper">E</span>
          Englear
        </button>
        <nav className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold">
          {nav.map(([v, label]) => (
            <button
              key={v}
              onClick={() => go(v)}
              className={`rounded-full px-3.5 py-1.5 transition-colors ${view === v ? 'bg-plum text-paper' : 'text-mute hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div>
          {userId ? (
            <div className="flex items-center gap-2">
              <WalletChip wallet={wallet} onClick={() => go('shop')} />
              <button onClick={() => go('settings')} title={profile?.full_name ?? t('nav.settings')} className="rounded-full transition-transform hover:scale-105">
                <Avatar id={profile?.avatar} size={36} frame={profile?.frame} />
              </button>
              <Button variant="ghost" onClick={() => signOut()}>
                {t('common.signOut')}
              </Button>
            </div>
          ) : (
            <Button variant="soft" onClick={() => go('login')}>
              {t('common.signIn')}
            </Button>
          )}
        </div>
      </header>

      <main>
        <Suspense fallback={<p className="py-24 text-center text-mute">{t('common.loading')}</p>}>
        {view === 'home' && <Home role={role} onStart={() => go('lessons')} onLogin={() => go('login')} count={lessonCount} />}
        {view === 'lessons' && userId && (
          <Homework
            onOpenLesson={async (id) => {
              const lesson = await api.getLesson(id).catch(() => null)
              if (!lesson) return
              setActive(lesson)
              setBackTo('lessons')
              setView('player')
            }}
            onOpenSets={() => go('flashcards')}
          />
        )}
        {(view === 'lessons' || view === 'practice') && (
          <LessonsCatalog
            key={view}
            kind={view === 'practice' ? 'practice' : 'lesson'}
            progress={progress}
            passes={passes}
            onOpen={async (id) => {
              const lesson = await api.getLesson(id).catch(() => null)
              if (!lesson) return
              setActive(lesson)
              setBackTo(view)
              setView('player')
            }}
          />
        )}
        {view === 'player' && active && lessonBoardId && (
          <div className="mx-auto max-w-3xl px-6 pb-2 text-right">
            <Button variant="soft" onClick={() => { setView('boards'); setBoardId(lessonBoardId) }}>
              📋 {t('boards.lessonBoard')}
            </Button>
          </div>
        )}
        {view === 'player' && active && (
          <LessonPlayer lesson={active} onDone={() => { reload(); setView(backTo) }} />
        )}
        {view === 'teacher' && isTeacher && <TeacherMode reload={reload} />}
        {view === 'flashcards' && userId && (
          <Flashcards
            target={flashTarget}
            onTargetDone={() => {
              setFlashTarget(null)
              setView('progress')
            }}
          />
        )}
        {view === 'ai' && userId && <AiTutor onSpent={() => api.myWallet(userId).then(setWallet).catch(() => {})} onShop={() => go('shop')} />}
        {view === 'boards' && userId && <Boards openId={boardId} onOpen={setBoardId} />}
        {view === 'dictionary' && userId && <Dictionary />}
        {view === 'progress' && userId && (
          <StudentProgress
            onOpenSet={(p) => {
              setFlashTarget(p)
              setView('flashcards')
            }}
          />
        )}
        {view === 'settings' && userId && <Settings />}
        {view === 'shop' && userId && <Shop wallet={wallet} onWallet={setWallet} />}
        {view === 'admin' && role === 'admin' && <AdminDashboard />}
        {view === 'login' && <Login onClose={() => { reload(); setView('home') }} onOpenPage={go} />}
        {view === 'pricing' && <Pricing onStart={() => go('lessons')} />}
        {view === 'terms' && <Terms />}
        {view === 'refund' && <Refund />}
        {view === 'privacy' && <Privacy />}
        </Suspense>
      </main>
      <Footer onOpen={go} />
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>
}

function Home({ role, onStart, onLogin, count }: { role: string; onStart: () => void; onLogin: () => void; count: number }) {
  const { t } = useTranslation()
  return (
    <section className="mx-auto max-w-3xl px-6 pt-20 pb-24 text-center">
      <span className="inline-block rounded-full border border-line bg-paper px-4 py-1 font-body text-sm text-mute">
        {t('home.tagline')}
      </span>
      <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] sm:text-7xl">
        {t('home.titleLine1')}
        <br />
        <span className="italic text-plum">{t('home.titleLine2')}</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-lg text-mute">{t('home.subtitle')}</p>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button onClick={onStart} className="px-8 py-4 text-lg">
          {t('home.start')}
        </Button>
        {role === 'guest' && (
          <Button variant="ghost" onClick={onLogin}>
            {t('home.signIn')}
          </Button>
        )}
      </div>
      <p className="mt-6 font-body text-sm text-mute/80">{t('home.available', { count })}</p>
    </section>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
