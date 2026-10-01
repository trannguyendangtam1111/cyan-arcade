import { memo } from 'react'
import { cn } from '@/lib/cn'
import { HEIGHT, WIDTH, dropDistance, pieceCells } from '../engine/tetrisEngine'
import type { Piece, TetrisState } from '../types/tetrisTypes'
import { BLOCK, PIECE_COLORS } from './pieceStyles'

interface TetrisBoardProps {
  state: TetrisState
  /**
   * Where to draw the outline of the piece's destination. Human mode passes nothing and gets the
   * straight-down drop position; AI mode passes the placement the AI has chosen.
   */
  target?: Piece | null
}

/** Renders a Tetris state as a grid of cells. Purely presentational. */
export const TetrisBoard = memo(function TetrisBoard({ state, target }: TetrisBoardProps) {
  const { board, piece, status } = state
  const playing = status === 'playing'

  const active = new Set(pieceCells(piece).map(({ x, y }) => y * WIDTH + x))
  const ghostPiece = target ?? { ...piece, y: piece.y + dropDistance(board, piece) }
  const ghost = playing ? new Set(pieceCells(ghostPiece).map(({ x, y }) => y * WIDTH + x)) : new Set<number>()

  return (
    <div
      role="img"
      aria-label={`Tetris board. Score ${state.score}, ${state.lines} lines, level ${state.level}.`}
      className="grid h-full gap-px rounded-xl bg-(--accent)/15 p-1 ring-4 ring-(--accent)/30"
      style={{
        gridTemplateColumns: `repeat(${WIDTH}, 1fr)`,
        gridTemplateRows: `repeat(${HEIGHT}, 1fr)`,
        aspectRatio: `${WIDTH} / ${HEIGHT}`,
      }}
    >
      {board.map((locked, index) => {
        const type = locked ?? (active.has(index) ? piece.type : null)
        if (type) {
          return <div key={index} className={cn(BLOCK, PIECE_COLORS[type], !playing && 'opacity-60 grayscale-50')} />
        }
        if (ghost.has(index)) {
          return <div key={index} className="rounded-[18%] border-2 border-dashed border-(--accent) bg-(--accent)/15" />
        }
        return <div key={index} className="rounded-[18%] bg-surface/60" />
      })}
    </div>
  )
})
