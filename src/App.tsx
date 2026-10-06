import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import * as api from './lib/api'
import type { Lesson } from './lib/api'
import { Button } from './lib/ui'
import { LessonsCatalog, LessonPlayer } from './features/lessons'
import { Login, NewPassword, StudentProgress } from './features/account'
import { Shop } from './features/shop'
import { Header } from './features/header'
import { Dashboard, Landing, NotFound } from './features/home'
import { LeanLoading } from './lib/lean'
import { useTranslation } from 'react-i18next'
import { Homework, JoinPage } from './features/classes'
import { StudyCatalog, StudyPlayer } from './features/study'
import { setPendingInsert } from './features/board/content'
import { Footer, Pricing, Privacy, Refund, Terms, pageFromPath, type PublicPage } from './features/legal'

// sections most visitors never open load on demand
const TeacherMode = lazy(() => import('./features/teacher').then((m) => ({ default: m.TeacherMode })))
const Dictionary = lazy(() => import('./features/dictionary').then((m) => ({ default: m.Dictionary })))
const Settings = lazy(() => import('./features/dictionary').then((m) => ({ default: m.Settings })))
const Flashcards = lazy(() => import('./features/flashcards').then((m) => ({ default: m.Flashcards })))
const AiTutor = lazy(() => import('./features/ai').then((m) => ({ default: m.AiTutor })))
const Boards = lazy(() => import('./features/boards').then((m) => ({ default: m.Boards })))
const AdminDashboard = lazy(() => import('./features/admin').then((m) => ({ default: m.AdminDashboard })))

type View = 'home' | 'study' | 'lessons' | 'practice' | 'player' | 'shop' | 'teacher' | 'flashcards' | 'dictionary' | 'settings' | 'admin' | 'progress' | 'login' | 'ai' | 'boards' | 'notfound' | PublicPage

function Shell() {
  const { loading, userId, role, recovering } = useAuth()
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
  const [studyId, setStudyId] = useState<string | null>(null) // open full lesson
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
        const board = location.pathname.match(/^\/boards(?:\/([0-9a-f-]{36}))?\/?$/)
        if (page) setView(page)
        else if (board) {
          setView('boards')
          setBoardId(board[1] ?? null)
        } else if (location.pathname === '/') setView((v) => (pageFromPath('/' + v) || v === 'boards' || v === 'notfound' ? 'home' : v))
        else setView('notfound')
      }
    }
    resolvePath()
    const onPop = () => resolvePath()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [loading, userId])

  // whiteboards have their own address (/boards/<id>): links and the shape-library browser come back to the board
  function openBoard(id: string | null) {
    setView('boards')
    setBoardId(id)
    const path = id ? `/boards/${id}` : '/boards'
    if (location.pathname !== path) history.pushState({}, '', path)
  }

  function go(v: View) {
    setView(v)
    setFlashTarget(null)
    setBoardId(null)
    setStudyId(null)
    const path = v === 'boards' ? '/boards' : pageFromPath('/' + v) ? '/' + v : '/'
    if (location.pathname !== path) history.pushState({}, '', path)
    window.scrollTo(0, 0)
    setDeepLink(null)
  }

  if (loading) return <div className="grid min-h-screen place-items-center"><LeanLoading text={t('common.loading')} /></div>

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

  return (
    <Page>
      <Header view={view} go={(v) => go(v as View)} wallet={wallet} />

      <main className="pb-16 md:pb-0">
        <Suspense fallback={<LeanLoading />}>
        {view === 'study' &&
          (studyId ? (
            <StudyPlayer
              lessonId={studyId}
              onBack={() => setStudyId(null)}
              onOpenOnBoard={async (l) => {
                if (!userId) return
                const b = await api.createBoard(userId, { title: l.title, kind: 'notes' }).catch(() => null)
                if (!b) return
                setPendingInsert(b.id, l.id)
                openBoard(b.id)
              }}
            />
          ) : (
            <StudyCatalog onOpen={(id) => { setStudyId(id); window.scrollTo(0, 0) }} />
          ))}
        {view === 'home' &&
          (userId ? (
            <Dashboard
              go={(v) => go(v as View)}
              wallet={wallet}
              homework={
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
              }
            />
          ) : (
            <Landing go={(v) => go(v as View)} count={lessonCount} />
          ))}
        {view === 'notfound' && <NotFound onHome={() => go('home')} />}
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
            <Button variant="soft" onClick={() => openBoard(lessonBoardId)}>
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
        {view === 'boards' && userId && <Boards openId={boardId} onOpen={openBoard} />}
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

const AudioEmbed = lazy(() => import('./features/board/audioEmbed'))
const TaskEmbed = lazy(() => import('./features/board/taskEmbed').then((m) => ({ default: m.TaskEmbed })))
const MaterialEmbed = lazy(() => import('./features/board/taskEmbed').then((m) => ({ default: m.MaterialEmbed })))
const BrandPage = lazy(() => import('./features/brand').then((m) => ({ default: m.BrandPage })))

export default function App() {
  // logo files to download (not linked from the menu)
  if (location.pathname === '/brand' || location.pathname === '/brand/')
    return (
      <Suspense fallback={null}>
        <BrandPage />
      </Suspense>
    )
  // the audio player embedded in whiteboards: a bare page without the app around it
  if (location.pathname.startsWith('/embed/audio'))
    return (
      <Suspense fallback={null}>
        <AudioEmbed />
      </Suspense>
    )
  // interactive exercises and practice material embedded in whiteboards
  if (location.pathname.startsWith('/embed/task') || location.pathname.startsWith('/embed/material'))
    return (
      <AuthProvider>
        <Suspense fallback={null}>{location.pathname.startsWith('/embed/task') ? <TaskEmbed /> : <MaterialEmbed />}</Suspense>
      </AuthProvider>
    )
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
