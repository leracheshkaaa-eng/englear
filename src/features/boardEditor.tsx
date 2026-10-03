import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Excalidraw, convertToExcalidrawElements, viewportCoordsToSceneCoords } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { BinaryFileData, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import * as api from '../lib/api'
import type { Board, BoardScene, Word } from '../lib/api'
import { Button, inputCls } from '../lib/ui'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../i18n/errors'
import type { Template } from './boardTemplates'

/* ============================================================
   The whiteboard itself (Excalidraw). Loaded on demand — it is a large library.
   Autosaves 1.5 s after the last change, with a version check; pictures are uploaded
   to storage once and loaded back when the board opens.
   ============================================================ */

const LANG_CODES: Record<string, string> = {
  en: 'en', uk: 'uk-UA', ru: 'ru-RU', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', pt: 'pt-PT', pl: 'pl-PL', zh: 'zh-CN', ja: 'ja-JP',
}

type Status = 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error'
type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>

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

/* ---------- templates ---------- */

function templateElements(tpl: Template, t: (k: string) => string): Skeleton {
  const box = (x: number, y: number, w: number, h: number, text: string, bg = 'transparent') =>
    ({ type: 'rectangle', x, y, width: w, height: h, backgroundColor: bg, fillStyle: 'solid', roundness: { type: 3 }, label: { text, fontSize: 20 } }) as Skeleton[number]
  const title = (text: string) => ({ type: 'text', x: 0, y: -70, text, fontSize: 32 }) as Skeleton[number]
  if (tpl === 'tenses') {
    const rows = ['Present', 'Past', 'Future']
    const cols = ['Simple', 'Continuous', 'Perfect']
    const out: Skeleton = [title(t('boards.tpl.tensesTitle'))]
    cols.forEach((c, i) => out.push(box(180 + i * 260, 0, 240, 60, c, '#e9e4fb')))
    rows.forEach((r, j) => {
      out.push(box(0, 80 + j * 180, 160, 160, r, '#e9e4fb'))
      cols.forEach((_, i) => out.push(box(180 + i * 260, 80 + j * 180, 240, 160, '')))
    })
    return out
  }
  if (tpl === 'cards') {
    const out: Skeleton = [title(t('boards.tpl.cardsTitle'))]
    for (let i = 0; i < 6; i++) out.push(box((i % 3) * 280, Math.floor(i / 3) * 200, 260, 180, 'word — ', '#fff4cc'))
    return out
  }
  if (tpl === 'plan') {
    const steps = ['Warm-up', 'Presentation', 'Practice', 'Production', 'Homework']
    const out: Skeleton = [title(t('boards.tpl.planTitle'))]
    steps.forEach((s, i) => out.push(box(0, i * 150, 700, 130, `${s}\n`, i % 2 ? '#eef7f1' : '#e9e4fb')))
    return out
  }
  return []
}

export default function BoardEditor({ boardId, template, onBack }: { boardId: string; template?: Template; onBack: () => void }) {
  const { t, i18n } = useTranslation()
  const { userId } = useAuth()
  const [board, setBoard] = useState<Board | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [status, setStatus] = useState<Status>('saved')
  const [title, setTitle] = useState('')
  const [wordOpen, setWordOpen] = useState(false)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const version = useRef(0)
  const lastPrint = useRef('')
  const uploaded = useRef(new Set<string>())
  const timer = useRef<number | undefined>(undefined)
  const saving = useRef(false)

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

  // pictures come from storage after the scene is shown
  async function loadFiles(a: ExcalidrawImperativeAPI, b: Board) {
    const entries = Object.entries(b.scene.files ?? {})
    const files: BinaryFileData[] = []
    for (const [id, meta] of entries) {
      const blob = await api.downloadBoardFile(b.id, id)
      if (blob) files.push({ id, dataURL: (await blobToDataURL(blob)) as BinaryFileData['dataURL'], mimeType: meta.mimeType as BinaryFileData['mimeType'], created: meta.created } as BinaryFileData)
    }
    if (files.length) a.addFiles(files)
  }

  const initialData = useMemo(() => {
    if (!board) return null
    return {
      elements: board.scene.elements as never,
      appState: { viewBackgroundColor: board.scene.appState?.viewBackgroundColor ?? '#ffffff', currentItemFontFamily: 2 },
      scrollToContent: true,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.id])

  async function save() {
    const a = apiRef.current
    if (!a || !board || !canEdit || saving.current) return
    const elements = a.getSceneElements()
    const print = fingerprint(elements)
    if (print === lastPrint.current) return setStatus('saved')
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
      version.current = await api.saveBoard(board.id, { elements: elements as unknown[], appState: { viewBackgroundColor: appState.viewBackgroundColor }, files }, version.current)
      lastPrint.current = print
      setStatus('saved')
    } catch (e) {
      setStatus((e as { hint?: string }).hint === 'conflict' ? 'conflict' : 'error')
    } finally {
      saving.current = false
    }
  }

  function onChange() {
    if (!canEdit || status === 'conflict') return
    const a = apiRef.current
    if (!a) return
    if (fingerprint(a.getSceneElements()) === lastPrint.current) return
    setStatus('unsaved')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(save, 1500)
  }

  // save before leaving
  async function back() {
    window.clearTimeout(timer.current)
    if (status === 'unsaved') await save()
    onBack()
  }

  function insertWord(w: Word) {
    const a = apiRef.current
    if (!a) return
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
    <section className="flex h-[calc(100vh-96px)] flex-col px-3 pb-3">
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
          <Button variant="soft" onClick={() => setWordOpen(true)}>
            📖 {t('boards.insertWord')}
          </Button>
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
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-line bg-white">
        {board && initialData ? (
          <Excalidraw
            initialData={initialData}
            excalidrawAPI={(a) => {
              if (apiRef.current) return
              apiRef.current = a
              loadFiles(a, board).catch(() => {})
              // a template is drawn once the board font is loaded (text is measured with the real font), then saved
              if ((board.scene.elements ?? []).length === 0 && template && template !== 'empty') {
                document.fonts
                  .load('20px Excalifont')
                  .catch(() => [])
                  .then(() => {
                    const els = convertToExcalidrawElements(templateElements(template, t as unknown as (k: string) => string))
                    a.updateScene({ elements: els })
                    a.scrollToContent(els, { fitToContent: true })
                    onChange()
                  })
              }
            }}
            onChange={onChange}
            viewModeEnabled={!canEdit}
            langCode={LANG_CODES[i18n.language.slice(0, 2)] ?? 'en'}
            name={title}
            UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false, toggleTheme: false } }}
          />
        ) : (
          <p className="p-8 text-center text-mute">{t('common.loading')}</p>
        )}
        {wordOpen && <WordPicker onPick={insertWord} onClose={() => setWordOpen(false)} />}
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
