import { Pause, Play, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import type { PlayMode } from '../ai'
import { AiPanel, type AiPanelProps } from './AiPanel'
import { PlayModeToggle } from './PlayModeToggle'

export interface GameStat {
  label: string
  value: ReactNode
}

interface GameShellProps {
  /** The playfield, including any overlays. */
  board: ReactNode
  stats: GameStat[]
  /** Human or AI. Leave out, with `ai`, for a game that has no AI: it is always played by a human. */
  mode?: PlayMode
  onModeChange?: (mode: PlayMode) => void
  /** Whether this player has the game's AI (admins). Without it there is no Human/AI switch. */
  aiAvailable?: boolean
  ai?: AiPanelProps
  /** Omit for games where pausing a human makes no sense (turn-based games). */
  pause?: { paused: boolean; onToggle: () => void; disabled?: boolean }
  onRestart: () => void
  /** How to play, shown in Human mode. */
  humanHelp: ReactNode
  /** On-screen controls for touch devices, shown under the board in Human mode. */
  touchControls?: ReactNode
  /** Extra sidebar content shown in both modes (e.g. a next-piece preview). */
  sidebarExtra?: ReactNode
}

/**
 * The frame shared by every game: board on the left, and on the right the Human/AI switch (for
 * admins, who have the AI), stats, the AI panel (or human help), and pause/restart. Games supply
 * content; none of this is game-specific.
 */
export function GameShell({
  board,
  stats,
  mode = 'human',
  onModeChange,
  aiAvailable = false,
  ai,
  pause,
  onRestart,
  humanHelp,
  touchControls,
  sidebarExtra,
}: GameShellProps) {
  const isAi = mode === 'ai' && ai !== undefined

  return (
    <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-start">
      <div className="flex min-w-0 flex-col items-center gap-5">
        {board}
        {!isAi && touchControls}
      </div>

      <aside className="flex flex-col gap-4">
        {aiAvailable && onModeChange && <PlayModeToggle mode={mode} onChange={onModeChange} />}

        <dl className="grid grid-cols-[repeat(auto-fit,minmax(5rem,1fr))] gap-2">
          {stats.map(({ label, value }) => (
            <div key={label} className="rounded-control bg-surface-muted px-3 py-2">
              <dt className="text-xs font-bold tracking-wide text-ink-soft uppercase">{label}</dt>
              <dd className="font-display text-2xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        {sidebarExtra}

        {isAi && ai ? (
          <AiPanel {...ai} />
        ) : (
          <div className="rounded-control bg-surface-muted p-4 text-sm text-ink-soft">{humanHelp}</div>
        )}

        <div className="flex flex-wrap gap-3">
          {pause && (
            <Button variant="secondary" onClick={pause.onToggle} disabled={pause.disabled} className="flex-1">
              {pause.paused ? <Play aria-hidden className="size-4" /> : <Pause aria-hidden className="size-4" />}
              {pause.paused ? 'Resume' : 'Pause'}
              {isAi && ' AI'}
            </Button>
          )}
          <Button variant="secondary" onClick={onRestart} className="flex-1">
            <RotateCcw aria-hidden className="size-4" />
            Restart
          </Button>
        </div>
      </aside>
    </div>
  )
}

/** Keyboard key, for control hints. */
export function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-block min-w-6 rounded-md bg-surface px-1.5 py-0.5 text-center font-sans text-xs font-bold text-ink shadow-[0_2px_0_0_var(--color-line)] ring-1 ring-line">
      {children}
    </kbd>
  )
}
