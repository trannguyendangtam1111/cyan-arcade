import { Bot, UserRound, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { PlayMode } from '../ai'

const options: { mode: PlayMode; label: string; icon: LucideIcon }[] = [
  { mode: 'human', label: 'Human', icon: UserRound },
  { mode: 'ai', label: 'AI', icon: Bot },
]

interface PlayModeToggleProps {
  mode: PlayMode
  onChange: (mode: PlayMode) => void
}

/** [ Human ] [ AI ] segmented control. */
export function PlayModeToggle({ mode, onChange }: PlayModeToggleProps) {
  return (
    <div role="group" aria-label="Play mode" className="grid grid-cols-2 gap-1 rounded-control bg-surface-muted p-1">
      {options.map(({ mode: option, label, icon: Icon }) => {
        const selected = option === mode
        return (
          <button
            key={option}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option)}
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-xl font-display font-semibold transition-colors',
              selected ? 'bg-(--accent) text-(--accent-ink) shadow-soft' : 'text-ink-soft hover:bg-surface hover:text-ink',
            )}
          >
            <Icon aria-hidden className="size-4" strokeWidth={2.5} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
