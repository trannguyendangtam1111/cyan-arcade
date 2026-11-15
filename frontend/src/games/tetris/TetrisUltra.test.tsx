import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps } from '@/games/types'
import { createTetrisAi, type TetrisAI } from './ai/tetrisAi'
import { formatClock } from './modes'
import TetrisGame from './TetrisGame'

// The same pieces in every game, so runs can be compared.
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 42,
}))

const press = (key: string) => fireEvent.keyDown(window, { key })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const picker = () => screen.queryByRole('group', { name: 'Game mode' })
const stat = (label: string) => screen.getByText(label).parentElement?.textContent?.replace(label, '')
const timeLeft = () => stat('Time left')

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  act(() => void document.dispatchEvent(new Event('visibilitychange')))
}

function renderTetris(modes?: readonly string[], ai?: GameProps<TetrisAI>['ai']) {
  const props = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  const view = render(<TetrisGame {...props} modes={modes} ai={ai} />)
  return { ...props, view }
}

/** A session the test answers when it chooses, as the platform's `currentSession` gives it. */
function pendingSession() {
  let resolve!: () => void
  let reject!: () => void
  const promise = new Promise<{ id: string }>((done, fail) => {
    resolve = () => done({ id: 'session-1' })
    reject = () => fail(new Error('offline'))
  })
  promise.catch(() => undefined)
  return { promise, resolve: () => act(async () => resolve()), reject: () => act(async () => reject()) }
}

/** Renders Tetris with Ultra offered and each run's session answered by the test. */
function renderWithSessions(...sessions: ReturnType<typeof pendingSession>[]) {
  const props = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  // Like the platform: the session of the run started last, once one has started.
  const currentSession = () => sessions[props.onGameStart.mock.calls.length - 1]?.promise
  render(<TetrisGame {...props} modes={['classic', 'ultra']} currentSession={currentSession} />)
  return props
}

const boardMarkup = () => screen.getByRole('img', { name: /tetris board/i }).outerHTML

/** Hard-drops pieces until the stack tops out. */
function topOut() {
  for (let piece = 0; piece < 60 && screen.queryByRole('button', { name: 'Play again' }) === null; piece++) press(' ')
}

/**
 * Plays on for `ms` without dropping anything: every few seconds the falling piece is moved to the
 * left, right or middle, so gravity spreads the stack instead of topping out in the middle.
 */
function survive(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 4000) {
    const turn = Math.floor(elapsed / 16_000) % 3
    for (let move = 0; move < 5 && turn > 0; move++) press(turn === 1 ? 'ArrowLeft' : 'ArrowRight')
    advance(Math.min(4000, ms - elapsed))
  }
}

/** Chooses Ultra and starts the run. */
function startUltra() {
  click('Ultra')
  click('Start')
}

beforeEach(() => {
  window.localStorage.clear()
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'],
  })
})

afterEach(() => {
  vi.useRealTimers()
  delete (document as { hidden?: boolean }).hidden
})

describe('choosing the mode', () => {
  it('offers no choice while the server declares Classic alone, or nothing yet', () => {
    for (const modes of [undefined, ['classic']]) {
      const { view, onGameStart } = renderTetris(modes)
      expect(picker()).not.toBeInTheDocument()
      expect(screen.queryByText('Time left')).not.toBeInTheDocument()

      click('Start')
      // A Classic session: the run is reported without a mode.
      expect(onGameStart).toHaveBeenCalledWith()
      view.unmount()
    }
  })

  it('offers Classic and Ultra when the server declares Ultra, Classic chosen', () => {
    renderTetris(['classic', 'ultra'])

    const choices = within(picker()!).getAllByRole('button')
    expect(choices.map((choice) => choice.textContent)).toEqual(['Classic', 'Ultra'])
    expect(within(picker()!).getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('Time left')).not.toBeInTheDocument()
  })

  it('starts an Ultra run as an Ultra session, once, with two minutes on the clock', () => {
    const { onGameStart } = renderTetris(['classic', 'ultra'])
    click('Ultra')

    expect(within(picker()!).getByRole('button', { name: 'Ultra' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/two minutes/)).toBeInTheDocument()
    expect(timeLeft()).toBe('2:00')

    click('Start')
    press('ArrowLeft')
    press(' ')
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameStart).toHaveBeenCalledWith('ultra')
    // The mode is fixed for the run: no choice while it is played.
    expect(picker()).not.toBeInTheDocument()
  })

  it('starts an Ultra run from the keyboard as Ultra too', () => {
    const { onGameStart } = renderTetris(['classic', 'ultra'])
    click('Ultra')

    press('ArrowLeft')
    expect(onGameStart).toHaveBeenCalledWith('ultra')
  })

  it('keeps the choice for the next run, and Classic stays Classic', () => {
    const { onGameStart } = renderTetris(['classic', 'ultra'])
    startUltra()
    advance(121_000)
    click('Play again')

    expect(within(picker()!).getByRole('button', { name: 'Ultra' })).toHaveAttribute('aria-pressed', 'true')
    click('Classic')
    click('Start')
    expect(onGameStart.mock.calls).toEqual([['ultra'], []])
    expect(screen.queryByText('Time left')).not.toBeInTheDocument()
  })
})

