import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps } from '@/games/types'
import { formatGameTime } from '@/lib/format'
import { createTetrisAi, type TetrisAI } from './ai/tetrisAi'
import TetrisGame from './TetrisGame'
import type { Cell, TetrisState } from './types/tetrisTypes'

// The same pieces in every game, so runs can be compared.
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 42,
}))

/**
 * Forty lines take a hundred pieces, more than a test can place by hand: while `nearGoal.on`, a new
 * Sprint game starts one line short, with a flat I over the gap in the bottom row, so a hard drop
 * finishes it. With `nearGoal.limitMs`, its clock ends sooner than five minutes (the real limit is
 * pinned in `tetrisSprint.test.ts`). Every other game (Classic, Ultra) is the real one.
 */
const nearGoal = vi.hoisted(() => ({ on: false, limitMs: null as number | null }))
vi.mock('./engine/tetrisEngine', async (importOriginal) => {
  const engine = await importOriginal<typeof import('./engine/tetrisEngine')>()
  const oneLineShort = (state: TetrisState): TetrisState => ({
    ...state,
    board: state.board.map((_, index): Cell => {
      const x = index % engine.WIDTH
      const y = Math.floor(index / engine.WIDTH)
      return y === engine.HEIGHT - 1 && (x < 3 || x > 6) ? 'O' : null
    }),
    lines: 39,
    level: 4,
    pieces: 100,
    piece: { type: 'I', rotation: 0, x: 3, y: -1 },
  })
  return {
    ...engine,
    createTetrisGame: (seed: number, timed?: Parameters<typeof engine.createTetrisGame>[1]) => {
      let state = engine.createTetrisGame(seed, timed)
      if (timed?.lineGoal === undefined || !state.clock) return state
      if (nearGoal.limitMs !== null) state = { ...state, clock: { ...state.clock, limitMs: nearGoal.limitMs } }
      return nearGoal.on ? oneLineShort(state) : state
    },
  }
})

const press = (key: string) => fireEvent.keyDown(window, { key })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const picker = () => screen.queryByRole('group', { name: 'Game mode' })
const stat = (label: string) => screen.getByText(label).parentElement?.textContent?.replace(label, '')
const heading = (name: string | RegExp) => screen.getByRole('heading', { name })

const ALL_MODES = ['classic', 'ultra', 'sprint']

function renderTetris(modes: readonly string[] = ALL_MODES, ai?: GameProps<TetrisAI>['ai']) {
  const props = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  const view = render(<TetrisGame {...props} modes={modes} ai={ai} />)
  return { ...props, view }
}

/** Hard-drops pieces until the stack tops out. */
function topOut() {
  for (let piece = 0; piece < 60 && screen.queryByRole('button', { name: 'Play again' }) === null; piece++) press(' ')
}

function startSprint() {
  click('Sprint')
  click('Start')
}

/** Starts a sprint one line short, plays `ms` of it, then clears the last line. */
function finishSprintAfter(ms: number) {
  nearGoal.on = true
  startSprint()
  advance(ms)
  press(' ')
}

beforeEach(() => {
  nearGoal.on = false
  nearGoal.limitMs = null
  window.localStorage.clear()
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('choosing Sprint', () => {
  it('is offered only while the server declares it', () => {
    const offered = (modes: readonly string[]) => {
      const { view } = renderTetris(modes)
      const choices = within(picker()!).getAllByRole('button').map((choice) => choice.textContent)
      view.unmount()
      return choices
    }
    expect(offered(ALL_MODES)).toEqual(['Classic', 'Ultra', 'Sprint'])
    expect(offered(['classic', 'sprint'])).toEqual(['Classic', 'Sprint'])
    expect(offered(['classic', 'ultra'])).toEqual(['Classic', 'Ultra'])
  })

  it('starts a Sprint run as a Sprint session, with the time and the lines to go', () => {
    const { onGameStart } = renderTetris()
    click('Sprint')

    expect(within(picker()!).getByRole('button', { name: 'Sprint' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/Clear 40 lines as fast as you can/)).toBeInTheDocument()
    expect(stat('Lines')).toBe('0/40')
    expect(stat('Time')).toBe('0:00.00')
    expect(stat('Pause left')).toBe('1:00')
    // Raced against the clock: no points, no countdown.
    expect(screen.queryByText('Score')).not.toBeInTheDocument()
    expect(screen.queryByText('Time left')).not.toBeInTheDocument()

    click('Start')
    press('ArrowLeft')
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameStart).toHaveBeenCalledWith('sprint')
    expect(picker()).not.toBeInTheDocument()
  })

  it('counts the game time up as it is played', () => {
    renderTetris()
    startSprint()

    advance(1100)
    expect(stat('Time')).toMatch(/^0:01\.\d\d$/)
    advance(60_000)
    expect(stat('Time')).toMatch(/^1:01\.\d\d$/)
  })
})

describe('a finished sprint', () => {
  it('stops at the 40th line and reports its game time as the score', () => {
    const { onGameOver } = renderTetris()
    finishSprintAfter(2000)

    expect(onGameOver).toHaveBeenCalledTimes(1)
    const { score, metadata } = onGameOver.mock.calls[0][0]
    expect(metadata).toEqual({ lines: 40, level: 5, pieces: 101, gameMs: score })
    expect(score % 40).toBe(0)
    expect(score).toBeGreaterThan(1800)
    expect(score).toBeLessThanOrEqual(2000)
    expect(heading('New best!')).toBeInTheDocument()
    expect(screen.getByText(`${formatGameTime(score)} is your fastest sprint yet.`)).toBeInTheDocument()
    expect(stat('Lines')).toBe('40/40')

    // The clock stopped with the clear.
    const time = stat('Time')
    advance(5000)
    expect(stat('Time')).toBe(time)
    expect(time).toBe(formatGameTime(score))
  })

  it('keeps the lowest time as its best on this device, apart from Classic and Ultra', () => {
    window.localStorage.setItem('cyan-arcade:high-score:tetris', '999999')
    window.localStorage.setItem('cyan-arcade:high-score:tetris-ultra', '5000')
    const { onGameOver } = renderTetris()
    finishSprintAfter(3000)
    const first = onGameOver.mock.calls[0][0].score
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris-sprint')).toBe(String(first))

    // Slower: finished, not a best.
    click('Play again')
    finishSprintAfter(5000)
    expect(heading('Finished!')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(`Your best is ${formatGameTime(first).replace('.', '\\.')}`))).toBeInTheDocument()

    // Faster: a new best.
    click('Play again')
    finishSprintAfter(1000)
    expect(heading('New best!')).toBeInTheDocument()
    const fastest = onGameOver.mock.calls[2][0].score
    expect(fastest).toBeLessThan(first)
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris-sprint')).toBe(String(fastest))

    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris')).toBe('999999')
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris-ultra')).toBe('5000')
  })
})

describe('a failed sprint', () => {
  it('reports nothing when it tops out before 40 lines', () => {
    const { onGameStart, onGameOver } = renderTetris()
    startSprint()
    advance(400)
    topOut()

    expect(heading('Topped out')).toBeInTheDocument()
    expect(screen.getByText(/Only a finished sprint is ranked, so this run was not saved/)).toBeInTheDocument()
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameOver).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris-sprint')).toBeNull()
  })

  it('times out at its limit of game time and reports nothing', () => {
    // A limit of four seconds in place of five minutes: the same clock, sooner.
    nearGoal.limitMs = 4_000
    const { onGameOver } = renderTetris()
    startSprint()
    advance(3_000)
    expect(screen.queryByRole('button', { name: 'Play again' })).not.toBeInTheDocument()
    advance(2_000)

    expect(heading("Time's up!")).toBeInTheDocument()
    expect(stat('Time')).toBe('0:04.00')
    expect(screen.getByText(/You cleared 0 of 40 lines\. Only a finished sprint is ranked/)).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
  })
})

