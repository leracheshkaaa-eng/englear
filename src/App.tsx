import { useCallback, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import * as api from './lib/api'
import type { Lesson, Word } from './lib/api'
import { Button } from './lib/ui'
import { LessonsCatalog, LessonPlayer } from './features/lessons'
import { TeacherMode } from './features/teacher'
import { Dictionary, Settings } from './features/dictionary'
import { Flashcards } from './features/flashcards'
import { AdminDashboard } from './features/admin'
import { Login, StudentProgress } from './features/account'
import { Avatar } from './lib/avatars'

type View = 'home' | 'lessons' | 'practice' | 'teacher' | 'flashcards' | 'dictionary' | 'settings' | 'admin' | 'progress' | 'login'

function Shell() {
  const { loading, userId, role, profile, signOut } = useAuth()
  const [view, setView] = useState<View>('home')
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [progress, setProgress] = useState<Record<string, api.LessonProgress>>({})
  const [passes, setPasses] = useState<Record<string, api.PassSummary>>({})
  const [dict, setDict] = useState<Map<string, Word>>(new Map())
  const [active, setActive] = useState<Lesson | null>(null)
  const [deepLink, setDeepLink] = useState<{ id: string; lesson: Lesson | null; denied: boolean } | null>(null)

  const reload = useCallback(async () => {
    try {
      setLessons(await api.listLessons())
    } catch {
      setLessons([])
    }
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
    api.listWords().then((ws) => setDict(new Map(ws.map((w) => [w.word.toLowerCase(), w])))).catch(() => {})
  }, [userId])

  useEffect(() => {
    if (!loading) reload()
  }, [loading, reload])

  // Deep link /lesson/<id> — works for guests (public lessons) and is RLS-protected.
  useEffect(() => {
    async function resolvePath() {
      const m = location.pathname.match(/^\/lesson\/([0-9a-f-]{10,})/i)
      if (m) {
        const lesson = await api.getLesson(m[1]).catch(() => null)
        setDeepLink({ id: m[1], lesson, denied: !lesson })
      } else {
        setDeepLink(null)
      }
    }
    resolvePath()
    const onPop = () => resolvePath()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [loading, userId])

  function go(v: View) {
    setView(v)
    if (location.pathname !== '/') history.pushState({}, '', '/')
    setDeepLink(null)
  }

  if (loading) return <div className="grid min-h-screen place-items-center text-mute">Загрузка…</div>

  // ---- deep-linked lesson takes over the whole screen ----
  if (deepLink) {
    return (
      <Page>
        {deepLink.lesson ? (
          <LessonPlayer
            lesson={deepLink.lesson}
            dict={dict}
            onDone={() => {
              history.pushState({}, '', '/')
              setDeepLink(null)
              setView('lessons')
              reload()
            }}
          />
        ) : (
          <section className="mx-auto max-w-md px-6 pt-24 text-center">
            <h2 className="font-display text-3xl font-semibold">Урок недоступен</h2>
            <p className="mt-3 text-mute">This lesson is private. You don't have access to this lesson.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Button onClick={() => { history.pushState({}, '', '/'); setDeepLink(null); setView('lessons') }}>К урокам</Button>
              {!userId && <Button variant="soft" onClick={() => { history.pushState({}, '', '/'); setDeepLink(null); setView('login') }}>Войти</Button>}
            </div>
          </section>
        )}
      </Page>
    )
  }

  const isTeacher = role === 'teacher' || role === 'admin'
  const nav: [View, string][] = [
    ['home', 'Главная'],
    ['lessons', 'Уроки'],
  ]
  if (userId) nav.push(['flashcards', 'Карточки'], ['dictionary', 'Словарь'], ['progress', 'Прогресс'])
  if (isTeacher) nav.push(['teacher', 'Teacher'])
  if (role === 'admin') nav.push(['admin', 'Admin'])

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
              <button onClick={() => go('settings')} title={profile?.full_name ?? 'Настройки'} className="rounded-full transition-transform hover:scale-105">
                <Avatar id={profile?.avatar} size={36} />
              </button>
              <Button variant="ghost" onClick={() => signOut()}>
                Выйти
              </Button>
            </div>
          ) : (
            <Button variant="soft" onClick={() => go('login')}>
              Войти
            </Button>
          )}
        </div>
      </header>

      <main>
        {view === 'home' && <Home role={role} onStart={() => go('lessons')} onLogin={() => go('login')} count={lessons.length} />}
        {view === 'lessons' && (
          <LessonsCatalog
            lessons={lessons}
            progress={progress}
            passes={passes}
            onOpen={(l) => {
              setActive(l)
              setView('practice')
            }}
          />
        )}
        {view === 'practice' && active && (
          <LessonPlayer lesson={active} dict={dict} onDone={() => { reload(); setView('lessons') }} />
        )}
        {view === 'teacher' && isTeacher && <TeacherMode lessons={lessons} reload={reload} />}
        {view === 'flashcards' && userId && <Flashcards />}
        {view === 'dictionary' && userId && <Dictionary />}
        {view === 'progress' && userId && <StudentProgress lessons={lessons} />}
        {view === 'settings' && userId && <Settings />}
        {view === 'admin' && role === 'admin' && <AdminDashboard />}
        {view === 'login' && <Login onClose={() => { reload(); setView('home') }} />}
      </main>
    </Page>
  )
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>
}

function Home({ role, onStart, onLogin, count }: { role: string; onStart: () => void; onLogin: () => void; count: number }) {
  return (
    <section className="mx-auto max-w-3xl px-6 pt-20 pb-24 text-center">
      <span className="inline-block rounded-full border border-line bg-paper px-4 py-1 font-body text-sm text-mute">
        английский всей семьёй
      </span>
      <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] sm:text-7xl">
        Учитесь спокойно,
        <br />
        <span className="italic text-plum">шаг за шагом</span>
      </h1>
      <p className="mx-auto mt-6 max-w-xl text-lg text-mute">
        Полноценные упражнения на все навыки, словарь, флеш-карточки и прогресс. Уроки, классы и назначения —
        всё в одном месте.
      </p>
      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button onClick={onStart} className="px-8 py-4 text-lg">
          Начать урок
        </Button>
        {role === 'guest' && (
          <Button variant="ghost" onClick={onLogin}>
            Войти →
          </Button>
        )}
      </div>
      <p className="mt-6 font-body text-sm text-mute/80">Доступно уроков: {count}</p>
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
