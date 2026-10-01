import { describe, expect, it } from 'vitest'
import {
  HEIGHT,
  PIECE_TYPES,
  WIDTH,
  collides,
  createTetrisGame,
  dropDistance,
  gravityDelay,
  pieceCells,
  updateTetris,
  type Cell,
  type Piece,
  type PieceType,
  type TetrisAction,
  type TetrisState,
} from './tetrisEngine'

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

function stateOf(overrides: Partial<TetrisState> & { piece: Piece }): TetrisState {
  return {
    board: emptyBoard(),
    queue: ['O', 'I', 'T', 'S', 'Z', 'J', 'L'],
    score: 0,
    lines: 0,
    level: 1,
    pieces: 0,
    status: 'playing',
    seed: 1,
    ...overrides,
  }
}

const piece = (type: PieceType, x: number, y: number, rotation = 0): Piece => ({ type, rotation, x, y })
const play = (state: TetrisState, ...actions: TetrisAction[]) => actions.reduce(updateTetris, state)
const filledRow = (board: readonly Cell[], y: number) => board.slice(y * WIDTH, (y + 1) * WIDTH).filter(Boolean).length

describe('createTetrisGame', () => {
  it('starts with an empty board, a piece at the top and a preview queue', () => {
    const state = createTetrisGame(1)

    expect(state.board.every((cell) => cell === null)).toBe(true)
    expect(pieceCells(state.piece).every(({ y }) => y >= 0 && y <= 1)).toBe(true)
    expect(state.queue.length).toBeGreaterThanOrEqual(3)
    expect(state.status).toBe('playing')
  })

  it('is deterministic for a given seed', () => {
    expect(createTetrisGame(5)).toEqual(createTetrisGame(5))
  })

  it('deals every piece once per bag of seven', () => {
    let state = createTetrisGame(3)
    const dealt: PieceType[] = [state.piece.type]
    while (dealt.length < 14) {
      // Wipe the board each time so the stack never reaches the top during the test.
      state = updateTetris({ ...state, board: emptyBoard() }, 'HARD_DROP')
      dealt.push(state.piece.type)
    }

    expect([...dealt.slice(0, 7)].sort()).toEqual([...PIECE_TYPES].sort())
    expect([...dealt.slice(7, 14)].sort()).toEqual([...PIECE_TYPES].sort())
  })
})

describe('movement', () => {
  it('moves left and right', () => {
    const state = stateOf({ piece: piece('T', 3, 5) })

    expect(updateTetris(state, 'LEFT').piece.x).toBe(2)
    expect(updateTetris(state, 'RIGHT').piece.x).toBe(4)
  })

  it('is stopped by the walls and returns the same state', () => {
    const atLeft = stateOf({ piece: piece('T', 0, 5) })
    const atRight = stateOf({ piece: piece('T', WIDTH - 3, 5) })

    expect(updateTetris(atLeft, 'LEFT')).toBe(atLeft)
    expect(updateTetris(atRight, 'RIGHT')).toBe(atRight)
  })

  it('is stopped by locked blocks', () => {
    const board = emptyBoard()
    board[6 * WIDTH + 2] = 'J' // directly left of the T's left arm at (3,6)
    const state = stateOf({ board, piece: piece('T', 3, 5) })

    expect(updateTetris(state, 'LEFT')).toBe(state)
  })

  it('falls one row per tick', () => {
    const state = updateTetris(stateOf({ piece: piece('T', 3, 5) }), 'TICK')

    expect(state.piece.y).toBe(6)
    expect(state.score).toBe(0)
  })

  it('does not mutate the previous state', () => {
    const before = stateOf({ piece: piece('T', 3, 5) })
    const snapshot = structuredClone(before)
    play(before, 'LEFT', 'ROTATE_CW', 'HARD_DROP')

    expect(before).toEqual(snapshot)
  })
})

describe('rotation', () => {
  it('cycles a T piece through four distinct orientations and back', () => {
    const start = stateOf({ piece: piece('T', 3, 5) })
    const shapes: string[] = []
    let state = start
    for (let i = 0; i < 4; i++) {
      shapes.push(JSON.stringify(pieceCells(state.piece)))
      state = updateTetris(state, 'ROTATE_CW')
    }

    expect(new Set(shapes).size).toBe(4)
    expect(state.piece).toEqual(start.piece)
  })

  it('rotates counter-clockwise as the inverse of clockwise', () => {
    const start = stateOf({ piece: piece('L', 3, 5) })

    expect(play(start, 'ROTATE_CW', 'ROTATE_CCW').piece).toEqual(start.piece)
  })

  it('keeps every orientation made of four cells', () => {
    for (const type of PIECE_TYPES) {
      for (let rotation = 0; rotation < 4; rotation++) {
        const cells = pieceCells(piece(type, 3, 5, rotation))
        expect(new Set(cells.map(({ x, y }) => `${x},${y}`)).size).toBe(4)
      }
    }
  })

  it('kicks off the wall when rotating against it', () => {
    // A vertical I hugging the left wall needs to shift right to lie flat.
    const vertical = stateOf({ piece: piece('I', -2, 5, 1) })
    expect(collides(vertical.board, vertical.piece)).toBe(false)

    const flat = updateTetris(vertical, 'ROTATE_CW')

    expect(flat.piece.rotation).toBe(2)
    expect(pieceCells(flat.piece).every(({ x }) => x >= 0 && x < WIDTH)).toBe(true)
  })

  it('refuses a rotation that cannot fit anywhere and returns the same state', () => {
    // A vertical I in a one-cell-wide shaft has no room to turn.
    const board = emptyBoard()
    for (let y = 10; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) if (x !== 4) board[y * WIDTH + x] = 'J'
    }
    const state = stateOf({ board, piece: piece('I', 2, 14, 1) })

    expect(updateTetris(state, 'ROTATE_CW')).toBe(state)
  })
})

