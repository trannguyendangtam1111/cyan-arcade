import { CalendarDays, Shuffle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { PlayMode } from '../hooks/useSudokuGame'

interface ModeBarProps {
  mode: PlayMode
  onChange: (mode: PlayMode) => void
}

/** Daily Sudoku or practice. */
export function ModeBar({ mode, onChange }: ModeBarProps) {
  const options: { value: PlayMode; label: string; icon: typeof CalendarDays }[] = [
    { value: 'daily', label: 'Daily Sudoku', icon: CalendarDays },
    { value: 'practice', label: 'Practice', icon: Shuffle },
  ]
  return (
    <div role="tablist" aria-label="Puzzle" className="grid w-full max-w-[22rem] grid-cols-2 gap-1 rounded-control bg-surface-muted p-1">
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            'flex h-9 items-center justify-center gap-1.5 rounded-xl font-display text-sm font-semibold transition-colors',
            mode === value ? 'bg-(--accent) text-(--accent-ink) shadow-soft' : 'text-ink-soft hover:bg-surface hover:text-ink',
          )}
        >
          <Icon aria-hidden className="size-4" />
          {label}
        </button>
      ))}
    </div>
  )
}
