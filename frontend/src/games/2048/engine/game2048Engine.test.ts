import { describe, expect, it } from 'vitest'
import {
  applyMove,
  createGame2048,
  highestTile,
  legalMoves,
  slide,
  type Game2048State,
} from './game2048Engine'

/** Writes a board the way it looks on screen. */
const board = (...rows: number[][]) => rows.flat()

function stateOf(cells: number[], overrides: Partial<Game2048State> = {}): Game2048State {
  return {
    board: cells,
    tileIds: cells.map((value, index) => (value === 0 ? 0 : index + 1)),
    nextTileId: 100,
    score: 0,
    moves: 0,
    won: false,
    status: 'playing',
    seed: 1,
    ...overrides,
  }
}

describe('createGame2048', () => {
  it('starts with two tiles, each a 2 or a 4', () => {
    const state = createGame2048(5)
    const tiles = state.board.filter((value) => value !== 0)

    expect(tiles).toHaveLength(2)
    tiles.forEach((value) => expect([2, 4]).toContain(value))
    expect(state.status).toBe('playing')
  })

  it('is deterministic for a given seed', () => {
    expect(createGame2048(9)).toEqual(createGame2048(9))
    expect(applyMove(createGame2048(9), 'LEFT')).toEqual(applyMove(createGame2048(9), 'LEFT'))
  })
})

