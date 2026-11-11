import { CalendarDays, History, Shuffle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { PlayMode } from '../hooks/useSudokuGame'

interface ModeBarProps {
  mode: PlayMode
  onChange: (mode: PlayMode) => void
}

/** Daily Sudoku, practice, or a past daily puzzle replayed unranked. */
export function ModeBar({ mode, onChange }: ModeBarProps) {
  const options: { value: PlayMode; label: string; suffix?: string; icon: typeof CalendarDays }[] = [
    { value: 'daily', label: 'Daily', suffix: 'Sudoku', icon: CalendarDays },
    { value: 'practice', label: 'Practice', icon: Shuffle },
    { value: 'archive', label: 'Archive', icon: History },
  ]
  return (
    <div className="@container w-full max-w-[24rem]">
      <div role="tablist" aria-label="Puzzle" className="grid w-full grid-cols-3 gap-1 rounded-control bg-surface-muted p-1">
        {options.map(({ value, label, suffix, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => onChange(value)}
            className={cn(
              'flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-xl px-1 font-display text-sm font-semibold transition-colors',
              mode === value ? 'bg-(--accent) text-(--accent-ink) shadow-soft' : 'text-ink-soft hover:bg-surface hover:text-ink',
            )}
          >
            {/* Below 19rem (the narrowest phones) three labels and icons do not fit: the labels stay. */}
            <Icon aria-hidden className="hidden size-4 shrink-0 @min-[19rem]:block" />
            <span className="truncate">
              {label}
              {/* Narrow screens show "Daily"; the tab is still named "Daily Sudoku". */}
              {suffix && (
                <>
                  {' '}
                  <span className="sr-only @min-[22rem]:not-sr-only">{suffix}</span>
                </>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
