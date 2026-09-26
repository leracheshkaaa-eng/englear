import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, SpeakerButton, inputCls } from '../lib/ui'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { Flashcard, FlashcardSet, SetProgress, SetRef, Word, WordType } from '../lib/api'
import { CEFR_LEVELS, IELTS_CATEGORIES, SET_SIZES, TOPICS, ieltsLabel, topicLabel } from '../lib/config'
import i18n from '../i18n'
import { evaluate, sameResponse, type Exercise, type Response } from '../lib/exercises'
import { generatePractice, type StudyItem } from '../lib/practice'
import { ExerciseView } from './lessons'

type Tab = 'library' | 'mine'

/** `target` opens a set straight from the Progress page ("Continue"). */
export function Flashcards({ target, onTargetDone }: { target?: SetProgress | null; onTargetDone?: () => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('library')
  if (target) {
    return (
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <ProgressStudy progress={target} onBack={() => onTargetDone?.()} />
      </section>
    )
  }
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-4xl font-semibold">{t('nav.flashcards')}</h2>
        <div className="flex rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold">
          {(['library', 'mine'] as Tab[]).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`rounded-full px-4 py-1.5 transition-colors ${tab === tb ? 'bg-plum text-paper' : 'text-mute'}`}
            >
              {tb === 'library' ? t('flashcards.library') : t('flashcards.mySets')}
            </button>
          ))}
        </div>
      </div>
      {tab === 'library' ? <Library /> : <MySets />}
    </section>
  )
}

/* ============================================================
   LIBRARY — ready-made, auto-generated sets from the dictionary
   ============================================================ */

type Selection =
  | { kind: 'topic'; value: string }
  | { kind: 'ielts'; value: string }
  | { kind: 'type'; value: WordType }

function Library() {
  const { t } = useTranslation()
  const [sel, setSel] = useState<Selection | null>(null)
  if (sel) return <TopicSetup selection={sel} onBack={() => setSel(null)} />

  return (
    <div className="space-y-10">
      <Group title={t('flashcards.topics')} hint={t('flashcards.topicsHint')}>
        {TOPICS.filter((tp) => tp !== 'Other').map((tp) => (
          <Tile key={tp} label={topicLabel(tp)} onClick={() => setSel({ kind: 'topic', value: tp })} />
        ))}
      </Group>

      <Group title={t('flashcards.ielts')} hint={t('flashcards.ieltsHint')} accent>
        {IELTS_CATEGORIES.map((c) => (
          <Tile key={c} label={ieltsLabel(c)} onClick={() => setSel({ kind: 'ielts', value: c })} accent />
        ))}
      </Group>

      <Group title={t('flashcards.lexicalFocus')} hint={t('flashcards.lexicalFocusHint')}>
        <Tile label={t('wordTypes.collocation')} onClick={() => setSel({ kind: 'type', value: 'collocation' })} />
        <Tile label={t('wordTypes.phrasal_verb')} onClick={() => setSel({ kind: 'type', value: 'phrasal_verb' })} />
      </Group>
    </div>
  )
}

function Group({ title, hint, children, accent }: { title: string; hint: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-3">
        <h3 className={`font-display text-2xl font-semibold ${accent ? 'text-plum' : ''}`}>{title}</h3>
        <span className="text-sm text-mute">{hint}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
    </div>
  )
}

