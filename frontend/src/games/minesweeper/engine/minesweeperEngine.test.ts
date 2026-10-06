import { describe, expect, it } from 'vitest'
import {
  BEGINNER,
  createMinesweeper,
  layMines,
  minesLeft,
  minesweeperDetails,
  minesweeperScore,
  neighbours,
  reveal,
  safeCells,
  toggleFlag,
  updateMinesweeper,
  type MinesweeperState,
} from './minesweeperEngine'

const SEED = 20261006
const CENTRE = 40 // row 4, column 4 of a 9 × 9 board

const mineIndexes = (state: MinesweeperState) =>
  state.cells.flatMap((cell, index) => (cell.mine ? [index] : []))

/** A game after its first reveal in the centre: mines laid, a safe opening uncovered. */
const opened = (seed = SEED) => reveal(createMinesweeper(seed), CENTRE)

/** Uncovers every safe cell, one reveal at a time. */
function clearBoard(state: MinesweeperState): MinesweeperState {
  let current = state
  state.cells.forEach((cell, index) => {
    if (!cell.mine) current = reveal(current, index)
  })
  return current
}

describe('a new game', () => {
  it('is a covered 9 × 9 board with 10 mines still to lay', () => {
    const game = createMinesweeper(SEED)

    expect(BEGINNER).toEqual({ rows: 9, columns: 9, mines: 10 })
    expect(game.cells).toHaveLength(81)
    expect(game.cells.every((cell) => !cell.revealed && !cell.flagged && !cell.mine)).toBe(true)
    expect(game.status).toBe('ready')
    expect(minesLeft(game)).toBe(10)
    expect(safeCells(game)).toBe(71)
  })

  it('takes other sizes too', () => {
    const game = createMinesweeper(SEED, { rows: 4, columns: 6, mines: 3 })
    expect(game.cells).toHaveLength(24)
    expect(mineIndexes(layMines(game, 0))).toHaveLength(3)
  })
})

describe('laying mines', () => {
  it('is the same for the same seed and first cell, and differs for another seed', () => {
    expect(mineIndexes(opened())).toEqual(mineIndexes(opened()))
    expect(mineIndexes(opened(SEED + 1))).not.toEqual(mineIndexes(opened()))
  })

  it('lays exactly the mines the board has, never on or around the first cell', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const game = layMines(createMinesweeper(seed), CENTRE)
      const mines = mineIndexes(game)
      expect(mines).toHaveLength(10)
      for (const kept of [CENTRE, ...neighbours(game, CENTRE)]) expect(mines).not.toContain(kept)
    }
  })

  it('counts the mines around every cell', () => {
    const game = opened()
    game.cells.forEach((cell, index) => {
      expect(cell.adjacent).toBe(neighbours(game, index).filter((other) => game.cells[other].mine).length)
    })
  })

  it('knows a corner has three neighbours, an edge five and the middle eight', () => {
    const game = createMinesweeper(SEED)
    expect(neighbours(game, 0).sort((a, b) => a - b)).toEqual([1, 9, 10])
    expect(neighbours(game, 4)).toHaveLength(5)
    expect(neighbours(game, CENTRE)).toHaveLength(8)
  })
})

describe('revealing', () => {
  it('starts the game with a safe opening that floods out over empty cells', () => {
    const game = opened()

    expect(game.status).toBe('playing')
    expect(game.cells[CENTRE].revealed).toBe(true)
    expect(game.cells[CENTRE].adjacent).toBe(0)
    // The centre is empty, so its whole empty area and the numbers around it are uncovered.
    expect(game.revealed).toBeGreaterThan(9)
    expect(game.revealed).toBe(game.cells.filter((cell) => cell.revealed).length)
    expect(game.moves).toBe(1)
    // Every uncovered empty cell has all its neighbours uncovered too.
    game.cells.forEach((cell, index) => {
      if (cell.revealed && cell.adjacent === 0) {
        expect(neighbours(game, index).every((other) => game.cells[other].revealed)).toBe(true)
      }
    })
  })

  it('uncovers just the cell when it touches a mine', () => {
    const game = opened()
    const numbered = game.cells.findIndex((cell) => !cell.revealed && !cell.mine && cell.adjacent > 0)
    const after = reveal(game, numbered)

    expect(after.revealed).toBe(game.revealed + 1)
    expect(after.moves).toBe(2)
  })

  it('ignores a cell already uncovered, a flagged cell, or a cell off the board', () => {
    const game = opened()
    expect(reveal(game, CENTRE)).toBe(game)
    expect(reveal(game, 999)).toBe(game)

    const covered = game.cells.findIndex((cell) => !cell.revealed)
    const flagged = toggleFlag(game, covered)
    expect(reveal(flagged, covered)).toBe(flagged)
  })

  it('loses on a mine, and then nothing more happens', () => {
    const game = opened()
    const mine = mineIndexes(game)[0]
    const lost = reveal(game, mine)

    expect(lost.status).toBe('lost')
    expect(lost.exploded).toBe(mine)
    expect(lost.cells[mine].revealed).toBe(true)
    expect(lost.moves).toBe(2)
    expect(lost.revealed).toBe(game.revealed)

    const safe = lost.cells.findIndex((cell) => !cell.revealed && !cell.mine)
    expect(reveal(lost, safe)).toBe(lost)
    expect(toggleFlag(lost, safe)).toBe(lost)
  })

  it('wins once every safe cell is uncovered', () => {
    const won = clearBoard(opened())

    expect(won.status).toBe('won')
    expect(won.revealed).toBe(71)
    expect(won.moves).toBeLessThanOrEqual(won.revealed)
    expect(won.cells.filter((cell) => cell.mine).every((cell) => !cell.revealed)).toBe(true)
  })
})

