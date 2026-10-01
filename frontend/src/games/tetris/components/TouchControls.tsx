import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, RotateCw, type LucideIcon } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import type { TetrisAction } from '../types/tetrisTypes'

/** How long a button must be held before it starts repeating, and how fast it then repeats. */
const REPEAT_DELAY_MS = 220
const REPEAT_EVERY_MS = 70

const BUTTONS: { action: TetrisAction; label: string; icon: LucideIcon; repeats: boolean }[] = [
  { action: 'LEFT', label: 'Move left', icon: ArrowLeft, repeats: true },
  { action: 'RIGHT', label: 'Move right', icon: ArrowRight, repeats: true },
  { action: 'ROTATE_CW', label: 'Rotate', icon: RotateCw, repeats: false },
  { action: 'SOFT_DROP', label: 'Soft drop', icon: ArrowDown, repeats: true },
  { action: 'HARD_DROP', label: 'Hard drop', icon: ArrowDownToLine, repeats: false },
]

/**
 * On-screen buttons for touch devices (hidden where a mouse is the main pointer).
 *
 * Moving and soft-dropping repeat while the button is held, the way holding a key does on a
 * keyboard. Rotating and hard-dropping act once per press.
 */
export function TouchControls({ onAction }: { onAction: (action: TetrisAction) => void }) {
  // Always call the newest handler, even from a repeat that started several renders ago.
  const latest = useRef(onAction)
  useEffect(() => {
    latest.current = onAction
  })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const release = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])
  // Never leave a repeat running after the controls are gone.
  useEffect(() => release, [release])

  const press = (action: TetrisAction, repeats: boolean) => {
    release()
    latest.current(action)
    if (!repeats) return

    const repeat = () => {
      latest.current(action)
      timer.current = setTimeout(repeat, REPEAT_EVERY_MS)
    }
    timer.current = setTimeout(repeat, REPEAT_DELAY_MS)
  }

  return (
    // The buttons share the row, so five of them fit on the narrowest phones without shrinking in height.
    <div role="group" aria-label="Game controls" className="hidden w-full max-w-[19.5rem] gap-2 pointer-coarse:flex">
      {BUTTONS.map(({ action, label, icon: Icon, repeats }) => (
        <button
          key={action}
          type="button"
          aria-label={label}
          onPointerDown={(event) => {
            event.preventDefault()
            press(action, repeats)
          }}
          onPointerUp={release}
          onPointerLeave={release}
          onPointerCancel={release}
          // A click with no pointer behind it comes from the keyboard (Enter or Space).
          onClick={(event) => {
            if (event.detail === 0) press(action, false)
          }}
          className="grid h-14 min-w-0 flex-1 touch-none place-items-center rounded-2xl bg-surface text-ink shadow-soft ring-1 ring-line select-none active:bg-(--accent) active:text-(--accent-ink)"
        >
          <Icon aria-hidden className="size-6" strokeWidth={2.5} />
        </button>
      ))}
    </div>
  )
}
