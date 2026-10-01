import {
  dropDistance,
  updateTetris,
  type Piece,
  type PieceType,
  type TetrisAction,
  type TetrisState,
} from '../engine/tetrisEngine'

/** One way to put the current piece down: an orientation and a column, dropped straight down. */
export interface Placement {
  rotation: number
  x: number
  /** Where the piece comes to rest. */
  landing: Piece
  /** The moves that produce it from the current state, ending with the hard drop. */
  actions: TetrisAction[]
  /** The game after the piece has locked (lines cleared, next piece spawned). */
  result: TetrisState
}

/** Orientations that look different. The O piece has one, and I, S and Z repeat after two. */
const DISTINCT_ROTATIONS: Record<PieceType, number> = { O: 1, I: 2, S: 2, Z: 2, T: 4, J: 4, L: 4 }

/**
 * Every placement the current piece can actually reach by rotating and then sliding sideways.
 *
 * Nothing here re-implements the rules: each candidate is produced by feeding real actions to the
 * engine, so a placement is reachable by construction and its `result` is exactly what the game
 * will do when those actions are played.
 */
export function possiblePlacements(state: TetrisState): Placement[] {
  if (state.status !== 'playing') return []

  const placements: Placement[] = []
  const seen = new Set<string>()
  const add = (current: TetrisState, actions: TetrisAction[]) => {
    const { rotation, x, y } = current.piece
    const key = `${rotation}:${x}`
    if (seen.has(key)) return
    seen.add(key)
    placements.push({
      rotation,
      x,
      landing: { ...current.piece, y: y + dropDistance(current.board, current.piece) },
      actions: [...actions, 'HARD_DROP'],
      result: updateTetris(current, 'HARD_DROP'),
    })
  }

  let rotated = state
  const rotations: TetrisAction[] = []
  for (let turn = 0; turn < DISTINCT_ROTATIONS[state.piece.type]; turn++) {
    if (turn > 0) {
      const next = updateTetris(rotated, 'ROTATE_CW')
      if (next === rotated) break // no room to turn any further
      rotated = next
      rotations.push('ROTATE_CW')
    }

    add(rotated, rotations)
    for (const direction of ['LEFT', 'RIGHT'] as const) {
      let current = rotated
      const actions = [...rotations]
      for (;;) {
        const next = updateTetris(current, direction)
        if (next === current) break // reached a wall or the stack
        current = next
        actions.push(direction)
        add(current, actions)
      }
    }
  }
  return placements
}
