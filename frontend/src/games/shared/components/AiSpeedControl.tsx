import { useId } from 'react'
import { cn } from '@/lib/cn'
import { AI_SPEEDS, type AiSpeed } from '../ai'

interface AiSpeedControlProps {
  speed: AiSpeed
  onChange: (speed: AiSpeed) => void
}

/** Preset picker for how fast the AI plays back its moves. */
export function AiSpeedControl({ speed, onChange }: AiSpeedControlProps) {
  const labelId = useId()

  return (
    <div>
      <p id={labelId} className="mb-1.5 text-sm font-bold text-ink-soft">
        Speed
      </p>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-6 gap-1">
        {AI_SPEEDS.map((option) => {
          const selected = option === speed
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              className={cn(
                'h-9 rounded-lg font-display text-sm font-semibold transition-colors',
                selected
                  ? 'bg-(--accent) text-(--accent-ink)'
                  : 'bg-surface text-ink-soft ring-1 ring-line hover:text-ink hover:ring-(--accent)',
              )}
            >
              {option}x
            </button>
          )
        })}
      </div>
    </div>
  )
}
