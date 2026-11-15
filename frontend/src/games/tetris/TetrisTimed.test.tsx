import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps } from '@/games/types'
import { createTetrisAi, type TetrisAI } from './ai/tetrisAi'
import TetrisGame from './TetrisGame'

// The same pieces in every game, so two games can be compared.
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 42,
}))

const press = (key: string) => fireEvent.keyDown(window, { key })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const resume = () => fireEvent.click(screen.getAllByRole('button', { name: 'Resume' })[0])
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const boardMarkup = () => screen.getByRole('img', { name: /tetris board/i }).outerHTML
const previews = () => screen.queryAllByRole('img', { name: /^[IOTSZJL] piece$/ })

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  act(() => void document.dispatchEvent(new Event('visibilitychange')))
}

function renderTimed(limitMs: number | null, ai?: GameProps<TetrisAI>['ai']) {
  const props = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  render(<TetrisGame {...props} ai={ai} timed={{ limitMs }} />)
  return props
}

beforeEach(() => {
  window.localStorage.clear()
  // The frame loop runs on animation frames; fake them with the clocks.
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'],
  })
})

afterEach(() => {
  vi.useRealTimers()
  delete (document as { hidden?: boolean }).hidden
})

describe('a timed game played by a person', () => {
  it('runs its gravity on the frame loop, not on a gravity timer', () => {
    renderTimed(null)
    click('Start')
    const spawned = boardMarkup()

    advance(700)
    expect(boardMarkup()).toBe(spawned)
    advance(300)
    expect(boardMarkup()).not.toBe(spawned)
  })

  it('does not advance while paused, and takes no input', () => {
    renderTimed(null)
    click('Start')
    advance(300)
    const beforePause = boardMarkup()

    press('p')
    press('ArrowLeft')
    press(' ')
    press('ArrowUp')
    advance(10_000)
    resume()

    expect(boardMarkup()).toBe(beforePause)
  })

  it('cannot reset its clock by pausing again and again', () => {
    renderTimed(null)
    click('Start')
    const spawned = boardMarkup()

    // Short stretches of play, each far shorter than a gravity step (800 ms), between pauses. They
    // add up: a clock that started afresh on every resume would never let the piece fall.
    for (let cycle = 0; cycle < 40; cycle++) {
      advance(48)
      press('p')
      advance(500)
      press('p')
    }

    expect(boardMarkup()).not.toBe(spawned)
  })

  it('hides the board and the next pieces while paused', () => {
    renderTimed(null)
    click('Start')
    expect(previews()).toHaveLength(3)

    press('p')

    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /tetris board/i })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Board hidden while paused' })).toBeInTheDocument()
    expect(previews()).toHaveLength(0)

    resume()
    expect(screen.getByRole('img', { name: /tetris board/i })).toBeInTheDocument()
    expect(previews()).toHaveLength(3)
  })

  it('pauses itself when the tab is hidden, and stays still until resumed', () => {
    renderTimed(null)
    click('Start')
    advance(300)
    const beforeHiding = boardMarkup()

    setHidden(true)
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /tetris board/i })).not.toBeInTheDocument()
    advance(10_000)

    setHidden(false)
    // Coming back does not resume by itself.
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    resume()
    expect(boardMarkup()).toBe(beforeHiding)
  })

  it('ends at exactly its limit and reports the game time once', () => {
    const { onGameStart, onGameOver } = renderTimed(2000)
    click('Start')

    advance(1900)
    expect(onGameOver).not.toHaveBeenCalled()
    advance(500)

    expect(screen.getByRole('heading', { name: /game over|new best/i })).toBeInTheDocument()
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0].metadata).toMatchObject({ gameMs: 2000, timeUp: 1, level: 1 })
  })

  it('takes no input once the run is over', () => {
    renderTimed(400)
    click('Start')
    advance(1000)
    const ended = boardMarkup()

    press('ArrowLeft')
    press(' ')
    advance(1000)

    expect(boardMarkup()).toBe(ended)
  })
})

describe('Classic is untouched', () => {
  it('runs no frame loop and does not pause itself when the tab is hidden', () => {
    const frames = vi.spyOn(window, 'requestAnimationFrame')
    render(<TetrisGame onGameStart={vi.fn()} onGameOver={vi.fn()} />)
    click('Start')
    advance(2000)

    setHidden(true)

    expect(frames).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Paused' })).not.toBeInTheDocument()
  })

  it('still shows the board and the next pieces while paused', () => {
    render(<TetrisGame onGameStart={vi.fn()} onGameOver={vi.fn()} />)
    click('Start')

    press('p')

    expect(screen.getByRole('img', { name: /tetris board/i })).toBeInTheDocument()
    expect(previews()).toHaveLength(3)
  })
})

describe('a timed game played by the AI', () => {
  /** Plays a timed AI game at a speed to its end; returns the final board. */
  function playAi(speed: string) {
    const props = renderTimed(2000, createTetrisAi)
    click('AI')
    if (speed !== '1x') fireEvent.click(screen.getByRole('radio', { name: speed }))
    return props
  }

  it('stops at the same limit and the same position at every speed, only sooner', () => {
    const slow = playAi('1x')
    advance(2100)
    expect(screen.getByRole('heading', { name: /game over/i })).toBeInTheDocument()
    const atOneX = boardMarkup()
    // AI runs are never reported: nothing ranked, nothing rewarded.
    expect(slow.onGameStart).not.toHaveBeenCalled()
    expect(slow.onGameOver).not.toHaveBeenCalled()

    document.body.innerHTML = ''
    const fast = playAi('8x')
    // 50 steps of 40 ms of game time at 8x: 250 ms of real time.
    advance(240)
    expect(screen.queryByRole('heading', { name: /game over/i })).not.toBeInTheDocument()
    advance(20)
    expect(screen.getByRole('heading', { name: /game over/i })).toBeInTheDocument()
    expect(boardMarkup()).toBe(atOneX)
    expect(fast.onGameStart).not.toHaveBeenCalled()
    expect(fast.onGameOver).not.toHaveBeenCalled()
  })
})
