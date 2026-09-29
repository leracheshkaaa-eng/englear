import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, SpeakerButton, inputCls } from '../lib/ui'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { CardDraft, Profile, TeacherSet } from '../lib/api'
import { CEFR_LEVELS, SET_SIZES, TOPICS, topicLabel } from '../lib/config'
import { errorMessage } from '../i18n/errors'

/* ============================================================
   Teacher Mode → Flashcards: build a set, correct its cards, assign it to students.
   ============================================================ */

export function TeacherSets() {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [sets, setSets] = useState<TeacherSet[]>([])
  const [students, setStudents] = useState<Profile[]>([])
  const [editing, setEditing] = useState<TeacherSet | 'new' | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!userId) return
    setLoading(true)
    const [s, st] = await Promise.all([api.teacherSets(userId).catch(() => []), api.myStudents(userId).catch(() => [])])
    setSets(s)
    setStudents(st)
    setLoading(false)
  }
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (editing)
    return (
      <SetBuilder
        set={editing === 'new' ? null : editing}
        students={students}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          load()
        }}
      />
    )

  const nameOf = (id: string) => students.find((s) => s.id === id)?.full_name || id.slice(0, 8)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setEditing('new')}>+ {t('teacherSets.newSet')}</Button>
      </div>
      <p className="text-sm text-mute">{t('teacherSets.intro', { section: t('nav.flashcards'), group: t('flashcards.assignedToMe') })}</p>
      {loading ? (
        <p className="text-mute">{t('common.loading')}</p>
      ) : sets.length === 0 ? (
        <p className="text-mute">{t('teacherSets.none')}</p>
      ) : (
        <div className="space-y-3">
          {sets.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-paper p-4">
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold">{s.title}</p>
                <p className="text-sm text-mute">
                  {t('teacherSets.cardCount', { count: s.card_count })} ·{' '}
                  {s.student_ids.length ? t('teacherSets.assignedTo', { names: s.student_ids.map(nameOf).join(', ') }) : t('teacherSets.notAssigned')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="soft" onClick={() => setEditing(s)}>
                  {t('common.edit')}
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    if (confirm(t('teacherSets.confirmDelete', { title: s.title }))) {
                      await api.deleteSet(s.id)
                      load()
                    }
                  }}
                >
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${on ? 'border-plum bg-plum text-paper' : 'border-line text-mute hover:border-lavender'}`

const draftFromWord = (w: api.Word, meaningKey: string | null = null): CardDraft => {
  const sense = api.wordSense(w, meaningKey)
  return { word_id: w.id, meaning_key: sense.key, front: w.word, back: sense.translation || sense.definition || '', example: sense.examples[0] ?? '' }
}

function SetBuilder({
  set,
  students,
  onClose,
  onSaved,
}: {
  set: TeacherSet | null
  students: Profile[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [title, setTitle] = useState(set?.title ?? '')
  const [cards, setCards] = useState<CardDraft[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set(set?.student_ids ?? []))
  const [loading, setLoading] = useState(!!set)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  // "add words" sources
  const [topic, setTopic] = useState('')
  const [levels, setLevels] = useState<string[]>([])
  const [count, setCount] = useState<number>(10)
  const [term, setTerm] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!set) return
    api
      .listCards(set.id)
      .then((cs) => setCards(cs.map((c) => ({ id: c.id, word_id: c.word_id, meaning_key: c.meaning_key, front: c.front, back: c.back ?? '', example: c.example ?? '' }))))
      .finally(() => setLoading(false))
  }, [set])

  const inSet = useMemo(() => new Set(cards.map((c) => (c.word_id ? `${c.word_id}|${c.meaning_key ?? ''}` : c.front.trim().toLowerCase()))), [cards])
  const has = (c: CardDraft) => inSet.has(c.word_id ? `${c.word_id}|${c.meaning_key ?? ''}` : c.front.trim().toLowerCase())

  async function addFromTopic() {
    if (!topic) return
    setBusy(true)
    setMsg('')
    try {
      const pool = await api.dictionaryPool({ topic, levels: levels.length ? levels : undefined })
      const fresh = pool.map((w) => draftFromWord(w)).filter((d) => !has(d))
      // a random pick, so two sets of the same topic are not identical
      const chosen = fresh.sort(() => Math.random() - 0.5).slice(0, count)
      setCards((cs) => [...cs, ...chosen])
      setMsg(chosen.length ? t('teacherSets.added', { count: chosen.length }) : t('teacherSets.noNewWords'))
    } finally {
      setBusy(false)
    }
  }

  async function addWord() {
    if (!term.trim()) return
    setBusy(true)
    setMsg('')
    try {
      const w = await api.findWordByText(term)
      if (!w) {
        setMsg(t('flashcards.notInDictionary', { term }))
        return
      }
      const d = draftFromWord(w)
      if (has(d)) {
        setMsg(t('dictionary.alreadyInSet'))
        return
      }
      setCards((cs) => [...cs, d])
      setTerm('')
      setMsg(t('flashcards.addedWord', { word: w.word }))
    } finally {
      setBusy(false)
    }
  }

  const patch = (i: number, p: Partial<CardDraft>) => setCards((cs) => cs.map((c, j) => (j === i ? { ...c, ...p } : c)))
  const valid = cards.filter((c) => c.front.trim())
  const canSave = !!title.trim() && valid.length > 0 && !saving

  async function save() {
    if (!userId || !canSave) return
    setSaving(true)
    setErr('')
    try {
      await api.saveTeacherSet(userId, set?.id ?? null, title.trim(), valid, [...picked])
      onSaved()
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p className="text-mute">{t('common.loading')}</p>

  return (
    <div className="space-y-6">
      <button onClick={onClose} className="font-body text-sm text-mute hover:text-ink">
        ← {t('common.back')}
      </button>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('flashcards.setName')} className={`${inputCls} w-full`} />

      {/* add words */}
      <div className="space-y-4 rounded-2xl border border-line bg-paper p-5">
        <p className="font-semibold">{t('teacherSets.addWords')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={topic} onChange={(e) => setTopic(e.target.value)} className={inputCls}>
            <option value="">{t('teacherSets.chooseTopic')}</option>
            {TOPICS.map((tp) => (
              <option key={tp} value={tp}>
                {topicLabel(tp)}
              </option>
            ))}
          </select>
          {CEFR_LEVELS.map((l) => (
            <button key={l} onClick={() => setLevels((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]))} className={chip(levels.includes(l))}>
              {l}
            </button>
          ))}
          <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={inputCls}>
            {SET_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <Button variant="soft" onClick={addFromTopic} disabled={!topic || busy}>
            {t('teacherSets.addFromTopic')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addWord()}
            placeholder={t('flashcards.wordPlaceholder')}
            className={`${inputCls} min-w-0 flex-1`}
          />
          <Button variant="soft" onClick={addWord} disabled={!term.trim() || busy}>
            {t('flashcards.find')}
          </Button>
          <Button variant="ghost" onClick={() => setCards((cs) => [...cs, { word_id: null, meaning_key: null, front: '', back: '', example: '' }])}>
            + {t('flashcards.addCard')}
          </Button>
        </div>
        {msg && <p className="text-sm text-mute">{msg}</p>}
      </div>

      {/* cards: the teacher corrects them before assigning */}
      <div>
        <p className="mb-1 font-semibold">{t('teacherSets.cardCount', { count: valid.length })}</p>
        <p className="mb-3 text-sm text-mute">{t('teacherSets.correctHint')}</p>
        <div className="space-y-2">
          {cards.map((c, i) => (
            <div key={c.id ?? `new-${i}`} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_1.6fr_auto]">
              <div className="flex items-center gap-1">
                <input value={c.front} onChange={(e) => patch(i, { front: e.target.value })} placeholder={t('flashcards.fieldEnglish')} className={`${inputCls} min-w-0 flex-1`} />
                {c.front.trim() && <SpeakerButton text={c.front} className="h-7 w-7 shrink-0 text-xs" />}
              </div>
              <input value={c.back} onChange={(e) => patch(i, { back: e.target.value })} placeholder={t('flashcards.fieldTranslation')} className={inputCls} />
              <input value={c.example} onChange={(e) => patch(i, { example: e.target.value })} placeholder={t('flashcards.fieldExample')} className={inputCls} />
              <button
                onClick={() => setCards((cs) => cs.filter((_, j) => j !== i))}
                aria-label={t('common.remove')}
                className="rounded-xl border border-line px-3 py-2 text-mute hover:text-warn"
              >
                ✕
              </button>
            </div>
          ))}
          {cards.length === 0 && <p className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-mute">{t('teacherSets.emptyCards')}</p>}
        </div>
      </div>

      {/* students */}
      <div className="rounded-2xl border border-line bg-paper p-5">
        <p className="mb-2 font-semibold">{t('teacherSets.assignTo')}</p>
        {students.length === 0 ? (
          <p className="text-sm text-mute">{t('teacher.noStudentsToAssign')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {students.map((s) => (
              <label key={s.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${picked.has(s.id) ? 'border-plum bg-lilac' : 'border-line'}`}>
                <input
                  type="checkbox"
                  checked={picked.has(s.id)}
                  onChange={() =>
                    setPicked((p) => {
                      const n = new Set(p)
                      if (n.has(s.id)) n.delete(s.id)
                      else n.add(s.id)
                      return n
                    })
                  }
                />
                {s.full_name || s.id.slice(0, 8)}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!canSave}>
          {saving ? t('common.saving') : t('teacherSets.save')}
        </Button>
        {err && <p className="text-sm text-warn">{err}</p>}
      </div>
    </div>
  )
}
