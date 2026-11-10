import { describe, expect, it } from 'vitest'
import { createGame2048Ai } from '../ai/game2048Ai'
import {
  MOVES,
  MOVES_LIMIT,
  applyMove,
  asksToKeepGoing,
  createGame2048,
  highestTile,
  legalMoves,
  moveLimitOutcome,
  movesLeft,
  slide,
  type Game2048State,
  type Move,
} from './game2048Engine'

const board = (...rows: number[][]) => rows.flat()

function stateOf(cells: number[], extra: Partial<Game2048State> = {}): Game2048State {
  return {
    board: cells,
    tileIds: cells.map((value, index) => (value === 0 ? 0 : index + 1)),
    nextTileId: 100,
    score: 0,
    moves: 0,
    won: false,
    status: 'playing',
    seed: 1,
    ...extra,
  }
}

/** Plays the first legal move in a fixed order until the run ends or `cap` moves are tried. */
function playFirstLegal(state: Game2048State, order: readonly Move[], cap = 2000): Game2048State {
  for (let i = 0; i < cap && state.status === 'playing'; i++) {
    const move = order.find((m) => slide(state.board, m).moved)
    if (!move) break
    state = applyMove(state, move)
  }
  return state
}

/** Plays the moves in order, skipping none: no-op moves are passed to the engine too. */
function replay(state: Game2048State, moves: readonly Move[]): Game2048State {
  return moves.reduce(applyMove, state)
}

/** A seed whose corner strategy lasts at least `moves` valid moves without a limit. */
function seedLasting(moves: number): number {
  for (let seed = 1; seed < 500; seed++) {
    if (playFirstLegal(createGame2048(seed), ['DOWN', 'LEFT', 'RIGHT', 'UP'], moves).moves >= moves) return seed
  }
  throw new Error('no seed lasts that long')
}

