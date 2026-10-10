import { Bot } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import type { Difficulty, DifficultyOption, Side } from '../types/chessTypes'

interface EngineGamePanelProps {
  difficulties: DifficultyOption[] | null
  /** The engine's status could not be read, or it is not running. */
  unavailable: boolean
  busy: boolean
  onStart: (playerSide: Side, difficulty: Difficulty) => void
}

/**
 * Admins: start a game against Stockfish, choosing a side and a difficulty. The difficulties are the
 * server's, each named with the engine setting behind it, which is a target and not a promise of a
 * human-equivalent rating.
 */
export function EngineGamePanel({ difficulties, unavailable, busy, onStart }: EngineGamePanelProps) {
  const [side, setSide] = useState<Side>('WHITE')
  const [difficulty, setDifficulty] = useState<Difficulty>('CLUB')
  const selectId = useId()
  const chosen = difficulties?.find((option) => option.id === difficulty)

  return (
    <section aria-labelledby="chess-engine-game" className="flex flex-col gap-3 rounded-control bg-surface-muted p-3">
      <h2 id="chess-engine-game" className="flex items-center gap-1.5 font-display text-base font-semibold">
        <Bot aria-hidden className="size-4.5" />
        Play vs Stockfish
      </h2>
      {unavailable ? (
        <p className="text-sm text-ink-soft">The chess engine is not available on this server right now.</p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Your side" className="grid grid-cols-2 gap-1.5">
            {(['WHITE', 'BLACK'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={side === option}
                onClick={() => setSide(option)}
                className={cn(
                  'h-9 rounded-control text-sm font-bold ring-2 transition-colors',
                  side === option ? 'bg-surface ring-(--accent)' : 'bg-surface/60 ring-transparent hover:ring-line',
                )}
              >
                Play {option === 'WHITE' ? 'White' : 'Black'}
              </button>
            ))}
          </div>
          <label htmlFor={selectId} className="text-xs font-bold tracking-wide text-ink-soft uppercase">
            Difficulty
          </label>
          <select
            id={selectId}
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value as Difficulty)}
            disabled={!difficulties}
            className="h-10 rounded-control border-2 border-line bg-surface px-2 font-semibold"
          >
            {(difficulties ?? []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {chosen && (
            <p className="text-xs text-ink-soft">
              {chosen.setting}, {chosen.movetimeMs} ms a move. Engine settings, not a guaranteed rating.
            </p>
          )}
          <Button size="sm" onClick={() => onStart(side, difficulty)} disabled={busy || !difficulties}>
            Start game
          </Button>
        </>
      )}
    </section>
  )
}
