import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import type { DailyKind, DailyMeme, DailyNews, DailyPoll, DailyPost, DailyWord } from '../lib/api'
import { useAuth } from '../lib/auth'
import { nextQuestion, today } from '../lib/interests'
import { Lean, LeanSays, type LeanPose } from '../lib/lean'
import { Button, inputCls } from '../lib/ui'
import { errorMessage } from '../i18n/errors'

/* ============================================================
   "Lean of the day" (meme, word, poll, news) and Lean's short interest questions.
   ============================================================ */

const POSES: LeanPose[] = ['neutral', 'sly', 'happy', 'surprised', 'angry', 'lying', 'curious', 'front', 'side', 'back', 'paw']
const card = 'rounded-3xl border border-line bg-paper p-5'

/* ---------------- Lean asks about interests ---------------- */

export function LeanAsks() {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [data, setData] = useState<api.UserInterests | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [own, setOwn] = useState('')
  const [thanks, setThanks] = useState(false)

  useEffect(() => {
    if (userId) api.myInterests(userId).then(setData).catch(() => {})
  }, [userId])

  if (!userId || !data) return null
  if (thanks)
    return (
      <div className={`${card} lean-pop`}>
        <LeanSays pose="happy" size={64}>
          {t('interests.thanks')}
        </LeanSays>
      </div>
    )
  const q = nextQuestion(data.asked)
  if (!q) return null

  async function save(skip: boolean) {
    const extra = own.trim() ? [`custom:${own.trim().slice(0, 40)}`] : []
    const next: api.UserInterests = {
      interests: skip ? data!.interests : [...new Set([...data!.interests, ...picked, ...extra])].slice(0, 80),
      asked: { ...data!.asked, [q!.key]: skip ? `skip:${today()}` : today() },
    }
    await api.saveInterests(userId!, next).catch(() => {})
    setData(next)
    if (!skip) setThanks(true)
  }

  return (
    <div className={card}>
      <LeanSays pose="curious" size={64}>
        {t(`interests.q.${q.key}` as 'interests.q.watch')}
      </LeanSays>
      <div className="mt-4 flex flex-wrap gap-2">
        {q.items.map((it) => {
          const on = picked.includes(it.key)
          return (
            <button
              key={it.key}
              onClick={() => setPicked((p) => (on ? p.filter((x) => x !== it.key) : [...p, it.key]))}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${on ? 'border-plum bg-plum text-paper' : 'border-line bg-paper hover:border-lavender'}`}
            >
              {it.emoji} {it.name ?? t(`interests.items.${it.key}` as 'interests.items.anime')}
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder={t('interests.own')} className={`${inputCls} min-w-0 flex-1 py-1.5 text-sm`} maxLength={40} />
        <Button onClick={() => save(false)} disabled={!picked.length && !own.trim()}>
          {t('interests.done')}
        </Button>
        <button onClick={() => save(true)} className="px-2 text-sm text-mute hover:text-ink">
          {t('interests.skip')}
        </button>
      </div>
    </div>
  )
}

/* ---------------- the feed ---------------- */

export function LeanDaily() {
  const { t } = useTranslation()
  const [feed, setFeed] = useState<Partial<Record<DailyKind, DailyPost>> | null>(null)

  useEffect(() => {
    api.dailyFeed().then(setFeed).catch(() => setFeed({}))
  }, [])

  if (!feed) return null
  const empty = !feed.meme && !feed.word && !feed.poll && !feed.news

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="font-display text-3xl font-semibold">
          {t('daily.title')} <span className="text-plum">✦</span>
        </h2>
        <span className="text-sm text-mute">{new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</span>
      </div>
      {empty ? (
        <div className={`${card} flex items-center gap-4`}>
          <Lean pose="lying" size={70} motion="breathe" />
          <p className="text-mute">{t('daily.empty')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {feed.meme && <MemeCard m={feed.meme.content as DailyMeme} />}
          <div className="grid gap-4">
            {feed.word && <WordCard w={feed.word.content as DailyWord} />}
            {feed.poll && <PollCard post={feed.poll} />}
          </div>
          {feed.news && (
            <div className="md:col-span-2">
              <NewsCard n={feed.news.content as DailyNews} url={feed.news.source_url} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export function MemeCard({ m }: { m: DailyMeme }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const pose = (POSES.includes(m.pose as LeanPose) ? m.pose : 'sly') as LeanPose
  const caption = 'font-display text-[22px] font-bold uppercase leading-tight tracking-wide text-paper [text-shadow:0_2px_0_#2f2a33,0_-2px_0_#2f2a33,2px_0_0_#2f2a33,-2px_0_0_#2f2a33]'
  return (
    <div className={`${card} flex flex-col`}>
      <p className="mb-3 text-sm font-semibold text-mute">😂 {t('daily.kinds.meme')}</p>
      <div className="relative flex min-h-64 flex-1 flex-col items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-b from-mist via-cream to-blush px-4 py-4 text-center">
        <p className={caption}>{m.top}</p>
        <Lean pose={pose} size={150} className="my-2" />
        <p className={caption}>{m.bottom}</p>
      </div>
      {m.note && (
        <button onClick={() => setOpen((v) => !v)} className="mt-3 text-left text-sm text-plum hover:underline">
          {open ? m.note : `💡 ${t('daily.explain')}`}
        </button>
      )}
    </div>
  )
}

export function WordCard({ w }: { w: DailyWord }) {
  const { t } = useTranslation()
  return (
    <div className={card}>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-mute">
        ✨ {t('daily.kinds.word')}
        {w.slang && <span className="rounded-full bg-honey/50 px-2 py-0.5 text-xs text-ink">{t('daily.slang')}</span>}
      </p>
      <p className="font-display text-3xl font-semibold text-plum">{w.word}</p>
      <p className="mt-1">{w.meaning}</p>
      {w.example && <p className="mt-2 text-sm italic text-mute">“{w.example}”</p>}
    </div>
  )
}

export function PollCard({ post, preview }: { post: DailyPost; preview?: boolean }) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const p = post.content as DailyPoll
  const [mine, setMine] = useState<number | null>(null)
  const [votes, setVotes] = useState<number[] | null>(null)

  useEffect(() => {
    if (preview || !userId) return
    api.myPollVote(post.id, userId).then((c) => {
      setMine(c)
      if (c !== null) api.pollResults(post.id).then(setVotes).catch(() => {})
    }).catch(() => {})
  }, [post.id, userId, preview])

  async function vote(i: number) {
    if (preview || !userId || mine !== null) return
    setMine(i)
    await api.votePoll(post.id, userId, i).catch(() => {})
    setVotes(await api.pollResults(post.id).catch(() => null))
  }
  const total = votes ? votes.reduce((a, b) => a + b, 0) : 0

  return (
    <div className={card}>
      <p className="mb-2 text-sm font-semibold text-mute">📊 {t('daily.kinds.poll')}</p>
      <p className="font-display text-xl font-semibold">{p.question}</p>
      <div className="mt-3 space-y-2">
        {p.options.map((o, i) => {
          const pct = votes && total ? Math.round((votes[i] / total) * 100) : 0
          return (
            <button key={i} onClick={() => vote(i)} disabled={mine !== null} className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm font-semibold ${mine === i ? 'border-plum' : 'border-line'} ${mine === null ? 'hover:border-lavender' : ''}`}>
              {votes && <span className="absolute inset-y-0 left-0 bg-lilac" style={{ width: `${pct}%` }} />}
              <span className="relative flex justify-between gap-2">
                <span>{o}</span>
                {votes && <span className="text-mute">{pct}%</span>}
              </span>
            </button>
          )
        })}
      </div>
      {votes && <p className="mt-2 text-xs text-mute">{t('daily.votes', { n: total })}</p>}
    </div>
  )
}