describe('an Ultra run', () => {
  it('counts down two minutes of game time and ends exactly at the limit', () => {
    const { onGameOver } = renderTetris(['classic', 'ultra'])
    startUltra()

    // Game time follows real time a frame behind, and the clock rounds up.
    advance(1100)
    expect(timeLeft()).toBe('1:59')
    survive(118_000)
    expect(timeLeft()).toBe('0:01')
    expect(onGameOver).not.toHaveBeenCalled()

    advance(1000)
    expect(timeLeft()).toBe('0:00')
    expect(onGameOver).toHaveBeenCalledTimes(1)
    const { metadata } = onGameOver.mock.calls[0][0]
    expect(metadata).toEqual({
      lines: expect.any(Number),
      level: expect.any(Number),
      pieces: expect.any(Number),
      gameMs: 120_000,
      timeUp: 1,
    })
    expect(metadata.pieces).toBeGreaterThanOrEqual(6)
  })

  it('reports an early top-out as such, with the game time it lasted', () => {
    const { onGameOver } = renderTetris(['classic', 'ultra'])
    startUltra()
    advance(400)

    for (let piece = 0; piece < 60 && onGameOver.mock.calls.length === 0; piece++) press(' ')

    expect(onGameOver).toHaveBeenCalledTimes(1)
    const { metadata } = onGameOver.mock.calls[0][0]
    expect(metadata.timeUp).toBe(0)
    // The game time played before it, in whole steps: never more than the real time.
    expect(metadata.gameMs % 40).toBe(0)
    expect(metadata.gameMs).toBeGreaterThan(0)
    expect(metadata.gameMs).toBeLessThanOrEqual(400)
  })

  it('shows the time and pause left while paused, with the board hidden', () => {
    renderTetris(['classic', 'ultra'])
    startUltra()
    advance(5100)

    press('p')
    expect(screen.getByRole('img', { name: 'Board hidden while paused' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /tetris board/i })).not.toBeInTheDocument()
    expect(screen.getByText(/Pause time left/)).toHaveTextContent('Pause time left: 1:00')
    expect(timeLeft()).toBe('1:55')

    advance(10_000)
    expect(screen.getByText(/Pause time left/)).toHaveTextContent('Pause time left: 0:50')
    expect(timeLeft()).toBe('1:55')
  })

  it('adds up every pause, and warns once the allowance is used up', () => {
    renderTetris(['classic', 'ultra'])
    startUltra()

    press('p')
    advance(40_000)
    press('p')
    advance(3_000)
    press('p')
    expect(screen.getByText(/Pause time left/)).toHaveTextContent('Pause time left: 0:20')

    advance(21_000)
    expect(screen.getByRole('alert')).toHaveTextContent(/now unranked/)
  })

  it('pauses on a hidden tab and counts that time against the allowance', () => {
    renderTetris(['classic', 'ultra'])
    startUltra()
    advance(2100)

    setHidden(true)
    advance(30_000)
    setHidden(false)

    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    expect(screen.getByText(/Pause time left/)).toHaveTextContent('Pause time left: 0:30')
    expect(timeLeft()).toBe('1:58')
  })

  it('keeps its best apart from Classic', () => {
    renderTetris(['classic', 'ultra'])
    window.localStorage.setItem('cyan-arcade:high-score:tetris', '999999')
    startUltra()
    // A few hard drops, for points.
    press(' ')
    press(' ')
    advance(121_000)

    expect(screen.getByRole('heading', { name: 'New best!' })).toBeInTheDocument()
    expect(window.localStorage.getItem('cyan-arcade:high-score:tetris')).toBe('999999')
  })
})

describe('Ultra played by the AI', () => {
  it('plays the same two minutes, and never starts or reports a run', () => {
    const { onGameStart, onGameOver } = renderTetris(['classic', 'ultra'], createTetrisAi)
    click('Ultra')
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))

    // 3,000 steps of 40 ms of game time at 8x.
    advance(16_000)

    expect(screen.getByRole('heading', { name: /game over|time's up/i })).toBeInTheDocument()
    expect(timeLeft()).toBe('0:00')
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })
})

describe('the clock', () => {
  it('reads in minutes and seconds, rounded up', () => {
    expect(formatClock(120_000)).toBe('2:00')
    expect(formatClock(119_960)).toBe('2:00')
    expect(formatClock(59_001)).toBe('1:00')
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-500)).toBe('0:00')
  })
})

