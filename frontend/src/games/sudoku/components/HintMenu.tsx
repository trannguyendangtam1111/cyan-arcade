import { Crosshair, Eye, MessageCircleQuestion, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { cellLabel } from '../engine/grid'
import type { HintType, HintView } from '../types/sudokuTypes'

interface HintMenuProps {
  hintsLeft: number
  /** The score multiplier after each number of hints (0 to 3). */
  hintPercents: number[]
  used: number
  onHint: (type: HintType) => void
  onClose: () => void
  disabled?: boolean
}

const KINDS: { type: HintType; label: string; text: string; icon: typeof Eye }[] = [
  { type: 'REVEAL', label: 'Reveal a cell', text: 'Fills the chosen cell (or the next one logic solves) with its digit.', icon: Eye },
  { type: 'FIND', label: 'Find a cell', text: 'Shows a cell you can solve now, without its digit.', icon: Crosshair },
  { type: 'EXPLAIN', label: 'Explain the next step', text: 'Walks through the reasoning to the next digit.', icon: MessageCircleQuestion },
]

/** The three kinds of hint, what each does, and what the next one costs. */
export function HintMenu({ hintsLeft, hintPercents, used, onHint, onClose, disabled = false }: HintMenuProps) {
  const next = hintPercents[Math.min(used + 1, hintPercents.length - 1)]
  return (
    <section aria-label="Hints" className="w-full rounded-control bg-surface p-3 shadow-soft ring-1 ring-line">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">
          {hintsLeft > 0 ? `${hintsLeft} hint${hintsLeft === 1 ? '' : 's'} left · the next leaves ${next}% of the score` : 'No hints left'}
        </p>
        <button type="button" onClick={onClose} aria-label="Close hints" className="grid size-8 place-items-center rounded-full text-ink-soft hover:bg-surface-muted">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-3">
        {KINDS.map(({ type, label, text, icon: Icon }) => (
          <button
            key={type}
            type="button"
            disabled={disabled || hintsLeft === 0}
            onClick={() => onHint(type)}
            className="flex items-start gap-2 rounded-xl bg-surface-muted p-2.5 text-left transition-colors hover:bg-brand-100 disabled:opacity-50"
          >
            <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-700" />
            <span>
              <span className="block text-sm font-bold text-ink">{label}</span>
              <span className="block text-xs text-ink-soft">{text}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

interface HintCardProps {
  hint: HintView
  /** Candidates the reasoning rules out that are in the player's notes now. */
  removable: number
  onRemoveNotes: () => void
  onClose: () => void
}

/** What the last hint said. */
export function HintCard({ hint, removable, onRemoveNotes, onClose }: HintCardProps) {
  const title =
    hint.type === 'REVEAL' ? `Revealed: ${cellLabel(hint.cell)} is ${hint.digit}` : hint.type === 'FIND' ? `Look at ${cellLabel(hint.cell).toLowerCase()}` : 'Next step'
  return (
    <section aria-label="Hint" aria-live="polite" className={cn('w-full rounded-control bg-amber-50 p-3 text-sm ring-1 ring-amber-200')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-amber-950">{title}</p>
          {hint.technique && <p className="text-xs font-bold tracking-wide text-amber-800 uppercase">{hint.technique.replaceAll('_', ' ').toLowerCase()}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close hint" className="grid size-8 shrink-0 place-items-center rounded-full text-amber-900 hover:bg-amber-100">
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-5 text-amber-950">
        {hint.explanation.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ol>
      {removable > 0 && (
        <Button size="sm" variant="secondary" className="mt-2" onClick={onRemoveNotes}>
          Remove {removable} ruled-out note{removable === 1 ? '' : 's'}
        </Button>
      )}
    </section>
  )
}