describe('Moves Limit engine', () => {
  it('ends the run immediately after exactly 300 valid moves', () => {
    const seed = seedLasting(MOVES_LIMIT + 50)
    let state = createGame2048(seed, { moveLimit: MOVES_LIMIT })
    const order: Move[] = ['DOWN', 'LEFT', 'RIGHT', 'UP']

    for (let i = 0; i < MOVES_LIMIT - 1; i++) {
      state = applyMove(state, order.find((m) => slide(state.board, m).moved)!)
    }
    expect(state.moves).toBe(MOVES_LIMIT - 1)
    expect(state.status).toBe('playing')
    expect(movesLeft(state)).toBe(1)
    expect(moveLimitOutcome(state)).toBe('playing')
    expect(legalMoves(state.board).length).toBeGreaterThan(0)

    state = applyMove(state, order.find((m) => slide(state.board, m).moved)!)
    expect(state.moves).toBe(MOVES_LIMIT)
    expect(state.status).toBe('over')
    expect(movesLeft(state)).toBe(0)
    expect(moveLimitOutcome(state)).toBe('limit-reached')
    // The run would have had moves left without the limit.
    expect(legalMoves(state.board).length).toBeGreaterThan(0)

    // Nothing moves once the run is over.
    for (const move of MOVES) expect(applyMove(state, move)).toBe(state)
  })

  it('does not count a move that changes nothing', () => {
    // Everything is already packed to the left and nothing can merge left.
    const start = stateOf(board([2, 4, 0, 0], [8, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), { moveLimit: 3 })
    expect(slide(start.board, 'LEFT').moved).toBe(false)

    let state = start
    for (let i = 0; i < 10; i++) state = applyMove(state, 'LEFT')
    expect(state).toBe(start)
    expect(state.moves).toBe(0)
    expect(movesLeft(state)).toBe(3)

    // Only valid moves use the budget, whatever no-op moves come between them.
    const order: Move[] = ['LEFT', 'RIGHT', 'LEFT', 'LEFT', 'DOWN', 'DOWN', 'UP']
    for (const move of order) {
      const before = state
      state = applyMove(state, move)
      if (!slide(before.board, move).moved) expect(state).toBe(before)
      if (state.status === 'over') break
    }
    expect(state.moves).toBe(3)
    expect(state.status).toBe('over')
    expect(moveLimitOutcome(state)).toBe('limit-reached')
  })

  it('keeps playing after making 2048, without asking to keep going', () => {
    const start = stateOf(board([1024, 1024, 0, 0], [2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), {
      moveLimit: MOVES_LIMIT,
      moves: 10,
      score: 9000,
    })

    const after = applyMove(start, 'LEFT')
    expect(highestTile(after.board)).toBe(2048)
    expect(after.won).toBe(true)
    expect(after.status).toBe('playing')
    expect(after.moves).toBe(11)
    expect(movesLeft(after)).toBe(MOVES_LIMIT - 11)
    expect(moveLimitOutcome(after)).toBe('playing')
    expect(asksToKeepGoing(after)).toBe(false)

    // The next valid move still counts and plays on.
    const move = MOVES.find((m) => slide(after.board, m).moved)!
    const next = applyMove(after, move)
    expect(next.moves).toBe(12)
    expect(next.status).toBe('playing')
  })

  it('ends earlier when no legal move remains', () => {
    // Sliding RIGHT leaves one empty cell (bottom left); whichever tile spawns there, nothing merges.
    const start = stateOf(
      board([2, 4, 2, 4], [4, 2, 4, 2], [64, 128, 64, 128], [8, 16, 32, 0]),
      { moveLimit: MOVES_LIMIT, moves: 40 },
    )

    const state = applyMove(start, 'RIGHT')
    expect(state.board.slice(13)).toEqual([8, 16, 32])
    expect(state.status).toBe('over')
    expect(state.moves).toBe(41)
    expect(legalMoves(state.board)).toEqual([])
    expect(moveLimitOutcome(state)).toBe('stuck')
    expect(movesLeft(state)).toBeGreaterThan(0)
  })

  it('ends a seeded run stuck before the limit as stuck', () => {
    // UP then LEFT only, never DOWN or RIGHT unless forced: a poor strategy that tops out early.
    for (let seed = 1; seed < 200; seed++) {
      const unlimited = playFirstLegal(createGame2048(seed), ['UP', 'LEFT', 'RIGHT', 'DOWN'])
      if (unlimited.moves >= MOVES_LIMIT) continue
      const limited = playFirstLegal(createGame2048(seed, { moveLimit: MOVES_LIMIT }), ['UP', 'LEFT', 'RIGHT', 'DOWN'])
      expect(limited.status).toBe('over')
      expect(limited.moves).toBe(unlimited.moves)
      expect(limited.board).toEqual(unlimited.board)
      expect(moveLimitOutcome(limited)).toBe('stuck')
      return
    }
    throw new Error('no seed tops out before the limit')
  })

  it('replays deterministically from the seed and the moves', () => {
    const moves: Move[] = Array.from({ length: 400 }, (_, i) => MOVES[(i * 7 + (i >> 3)) % 4])
    const a = replay(createGame2048(77, { moveLimit: MOVES_LIMIT }), moves)
    const b = replay(createGame2048(77, { moveLimit: MOVES_LIMIT }), moves)
    expect(a).toEqual(b)
    expect(replay(createGame2048(78, { moveLimit: MOVES_LIMIT }), moves)).not.toEqual(a)
  })

  it('spawns exactly as Classic on the same seed; only the end differs', () => {
    const seed = seedLasting(MOVES_LIMIT + 20)
    const order: Move[] = ['DOWN', 'LEFT', 'RIGHT', 'UP']
    let classic = createGame2048(seed)
    let limited = createGame2048(seed, { moveLimit: MOVES_LIMIT })

    const { moveLimit, ...withoutKey } = limited
    expect(moveLimit).toBe(MOVES_LIMIT)
    expect(withoutKey).toEqual(classic)

    while (limited.status === 'playing') {
      const move = order.find((m) => slide(classic.board, m).moved)!
      classic = applyMove(classic, move)
      limited = applyMove(limited, move)
      const { moveLimit: _, ...rest } = limited
      if (limited.status === 'playing') expect(rest).toEqual(classic)
      else expect({ ...rest, status: 'playing' }).toEqual(classic)
    }
    expect(classic.status).toBe('playing')
    expect(classic.moves).toBe(MOVES_LIMIT)
  })

  it('leaves Classic without a limit', () => {
    const classic = createGame2048(5)
    expect('moveLimit' in classic).toBe(false)
    expect(createGame2048(5, {})).toEqual(classic)
    expect(movesLeft(classic)).toBeNull()
    expect(moveLimitOutcome(classic)).toBeNull()
    expect(asksToKeepGoing(classic)).toBe(true)

    const seed = seedLasting(MOVES_LIMIT + 50)
    const played = playFirstLegal(createGame2048(seed), ['DOWN', 'LEFT', 'RIGHT', 'UP'], MOVES_LIMIT + 50)
    expect(played.moves).toBe(MOVES_LIMIT + 50)
    expect(played.status).toBe('playing')
    expect('moveLimit' in played).toBe(false)

    // Classic still asks to keep going once 2048 is made, and still plays on.
    const won = applyMove(stateOf(board([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])), 'LEFT')
    expect(won.won).toBe(true)
    expect(won.status).toBe('playing')
    expect(asksToKeepGoing(won)).toBe(true)
  })

  it('refuses a limit that is not a positive whole number', () => {
    for (const moveLimit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createGame2048(1, { moveLimit })).toThrow(RangeError)
    }
    expect(createGame2048(1, { moveLimit: 1 }).moveLimit).toBe(1)
  })
})

describe('Moves Limit with the AI', () => {
  it('plays a limited run through the engine and never makes more than 300 valid moves', () => {
    for (const seed of [3, 11]) {
      const ai = createGame2048Ai()
      let state = createGame2048(seed, { moveLimit: MOVES_LIMIT })
      let decisions = 0
      while (state.status === 'playing') {
        const next = applyMove(state, ai.decide(state).action)
        // The AI only picks moves that change the board, so every decision uses one move.
        expect(next.moves).toBe(state.moves + 1)
        state = next
        decisions++
        expect(decisions).toBeLessThanOrEqual(MOVES_LIMIT)
      }
      expect(state.moves).toBeLessThanOrEqual(MOVES_LIMIT)
      expect(moveLimitOutcome(state)).not.toBe('playing')
      // The expert AI does not top out within 300 moves on these seeds.
      expect(state.moves).toBe(MOVES_LIMIT)
      expect(moveLimitOutcome(state)).toBe('limit-reached')
      expect(state.score).toBeGreaterThan(3000)
      for (const move of MOVES) expect(applyMove(state, move)).toBe(state)
    }
  }, 30000)

  it('decides the same on a limited and a Classic state of the same board', () => {
    const seed = 21
    let classic = createGame2048(seed)
    let limited = createGame2048(seed, { moveLimit: MOVES_LIMIT })
    for (let i = 0; i < 40; i++) {
      const a = createGame2048Ai().decide(classic).action
      const b = createGame2048Ai().decide(limited).action
      expect(b).toBe(a)
      classic = applyMove(classic, a)
      limited = applyMove(limited, b)
    }
  })
})
