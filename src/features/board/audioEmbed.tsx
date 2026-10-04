import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/* ============================================================
   /embed/audio?b=<board>&f=<file>&n=<name> — a small audio player shown inside a whiteboard
   (as an embedded element). The file is private: it plays only for people who can see the board.
   ============================================================ */

export const audioEmbedLink = (boardId: string, fileId: string, name: string) =>
  `${location.origin}/embed/audio?b=${encodeURIComponent(boardId)}&f=${encodeURIComponent(fileId)}&n=${encodeURIComponent(name)}`

export default function AudioEmbed() {
  const q = new URLSearchParams(location.search)
  const board = q.get('b') ?? ''
  const file = q.get('f') ?? ''
  const name = q.get('n') || 'Audio'
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/.test(board) || !file) return setFailed(true)
    supabase.storage
      .from('board-files')
      .createSignedUrl(`${board}/${file}`, 60 * 60 * 6)
      .then(({ data }) => (data?.signedUrl ? setSrc(data.signedUrl) : setFailed(true)))
  }, [board, file])

  return (
    <div style={{ background: 'transparent' }} className="flex h-screen items-center justify-center p-2">
      <div className="flex w-full items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3 shadow-sm">
        <span className="text-2xl">🎧</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-body text-sm font-semibold text-ink">{name}</p>
          {src ? <audio controls src={src} className="mt-1 h-9 w-full" /> : <p className="text-xs text-mute">{failed ? '—' : '…'}</p>}
        </div>
      </div>
    </div>
  )
}
