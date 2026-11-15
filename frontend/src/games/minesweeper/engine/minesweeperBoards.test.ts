/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { nextRandom } from '@/games/shared/random'
import {
  BEGINNER,
  BOARDS,
  EXPERT,
  INTERMEDIATE,
  TIMED_LIMIT_MS,
  createMinesweeper,
  layMines,
  minesweeperDetails,
  minesweeperScore,
  minesweeperTimedDetails,
  neighbours,
  replayMines,
  reveal,
  safeCells,
  threeBV,
  toggleFlag,
  type MinesweeperConfig,
  type MinesweeperState,
} from './minesweeperEngine'

/** The vectors the server's `MinesweeperLayoutTests` checks too. */
interface Vectors {
  random: { seed: number; outputs: number[] }[]
  boards: {
    board: string
    rows: number
    columns: number
    mines: number
    seed: number
    signedSeed: number
    firstCell: number
    mineCells: number[]
    seedAfter: number
    threeBV: number
  }[]
}

const VECTORS: Vectors = JSON.parse(
  readFileSync(resolve(process.cwd(), 'src/games/minesweeper/engine/minesweeperVectors.json'), 'utf8'),
)

const mineIndexes = (state: MinesweeperState) =>
  state.cells.flatMap((cell, index) => (cell.mine ? [index] : []))

/** A board with its mines where given and the numbers counted, as the engine would have laid it. */
function withMines(config: MinesweeperConfig, mines: number[]): MinesweeperState {
  const game = createMinesweeper(1, config)
  const set = new Set(mines)
  return {
    ...game,
    status: 'playing',
    cells: game.cells.map((cell, index) => ({
      ...cell,
      mine: set.has(index),
      adjacent: neighbours(game, index).filter((other) => set.has(other)).length,
    })),
  }
}

/** Clears a board in the fewest reveals: one in every opening, then every number left. */
function clearInFewest(state: MinesweeperState): MinesweeperState {
  let current = state
  state.cells.forEach((cell, index) => {
    if (!cell.mine && cell.adjacent === 0) current = reveal(current, index)
  })
  state.cells.forEach((cell, index) => {
    if (!cell.mine) current = reveal(current, index)
  })
  return current
}

describe('the standard boards', () => {
  it('are Beginner 9 × 9 with 10, Intermediate 16 × 16 with 40 and Expert 30 wide, 16 high with 99', () => {
    expect(BOARDS).toEqual({ beginner: BEGINNER, intermediate: INTERMEDIATE, expert: EXPERT })
    expect(BEGINNER).toEqual({ rows: 9, columns: 9, mines: 10 })
    expect(INTERMEDIATE).toEqual({ rows: 16, columns: 16, mines: 40 })
    expect(EXPERT).toEqual({ rows: 16, columns: 30, mines: 99 })
    expect([BEGINNER, INTERMEDIATE, EXPERT].map(safeCells)).toEqual([71, 216, 381])
  })

  it('make games of their size, with Classic still on Beginner by default', () => {
    expect(createMinesweeper(7)).toEqual(createMinesweeper(7, BEGINNER))
    for (const config of [INTERMEDIATE, EXPERT]) {
      const game = createMinesweeper(7, config)
      expect(game.cells).toHaveLength(config.rows * config.columns)
      expect([game.rows, game.columns, game.mines]).toEqual([config.rows, config.columns, config.mines])
      expect(game.startSeed).toBe(7)
      expect(game.firstCell).toBeNull()
    }
  })

  it('lay exactly their mines, never on or around the first cell, wherever it is', () => {
    for (const config of [BEGINNER, INTERMEDIATE, EXPERT]) {
      const cells = config.rows * config.columns
      // Corners, an edge, the middle and the last cell.
      const firsts = [0, config.columns - 1, cells - config.columns, cells - 1, config.columns * 2, Math.floor(cells / 2)]
      for (let seed = 1; seed <= 30; seed++) {
        for (const first of firsts) {
          const game = layMines(createMinesweeper(seed, config), first)
          const mines = mineIndexes(game)
          expect(mines).toHaveLength(config.mines)
          for (const kept of [first, ...neighbours(game, first)]) expect(game.cells[kept].mine).toBe(false)
          expect(game.cells[first].adjacent).toBe(0)
          expect(game.firstCell).toBe(first)
          expect(game.startSeed).toBe(seed)
        }
      }
    }
  })
})

describe('the shared vectors', () => {
  it('cover every standard board and both small-board cases', () => {
    const names = new Set(VECTORS.boards.map((vector) => vector.board))
    expect(names).toEqual(new Set(['beginner', 'intermediate', 'expert', 'small']))
    // One small board with just enough room around the first cell, two without.
    expect(VECTORS.boards.filter((vector) => vector.board === 'small')).toHaveLength(3)
  })

  it('pin the generator: the same numbers from the same seed', () => {
    for (const { seed, outputs } of VECTORS.random) {
      let current = seed
      for (const expected of outputs) {
        const next = nextRandom(current)
        expect(next.value * 4294967296).toBe(expected)
        current = next.seed
      }
    }
  })

  it('pin where the mines go, the seed after laying them and the 3BV', () => {
    for (const vector of VECTORS.boards) {
      const config = { rows: vector.rows, columns: vector.columns, mines: vector.mines }
      if (vector.board !== 'small') expect(BOARDS[vector.board as keyof typeof BOARDS]).toEqual(config)
      const laid = layMines(createMinesweeper(vector.seed, config), vector.firstCell)
      expect(mineIndexes(laid)).toEqual(vector.mineCells)
      expect(laid.seed).toBe(vector.seedAfter)
      expect(threeBV(laid)).toBe(vector.threeBV)
      expect(replayMines(config, vector.seed, vector.firstCell)).toEqual(vector.mineCells)
      // The seed as a signed 32-bit number, as timed modes will send it, lays the same mines.
      expect(vector.signedSeed).toBe(vector.seed | 0)
      expect(replayMines(config, vector.signedSeed, vector.firstCell)).toEqual(vector.mineCells)
    }
  })

  it('replay a played game from its start seed and first cell', () => {
    const played = reveal(createMinesweeper(4294967295, EXPERT), 29)
    expect(replayMines(EXPERT, played.startSeed, played.firstCell as number)).toEqual(mineIndexes(played))
    expect(mineIndexes(played)).toEqual(VECTORS.boards.find((v) => v.board === 'expert' && v.firstCell === 29)?.mineCells)
  })
})

