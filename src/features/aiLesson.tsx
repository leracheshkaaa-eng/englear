import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import type { AiKindStatus, GrammarTopic } from '../lib/api'
import { CEFR_LEVELS, TOPICS, topicLabel } from '../lib/config'
import { Button, inputCls } from '../lib/ui'
import { LANGUAGES } from '../i18n'

/* ============================================================
   Teacher: "Create a lesson with AI". The server writes the exercises, checks them
   (rules + an independent solver) and returns a draft in the editor syntax.
   Nothing is saved until the teacher saves it in the editor.
   ============================================================ */

export type LessonDraft = {
  title: string
  description: string
  raw: string
  cefr: string
  skill: api.LessonSkill
  topic: string | null
  grammar_topic_id: string | null
  dropped: { n: number; reason: string }[]
}

const TYPES = ['choice', 'fill', 'truefalse', 'order', 'match', 'dialogue', 'listen'] as const

export function AiLessonForm({ onDraft, onCancel, onShop }: { onDraft: (d: LessonDraft) => void; onCancel: () => void; onShop?: () => void }) {
  const { t, i18n } = useTranslation()
  const [level, setLevel] = useState('A2')
  const [focus, setFocus] = useState<'grammar' | 'vocabulary' | 'mixed'>('grammar')
  const [grammarList, setGrammarList] = useState<GrammarTopic[]>([])
  const [grammarId, setGrammarId] = useState('')
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState(10)
  const [types, setTypes] = useState<string[]>(['choice', 'fill', 'order', 'match'])
  const [lang, setLang] = useState(i18n.language.slice(0, 2))
  const [wishes, setWishes] = useState('')
  const [status, setStatus] = useState<AiKindStatus | null>(null)
  const [plus, setPlus] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    api.grammarTopics().then(setGrammarList).catch(() => {})
    api.aiStatus().then((s) => {
      setStatus(s?.lesson ?? null)
      setPlus(!!s?.plus)
    }).catch(() => {})
  }, [])
  // explanations in English from B1 by default
  useEffect(() => {
    if (!['A1', 'A2'].includes(level)) setLang('en')
  }, [level])

  const grammarForLevel = grammarList.filter((g) => !g.cefr || g.cefr === level)
  const toggle = (x: string) => setTypes((ts) => (ts.includes(x) ? ts.filter((y) => y !== x) : [...ts, x]))

  async function generate() {
    setBusy(true)
    setErr('')
    const g = grammarList.find((x) => x.id === grammarId)
    try {
      const res = await api.aiLesson({
        level,
        focus,
        grammar: focus !== 'vocabulary' && g ? api.grammarTitle(g, 'en') : '',
        topic,
        count,
        types,
        wishes,
        explain_lang: lang,
      })
      onDraft({
        title: res.title,
        description: res.description,
        raw: res.raw,
        cefr: level,
        skill: focus,
        topic: (TOPICS as readonly string[]).includes(topic) ? topic : null,
        grammar_topic_id: focus === 'grammar' && grammarId ? grammarId : null,
        dropped: res.dropped,
      })
    } catch (e) {
      setErr(e instanceof api.AiError ? e.code : 'ai_failed')
    } finally {
      setBusy(false)
    }
  }

  const costLine = () => {
    if (!status) return null
    if (plus && (status.plus_left ?? 0) > 0) return t('aiLesson.costPlus', { n: status.plus_left ?? 0 })
    if (status.free_left > 0) return t('aiLesson.costFree', { n: status.free_left, price: status.price })
    return t('ai.cost.coins', { price: status.price })
  }
  const errText = (code: string) =>
    ['not_enough_coins', 'ai_busy', 'ai_not_configured'].includes(code) ? t(`ai.errors.${code}` as 'ai.errors.ai_busy') : code === 'teachers_only' ? t('aiLesson.teachersOnly') : t('aiLesson.failed')
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${on ? 'border-plum bg-lilac text-plum-deep' : 'border-line text-mute hover:border-lavender'}`

  return (
    <div className="rounded-2xl border border-plum/30 bg-paper p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-2xl font-semibold">✨ {t('aiLesson.title')}</h3>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
      <p className="mt-1 text-sm text-mute">{t('aiLesson.hint')}</p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-1 text-sm font-semibold">{t('teacher.cefr')}</p>
          <div className="flex flex-wrap gap-1.5">
            {CEFR_LEVELS.map((l) => (
              <button key={l} onClick={() => setLevel(l)} className={chip(level === l)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold">{t('aiLesson.focus')}</p>
          <div className="flex flex-wrap gap-1.5">
            {(['grammar', 'vocabulary', 'mixed'] as const).map((f) => (
              <button key={f} onClick={() => setFocus(f)} className={chip(focus === f)}>
                {t(`lessonSkills.${f}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {focus !== 'vocabulary' && (
            <label className="text-sm">
              <span className="font-semibold">{t('teacher.grammarTopic')}</span>
              <select value={grammarId} onChange={(e) => setGrammarId(e.target.value)} className={`${inputCls} mt-1 w-full`}>
                <option value="">{t('aiLesson.anyGrammar')}</option>
                {grammarForLevel.map((g) => (
                  <option key={g.id} value={g.id}>
                    {api.grammarTitle(g, i18n.language.slice(0, 2))}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm">
            <span className="font-semibold">{t('aiLesson.topic')}</span>
            <input list="ai-topics" value={topic} onChange={(e) => setTopic(e.target.value.slice(0, 100))} placeholder={t('aiLesson.topicPlaceholder')} className={`${inputCls} mt-1 w-full`} />
            <datalist id="ai-topics">
              {TOPICS.filter((x) => x !== 'Other').map((x) => (
                <option key={x} value={x}>
                  {topicLabel(x)}
                </option>
              ))}
            </datalist>
          </label>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold">{t('aiLesson.types')}</p>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((x) => (
              <button key={x} onClick={() => toggle(x)} className={chip(types.includes(x))}>
                {t(`aiLesson.typeNames.${x}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="font-semibold">{t('aiLesson.count', { n: count })}</span>
            <input type="range" min={4} max={15} value={count} onChange={(e) => setCount(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-plum)]" />
          </label>
          <label className="text-sm">
            <span className="font-semibold">{t('aiLesson.explainLang')}</span>
            <select value={lang} onChange={(e) => setLang(e.target.value)} className={`${inputCls} mt-1 w-full`}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-semibold">{t('aiLesson.wishes')}</span>
          <textarea value={wishes} onChange={(e) => setWishes(e.target.value.slice(0, 400))} rows={2} placeholder={t('aiLesson.wishesPlaceholder')} className={`${inputCls} mt-1 w-full resize-y`} />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={generate} disabled={busy || types.length === 0}>
            {busy ? t('aiLesson.generating') : t('aiLesson.generate')}
          </Button>
          <span className="text-xs text-mute">{costLine()}</span>
        </div>
        {err && (
          <p className="text-sm text-warn">
            {errText(err)}{' '}
            {err === 'not_enough_coins' && onShop && (
              <button onClick={onShop} className="font-semibold underline">
                {t('ai.toShop')}
              </button>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
