import { useEffect, useRef } from 'react'
import { cn } from '@/lib/cn'
import { movePairs } from '../engine/board'
import type { PlayedMove } from '../types/chessTypes'

/** The moves so far in standard algebraic notation, numbered like a score sheet, the latest marked. */
export function MoveHistory({ history }: { history: readonly PlayedMove[] }) {
  const pairs = movePairs(history)
  const list = useRef<HTMLOListElement>(null)
  const last = history[history.length - 1]?.ply

  // Keep the latest move in view.
  useEffect(() => {
    const element = list.current
    if (element) element.scrollTop = element.scrollHeight
  }, [last])

  return (
    <section aria-labelledby="chess-moves" className="flex flex-col gap-2 rounded-control bg-surface-muted p-3">
      <h2 id="chess-moves" className="font-display text-base font-semibold">
        Moves
      </h2>
      {pairs.length === 0 ? (
        <p className="text-sm text-ink-soft">No moves yet. White starts.</p>
      ) : (
        <ol ref={list} aria-label="Moves played" className="grid max-h-56 grid-cols-[2.5rem_1fr_1fr] gap-x-1 gap-y-0.5 overflow-y-auto pr-1 text-sm">
          {pairs.map((pair) => (
            <li key={pair.number} className="contents">
              <span className="py-0.5 text-right font-bold text-ink-soft tabular-nums">{pair.number}.</span>
              <Cell move={pair.white} latest={pair.white?.ply === last} />
              <Cell move={pair.black} latest={pair.black?.ply === last} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Cell({ move, latest }: { move: PlayedMove | null; latest: boolean }) {
  if (!move) return <span />
  return (
    <span
      aria-current={latest ? 'step' : undefined}
      aria-label={`${move.color === 'WHITE' ? 'White' : 'Black'}: ${move.san}`}
      className={cn('rounded-md px-1.5 py-0.5 font-mono font-semibold', latest ? 'bg-(--accent) text-(--accent-ink)' : 'text-ink')}
    >
      {move.san}
    </span>
  )
}
