import { Eraser, Eye, SearchCheck, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { HintType, HintView } from '../types/wordleTypes'

const HINTS: { type: HintType; label: string; icon: LucideIcon; help: string }[] = [
  { type: 'REVEAL_LETTER', label: 'Reveal', icon: Eye, help: 'Show one letter you have not found yet' },
  { type: 'CHECK_LETTER', label: 'Check', icon: SearchCheck, help: 'Ask whether a letter is in the word' },
  { type: 'ELIMINATE_LETTERS', label: 'Remove', icon: Eraser, help: 'Grey out a few letters the word does not have' },
]

interface HintBarProps {
  /** The hints the server says can be taken now. */
  available: HintType[]
  taken: HintView[]
  /** The score multiplier after 0, 1, 2 and 3 hints, in percent. */
  hintPercents: number[]
  onHint: (type: HintType) => void
  /** Waiting for the player to pick the letter to check. */
  picking: boolean
  disabled: boolean
}

/** The three hints, what each costs, and what the ones taken said. */
export function HintBar({ available, taken, hintPercents, onHint, picking, disabled }: HintBarProps) {
  const next = hintPercents[taken.length + 1]

  return (
    <section aria-label="Hints" className="flex w-full max-w-[32rem] flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {HINTS.map(({ type, label, icon: Icon, help }) => {
          const used = taken.some((hint) => hint.type === type)
          const active = type === 'CHECK_LETTER' && picking
          return (
            <button
              key={type}
              type="button"
              title={help}
              aria-pressed={type === 'CHECK_LETTER' ? picking : undefined}
              disabled={disabled || (!available.includes(type) && !active)}
              onClick={() => onHint(type)}
              className={cn(
                'flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 font-display text-sm font-semibold ring-1 transition-colors disabled:cursor-not-allowed disabled:opacity-45',
                active
                  ? 'bg-(--accent) text-(--accent-ink) ring-(--accent)'
                  : 'bg-surface text-ink ring-line hover:ring-(--accent) disabled:hover:ring-line',
                used && 'line-through decoration-2',
              )}
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          )
        })}
      </div>
      <p className="text-center text-xs text-ink-soft" aria-live="polite">
        {picking
          ? 'Tap a letter to check it. Tap Check again to cancel.'
          : next !== undefined
            ? `Hints left: ${3 - taken.length}. The next one leaves ${next}% of your score.`
            : 'No hints left in this game.'}
      </p>
      {taken.length > 0 && (
        <ul aria-label="Hints taken" className="flex flex-wrap justify-center gap-1.5">
          {taken.map((hint) => (
            <li key={hint.type} className="rounded-full bg-(--accent)/12 px-3 py-1 text-xs font-bold text-ink">
              {describe(hint)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th']

function describe(hint: HintView): string {
  switch (hint.type) {
    case 'REVEAL_LETTER':
      return `${ORDINALS[hint.position ?? 0]} letter: ${hint.letter}`
    case 'CHECK_LETTER':
      return hint.present ? `${hint.letter} is in the word` : `No ${hint.letter} in the word`
    case 'ELIMINATE_LETTERS':
      return `Not in the word: ${(hint.letters ?? []).join(' ')}`
  }
}
