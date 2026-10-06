import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface FilterChipProps {
  label: string
  count: number
  pressed: boolean
  onClick: () => void
  icon?: ReactNode
}

/** One choice of a filter, as a pill with how many things it shows. Put a group of them in a `role="group"`. */
export function FilterChip({ label, count, pressed, onClick, icon }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-display font-medium ring-2 transition-all active:scale-95',
        pressed
          ? 'bg-brand-500 text-brand-950 ring-brand-500'
          : 'bg-surface text-ink-soft ring-line hover:text-ink hover:ring-brand-300',
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-xs font-bold tabular-nums',
          pressed ? 'bg-white/45' : 'bg-surface-muted text-ink-soft',
        )}
      >
        {count}
      </span>
    </button>
  )
}
