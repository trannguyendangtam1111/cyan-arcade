import { beforeAll, describe, expect, it } from 'vitest'
import { nextRandom } from '@/games/shared/random'
import {
  MOVES,
  applyMove,
  createGame2048,
  highestTile,
  legalMoves,
  slide,
  type Game2048State,
  type Move,
} from '../engine/game2048Engine'
import { emptyCells, ensureTables, evaluate, fromRows, slideRows, toRows, transpose, withTile } from './bitboard'
import { chanceValue, search } from './expectimax'
import { createGame2048Ai, searchDepth } from './game2048Ai'

const board = (...rows: number[][]) => rows.flat()

function stateOf(cells: number[]): Game2048State {
  return {
    board: cells,
    tileIds: cells.map((value, index) => (value === 0 ? 0 : index + 1)),
    nextTileId: 100,
    score: 0,
    moves: 0,
    won: false,
    status: 'playing',
    seed: 1,
  }
}

/** A reproducible random board with tiles up to 2048. */
function randomBoard(seed: number): number[] {
  const cells: number[] = []
  for (let i = 0; i < 16; i++) {
    const roll = nextRandom(seed)
    seed = roll.seed
    const exponent = Math.floor(roll.value * 12)
    cells.push(exponent === 0 ? 0 : 2 ** exponent)
  }
  return cells
}

beforeAll(() => ensureTables())

describe('bitboard', () => {
  it('round-trips a board', () => {
    const cells = board([2, 4, 8, 16], [0, 32, 0, 64], [128, 256, 512, 1024], [2048, 4096, 0, 2])

    expect(fromRows(toRows(cells))).toEqual(cells)
  })

  it('transposes rows and columns', () => {
    const cells = board([2, 4, 8, 16], [32, 64, 128, 256], [0, 0, 0, 0], [2, 0, 0, 4])

    expect(fromRows(transpose(toRows(cells)))).toEqual(
      board([2, 32, 0, 2], [4, 64, 0, 0], [8, 128, 0, 0], [16, 256, 0, 4]),
    )
  })

  it('simulates every move exactly like the game engine, on 200 random boards', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const cells = randomBoard(seed)
      for (const move of MOVES) {
        const expected = slide(cells, move)
        const rows = toRows(cells)
        const actual = slideRows(rows, move)

        expect(fromRows(actual)).toEqual(expected.board)
        // An illegal move hands back the very same object, which is how the search detects it.
        expect(actual === rows).toBe(!expected.moved)
      }
    }
  })

  it('finds empty cells and places tiles on them', () => {
    const rows = toRows(board([2, 0, 4, 8], [16, 32, 64, 128], [2, 4, 8, 16], [32, 64, 128, 0]))
    const empty = emptyCells(rows)

    expect(empty).toEqual([
      { row: 0, shift: 4 },
      { row: 3, shift: 12 },
    ])
    expect(fromRows(withTile(rows, 0, 4, 2))[1]).toBe(4)
  })
})

