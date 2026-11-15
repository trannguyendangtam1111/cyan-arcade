import { describe, expect, it } from 'vitest'
import { createGame2048Ai } from '../ai/game2048Ai'
import {
  MOVES_LIMIT,
  applyMove,
  asksToKeepGoing,
  createGame2048,
  highestTile,
  legalMoves,
  moveLimitOutcome,
  puzzleOutcome,
  slide,
  type Game2048State,
  type Move,
} from './game2048Engine'
import { PUZZLE_STAGES, createPuzzleGame, puzzleStage } from './game2048Puzzles'

const board = (...rows: number[][]) => rows.flat()
const LETTERS: Record<string, Move> = { U: 'UP', D: 'DOWN', L: 'LEFT', R: 'RIGHT' }
const line = (letters: string): Move[] => [...letters].map((letter) => LETTERS[letter])
const empties = (state: Game2048State) => state.board.filter((value) => value === 0).length

/** Plays every move in order, the no-op ones included (the engine ignores those). */
const replay = (state: Game2048State, moves: readonly Move[]) => moves.reduce(applyMove, state)

/** A puzzle on this board: target and budget as given, seed 1. */
const puzzle = (cells: number[], target: number, moveLimit = 50) =>
  createGame2048(1, { startBoard: cells, target, moveLimit })