describe('dropping and locking', () => {
  it('hard drop lands on the floor, locks and spawns the next piece', () => {
    const state = updateTetris(stateOf({ piece: piece('O', 4, 0) }), 'HARD_DROP')

    expect(state.board[(HEIGHT - 1) * WIDTH + 4]).toBe('O')
    expect(state.board[(HEIGHT - 2) * WIDTH + 5]).toBe('O')
    expect(state.piece.type).toBe('O') // first in the queue
    expect(state.queue[0]).toBe('I')
    expect(state.pieces).toBe(1)
    expect(state.score).toBe(18 * 2) // 18 rows at 2 points each
  })

  it('lands on top of the stack', () => {
    const board = boardWithRows('....XX....')

    expect(dropDistance(board, piece('O', 4, 0))).toBe(HEIGHT - 3)
  })

  it('soft drop scores a point per row and locks when it cannot fall', () => {
    const falling = updateTetris(stateOf({ piece: piece('O', 4, 0) }), 'SOFT_DROP')
    expect(falling.piece.y).toBe(1)
    expect(falling.score).toBe(1)

    const landed = updateTetris(stateOf({ piece: piece('O', 4, HEIGHT - 2) }), 'SOFT_DROP')
    expect(landed.pieces).toBe(1)
  })

  it('a tick locks a piece that is resting on the stack', () => {
    const state = updateTetris(stateOf({ piece: piece('O', 4, HEIGHT - 2) }), 'TICK')

    expect(state.pieces).toBe(1)
    expect(state.board[(HEIGHT - 1) * WIDTH + 4]).toBe('O')
  })
})

describe('line clears', () => {
  it('clears a completed line, shifts the stack down and scores', () => {
    // The bottom row is missing only columns 4 and 5; an O piece completes it.
    const board = boardWithRows('X.........', 'XXXX..XXXX')
    const state = updateTetris(stateOf({ board, piece: piece('O', 4, 0) }), 'HARD_DROP')

    expect(state.lines).toBe(1)
    expect(state.score).toBe(18 * 2 + 100)
    // The row above moved down, joined by the top half of the O.
    expect(filledRow(state.board, HEIGHT - 1)).toBe(3)
    expect(state.board[(HEIGHT - 1) * WIDTH + 0]).toBe('J')
    expect(filledRow(state.board, HEIGHT - 2)).toBe(0)
  })

  it('scores a four-line clear as a Tetris', () => {
    const board = boardWithRows('XXXX.XXXXX', 'XXXX.XXXXX', 'XXXX.XXXXX', 'XXXX.XXXXX')
    // A vertical I (rotation 1 occupies the third column of its box) dropped into column 4.
    const state = updateTetris(stateOf({ board, piece: piece('I', 2, 0, 1) }), 'HARD_DROP')

    expect(state.lines).toBe(4)
    expect(state.score).toBe(16 * 2 + 800)
    expect(state.board.every((cell) => cell === null)).toBe(true)
  })

  it('levels up every ten lines and speeds up gravity', () => {
    const board = boardWithRows('XXXX..XXXX')
    const state = updateTetris(stateOf({ board, piece: piece('O', 4, 0), lines: 9 }), 'HARD_DROP')

    expect(state.lines).toBe(10)
    expect(state.level).toBe(2)
    expect(gravityDelay(2)).toBeLessThan(gravityDelay(1))
    expect(gravityDelay(99)).toBeGreaterThan(0)
  })
})

describe('game over', () => {
  it('ends when the next piece has no room to spawn', () => {
    // Column 4 and 5 are stacked to the top, exactly where pieces appear.
    const board = emptyBoard()
    for (let y = 2; y < HEIGHT; y++) {
      board[y * WIDTH + 4] = 'J'
      board[y * WIDTH + 5] = 'J'
    }
    const state = updateTetris(stateOf({ board, piece: piece('O', 4, 0) }), 'HARD_DROP')

    expect(state.status).toBe('over')
  })

  it('ignores every action once the game is over', () => {
    const over = stateOf({ piece: piece('T', 3, 5), status: 'over' })

    expect(updateTetris(over, 'LEFT')).toBe(over)
    expect(updateTetris(over, 'HARD_DROP')).toBe(over)
  })
})
