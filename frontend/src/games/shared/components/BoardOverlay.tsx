import type { ReactNode } from 'react'

interface BoardOverlayProps {
  title: string
  description?: ReactNode
  /** Usually a button (Play again, Resume, ...). */
  action?: ReactNode
}

/** Message shown on top of a game board: ready, paused, game over. Place inside a `relative` box. */
export function BoardOverlay({ title, description, action }: BoardOverlayProps) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-surface/80 p-4 text-center backdrop-blur-xs motion-safe:animate-pop-in">
      <div className="flex flex-col items-center gap-3">
        <h2 className="text-2xl font-bold sm:text-3xl">{title}</h2>
        {description && <p className="max-w-xs text-ink-soft">{description}</p>}
        {action}
      </div>
    </div>
  )
}
