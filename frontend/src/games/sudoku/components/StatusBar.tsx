import { Pause, Play } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatClock } from '../engine/format'

interface StatusBarProps {
  /** E.g. "Daily #282 · Hard". */
  title: string
  mistakes: number
  /** 0 for no limit (relaxed). */
  mistakeLimit: number
  /** How mistakes are counted, said in a few words. */
  rule: string
  elapsedMs: number
  paused: boolean
  canPause: boolean
  onPause: () => void
}

/** Above the board: which puzzle, the mistakes so far and the clock, with pause. */
export function StatusBar({ title, mistakes, mistakeLimit, rule, elapsedMs, paused, canPause, onPause }: StatusBarProps) {
  const danger = mistakeLimit > 0 && mistakes >= mistakeLimit - 1 && mistakes > 0
  return (
    <div className="flex w-full items-center justify-between gap-2 text-sm">
      <p className="min-w-0 truncate font-display font-semibold text-ink">{title}</p>
      <p title={rule} className={cn('shrink-0 font-bold tabular-nums', danger ? 'text-danger' : 'text-ink-soft')}>
        <span className="sr-only">{rule}. </span>
        {mistakeLimit > 0 ? `Mistakes ${mistakes}/${mistakeLimit}` : `Conflicts ${mistakes}`}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <span role="timer" aria-label={`Time ${formatClock(elapsedMs)}`} className="font-display text-base font-semibold text-ink tabular-nums">
          {formatClock(elapsedMs)}
        </span>
        <button
          type="button"
          onClick={onPause}
          disabled={!canPause}
          aria-label={paused ? 'Resume' : 'Pause'}
          aria-keyshortcuts="Escape"
          className="grid size-9 place-items-center rounded-full bg-surface-muted text-ink transition-colors hover:bg-brand-100 focus-visible:outline-3 focus-visible:outline-brand-500 disabled:opacity-40"
        >
          {paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
        </button>
      </div>
    </div>
  )
}