export function NewsCard({ n, url }: { n: DailyNews; url: string | null }) {
  const { t } = useTranslation()
  const [level, setLevel] = useState<'easy' | 'medium' | 'hard'>('easy')
  const [shown, setShown] = useState<string | null>(null)
  return (
    <div className={card}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-mute">📰 {t('daily.kinds.news')}</p>
        <div className="flex gap-1 rounded-full border border-line p-0.5 text-xs font-semibold">
          {(['easy', 'medium', 'hard'] as const).map((l) => (
            <button key={l} onClick={() => setLevel(l)} className={`rounded-full px-3 py-1 ${level === l ? 'bg-plum text-paper' : 'text-mute'}`}>
              {t(`daily.levels.${l}`)}
            </button>
          ))}
        </div>
      </div>
      <h3 className="font-display text-2xl font-semibold">{n.title}</h3>
      <p className="mt-2 whitespace-pre-line leading-relaxed">{n[level]}</p>
      {n.words?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {n.words.map((w) => (
            <button key={w.word} onClick={() => setShown(shown === w.word ? null : w.word)} className="rounded-full bg-lilac/60 px-3 py-1 text-sm">
              <b>{w.word}</b>
              {shown === w.word && <span className="text-mute"> — {w.meaning}</span>}
            </button>
          ))}
        </div>
      )}
      {n.question && <p className="mt-3 rounded-2xl bg-cream px-4 py-2 text-sm">🦊 {n.question}</p>}
      {url && (
        <a href={url} target="_blank" rel="noreferrer noopener" className="mt-3 inline-block text-xs text-mute underline">
          {t('daily.source')}: {n.source_name || new URL(url).hostname}
        </a>
      )}
    </div>
  )
}

