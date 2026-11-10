import { describe, expect, it } from 'vitest'
import { SPRINT, ULTRA } from '../modes'
import { CHALLENGE_STAGES, createStageGame, type ChallengeStage } from '../stages'
import type { Cell, TetrisAction, TetrisState } from '../types/tetrisTypes'
import {
  GARBAGE,
  HEIGHT,
  STEP_MS,
  WIDTH,
  collides,
  createTetrisGame,
  dropDistance,
  gravityDelay,
  pieceCells,
  updateTetris,
  type ChallengeRules,
  type TimedRules,
} from './tetrisEngine'

/** Plays these actions in order. */
const play = (state: TetrisState, ...actions: TetrisAction[]) => actions.reduce(updateTetris, state)

/** `count` steps of the clock. */
const steps = (count: number) => new Array<TetrisAction>(count).fill('STEP')

const row = (board: readonly Cell[], y: number) => board.slice(y * WIDTH, (y + 1) * WIDTH)
const gapOf = (cells: readonly Cell[]) => cells.indexOf(null)
const isGarbageRow = (cells: readonly Cell[]) =>
  cells.filter((cell) => cell === GARBAGE).length === WIDTH - 1 && cells.filter((cell) => cell === null).length === 1
const garbageCells = (board: readonly Cell[]) => board.filter((cell) => cell === GARBAGE).length

/** A test stage of its own: no time limit unless given, seed 7. */
const game = (rules: Partial<ChallengeRules>, timed: TimedRules = { limitMs: null }) =>
  createTetrisGame(7, timed, { level: 1, garbageRows: 1, riseEvery: null, dig: true, ...rules })

/** An upright I straight over the gap of a row, ready to hard drop into it. */
const iOverGapOf = (state: TetrisState, y: number): TetrisState => ({
  ...state,
  // The upright I fills the third column of its box.
  piece: { type: 'I', rotation: 1, x: gapOf(row(state.board, y)) - 2, y: -1 },
})

describe('the Challenge stages', () => {
  it('are the six approved stages, as the server will declare them', () => {
    const table = CHALLENGE_STAGES.map(({ id, mode, name, timed, rules }) => ({
      id,
      mode,
      name,
      garbageRows: rules.garbageRows,
      riseEvery: rules.riseEvery,
      goal: rules.dig ? 'dig' : timed.lineGoal,
      level: rules.level,
      limitMs: timed.limitMs,
    }))
    expect(table).toEqual([
      { id: 1, mode: 'challenge-1', name: 'Clean-up', garbageRows: 4, riseEvery: null, goal: 'dig', level: 1, limitMs: 120_000 },
      { id: 2, mode: 'challenge-2', name: 'Ten on top', garbageRows: 6, riseEvery: null, goal: 10, level: 3, limitMs: 120_000 },
      { id: 3, mode: 'challenge-3', name: 'Deep dig', garbageRows: 10, riseEvery: null, goal: 'dig', level: 3, limitMs: 180_000 },
      { id: 4, mode: 'challenge-4', name: 'Rising tide', garbageRows: 4, riseEvery: 10, goal: 15, level: 5, limitMs: 180_000 },
      { id: 5, mode: 'challenge-5', name: 'Pressure', garbageRows: 6, riseEvery: 7, goal: 20, level: 7, limitMs: 180_000 },
      { id: 6, mode: 'challenge-6', name: 'Last stand', garbageRows: 8, riseEvery: 8, goal: 'dig', level: 9, limitMs: 240_000 },
    ])
    // A dig stage has no line goal; every limit is a whole number of steps.
    for (const { timed, rules } of CHALLENGE_STAGES) {
      expect(timed.lineGoal === undefined).toBe(rules.dig)
      expect((timed.limitMs ?? 0) % STEP_MS).toBe(0)
    }
    expect(new Set(CHALLENGE_STAGES.map(({ seed }) => seed)).size).toBe(6)
  })

  describe.each(CHALLENGE_STAGES.map((stage) => [`${stage.id} ${stage.name}`, stage] as [string, ChallengeStage]))(
    'stage %s',
    (_, stage) => {
      const { garbageRows } = stage.rules

      it('starts with its rows of garbage at the bottom, each full but for one gap, and nothing above', () => {
        const { board } = createStageGame(stage)

        for (let y = 0; y < HEIGHT - garbageRows; y++) expect(row(board, y).every((cell) => cell === null)).toBe(true)
        for (let y = HEIGHT - garbageRows; y < HEIGHT; y++) {
          expect(isGarbageRow(row(board, y))).toBe(true)
          // No straight well: each gap is away from the one above it.
          if (y > HEIGHT - garbageRows) expect(gapOf(row(board, y))).not.toBe(gapOf(row(board, y - 1)))
        }
        expect(garbageCells(board)).toBe(garbageRows * (WIDTH - 1))
      })

      it('is the same game every time: its fixed seed gives the same garbage and the same pieces', () => {
        expect(createStageGame(stage)).toEqual(createStageGame(stage))
        // The garbage draws from a stream of its own, so the pieces are those of a game without it.
        const plain = createTetrisGame(stage.seed, stage.timed)
        expect(createStageGame(stage).piece).toEqual(plain.piece)
        expect(createStageGame(stage).queue).toEqual(plain.queue)
      })

      it('keeps its fixed level, its gravity, on the 40 ms clock', () => {
        const start = createStageGame(stage)
        expect(start.level).toBe(stage.rules.level)
        expect(start.challenge).toMatchObject({ level: stage.rules.level, garbageAdded: garbageRows, garbageCleared: 0 })
        expect(start.clock).toMatchObject({ elapsedMs: 0, limitMs: stage.timed.limitMs, goalReached: false })

        const gravitySteps = gravityDelay(stage.rules.level) / STEP_MS
        const before = play(start, ...steps(Math.ceil(gravitySteps) - 1))
        expect(before.piece.y).toBe(start.piece.y)
        expect(play(before, 'STEP').piece.y).toBe(start.piece.y + 1)
      })

      it('fails a top-out: the run ends without its objective', () => {
        let state = createStageGame(stage)
        for (let piece = 0; piece < 60 && state.status === 'playing'; piece++) state = play(state, 'HARD_DROP')

        expect(state.status).toBe('over')
        expect(state.clock).toMatchObject({ goalReached: false, timeUp: false })
      })

      it('fails at its time limit: the run ends there without its objective', () => {
        const limitMs = stage.timed.limitMs ?? 0
        // Hold the piece at the top so the stack cannot end the run first: only the clock moves it.
        let state = createStageGame(stage)
        const spawn = state.piece
        let previous = state
        while (state.status === 'playing') {
          previous = state
          state = play({ ...state, piece: spawn }, 'STEP')
        }
        expect(previous.clock?.elapsedMs).toBe(limitMs - STEP_MS)
        expect(state.clock).toMatchObject({ elapsedMs: limitMs, timeUp: true, goalReached: false })
      })
    },
  )
})

