import { Fragment, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as api from '../lib/api'
import type { AiConversation, AiKindStatus, AiMessage, AiStatus, WritingCheck, WritingResult } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Badge, Button, inputCls } from '../lib/ui'

/* ============================================================
   AI tutor: a chat with the tutor and a writing check.
   Prices and allowances come from the server (ai_status); the server also charges.
   ============================================================ */

type Tab = 'chat' | 'writing'

export function AiTutor({ onSpent, onShop }: { onSpent: () => void; onShop: () => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('chat')
  const [status, setStatus] = useState<AiStatus | null>(null)

  const refresh = () => api.aiStatus().then(setStatus).catch(() => {})
  useEffect(() => {
    refresh()
  }, [])
  const spent = () => {
    refresh()
    onSpent()
  }

  return (
    <section className="mx-auto max-w-4xl px-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-4xl font-semibold">{t('ai.title')}</h2>
          <p className="mt-1 text-mute">{t('ai.subtitle')}</p>
        </div>
        {status?.plus && (
          <Badge>
            {t(`shop.planNames.${status.plan ?? 'plus'}` as 'shop.planNames.plus')} · {t('ai.until', { date: new Date(status.period_end!).toLocaleDateString() })}
          </Badge>
        )}
      </div>

      <div className="mt-5 flex rounded-full border border-line bg-paper p-1 font-body text-sm font-semibold sm:w-fit">
        {(['chat', 'writing'] as Tab[]).map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            className={`flex-1 rounded-full px-5 py-2 transition-colors sm:flex-none ${tab === x ? 'bg-plum text-paper' : 'text-mute hover:text-ink'}`}
          >
            {t(`ai.tabs.${x}`)}
          </button>
        ))}
      </div>

      {tab === 'chat' ? (
        <Chat status={status?.tutor ?? null} plus={!!status?.plus} onSpent={spent} onShop={onShop} />
      ) : (
        <Writing status={status?.writing ?? null} plus={!!status?.plus} onSpent={spent} onShop={onShop} />
      )}
    </section>
  )
}

/** "2 free messages left today · then 10 🪙" */
function CostLine({ s, plus, kind }: { s: AiKindStatus | null; plus: boolean; kind: 'tutor' | 'writing' }) {
  const { t } = useTranslation()
  if (!s) return null
  let text: string
  if (plus && (s.plus_left ?? 0) > 0) text = t(`ai.cost.plus_${kind}`, { n: s.plus_left ?? 0 })
  else if (s.free_left > 0) text = t(`ai.cost.free_${s.free_window}`, { n: s.free_left, price: s.price })
  else text = t('ai.cost.coins', { price: s.price })
  return <p className="text-xs text-mute">{text}</p>
}

function ErrorLine({ code, onShop }: { code: string; onShop: () => void }) {
  const { t } = useTranslation()
  const known = ['not_enough_coins', 'ai_busy', 'ai_not_configured', 'bad_text', 'bad_message']
  return (
    <p className="text-sm text-warn">
      {t(`ai.errors.${known.includes(code) ? code : 'ai_failed'}` as 'ai.errors.ai_failed')}{' '}
      {code === 'not_enough_coins' && (
        <button onClick={onShop} className="font-semibold underline">
          {t('ai.toShop')}
        </button>
      )}
    </p>
  )
}

/** Tiny safe Markdown: **bold**, "- " / "1. " lists, paragraphs. */
function Md({ text }: { text: string }) {
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>,
    )
  const blocks = text.split(/\n{2,}/)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)))
          return (
            <ul key={i} className="my-1 ml-5 list-disc space-y-0.5">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>
              ))}
            </ul>
          )
        return (
          <p key={i} className="my-1 whitespace-pre-wrap">
            {inline(b)}
          </p>
        )
      })}
    </>
  )
}

/* ---------------- chat ---------------- */

const STARTERS = ["Let's talk about my day.", 'Explain the Present Perfect with examples.', 'Help me practise ordering food in a café.', 'Give me 5 new words about travel.']