describe('Puzzle engine', () => {
  it('starts from the given board, spawning nothing, with its target and budget', () => {
    const start = board([0, 0, 0, 0], [0, 0, 2, 0], [0, 4, 0, 0], [32, 0, 0, 16])
    const state = createGame2048(77, { startBoard: start, target: 128, moveLimit: 60 })

    expect(state.board).toEqual(start)
    expect(state.tileIds).toEqual(board([0, 0, 0, 0], [0, 0, 1, 0], [0, 2, 0, 0], [3, 0, 0, 4]))
    expect(state.nextTileId).toBe(5)
    expect(state).toMatchObject({ seed: 77, target: 128, moveLimit: 60, score: 0, moves: 0, status: 'playing' })
    expect(puzzleOutcome(state)).toBe('playing')
    expect(asksToKeepGoing(state)).toBe(false)
    // The board passed in is copied, never shared.
    expect(state.board).not.toBe(start)
  })

  it('leaves Classic, Moves Limit and Time Attack starts exactly as they were', () => {
    for (const seed of [1, 42, 9001]) {
      const classic = createGame2048(seed)
      expect(createGame2048(seed, {})).toEqual(classic)
      expect('target' in classic).toBe(false)
      expect(puzzleOutcome(classic)).toBeNull()
      expect(asksToKeepGoing(classic)).toBe(true)
      expect(createGame2048(seed, { moveLimit: MOVES_LIMIT }).board).toEqual(classic.board)
      expect('target' in createGame2048(seed, { moveLimit: MOVES_LIMIT })).toBe(false)
      expect('target' in createGame2048(seed, { timeLimitMs: 120_000 })).toBe(false)
    }
  })

  it('refuses a malformed start board or a target the board already has', () => {
    const fine = board([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 4])
    expect(() => createGame2048(1, { startBoard: fine.slice(1) })).toThrow(RangeError)
    expect(() => createGame2048(1, { startBoard: [...fine.slice(1), 3] })).toThrow(RangeError)
    expect(() => createGame2048(1, { startBoard: [...fine.slice(1), 1] })).toThrow(RangeError)
    expect(() => createGame2048(1, { startBoard: [...fine.slice(1), -2] })).toThrow(RangeError)
    // A board with no legal move.
    const dead = board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2])
    expect(() => createGame2048(1, { startBoard: dead })).toThrow(RangeError)
    // The target must be a power of two above the highest starting tile.
    expect(() => createGame2048(1, { startBoard: fine, target: 4 })).toThrow(RangeError)
    expect(() => createGame2048(1, { startBoard: fine, target: 2 })).toThrow(RangeError)
    expect(() => createGame2048(1, { startBoard: fine, target: 96 })).toThrow(RangeError)
    expect(() => createGame2048(1, { startBoard: fine, target: 8 })).not.toThrow()
  })

  it('replays identically from the same seed and moves, and the seed decides the spawns', () => {
    const stage = PUZZLE_STAGES[0]
    const moves = line('LDLLLDLDLLLLRLLDDDLL')
    const first = replay(createPuzzleGame(stage), moves)
    expect(replay(createPuzzleGame(stage), moves)).toEqual(first)

    const otherSeed = replay(
      createGame2048(stage.seed + 1, { startBoard: stage.board, target: stage.target, moveLimit: stage.moveLimit }),
      moves,
    )
    expect(otherSeed.board).not.toEqual(first.board)
  })

  it('clears the moment the target is made, without spawning after that move', () => {
    const state = puzzle(board([64, 64, 0, 0], [0, 0, 0, 0], [0, 2, 0, 0], [0, 0, 0, 0]), 128)
    const after = applyMove(state, 'LEFT')

    expect(highestTile(after.board)).toBe(128)
    expect(after.board).toEqual(board([128, 0, 0, 0], [0, 0, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0]))
    expect(empties(after)).toBe(14) // the slide alone: no tile was spawned
    expect(after).toMatchObject({ status: 'over', moves: 1, score: 128 })
    expect(puzzleOutcome(after)).toBe('cleared')
  })

  it('counts a tile above the target as a clear too', () => {
    const state = puzzle(board([64, 64, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 2]), 128)
    expect(puzzleOutcome(applyMove(state, 'RIGHT'))).toBe('cleared')
  })

  it('a target made on the last allowed move clears the stage, not a move-limit failure', () => {
    const start = board([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 64, 64])
    let state = puzzle(start, 128, 2)
    state = applyMove(state, 'UP') // a valid move that makes nothing
    expect(puzzleOutcome(state)).toBe('playing')
    state = applyMove(state, 'LEFT') // the last allowed move, and it makes the 128

    expect(state.moves).toBe(2)
    expect(state.status).toBe('over')
    expect(puzzleOutcome(state)).toBe('cleared')
  })

  it('fails when the move budget is used up without the target', () => {
    let state = puzzle(board([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 128, 3)
    for (const move of line('RLRLR')) state = applyMove(state, move)

    expect(state.moves).toBe(3)
    expect(state.status).toBe('over')
    expect(puzzleOutcome(state)).toBe('out-of-moves')
  })

  it('fails as stuck when no legal move is left before the target or the budget', () => {
    // LEFT merges the two 16s; whatever spawns in the last gap (2 or 4) leaves no move.
    const start = board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 8], [4, 2, 16, 16])
    const after = applyMove(puzzle(start, 64, 10), 'LEFT')

    expect(after.moves).toBe(1)
    expect(legalMoves(after.board)).toEqual([])
    expect(after.status).toBe('over')
    expect(puzzleOutcome(after)).toBe('stuck')
  })

  it('does not count a move that changes nothing', () => {
    const state = puzzle(board([2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 128, 5)
    expect(slide(state.board, 'LEFT').moved).toBe(false)
    expect(slide(state.board, 'UP').moved).toBe(false)

    expect(applyMove(state, 'LEFT')).toBe(state)
    expect(applyMove(state, 'UP')).toBe(state)
    expect(applyMove(state, 'RIGHT').moves).toBe(1)
  })

  it('takes no move after a clear or a failure', () => {
    const cleared = applyMove(puzzle(board([64, 64, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 2]), 128), 'LEFT')
    const outOfMoves = replay(puzzle(board([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 128, 1), ['RIGHT'])
    const stuck = applyMove(puzzle(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 8], [4, 2, 16, 16]), 64), 'LEFT')

    for (const over of [cleared, outOfMoves, stuck]) {
      for (const move of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const) expect(applyMove(over, move)).toBe(over)
    }
    expect([cleared, outOfMoves, stuck].map(puzzleOutcome)).toEqual(['cleared', 'out-of-moves', 'stuck'])
  })

  it('keeps reporting the Moves Limit outcome of a Moves Limit run unchanged', () => {
    const run = createGame2048(5, { moveLimit: 2 })
    expect(moveLimitOutcome(run)).toBe('playing')
    expect(puzzleOutcome(run)).toBeNull()
  })
})

