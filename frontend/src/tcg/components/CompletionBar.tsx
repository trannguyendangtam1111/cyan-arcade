import { cn } from '@/lib/cn'

interface CompletionBarProps {
  /** What is being completed, for screen readers: "Scarlet & Violet". */
  label: string
  owned: number
  total: number
  /** 0 to 100, as the server computed it. */
  percent: number
  className?: string
}

/**
 * How much of a set, or of everything, a player has collected, in the color around it (`--accent`).
 * Turns gold when it is complete.
 */
export function CompletionBar({ label, owned, total, percent, className }: CompletionBarProps) {
  const complete = total > 0 && owned >= total
  return (
    <div className={className}>
      <div
        role="progressbar"
        aria-label={`${label} completion`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={owned}
        aria-valuetext={`${owned} of ${total} cards`}
        className="h-2.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--accent)_18%,white)]"
      >
        <div
          style={{ width: `${Math.min(100, percent)}%` }}
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            complete ? 'bg-linear-to-r from-amber-400 to-amber-500' : 'bg-(--accent)',
          )}
        />
      </div>
      <p className="mt-1.5 flex justify-between text-sm text-ink-soft">
        <span>
          <strong className="text-ink">{owned}</strong> / {total} cards
        </span>
        <span className={cn('font-bold', complete && 'text-amber-700')}>{complete ? 'Complete!' : `${percent}%`}</span>
      </p>
    </div>
  )
}