function Chat({ status, plus, onSpent, onShop }: { status: AiKindStatus | null; plus: boolean; onSpent: () => void; onShop: () => void }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [convs, setConvs] = useState<AiConversation[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<AiMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.aiConversations().then(setConvs).catch(() => {})
  }, [])
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [msgs, busy])

  async function open(id: string | null) {
    setActive(id)
    setErr('')
    setMsgs(id ? await api.aiMessages(id).catch(() => []) : [])
  }

  async function send(text = draft) {
    const message = text.trim()
    if (!message || busy) return
    setBusy(true)
    setErr('')
    const optimistic: AiMessage = { id: -Date.now(), role: 'user', content: message, created_at: new Date().toISOString() }
    setMsgs((m) => [...m, optimistic])
    setDraft('')
    try {
      const res = await api.aiTutor(active, message)
      setMsgs((m) => [...m, { id: -Date.now() - 1, role: 'assistant', content: res.reply, created_at: new Date().toISOString() }])
      if (!active) {
        setActive(res.conversation_id)
        api.aiConversations().then(setConvs).catch(() => {})
      }
      onSpent()
    } catch (e) {
      setMsgs((m) => m.filter((x) => x.id !== optimistic.id))
      setDraft(message)
      setErr(e instanceof api.AiError ? e.code : 'ai_failed')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await api.deleteConversation(id).catch(() => {})
    setConvs((c) => c.filter((x) => x.id !== id))
    if (active === id) open(null)
  }

  return (
    <div className="mt-5 grid gap-4 md:grid-cols-[220px_1fr]">
      <aside className="space-y-1 md:max-h-[60vh] md:overflow-y-auto">
        <Button variant="soft" onClick={() => open(null)} className="w-full">
          + {t('ai.newChat')}
        </Button>
        {convs.map((c) => (
          <div key={c.id} className={`group flex items-center gap-1 rounded-xl px-3 py-2 text-sm ${active === c.id ? 'bg-lilac' : 'hover:bg-paper'}`}>
            <button onClick={() => open(c.id)} className="min-w-0 flex-1 truncate text-left">
              {c.title || t('ai.untitled')}
            </button>
            <button onClick={() => remove(c.id)} title={t('common.delete')} className="text-mute opacity-60 hover:text-warn group-hover:opacity-100">
              ×
            </button>
          </div>
        ))}
      </aside>

      <div className="flex min-h-[50vh] flex-col rounded-2xl border border-line bg-paper">
        <div className="flex-1 space-y-3 overflow-y-auto p-4 md:max-h-[60vh]">
          {msgs.length === 0 && (
            <div className="py-6 text-center">
              <p className="font-display text-2xl font-semibold">{t('ai.hello', { name: profile?.full_name ? ', ' + profile.full_name : '' })}</p>
              <p className="mt-1 text-sm text-mute">{t('ai.helloHint')}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} disabled={busy} className="rounded-full border border-line px-3 py-1.5 text-sm hover:border-lavender">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-[15px] leading-relaxed ${m.role === 'user' ? 'bg-plum text-paper' : 'bg-lilac/60 text-ink'}`}>
                {m.role === 'assistant' ? <Md text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
              </div>
            </div>
          ))}
          {busy && <p className="text-sm text-mute">{t('ai.thinking')}</p>}
          <div ref={bottom} />
        </div>
        <div className="space-y-2 border-t border-line p-3">
          {err && <ErrorLine code={err} onShop={onShop} />}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              rows={2}
              placeholder={t('ai.placeholder')}
              className={`${inputCls} min-h-[48px] flex-1 resize-none`}
            />
            <Button onClick={() => send()} disabled={busy || !draft.trim()}>
              {t('ai.send')}
            </Button>
          </div>
          <CostLine s={status} plus={plus} kind="tutor" />
        </div>
      </div>
    </div>
  )
}

/* ---------------- writing check ---------------- */

const TASKS: Record<string, string[]> = {
  A1: ['Introduce yourself: your name, age, family and what you like (30–50 words).', 'Describe your room (30–50 words).', 'Write about your favourite food (30–50 words).'],
  A2: ['Write about your last weekend (50–80 words).', 'Write an email to a friend inviting them to your birthday party (50–80 words).', 'Describe your best friend (50–80 words).'],
  B1: ['Write about a trip you will never forget (100–150 words).', 'Should children have smartphones? Give your opinion (100–150 words).', 'Write a review of a film or a book you liked (100–150 words).'],
  B2: ['Some people say social media does more harm than good. Discuss (180–250 words).', 'Write a formal email complaining about something you bought online (150–200 words).', 'Describe a person who has influenced you and explain why (180–250 words).'],
  C1: ['Should university education be free for everyone? Write an essay (220–300 words).', 'Write a report on how your town could become greener (220–300 words).', 'Is remote work the future? Discuss its advantages and disadvantages (220–300 words).'],
  C2: ['“Technology makes us lonelier.” Discuss (250–350 words).', 'Review a cultural event, weighing its strengths and weaknesses (250–350 words).', 'To what extent should governments regulate artificial intelligence? (250–350 words)'],
}
const words = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

function Writing({ status, plus, onSpent, onShop }: { status: AiKindStatus | null; plus: boolean; onSpent: () => void; onShop: () => void }) {
  const { t } = useTranslation()
  const { settings } = useAuth()
  const level = settings.english_level in TASKS ? settings.english_level : 'A2'
  const [task, setTask] = useState(TASKS[level][0])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [shown, setShown] = useState<WritingCheck | null>(null)
  const [history, setHistory] = useState<WritingCheck[]>([])

  useEffect(() => {
    api.writingChecks().then(setHistory).catch(() => {})
  }, [])

  async function check() {
    setBusy(true)
    setErr('')
    try {
      const res = await api.aiWriting(task, text)
      const done: WritingCheck = { id: res.id, task, text, level, result: res.result, created_at: res.created_at }
      setShown(done)
      setHistory((h) => [done, ...h])
      onSpent()
    } catch (e) {
      setErr(e instanceof api.AiError ? e.code : 'ai_failed')
    } finally {
      setBusy(false)
    }
  }

  if (shown) return <WritingReport check={shown} onBack={() => setShown(null)} onAgain={() => { setText(shown.text); setTask(shown.task); setShown(null) }} />

  const n = words(text)
  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-2xl border border-line bg-paper p-5">
        <p className="mb-2 text-sm font-semibold">{t('ai.writing.task')}</p>
        <select value={task} onChange={(e) => setTask(e.target.value)} className={`${inputCls} w-full`}>
          {TASKS[level].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
          <option value="">{t('ai.writing.free')}</option>
        </select>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 4000))}
          rows={10}
          placeholder={t('ai.writing.placeholder')}
          className={`${inputCls} mt-3 w-full resize-y leading-relaxed`}
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-mute">{t('ai.writing.words', { n })}</span>
          <Button onClick={check} disabled={busy || text.trim().length < 20}>
            {busy ? t('ai.writing.checking') : t('ai.writing.check')}
          </Button>
        </div>
        <div className="mt-2 space-y-1">
          {err && <ErrorLine code={err} onShop={onShop} />}
          <CostLine s={status} plus={plus} kind="writing" />
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <h3 className="mb-2 font-display text-xl font-semibold">{t('ai.writing.history')}</h3>
          <div className="divide-y divide-line rounded-2xl border border-line bg-paper">
            {history.map((h) => (
              <button key={h.id} onClick={() => setShown(h)} className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-lilac/40">
                <span className="truncate">{h.task || h.text.slice(0, 60)}</span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-mute">
                  <Badge>{h.result.estimated_level}</Badge>
                  {new Date(h.created_at).toLocaleDateString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const MISTAKE_COLORS: Record<string, string> = {
  grammar: 'bg-[rgba(180,85,47,.15)]',
  vocabulary: 'bg-[rgba(214,160,23,.22)]',
  spelling: 'bg-[rgba(120,90,200,.18)]',
  punctuation: 'bg-[rgba(60,140,200,.18)]',
  word_order: 'bg-[rgba(40,160,120,.18)]',
  style: 'bg-[rgba(120,120,120,.15)]',
}

/** The learner's text with each mistake highlighted (first occurrence of each fragment). */
function Highlighted({ text, result }: { text: string; result: WritingResult }) {
  const marks: { start: number; end: number; i: number }[] = []
  result.mistakes.forEach((m, i) => {
    if (!m.original) return
    let from = 0
    while (from <= text.length) {
      const at = text.indexOf(m.original, from)
      if (at < 0) return
      if (!marks.some((x) => at < x.end && at + m.original.length > x.start)) {
        marks.push({ start: at, end: at + m.original.length, i })
        return
      }
      from = at + 1
    }
  })
  marks.sort((a, b) => a.start - b.start)
  const parts: React.ReactNode[] = []
  let pos = 0
  for (const mk of marks) {
    if (mk.start > pos) parts.push(text.slice(pos, mk.start))
    const m = result.mistakes[mk.i]
    parts.push(
      <mark key={mk.start} title={`→ ${m.correction}`} className={`rounded px-0.5 text-ink ${MISTAKE_COLORS[m.type] ?? MISTAKE_COLORS.style}`}>
        {text.slice(mk.start, mk.end)}
        <sup className="ml-0.5 text-[10px] text-mute">{mk.i + 1}</sup>
      </mark>,
    )
    pos = mk.end
  }
  parts.push(text.slice(pos))
  return <p className="whitespace-pre-wrap leading-relaxed">{parts}</p>
}

function WritingReport({ check, onBack, onAgain }: { check: WritingCheck; onBack: () => void; onAgain: () => void }) {
  const { t } = useTranslation()
  const r = check.result
  const card = 'rounded-2xl border border-line bg-paper p-5'
  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={onBack}>
          ← {t('common.back')}
        </Button>
        <Button variant="soft" onClick={onAgain}>
          {t('ai.writing.again')}
        </Button>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-2xl font-semibold">{t('ai.writing.result')}</h3>
          <span className="rounded-full bg-plum px-3 py-1 font-display text-lg font-semibold text-paper">{r.estimated_level}</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {(['grammar', 'vocabulary', 'organization', 'task'] as const).map((k) => (
            <div key={k}>
              <p className="text-xs text-mute">{t(`ai.writing.scores.${k}`)}</p>
              <div className="mt-1 flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className={`h-2 flex-1 rounded-full ${i <= r.scores[k] ? 'bg-plum' : 'bg-line'}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-[15px]">
          <Md text={r.summary} />
        </div>
      </div>

      {check.task && <p className="text-sm text-mute">{check.task}</p>}
      <div className={card}>
        <p className="mb-2 text-sm font-semibold">{t('ai.writing.yourText')}</p>
        <Highlighted text={check.text} result={r} />
      </div>

      {r.mistakes.length > 0 && (
        <div className={card}>
          <p className="mb-3 text-sm font-semibold">{t('ai.writing.mistakes', { n: r.mistakes.length })}</p>
          <ol className="space-y-3">
            {r.mistakes.map((m, i) => (
              <li key={i} className="text-[15px]">
                <span className="mr-2 text-xs text-mute">{i + 1}.</span>
                <s className="text-warn">{m.original}</s> → <b>{m.correction}</b>{' '}
                <span className={`ml-1 rounded px-1.5 py-0.5 text-xs ${MISTAKE_COLORS[m.type]}`}>{t(`ai.writing.types.${m.type}`)}</span>
                <p className="mt-0.5 text-sm text-ink/80">{m.explanation}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className={card}>
        <p className="mb-2 text-sm font-semibold">{t('ai.writing.corrected')}</p>
        <p className="whitespace-pre-wrap leading-relaxed">{r.corrected_text}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {r.strengths.length > 0 && (
          <div className={card}>
            <p className="mb-2 text-sm font-semibold">{t('ai.writing.strengths')}</p>
            <ul className="ml-5 list-disc space-y-1 text-sm">
              {r.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {r.next_steps.length > 0 && (
          <div className={card}>
            <p className="mb-2 text-sm font-semibold">{t('ai.writing.nextSteps')}</p>
            <ul className="ml-5 list-disc space-y-1 text-sm">
              {r.next_steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