describe('slide', () => {
  it('slides tiles to the edge', () => {
    const result = slide(board([0, 2, 0, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'LEFT')

    expect(result.board.slice(0, 4)).toEqual([2, 4, 0, 0])
    expect(result.moved).toBe(true)
    expect(result.gained).toBe(0)
  })

  it('merges equal neighbours and scores the new tile', () => {
    const result = slide(board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'LEFT')

    expect(result.board.slice(0, 4)).toEqual([4, 0, 0, 0])
    expect(result.gained).toBe(4)
  })

  it('merges each tile at most once per move', () => {
    const left = slide(board([2, 2, 2, 2], [4, 4, 8, 0], [2, 2, 4, 0], [0, 0, 0, 0]), 'LEFT')

    expect(left.board.slice(0, 4)).toEqual([4, 4, 0, 0])
    expect(left.board.slice(4, 8)).toEqual([8, 8, 0, 0])
    // 2+2 makes a 4 that must not merge again with the existing 4.
    expect(left.board.slice(8, 12)).toEqual([4, 4, 0, 0])
    expect(left.gained).toBe(4 + 4 + 8 + 4)
  })

  it('merges towards the side the tiles move to', () => {
    const row = [2, 2, 2, 0]

    expect(slide(board(row, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'LEFT').board.slice(0, 4)).toEqual([4, 2, 0, 0])
    expect(slide(board(row, [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'RIGHT').board.slice(0, 4)).toEqual([0, 0, 2, 4])
  })

  it('handles vertical moves', () => {
    const start = board([2, 0, 0, 0], [2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 8])

    expect(slide(start, 'UP').board).toEqual(board([4, 0, 0, 8], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]))
    expect(slide(start, 'DOWN').board).toEqual(board([0, 0, 0, 0], [0, 0, 0, 0], [4, 0, 0, 0], [4, 0, 0, 8]))
  })

  it('reports when nothing moves', () => {
    const result = slide(board([2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'LEFT')

    expect(result.moved).toBe(false)
  })

  it('records where every tile came from', () => {
    const result = slide(board([0, 2, 2, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), 'LEFT')

    expect(result.origins[0]).toEqual([1, 2]) // merged from cells 1 and 2
    expect(result.origins[1]).toEqual([3]) // the 4 slid over from cell 3
  })
})

describe('applyMove', () => {
  it('adds the score, counts the move and spawns exactly one tile', () => {
    const state = applyMove(stateOf(board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'LEFT')

    expect(state.score).toBe(4)
    expect(state.moves).toBe(1)
    expect(state.board[0]).toBe(4)
    expect(state.board.filter((value) => value !== 0)).toHaveLength(2)
  })

  it('returns the same state for a move that changes nothing', () => {
    const before = stateOf(board([2, 4, 8, 16], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]))

    expect(applyMove(before, 'LEFT')).toBe(before)
    expect(applyMove(before, 'UP')).toBe(before)
  })

  it('does not mutate the previous state', () => {
    const before = stateOf(board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]))
    const snapshot = structuredClone(before)
    applyMove(before, 'LEFT')

    expect(before).toEqual(snapshot)
  })

  it('keeps the id of a sliding tile and gives merged and spawned tiles new ids', () => {
    // Cell 0 holds tile id 1, cell 1 holds id 2, cell 3 holds id 4.
    const state = applyMove(stateOf(board([2, 2, 0, 8], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'LEFT')

    expect(state.tileIds[0]).toBe(100) // new merged tile
    expect(state.tileIds[1]).toBe(4) // the 8 kept its id while sliding
    expect(state.tileIds.filter((id) => id === 101)).toHaveLength(1) // the spawned tile
    expect(state.nextTileId).toBe(102)
  })

  it('marks the game as won when a 2048 tile is made, and lets play continue', () => {
    const state = applyMove(stateOf(board([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'LEFT')

    expect(state.won).toBe(true)
    expect(state.status).toBe('playing')
  })

  it('ends the game when the board is full and nothing can merge', () => {
    // After sliding left the only empty cell is filled by the spawn, leaving no legal move.
    const state = applyMove(stateOf(board([0, 8, 16, 32], [64, 128, 256, 512], [8, 16, 32, 64], [128, 256, 512, 1024])), 'LEFT')

    expect(state.board.every((value) => value !== 0)).toBe(true)
    expect(state.status).toBe('over')
    expect(applyMove(state, 'UP')).toBe(state)
  })
})

describe('legalMoves', () => {
  it('lists only moves that change the board', () => {
    const cells = board([2, 0, 0, 0], [4, 0, 0, 0], [8, 0, 0, 0], [16, 0, 0, 0])

    expect(legalMoves(cells)).toEqual(['RIGHT'])
  })

  it('is empty on a dead board', () => {
    const cells = board([2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2])

    expect(legalMoves(cells)).toEqual([])
  })
})

describe('tile spawning', () => {
  it('always spawns on a cell that was empty after the slide', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const before = stateOf(board([2, 2, 4, 8], [0, 0, 0, 0], [16, 0, 0, 0], [0, 0, 0, 0]), { seed })
      const slid = slide(before.board, 'LEFT').board
      const after = applyMove(before, 'LEFT')

      const changed = after.board.flatMap((value, cell) => (value !== slid[cell] ? [cell] : []))
      expect(changed).toHaveLength(1)
      expect(slid[changed[0]]).toBe(0)
      expect([2, 4]).toContain(after.board[changed[0]])
    }
  })

  it('spawns a 2 about nine times out of ten and a 4 otherwise', () => {
    const spawned = { 2: 0, 4: 0 }
    for (let seed = 1; seed <= 2000; seed++) {
      const before = stateOf(board([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), { seed })
      const after = applyMove(before, 'RIGHT')
      const value = after.board.find((cell, index) => cell !== 0 && index !== 3) as 2 | 4
      spawned[value]++
    }

    expect(spawned[2] + spawned[4]).toBe(2000)
    expect(spawned[4] / 2000).toBeGreaterThan(0.07)
    expect(spawned[4] / 2000).toBeLessThan(0.13)
  })

  it('spawns different tiles for different seeds and the same tile for the same seed', () => {
    const cells = board([2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
    const outcomes = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) outcomes.add(applyMove(stateOf(cells, { seed }), 'RIGHT').board.join())

    expect(outcomes.size).toBeGreaterThan(5)
    expect(applyMove(stateOf(cells, { seed: 9 }), 'RIGHT')).toEqual(applyMove(stateOf(cells, { seed: 9 }), 'RIGHT'))
  })
})

describe('continuing after the win', () => {
  it('keeps applying moves and scoring once 2048 has been made', () => {
    const won = applyMove(stateOf(board([1024, 1024, 4, 4], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'LEFT')
    expect(won.won).toBe(true)

    const next = applyMove(won, 'RIGHT')

    expect(next.moves).toBe(2)
    expect(next.won).toBe(true)
    expect(next.status).toBe('playing')
    expect(highestTile(next.board)).toBe(2048)
  })

  it('is not won before a 2048 tile exists', () => {
    const state = applyMove(stateOf(board([512, 512, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'LEFT')

    expect(state.won).toBe(false)
  })
})
