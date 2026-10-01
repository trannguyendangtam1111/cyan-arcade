import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, type LucideIcon } from 'lucide-react'
import type { SwipeDirection } from '../useSwipe'

const buttons: { direction: SwipeDirection; icon: LucideIcon; position: string }[] = [
  { direction: 'UP', icon: ChevronUp, position: 'col-start-2 row-start-1' },
  { direction: 'LEFT', icon: ChevronLeft, position: 'col-start-1 row-start-2' },
  { direction: 'DOWN', icon: ChevronDown, position: 'col-start-2 row-start-2' },
  { direction: 'RIGHT', icon: ChevronRight, position: 'col-start-3 row-start-2' },
]

/** On-screen arrow keys. Rendered only on touch devices. */
export function DirectionPad({ onPress }: { onPress: (direction: SwipeDirection) => void }) {
  return (
    <div role="group" aria-label="Direction controls" className="hidden grid-cols-3 gap-2 pointer-coarse:grid">
      {buttons.map(({ direction, icon: Icon, position }) => (
        <button
          key={direction}
          type="button"
          aria-label={direction.toLowerCase()}
          onPointerDown={(event) => {
            event.preventDefault()
            onPress(direction)
          }}
          className={`grid size-14 touch-none place-items-center rounded-2xl bg-surface text-ink shadow-soft ring-1 ring-line active:bg-(--accent) active:text-(--accent-ink) ${position}`}
        >
          <Icon aria-hidden className="size-7" strokeWidth={2.5} />
        </button>
      ))}
    </div>
  )
}
