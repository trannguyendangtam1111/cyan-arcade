import { Bot } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { AiSpeed } from '../ai'
import { AiSpeedControl } from './AiSpeedControl'

export type AiStatus = 'playing' | 'paused' | 'finished'

const statusLabels: Record<AiStatus, string> = {
  playing: 'AI playing',
  paused: 'AI paused',
  finished: 'AI finished',
}

export interface AiPanelProps {
  status: AiStatus
  /** The move the AI just chose, e.g. "LEFT" or "Rotate". */
  action?: string
  /** One short, plain-language line about why (optional decision info). */
  detail?: string
  speed: AiSpeed
  onSpeedChange: (speed: AiSpeed) => void
}

/** AI mode sidebar: what the AI is doing right now, and how fast it plays. */
export function AiPanel({ status, action, detail, speed, onSpeedChange }: AiPanelProps) {
  return (
    <section
      aria-label="AI mode"
      className="flex flex-col gap-4 rounded-control bg-(--accent)/10 p-4 ring-1 ring-(--accent)/30"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-xl bg-(--accent) text-(--accent-ink)',
            status === 'playing' && 'motion-safe:animate-pulse',
          )}
        >
          <Bot aria-hidden className="size-6" />
        </span>
        <div className="min-w-0">
          <p role="status" className="font-display font-semibold">
            {statusLabels[status]}
          </p>
          {/* Not a live region: it changes many times per second at high speeds. */}
          <p className="text-sm font-bold">{action ? `AI → ${action}` : 'Getting ready…'}</p>
        </div>
      </div>
      {detail && <p className="-mt-2 text-sm text-ink-soft first-letter:uppercase">{detail}</p>}
      <AiSpeedControl speed={speed} onChange={onSpeedChange} />
    </section>
  )
}
