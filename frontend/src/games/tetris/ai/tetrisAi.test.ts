import { describe, expect, it } from 'vitest'
import {
  HEIGHT,
  WIDTH,
  createTetrisGame,
  pieceCells,
  updateTetris,
  type Cell,
  type Piece,
  type PieceType,
  type TetrisState,
} from '../engine/tetrisEngine'
import { boardFeatures, evaluateBoard } from './evaluation'
import { possiblePlacements } from './placements'
import { choosePlacement, createTetrisAi, nextActionTowards } from './tetrisAi'

const emptyBoard = (): Cell[] => new Array<Cell>(WIDTH * HEIGHT).fill(null)

/** A board whose bottom rows are given as strings, e.g. 'XXXX.XXXXX' ('.' is empty). */
function boardWithRows(...rows: string[]): Cell[] {
  const board = emptyBoard()
  rows.forEach((row, index) => {
    const y = HEIGHT - rows.length + index
    ;[...row].forEach((char, x) => {
      if (char !== '.') board[y * WIDTH + x] = 'J'
    })
  })
  return board
}

/** A game with the given piece freshly spawned over the given board. */
function stateWith(type: PieceType, board: Cell[] = emptyBoard(), queue: PieceType[] = ['O', 'T', 'L', 'J']): TetrisState {
  const spawn: Piece = { type, rotation: 0, x: type === 'O' ? 4 : 3, y: type === 'I' ? -1 : 0 }
  return { board, piece: spawn, queue, score: 0, lines: 0, level: 1, pieces: 0, status: 'playing', seed: 1 }
}

const columnsOf = (piece: Piece) => [...new Set(pieceCells(piece).map(({ x }) => x))].sort((a, b) => a - b)

describe('possible placements', () => {
  it('finds every column for each distinct orientation on an empty board', () => {
    expect(possiblePlacements(stateWith('O'))).toHaveLength(9) // 2 wide: 9 columns, 1 orientation
    expect(possiblePlacements(stateWith('I'))).toHaveLength(7 + 10) // flat and upright
    expect(possiblePlacements(stateWith('S'))).toHaveLength(8 + 9)
    expect(possiblePlacements(stateWith('T'))).toHaveLength(8 + 9 + 8 + 9) // four orientations
  })

  it('covers all four rotations of an asymmetric piece', () => {
    const rotations = new Set(possiblePlacements(stateWith('L')).map((placement) => placement.rotation))

    expect([...rotations].sort()).toEqual([0, 1, 2, 3])
  })

  it('never proposes a landing that overlaps the stack or leaves the board', () => {
    const board = boardWithRows('XX......XX', 'XXX....XXX', 'XXXX..XXXX')
    for (const type of ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const) {
      for (const { landing } of possiblePlacements(stateWith(type, board))) {
        for (const { x, y } of pieceCells(landing)) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThan(WIDTH)
          expect(y).toBeLessThan(HEIGHT)
          expect(board[y * WIDTH + x]).toBeNull()
        }
      }
    }
  })

  it('rests each piece on the stack: one more row down would collide', () => {
    const board = boardWithRows('....XX....', '...XXXX...')
    for (const { landing } of possiblePlacements(stateWith('T', board))) {
      const below = pieceCells({ ...landing, y: landing.y + 1 })
      expect(below.some(({ x, y }) => y >= HEIGHT || board[y * WIDTH + x] !== null)).toBe(true)
    }
  })

  it('does not reach columns that are walled off', () => {
    // A wall in column 2 reaching the top: the piece cannot slide past it to columns 0 and 1.
    const board = emptyBoard()
    for (let y = 0; y < HEIGHT; y++) board[y * WIDTH + 2] = 'J'
    const placements = possiblePlacements(stateWith('O', board))

    expect(placements.length).toBeGreaterThan(0)
    for (const { landing } of placements) expect(Math.min(...columnsOf(landing))).toBeGreaterThan(2)
  })

  it('simulates with the real engine: replaying the actions gives exactly the predicted result', () => {
    const state = createTetrisGame(7)
    for (const placement of possiblePlacements(state)) {
      const replayed = placement.actions.reduce(updateTetris, state)

      expect(replayed).toEqual(placement.result)
      for (const { x, y } of pieceCells(placement.landing)) {
        expect(replayed.board[y * WIDTH + x]).toBe(state.piece.type)
      }
    }
  })

  it('records lines cleared in the simulated result', () => {
    const board = boardWithRows('XXXX..XXXX')
    const filling = possiblePlacements(stateWith('O', board)).find((placement) => placement.x === 4)!

    expect(filling.result.lines).toBe(1)
    expect(filling.result.board.filter(Boolean)).toHaveLength(2) // only the top half of the O remains
  })

  it('returns nothing once the game is over', () => {
    expect(possiblePlacements({ ...stateWith('T'), status: 'over' })).toEqual([])
  })
})

