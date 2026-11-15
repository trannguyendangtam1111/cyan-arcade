import type { GameAI } from '@/games/shared/ai'
import {
  HEIGHT,
  WIDTH,
  updateTetris,
  type Cell,
  type Piece,
  type TetrisAction,
  type TetrisState,
} from '../engine/tetrisEngine'
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
 *     → emit the next action (rotate / move / soft drop) towards it
 *
 * The AI only ever returns engine actions; it never edits a board itself.
 */

/** Value of a placement that ends the game. Lower than any real evaluation. */
const GAME_OVER_VALUE = -1_000_000

/**
 * Value of a placement that meets the run's objective (Sprint's 40th line, a Challenge stage's line
 * goal or last garbage row). Higher than any real evaluation.
 */
const GOAL_REACHED_VALUE = 1_000_000

/** A run that has ended: a race finished is the best outcome there is, any other end the worst. */
const endValue = (state: TetrisState) => (state.clock?.goalReached ? GOAL_REACHED_VALUE : GAME_OVER_VALUE)

/**
 * What one block over the gap of the topmost garbage row costs on a dig stage, whose objective is to
 * clear every garbage row. A garbage row clears when a piece fills its gap, so what keeps it on the
 * board is whatever covers that gap: without this, the AI stacks over the gaps and clears lines above
 * the garbage while it keeps rising. (A cost per garbage row left was measured too, and made no
 * difference worth its term.)
 */
export const COVERED_GAP_WEIGHT = 0.5

/** Blocks over the gap of the topmost garbage row. 0 once no garbage is left. */
export function coveredGap(state: TetrisState): number {
  const { challenge, board } = state
  const left = challenge ? challenge.garbageAdded - challenge.garbageCleared : 0
  if (left === 0) return 0

  // Garbage rows are always the bottom rows (they rise from below and leave only by clearing), and
  // each is full but for its gap.
  const top = HEIGHT - left
  let gap = 0
  while (gap < WIDTH && board[top * WIDTH + gap] !== null) gap++
  let cover = 0
  for (let y = 0; y < top; y++) if (board[y * WIDTH + gap] !== null) cover++
  return cover
}

/** The objective's part of a stack's value: on a dig stage, the cover over its garbage; 0 elsewhere. */
const objectiveValue = (state: TetrisState) => (state.challenge?.dig ? -COVERED_GAP_WEIGHT * coveredGap(state) : 0)

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
  // A Challenge stage won by this piece beats one won by the next (both are worth the most there is,
  // so without this the AI may keep the winning placement for later). Sprint and the rest unchanged.
  if (after.status === 'over') return endValue(after) + (after.challenge && after.clock?.goalReached ? 1 : 0)
  const cleared = after.lines - before.lines

  let best = -Infinity
  for (const followUp of possiblePlacements(after)) {
    const end = followUp.result
    const value =
      end.status === 'over'
        ? endValue(end)
        : evaluateBoard(end.board, cleared + (end.lines - after.lines)) + objectiveValue(end)
    if (value > best) best = value
  }
  // No follow-up at all can only mean the next piece has nowhere to go.
  return best === -Infinity ? evaluateBoard(after.board, cleared) + objectiveValue(after) : best
}

/**
 * The single action that brings the piece one step closer to the target placement. Once in position
 * the piece is soft dropped a row at a time: it lands exactly where the placement's hard drop would,
 * but is seen falling, as a player's piece is.
 */
export function nextActionTowards(piece: Piece, target: Placement): TetrisAction {
  // Same order as the placement search: finish rotating first, then slide, then drop.
  if (piece.rotation !== target.rotation) return 'ROTATE_CW'
  if (piece.x > target.x) return 'LEFT'
  if (piece.x < target.x) return 'RIGHT'
  return 'SOFT_DROP'
}

export function createTetrisAi(): TetrisAI {
  // The plan for a piece is computed once and reused for the few actions it takes to carry out.
  // The board only changes when a piece locks, so "same board and piece count" means "same piece".
  let planned: { board: readonly Cell[]; pieces: number; target: Placement | null } | null = null
  const plan = (state: TetrisState) => {
    planned = { board: state.board, pieces: state.pieces, target: choosePlacement(state) }
    return planned.target
  }

  const decide = (state: TetrisState): TetrisDecision => {
    let target =
      planned && planned.board === state.board && planned.pieces === state.pieces ? planned.target : plan(state)
    let action: TetrisAction = target ? nextActionTowards(state.piece, target) : 'SOFT_DROP'
    // Gravity may have carried the piece down against the stack since the plan was made, so a turn or
    // a slide it needs is now blocked: plan again from where the piece is. Every placement found from
    // here is reachable from here.
    if (action !== 'SOFT_DROP' && updateTetris(state, action) === state) {
      target = plan(state)
      action = target ? nextActionTowards(state.piece, target) : 'SOFT_DROP'
    }
    return { action, target }
  }

  return { decide, getNextAction: (state) => decide(state).action }
}
