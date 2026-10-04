import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

/* ============================================================
   An audio file of a whiteboard (uploaded or recorded). On the board it is drawn by
   AudioPlayerCard; the link /embed/audio?b=<board>&f=<file>&n=<name> also opens as a page.
   The file is private: it plays only for people who can see the board.
   ============================================================ */

export const audioEmbedLink = (boardId: string, fileId: string, name: string) =>
  `${location.origin}/embed/audio?b=${encodeURIComponent(boardId)}&f=${encodeURIComponent(fileId)}&n=${encodeURIComponent(name)}`

export function AudioPlayerCard({ boardId, fileId, name }: { boardId: string; fileId: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/.test(boardId) || !fileId) return setFailed(true)
    supabase.storage
      .from('board-files')
      .createSignedUrl(`${boardId}/${fileId}`, 60 * 60 * 6)
      .then(({ data }) => (data?.signedUrl ? setSrc(data.signedUrl) : setFailed(true)))
  }, [boardId, fileId])

  return (
    <div className="flex h-full items-center p-2">
      <div className="flex w-full items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-3">
        <span className="text-2xl">🎧</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-body text-sm font-semibold text-ink">{name}</p>
          {src ? <audio controls src={src} className="mt-1 h-9 w-full" /> : <p className="text-xs text-mute">{failed ? '—' : '…'}</p>}
        </div>
      </div>
    </div>
  )
}

export default function AudioEmbed() {
  const q = new URLSearchParams(location.search)
  return (
    <div className="h-screen">
      <AudioPlayerCard boardId={q.get('b') ?? ''} fileId={q.get('f') ?? ''} name={q.get('n') || 'Audio'} />
    </div>
  )
}
