import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { convertToExcalidrawElements, getCommonBounds, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import type { BinaryFileData, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import * as api from '../../lib/api'
import type { StudyLessonSummary } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Button, inputCls } from '../../lib/ui'
import { errorMessage } from '../../i18n/errors'
import { LABELS, NOTE_COLORS, STICKERS, SYMBOLS, svgDataURL } from './stickers'
import { embed, labelBlock, lessonPlan, stickyNote, symbol, table, tensesTable, wordCards, youtubeId, type BoardMode, type Pt, type Skeleton } from './elements'
import { lessonSkeleton, studySkeleton } from './content'
import { audioEmbedLink } from './audioEmbed'

/* ============================================================
   "Insert" panel of the whiteboard (like Miro's side panel): templates, tables,
   shapes and stickers, symbols, YouTube, audio (file or microphone), and our content:
   full lessons (with their plan), tasks and practice — interactive widgets or cards.
   ============================================================ */

type Section = 'study' | 'tasks' | 'practice' | 'templates' | 'table' | 'shapes' | 'symbols' | 'media'
const SECTIONS: Section[] = ['study', 'tasks', 'practice', 'templates', 'table', 'shapes', 'symbols', 'media']
type Item = { id: string; title: string; cefr: string | null }

const newFileId = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-z0-9-]/gi, '')

