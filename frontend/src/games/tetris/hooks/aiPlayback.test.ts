import { describe, expect, it } from 'vitest'
import { createTetrisAi } from '../ai/tetrisAi'
import { createTetrisGame, gravityDelay, updateTetris } from '../engine/tetrisEngine'
import type { TetrisAction, TetrisState } from '../types/tetrisTypes'
import { AI_FRAME_MS, MOVE_FRAMES, playAiFrame, startAiClock } from './aiPlayback'

/** Plays `frames` AI frames from `state` with a fixed `decide`, through the real engine. */
function play(state: TetrisState, frames: number, decide: (state: TetrisState) => TetrisAction) {
  let current = state
  const applied: TetrisAction[] = []
  const apply = (action: TetrisAction) => {
    applied.push(action)
    current = updateTetris(current, action)
    return current
  }
  let clock = startAiClock()
  for (let frame = 0; frame < frames; frame++) clock = playAiFrame(current, clock, decide, apply)
  return { state: current, applied }
}

/** An O piece, which no rotation changes: an AI that only rotates it leaves it to gravity alone. */
const withO = (state: TetrisState): TetrisState => ({ ...state, piece: { type: 'O', rotation: 0, x: 4, y: 0 } })
const idle = (): TetrisAction => 'ROTATE_CW'

describe('AI playback: gravity', () => {
  it('pulls the piece down every gravity delay of game time, whatever the AI does', () => {
    const start = withO(createTetrisGame(1))
    const framesPerRow = gravityDelay(1) / AI_FRAME_MS // 800 ms at level 1: 20 frames

    expect(play(start, framesPerRow - 1, idle).state.piece.y).toBe(0)
    expect(play(start, framesPerRow, idle).state.piece.y).toBe(1)
    expect(play(start, framesPerRow * 3, idle).state.piece.y).toBe(3)
  })

  it('falls faster at higher levels, by the same table as a human game', () => {
    const level10 = { ...withO(createTetrisGame(1)), lines: 90, level: 10 }
    const frames = 51 // 2,040 ms of game time

    expect(play(level10, frames, idle).state.piece.y).toBe(Math.floor((frames * AI_FRAME_MS) / gravityDelay(10)))
  })

  it('locks a piece that gravity brings to the floor, as for a player', () => {
    const start = withO(createTetrisGame(1))
    const { state, applied } = play(start, (gravityDelay(1) / AI_FRAME_MS) * 20, idle)

    expect(state.pieces).toBe(1)
    expect(applied).not.toContain('HARD_DROP')
  })
})

describe('AI playback: pace and descent', () => {
  it('rotates or slides at most once every MOVE_FRAMES frames', () => {
    const start = createTetrisGame(1)
    const { applied } = play(start, MOVE_FRAMES * 2 + 1, () => 'RIGHT')

    expect(applied.filter((action) => action === 'RIGHT')).toHaveLength(3) // frames 1, 4 and 7
  })

  it('soft drops one row every frame once in position', () => {
    const start = withO(createTetrisGame(1))
    const { state, applied } = play(start, 5, () => 'SOFT_DROP')

    expect(state.piece.y).toBe(5)
    expect(applied).toEqual(['SOFT_DROP', 'SOFT_DROP', 'SOFT_DROP', 'SOFT_DROP', 'SOFT_DROP'])
  })

  it('shows every piece falling: never more than two rows a frame, never a hard drop', () => {
    const ai = createTetrisAi()
    let state = createTetrisGame(3)
    const applied: TetrisAction[] = []
    const apply = (action: TetrisAction) => {
      applied.push(action)
      return (state = updateTetris(state, action))
    }
    let clock = startAiClock()
    let heights = new Set<number>([state.piece.y])
    const heightsPerPiece: number[] = []

    while (state.status === 'playing' && state.pieces < 30) {
      const before = state
      clock = playAiFrame(state, clock, (current) => ai.decide(current).action, apply)
      if (state.pieces !== before.pieces) {
        heightsPerPiece.push(heights.size)
        heights = new Set([state.piece.y])
      } else {
        // One soft-drop row and at most one gravity row in a frame.
        expect(state.piece.y - before.piece.y).toBeLessThanOrEqual(2)
        heights.add(state.piece.y)
      }
    }

    expect(applied).not.toContain('HARD_DROP')
    // Each piece is drawn at many heights on its way down, not only at the top and where it lands.
    expect(heightsPerPiece).toHaveLength(30)
    expect(Math.min(...heightsPerPiece)).toBeGreaterThanOrEqual(5)
  })
})

describe('AI playback: decision quality under gravity', () => {
  it('plays 300 pieces from level 1 without losing', { timeout: 120_000 }, () => {
    const ai = createTetrisAi()
    let state = createTetrisGame(2)
    const apply = (action: TetrisAction) => (state = updateTetris(state, action))
    let clock = startAiClock()
    while (state.status === 'playing' && state.pieces < 300) {
      clock = playAiFrame(state, clock, (current) => ai.decide(current).action, apply)
    }

    expect(state.status).toBe('playing')
    expect(state.lines).toBeGreaterThan(100)
    expect(state.level).toBeGreaterThan(10) // well into the fast levels
  })

  it('keeps up at the fastest gravity', { timeout: 120_000 }, () => {
    const ai = createTetrisAi()
    let state: TetrisState = { ...createTetrisGame(5), lines: 150, level: 16 } // 90 ms a row
    const apply = (action: TetrisAction) => (state = updateTetris(state, action))
    let clock = startAiClock()
    while (state.status === 'playing' && state.pieces < 150) {
      clock = playAiFrame(state, clock, (current) => ai.decide(current).action, apply)
    }

    expect(state.status).toBe('playing')
    expect(state.lines - 150).toBeGreaterThan(40)
  })

  it('is deterministic: the same game gives the same moves', () => {
    const run = () => {
      const ai = createTetrisAi()
      let state = createTetrisGame(9)
      const apply = (action: TetrisAction) => (state = updateTetris(state, action))
      let clock = startAiClock()
      for (let frame = 0; frame < 2_000; frame++) clock = playAiFrame(state, clock, (s) => ai.decide(s).action, apply)
      return state
    }

    expect(run()).toEqual(run())
  })
})