describe('flags', () => {
  it('go on and off covered cells during a game, and move the mine counter', () => {
    const game = opened()
    const covered = game.cells.findIndex((cell) => !cell.revealed)

    const flagged = toggleFlag(game, covered)
    expect(flagged.cells[covered].flagged).toBe(true)
    expect(minesLeft(flagged)).toBe(9)
    expect(flagged.moves).toBe(game.moves)

    const unflagged = toggleFlag(flagged, covered)
    expect(unflagged.cells[covered].flagged).toBe(false)
    expect(minesLeft(unflagged)).toBe(10)
  })

  it('cannot go on uncovered cells, before the game starts, or beyond the number of mines', () => {
    expect(toggleFlag(createMinesweeper(SEED), 0).flags).toBe(0)
    const game = opened()
    expect(toggleFlag(game, CENTRE)).toBe(game)

    let flagged = game
    for (const index of game.cells.flatMap((cell, i) => (cell.revealed ? [] : [i])).slice(0, 12)) {
      flagged = toggleFlag(flagged, index)
    }
    expect(flagged.flags).toBe(10)
    expect(minesLeft(flagged)).toBe(0)
  })

  it('keep a flagged cell covered when an empty area floods past it', () => {
    const start = createMinesweeper(SEED)
    const game = layMines(start, CENTRE)
    // Flag a safe cell of the opening area before revealing it.
    const neighbour = neighbours(game, CENTRE)[0]
    const flagged = toggleFlag(game, neighbour)
    const after = reveal(flagged, CENTRE)
    expect(after.cells[neighbour].revealed).toBe(false)
    expect(after.cells[neighbour].flagged).toBe(true)
  })
})

describe('actions', () => {
  it('go through one update function', () => {
    const game = updateMinesweeper(createMinesweeper(SEED), { type: 'REVEAL', index: CENTRE })
    expect(game).toEqual(opened())
    const covered = game.cells.findIndex((cell) => !cell.revealed)
    expect(updateMinesweeper(game, { type: 'FLAG', index: covered })).toEqual(toggleFlag(game, covered))
  })

  it('start over from a new game: a reset is just a new state', () => {
    const fresh = createMinesweeper(SEED)
    expect(fresh).toEqual(createMinesweeper(SEED))
    expect(fresh.status).toBe('ready')
  })
})

describe('the score', () => {
  it('is 10 a safe cell uncovered, whatever the flags', () => {
    const game = opened()
    const covered = game.cells.findIndex((cell) => !cell.revealed && !cell.mine)
    expect(minesweeperScore(game, 30)).toBe(game.revealed * 10)
    expect(minesweeperScore(toggleFlag(game, covered), 30)).toBe(game.revealed * 10)
  })

  it('keeps what was uncovered when a game is lost, with no bonus', () => {
    const game = opened()
    const lost = reveal(game, mineIndexes(game)[0])
    expect(minesweeperScore(lost, 5)).toBe(game.revealed * 10)
  })

  it('adds 500 and a point a second under ten minutes for a cleared board', () => {
    const won = clearBoard(opened())
    expect(minesweeperScore(won, 90)).toBe(710 + 500 + 510)
    expect(minesweeperScore(won, 600)).toBe(1210)
    expect(minesweeperScore(won, 4000)).toBe(1210)
  })

  it('reports the numbers the server checks', () => {
    const won = clearBoard(opened())
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
  })
})