/** The approved stage table: mode, seed, target and budget, then the board row by row. */
const TABLE = [
  ['puzzle-1', 10, 128, 60, [[0, 0, 0, 0], [0, 0, 2, 0], [0, 4, 0, 0], [32, 0, 0, 16]]],
  ['puzzle-2', 9, 256, 20, [[128, 64, 32, 16], [0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 4, 0]]],
  ['puzzle-3', 3, 128, 26, [[4, 2, 8, 2], [0, 8, 2, 4], [16, 4, 32, 8], [2, 16, 4, 2]]],
  ['puzzle-4', 1, 512, 36, [[256, 128, 64, 0], [0, 0, 0, 32], [0, 2, 0, 0], [0, 0, 0, 0]]],
  ['puzzle-5', 10, 512, 10, [[256, 4, 2, 4], [16, 2, 8, 0], [8, 4, 2, 8], [256, 2, 4, 2]]],
  ['puzzle-6', 3, 1024, 36, [[512, 256, 128, 64], [2, 8, 16, 0], [4, 2, 4, 0], [2, 0, 0, 0]]],
] as const

/**
 * For each stage, a clearing line found by a planner that knows the seed's spawns (a human replaying
 * the stage can learn them too), and the game's own AI clear: moves and outcome on the stage's seed.
 */
const CLEARS = {
  'puzzle-1': { line: 'RRRRDULURUULRDRURUDDLLDLDULULDULRURULUL', aiMoves: 49 },
  'puzzle-2': { line: 'RRDURDRLULUU', aiMoves: 15 },
  'puzzle-3': { line: 'LUDRURLDUDLU', aiMoves: 22 },
  'puzzle-4': { line: 'ULLULURUULRULDDLRRDLL', aiMoves: 25 },
  'puzzle-5': { line: 'URUDRU', aiMoves: 6 },
  'puzzle-6': { line: 'RUUURULULRUUURURULLL', aiMoves: 27 },
} as const

describe('Puzzle stages', () => {
  it('are the six approved stages, in order, each starting from its own board', () => {
    expect(PUZZLE_STAGES.map((stage) => stage.mode)).toEqual(TABLE.map(([mode]) => mode))
    PUZZLE_STAGES.forEach((stage, index) => {
      const [mode, seed, target, moveLimit, rows] = TABLE[index]
      expect(stage).toMatchObject({ mode, number: index + 1, seed, target, moveLimit })
      expect(stage.board).toEqual(rows.flat())

      const start = createPuzzleGame(stage)
      expect(start.board).toEqual(rows.flat())
      expect(start).toMatchObject({ seed, target, moveLimit, moves: 0, score: 0, status: 'playing' })
      expect(highestTile(start.board)).toBeLessThan(target)
      expect(legalMoves(start.board).length).toBeGreaterThan(0)
      expect(puzzleStage(mode)).toBe(stage)
    })
    expect(puzzleStage('puzzle-7')).toBeUndefined()
    expect(puzzleStage('classic')).toBeUndefined()
  })

  it('cannot be changed at run time', () => {
    expect(Object.isFrozen(PUZZLE_STAGES)).toBe(true)
    for (const stage of PUZZLE_STAGES) expect(Object.isFrozen(stage.board)).toBe(true)
  })

  it.each(TABLE.map(([mode]) => mode))('%s is cleared by its recorded line, within its budget', (mode) => {
    const stage = puzzleStage(mode)!
    const moves = line(CLEARS[mode].line)
    const end = replay(createPuzzleGame(stage), moves)

    expect(puzzleOutcome(end)).toBe('cleared')
    expect(end.moves).toBe(moves.length)
    expect(end.moves).toBeLessThanOrEqual(stage.moveLimit)
    // Every move of the line was valid, and the target was made by its last one.
    const beforeLast = replay(createPuzzleGame(stage), moves.slice(0, -1))
    expect(beforeLast.moves).toBe(moves.length - 1)
    expect(puzzleOutcome(beforeLast)).toBe('playing')
  })

  it.each(TABLE.map(([mode]) => mode))('%s is cleared by the game AI on its seed, within its budget', (mode) => {
    const stage = puzzleStage(mode)!
    const ai = createGame2048Ai()
    let state = createPuzzleGame(stage)
    while (state.status === 'playing') {
      const next = applyMove(state, ai.decide(state).action)
      expect(next).not.toBe(state) // the AI only plays legal moves
      state = next
    }

    expect(puzzleOutcome(state)).toBe('cleared')
    expect(state.moves).toBe(CLEARS[mode].aiMoves)
    expect(state.moves).toBeLessThanOrEqual(stage.moveLimit)
  })
})
