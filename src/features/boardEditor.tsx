import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Excalidraw, convertToExcalidrawElements, useHandleLibrary, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import * as api from '../lib/api'
import type { Board, BoardScene, Word } from '../lib/api'
import { Button, inputCls } from '../lib/ui'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../i18n/errors'
import { BACKGROUNDS, backgroundStyle, type Background } from './board/background'
import { InsertPanel } from './board/insertPanel'
import type { Skeleton } from './board/elements'
import { studySkeleton, takePendingInsert } from './board/content'
import { isOurEmbed, ourEmbed } from './board/taskEmbed'

/* ============================================================
   The whiteboard itself (Excalidraw). Loaded on demand — it is a large library.
   Autosaves 1.5 s after the last change, with a version check; pictures and audio are
   uploaded to storage; full screen; paper backgrounds; an "Insert" panel.
   ============================================================ */

const LANG_CODES: Record<string, string> = {
  en: 'en', uk: 'uk-UA', ru: 'ru-RU', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', pl: 'pl-PL', zh: 'zh-CN', ja: 'ja-JP',
}

type Status = 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error'

const blobToDataURL = (b: Blob) =>
  new Promise<string>((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(r.result as string)
    r.onerror = () => fail(r.error)
    r.readAsDataURL(b)
  })
const dataURLToBlob = async (url: string) => (await fetch(url)).blob()
/** id+version of every live element: changes when anything on the board changes */
const fingerprint = (els: readonly { id: string; version: number; isDeleted?: boolean }[]) =>
  els.filter((e) => !e.isDeleted).map((e) => `${e.id}:${e.version}`).join(',')

/** Shape libraries the user added (excalidraw library browser) — kept on this device. */
const LIBRARY_KEY = 'englear.boardLibrary'
const libraryAdapter = {
  load: () => {
    try {
      return { libraryItems: JSON.parse(localStorage.getItem(LIBRARY_KEY) ?? '[]') }
    } catch {
      return { libraryItems: [] }
    }
  },
  save: (data: { libraryItems: unknown }) => {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(data.libraryItems))
    } catch {
      // storage full or blocked: the library just is not remembered
    }
  },
}

/** Our own embeds (audio player) are allowed; anything else uses Excalidraw's list (YouTube, Vimeo…). */
const validateEmbeddable = (link: string) => (link.startsWith(`${location.origin}/embed/`) ? true : undefined)

