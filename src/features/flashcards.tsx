import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, SpeakerButton, inputCls } from '../lib/ui'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { Flashcard, FlashcardSet, Word, WordType } from '../lib/api'
import { CEFR_LEVELS, IELTS_CATEGORIES, SET_SIZES, TOPICS } from '../lib/config'

type Tab = 'library' | 'mine'

export function Flashcards() {
  const [tab, setTab] = useState<Tab>('library')
  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-4xl font-semibold">Flashcards</h2>
        <div className="flex rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold">
          {(['library', 'mine'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 transition-colors ${tab === t ? 'bg-plum text-paper' : 'text-mute'}`}
            >
              {t === 'library' ? 'Library' : 'My sets'}
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
  | { kind: 'type'; value: WordType; label: string }

function Library() {
  const [sel, setSel] = useState<Selection | null>(null)
  if (sel) return <TopicSetup selection={sel} onBack={() => setSel(null)} />

  return (
    <div className="space-y-10">
      <Group title="Topics" hint="Everyday vocabulary by subject">
        {TOPICS.filter((t) => t !== 'Other').map((t) => (
          <Tile key={t} label={t} onClick={() => setSel({ kind: 'topic', value: t })} />
        ))}
      </Group>

      <Group title="IELTS Vocabulary" hint="Academic & exam-focused sets" accent>
        {IELTS_CATEGORIES.map((c) => (
          <Tile key={c} label={c} onClick={() => setSel({ kind: 'ielts', value: c })} accent />
        ))}
      </Group>

      <Group title="Lexical focus" hint="Chunks & multi-word units">
        <Tile label="Collocations" onClick={() => setSel({ kind: 'type', value: 'collocation', label: 'Collocations' })} />
        <Tile label="Phrasal Verbs" onClick={() => setSel({ kind: 'type', value: 'phrasal_verb', label: 'Phrasal Verbs' })} />
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
  const { userId } = useAuth()
  const [levels, setLevels] = useState<string[]>([])
  const [size, setSize] = useState<number>(20)
  const [pool, setPool] = useState<Word[]>([])
  const [known, setKnown] = useState<Set<string>>(new Set())
  const [playing, setPlaying] = useState<Word[] | null>(null)
  const [loading, setLoading] = useState(true)

  const title = selection.kind === 'type' ? selection.label : selection.value

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
      const wp = await api.wordProgress(userId)
      setKnown(new Set(wp.filter((w) => w.status === 'known').map((w) => w.word_id)))
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

  if (playing) {
    return (
      <WordSetPlayer
        words={playing}
        onBack={() => {
          setPlaying(null)
          loadPool()
        }}
      />
    )
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 font-body text-sm text-mute hover:text-ink">← Library</button>
      <h3 className="font-display text-3xl font-semibold">{title}</h3>

      {/* level picker (multi-select) */}
      <p className="mt-5 mb-2 text-sm font-semibold">Choose levels</p>
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
          <button onClick={() => setLevels([])} className="px-3 text-sm text-mute underline">clear</button>
        )}
      </div>
      <p className="mt-1 text-xs text-mute">No level selected = all levels.</p>

      {/* size picker */}
      <p className="mt-5 mb-2 text-sm font-semibold">Cards per set</p>
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
        <p className="mt-8 text-mute">Loading…</p>
      ) : pool.length === 0 ? (
        <p className="mt-8 text-mute">No vocabulary yet for this selection. Try other levels.</p>
      ) : (
        <>
          <div className="mt-8 rounded-2xl border border-line bg-paper p-5">
            <div className="flex items-center justify-between">
              <p className="font-body font-semibold">{knownCount} / {pool.length} words learned</p>
              <Badge>{pct}%</Badge>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-lilac">
              <div className="h-full rounded-full bg-plum transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-xs text-mute">
              {sets.length} sets × up to {size} cards · {pool.length} available cards
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {sets.map((s, i) => {
              const done = s.filter((w) => known.has(w.id)).length
              const complete = done === s.length
              const locked = firstIncomplete !== -1 && i > firstIncomplete
              const status = complete ? 'done' : i === firstIncomplete ? 'current' : locked ? 'locked' : 'open'
              return (
                <button
                  key={i}
                  disabled={locked}
                  onClick={() => setPlaying(s)}
                  className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-colors ${
                    locked ? 'cursor-not-allowed border-line bg-paper/60 opacity-50' : 'border-line bg-paper hover:border-plum'
                  }`}
                >
                  <div>
                    <p className="font-body font-semibold">Set {i + 1}</p>
                    <p className="text-xs text-mute">{done}/{s.length} learned</p>
                  </div>
                  {status === 'done' && <Badge>✓ done</Badge>}
                  {status === 'current' && <span className="text-sm font-semibold text-plum">In progress →</span>}
                  {status === 'open' && <span className="text-sm text-mute">Start →</span>}
                  {status === 'locked' && <span className="text-sm text-mute">🔒 Locked</span>}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- player over dictionary words (progress -> student_word_progress) ---------- */

function WordSetPlayer({ words, onBack }: { words: Word[]; onBack: () => void }) {
  const { userId } = useAuth()
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [dragX, setDragX] = useState(0)
  const startX = useRef<number | null>(null)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ known: 0, unknown: 0 })

  const w = words[i]

  async function answer(knows: boolean) {
    if (!w) return
    if (userId) await api.recordWord(userId, w.id, knows).catch(() => {})
    setStats((s) => ({ known: s.known + (knows ? 1 : 0), unknown: s.unknown + (knows ? 0 : 1) }))
    setFlipped(false)
    setDragX(0)
    if (i + 1 >= words.length) setDone(true)
    else setI((v) => v + 1)
  }

  function onUp() {
    if (startX.current === null) return
    if (dragX > 100) answer(true)
    else if (dragX < -100) answer(false)
    else setDragX(0)
    startX.current = null
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md pb-24 text-center">
        <button onClick={onBack} className="mb-4 block font-body text-sm text-mute hover:text-ink">← Back to sets</button>
        <h3 className="font-display text-3xl font-semibold">Set complete!</h3>
        <p className="mt-4 text-lg">
          Known: <b className="text-[var(--color-good)]">{stats.known}</b> · Review: <b className="text-warn">{stats.unknown}</b>
        </p>
        <div className="mt-6"><Button onClick={onBack}>Continue</Button></div>
      </div>
    )
  }

  if (!w) return null

  return (
    <div className="mx-auto max-w-md pb-24">
      <button onClick={onBack} className="mb-4 font-body text-sm text-mute hover:text-ink">← Back to sets</button>
      <p className="mb-3 text-center text-sm text-mute">{i + 1} / {words.length}</p>
      <div
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerMove={(e) => startX.current !== null && setDragX(e.clientX - startX.current)}
        onPointerUp={onUp}
        onClick={() => setFlipped((f) => !f)}
        style={{ transform: `translateX(${dragX}px) rotate(${dragX / 30}deg)` }}
        className="mx-auto flex min-h-[20rem] cursor-pointer select-none flex-col items-center justify-center rounded-3xl border border-line bg-paper p-8 text-center shadow-[0_16px_40px_-24px_rgba(60,42,112,0.5)] transition-transform"
      >
        {!flipped ? (
          <>
            {w.cefr_level && <Badge>{w.cefr_level}</Badge>}
            <div className="mt-3 flex items-center gap-3">
              <span className="font-display text-4xl font-semibold">{w.word}</span>
              <SpeakerButton text={w.word} />
            </div>
            {w.pronunciation && <span className="mt-2 text-mute">{w.pronunciation}</span>}
            <span className="mt-4 text-sm text-mute">tap to flip</span>
          </>
        ) : (
          <>
            <span className="font-display text-3xl font-semibold text-plum">{w.translation}</span>
            {w.definition && <p className="mt-3 text-mute">{w.definition}</p>}
            {(w.examples?.[0] || w.example) && <p className="mt-3 text-sm italic text-mute">“{w.examples?.[0] ?? w.example}”</p>}
          </>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-mute">← swipe “review” · swipe “I know it” →</p>
      <div className="mt-4 flex justify-center gap-4">
        <Button variant="danger" onClick={() => answer(false)}>✗ Review</Button>
        <Button onClick={() => answer(true)}>✓ I know it</Button>
      </div>
    </div>
  )
}

/* ============================================================
   MY SETS — custom, user-created (existing system preserved)
   ============================================================ */

function MySets() {
  const { userId, role } = useAuth()
  const [sets, setSets] = useState<FlashcardSet[]>([])
  const [active, setActive] = useState<FlashcardSet | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    setSets(await api.listSets())
  }
  useEffect(() => {
    load()
  }, [])

  if (active) return <SetPlayer set={active} onBack={() => { setActive(null); load() }} />
  if (creating) return <SetEditor onClose={() => { setCreating(false); load() }} />

  const mine = sets.filter((s) => s.owner_id === userId)
  const assigned = sets.filter((s) => s.owner_id !== userId)

  return (
    <div>
      <div className="mb-6 flex justify-end">
        <Button onClick={() => setCreating(true)}>+ New set</Button>
      </div>

      <QuickCreate ownSets={mine} onChanged={load} />

      <SetGroup title={role === 'student' ? 'My cards' : 'My sets'} sets={mine} onOpen={setActive} onDelete={async (id) => { await api.deleteSet(id); load() }} owner />
      <SetGroup title="Assigned to me" sets={assigned} onOpen={setActive} />
      {sets.length === 0 && <p className="text-mute">You have no sets yet. Create one, or use “Create flashcard” above.</p>}
    </div>
  )
}

/* ---------- quick create: type a word, auto-fill from Dictionary ---------- */

function QuickCreate({ ownSets, onChanged }: { ownSets: FlashcardSet[]; onChanged: () => void }) {
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
    if (cards.some((c) => c.word_id === found.id)) { setMsg('Already in that set'); return }
    await api.addWordToSet(setId, found, cards.length)
    setMsg(`Added “${found.word}” ✓`)
    setFound(null); setTerm(''); onChanged()
  }

  async function createAndAdd() {
    if (!userId || !newTitle.trim() || !found || found === 'none') return
    const id = await api.createSet(userId, { title: newTitle.trim(), is_personal: true })
    await api.addWordToSet(id, found, 0)
    setMsg(`Added to “${newTitle.trim()}” ✓`)
    setNewTitle(''); setFound(null); setTerm(''); onChanged()
  }

  return (
    <div className="mb-6 rounded-2xl border border-line bg-paper p-5">
      <p className="mb-2 font-body font-semibold">Create flashcard</p>
      <p className="mb-3 text-sm text-mute">Type a word — we fill the translation, IPA, definition, example and level from the Dictionary automatically.</p>
      <div className="flex flex-wrap gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder="e.g. consequence"
          className={`${inputCls} flex-1`}
        />
        <Button onClick={lookup} disabled={busy || !term.trim()}>{busy ? '…' : 'Find'}</Button>
      </div>

      {found === 'none' && (
        <p className="mt-3 text-sm text-warn">
          “{term}” isn’t in the Dictionary yet, so we won’t create a fake card. Ask an admin to add it, or try another word.
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
          <p className="text-sm font-semibold">Add to a set:</p>
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
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="…or new set name" className={inputCls} />
            <Button variant="soft" onClick={createAndAdd} disabled={!newTitle.trim()}>Create & add</Button>
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
  onOpen,
  onDelete,
  owner,
}: {
  title: string
  sets: FlashcardSet[]
  onOpen: (s: FlashcardSet) => void
  onDelete?: (id: string) => void
  owner?: boolean
}) {
  if (sets.length === 0) return null
  return (
    <div className="mb-8">
      <h3 className="mb-3 font-display text-xl font-semibold">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {sets.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-2xl border border-line bg-paper p-4">
            <button onClick={() => onOpen(s)} className="text-left">
              <p className="font-display text-lg font-semibold">{s.title}</p>
              <p className="text-sm text-mute">{s.description || (s.is_personal ? 'Personal set' : 'Teacher set')}</p>
            </button>
            <div className="flex items-center gap-2">
              {!s.is_personal && <Badge>teacher</Badge>}
              {owner && onDelete && <Button variant="ghost" onClick={() => onDelete(s.id)}>✕</Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SetEditor({ onClose }: { onClose: () => void }) {
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
      <button onClick={onClose} className="mb-4 font-body text-sm text-mute hover:text-ink">← Back</button>
      <h3 className="mb-6 font-display text-3xl font-semibold">New set</h3>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Set name" className={`${inputCls} mb-4 w-full`} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
            <input value={r.front} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} placeholder="English" className={inputCls} />
            <input value={r.back} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))} placeholder="translation" className={inputCls} />
            <input value={r.example} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))} placeholder="example (optional)" className={inputCls} />
            <button onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))} className="rounded-xl border border-line px-3 text-mute hover:text-warn">✕</button>
          </div>
        ))}
      </div>
      <button onClick={() => setRows((rs) => [...rs, { front: '', back: '', example: '' }])} className="mt-3 font-body font-semibold text-plum">+ Add card</button>
      <div className="mt-6">
        <Button onClick={save} disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Save set'}</Button>
      </div>
    </div>
  )
}