/* ---------------- admin: drafts → approve ---------------- */

const EMPTY: Record<DailyKind, Record<string, unknown>> = {
  meme: { pose: 'sly', top: '', bottom: '', note: '' },
  word: { word: '', meaning: '', example: '', slang: false },
  poll: { question: '', options: ['', ''] },
  news: { title: '', easy: '', medium: '', hard: '', words: [], question: '', source_name: '' },
}

export function AdminDaily() {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [posts, setPosts] = useState<DailyPost[]>([])
  const [edit, setEdit] = useState<Partial<DailyPost> | null>(null)
  const [err, setErr] = useState('')
  const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)

  const load = () => api.adminDailyPosts(from).then(setPosts).catch((e) => setErr(errorMessage(e)))
  useEffect(() => {
    load()
  }, [])

  async function status(p: DailyPost, s: 'approved' | 'rejected' | 'draft') {
    setErr('')
    try {
      await api.adminSetDailyStatus(p.id, s, userId!)
      load()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }
  async function remove(p: DailyPost) {
    if (!confirm(t('daily.admin.confirmDelete'))) return
    await api.adminDeleteDaily(p.id).catch((e) => setErr(errorMessage(e)))
    load()
  }

  const days = [...new Set(posts.map((p) => p.day))]
  const drafts = posts.filter((p) => p.status === 'draft').length

  return (
    <div className="mb-8 rounded-2xl border border-line bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl font-semibold">✦ {t('daily.title')}</h3>
          <p className="text-sm text-mute">{t('daily.admin.hint', { n: drafts })}</p>
        </div>
        <Button variant="soft" onClick={() => setEdit({ day: today(), kind: 'meme', content: EMPTY.meme, source_url: null })}>
          + {t('daily.admin.add')}
        </Button>
      </div>
      {err && <p className="mt-2 text-sm text-warn">{err}</p>}
      {edit && <DailyEditor post={edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), load())} />}
      <div className="mt-4 space-y-4">
        {days.length === 0 && <p className="text-sm text-mute">{t('daily.admin.none')}</p>}
        {days.map((d) => (
          <div key={d}>
            <p className="mb-2 text-sm font-semibold">{new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <div className="space-y-2">
              {posts
                .filter((p) => p.day === d)
                .map((p) => (
                  <div key={p.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${p.status === 'approved' ? 'border-[var(--color-good)]/50 bg-[rgba(63,143,107,.06)]' : p.status === 'rejected' ? 'border-line opacity-50' : 'border-line'}`}>
                    <span className="min-w-0 flex-1 truncate">
                      <b>{t(`daily.kinds.${p.kind}`)}</b> · {summary(p)} {p.origin === 'ai' && <span className="text-xs text-mute">· AI</span>}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {p.status !== 'approved' && (
                        <button onClick={() => status(p, 'approved')} className="rounded-full bg-[var(--color-good)] px-3 py-1 text-xs font-semibold text-paper">
                          ✓ {t('daily.admin.approve')}
                        </button>
                      )}
                      {p.status === 'approved' && (
                        <button onClick={() => status(p, 'draft')} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-mute">
                          {t('daily.admin.unpublish')}
                        </button>
                      )}
                      {p.status === 'draft' && (
                        <button onClick={() => status(p, 'rejected')} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-mute">
                          {t('daily.admin.reject')}
                        </button>
                      )}
                      <button onClick={() => setEdit(p)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-mute">
                        {t('common.edit')}
                      </button>
                      <button onClick={() => remove(p)} className="rounded-full px-2 py-1 text-xs text-mute hover:text-warn">
                        ×
                      </button>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function summary(p: DailyPost) {
  const c = p.content as Record<string, unknown>
  return String(c.top ?? c.word ?? c.question ?? c.title ?? '') + (c.bottom ? ` / ${c.bottom}` : '')
}

function DailyEditor({ post, onClose, onSaved }: { post: Partial<DailyPost>; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [day, setDay] = useState(post.day ?? today())
  const [kind, setKind] = useState<DailyKind>(post.kind ?? 'meme')
  const [c, setC] = useState<Record<string, unknown>>(post.content ?? EMPTY.meme)
  const [url, setUrl] = useState(post.source_url ?? '')
  const [err, setErr] = useState('')
  const set = (k: string, v: unknown) => setC((x) => ({ ...x, [k]: v }))
  const field = (k: string, label: string, area = false) => (
    <label className="block text-sm">
      <span className="text-mute">{label}</span>
      {area ? (
        <textarea value={String(c[k] ?? '')} onChange={(e) => set(k, e.target.value)} rows={3} className={`${inputCls} mt-1 w-full`} />
      ) : (
        <input value={String(c[k] ?? '')} onChange={(e) => set(k, e.target.value)} className={`${inputCls} mt-1 w-full`} />
      )}
    </label>
  )

  async function save() {
    setErr('')
    try {
      const content = { ...c }
      if (kind === 'poll') content.options = (content.options as string[]).map((o) => o.trim()).filter(Boolean)
      if (kind === 'news' && typeof content.words === 'string') content.words = parseWords(content.words as string)
      await api.adminSaveDaily({ id: post.id, day, kind, content, source_url: url.trim() || null })
      onSaved()
    } catch (e) {
      setErr(errorMessage(e))
    }
  }

  const preview: DailyPost = { id: 'preview', day, kind, status: 'draft', content: c, source_url: url || null, origin: 'manual', approved_at: null, created_at: '' }
  const words = Array.isArray(c.words) ? (c.words as { word: string; meaning: string }[]).map((w) => `${w.word} = ${w.meaning}`).join('\n') : String(c.words ?? '')

  return (
    <div className="mt-4 grid gap-4 rounded-2xl border border-plum/30 bg-lilac/20 p-4 md:grid-cols-2">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputCls} />
          <select
            value={kind}
            disabled={!!post.id}
            onChange={(e) => {
              const k = e.target.value as DailyKind
              setKind(k)
              setC(EMPTY[k])
            }}
            className={inputCls}
          >
            {api.DAILY_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`daily.kinds.${k}`)}
              </option>
            ))}
          </select>
        </div>
        {kind === 'meme' && (
          <>
            <select value={String(c.pose)} onChange={(e) => set('pose', e.target.value)} className={`${inputCls} w-full`}>
              {POSES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            {field('top', t('daily.admin.top'))}
            {field('bottom', t('daily.admin.bottom'))}
            {field('note', t('daily.admin.note'), true)}
          </>
        )}
        {kind === 'word' && (
          <>
            {field('word', t('daily.admin.word'))}
            {field('meaning', t('daily.admin.meaning'))}
            {field('example', t('daily.admin.example'))}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!c.slang} onChange={(e) => set('slang', e.target.checked)} /> {t('daily.slang')}
            </label>
          </>
        )}
        {kind === 'poll' && (
          <>
            {field('question', t('daily.admin.question'))}
            {(c.options as string[]).map((o, i) => (
              <input
                key={i}
                value={o}
                onChange={(e) => set('options', (c.options as string[]).map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`${t('daily.admin.option')} ${i + 1}`}
                className={`${inputCls} w-full`}
              />
            ))}
            {(c.options as string[]).length < 4 && (
              <button onClick={() => set('options', [...(c.options as string[]), ''])} className="text-sm text-plum">
                + {t('daily.admin.option')}
              </button>
            )}
          </>
        )}
        {kind === 'news' && (
          <>
            {field('title', t('daily.admin.headline'))}
            {field('easy', t('daily.levels.easy'), true)}
            {field('medium', t('daily.levels.medium'), true)}
            {field('hard', t('daily.levels.hard'), true)}
            <label className="block text-sm">
              <span className="text-mute">{t('daily.admin.words')}</span>
              <textarea value={words} onChange={(e) => set('words', e.target.value)} rows={3} className={`${inputCls} mt-1 w-full`} placeholder="weird = strange" />
            </label>
            {field('question', t('daily.admin.question'))}
            {field('source_name', t('daily.admin.sourceName'))}
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className={`${inputCls} w-full`} />
          </>
        )}
        {err && <p className="text-sm text-warn">{err}</p>}
        <div className="flex gap-2">
          <Button onClick={save}>{t('common.save')}</Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm text-mute">{t('daily.admin.preview')}</p>
        {kind === 'meme' && <MemeCard m={c as DailyMeme} />}
        {kind === 'word' && <WordCard w={c as DailyWord} />}
        {kind === 'poll' && <PollCard post={preview} preview />}
        {kind === 'news' && <NewsCard n={{ ...(c as DailyNews), words: typeof c.words === 'string' ? parseWords(c.words) : ((c.words as DailyNews['words']) ?? []) }} url={null} />}
      </div>
    </div>
  )
}

function parseWords(s: string) {
  return s
    .split('\n')
    .map((l) => l.split('='))
    .filter((p) => p[0]?.trim() && p[1]?.trim())
    .map(([w, m]) => ({ word: w.trim(), meaning: m.trim() }))
}

