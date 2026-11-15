import { describe, expect, it } from 'vitest'
import { SPRINT, ULTRA } from '../modes'
import type { Cell, TetrisState } from '../types/tetrisTypes'
import { HEIGHT, STEP_MS, WIDTH, createTetrisGame, updateTetris } from './tetrisEngine'

/** Plays these actions in order. */
const play = (state: TetrisState, ...actions: Parameters<typeof updateTetris>[1][]) =>
  actions.reduce(updateTetris, state)

/** `count` steps of the clock. */
const steps = (count: number) => new Array<'STEP'>(count).fill('STEP')

/**
 * A board whose bottom `rows` rows are full but for the cells in `gaps`, with this many lines
 * already cleared: the next piece is a horizontal I over columns 3–6.
 */
function nearTheGoal(state: TetrisState, lines: number, gaps: (x: number, y: number) => boolean): TetrisState {
  const board = state.board.map((_, index): Cell => {
    const x = index % WIDTH
    const y = Math.floor(index / WIDTH)
    return y >= HEIGHT - 4 && !gaps(x, y) ? 'O' : null
  })
  return {
    ...state,
    board,
    lines,
    level: Math.floor(lines / 10) + 1,
    pieces: 100,
    piece: { type: 'I', rotation: 0, x: 3, y: -1 },
  }
}

/** One line short: the bottom row waits for a flat I in columns 3–6; the rows above are empty. */
const oneLineShort = (state: TetrisState) =>
  nearTheGoal(state, 39, (x, y) => y < HEIGHT - 1 || (x >= 3 && x <= 6))

describe('a Sprint game', () => {
  it('starts with its goal on the clock, and Ultra and Classic have none', () => {
    expect(createTetrisGame(1, SPRINT).clock).toEqual({
      elapsedMs: 0,
      sinceGravityMs: 0,
      limitMs: 300_000,
      timeUp: false,
      lineGoal: 40,
      goalReached: false,
    })
    expect(createTetrisGame(1, ULTRA).clock).toMatchObject({ lineGoal: null, goalReached: false })
    expect(createTetrisGame(1).clock).toBeUndefined()
  })

  it('ends at the clear that reaches 40 lines, at the game time of that clear', () => {
    const ready = play(oneLineShort(createTetrisGame(1, SPRINT)), ...steps(25))
    expect(ready.status).toBe('playing')

    const finished = play(ready, 'HARD_DROP')

    expect(finished.status).toBe('over')
    expect(finished.lines).toBe(40)
    expect(finished.level).toBe(5)
    expect(finished.pieces).toBe(101)
    expect(finished.clock).toMatchObject({ elapsedMs: 25 * STEP_MS, goalReached: true, timeUp: false })
    // Stopped there: the clock and the board move no more.
    expect(play(finished, ...steps(50), 'HARD_DROP', 'LEFT')).toBe(finished)
  })

  it('counts every line of the clear that passes the goal', () => {
    // 39 lines, four rows full but for column 0: a vertical I there clears all four.
    const state = nearTheGoal(createTetrisGame(1, SPRINT), 39, (x) => x === 0)
    const tetris = play({ ...state, piece: { type: 'I', rotation: 1, x: -2, y: -1 } }, 'HARD_DROP')

    expect(tetris.lines).toBe(43)
    expect(tetris.clock?.goalReached).toBe(true)
    expect(tetris.status).toBe('over')
  })

  it('plays on below the goal', () => {
    const state = nearTheGoal(createTetrisGame(1, SPRINT), 38, (x, y) => y < HEIGHT - 1 || (x >= 3 && x <= 6))
    const after = play(state, 'HARD_DROP')

    expect(after.lines).toBe(39)
    expect(after.status).toBe('playing')
    expect(after.clock?.goalReached).toBe(false)
  })

  it('ends a top-out before the goal without reaching it', () => {
    let state = createTetrisGame(1, SPRINT)
    for (let piece = 0; piece < 60 && state.status === 'playing'; piece++) state = play(state, 'HARD_DROP')

    expect(state.status).toBe('over')
    expect(state.lines).toBeLessThan(40)
    expect(state.clock).toMatchObject({ goalReached: false, timeUp: false })
  })

  it('ends at its time limit without reaching the goal', () => {
    const state = play(createTetrisGame(1, { limitMs: 400, lineGoal: 40 }), ...steps(10))

    expect(state.status).toBe('over')
    expect(state.clock).toMatchObject({ elapsedMs: 400, timeUp: true, goalReached: false })
  })

  it('refuses a goal that is not a positive whole number of lines', () => {
    for (const lineGoal of [0, -1, 2.5]) {
      expect(() => createTetrisGame(1, { limitMs: null, lineGoal })).toThrow(/line goal/)
    }
  })

  it('leaves Classic and Ultra playing on past 40 lines', () => {
    for (const timed of [undefined, ULTRA]) {
      const state = oneLineShort(createTetrisGame(1, timed))
      const after = play(state, 'HARD_DROP')
      expect(after.lines).toBe(40)
      expect(after.status).toBe('playing')
    }
  })
})