function SetPlayer({ set, onBack }: { set: FlashcardSet; onBack: () => void }) {
  const { userId } = useAuth()
  const [cards, setCards] = useState<Flashcard[]>([])
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [dragX, setDragX] = useState(0)
  const startX = useRef<number | null>(null)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ known: 0, unknown: 0 })
  const [saveError, setSaveError] = useState(false)

  useEffect(() => {
    api.listCards(set.id).then(setCards)
  }, [set.id])

  const card = cards[i]

  async function answer(known: boolean) {
    if (!card) return
    if (userId) await api.recordCard(card.id, known).then(() => setSaveError(false), () => setSaveError(true))
    setStats((s) => ({ known: s.known + (known ? 1 : 0), unknown: s.unknown + (known ? 0 : 1) }))
    setFlipped(false)
    setDragX(0)
    if (i + 1 >= cards.length) setDone(true)
    else setI((v) => v + 1)
  }

  function onUp() {
    if (startX.current === null) return
    if (dragX > 100) answer(true)
    else if (dragX < -100) answer(false)
    else setDragX(0)
    startX.current = null
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md pb-24 text-center">
        <button onClick={onBack} className="mb-4 block font-body text-sm text-mute hover:text-ink">← Sets</button>
        <h3 className="font-display text-3xl font-semibold">Done!</h3>
        <p className="mt-4 text-lg">
          Known: <b className="text-[var(--color-good)]">{stats.known}</b> · Review: <b className="text-warn">{stats.unknown}</b>
        </p>
        <div className="mt-6"><Button onClick={onBack}>Back to sets</Button></div>
      </div>
    )
  }

  if (!card) return <p className="text-mute">Loading…</p>

  return (
    <div className="mx-auto max-w-md pb-24">
      <button onClick={onBack} className="mb-4 font-body text-sm text-mute hover:text-ink">← Sets</button>
      <p className="mb-3 text-center text-sm text-mute">{i + 1} / {cards.length}</p>
      <div
        onPointerDown={(e) => (startX.current = e.clientX)}
        onPointerMove={(e) => startX.current !== null && setDragX(e.clientX - startX.current)}
        onPointerUp={onUp}
        onClick={() => setFlipped((f) => !f)}
        style={{ transform: `translateX(${dragX}px) rotate(${dragX / 30}deg)` }}
        className="mx-auto flex min-h-[18rem] cursor-pointer select-none flex-col items-center justify-center rounded-3xl border border-line bg-paper p-8 text-center shadow-[0_16px_40px_-24px_rgba(60,42,112,0.5)] transition-transform"
      >
        {!flipped ? (
          <>
            <div className="flex items-center gap-3">
              <span className="font-display text-4xl font-semibold">{card.front}</span>
              <SpeakerButton text={card.front} />
            </div>
            <span className="mt-4 text-sm text-mute">tap to flip</span>
          </>
        ) : (
          <>
            <span className="font-display text-3xl font-semibold text-plum">{card.back}</span>
            {card.example && <p className="mt-3 text-mute">{card.example}</p>}
          </>
        )}
      </div>
      <p className="mt-3 text-center text-xs text-mute">← swipe “review” · swipe “I know it” →</p>
      <div className="mt-4 flex justify-center gap-4">
        <Button variant="danger" onClick={() => answer(false)}>✗ Review</Button>
        <Button onClick={() => answer(true)}>✓ I know it</Button>
      </div>
      {saveError && <p className="mt-3 text-center text-sm text-warn">Не удалось сохранить ответ. Проверьте интернет.</p>}
    </div>
  )
}
