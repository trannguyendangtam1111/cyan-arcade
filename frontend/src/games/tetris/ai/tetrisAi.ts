import type { GameAI } from '@/games/shared/ai'
import type { Cell, Piece, TetrisAction, TetrisState } from '../engine/tetrisEngine'
import { evaluateBoard } from './evaluation'
import { possiblePlacements, type Placement } from './placements'

/**
 * Tetris AI.
 *
 *   engine state
 *     → generate every reachable placement of the current piece   (placements.ts)
 *     → simulate it with the engine, then every placement of the next piece (one-piece lookahead)
 *     → evaluate the resulting stacks                               (evaluation.ts)
 *     → choose the placement whose best follow-up is best
 *     → emit the next action (rotate / move / drop) towards it
 *
 * The AI only ever returns engine actions; it never edits a board itself.
 */

/** Value of a placement that ends the game. Lower than any real evaluation. */
const GAME_OVER_VALUE = -1_000_000

export interface TetrisDecision {
  action: TetrisAction
  /** The placement the AI is working towards, for drawing the suggested position. */
  target: Placement | null
}

export interface TetrisAI extends GameAI<TetrisState, TetrisAction> {
  decide(state: TetrisState): TetrisDecision
}

/**
 * Picks the best placement for the current piece, looking one piece ahead.
 * The next piece is visible in the preview, so this uses only information a human player has too.
 */
export function choosePlacement(state: TetrisState): Placement | null {
  let best: Placement | null = null
  let bestValue = -Infinity

  for (const placement of possiblePlacements(state)) {
    const value = valueWithLookahead(placement, state)
    if (value > bestValue) {
      bestValue = value
      best = placement
    }
  }
  return best
}

function valueWithLookahead(placement: Placement, before: TetrisState): number {
  const after = placement.result
  if (after.status === 'over') return GAME_OVER_VALUE
  const cleared = after.lines - before.lines

  let best = -Infinity
  for (const followUp of possiblePlacements(after)) {
    const end = followUp.result
    const value =
      end.status === 'over' ? GAME_OVER_VALUE : evaluateBoard(end.board, cleared + (end.lines - after.lines))
    if (value > best) best = value
  }
  // No follow-up at all can only mean the next piece has nowhere to go.
  return best === -Infinity ? evaluateBoard(after.board, cleared) : best
}

/** The single action that brings the piece one step closer to the target placement. */
export function nextActionTowards(piece: Piece, target: Placement): TetrisAction {
  // Same order as the placement search: finish rotating first, then slide, then drop.
  if (piece.rotation !== target.rotation) return 'ROTATE_CW'
  if (piece.x > target.x) return 'LEFT'
  if (piece.x < target.x) return 'RIGHT'
  return 'HARD_DROP'
}

export function createTetrisAi(): TetrisAI {
  // The plan for a piece is computed once and reused for the few actions it takes to carry out.
  // The board only changes when a piece locks, so "same board and piece count" means "same piece".
  let planned: { board: readonly Cell[]; pieces: number; target: Placement | null } | null = null

  const decide = (state: TetrisState): TetrisDecision => {
    if (!planned || planned.board !== state.board || planned.pieces !== state.pieces) {
      planned = { board: state.board, pieces: state.pieces, target: choosePlacement(state) }
    }
    const { target } = planned
    return { action: target ? nextActionTowards(state.piece, target) : 'HARD_DROP', target }
  }

  return { decide, getNextAction: (state) => decide(state).action }
}