describe('garbage', () => {
  it('clears when a piece completes its row, and a dig stage ends when the last row goes', () => {
    const state = iOverGapOf(game({ garbageRows: 1 }), HEIGHT - 1)
    const after = play(state, 'HARD_DROP')

    expect(after.lines).toBe(1)
    expect(after.challenge).toMatchObject({ garbageAdded: 1, garbageCleared: 1 })
    expect(garbageCells(after.board)).toBe(0)
    expect(after.status).toBe('over')
    expect(after.clock?.goalReached).toBe(true)
    // Ended there: nothing moves any more.
    expect(play(after, ...steps(30), 'HARD_DROP')).toBe(after)
  })

  it('leaves a dig stage playing while any garbage is left', () => {
    const state = iOverGapOf(game({ garbageRows: 2 }), HEIGHT - 2)
    const after = play(state, 'HARD_DROP')

    expect(after.challenge).toMatchObject({ garbageAdded: 2, garbageCleared: 1 })
    expect(garbageCells(after.board)).toBe(WIDTH - 1)
    expect(isGarbageRow(row(after.board, HEIGHT - 1))).toBe(true)
    expect(after.status).toBe('playing')
    expect(after.clock?.goalReached).toBe(false)
  })

  it('ends a line-goal stage at its goal, garbage left or not', () => {
    const state = iOverGapOf(game({ garbageRows: 2, dig: false }, { limitMs: null, lineGoal: 1 }), HEIGHT - 2)
    const after = play(state, 'HARD_DROP')

    expect(after.lines).toBe(1)
    expect(garbageCells(after.board)).toBe(WIDTH - 1)
    expect(after.status).toBe('over')
    expect(after.clock?.goalReached).toBe(true)
  })

  it('counts a line of pieces as a line, not as garbage', () => {
    // A row of pieces over the garbage, full but for the column of the I.
    const base = game({ garbageRows: 1, dig: false }, { limitMs: null, lineGoal: 30 })
    const gap = gapOf(row(base.board, HEIGHT - 1))
    const column = gap === 0 ? 1 : 0
    const board = [...base.board]
    for (let x = 0; x < WIDTH; x++) if (x !== column) board[(HEIGHT - 2) * WIDTH + x] = 'O'
    const state: TetrisState = { ...base, board, piece: { type: 'I', rotation: 1, x: column - 2, y: -1 } }

    const after = play(state, 'HARD_DROP')
    expect(after.lines).toBe(1)
    expect(after.challenge).toMatchObject({ garbageAdded: 1, garbageCleared: 0 })
    expect(isGarbageRow(row(after.board, HEIGHT - 1))).toBe(true)
  })

  it('keeps a stage at its level however many lines it clears, and scores at that level', () => {
    const base = game({ level: 3, garbageRows: 1, dig: false }, { limitMs: null, lineGoal: 30 })
    const state = iOverGapOf({ ...base, lines: 9 }, HEIGHT - 1)
    const after = play(state, 'HARD_DROP')

    expect(after.lines).toBe(10)
    expect(after.level).toBe(3)
    // The hard drop's 2 points a row, then 100 for the line at level 3.
    expect(after.score).toBe(2 * dropDistance(state.board, state.piece) + 300)
  })
})

