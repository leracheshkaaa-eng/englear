import type { Sense } from '../lib/api'
import { partOfSpeechLabel } from '../lib/config'

/** Pills to switch between the meanings of a word ("1 · noun — книга", "2 · verb — …"). */
export function MeaningTabs({
  senses,
  value,
  onChange,
  withTranslation = true,
}: {
  senses: Sense[]
  value: string | null
  onChange: (key: string | null) => void
  withTranslation?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {senses.map((s, i) => {
        const active = s.key === value
        const gloss = withTranslation ? s.translation || s.definition : ''
        return (
          <button
            key={s.key ?? '_main'}
            type="button"
            onClick={() => onChange(s.key)}
            aria-pressed={active}
            className={`max-w-full truncate rounded-full border px-4 py-1.5 text-left text-sm font-semibold transition-colors ${
              active ? 'border-plum bg-plum text-paper' : 'border-line bg-paper text-mute hover:border-lavender'
            }`}
          >
            {i + 1}
            {s.part_of_speech ? ` · ${partOfSpeechLabel(s.part_of_speech)}` : ''}
            {gloss ? <span className="font-normal"> — {gloss}</span> : null}
          </button>
        )
      })}
    </div>
  )
}
