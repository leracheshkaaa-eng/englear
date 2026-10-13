import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import type { GrammarExplanation, GrammarTopic } from '../lib/api'
import { useAuth } from '../lib/auth'
import { CEFR_LEVELS } from '../lib/config'
import { Lean, LeanEmpty, LeanLoading, LeanSays } from '../lib/lean'
import { speak } from '../lib/supabase'
import { Badge, Button } from '../lib/ui'

/* ============================================================
   Grammar (free for everyone): topics by level and a clear explanation of each one —
   in the learner's language at low levels, more and more English higher up.
   ============================================================ */

/** "**had** gone" → <b>had</b> gone */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <b key={i} className="text-plum-deep">
            {p}
          </b>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  )
}
const plain = (s: string) => s.replace(/\*\*/g, '')

export function GrammarCatalog({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation()
  const { settings } = useAuth()
  const [topics, setTopics] = useState<GrammarTopic[] | null>(null)
  const [level, setLevel] = useState<string>(CEFR_LEVELS.includes(settings.english_level as never) ? settings.english_level : 'A1')

  useEffect(() => {
    api.grammarTopics().then(setTopics).catch(() => setTopics([]))
  }, [])

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm font-semibold ${on ? 'border-plum bg-lilac text-plum-deep' : 'border-line text-mute hover:border-lavender'}`
  const list = topics?.filter((g) => g.cefr === level) ?? []

  return (
    <div>
      <p className="mb-4 text-mute">{t('grammar.intro')}</p>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {CEFR_LEVELS.map((l) => (
          <button key={l} onClick={() => setLevel(l)} className={chip(level === l)}>
            {l}
          </button>
        ))}
      </div>
      {topics === null && <LeanLoading />}
      {topics && list.length === 0 && <LeanEmpty>{t('grammar.none')}</LeanEmpty>}
      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((g, i) => (
          <button key={g.id} onClick={() => onOpen(g.id)} className="flex items-center gap-4 rounded-2xl border border-line bg-paper p-4 text-left transition hover:border-lavender hover:shadow-[0_12px_30px_-22px_rgba(60,42,112,0.6)]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cream font-display text-lg font-semibold text-plum">{i + 1}</span>
            <span className="font-semibold">{api.grammarTitle(g, i18n.language)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function GrammarTopicPage({ topicId, onBack, onOpen, onOpenTask }: { topicId: string; onBack: () => void; onOpen: (id: string) => void; onOpenTask: (id: string) => void }) {
  const { t, i18n } = useTranslation()
  const [topics, setTopics] = useState<GrammarTopic[]>([])
  const [ex, setEx] = useState<GrammarExplanation | null>(null)
  const [err, setErr] = useState(false)
  const [tasks, setTasks] = useState<api.CatalogLesson[] | null>(null)
  const lang = i18n.language

  useEffect(() => {
    api.grammarTopics().then(setTopics).catch(() => {})
  }, [])
  useEffect(() => {
    setEx(null)
    setErr(false)
    setTasks(null)
    window.scrollTo(0, 0)
    api.grammarExplanation(topicId, lang).then(setEx).catch(() => setErr(true))
    api
      .lessonCatalog({ scope: 'library', grammarTopicId: topicId, kind: 'lesson' }, 0, 6)
      .then((r) => setTasks(r.lessons))
      .catch(() => setTasks([]))
  }, [topicId, lang])

  const topic = topics.find((g) => g.id === topicId)
  const same = topics.filter((g) => g.cefr === topic?.cefr)
  const idx = same.findIndex((g) => g.id === topicId)
  const prev = idx > 0 ? same[idx - 1] : null
  const next = idx >= 0 && idx < same.length - 1 ? same[idx + 1] : null
  const card = 'rounded-3xl border border-line bg-paper p-5'

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-mute hover:text-ink">
        ← {t('grammar.allTopics')}
      </button>

      {err && (
        <div className={card}>
          <LeanSays pose="surprised" size={70}>
            {t('grammar.failed')}
          </LeanSays>
          <Button
            className="mt-3"
            onClick={() => {
              setErr(false)
              api.grammarExplanation(topicId, lang).then(setEx).catch(() => setErr(true))
            }}
          >
            {t('grammar.retry')}
          </Button>
        </div>
      )}
      {!ex && !err && <LeanLoading text={t('grammar.writing')} />}

      {ex && (
        <>
          <header className={`${card} bg-gradient-to-br from-cream via-paper to-mist/50`}>
            {topic && <Badge>{topic.cefr}</Badge>}
            <h2 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{ex.title}</h2>
            <p className="mt-2 text-lg leading-relaxed">
              <Rich text={ex.summary} />
            </p>
          </header>

          {ex.sections.map((s, i) => (
            <section key={i} className={card}>
              <h3 className="font-display text-2xl font-semibold">
                <span className="mr-2 text-plum">{i + 1}.</span>
                {s.heading}
              </h3>
              <p className="mt-2 leading-relaxed">
                <Rich text={s.text} />
              </p>
              {s.examples.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {s.examples.map((e, j) => (
                    <li key={j} className="flex items-start gap-2 rounded-2xl bg-lilac/40 px-4 py-2">
                      <button onClick={() => speak(plain(e.en))} className="mt-0.5 shrink-0 opacity-60 hover:opacity-100" title={t('grammar.listen')}>
                        🔊
                      </button>
                      <span>
                        <span className="font-semibold">
                          <Rich text={e.en} />
                        </span>
                        {e.tr && <span className="block text-sm text-mute">{plain(e.tr)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          {ex.table.headers.length > 0 && ex.table.rows.length > 0 && (
            <section className={`${card} overflow-x-auto`}>
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead>
                  <tr>
                    {ex.table.headers.map((h, i) => (
                      <th key={i} className="border-b border-line px-3 py-2 font-semibold text-mute">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ex.table.rows.map((r, i) => (
                    <tr key={i} className="odd:bg-cream/50">
                      {r.map((c, j) => (
                        <td key={j} className={`px-3 py-2 ${j === 0 ? 'font-semibold' : ''}`}>
                          <Rich text={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {ex.mistakes.length > 0 && (
            <section className={card}>
              <h3 className="mb-3 font-display text-2xl font-semibold">🚫 {t('grammar.mistakes')}</h3>
              <div className="space-y-3">
                {ex.mistakes.map((m, i) => (
                  <div key={i} className="rounded-2xl border border-line p-3">
                    <p className="text-warn line-through decoration-2">❌ {plain(m.wrong)}</p>
                    <p className="font-semibold text-[var(--color-good)]">✅ {plain(m.right)}</p>
                    <p className="mt-1 text-sm text-mute">{plain(m.why)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {ex.tip && (
            <div className="rounded-3xl bg-graphite p-5 text-paper">
              <div className="flex items-center gap-4">
                <Lean pose="sly" size={80} />
                <p className="text-lg">
                  <Rich text={ex.tip} />
                </p>
              </div>
            </div>
          )}

          {ex.check.length > 0 && <Check key={topicId} items={ex.check} />}

          <section className={card}>
            <h3 className="mb-3 font-display text-2xl font-semibold">✏️ {t('grammar.practice')}</h3>
            {tasks === null && <p className="text-mute">{t('common.loading')}</p>}
            {tasks?.length === 0 && <p className="text-mute">{t('grammar.noTasks')}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              {tasks?.map((l) => (
                <button key={l.id} onClick={() => onOpenTask(l.id)} className="rounded-2xl border border-line px-4 py-3 text-left hover:border-lavender">
                  <span className="font-semibold">{l.title}</span>
                  <span className="block text-xs text-mute">
                    {l.cefr} · {t('lessons.exerciseCount', { count: l.exercise_count })}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      <nav className="flex flex-wrap justify-between gap-3">
        {prev ? (
          <Button variant="soft" onClick={() => onOpen(prev.id)}>
            ← {api.grammarTitle(prev, lang)}
          </Button>
        ) : (
          <span />
        )}
        {next && <Button onClick={() => onOpen(next.id)}>{api.grammarTitle(next, lang)} →</Button>}
      </nav>
    </div>
  )
}

/** The quick check: options shuffled, instant feedback, a score at the end. */
function Check({ items }: { items: GrammarExplanation['check'] }) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<Record<number, number>>({})
  // shuffle each question's options once (the model tends to put the answer in the same place)
  const order = useMemo(() => items.map((q) => q.options.map((_, i) => i).sort(() => Math.random() - 0.5)), [items])
  const done = Object.keys(picked).length === items.length
  const right = items.filter((q, i) => picked[i] === q.answer).length

  return (
    <section className="rounded-3xl border border-line bg-paper p-5">
      <h3 className="mb-3 font-display text-2xl font-semibold">🧠 {t('grammar.check')}</h3>
      <div className="space-y-4">
        {items.map((q, i) => {
          const chosen = picked[i]
          return (
            <div key={i}>
              <p className="font-semibold">
                {i + 1}. <Rich text={q.question} />
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {order[i].map((o) => {
                  const isRight = o === q.answer
                  const show = chosen !== undefined
                  const cls = !show ? 'border-line hover:border-lavender' : isRight ? 'border-[var(--color-good)] bg-[rgba(63,143,107,.1)]' : o === chosen ? 'border-warn bg-[rgba(180,85,47,.08)]' : 'border-line opacity-60'
                  return (
                    <button key={o} disabled={show} onClick={() => setPicked((p) => ({ ...p, [i]: o }))} className={`rounded-xl border px-3 py-1.5 text-sm ${cls}`}>
                      {plain(q.options[o])}
                    </button>
                  )
                })}
              </div>
              {chosen !== undefined && (
                <p className={`mt-1 text-sm ${chosen === q.answer ? 'text-[var(--color-good)]' : 'text-warn'}`}>
                  {chosen === q.answer ? '✓' : '✗'} {plain(q.why)}
                </p>
              )}
            </div>
          )
        })}
      </div>
      {done && (
        <div className="mt-5">
          <LeanSays pose={right === items.length ? 'happy' : right >= items.length / 2 ? 'neutral' : 'surprised'} size={70} motion="pop">
            {t('grammar.score', { n: right, total: items.length })}
          </LeanSays>
        </div>
      )}
    </section>
  )
}