export default function BoardEditor({ boardId, onBack }: { boardId: string; onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const { userId } = useAuth()
  const [board, setBoard] = useState<Board | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [status, setStatus] = useState<Status>('saved')
  const [title, setTitle] = useState('')
  const [wordOpen, setWordOpen] = useState(false)
  const [insertOpen, setInsertOpen] = useState(false)
  const [full, setFull] = useState(false)
  const [bg, setBg] = useState<Background>('plain')
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 })
  const [xapi, setXapi] = useState<ExcalidrawImperativeAPI | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const frame = useRef<HTMLElement>(null)
  const version = useRef(0)
  const lastPrint = useRef('')
  const bgSaved = useRef<Background>('plain')
  const uploaded = useRef(new Set<string>())
  const timer = useRef<number | undefined>(undefined)
  const saving = useRef(false)

  useHandleLibrary({ excalidrawAPI: xapi, adapter: libraryAdapter })

  // load the board, its pictures and my rights
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [b, edit] = await Promise.all([api.getBoard(boardId), api.canEditBoard(boardId)])
        if (!alive) return
        if (!b) return setLoadErr(t('boards.notFound'))
        version.current = b.version
        lastPrint.current = fingerprint((b.scene.elements ?? []) as { id: string; version: number }[])
        uploaded.current = new Set(Object.keys(b.scene.files ?? {}))
        const savedBg = (b.scene.appState?.background as Background) ?? 'plain'
        bgSaved.current = savedBg
        setBg(savedBg)
        setTitle(b.title)
        setCanEdit(edit)
        setBoard(b)
      } catch (e) {
        if (alive) setLoadErr(errorMessage(e))
      }
    })()
    return () => {
      alive = false
      window.clearTimeout(timer.current)
    }
  }, [boardId, t])

  // leaving the browser's full screen (Esc) also leaves ours
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement) setFull(false)
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  function toggleFull() {
    if (full) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      setFull(false)
    } else {
      setFull(true)
      // real full screen where the browser allows it (not on iPhone): our layout covers the page anyway
      frame.current?.requestFullscreen?.().catch(() => {})
    }
  }

  // pictures come from storage after the scene is shown
  async function loadFiles(a: ExcalidrawImperativeAPI, b: Board) {
    const files: BinaryFileData[] = []
    for (const [id, meta] of Object.entries(b.scene.files ?? {})) {
      const blob = await api.downloadBoardFile(b.id, id)
      if (blob) files.push({ id, dataURL: (await blobToDataURL(blob)) as BinaryFileData['dataURL'], mimeType: meta.mimeType as BinaryFileData['mimeType'], created: meta.created } as BinaryFileData)
    }
    if (files.length) a.addFiles(files)
  }

  const initialData = useMemo(() => {
    if (!board) return null
    return {
      elements: board.scene.elements as never,
      // under a paper pattern the canvas must be transparent from the start (Excalidraw applies this on load)
      appState: {
        viewBackgroundColor: (board.scene.appState?.background ?? 'plain') !== 'plain' ? 'transparent' : (board.scene.appState?.viewBackgroundColor ?? '#ffffff'),
        currentItemFontFamily: 2,
      },
      scrollToContent: true,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.id])

  async function save() {
    const a = apiRef.current
    if (!a || !board || !canEdit || saving.current) return
    const elements = a.getSceneElements()
    if (fingerprint(elements) === lastPrint.current && bg === bgSaved.current) return setStatus('saved')
    saving.current = true
    setStatus('saving')
    try {
      // upload new pictures first
      const all: BinaryFiles = a.getFiles()
      const used = new Set(elements.flatMap((e) => (e.type === 'image' && e.fileId ? [e.fileId as string] : [])))
      const files: BoardScene['files'] = {}
      for (const id of used) {
        const f = all[id]
        if (!f) continue
        if (!uploaded.current.has(id)) {
          await api.uploadBoardFile(board.id, id, await dataURLToBlob(f.dataURL))
          uploaded.current.add(id)
        }
        files[id] = { mimeType: f.mimeType, created: f.created }
      }
      const appState = a.getAppState()
      version.current = await api.saveBoard(
        board.id,
        { elements: elements as unknown[], appState: { viewBackgroundColor: appState.viewBackgroundColor, background: bg }, files },
        version.current,
      )
      lastPrint.current = fingerprint(elements)
      bgSaved.current = bg
      setStatus('saved')
    } catch (e) {
      setStatus((e as { hint?: string }).hint === 'conflict' ? 'conflict' : 'error')
    } finally {
      saving.current = false
    }
  }

  function scheduleSave() {
    if (!canEdit || status === 'conflict') return
    setStatus('unsaved')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(save, 1500)
  }

  function onChange() {
    const a = apiRef.current
    if (!a || !canEdit) return
    if (fingerprint(a.getSceneElements()) === lastPrint.current) return
    scheduleSave()
  }

  // under a paper pattern the canvas itself is transparent
  useEffect(() => {
    xapi?.updateScene({ appState: { viewBackgroundColor: bg === 'plain' ? '#ffffff' : 'transparent' } })
  }, [xapi, bg])

  // a new paper background is saved too
  useEffect(() => {
    if (board && bg !== bgSaved.current) scheduleSave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg])

  async function back() {
    window.clearTimeout(timer.current)
    if (status === 'unsaved') await save()
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    onBack()
  }

  async function insertWord(w: Word) {
    const a = apiRef.current
    if (!a) return
    await document.fonts.load('20px Excalifont').catch(() => [])
    const st = a.getAppState()
    const { x, y } = viewportCoordsToSceneCoords({ clientX: st.offsetLeft + st.width / 2, clientY: st.offsetTop + st.height / 2 }, st)
    const tr = api.wordTranslation(w)
    const text = tr ? `${w.word} — ${tr}` : w.word
    const [el] = convertToExcalidrawElements([{ type: 'text', x: x - 120, y, text, fontSize: 28 } as Skeleton[number]])
    a.updateScene({ elements: [...a.getSceneElements(), el] })
    setWordOpen(false)
    onChange()
  }

  if (loadErr) {
    return (
      <section className="mx-auto max-w-md px-6 pt-16 text-center">
        <p className="text-mute">{loadErr}</p>
        <Button className="mt-4" onClick={onBack}>
          ← {t('common.back')}
        </Button>
      </section>
    )
  }

  const statusText: Record<Status, string> = {
    saved: t('boards.status.saved'),
    saving: t('boards.status.saving'),
    unsaved: t('boards.status.unsaved'),
    conflict: t('boards.status.conflict'),
    error: t('boards.status.error'),
  }

  return (
    <section ref={frame} className={full ? 'fixed inset-0 z-50 flex flex-col bg-paper p-2' : 'flex h-[calc(100vh-96px)] flex-col px-3 pb-3'}>
      <div className="flex flex-wrap items-center gap-2 py-2">
        <Button variant="ghost" onClick={back}>
          ← {t('boards.title')}
        </Button>
        {board && (
          <input
            value={title}
            disabled={board.owner_id !== userId}
            onChange={(e) => setTitle(e.target.value.slice(0, 120))}
            onBlur={() => title.trim() && title !== board.title && api.updateBoard(board.id, { title: title.trim() }).catch(() => {})}
            className="min-w-0 flex-1 bg-transparent font-display text-xl font-semibold outline-none focus:underline"
          />
        )}
        {canEdit && (
          <>
            <select value={bg} onChange={(e) => setBg(e.target.value as Background)} className={`${inputCls} w-auto py-1.5 text-sm`} title={t('boards.background')}>
              {BACKGROUNDS.map((b) => (
                <option key={b} value={b}>
                  {t(`boards.backgrounds.${b}`)}
                </option>
              ))}
            </select>
            <Button variant="soft" onClick={() => setWordOpen(true)}>
              📖 {t('boards.insertWord')}
            </Button>
            <Button onClick={() => setInsertOpen((v) => !v)}>➕ {t('boards.insert.title')}</Button>
          </>
        )}
        <span className={`text-xs ${status === 'conflict' || status === 'error' ? 'text-warn' : 'text-mute'}`}>
          {canEdit ? statusText[status] : t('boards.readOnly')}
        </span>
        {status === 'conflict' && (
          <Button variant="soft" onClick={() => location.reload()}>
            {t('boards.reload')}
          </Button>
        )}
        {status === 'error' && (
          <Button variant="soft" onClick={save}>
            {t('boards.retry')}
          </Button>
        )}
        <button onClick={toggleFull} title={full ? t('boards.exitFull') : t('boards.full')} className="rounded-full border border-line px-3 py-1.5 text-lg leading-none hover:border-lavender">
          {full ? '⤡' : '⛶'}
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-line" style={backgroundStyle(bg, view.x, view.y, view.zoom)}>
        {board && initialData ? (
          <div className={`h-full w-full ${bg !== 'plain' ? 'englear-board-paper' : ''}`}>
            <Excalidraw
              initialData={initialData}
              excalidrawAPI={(a) => {
                if (apiRef.current) return
                apiRef.current = a
                setXapi(a)
                loadFiles(a, board).catch(() => {})
                // "Teach on a board": the lesson is laid out on the new, empty board
                const studyId = takePendingInsert(board.id)
                if (studyId && (board.scene.elements ?? []).length === 0) {
                  const tt = t as unknown as (k: string, o?: Record<string, unknown>) => string
                  document.fonts
                    .load('20px Excalifont')
                    .catch(() => [])
                    .then(() => studySkeleton(studyId, () => ({ x: 0, y: 0 }), 'interactive', tt, true))
                    .then((sk) => {
                      const els = convertToExcalidrawElements(sk)
                      a.updateScene({ elements: els })
                      a.scrollToContent(els, { fitToContent: true })
                      scheduleSave()
                    })
                    .catch(() => {})
                }
              }}
              onChange={onChange}
              onScrollChange={(x, y, zoom) => setView({ x, y, zoom: zoom.value })}
              viewModeEnabled={!canEdit}
              langCode={LANG_CODES[i18n.language.slice(0, 2)] ?? 'en'}
              name={title}
              libraryReturnUrl={location.href}
              validateEmbeddable={validateEmbeddable}
              renderEmbeddable={(el) => ourEmbed(el.link)}
              // our exercises answer on the first click (Excalidraw would first select the element)
              onPointerDown={(_tool, pd) => {
                const el = pd.hit.element
                if (el?.type === 'embeddable' && isOurEmbed(el.link)) {
                  setTimeout(() => apiRef.current?.updateScene({ appState: { activeEmbeddable: { element: el, state: 'active' } } as never }), 0)
                }
              }}
              UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false } }}
            />
          </div>
        ) : (
          <p className="p-8 text-center text-mute">{t('common.loading')}</p>
        )}
        {wordOpen && <WordPicker onPick={insertWord} onClose={() => setWordOpen(false)} />}
        {insertOpen && xapi && board && <InsertPanel xapi={xapi} boardId={board.id} onInserted={scheduleSave} onClose={() => setInsertOpen(false)} />}
      </div>
    </section>
  )
}

function WordPicker({ onPick, onClose }: { onPick: (w: Word) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [words, setWords] = useState<Word[]>([])
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return setWords([])
    const id = window.setTimeout(() => api.searchWords({ q: term, limit: 12 }).then(setWords).catch(() => setWords([])), 250)
    return () => window.clearTimeout(id)
  }, [q])
  return (
    <div className="absolute inset-0 z-20 grid place-items-start justify-center bg-ink/20 pt-16" onClick={onClose}>
      <div className="w-[min(420px,90vw)] rounded-2xl border border-line bg-paper p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('boards.wordSearch')} className={`${inputCls} w-full`} />
        <div className="mt-2 max-h-72 overflow-y-auto">
          {words.map((w) => (
            <button key={w.id} onClick={() => onPick(w)} className="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-lilac/50">
              <span className="font-semibold">{w.word}</span>
              <span className="truncate text-sm text-mute">{api.wordTranslation(w)}</span>
            </button>
          ))}
          {q.trim().length >= 2 && words.length === 0 && <p className="p-3 text-sm text-mute">{t('boards.noWords')}</p>}
        </div>
      </div>
    </div>
  )
}