describe('the larger boards', () => {
  it('flood out from the first reveal and are won once every safe cell is uncovered', () => {
    for (const config of [INTERMEDIATE, EXPERT]) {
      const opened = reveal(createMinesweeper(20261106, config), 0)
      expect(opened.status).toBe('playing')
      expect(opened.revealed).toBeGreaterThanOrEqual(4)
      opened.cells.forEach((cell, index) => {
        if (cell.revealed && cell.adjacent === 0) {
          expect(neighbours(opened, index).every((other) => opened.cells[other].revealed)).toBe(true)
        }
      })

      const won = clearInFewest(opened)
      expect(won.status).toBe('won')
      expect(won.revealed).toBe(safeCells(config))
      // Nothing more happens once it is won.
      expect(reveal(won, mineIndexes(won)[0])).toBe(won)
      expect(toggleFlag(won, mineIndexes(won)[0])).toBe(won)
    }
  })

  it('are lost on a mine, with what was uncovered kept', () => {
    const opened = reveal(createMinesweeper(31337, EXPERT), 250)
    const lost = reveal(opened, mineIndexes(opened)[0])
    expect(lost.status).toBe('lost')
    expect(lost.revealed).toBe(opened.revealed)
    expect(lost.exploded).toBe(mineIndexes(opened)[0])
  })

  it('take at most one flag a mine', () => {
    let game = reveal(createMinesweeper(42, INTERMEDIATE), 17)
    const covered = game.cells.flatMap((cell, index) => (!cell.revealed ? [index] : []))
    for (const index of covered) game = toggleFlag(game, index)
    expect(game.flags).toBe(40)
  })
})

describe('3BV', () => {
  it('counts the fixed boards right', () => {
    // A mine in a corner: one opening uncovers everything else.
    expect(threeBV(withMines({ rows: 3, columns: 3, mines: 1 }, [0]))).toBe(1)
    // A row with a mine in the middle: an opening on each side.
    expect(threeBV(withMines({ rows: 1, columns: 5, mines: 1 }, [2]))).toBe(2)
    // No cell without a mine around it: every number takes a reveal.
    expect(threeBV(withMines({ rows: 1, columns: 3, mines: 1 }, [1]))).toBe(2)
    // Two openings down the sides and the number between the mines, which neither touches.
    expect(threeBV(withMines({ rows: 3, columns: 5, mines: 2 }, [2, 12]))).toBe(3)
    // One safe cell, surrounded.
    expect(threeBV(withMines({ rows: 3, columns: 3, mines: 8 }, [0, 1, 2, 3, 5, 6, 7, 8]))).toBe(1)
  })

  it('is the number of moves the fewest reveals take, and no clear takes fewer', () => {
    for (const config of [BEGINNER, INTERMEDIATE, EXPERT]) {
      for (let seed = 1; seed <= 20; seed++) {
        const laid = layMines(createMinesweeper(seed, config), 0)
        const fewest = clearInFewest(laid)
        expect(fewest.status).toBe('won')
        expect(fewest.moves).toBe(threeBV(laid))

        // Uncovering cell by cell in order never takes fewer.
        let inOrder = laid
        laid.cells.forEach((cell, index) => {
          if (!cell.mine) inOrder = reveal(inOrder, index)
        })
        expect(inOrder.status).toBe('won')
        expect(inOrder.moves).toBeGreaterThanOrEqual(threeBV(laid))
      }
    }
  })
})

describe('timed details', () => {
  it('report the game in whole milliseconds, with the seed and first cell to replay it', () => {
    const won = clearInFewest(reveal(createMinesweeper(4294967295, EXPERT), 29))
    expect(minesweeperTimedDetails(won, 61234.9)).toEqual({
      rows: 16,
      columns: 30,
      mines: 99,
      seed: -1,
      firstCell: 29,
      revealedCells: 381,
      flagsUsed: 0,
      won: 1,
      moves: won.moves,
      gameMs: 61234,
    })
    expect(won.moves).toBe(188)
    expect(TIMED_LIMIT_MS).toBe(999_999)
  })

  it('leave Classic’s details and score as they were', () => {
    const won = clearInFewest(reveal(createMinesweeper(20261006), 40))
    expect(minesweeperDetails(won, 90)).toEqual({
      rows: 9,
      columns: 9,
      mines: 10,
      revealedCells: 71,
      flagsUsed: 0,
      won: 1,
      moves: won.moves,
      seconds: 90,
    })
    expect(minesweeperScore(won, 90)).toBe(710 + 500 + 510)
  })
})