describe('board evaluation', () => {
  it('measures heights, holes, bumpiness and wells', () => {
    // Column heights from the left: 3, 1, 0, 2, 0, 0, 0, 0, 0, 1 with a covered gap in column 0.
    const features = boardFeatures(boardWithRows('X.........', '...X......', '.X.X.....X'))

    expect(features.heights).toEqual([3, 1, 0, 2, 0, 0, 0, 0, 0, 1])
    expect(features.aggregateHeight).toBe(7)
    expect(features.maxHeight).toBe(3)
    expect(features.holes).toBe(2) // the two empty cells under the block at the top of column 0
    expect(features.bumpiness).toBe(2 + 1 + 2 + 2 + 0 + 0 + 0 + 0 + 1)
    expect(features.wells).toBe(1) // column 2 sits one below its lower neighbour
  })

  it('reports an empty board as perfectly flat', () => {
    expect(boardFeatures(emptyBoard())).toMatchObject({ aggregateHeight: 0, holes: 0, bumpiness: 0, maxHeight: 0 })
  })

  it('prefers a flat stack over a bumpy one of the same size', () => {
    const flat = evaluateBoard(boardWithRows('XXXXXX....'), 0)
    const bumpy = evaluateBoard(boardWithRows('X.X.X.....', 'X.X.X.....'), 0)

    expect(flat).toBeGreaterThan(bumpy)
  })

  it('penalises holes', () => {
    const solid = evaluateBoard(boardWithRows('XXX.......', 'XXX.......'), 0)
    const holed = evaluateBoard(boardWithRows('XXX.......', 'X.X.......'), 0)

    expect(solid).toBeGreaterThan(holed)
  })

  it('rewards clearing lines', () => {
    const board = boardWithRows('XXXX......')

    expect(evaluateBoard(board, 2)).toBeGreaterThan(evaluateBoard(board, 0))
  })
})

describe('Tetris AI decisions', () => {
  it('drops an upright I into a four-deep well to score a Tetris', () => {
    const board = boardWithRows('XXXX.XXXXX', 'XXXX.XXXXX', 'XXXX.XXXXX', 'XXXX.XXXXX')
    const placement = choosePlacement(stateWith('I', board))!

    expect(columnsOf(placement.landing)).toEqual([4])
    expect(placement.result.lines).toBe(4)
  })

  it('fills a gap that completes a line', () => {
    const board = boardWithRows('XXXX..XXXX')
    const placement = choosePlacement(stateWith('O', board))!

    expect(placement.x).toBe(4)
    expect(placement.result.lines).toBe(1)
  })

  it('avoids creating a hole when a clean fit exists', () => {
    // A step: columns 0-4 are one higher than columns 5-9. Every sensible O placement stays flat.
    const board = boardWithRows('XXXXX.....')
    const placement = choosePlacement(stateWith('O', board))!

    expect(boardFeatures(placement.result.board).holes).toBe(0)
  })

  it('lays the first piece flat on an empty board', () => {
    const placement = choosePlacement(stateWith('I'))!

    expect(boardFeatures(placement.result.board).maxHeight).toBe(1)
  })

  it('uses the next piece: leaves the well open for the I that is coming', () => {
    // Current O could plug the two-wide gap partially; the I next in the queue clears four lines
    // if the single-column well at column 9 stays open.
    const board = boardWithRows('XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.', 'XXXXXXXXX.')
    const placement = choosePlacement(stateWith('O', board, ['I', 'T', 'L', 'J']))!

    expect(columnsOf(placement.landing)).not.toContain(9)
  })

  it('turns a target into the actions that reach it, one at a time', () => {
    const state = createTetrisGame(11)
    const ai = createTetrisAi()
    const target = ai.decide(state).target!

    let current = state
    const played = []
    while (current.pieces === state.pieces) {
      const action = ai.getNextAction(current)
      played.push(action)
      current = updateTetris(current, action)
      expect(played.length).toBeLessThan(20)
    }

    expect(played).toEqual(target.actions)
    expect(played.at(-1)).toBe('HARD_DROP')
    expect(current).toEqual(target.result)
  })

  it('rotates before sliding, and drops only when in position', () => {
    const target = { rotation: 1, x: 5 } as Parameters<typeof nextActionTowards>[1]

    expect(nextActionTowards({ type: 'T', rotation: 0, x: 3, y: 0 }, target)).toBe('ROTATE_CW')
    expect(nextActionTowards({ type: 'T', rotation: 1, x: 3, y: 0 }, target)).toBe('RIGHT')
    expect(nextActionTowards({ type: 'T', rotation: 1, x: 7, y: 0 }, target)).toBe('LEFT')
    expect(nextActionTowards({ type: 'T', rotation: 1, x: 5, y: 0 }, target)).toBe('HARD_DROP')
  })

  it('is deterministic: the same state always gives the same placement', () => {
    const state = createTetrisGame(4)
    const first = choosePlacement(state)!
    const second = choosePlacement(state)!

    expect([second.rotation, second.x]).toEqual([first.rotation, first.x])
  })

  it('plays 400 pieces without losing and keeps the stack low', { timeout: 120_000 }, () => {
    const ai = createTetrisAi()
    let state = createTetrisGame(2)
    let peak = 0
    while (state.status === 'playing' && state.pieces < 400) {
      const before = state.pieces
      state = updateTetris(state, ai.getNextAction(state))
      if (state.pieces !== before) peak = Math.max(peak, boardFeatures(state.board).maxHeight)
    }

    expect(state.status).toBe('playing')
    expect(state.lines).toBeGreaterThan(140)
    expect(peak).toBeLessThanOrEqual(12)
  })
})