describe('an Ultra run and its server session', () => {
  it('starts its clock only once the server has opened the session, taking no input before', async () => {
    const session = pendingSession()
    const { onGameStart } = renderWithSessions(session)
    startUltra()

    expect(screen.getByRole('heading', { name: 'Starting…' })).toBeInTheDocument()
    const waiting = boardMarkup()
    press('ArrowLeft')
    press(' ')
    press('Enter')
    press('p')
    advance(30_000)
    // A cold server can take this long: nothing has moved, nothing has been played.
    expect(timeLeft()).toBe('2:00')
    expect(boardMarkup()).toBe(waiting)
    expect(screen.queryByRole('heading', { name: 'Paused' })).not.toBeInTheDocument()
    // One session for the run, however many inputs while waiting.
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameStart).toHaveBeenCalledWith('ultra')

    await session.resolve()
    expect(screen.queryByRole('heading', { name: 'Starting…' })).not.toBeInTheDocument()
    advance(1100)
    expect(timeLeft()).toBe('1:59')
    // The wait was not counted against the pause allowance.
    expect(stat('Pause left')).toBe('1:00')
  })

  it('says so when the session cannot be opened, and a new try opens a new one', async () => {
    const failing = pendingSession()
    const next = pendingSession()
    const { onGameStart, onGameOver } = renderWithSessions(failing, next)
    startUltra()

    await failing.reject()
    expect(screen.getByRole('heading', { name: "Couldn't start the run" })).toBeInTheDocument()
    advance(5000)
    expect(timeLeft()).toBe('2:00')
    expect(onGameStart).toHaveBeenCalledTimes(1)

    click('Try again')
    expect(within(picker()!).getByRole('button', { name: 'Ultra' })).toHaveAttribute('aria-pressed', 'true')
    click('Start')
    expect(onGameStart).toHaveBeenCalledTimes(2)
    await next.resolve()
    advance(1100)
    expect(timeLeft()).toBe('1:59')
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('ignores the answer for a run abandoned while waiting', async () => {
    const abandoned = pendingSession()
    const next = pendingSession()
    renderWithSessions(abandoned, next)
    startUltra()
    click('Restart')
    click('Start')

    // The first run's session arrives late: it must not start the second run's clock.
    await abandoned.resolve()
    advance(2000)
    expect(timeLeft()).toBe('2:00')
    expect(screen.getByRole('heading', { name: 'Starting…' })).toBeInTheDocument()

    await next.resolve()
    advance(1100)
    expect(timeLeft()).toBe('1:59')
  })

  it('leaves Classic as it was: it never waits for its session', () => {
    const session = pendingSession()
    renderWithSessions(session)
    click('Start')
    const spawned = boardMarkup()

    expect(screen.queryByRole('heading', { name: 'Starting…' })).not.toBeInTheDocument()
    advance(1000)
    expect(boardMarkup()).not.toBe(spawned)
  })
})

describe("an Ultra run's pause allowance", () => {
  it('warns in time, while the run can still be kept ranked', () => {
    renderTetris(['classic', 'ultra'])
    startUltra()

    press('p')
    advance(44_000)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    advance(2_000)
    expect(screen.getByRole('alert')).toHaveTextContent('Resume within 0:14 to keep this run ranked.')
  })

  it('submits a run that paused within the allowance', () => {
    const { onGameOver } = renderTetris(['classic', 'ultra'])
    startUltra()
    press('p')
    advance(50_000)
    press('p')

    topOut()

    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(stat('Pause left')).not.toBe('Unranked')
  })

  it('turns a run that used it up into an unranked one, played on and never submitted', () => {
    const { onGameStart, onGameOver } = renderTetris(['classic', 'ultra'])
    startUltra()
    press('p')
    advance(61_000)

    expect(screen.getByRole('alert')).toHaveTextContent(/now unranked/)
    press('p')
    expect(stat('Pause left')).toBe('Unranked')
    // Pausing again or for less does not make it ranked again.
    press('p')
    advance(1000)
    press('p')
    expect(stat('Pause left')).toBe('Unranked')

    topOut()

    expect(screen.getByRole('heading', { name: 'Unranked run' })).toBeInTheDocument()
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameOver).not.toHaveBeenCalled()

    // The next run is ranked again.
    click('Play again')
    click('Start')
    expect(stat('Pause left')).toBe('1:00')
  })
})