function Tile({ label, onClick, accent }: { label: string; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left font-body font-semibold transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-20px_rgba(60,42,112,0.5)] ${
        accent ? 'border-plum/30 bg-lilac/60 text-plum-deep' : 'border-line bg-paper'
      }`}
    >
      {label}
    </button>
  )
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

function TopicSetup({ selection, onBack }: { selection: Selection; onBack: () => void }) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [levels, setLevels] = useState<string[]>([])
  const [size, setSize] = useState<number>(20)
  const [pool, setPool] = useState<Word[]>([])
  const [known, setKnown] = useState<Set<string>>(new Set())
  const [setProgress, setSetProgress] = useState<Record<string, SetProgress>>({})
  const [playing, setPlaying] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const title = selectionLabel(selection.kind, selection.value)
  // identifies "Set N" of this selection; its word list is snapshotted on first open
  const keyFor = (i: number) => `${selection.kind}:${selection.value}|${[...levels].sort().join(',')}|${size}|${i}`

  async function loadPool() {
    setLoading(true)
    const lv = levels.length ? levels : undefined
    const filter =
      selection.kind === 'topic'
        ? { topic: selection.value, levels: lv }
        : selection.kind === 'ielts'
          ? { ielts_category: selection.value, levels: lv }
          : { word_type: selection.value, levels: lv }
    setPool(await api.dictionaryPool(filter))
    if (userId) {
      const [wp, sp] = await Promise.all([api.wordProgress(userId), api.mySetProgress(userId).catch(() => [])])
      setKnown(new Set(wp.filter((w) => w.status === 'known').map((w) => w.word_id)))
      setSetProgress(Object.fromEntries(sp.filter((p) => p.library_key).map((p) => [p.library_key!, p])))
    }
    setLoading(false)
  }

  useEffect(() => {
    loadPool()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels.join(','), selection.value])

  const sets = useMemo(() => chunk(pool, size), [pool, size])
  const knownCount = pool.filter((w) => known.has(w.id)).length
  const pct = pool.length ? Math.round((knownCount / pool.length) * 100) : 0
  const firstIncomplete = sets.findIndex((s) => !s.every((w) => known.has(w.id)))

  function toggleLevel(l: string) {
    setLevels((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]))
  }

  if (playing !== null) {
    const key = keyFor(playing)
    const saved = setProgress[key]
    const fresh = sets[playing] ?? []
    return (
      <StudyPlayer
        title={libraryTitle(key)}
        sref={{ libraryKey: key }}
        itemKind="word"
        // a started set keeps the words it was started with, even if the dictionary changed
        loadItems={async () => (saved ? await api.wordsByIds(saved.items) : fresh).map(wordToItem)}
        onBack={() => {
          setPlaying(null)
          loadPool()
        }}
      />
    )
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 font-body text-sm text-mute hover:text-ink">← {t('flashcards.library')}</button>
      <h3 className="font-display text-3xl font-semibold">{title}</h3>

      {/* level picker (multi-select) */}
      <p className="mt-5 mb-2 text-sm font-semibold">{t('flashcards.chooseLevels')}</p>
      <div className="flex flex-wrap gap-2">
        {CEFR_LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => toggleLevel(l)}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
              levels.includes(l) ? 'border-plum bg-plum text-paper' : 'border-line text-mute hover:border-lavender'
            }`}
          >
            {l}
          </button>
        ))}
        {levels.length > 0 && (
          <button onClick={() => setLevels([])} className="px-3 text-sm text-mute underline">{t('flashcards.clear')}</button>
        )}
      </div>
      <p className="mt-1 text-xs text-mute">{t('flashcards.noLevelHint')}</p>

      {/* size picker */}
      <p className="mt-5 mb-2 text-sm font-semibold">{t('flashcards.cardsPerSet')}</p>
      <div className="flex flex-wrap gap-2">
        {SET_SIZES.map((s) => (
          <button
            key={s}
            onClick={() => setSize(s)}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              size === s ? 'border-plum bg-lilac text-plum-deep' : 'border-line text-mute hover:border-lavender'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* progress summary + generated sets */}
      {loading ? (
        <p className="mt-8 text-mute">{t('common.loading')}</p>
      ) : pool.length === 0 ? (
        <p className="mt-8 text-mute">{t('flashcards.noVocabulary')}</p>
      ) : (
        <>
          <div className="mt-8 rounded-2xl border border-line bg-paper p-5">
            <div className="flex items-center justify-between">
              <p className="font-body font-semibold">{t('flashcards.wordsLearned', { known: knownCount, total: pool.length })}</p>
              <Badge>{pct}%</Badge>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-lilac">
              <div className="h-full rounded-full bg-plum transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-mute">
              {t('flashcards.setsSummary', { sets: sets.length, size, total: pool.length })}
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {sets.map((s, i) => {
              const done = s.filter((w) => known.has(w.id)).length
              const complete = done === s.length
              const locked = firstIncomplete !== -1 && i > firstIncomplete
              const status = complete ? 'done' : i === firstIncomplete ? 'current' : locked ? 'locked' : 'open'
              const sp = setProgress[keyFor(i)]
              return (
                <button
                  key={i}
                  disabled={locked && !sp}
                  onClick={() => setPlaying(i)}
                  className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-colors ${
                    locked && !sp ? 'cursor-not-allowed border-line bg-paper/60 opacity-50' : 'border-line bg-paper hover:border-plum'
                  }`}
                >
                  <div>
                    <p className="font-body font-semibold">{t('flashcards.setN', { n: i + 1 })}</p>
                    <p className="text-xs text-mute">{t('flashcards.learnedOf', { known: done, total: s.length })}</p>
                    {sp && <p className="text-xs font-semibold text-plum">{t(`sets.status.${sp.status}`)}</p>}
                  </div>
                  {status === 'done' && <Badge>✓ {t('flashcards.done')}</Badge>}
                  {status === 'current' && <span className="text-sm font-semibold text-plum">{t('progress.inProgress')} →</span>}
                  {status === 'open' && <span className="text-sm text-mute">{t('flashcards.start')} →</span>}
                  {status === 'locked' && <span className="text-sm text-mute">🔒 {t('flashcards.locked')}</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ============================================================
   STUDY — one player for every kind of set (library, own, assigned)
   with saved progress, rounds, completion, practice and review.
   ============================================================ */

/** Translated name of a library selection (topic, IELTS category or word type). */
function selectionLabel(kind: string, value: string) {
  if (kind === 'topic') return topicLabel(value)
  if (kind === 'ielts') return ieltsLabel(value)
  return i18n.t(`wordTypes.${value}` as never) as string
}

/** Title of a library set from its key ("topic:Food|A1|20|0" -> "Food · Set 1"), in the current language. */
export function libraryTitle(key: string) {
  const [head, , , index] = key.split('|')
  const [kind, ...rest] = head.split(':')
  return `${selectionLabel(kind, rest.join(':'))} · ${i18n.t('flashcards.setN', { n: Number(index) + 1 })}`
}

const wordToItem = (w: Word): StudyItem => ({
  id: w.id,
  front: w.word,
  back: w.translation,
  pronunciation: w.pronunciation,
  definition: w.definition,
  example: w.examples?.[0] ?? w.example,
  cefr: w.cefr_level,
})

/** Cards of an own/teacher set; cards made from a dictionary word get its extra data. */
async function loadSetItems(setId: string): Promise<StudyItem[]> {
  const cards = await api.listCards(setId)
  const words = await api.wordsByIds(cards.map((c) => c.word_id).filter((id): id is string => !!id))
  const byId = new Map(words.map((w) => [w.id, w]))
  return cards.map((c: Flashcard) => {
    const base: StudyItem = { id: c.id, front: c.front, back: c.back, example: c.example }
    const w = c.word_id ? byId.get(c.word_id) : undefined
    return w
      ? { ...base, pronunciation: w.pronunciation, definition: w.definition, cefr: w.cefr_level, example: base.example || w.examples?.[0] || w.example }
      : base
  })
}

/** Opens a set from its saved progress (Progress page → Continue). */
function ProgressStudy({ progress, onBack }: { progress: SetProgress; onBack: () => void }) {
  if (progress.set_id) {
    const setId = progress.set_id
    return <StudyPlayer title={progress.title} sref={{ setId }} itemKind="card" loadItems={() => loadSetItems(setId)} onBack={onBack} />
  }
  return (
    <StudyPlayer
      title={libraryTitle(progress.library_key!)}
      sref={{ libraryKey: progress.library_key! }}
      itemKind="word"
      loadItems={() => api.wordsByIds(progress.items).then((ws) => ws.map(wordToItem))}
      onBack={onBack}
    />
  )
}

/** Keep saved progress in step with the set's current cards (cards may be added/removed). */
function reconcile(p: SetProgress, list: StudyItem[]): Partial<SetProgress> | null {
  const ids = list.map((i) => i.id)
  if (ids.length === p.items.length && ids.every((id, k) => p.items[k] === id)) return null
  const idSet = new Set(ids)
  const statuses = Object.fromEntries(Object.entries(p.statuses).filter(([id]) => idSet.has(id)))
  const current = p.queue[p.position]
  const added = ids.filter((id) => !p.items.includes(id))
  let queue = [...p.queue.filter((id) => idSet.has(id)), ...added]
  let position = current && idSet.has(current) ? queue.indexOf(current) : Math.min(p.position, Math.max(queue.length - 1, 0))
  const known = ids.filter((id) => statuses[id] === 'known').length
  let status = p.status
  if (known < ids.length && (status !== 'in_progress' || queue.length === 0)) {
    // new cards in a finished set: study the ones not known yet
    status = 'in_progress'
    queue = ids.filter((id) => statuses[id] !== 'known')
    position = 0
  }
  return { items: ids, statuses, queue, position, known_count: known, total_count: ids.length, status }
}

type StudyMode = 'loading' | 'study' | 'round' | 'done' | 'practice' | 'review' | 'empty' | 'error'

function StudyPlayer({
  title,
  sref,
  itemKind,
  loadItems,
  onBack,
}: {
  title: string
  sref: SetRef
  itemKind: 'card' | 'word'
  loadItems: () => Promise<StudyItem[]>
  onBack: () => void
}) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [items, setItems] = useState<StudyItem[]>([])
  const [p, setP] = useState<SetProgress | null>(null)
  const [mode, setMode] = useState<StudyMode>('loading')
  const [flipped, setFlipped] = useState(false)
  const [justFinished, setJustFinished] = useState(false)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      const list = await loadItems()
      if (!alive) return
      if (!userId) {
        setError(t('study.errors.signIn'))
        return setMode('error')
      }
      let prog = (await api.getSetProgress(userId, sref)) ?? (await api.startSetProgress(userId, sref, title, itemKind, list.map((i) => i.id)))
      const patch = reconcile(prog, list)
      if (patch) {
        await api.saveSetProgress(prog.id, patch)
        prog = { ...prog, ...patch }
      }
      if (!alive) return
      setItems(list)
      setP(prog)
      if (!list.length) setMode('empty')
      else setMode(prog.status === 'in_progress' ? 'study' : 'done')
    })().catch(() => {
      if (!alive) return
      setError(t('study.errors.load'))
      setMode('error')
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const current = p ? byId.get(p.queue[p.position]) : undefined

  async function save(patch: Partial<SetProgress>) {
    if (!p) return
    await api.saveSetProgress(p.id, patch)
    setP({ ...p, ...patch })
  }

  /** Global per-card / per-word progress (the "words known" statistics). */
  function recordGlobal(item: StudyItem, known: boolean) {
    return itemKind === 'card' ? api.recordCard(item.id, known) : api.recordWord(userId!, item.id, known)
  }

  async function answer(known: boolean) {
    if (!p || !current || busy) return
    setBusy(true)
    setError('')
    const statuses: SetProgress['statuses'] = { ...p.statuses, [current.id]: known ? 'known' : 'review' }
    const known_count = p.items.filter((id) => statuses[id] === 'known').length
    let patch: Partial<SetProgress> = { statuses, known_count }
    let next: StudyMode = 'study'
    if (p.position + 1 < p.queue.length) {
      patch.position = p.position + 1
    } else {
      const remaining = p.items.filter((id) => statuses[id] !== 'known')
      if (remaining.length === 0) {
        // every card marked "I know it": the set is passed
        patch = {
          ...patch,
          status: 'practice_available',
          flashcards_completed_at: new Date().toISOString(),
          practice: generatePractice(items),
          queue: [],
          position: 0,
        }
        next = 'done'
      } else {
        patch = { ...patch, queue: remaining, position: 0, round: p.round + 1 }
        next = 'round'
      }
    }
    try {
      await save(patch)
      await recordGlobal(current, known).catch(() => {}) // statistics only; the set progress is saved
      setFlipped(false)
      if (next === 'done') setJustFinished(true)
      setMode(next)
    } catch {
      setError(t('study.errors.saveAnswer'))
    } finally {
      setBusy(false)
    }
  }

  async function startPractice() {
    if (!p) return
    // a retake after completion gets fresh exercises
    const practice = p.practice?.length && p.status !== 'completed' ? p.practice : generatePractice(items)
    try {
      if (practice !== p.practice) await save({ practice })
      setMode('practice')
    } catch {
      setError(t('study.errors.preparePractice'))
    }
  }

  async function finishPractice(correct: number, total: number) {
    try {
      await save({ status: 'completed', practice_correct: correct, practice_total: total, practice_completed_at: new Date().toISOString() })
      setJustFinished(false)
      setMode('done')
    } catch {
      setError(t('study.errors.savePractice'))
    }
  }

  async function reviewAnswer(known: boolean) {
    const item = items[reviewIndex]
    if (!item || busy) return
    setBusy(true)
    await recordGlobal(item, known).catch(() => {})
    setBusy(false)
    setFlipped(false)
    if (reviewIndex + 1 >= items.length) setMode('done')
    else setReviewIndex(reviewIndex + 1)
  }

  const back = (
    <button onClick={onBack} className="mb-4 font-body text-sm text-mute hover:text-ink">
      ← {t('study.backToSets')}
    </button>
  )

  if (mode === 'loading') return <div className="mx-auto max-w-md pb-24">{back}<p className="text-mute">{t('common.loading')}</p></div>
  if (mode === 'error' || !p) return <div className="mx-auto max-w-md pb-24">{back}<p className="text-warn">{error}</p></div>
  if (mode === 'empty') return <div className="mx-auto max-w-md pb-24">{back}<p className="text-mute">{t('study.emptySet')}</p></div>

  const pct = p.total_count ? Math.round((p.known_count / p.total_count) * 100) : 0
  const header = (
    <>
      {back}
      <h3 className="font-display text-2xl font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-mute">
        {t('study.knownOf', { known: p.known_count, total: p.total_count })} · {t(`sets.status.${p.status}`)}
      </p>
      <div className="mt-2 mb-5 h-2 w-full overflow-hidden rounded-full bg-lilac">
        <div className="h-full rounded-full bg-plum transition-all" style={{ width: `${pct}%` }} />
      </div>
    </>
  )

  if (mode === 'practice') {
    return (
      <div className="mx-auto max-w-2xl pb-24">
        {header}
        <PracticePlayer exercises={p.practice ?? []} onFinish={finishPractice} onCancel={() => setMode('done')} />
        {error && <p className="mt-3 text-sm text-warn">{error}</p>}
      </div>
    )
  }

  if (mode === 'round') {
    return (
      <div className="mx-auto max-w-md pb-24 text-center">
        {header}
        <h3 className="font-display text-2xl font-semibold">{t('study.roundDone', { round: p.round - 1 })}</h3>
        <p className="mt-3 text-mute">
          {t('study.roundRemaining', { count: p.queue.length })} {t('study.roundHint')}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => setMode('study')}>{t('sets.continue')}</Button>
          <Button variant="ghost" onClick={onBack}>{t('study.later')}</Button>
        </div>
      </div>
    )
  }

  if (mode === 'done') {
    const practiceCount = p.practice?.length ?? 0
    return (
      <div className="mx-auto max-w-md pb-24 text-center">
        {header}
        <h3 className="font-display text-3xl font-semibold">{justFinished ? `${t('study.setPassed')} 🎉` : t('study.setPassed')}</h3>
        <p className="mt-2 text-mute">{t('study.allKnown', { count: p.total_count })}</p>

        {p.status === 'practice_available' && (
          <div className="mt-6 rounded-2xl border border-plum/30 bg-lilac/50 p-5">
            <p className="font-body font-semibold">{t('study.practiceTitle')}</p>
            <p className="mt-1 text-sm text-mute">
              {t('study.practiceOffer', { count: practiceCount })}
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button onClick={startPractice}>{t('sets.takePractice')}</Button>
              <Button variant="ghost" onClick={onBack}>{t('study.later')}</Button>
            </div>
          </div>
        )}
        {p.status === 'completed' && (
          <div className="mt-6 rounded-2xl border border-line bg-paper p-5">
            <p className="font-body">
              {t('study.practiceResult')} <b className="text-[var(--color-good)]">{p.practice_correct ?? 0} / {p.practice_total ?? 0}</b>
            </p>
            <div className="mt-3">
              <Button variant="soft" onClick={startPractice}>{t('study.practiceAgain')}</Button>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button
            variant="soft"
            onClick={() => {
              setReviewIndex(0)
              setFlipped(false)
              setMode('review')
            }}
          >
            {t('study.reviewCards')}
          </Button>
          <Button variant="ghost" onClick={onBack}>{t('study.toSets')}</Button>
        </div>
        {error && <p className="mt-3 text-sm text-warn">{error}</p>}
      </div>
    )
  }

  const reviewing = mode === 'review'
  const item = reviewing ? items[reviewIndex] : current
  if (!item) return <div className="mx-auto max-w-md pb-24">{header}<p className="text-mute">{t('common.loading')}</p></div>

  return (
    <div className="mx-auto max-w-md pb-24">
      {header}
      <p className="mb-3 text-center text-sm text-mute">
        {reviewing
          ? t('study.reviewProgress', { n: reviewIndex + 1, total: items.length })
          : t('study.roundProgress', { round: p.round, n: p.position + 1, total: p.queue.length })}
      </p>
      <StudyCard
        key={`${mode}-${item.id}-${p.round}`}
        item={item}
        flipped={flipped}
        onFlip={() => setFlipped((f) => !f)}
        onSwipe={(known) => (reviewing ? reviewAnswer(known) : answer(known))}
      />
      <p className="mt-3 text-center text-xs text-mute">{t('study.swipeHint')}</p>
      <div className="mt-4 flex justify-center gap-4">
        <Button variant="danger" disabled={busy} onClick={() => (reviewing ? reviewAnswer(false) : answer(false))}>✗ {t('study.review')}</Button>
        <Button disabled={busy} onClick={() => (reviewing ? reviewAnswer(true) : answer(true))}>✓ {t('study.know')}</Button>
      </div>
      {reviewing && (
        <div className="mt-4 text-center">
          <button onClick={() => setMode('done')} className="text-sm text-mute underline">{t('study.finishReview')}</button>
        </div>
      )}
      {error && <p className="mt-3 text-center text-sm text-warn">{error}</p>}
    </div>
  )
}

/** A flashcard: tap flips it, swiping answers it. Buttons inside (🔊) never flip or swipe it. */
function StudyCard({
  item,
  flipped,
  onFlip,
  onSwipe,
}: {
  item: StudyItem
  flipped: boolean
  onFlip: () => void
  onSwipe: (known: boolean) => void
}) {
  const { t } = useTranslation()
  const [dragX, setDragX] = useState(0)
  const startX = useRef<number | null>(null)
  const dragged = useRef(false) // the pointer moved: the following click is not a tap
  const fromButton = (e: React.SyntheticEvent) => !!(e.target as HTMLElement).closest('button')

  function end() {
    if (startX.current === null) return
    startX.current = null
    const dx = dragX
    setDragX(0)
    if (Math.abs(dx) > 100) onSwipe(dx > 0)
  }

  return (
    <div
      onPointerDown={(e) => {
        if (fromButton(e)) return
        startX.current = e.clientX
        dragged.current = false
      }}
      onPointerMove={(e) => {
        if (startX.current === null) return
        const dx = e.clientX - startX.current
        if (Math.abs(dx) > 10) dragged.current = true
        setDragX(dx)
      }}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={() => {
        startX.current = null
        setDragX(0)
      }}
      onClick={(e) => {
        if (fromButton(e) || dragged.current) {
          dragged.current = false
          return
        }
        onFlip()
      }}
      style={{ transform: `translateX(${dragX}px) rotate(${dragX / 30}deg)` }}
      className="mx-auto flex min-h-[20rem] cursor-pointer select-none flex-col items-center justify-center rounded-3xl border border-line bg-paper p-8 text-center shadow-[0_16px_40px_-24px_rgba(60,42,112,0.5)] transition-transform"
    >
      {!flipped ? (
        <>
          {item.cefr && <Badge>{item.cefr}</Badge>}
          <div className="mt-3 flex items-center gap-3">
            <span className="font-display text-4xl font-semibold">{item.front}</span>
            <SpeakerButton text={item.front} />
          </div>
          {item.pronunciation && <span className="mt-2 text-mute">{item.pronunciation}</span>}
          <span className="mt-4 text-sm text-mute">{t('study.tapToFlip')}</span>
        </>
      ) : (
        <>
          <span className="font-display text-3xl font-semibold text-plum">{item.back}</span>
          {item.definition && <p className="mt-3 text-mute">{item.definition}</p>}
          {item.example && <p className="mt-3 text-sm italic text-mute">“{item.example}”</p>}
        </>
      )}
    </div>
  )
}

/** Short practice after a set, in the regular lesson exercise UI. */
function PracticePlayer({
  exercises,
  onFinish,
  onCancel,
}: {
  exercises: Exercise[]
  onFinish: (correct: number, total: number) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  type A = { response: Response; checkedResponse: Response | null; firstCheck: boolean | null }
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<Record<number, A>>({})
  const [busy, setBusy] = useState(false)
  const dict = useMemo(() => new Map<string, Word>(), [])

  if (!exercises.length) {
    return (
      <div className="text-center">
        <p className="text-mute">{t('study.noPractice')}</p>
        <div className="mt-4"><Button variant="ghost" onClick={onCancel}>{t('common.back')}</Button></div>
      </div>
    )
  }

  const ex = exercises[i]
  const a = answers[i]

  function update(k: number, patch: Partial<A>) {
    const empty: A = { response: {}, checkedResponse: null, firstCheck: null }
    setAnswers((prev) => ({ ...prev, [k]: { ...empty, ...prev[k], ...patch } }))
  }

  async function finish() {
    setBusy(true)
    // first check if it was checked, otherwise the answer as given; no answer = wrong
    const correct = exercises.filter((e, k) => {
      const x = answers[k]
      if (!x) return false
      return x.firstCheck ?? evaluate(e, x.response).correct
    }).length
    await onFinish(correct, exercises.length)
    setBusy(false)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm text-mute">
        <span>{t('study.practiceProgress', { n: i + 1, total: exercises.length })}</span>
        <button onClick={onCancel} className="underline">{t('study.exit')}</button>
      </div>
      <ExerciseView
        key={i}
        ex={ex}
        dict={dict}
        translations={false}
        initial={
          a && {
            response: a.response,
            checked: !!a.checkedResponse && sameResponse(a.checkedResponse, a.response),
            correct: evaluate(ex, a.response).correct,
          }
        }
        onChange={(r) => update(i, { response: r })}
        onCheck={(r, res) => update(i, { response: r, checkedResponse: r, firstCheck: a?.firstCheck ?? res.correct })}
      />
      <div className="mt-6 flex items-center justify-between">
        <Button variant="soft" onClick={() => setI(i - 1)} disabled={i === 0}>← {t('common.back')}</Button>
        {i === exercises.length - 1 ? (
          <Button onClick={finish} disabled={busy}>{busy ? t('common.saving') : `${t('player.finish')} ✓`}</Button>
        ) : (
          <Button onClick={() => setI(i + 1)}>{t('common.next')} →</Button>
        )}
      </div>
    </div>
  )
}

/* ============================================================
   MY SETS — custom, user-created (existing system preserved)
   ============================================================ */

function MySets() {
  const { t } = useTranslation()
  const { userId, role } = useAuth()
  const [sets, setSets] = useState<FlashcardSet[]>([])
  const [active, setActive] = useState<FlashcardSet | null>(null)
  const [creating, setCreating] = useState(false)
  const [progress, setProgress] = useState<Record<string, SetProgress>>({})

  async function load() {
    setSets(await api.listSets())
    if (userId) {
      const sp = await api.mySetProgress(userId).catch(() => [])
      setProgress(Object.fromEntries(sp.filter((p) => p.set_id).map((p) => [p.set_id!, p])))
    }
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (active) {
    const setId = active.id
    return (
      <StudyPlayer
        title={active.title}
        sref={{ setId }}
        itemKind="card"
        loadItems={() => loadSetItems(setId)}
        onBack={() => {
          setActive(null)
          load()
        }}
      />
    )
  }
  if (creating) return <SetEditor onClose={() => { setCreating(false); load() }} />

  const mine = sets.filter((s) => s.owner_id === userId)
  const assigned = sets.filter((s) => s.owner_id !== userId)

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <Button onClick={() => setCreating(true)}>+ {t('flashcards.newSet')}</Button>
      </div>

      <QuickCreate ownSets={mine} onChanged={load} />

      <SetGroup title={role === 'student' ? t('flashcards.myCards') : t('flashcards.mySets')} sets={mine} progress={progress} onOpen={setActive} onDelete={async (id) => { await api.deleteSet(id); load() }} owner />
      <SetGroup title={t('flashcards.assignedToMe')} sets={assigned} progress={progress} onOpen={setActive} />
      {sets.length === 0 && <p className="text-mute">{t('flashcards.noSets')}</p>}
    </div>
  )
}

/* ---------- quick create: type a word, auto-fill from Dictionary ---------- */

function QuickCreate({ ownSets, onChanged }: { ownSets: FlashcardSet[]; onChanged: () => void }) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [term, setTerm] = useState('')
  const [found, setFound] = useState<Word | 'none' | null>(null)
  const [busy, setBusy] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [msg, setMsg] = useState('')

  async function lookup() {
    if (!term.trim()) return
    setBusy(true)
    setMsg('')
    setFound(await api.findWordByText(term).then((w) => w ?? 'none'))
    setBusy(false)
  }

  async function addTo(setId: string) {
    if (!found || found === 'none') return
    const cards = await api.listCards(setId)
    if (cards.some((c) => c.word_id === found.id)) { setMsg(t('dictionary.alreadyInSet')); return }
    await api.addWordToSet(setId, found, cards.length)
    setMsg(t('flashcards.addedWord', { word: found.word }))
    setFound(null); setTerm(''); onChanged()
  }

  async function createAndAdd() {
    if (!userId || !newTitle.trim() || !found || found === 'none') return
    const id = await api.createSet(userId, { title: newTitle.trim(), is_personal: true })
    await api.addWordToSet(id, found, 0)
    setMsg(t('flashcards.addedToSet', { title: newTitle.trim() }))
    setNewTitle(''); setFound(null); setTerm(''); onChanged()
  }

  return (
    <div className="mb-6 rounded-2xl border border-line bg-paper p-5">
      <p className="mb-2 font-body font-semibold">{t('flashcards.createFlashcard')}</p>
      <p className="mb-3 text-sm text-mute">{t('flashcards.createFlashcardHint')}</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder={t('flashcards.wordPlaceholder')}
          className={`${inputCls} flex-1`}
        />
        <Button onClick={lookup} disabled={busy || !term.trim()}>{busy ? '…' : t('flashcards.find')}</Button>
      </div>

      {found === 'none' && (
        <p className="mt-3 text-sm text-warn">
          {t('flashcards.notInDictionary', { term })}
        </p>
      )}

      {found && found !== 'none' && (
        <div className="mt-3 space-y-3 rounded-2xl bg-lilac/40 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-xl font-semibold">{found.word}</span>
            {found.cefr_level && <Badge>{found.cefr_level}</Badge>}
            <SpeakerButton text={found.word} className="h-7 w-7 text-sm" />
            <span className="text-plum">{found.translation}</span>
          </div>
          <p className="text-sm font-semibold">{t('flashcards.addToSet')}</p>
          {ownSets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ownSets.map((s) => (
                <button key={s.id} onClick={() => addTo(s.id)} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-semibold hover:border-plum">
                  {s.title}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t('flashcards.newSetNamePlaceholder')} className={inputCls} />
            <Button variant="soft" onClick={createAndAdd} disabled={!newTitle.trim()}>{t('flashcards.createAndAdd')}</Button>
          </div>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-[var(--color-good)]">{msg}</p>}
    </div>
  )
}

function SetGroup({
  title,
  sets,
  progress,
  onOpen,
  onDelete,
  owner,
}: {
  title: string
  sets: FlashcardSet[]
  progress: Record<string, SetProgress>
  onOpen: (s: FlashcardSet) => void
  onDelete?: (id: string) => void
  owner?: boolean
}) {
  const { t } = useTranslation()
  if (sets.length === 0) return null
  return (
    <div className="mb-8">
      <h3 className="mb-3 font-display text-xl font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {sets.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4">
            <button onClick={() => onOpen(s)} className="text-left">
              <p className="font-display text-lg font-semibold">{s.title}</p>
              <p className="text-sm text-mute">{s.description || (s.is_personal ? t('flashcards.personalSet') : t('flashcards.teacherSet'))}</p>
              {progress[s.id] && (
                <p className="text-xs font-semibold text-plum">
                  {progress[s.id].known_count}/{progress[s.id].total_count} · {t(`sets.status.${progress[s.id].status}`)}
                </p>
              )}
            </button>
            <div className="flex items-center gap-2">
              {!s.is_personal && <Badge>{t('roles.teacher')}</Badge>}
              {owner && onDelete && <Button variant="ghost" onClick={() => onDelete(s.id)}>✕</Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SetEditor({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const { userId, role } = useAuth()
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<{ front: string; back: string; example: string }[]>([{ front: '', back: '', example: '' }])
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!userId || !title.trim()) return
    setSaving(true)
    try {
      const isPersonal = role === 'student'
      const setId = await api.createSet(userId, { title: title.trim(), is_personal: isPersonal })
      const valid = rows.filter((r) => r.front.trim())
      for (let i = 0; i < valid.length; i++) {
        const r = valid[i]
        // Only admins may write to the global dictionary (RLS enforces this too).
        if (role === 'admin') {
          await api.upsertWord({ word: r.front.trim().toLowerCase(), translation: r.back, example: r.example }).catch(() => {})
        }
        await api.addCard(setId, { front: r.front.trim(), back: r.back, example: r.example }, i)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <button onClick={onClose} className="mb-4 font-body text-sm text-mute hover:text-ink">← {t('common.back')}</button>
      <h3 className="mb-6 font-display text-3xl font-semibold">{t('flashcards.newSet')}</h3>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('flashcards.setName')} className={`${inputCls} mb-4 w-full`} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
            <input value={r.front} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} placeholder={t('flashcards.fieldEnglish')} className={inputCls} />
            <input value={r.back} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))} placeholder={t('flashcards.fieldTranslation')} className={inputCls} />
            <input value={r.example} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))} placeholder={t('flashcards.fieldExample')} className={inputCls} />
            <button onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))} className="rounded-xl border border-line px-3 text-mute hover:text-warn">✕</button>
          </div>
        ))}
      </div>
      <button onClick={() => setRows((rs) => [...rs, { front: '', back: '', example: '' }])} className="mt-3 font-body font-semibold text-plum">+ {t('flashcards.addCard')}</button>
      <div className="mt-6">
        <Button onClick={save} disabled={saving || !title.trim()}>{saving ? t('common.saving') : t('flashcards.saveSet')}</Button>
      </div>
    </div>
  )
}
