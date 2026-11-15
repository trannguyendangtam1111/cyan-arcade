import { act, render } from '@testing-library/react'
import { useCallback, useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiActionDelay, type AiSpeed } from '@/games/shared/ai'
import { useEngine } from '@/games/shared/useEngine'
import { MAX_FRAME_MS } from '@/games/shared/useFrameLoop'
import { useTicker } from '@/games/shared/useTicker'
import { createGame2048Ai } from '../ai/game2048Ai'
import {
  AI_MOVE_GAME_MS,
  CLOCK_STEP_MS,
  TIME_ATTACK_MS,
  advanceClock,
  applyAiMove,
  applyMove,
  clockStarted,
  createGame2048,
  legalMoves,
  timeLeftMs,
  type Game2048State,
  type Move,
} from '../engine/game2048Engine'
import { clockStepsDue } from './timeAttackClock'
import { useTimeAttackClock } from './useTimeAttackClock'

// Animation frames are run by hand, each at a chosen time, so every frame's length is exact.
let frames = new Map<number, FrameRequestCallback>()
let nextFrameId = 1
const realRaf = window.requestAnimationFrame
const realCancel = window.cancelAnimationFrame

function frameAt(now: number) {
  act(() => {
    const due = [...frames.values()]
    frames = new Map()
    due.forEach((callback) => callback(now))
  })
}