describe('rising garbage', () => {
  it('rises after every so many pieces, under the stack, moving everything up one row', () => {
    const start = game({ garbageRows: 2, riseEvery: 2 })
    const one = play(start, 'HARD_DROP')
    expect(one.challenge?.garbageAdded).toBe(2)

    // The board the second piece leaves, had nothing risen.
    const unrisen = play({ ...one, challenge: { ...one.challenge!, riseEvery: null } }, 'HARD_DROP').board
    const two = play(one, 'HARD_DROP')

    expect(two.challenge?.garbageAdded).toBe(3)
    expect(two.board.slice(0, (HEIGHT - 1) * WIDTH)).toEqual(unrisen.slice(WIDTH))
    expect(isGarbageRow(row(two.board, HEIGHT - 1))).toBe(true)
    expect(gapOf(row(two.board, HEIGHT - 1))).not.toBe(gapOf(row(two.board, HEIGHT - 2)))
    expect(two.challenge?.lastGap).toBe(gapOf(row(two.board, HEIGHT - 1)))
    // The pieces' blocks are all still there; only garbage was added.
    const blocks = (board: readonly Cell[]) => board.filter((cell) => cell !== null && cell !== GARBAGE).length
    expect(blocks(two.board)).toBe(8)
  })

  it('never touches the falling piece: the next piece spawns onto the risen board', () => {
    const one = play(game({ garbageRows: 2, riseEvery: 2 }), 'HARD_DROP')
    const two = play(one, 'HARD_DROP')

    expect(two.piece).toEqual({ type: one.queue[0], rotation: 0, x: two.piece.x, y: one.queue[0] === 'I' ? -1 : 0 })
    expect(collides(two.board, two.piece)).toBe(false)
    for (const { x, y } of pieceCells(two.piece)) if (y >= 0) expect(two.board[y * WIDTH + x]).toBeNull()
    expect(two.status).toBe('playing')
  })

  it('does not rise after the piece that meets the objective', () => {
    const state = iOverGapOf(game({ garbageRows: 1, riseEvery: 1 }), HEIGHT - 1)
    const after = play(state, 'HARD_DROP')

    expect(after.challenge).toMatchObject({ garbageAdded: 1, garbageCleared: 1 })
    expect(garbageCells(after.board)).toBe(0)
    expect(after.clock?.goalReached).toBe(true)
  })

  it('makes a dig stage clear every row that rose as well', () => {
    let state = game({ garbageRows: 1, riseEvery: 1 })
    state = play(state, 'HARD_DROP') // locks a piece on the garbage: a second row rises
    expect(state.challenge).toMatchObject({ garbageAdded: 2, garbageCleared: 0 })
    expect(state.status).toBe('playing')
  })

  it('tops out when it would push a block off the top', () => {
    const base = game({ garbageRows: 1, riseEvery: 1 })
    const board = [...base.board]
    board[0] = 'O' // a block in the top row, out of the falling piece's way
    const after = play({ ...base, board }, 'HARD_DROP')

    expect(after.status).toBe('over')
    expect(after.clock?.goalReached).toBe(false)
    expect(after.board[0]).toBe('O') // nothing was pushed off
    expect(after.challenge?.garbageAdded).toBe(1)
  })
})

describe('a stage that is set up wrong', () => {
  it('is refused', () => {
    const timed: TimedRules = { limitMs: 120_000 }
    const rules: ChallengeRules = { level: 1, garbageRows: 4, riseEvery: null, dig: true }
    expect(() => createTetrisGame(1, undefined, rules)).toThrow(/clock/)
    expect(() => createTetrisGame(1, timed, { ...rules, garbageRows: 0 })).toThrow(/dig/)
    expect(() => createTetrisGame(1, timed, { ...rules, dig: false })).toThrow(/objective/)
    expect(() => createTetrisGame(1, timed, { ...rules, garbageRows: HEIGHT - 3 })).toThrow(/rows of garbage/)
    expect(() => createTetrisGame(1, timed, { ...rules, level: 0 })).toThrow(/level/)
    expect(() => createTetrisGame(1, timed, { ...rules, riseEvery: 0 })).toThrow(/pieces/)
  })
})

describe('Classic, Ultra and Sprint', () => {
  it.each([
    ['Classic', undefined],
    ['Ultra', ULTRA],
    ['Sprint', SPRINT],
  ] as const)('%s never has garbage and keeps its level progression', (_, timed) => {
    for (const seed of [1, 2, 3]) {
      let state = createTetrisGame(seed, timed)
      expect(state.challenge).toBeUndefined()
      const moves: TetrisAction[] = ['LEFT', 'HARD_DROP', 'RIGHT', 'RIGHT', 'HARD_DROP', 'ROTATE_CW', 'HARD_DROP']
      for (let turn = 0; turn < 200 && state.status === 'playing'; turn++) {
        state = play(state, moves[turn % moves.length], ...(timed ? steps(3) : ['TICK' as const]))
        expect(state.board.includes(GARBAGE)).toBe(false)
        expect(state.challenge).toBeUndefined()
        expect(state.level).toBe(Math.floor(state.lines / 10) + 1)
      }
    }
  })
})
