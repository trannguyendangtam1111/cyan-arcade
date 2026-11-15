import { describe, expect, it } from 'vitest'
import {
  AI_MOVE_GAME_MS,
  CLOCK_STEP_MS,
  MOVES_LIMIT,
  TIME_ATTACK_MS,
  WINNING_TILE,
  advanceClock,
  applyAiMove,
  applyMove,
  asksToKeepGoing,
  clockStarted,
  createGame2048,
  legalMoves,
  moveLimitOutcome,
  movesLeft,
  timeAttackOutcome,
  timeLeftMs,
  type Game2048State,
  type Move,
} from './game2048Engine'

const STEPS = TIME_ATTACK_MS / CLOCK_STEP_MS
const board = (...rows: number[][]) => rows.flat()

function timed(cells: number[], extra: Partial<Game2048State> = {}): Game2048State {
  return {
    board: cells,
    tileIds: cells.map((value, index) => (value === 0 ? 0 : index + 1)),
    nextTileId: 100,
    score: 0,
    moves: 1,
    won: false,
    status: 'playing',
    seed: 1,
    clock: { elapsedMs: 0, limitMs: TIME_ATTACK_MS, timeUp: false },
    ...extra,
  }
}

/** A new Time Attack run after its first valid move, so its clock is running. */
function started(seed = 7): Game2048State {
  const fresh = createGame2048(seed, { timeLimitMs: TIME_ATTACK_MS })
  return applyMove(fresh, legalMoves(fresh.board)[0])
}

/** A move that changes nothing on this board, if there is one. */
const noOpMove = (state: Game2048State): Move | undefined =>
  (['UP', 'DOWN', 'LEFT', 'RIGHT'] as const).find((move) => !legalMoves(state.board).includes(move))