/** Runs frames every `everyMs` from `from` (exclusive) up to `to` (inclusive). */
function framesBetween(from: number, to: number, everyMs = 16) {
  for (let now = from + everyMs; now <= to; now += everyMs) frameAt(now)
  if ((to - from) % everyMs !== 0) frameAt(to)
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

beforeEach(() => {
  frames = new Map()
  window.requestAnimationFrame = (callback) => {
    const id = nextFrameId++
    frames.set(id, callback)
    return id
  }
  window.cancelAnimationFrame = (id) => {
    frames.delete(id)
  }
})

afterEach(() => {
  window.requestAnimationFrame = realRaf
  window.cancelAnimationFrame = realCancel
  delete (document as { hidden?: boolean }).hidden
})

interface Probe {
  state: Game2048State
  paused: boolean
  boardHidden: boolean
  hiddenCalls: number
  move: (move: Move) => void
  setPaused: (paused: boolean) => void
}

/** A human Time Attack run wired the way the game will wire it: on the clock once started. */
function TimedRun({ seed, report }: { seed: number; report: (probe: Probe) => void }) {
  const [state, setState] = useState(() => createGame2048(seed, { timeLimitMs: TIME_ATTACK_MS }))
  const [paused, setPaused] = useState(false)
  const [hiddenCalls, setHiddenCalls] = useState(0)
  const clock = useTimeAttackClock({
    active: clockStarted(state) && state.status === 'playing',
    paused,
    onSteps: (steps) => setState((current) => advanceClock(current, steps)),
    onHidden: () => {
      setHiddenCalls((n) => n + 1)
      setPaused(true)
    },
  })
  const move = useCallback((next: Move) => setState((current) => applyMove(current, next)), [])
  const pause = useCallback((next: boolean) => setPaused(next), [])
  useEffect(() => {
    report({ state, paused, boardHidden: clock.boardHidden, hiddenCalls, move, setPaused: pause })
  })
  return null
}

function mount(seed = 7) {
  const p = {} as Probe
  render(
    <TimedRun
      seed={seed}
      report={(latest) => {
        Object.assign(p, latest)
      }}
    />,
  )
  const firstMove = () => act(() => p.move(legalMoves(p.state.board)[0]))
  return { p, firstMove }
}

const elapsed = (p: Probe) => p.state.clock?.elapsedMs ?? 0

describe('clockStepsDue', () => {
  it('plays whole steps and carries the remainder, never more game time than real time', () => {
    expect(clockStepsDue(0, 16)).toEqual({ steps: 1, pendingMs: 6 })
    expect(clockStepsDue(6, 16)).toEqual({ steps: 2, pendingMs: 2 })
    expect(clockStepsDue(9, 0.5)).toEqual({ steps: 0, pendingMs: 9.5 })
    expect(clockStepsDue(3, -50)).toEqual({ steps: 0, pendingMs: 3 })

    // The same real time gives the same game time at any frame rate.
    for (const frameMs of [7, 16, 16.7, 33, 100]) {
      let pending = 0
      let steps = 0
      let real = 0
      while (real < 6000) {
        const due = clockStepsDue(pending, frameMs)
        pending = due.pendingMs
        steps += due.steps
        real += frameMs
      }
      expect(steps * CLOCK_STEP_MS).toBeLessThanOrEqual(real + 1e-9)
      expect(real - steps * CLOCK_STEP_MS).toBeLessThan(CLOCK_STEP_MS)
    }
  })
})

describe('useTimeAttackClock', () => {
  it('does not run before the first valid move, then plays real time as game time', () => {
    const { p, firstMove } = mount()
    frameAt(0)
    framesBetween(0, 5000)
    expect(elapsed(p)).toBe(0)
    expect(frames.size).toBe(0)

    firstMove()
    frameAt(10_000) // the loop's first frame counts nothing
    framesBetween(10_000, 13_000)
    expect(elapsed(p)).toBe(3000)
    expect(timeLeftMs(p.state)).toBe(117_000)
  })

  it('a large frame gap is capped and cannot jump the clock ahead', () => {
    const { p, firstMove } = mount()
    firstMove()
    frameAt(0)
    frameAt(60_000) // one stalled frame of a minute
    expect(elapsed(p)).toBe(MAX_FRAME_MS)
  })

  it('ends exactly at 120,000 ms when a frame spans the deadline, and stops the loop', () => {
    const { p, firstMove } = mount()
    firstMove()
    frameAt(0)
    framesBetween(0, 119_950, 100)
    expect(elapsed(p)).toBe(119_950)
    frameAt(119_950 + MAX_FRAME_MS) // spans the deadline by 50 ms
    expect(p.state.clock).toEqual({ elapsedMs: 120_000, limitMs: 120_000, timeUp: true })
    expect(p.state.status).toBe('over')
    expect(frames.size).toBe(0)

    // No move is accepted after the time is up.
    const over = p.state
    act(() => p.move(legalMoves(over.board)[0] ?? 'UP'))
    expect(p.state).toBe(over)
  })

  it('pause hides the board and keeps the remaining time; resume carries on from it', () => {
    const { p, firstMove } = mount()
    firstMove()
    frameAt(0)
    framesBetween(0, 2000)
    expect(elapsed(p)).toBe(2000)
    expect(p.boardHidden).toBe(false)

    act(() => p.setPaused(true))
    expect(p.boardHidden).toBe(true)
    expect(frames.size).toBe(0)
    framesBetween(2000, 30_000)
    expect(elapsed(p)).toBe(2000)
    expect(timeLeftMs(p.state)).toBe(118_000)

    act(() => p.setPaused(false))
    expect(p.boardHidden).toBe(false)
    frameAt(30_000) // the paused gap is not counted
    framesBetween(30_000, 31_000)
    expect(elapsed(p)).toBe(3000)
  })

  it('hiding the tab pauses the run and gives it no game time, until the player resumes', () => {
    const { p, firstMove } = mount()
    firstMove()
    frameAt(0)
    framesBetween(0, 1000)
    expect(elapsed(p)).toBe(1000)

    setHidden(true)
    expect(p.hiddenCalls).toBe(1)
    expect(p.paused).toBe(true)
    expect(p.boardHidden).toBe(true)
    expect(frames.size).toBe(0)
    framesBetween(1000, 90_000)
    expect(elapsed(p)).toBe(1000)

    // Back on the tab, the run stays paused with its board hidden.
    setHidden(false)
    expect(p.paused).toBe(true)
    expect(p.boardHidden).toBe(true)
    framesBetween(90_000, 95_000)
    expect(elapsed(p)).toBe(1000)

    act(() => p.setPaused(false))
    frameAt(95_000)
    framesBetween(95_000, 96_000)
    expect(elapsed(p)).toBe(2000)
  })

  it('a tab hidden while the player already paused gives no time either', () => {
    const { p, firstMove } = mount()
    firstMove()
    act(() => p.setPaused(true))
    setHidden(true)
    expect(p.hiddenCalls).toBe(0)
    act(() => p.setPaused(false))
    expect(p.boardHidden).toBe(true)
    expect(frames.size).toBe(0)
    framesBetween(0, 10_000)
    expect(elapsed(p)).toBe(0)
  })

  it('does not run, hide or pause anything before the clock has started', () => {
    const { p } = mount()
    setHidden(true)
    expect(p.hiddenCalls).toBe(0)
    expect(p.paused).toBe(false)
    setHidden(false)
    expect(p.boardHidden).toBe(false)
  })
})

/** The AI playing a timed run through the ticker at its real playback delay; frames play no part. */
function AiRun({ seed, speed, onState }: { seed: number; speed: AiSpeed; onState: (s: Game2048State) => void }) {
  const [ai] = useState(createGame2048Ai)
  const { state, dispatch, getState } = useEngine(
    () => createGame2048(seed, { timeLimitMs: TIME_ATTACK_MS }),
    applyAiMove,
  )
  useTicker(() => dispatch(ai.getNextAction(getState())), state.status === 'playing' ? aiActionDelay(320, speed) : null)
  useEffect(() => onState(state))
  return null
}

describe('AI game time', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function playAi(speed: AiSpeed, aiMoves: number) {
    let latest: Game2048State | undefined
    const view = render(<AiRun seed={21} speed={speed} onState={(s) => {
          latest = s
        }} />)
    act(() => {
      vi.advanceTimersByTime(aiActionDelay(320, speed) * aiMoves)
    })
    view.unmount()
    return latest as Game2048State
  }

  it('is identical at every playback speed: 250 ms per valid move', () => {
    const slow = playAi(1, 40)
    const fast = playAi(8, 40)
    expect(slow.moves).toBe(40)
    expect(fast.moves).toBe(40)
    expect(slow.clock?.elapsedMs).toBe(40 * AI_MOVE_GAME_MS)
    expect(fast.clock).toEqual(slow.clock)
    expect(fast.board).toEqual(slow.board)
    expect(fast.score).toBe(slow.score)
    // Real time differed eightfold; game time did not.
    expect(aiActionDelay(320, 1) * 40).toBe(8 * aiActionDelay(320, 8) * 40)
  })
})