describe('board evaluation', () => {
  const value = (...rows: number[][]) => evaluate(toRows(board(...rows)))

  it('prefers more empty cells: one 8 beats two 4s that cannot merge', () => {
    const merged = value([8, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
    const apart = value([4, 0, 0, 0], [0, 0, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0])

    expect(merged).toBeGreaterThan(apart)
  })

  it('prefers tiles ordered along a row over the same tiles scrambled (monotonicity)', () => {
    const ordered = value([256, 128, 64, 32], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
    const scrambled = value([64, 256, 32, 128], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])

    expect(ordered).toBeGreaterThan(scrambled)
  })

  it('prefers the biggest tile in a corner over the middle of the board', () => {
    const corner = value([1024, 8, 4, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
    const middle = value([8, 1024, 4, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])

    expect(corner).toBeGreaterThan(middle)
  })

  it('rewards equal neighbours that are ready to merge', () => {
    const mergeable = value([64, 64, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
    const separated = value([64, 2, 64, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])

    expect(mergeable).toBeGreaterThan(separated)
  })

  it('is symmetric: mirroring the board does not change its value', () => {
    const a = value([2, 4, 8, 16], [0, 0, 32, 64], [0, 0, 0, 128], [0, 0, 0, 0])
    const mirrored = value([16, 8, 4, 2], [64, 32, 0, 0], [128, 0, 0, 0], [0, 0, 0, 0])

    expect(a).toBeCloseTo(mirrored, 6)
  })
})

describe('expectimax search', () => {
  it('scores a spawn node at depth 0 with the plain evaluation', () => {
    const rows = toRows(board([2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]))

    expect(chanceValue(rows, 0, 1)).toBe(evaluate(rows))
  })

  it('computes the probability-weighted average over every possible spawn', () => {
    // Two empty cells, so four possible spawns: (cell A or B) x (a 2 with 90% or a 4 with 10%).
    const rows = toRows(board([2, 4, 8, 16], [32, 64, 128, 256], [2, 4, 8, 16], [32, 64, 0, 0]))
    search(rows, 1) // starts a fresh transposition table for this position

    const bestAfterSpawn = (row: number, shift: number, exponent: number) => {
      const spawned = withTile(rows, row, shift, exponent)
      const outcomes = MOVES.map((move) => slideRows(spawned, move)).filter((next) => next !== spawned)
      return Math.max(0, ...outcomes.map(evaluate))
    }
    const expected =
      emptyCells(rows)
        .map(({ row, shift }) => 0.9 * bestAfterSpawn(row, shift, 1) + 0.1 * bestAfterSpawn(row, shift, 2))
        .reduce((sum, v) => sum + v, 0) / 2

    expect(chanceValue(rows, 1, 1)).toBeCloseTo(expected, 6)
  })

  it('gives illegal moves no value and never selects them', () => {
    const result = search(toRows(board([2, 0, 0, 0], [4, 0, 0, 0], [8, 0, 0, 0], [16, 0, 0, 0])), 2)

    expect(result.values.LEFT).toBeNull()
    expect(result.values.UP).toBeNull()
    expect(result.values.DOWN).toBeNull()
    expect(result.best).toBe('RIGHT')
  })

  it('reports no move on a dead board', () => {
    const result = search(toRows(board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2])), 2)

    expect(result.best).toBeNull()
  })

  it('searches deeper when the board is crowded', () => {
    expect(searchDepth(10)).toBe(2)
    expect(searchDepth(3)).toBe(3)
  })
})

describe('2048 AI decisions', () => {
  const ai = createGame2048Ai()

  it('takes the merge that keeps the big tiles lined up in the corner', () => {
    // Merging the two 512s to the left builds a 1024 in the corner with the row still in order.
    const state = stateOf(board([512, 512, 64, 8], [4, 16, 8, 2], [2, 4, 0, 0], [0, 0, 0, 0]))

    expect(ai.getNextAction(state)).toBe('LEFT')
  })

  it('does not move the biggest tile out of its corner when a safe alternative exists', () => {
    // The top row is full, so LEFT and RIGHT keep 1024 in place; DOWN would pull it out of the corner.
    const state = stateOf(board([1024, 256, 64, 16], [8, 4, 2, 0], [2, 0, 0, 0], [0, 0, 0, 0]))

    expect(ai.getNextAction(state)).not.toBe('DOWN')
  })

  it('only ever plays legal moves, through a whole stretch of a game', () => {
    let state = createGame2048(11)
    for (let i = 0; i < 80 && state.status === 'playing'; i++) {
      const action = ai.getNextAction(state)
      expect(legalMoves(state.board)).toContain(action)
      state = applyMove(state, action)
    }
  })

  it('is deterministic: the same board always gives the same decision', () => {
    const state = createGame2048(21)
    const first = createGame2048Ai().decide(state)
    const second = createGame2048Ai().decide(state)

    expect(second.action).toBe(first.action)
    expect(second.values).toEqual(first.values)
  })

  it('does not follow a fixed sequence: different boards get different moves', () => {
    const moves = new Set<Move>()
    let state = createGame2048(5)
    for (let i = 0; i < 60; i++) {
      const action = ai.getNextAction(state)
      moves.add(action)
      state = applyMove(state, action)
    }

    expect(moves.size).toBeGreaterThanOrEqual(3)
  })

  it('plays well: builds at least a 512 tile in 400 moves without losing', { timeout: 120_000 }, () => {
    let state = createGame2048(3)
    while (state.status === 'playing' && state.moves < 400) {
      state = applyMove(state, ai.getNextAction(state))
    }

    expect(state.status).toBe('playing')
    expect(highestTile(state.board)).toBeGreaterThanOrEqual(512)
  })
})