describe('Time Attack engine', () => {
  it('starts with a stopped clock at 0 of exactly 120,000 ms', () => {
    const state = createGame2048(3, { timeLimitMs: TIME_ATTACK_MS })
    expect(TIME_ATTACK_MS).toBe(120_000)
    expect(state.clock).toEqual({ elapsedMs: 0, limitMs: 120_000, timeUp: false })
    expect(timeLeftMs(state)).toBe(120_000)
    expect(clockStarted(state)).toBe(false)
    expect(timeAttackOutcome(state)).toBe('waiting')
    // The tiles are the same as Classic's on the same seed.
    expect(state.board).toEqual(createGame2048(3).board)
  })

  it('refuses a time limit that is not a positive whole number of clock steps', () => {
    for (const timeLimitMs of [0, -10, 15, 99.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createGame2048(1, { timeLimitMs })).toThrow(RangeError)
    }
    expect(() => advanceClock(started(), 1.5)).toThrow(RangeError)
  })

  it('does not advance the clock before the first valid move', () => {
    const fresh = createGame2048(5, { timeLimitMs: TIME_ATTACK_MS })
    expect(advanceClock(fresh, 1)).toBe(fresh)
    expect(advanceClock(fresh, STEPS * 10)).toBe(fresh)
    const noOp = noOpMove(fresh)
    if (noOp) expect(applyAiMove(fresh, noOp)).toBe(fresh)
    expect(timeAttackOutcome(fresh)).toBe('waiting')
  })

  it('a no-op move does not start the clock', () => {
    const fresh = timed(board([2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), { moves: 0 })
    const after = applyMove(fresh, 'LEFT')
    expect(after).toBe(fresh)
    expect(clockStarted(after)).toBe(false)
    expect(advanceClock(after, 100)).toBe(after)
    expect(timeAttackOutcome(after)).toBe('waiting')

    // The first valid move starts it.
    const moved = applyMove(after, 'RIGHT')
    expect(clockStarted(moved)).toBe(true)
    expect(moved.clock?.elapsedMs).toBe(0)
    expect(advanceClock(moved, 1).clock?.elapsedMs).toBe(CLOCK_STEP_MS)
    expect(timeAttackOutcome(moved)).toBe('playing')
  })

  it('advances only in whole fixed steps and reaches exactly 120,000 ms without overshoot', () => {
    let state = started()
    for (let i = 0; i < STEPS - 1; i++) state = advanceClock(state)
    expect(state.clock).toEqual({ elapsedMs: 119_990, limitMs: 120_000, timeUp: false })
    expect(state.status).toBe('playing')
    expect(timeLeftMs(state)).toBe(10)

    state = advanceClock(state)
    expect(state.clock).toEqual({ elapsedMs: 120_000, limitMs: 120_000, timeUp: true })
    expect(state.status).toBe('over')
    expect(timeLeftMs(state)).toBe(0)
    expect(timeAttackOutcome(state)).toBe('time-up')
  })

  it('stops exactly at the deadline when one advance spans it, however large', () => {
    const near = advanceClock(started(), STEPS - 3)
    expect(near.clock?.elapsedMs).toBe(119_970)
    for (const steps of [3, 4, 25, STEPS, 1_000_000]) {
      const after = advanceClock(near, steps)
      expect(after.clock).toEqual({ elapsedMs: 120_000, limitMs: 120_000, timeUp: true })
      expect(after.status).toBe('over')
    }
    // A huge gap from the very start cannot bypass the deadline either.
    expect(advanceClock(started(), Number.MAX_SAFE_INTEGER).clock?.elapsedMs).toBe(120_000)
  })

  it('accepts no move and no time after the time is up', () => {
    const over = advanceClock(started(), STEPS)
    for (const move of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as const) {
      expect(applyMove(over, move)).toBe(over)
      expect(applyAiMove(over, move)).toBe(over)
    }
    expect(advanceClock(over, 1)).toBe(over)
  })

  it('ends early, as stuck, when the board has no move left before the time is up', () => {
    const state = timed(board([2, 4, 2, 4], [4, 2, 4, 2], [64, 128, 64, 128], [8, 16, 32, 0]), {
      clock: { elapsedMs: 30_000, limitMs: TIME_ATTACK_MS, timeUp: false },
    })
    const after = applyMove(state, 'RIGHT')
    expect(legalMoves(after.board)).toEqual([])
    expect(after.status).toBe('over')
    expect(after.clock).toEqual({ elapsedMs: 30_000, limitMs: TIME_ATTACK_MS, timeUp: false })
    expect(timeAttackOutcome(after)).toBe('stuck')
    expect(timeLeftMs(after)).toBe(90_000)
    // The clock does not run on after a stuck end.
    expect(advanceClock(after, 100)).toBe(after)
  })

  it('reaching 2048 does not interrupt the run or the clock', () => {
    const state = timed(board([1024, 1024, 0, 0], [2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), {
      clock: { elapsedMs: 50_000, limitMs: TIME_ATTACK_MS, timeUp: false },
    })
    const after = applyMove(state, 'LEFT')
    expect(after.board).toContain(WINNING_TILE)
    expect(after.won).toBe(true)
    expect(after.status).toBe('playing')
    expect(asksToKeepGoing(after)).toBe(false)
    expect(timeAttackOutcome(after)).toBe('playing')
    expect(advanceClock(after, 100).clock?.elapsedMs).toBe(51_000)
    expect(applyMove(advanceClock(after, 1), legalMoves(after.board)[0]).moves).toBe(after.moves + 1)
  })

  it('each valid AI move costs exactly 250 ms of game time, and a no-op AI move costs none', () => {
    expect(AI_MOVE_GAME_MS).toBe(250)
    const fresh = timed(board([2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), { moves: 0 })
    expect(applyAiMove(fresh, 'LEFT')).toBe(fresh)

    const first = applyAiMove(fresh, 'RIGHT')
    expect(first.moves).toBe(1)
    expect(first.clock?.elapsedMs).toBe(250)
    const second = applyAiMove(first, legalMoves(first.board)[0])
    expect(second.clock?.elapsedMs).toBe(500)
    // The tiles are exactly a plain move's.
    expect(second.board).toEqual(applyMove(applyMove(fresh, 'RIGHT'), legalMoves(first.board)[0]).board)
  })

  it('an AI run times up after exactly 480 valid moves, at exactly 120,000 ms', () => {
    expect(TIME_ATTACK_MS / AI_MOVE_GAME_MS).toBe(480)
    const near = timed(board([2, 0, 0, 0], [4, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]), {
      moves: 479,
      clock: { elapsedMs: 479 * 250, limitMs: TIME_ATTACK_MS, timeUp: false },
    })
    const last = applyAiMove(near, 'RIGHT')
    expect(last.moves).toBe(480)
    expect(last.clock).toEqual({ elapsedMs: 120_000, limitMs: 120_000, timeUp: true })
    expect(last.status).toBe('over')

    // An AI move that would pass the deadline still stops it exactly there.
    const late = timed([...near.board], { moves: 400, clock: { elapsedMs: 119_900, limitMs: TIME_ATTACK_MS, timeUp: false } })
    expect(applyAiMove(late, 'RIGHT').clock?.elapsedMs).toBe(120_000)
  })
})

describe('Classic and Moves Limit are unchanged by Time Attack', () => {
  it('a Classic or Moves Limit state never carries a clock, and the clock functions leave it alone', () => {
    const classic = createGame2048(9)
    const moves = createGame2048(9, { moveLimit: MOVES_LIMIT })
    for (const state of [classic, moves]) {
      expect('clock' in state).toBe(false)
      const after = applyMove(state, legalMoves(state.board)[0])
      expect('clock' in after).toBe(false)
      expect(advanceClock(after, STEPS)).toBe(after)
      expect(applyAiMove(state, legalMoves(state.board)[0])).toEqual(after)
      expect(timeLeftMs(after)).toBeNull()
      expect(timeAttackOutcome(after)).toBeNull()
      expect(clockStarted(after)).toBe(false)
    }
    expect(asksToKeepGoing(classic)).toBe(true)
    expect(asksToKeepGoing(moves)).toBe(false)
    expect(movesLeft(moves)).toBe(MOVES_LIMIT)
    expect(moveLimitOutcome(classic)).toBeNull()
    expect(createGame2048(9, {})).toEqual(classic)
  })

  it('Classic plays the same moves to the same board as before', () => {
    let classic = createGame2048(11)
    let timedRun = createGame2048(11, { timeLimitMs: TIME_ATTACK_MS })
    for (let i = 0; i < 60 && classic.status === 'playing'; i++) {
      const move = legalMoves(classic.board)[0]
      classic = applyMove(classic, move)
      timedRun = advanceClock(applyMove(timedRun, move), 1)
    }
    expect(timedRun.board).toEqual(classic.board)
    expect(timedRun.score).toBe(classic.score)
    expect(timedRun.moves).toBe(classic.moves)
  })
})
