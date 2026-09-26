import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, SpeakerButton, inputCls } from '../lib/ui'
import { useAuth } from '../lib/auth'
import * as api from '../lib/api'
import type { FlashcardSet, Word } from '../lib/api'
import { Avatar, AvatarPicker } from '../lib/avatars'
import { CEFR_LEVELS, TOPICS, TRANSLATION_UPFRONT_LEVELS, partOfSpeechLabel, topicLabel } from '../lib/config'
import { LanguageSelect } from '../i18n/LanguageSelect'
import { errorMessage } from '../i18n/errors'
import { LANGUAGES, setNativeLanguage, translationLanguage } from '../i18n'

const PARTS = ['noun', 'verb', 'adjective', 'adverb', 'phrasal verb', 'collocation']

export function Dictionary() {
  const { t, i18n } = useTranslation()
  const { role, settings } = useAuth()
  const isAdmin = role === 'admin'
  const [words, setWords] = useState<Word[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Word | null>(null)

  // filters
  const [q, setQ] = useState('')
  const [level, setLevel] = useState('')
  const [topic, setTopic] = useState('')
  const [pos, setPos] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState<'word' | 'cefr'>('word')

  async function load() {
    setLoading(true)
    try {
      setWords(
        await api.searchWords({
          q,
          levels: level ? [level] : undefined,
          topic: topic || undefined,
          part_of_speech: pos || undefined,
          word_type: (type || undefined) as any,
          sort,
        }),
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 250) // debounce search
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, level, topic, pos, type, sort, i18n.language, settings.native_language])

  if (selected) return <WordDetail word={selected} onBack={() => setSelected(null)} />

  return (
    <section className="mx-auto max-w-5xl px-6 pb-24">
      <h2 className="mb-1 font-display text-4xl font-semibold">{t('dictionary.title')}</h2>
      <p className="mb-6 text-mute">{t('dictionary.subtitle')}</p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('dictionary.searchPlaceholder')}
        className={`${inputCls} mb-3 w-full text-lg`}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls}>
          <option value="">{t('dictionary.allLevels')}</option>
          {CEFR_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} className={inputCls}>
          <option value="">{t('dictionary.allTopics')}</option>
          {TOPICS.map((tp) => <option key={tp} value={tp}>{topicLabel(tp)}</option>)}
        </select>
        <select value={pos} onChange={(e) => setPos(e.target.value)} className={inputCls}>
          <option value="">{t('dictionary.allPartsOfSpeech')}</option>
          {PARTS.map((p) => <option key={p} value={p}>{partOfSpeechLabel(p)}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
          <option value="">{t('dictionary.allTypes')}</option>
          <option value="word">{t('wordTypes.word')}</option>
          <option value="collocation">{t('wordTypes.collocation')}</option>
          <option value="phrasal_verb">{t('wordTypes.phrasal_verb')}</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} className={inputCls}>
          <option value="word">{t('dictionary.sortAZ')}</option>
          <option value="cefr">{t('dictionary.sortLevel')}</option>
        </select>
      </div>

      {isAdmin && <AdminAddWord onAdded={load} />}

      {loading ? (
        <p className="text-mute">{t('common.loading')}</p>
      ) : words.length === 0 ? (
        <p className="text-mute">{t('dictionary.noResults')}</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-mute">{t('dictionary.entries', { count: words.length })}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {words.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelected(w)}
                className="flex items-start justify-between gap-2 rounded-2xl border border-line bg-paper p-4 text-left transition-colors hover:border-lavender"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-semibold">{w.word}</span>
                    {w.cefr_level && <Badge>{w.cefr_level}</Badge>}
                  </div>
                  {api.wordTranslation(w) ? (
                    <p className="text-plum">{api.wordTranslation(w)}</p>
                  ) : (
                    <p className="line-clamp-1 text-sm italic text-mute">{w.definition}</p>
                  )}
                  <p className="text-xs text-mute">
                    {topicLabel(w.topic)}
                    {w.part_of_speech ? ` · ${partOfSpeechLabel(w.part_of_speech)}` : ''}
                  </p>
                </div>
                <SpeakerButton text={w.word} className="h-8 w-8 shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

/* ---------- word detail page ---------- */

function WordDetail({ word, onBack }: { word: Word; onBack: () => void }) {
  const { t } = useTranslation()
  const { settings } = useAuth()
  const upfront = TRANSLATION_UPFRONT_LEVELS.includes(settings.english_level) && settings.translations_enabled
  const [showT, setShowT] = useState(upfront)
  useEffect(() => setShowT(upfront), [upfront, word.id])

  const examples = word.examples?.length ? word.examples : word.example ? [word.example] : []
  const translation = api.wordTranslation(word)
  const showTranslationBlock = translationLanguage() !== 'en' // English speakers learn from the definition

  return (
    <section className="mx-auto max-w-2xl px-6 pb-24">
      <button onClick={onBack} className="mb-4 font-body text-sm text-mute hover:text-ink">← {t('dictionary.title')}</button>

      <div className="rounded-3xl border border-line bg-paper p-8">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-5xl font-semibold">{word.word}</h2>
          {word.cefr_level && <Badge>{word.cefr_level}</Badge>}
          <SpeakerButton text={word.word} className="h-10 w-10 text-lg" />
        </div>
        <p className="mt-2 font-body text-mute">
          {word.pronunciation && <span className="mr-3">{word.pronunciation}</span>}
          {word.part_of_speech && <span className="italic">{partOfSpeechLabel(word.part_of_speech)}</span>}
          {word.topic && <span> · {topicLabel(word.topic)}</span>}
          {word.ielts_category && <span> · IELTS: {word.ielts_category}</span>}
        </p>

        {word.definition && (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-mute">{t('dictionary.definition')}</p>
            <p className="mt-1 text-lg">{word.definition}</p>
          </div>
        )}

        {showTranslationBlock && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mute">{t('dictionary.translation')}</p>
            {!translation ? (
              <p className="mt-1 text-sm text-mute">{t('dictionary.noTranslationYet')}</p>
            ) : showT ? (
              <p className="mt-1 text-lg text-plum">{translation}</p>
            ) : (
              <Button variant="soft" className="mt-1" onClick={() => setShowT(true)}>{t('dictionary.showTranslation')}</Button>
            )}
          </div>
        )}

        {word.meanings?.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mute">{t('dictionary.otherMeanings')}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {word.meanings.map((m, i) => (
                <li key={i}>
                  {m.definition}
                  {showT && m.translation ? <span className="text-plum"> — {m.translation}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        {examples.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mute">{t('dictionary.examples')}</p>
            <ul className="mt-1 space-y-2">
              {examples.map((ex, i) => (
                <li key={i} className="flex items-start gap-2">
                  <SpeakerButton text={ex} className="mt-0.5 h-6 w-6 shrink-0 text-xs" />
                  <span>{ex}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {word.related?.length > 0 && (
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-mute">{t('dictionary.related')}</p>
            <p className="mt-1 text-mute">{word.related.join(', ')}</p>
          </div>
        )}

        <AddToFlashcards word={word} />
      </div>
      <p className="mt-3 text-center text-xs text-mute/80">{t('dictionary.cefrNote')}</p>
    </section>
  )
}

/* ---------- add a dictionary word to one of my sets ---------- */

function AddToFlashcards({ word }: { word: Word }) {
  const { t } = useTranslation()
  const { userId } = useAuth()
  const [open, setOpen] = useState(false)
  const [sets, setSets] = useState<FlashcardSet[]>([])
  const [newTitle, setNewTitle] = useState('')
  const [msg, setMsg] = useState('')

  async function openPicker() {
    if (!userId) return
    const all = await api.listSets()
    setSets(all.filter((s) => s.owner_id === userId))
    setOpen(true)
  }

  async function addTo(setId: string) {
    const cards = await api.listCards(setId)
    if (cards.some((c) => c.word_id === word.id)) {
      setMsg(t('dictionary.alreadyInSet'))
      return
    }
    await api.addWordToSet(setId, word, cards.length)
    setMsg(t('dictionary.added'))
    setOpen(false)
  }

  async function createAndAdd() {
    if (!userId || !newTitle.trim()) return
    const id = await api.createSet(userId, { title: newTitle.trim(), is_personal: true })
    await api.addWordToSet(id, word, 0)
    setMsg(t('dictionary.addedToNewSet'))
    setOpen(false)
    setNewTitle('')
  }

  if (!userId) return null

  return (
    <div className="mt-8 border-t border-line pt-5">
      {!open ? (
        <div className="flex items-center gap-3">
          <Button onClick={openPicker}>{t('dictionary.addToFlashcards')}</Button>
          {msg && <span className="text-sm text-[var(--color-good)]">{msg}</span>}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl bg-lilac/40 p-4">
          <p className="font-body font-semibold">{t('dictionary.addWordToSet', { word: word.word })}</p>
          {sets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sets.map((s) => (
                <button key={s.id} onClick={() => addTo(s.id)} className="rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-semibold hover:border-plum">
                  {s.title}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={t('flashcards.newSetNamePlaceholder')} className={inputCls} />
            <Button variant="soft" onClick={createAndAdd} disabled={!newTitle.trim()}>{t('flashcards.createAndAdd')}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- admin: add a word to the global dictionary ---------- */

function AdminAddWord({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ word: '', translation: '', translationLang: translationLanguage(), pronunciation: '', part_of_speech: 'noun', definition: '', example: '', cefr_level: 'A1', topic: 'Other', word_type: 'word' })
  const [msg, setMsg] = useState('')

  async function save() {
    if (!f.word.trim()) return
    setMsg('')
    try {
      // fills only empty fields of an existing word; different values are reported, never overwritten
      const report = await api.importWords(
        [
          {
            word: f.word.trim(),
            part_of_speech: f.part_of_speech,
            cefr: f.cefr_level,
            topic: f.topic,
            ipa: f.pronunciation.trim(),
            definition: f.definition.trim(),
            examples: f.example.trim() ? [f.example.trim()] : [],
            translations: f.translation.trim() && f.translationLang !== 'en' ? { [f.translationLang]: f.translation.trim() } : {},
            word_type: f.word_type,
          },
        ],
        false,
      )
      setMsg(t('dictionary.adminResult', { added: report.new, filled: report.updated, conflicts: report.conflicts.length + report.invalid.length }))
      setF({ ...f, word: '', translation: '', pronunciation: '', definition: '', example: '' })
      onAdded()
    } catch (e) {
      setMsg(errorMessage(e))
    }
  }

  if (!open) return <Button variant="soft" className="mb-6" onClick={() => setOpen(true)}>{t('dictionary.adminAddWord')}</Button>

  return (
    <div className="mb-6 grid gap-2 rounded-2xl border border-line bg-paper p-4 sm:grid-cols-2">
      <input placeholder={t('dictionary.fieldWord')} value={f.word} onChange={(e) => setF({ ...f, word: e.target.value })} className={inputCls} />
      <div className="flex gap-2">
        <input placeholder={t('dictionary.fieldTranslation')} value={f.translation} onChange={(e) => setF({ ...f, translation: e.target.value })} className={`${inputCls} min-w-0 flex-1`} />
        <select value={f.translationLang} onChange={(e) => setF({ ...f, translationLang: e.target.value })} className={inputCls} aria-label={t('settings.translationLanguage')}>
          {LANGUAGES.filter((l) => l.code !== 'en').map((l) => <option key={l.code} value={l.code}>{l.code.toUpperCase()}</option>)}
        </select>
      </div>
      <input placeholder={t('dictionary.fieldIpa')} value={f.pronunciation} onChange={(e) => setF({ ...f, pronunciation: e.target.value })} className={inputCls} />
      <select value={f.part_of_speech} onChange={(e) => setF({ ...f, part_of_speech: e.target.value })} className={inputCls}>
        {PARTS.map((p) => <option key={p} value={p}>{partOfSpeechLabel(p)}</option>)}
      </select>
      <input placeholder={t('dictionary.fieldDefinition')} value={f.definition} onChange={(e) => setF({ ...f, definition: e.target.value })} className={`${inputCls} sm:col-span-2`} />
      <input placeholder={t('dictionary.fieldExample')} value={f.example} onChange={(e) => setF({ ...f, example: e.target.value })} className={`${inputCls} sm:col-span-2`} />
      <select value={f.cefr_level} onChange={(e) => setF({ ...f, cefr_level: e.target.value })} className={inputCls}>
        {CEFR_LEVELS.map((l) => <option key={l}>{l}</option>)}
      </select>
      <select value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} className={inputCls}>
        {TOPICS.map((tp) => <option key={tp} value={tp}>{topicLabel(tp)}</option>)}
      </select>
      <select value={f.word_type} onChange={(e) => setF({ ...f, word_type: e.target.value })} className={inputCls}>
        <option value="word">{t('wordTypes.word')}</option>
        <option value="collocation">{t('wordTypes.collocation')}</option>
        <option value="phrasal_verb">{t('wordTypes.phrasal_verb')}</option>
      </select>
      <div className="flex gap-2 sm:col-span-2">
        <Button onClick={save} disabled={!f.word.trim()}>{t('common.save')}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
        {msg && <span className="self-center text-sm text-mute">{msg}</span>}
      </div>
    </div>
  )
}

/* ============================================================
   Settings: profile, interface language, English level, teacher request
   ============================================================ */

export function Settings() {
  const { t } = useTranslation()
  const { settings, updateSettings, userId, email, role, profile, refresh } = useAuth()
  const [nickname, setNickname] = useState(profile?.full_name ?? '')
  const [avatar, setAvatar] = useState(profile?.avatar ?? 'cat')
  const [savedMsg, setSavedMsg] = useState('')
  const [reqMsg, setReqMsg] = useState(profile?.teacher_request === 'pending' ? 'pending' : '')

  useEffect(() => {
    setNickname(profile?.full_name ?? '')
    setAvatar(profile?.avatar ?? 'cat')
  }, [profile?.full_name, profile?.avatar])

  async function saveProfile() {
    if (!userId) return
    await api.updateProfile(userId, { full_name: nickname.trim(), avatar })
    await refresh()
    setSavedMsg(t('settings.saved'))
    setTimeout(() => setSavedMsg(''), 1500)
  }

  async function askTeacher() {
    if (!userId) return
    await api.requestTeacher(userId)
    await refresh()
    setReqMsg('pending')
  }

  return (
    <section className="mx-auto max-w-xl px-6 pb-24">
      <h2 className="mb-6 font-display text-4xl font-semibold">{t('settings.title')}</h2>

      {/* profile: nickname + avatar */}
      <div className="mb-6 space-y-4 rounded-2xl border border-line bg-paper p-6">
        <div className="flex items-center gap-3">
          <Avatar id={avatar} size={56} ring />
          <div>
            <p className="font-body font-semibold">{t('settings.profile')}</p>
            <p className="text-sm text-mute">{t('settings.profileHint')}</p>
          </div>
        </div>
        <input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder={t('settings.nickname')} className={`${inputCls} w-full`} />
        <AvatarPicker value={avatar} onChange={setAvatar} />
        <div className="flex items-center gap-3">
          <Button onClick={saveProfile} disabled={!nickname.trim()}>{t('settings.saveProfile')}</Button>
          {savedMsg && <span className="text-sm text-[var(--color-good)]">{savedMsg}</span>}
        </div>
      </div>

      {/* interface language */}
      <div className="mb-6 rounded-2xl border border-line bg-paper p-6">
        <p className="font-body font-semibold">{t('settings.interfaceLanguage')}</p>
        <p className="mb-3 text-sm text-mute">{t('settings.interfaceLanguageHint')}</p>
        <LanguageSelect />
      </div>

      {/* translation language (native language) */}
      <div className="mb-6 rounded-2xl border border-line bg-paper p-6">
        <p className="font-body font-semibold">{t('settings.translationLanguage')}</p>
        <p className="mb-3 text-sm text-mute">{t('settings.translationLanguageHint')}</p>
        <select
          value={translationLanguage()}
          onChange={(e) => {
            setNativeLanguage(e.target.value)
            updateSettings({ native_language: e.target.value })
          }}
          aria-label={t('settings.translationLanguage')}
          className="w-full rounded-xl border border-line bg-paper px-3 py-2 font-body text-ink"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.code === 'en' ? t('settings.noTranslationOption') : l.label}
            </option>
          ))}
        </select>
      </div>

      {/* English level */}
      <div className="mb-6 rounded-2xl border border-line bg-paper p-6">
        <p className="font-body font-semibold">{t('settings.englishLevel')}</p>
        <p className="mb-3 text-sm text-mute">{t('settings.englishLevelHint')}</p>
        <div className="flex flex-wrap gap-2">
          {CEFR_LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => updateSettings({ english_level: l })}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${
                settings.english_level === l ? 'border-plum bg-lilac text-plum-deep' : 'border-line text-mute hover:border-lavender'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* become a teacher */}
      {role === 'student' && (
        <div className="mb-6 rounded-2xl border border-line bg-paper p-6">
          <p className="font-body font-semibold">{t('settings.becomeTeacher')}</p>
          <p className="mb-3 text-sm text-mute">{t('settings.becomeTeacherHint')}</p>
          {reqMsg === 'pending' ? (
            <Badge>{t('settings.requestSent')}</Badge>
          ) : (
            <Button variant="soft" onClick={askTeacher}>{t('settings.sendRequest')}</Button>
          )}
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-line bg-paper p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-body font-semibold">{t('settings.wordTranslations')}</p>
            <p className="text-sm text-mute">{t('settings.wordTranslationsHint')}</p>
          </div>
          <button
            onClick={() => updateSettings({ translations_enabled: !settings.translations_enabled })}
            className={`relative h-7 w-12 rounded-full transition-colors ${settings.translations_enabled ? 'bg-plum' : 'bg-line'}`}
            aria-pressed={settings.translations_enabled}
            aria-label={t('settings.wordTranslations')}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-paper transition-all ${settings.translations_enabled ? 'left-6' : 'left-1'}`}
            />
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-1 rounded-2xl border border-line bg-paper p-6 text-sm">
        <p className="font-body font-semibold">{t('settings.account')}</p>
        <p className="text-mute">{email}</p>
        <p className="text-mute">{t('settings.role', { role: t(`roles.${role}`) })}</p>
        <p className="text-mute">{t('settings.name', { name: profile?.full_name || '—' })}</p>
        <p className="mt-2 text-xs text-mute">
          {t('settings.yourId')} <code className="rounded bg-lilac px-1">{userId}</code>
        </p>
      </div>
    </section>
  )
}