export function InsertPanel({ xapi, boardId, onInserted, onClose }: { xapi: ExcalidrawImperativeAPI; boardId: string; onInserted: () => void; onClose: () => void }) {
  const { t } = useTranslation()
  const { userId, role } = useAuth()
  const isTeacher = role === 'teacher' || role === 'admin'
  const [open, setOpen] = useState<Section>('study')
  const [rows, setRows] = useState(4)
  const [cols, setCols] = useState(3)
  const [header, setHeader] = useState(true)
  const [yt, setYt] = useState('')
  const [lists, setLists] = useState<Partial<Record<'study' | 'tasks' | 'practice', Item[]>>>({})
  const [picked, setPicked] = useState<Partial<Record<string, string>>>({})
  const [mode, setMode] = useState<BoardMode>('interactive')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [recording, setRecording] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  // lists of lessons / tasks / practice: the library plus my own
  useEffect(() => {
    if ((open !== 'study' && open !== 'tasks' && open !== 'practice') || lists[open]) return
    ;(async () => {
      if (open === 'study') {
        const s: StudyLessonSummary[] = await api.listStudyLessons().catch(() => [])
        return setLists((l) => ({ ...l, study: s.map((x) => ({ id: x.id, title: x.title, cefr: x.cefr })) }))
      }
      const kind = open === 'tasks' ? 'lesson' : 'practice'
      const lib = await api.lessonCatalog({ scope: 'library', kind }, 0, 300).then((r) => r.lessons).catch(() => [])
      const mine = userId && isTeacher ? (await api.teacherLessons(userId, role === 'admin').catch(() => [])).filter((x) => (x.kind ?? 'lesson') === kind) : []
      const seen = new Set<string>()
      const items = [...mine, ...lib].filter((x) => !seen.has(x.id) && seen.add(x.id)).map((x) => ({ id: x.id, title: x.title, cefr: (x as { cefr?: string | null }).cefr ?? null }))
      setLists((l) => ({ ...l, [open]: items }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, role])

  /** top-left point near the middle of what is visible now */
  const spot = (dx = 260, dy = 160): Pt => {
    const st = xapi.getAppState()
    const c = viewportCoordsToSceneCoords({ clientX: st.offsetLeft + st.width / 2, clientY: st.offsetTop + st.height / 2 }, st)
    return { x: c.x - dx, y: c.y - dy }
  }

  /** for big pieces: free space to the right of everything already on the board (like Miro) */
  const free = (): Pt => {
    const els = xapi.getSceneElements()
    if (!els.length) return spot(300, 200)
    const [, minY, maxX] = getCommonBounds(els)
    return { x: maxX + 160, y: minY }
  }

  async function place(sk: Skeleton | (() => Skeleton), extra: unknown[] = []) {
    await document.fonts.load('20px Excalifont').catch(() => [])
    const els = [...convertToExcalidrawElements(typeof sk === 'function' ? sk() : sk), ...(extra as never[])]
    xapi.updateScene({ elements: [...xapi.getSceneElements(), ...els] })
    xapi.scrollToContent(els, { fitToContent: els.length > 3, animate: true })
    onInserted()
  }

  async function sticker(i: number) {
    const s = STICKERS[i]
    const id = newFileId()
    const file = { id, dataURL: svgDataURL(s.svg), mimeType: 'image/svg+xml', created: Date.now() } as unknown as BinaryFileData
    xapi.addFiles([file])
    const w = Number(s.svg.match(/width="(\d+)"/)?.[1] ?? 120)
    const h = Number(s.svg.match(/height="(\d+)"/)?.[1] ?? 120)
    await place([{ type: 'image', x: spot(w / 2, h / 2).x, y: spot(w / 2, h / 2).y, width: w, height: h, fileId: id } as Skeleton[number]])
  }

  async function addYoutube() {
    if (!youtubeId(yt)) return setErr(t('boards.insert.badLink'))
    setErr('')
    await place([], [embed(spot(280, 160), yt.trim())])
    setYt('')
  }

  async function uploadAudio(blob: Blob, name: string) {
    setBusy('audio')
    setErr('')
    try {
      const id = newFileId()
      await api.uploadBoardFile(boardId, id, blob)
      await place([], [embed(spot(190, 50), audioEmbedLink(boardId, id, name), 380, 96)])
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy('')
    }
  }

  async function toggleRecord() {
    if (recording) return recorder.current?.stop()
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop())
        setRecording(false)
        const blob = new Blob(chunks.current, { type: (rec.mimeType || 'audio/webm').split(';')[0] })
        uploadAudio(blob, `${t('boards.insert.recording')} ${new Date().toLocaleTimeString().slice(0, 5)}`)
      }
      recorder.current = rec
      rec.start()
      setRecording(true)
    } catch {
      setErr(t('boards.insert.noMic'))
    }
  }

  async function addContent(section: 'study' | 'tasks' | 'practice') {
    const id = picked[section]
    if (!id) return
    setBusy(section)
    setErr('')
    try {
      const tt = t as unknown as (k: string, o?: Record<string, unknown>) => string
      const sk = section === 'study' ? await studySkeleton(id, free, mode, tt, isTeacher) : await lessonSkeleton(id, free, mode, tt, isTeacher)
      await place(sk)
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy('')
    }
  }

  const tt = t as unknown as (k: string, o?: Record<string, unknown>) => string
  const tile = 'rounded-xl border border-line bg-white px-2 py-2 text-sm hover:border-lavender hover:bg-lilac/40'

  return (
    <aside className="absolute top-2 right-2 bottom-2 z-30 flex w-[min(320px,85vw)] flex-col rounded-2xl border border-line bg-paper shadow-xl">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <p className="font-display text-lg font-semibold">{t('boards.insert.title')}</p>
        <button onClick={onClose} className="text-xl text-mute hover:text-ink" aria-label={t('common.cancel')}>
          ×
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {SECTIONS.map((s) => (
          <div key={s} className="rounded-xl border border-line bg-paper">
            <button onClick={() => setOpen(s)} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold ${open === s ? 'text-plum-deep' : ''}`}>
              {t(`boards.insert.sections.${s}`)}
              <span className="text-mute">{open === s ? '−' : '+'}</span>
            </button>
            {open === s && (
              <div className="space-y-2 px-3 pb-3">
                {s === 'templates' && (
                  <div className="grid grid-cols-1 gap-2">
                    <button className={tile} onClick={() => place(() => tensesTable(free(), t('boards.tpl.tensesTitle')))}>
                      📊 {t('boards.tpl.tenses')}
                    </button>
                    <button className={tile} onClick={() => place(() => wordCards(free(), t('boards.tpl.cardsTitle')))}>
                      🗂️ {t('boards.tpl.cards')}
                    </button>
                    <button
                      className={tile}
                      onClick={() =>
                        place(() =>
                          lessonPlan(free(), t('boards.tpl.planTitle'), [
                            { name: 'Warm-up', minutes: 5, text: tt('boards.plan.warmup', { topic: '…' }) },
                            { name: 'Presentation', minutes: 10, text: tt('boards.plan.presentation') },
                            { name: 'Practice', minutes: 20, text: tt('boards.plan.practice', { n: '…' }) },
                            { name: 'Production', minutes: 10, text: tt('boards.plan.production') },
                            { name: 'Homework', minutes: 0, text: tt('boards.plan.homework') },
                          ]),
                        )
                      }
                    >
                      🗒️ {t('boards.tpl.plan')}
                    </button>
                  </div>
                )}

                {s === 'table' && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <input type="number" min={1} max={20} value={rows} onChange={(e) => setRows(Math.min(20, Math.max(1, Number(e.target.value))))} className={`${inputCls} w-16 py-1`} />
                      ×
                      <input type="number" min={1} max={10} value={cols} onChange={(e) => setCols(Math.min(10, Math.max(1, Number(e.target.value))))} className={`${inputCls} w-16 py-1`} />
                      <span className="text-mute">{t('boards.insert.rowsCols')}</span>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
                      {t('boards.insert.headerRow')}
                    </label>
                    <Button variant="soft" onClick={() => place(() => table(free(), rows, cols, header))}>
                      {t('boards.insert.addTable')}
                    </Button>
                    <p className="text-xs text-mute">{t('boards.insert.tableHint')}</p>
                  </>
                )}

                {s === 'shapes' && (
                  <>
                    <p className="text-xs font-semibold text-mute">{t('boards.insert.labels')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {LABELS.map((l, i) => (
                        <button key={l.text} className={tile} style={{ background: l.bg }} onClick={() => place(() => labelBlock(spot(130, 35), i))}>
                          {l.text}
                        </button>
                      ))}
                    </div>
                    <p className="pt-1 text-xs font-semibold text-mute">{t('boards.insert.notes')}</p>
                    <div className="flex flex-wrap gap-2">
                      {NOTE_COLORS.map((c) => (
                        <button key={c} onClick={() => place(() => stickyNote(spot(110, 100), c))} className="h-10 w-10 rounded-lg border border-line" style={{ background: c }} aria-label={t('boards.insert.notes')} />
                      ))}
                    </div>
                    <p className="pt-1 text-xs font-semibold text-mute">{t('boards.insert.stickers')}</p>
                    <div className="grid grid-cols-4 gap-2">
                      {STICKERS.map((st, i) => (
                        <button key={st.id} onClick={() => sticker(i)} className={`${tile} grid place-items-center p-1`} title={st.id}>
                          <img src={svgDataURL(st.svg)} alt="" className="h-9 w-9 object-contain" />
                        </button>
                      ))}
                    </div>
                    <button onClick={() => xapi.toggleSidebar({ name: 'default', tab: 'library', force: true })} className="pt-1 text-left text-sm text-plum hover:underline">
                      📚 {t('boards.insert.library')}
                    </button>
                  </>
                )}

                {s === 'symbols' && (
                  <div className="grid grid-cols-6 gap-1">
                    {SYMBOLS.map((sy) => (
                      <button key={sy} onClick={() => place(() => symbol(spot(20, 30), sy))} className="rounded-lg py-1.5 text-xl hover:bg-lilac/50">
                        {sy}
                      </button>
                    ))}
                  </div>
                )}

                {s === 'media' && (
                  <>
                    <p className="text-xs font-semibold text-mute">YouTube</p>
                    <div className="flex gap-2">
                      <input value={yt} onChange={(e) => setYt(e.target.value)} placeholder="https://youtu.be/…" className={`${inputCls} min-w-0 flex-1 py-1.5`} />
                      <Button variant="soft" onClick={addYoutube} disabled={!yt.trim()}>
                        +
                      </Button>
                    </div>
                    <p className="pt-2 text-xs font-semibold text-mute">{t('boards.insert.audio')}</p>
                    <input
                      ref={fileInput}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadAudio(f, f.name.replace(/\.[^.]+$/, ''))
                        e.target.value = ''
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button variant="soft" onClick={() => fileInput.current?.click()} disabled={busy === 'audio'}>
                        📁 {t('boards.insert.uploadAudio')}
                      </Button>
                      <Button variant={recording ? 'danger' : 'soft'} onClick={toggleRecord} disabled={busy === 'audio' && !recording}>
                        {recording ? `⏹ ${t('boards.insert.stop')}` : `🎙️ ${t('boards.insert.record')}`}
                      </Button>
                    </div>
                    {busy === 'audio' && <p className="text-xs text-mute">{t('boards.status.saving')}</p>}
                  </>
                )}

                {(s === 'study' || s === 'tasks' || s === 'practice') && (
                  <>
                    <select value={picked[s] ?? ''} onChange={(e) => setPicked((p) => ({ ...p, [s]: e.target.value }))} className={`${inputCls} w-full`}>
                      <option value="">{lists[s] ? t(`boards.insert.pick.${s}`) : t('common.loading')}</option>
                      {(lists[s] ?? []).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.cefr ? `${l.cefr} · ` : ''}
                          {l.title}
                        </option>
                      ))}
                    </select>
                    <div className="flex rounded-full border border-line p-0.5 text-xs font-semibold">
                      {(['interactive', 'cards'] as const).map((m) => (
                        <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-full px-2 py-1 ${mode === m ? 'bg-plum text-paper' : 'text-mute'}`}>
                          {t(`boards.insert.modes.${m}`)}
                        </button>
                      ))}
                    </div>
                    <Button variant="soft" onClick={() => addContent(s)} disabled={!picked[s] || busy === s}>
                      {busy === s ? '…' : t('boards.insert.put')}
                    </Button>
                    <p className="text-xs text-mute">{t(`boards.insert.hint.${s}`)}</p>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {err && <p className="text-sm text-warn">{err}</p>}
      </div>
    </aside>
  )
}
