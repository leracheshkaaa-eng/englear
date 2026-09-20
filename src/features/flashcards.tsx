import { useEffect, useRef, useState } from 'react'
import { Badge, Button, SpeakerButton, inputCls } from '../lib/ui'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { Flashcard, FlashcardSet } from '../lib/api'

export function Flashcards() {
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

  if (active) return <SetPlayer set={active} onBack={() => setActive(null)} />
  if (creating) return <SetEditor onClose={() => { setCreating(false); load() }} />

  const mine = sets.filter((s) => s.owner_id === userId)
  const assigned = sets.filter((s) => s.owner_id !== userId)

  return (
    <section className="mx-auto max-w-4xl px-6 pb-24">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-display text-4xl font-semibold">Флеш-карточки</h2>
        <Button onClick={() => setCreating(true)}>+ Новый набор</Button>
      </div>

      <SetGroup title={role === 'student' ? 'Мои карточки' : 'Мои наборы'} sets={mine} onOpen={setActive} onDelete={async (id) => { await api.deleteSet(id); load() }} owner />
      <SetGroup title="Назначенные мне" sets={assigned} onOpen={setActive} />
    </section>
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
              <p className="text-sm text-mute">{s.description || (s.is_personal ? 'Личный набор' : 'Набор учителя')}</p>
            </button>
            <div className="flex items-center gap-2">
              {!s.is_personal && <Badge>teacher</Badge>}
              {owner && onDelete && (
                <Button variant="ghost" onClick={() => onDelete(s.id)}>
                  ✕
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- create a set ---------- */

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
        // Keep dictionary in sync so tooltips/audio reuse the same word.
        if (role !== 'student') await api.upsertWord({ word: r.front.trim().toLowerCase(), translation: r.back, example: r.example })
        await api.addCard(setId, { front: r.front.trim(), back: r.back, example: r.example }, i)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-6 pb-24">
      <button onClick={onClose} className="mb-4 font-body text-sm text-mute hover:text-ink">
        ← Назад
      </button>
      <h2 className="mb-6 font-display text-3xl font-semibold">Новый набор</h2>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название набора" className={`${inputCls} mb-4 w-full`} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
            <input value={r.front} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, front: e.target.value } : x)))} placeholder="English" className={inputCls} />
            <input value={r.back} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, back: e.target.value } : x)))} placeholder="перевод" className={inputCls} />
            <input value={r.example} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, example: e.target.value } : x)))} placeholder="пример (необязательно)" className={inputCls} />
            <button onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs))} className="rounded-xl border border-line px-3 text-mute hover:text-warn">
              ✕
            </button>
          </div>
        ))}
      </div>
      <button onClick={() => setRows((rs) => [...rs, { front: '', back: '', example: '' }])} className="mt-3 font-body font-semibold text-plum">
        + Ещё карточка
      </button>
      <div className="mt-6">
        <Button onClick={save} disabled={saving || !title.trim()}>
          {saving ? 'Сохранение…' : 'Сохранить набор'}
        </Button>
      </div>
    </section>
  )
}

/* ---------- play a set: flip + swipe + know/don't know ---------- */

function SetPlayer({ set, onBack }: { set: FlashcardSet; onBack: () => void }) {
  const { userId } = useAuth()
  const [cards, setCards] = useState<Flashcard[]>([])
  const [i, setI] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [dragX, setDragX] = useState(0)
  const startX = useRef<number | null>(null)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ known: 0, unknown: 0 })

  useEffect(() => {
    api.listCards(set.id).then(setCards)
  }, [set.id])

  const card = cards[i]

  async function answer(known: boolean) {
    if (!card) return
    if (userId) await api.recordCard(userId, card.id, known).catch(() => {})
    setStats((s) => ({ known: s.known + (known ? 1 : 0), unknown: s.unknown + (known ? 0 : 1) }))
    setFlipped(false)
    setDragX(0)
    if (i + 1 >= cards.length) setDone(true)
    else setI((v) => v + 1)
  }

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
  }
  function onPointerMove(e: React.PointerEvent) {
    if (startX.current !== null) setDragX(e.clientX - startX.current)
  }
  function onPointerUp() {
    if (startX.current === null) return
    if (dragX > 100) answer(true)
    else if (dragX < -100) answer(false)
    else setDragX(0)
    startX.current = null
  }

  if (done) {
    return (
      <section className="mx-auto max-w-md px-6 pb-24 text-center">
        <button onClick={onBack} className="mb-4 block font-body text-sm text-mute hover:text-ink">
          ← Наборы
        </button>
        <h2 className="font-display text-3xl font-semibold">Готово!</h2>
        <p className="mt-4 text-lg">
          Знаю: <b className="text-[var(--color-good)]">{stats.known}</b> · Не знаю: <b className="text-warn">{stats.unknown}</b>
        </p>
        <div className="mt-6">
          <Button onClick={onBack}>К наборам</Button>
        </div>
      </section>
    )
  }

  if (!card) return <section className="mx-auto max-w-md px-6 pb-24 text-mute">Загрузка…</section>

  return (
    <section className="mx-auto max-w-md px-6 pb-24">
      <button onClick={onBack} className="mb-4 font-body text-sm text-mute hover:text-ink">
        ← Наборы
      </button>
      <p className="mb-3 text-center text-sm text-mute">
        {i + 1} / {cards.length}
      </p>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
            <span className="mt-4 text-sm text-mute">нажми, чтобы перевернуть</span>
          </>
        ) : (
          <>
            <span className="font-display text-3xl font-semibold text-plum">{card.back}</span>
            {card.example && <p className="mt-3 text-mute">{card.example}</p>}
          </>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-mute">← свайп «не знаю» · свайп «знаю» →</p>
      <div className="mt-4 flex justify-center gap-4">
        <Button variant="danger" onClick={() => answer(false)}>
          ✗ Не знаю
        </Button>
        <Button onClick={() => answer(true)}>✓ Знаю</Button>
      </div>
    </section>
  )
}