describe("a sprint's pause allowance", () => {
  it('hides the board and the next pieces while paused, and counts the pause', () => {
    renderTetris()
    startSprint()
    advance(2100)

    press('p')
    expect(screen.getByRole('img', { name: 'Board hidden while paused' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /tetris board/i })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('img', { name: / piece$/ })).toHaveLength(0)
    advance(10_000)
    expect(screen.getByText(/Pause time left/)).toHaveTextContent('Pause time left: 0:50')
  })

  it('submits a sprint finished after a pause within the allowance', () => {
    const { onGameOver } = renderTetris()
    nearGoal.on = true
    startSprint()
    press('p')
    advance(50_000)
    press('p')
    advance(500)
    press(' ')

    expect(onGameOver).toHaveBeenCalledTimes(1)
  })

  it('never submits a sprint that used it up, even a finished one', () => {
    const { onGameOver } = renderTetris()
    nearGoal.on = true
    startSprint()
    press('p')
    advance(61_000)
    expect(screen.getByRole('alert')).toHaveTextContent(/now unranked/)
    press('p')
    press(' ')

    expect(heading('Unranked run')).toBeInTheDocument()
    expect(screen.getByText(/You cleared 40 lines in .* It paused for more than a minute/)).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
  })
})

describe('Sprint played by the AI', () => {
  it('races to the 40th line, and never starts or reports a run', () => {
    const { onGameStart, onGameOver } = renderTetris(ALL_MODES, createTetrisAi)
    click('Sprint')
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))

    // At 8x, five minutes of game time take under 40 s.
    advance(40_000)

    // It takes the clear that finishes the race (once, it shied away from it as from a top-out).
    expect(heading('Finished!')).toBeInTheDocument()
    expect(stat('Lines')).toMatch(/^4[0-3]\/40$/)
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('takes the last line when one is left', () => {
    const { onGameStart, onGameOver } = renderTetris(ALL_MODES, createTetrisAi)
    nearGoal.on = true
    click('Sprint')
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))
    advance(10_000)

    expect(heading('Finished!')).toBeInTheDocument()
    expect(stat('Lines')).toBe('40/40')
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })
})

describe('Classic and Ultra beside Sprint', () => {
  it('leaves a Classic run reported by its points, as before', () => {
    const { onGameStart, onGameOver } = renderTetris()
    click('Start')
    topOut()

    expect(onGameStart).toHaveBeenCalledWith()
    const { score, metadata } = onGameOver.mock.calls[0][0]
    expect(score).toBeGreaterThan(0)
    expect(metadata).toEqual({ lines: expect.any(Number), level: expect.any(Number), pieces: expect.any(Number) })
  })

  it('leaves an Ultra run reported with its two-minute clock, as before', () => {
    const { onGameStart, onGameOver } = renderTetris()
    click('Ultra')
    click('Start')
    advance(400)
    topOut()

    expect(onGameStart).toHaveBeenCalledWith('ultra')
    expect(onGameOver.mock.calls[0][0].metadata).toMatchObject({ timeUp: 0 })
    expect(stat('Time left')).toBeDefined()
  })
})

describe('game times', () => {
  it('read in minutes, seconds and hundredths', () => {
    expect(formatGameTime(0)).toBe('0:00.00')
    expect(formatGameTime(48_120)).toBe('0:48.12')
    expect(formatGameTime(65_040)).toBe('1:05.04')
    expect(formatGameTime(299_960)).toBe('4:59.96')
    expect(formatGameTime(300_000)).toBe('5:00.00')
  })
})
