import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentType } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Game2048 from './2048/Game2048'
import SnakeGame from './snake/SnakeGame'
import TetrisGame from './tetris/TetrisGame'
import type { GameProps } from './types'

// Fixed seed: every game in this file starts from the same position, so runs can be compared.
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 1234,
}))

/**
 * Behaviour every game must share: Human/AI modes on one engine, AI playback that really plays,
 * speed control, pause/resume, restart, and no timers left behind.
 *
 * `progress` names a stat that goes up as the AI plays; `oneX` is the AI's action delay at 1x.
 */
const games: { name: string; Game: ComponentType<GameProps>; progress: string; oneX: number }[] = [
  { name: 'Snake', Game: SnakeGame, progress: 'Moves', oneX: 140 },
  { name: '2048', Game: Game2048, progress: 'Moves', oneX: 320 },
  { name: 'Tetris', Game: TetrisGame, progress: 'Score', oneX: 120 },
]

/** How long one Snake step takes for a human at level 1. */
const SNAKE_STEP = 150

const stat = (label: string) => Number(screen.getByText(label).nextElementSibling?.textContent)
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const press = (key: string) => fireEvent.keyDown(window, { key })
const board = () => screen.getByRole('img', { name: /board/i })
/** The board's description: comparable between separate renders. */
const boardLabel = () => board().getAttribute('aria-label')
/** Everything drawn on the board: changes whenever anything on it moves. */
const boardMarkup = () => board().outerHTML

function renderGame(Game: ComponentType<GameProps>, handlers: Partial<GameProps> = {}) {
  return render(<Game onGameStart={vi.fn()} onGameOver={vi.fn()} {...handlers} />)
}

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
})
afterEach(() => vi.useRealTimers())

describe.each(games)('$name play modes', ({ Game, progress, oneX }) => {
  it('starts in Human mode and does nothing until the player acts', () => {
    const onGameStart = vi.fn()
    renderGame(Game, { onGameStart })
    const initial = boardMarkup()

    expect(screen.getByRole('button', { name: 'Human' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('region', { name: 'AI mode' })).not.toBeInTheDocument()
    advance(5000)
    expect(boardMarkup()).toBe(initial)
    expect(onGameStart).not.toHaveBeenCalled()
  })

  it('plays by itself as soon as AI mode is selected', () => {
    renderGame(Game)
    click('AI')

    expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('AI playing')
    advance(oneX * 30)

    expect(stat(progress)).toBeGreaterThan(0)
    expect(screen.getByText(/^AI → /)).toBeInTheDocument()
  })

  it('ignores human controls while the AI is playing', () => {
    renderGame(Game)
    click('AI')
    click('Pause AI')
    const before = boardMarkup()

    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd', 'z', 'x']) press(key)
    advance(oneX * 5)

    expect(boardMarkup()).toBe(before)
  })

  it('pauses and resumes the AI', () => {
    renderGame(Game)
    click('AI')
    advance(oneX * 10)

    click('Pause AI')
    expect(screen.getByRole('status')).toHaveTextContent('AI paused')
    const paused = boardMarkup()
    advance(oneX * 30)
    expect(boardMarkup()).toBe(paused)
    expect(vi.getTimerCount()).toBe(0)

    click('Resume AI')
    advance(oneX * 30)
    expect(boardMarkup()).not.toBe(paused)
  })

  it('plays faster at a higher speed', () => {
    renderGame(Game)
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))

    expect(screen.getByRole('radio', { name: '8x' })).toHaveAttribute('aria-checked', 'true')
    // One action at 1x takes `oneX` ms; at 8x, eight actions fit in the same time.
    advance(oneX * 5)
    const fast = stat(progress)

    click('Restart')
    fireEvent.click(screen.getByRole('radio', { name: '1x' }))
    advance(oneX * 5)

    expect(fast).toBeGreaterThan(stat(progress))
  })

  it('makes exactly the same decisions at every speed', () => {
    // 40 actions at 1x ...
    const slow = renderGame(Game)
    click('AI')
    advance(oneX * 40)
    const atNormalSpeed = boardLabel()
    slow.unmount()

    // ... and the same 40 actions at 4x must lead to the identical position.
    renderGame(Game)
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '4x' }))
    advance((oneX / 4) * 40)

    expect(boardLabel()).toBe(atNormalSpeed)
  })

  it('restarts from a fresh game and keeps playing', () => {
    renderGame(Game)
    click('AI')
    advance(oneX * 40)

    click('Restart')
    expect(stat(progress)).toBe(0)
    advance(oneX * 40)
    expect(stat(progress)).toBeGreaterThan(0)
  })

  it('starts a fresh game when switching back to Human mode', () => {
    renderGame(Game)
    click('AI')
    advance(oneX * 40)

    click('Human')

    expect(stat('Score')).toBe(0)
    expect(screen.queryByRole('region', { name: 'AI mode' })).not.toBeInTheDocument()
    const fresh = boardMarkup()
    advance(oneX * 40)
    expect(boardMarkup()).toBe(fresh)
  })

  it('does not report AI runs to the platform', () => {
    const onGameStart = vi.fn()
    const onGameOver = vi.fn()
    renderGame(Game, { onGameStart, onGameOver })
    click('AI')
    advance(oneX * 40)

    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('reports a human run once, even when several inputs arrive before the screen updates', () => {
    const onGameStart = vi.fn()
    renderGame(Game, { onGameStart })

    // One `act` means no re-render between the key presses, like fast typing within one frame.
    act(() => {
      press('ArrowDown')
      press('ArrowLeft')
      press('ArrowDown')
    })

    expect(onGameStart).toHaveBeenCalledTimes(1)
  })

  it('leaves no timers running after the game is unmounted', () => {
    const { unmount } = renderGame(Game)
    click('AI')
    advance(oneX * 10)
    expect(vi.getTimerCount()).toBe(1)

    unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('Snake in Human mode', () => {
  it('waits for the first key, then moves with the arrow keys', () => {
    renderGame(SnakeGame)
    expect(screen.getByRole('heading', { name: 'Ready?' })).toBeInTheDocument()
    expect(boardLabel()).toContain('Head at column 9, row 9.')

    press('ArrowUp')
    advance(SNAKE_STEP * 3)

    expect(screen.queryByRole('heading', { name: 'Ready?' })).not.toBeInTheDocument()
    expect(boardLabel()).toContain('Head at column 9, row 6.')
  })

  it('also steers with WASD', () => {
    renderGame(SnakeGame)

    press('s')
    advance(SNAKE_STEP * 2)
    press('a')
    advance(SNAKE_STEP)

    expect(boardLabel()).toContain('Head at column 8, row 11.')
  })

  it('reports the start of a run once, on the first input', () => {
    const onGameStart = vi.fn()
    renderGame(SnakeGame, { onGameStart })

    press('ArrowUp')
    press('ArrowLeft')
    advance(SNAKE_STEP * 2)

    expect(onGameStart).toHaveBeenCalledTimes(1)
  })

  it('pauses with P and resumes', () => {
    renderGame(SnakeGame)
    press('ArrowUp')
    advance(SNAKE_STEP)

    press('p')
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    advance(SNAKE_STEP * 5)
    expect(boardLabel()).toContain('row 8.')

    press('p')
    advance(SNAKE_STEP)
    expect(boardLabel()).toContain('row 7.')
  })

  it('ends the game at the wall and reports the result exactly once', () => {
    const onGameOver = vi.fn()
    renderGame(SnakeGame, { onGameOver })

    press('ArrowUp') // from the middle of a 16x16 board the top wall is 8 cells away
    advance(SNAKE_STEP * 20)

    expect(screen.getByRole('heading', { name: 'Game over' })).toBeInTheDocument()
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0]).toMatchObject({ score: expect.any(Number), durationMs: expect.any(Number) })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarts after game over into a fresh game that waits for input', () => {
    const onGameStart = vi.fn()
    renderGame(SnakeGame, { onGameStart })
    press('ArrowUp')
    advance(SNAKE_STEP * 20)

    click('Play again')

    expect(screen.getByRole('heading', { name: 'Ready?' })).toBeInTheDocument()
    expect(boardLabel()).toContain('Length 3, score 0. Head at column 9, row 9.')
    press('ArrowDown')
    expect(onGameStart).toHaveBeenCalledTimes(2)
  })

  it('shows the score, the best score and the level', () => {
    window.localStorage.setItem('cyan-arcade:high-score:snake', '17')
    renderGame(SnakeGame)

    expect(stat('Score')).toBe(0)
    expect(stat('Best')).toBe(17)
    expect(stat('Level')).toBe(1)
  })
})

describe('2048 in Human mode', () => {
  it('moves tiles with the arrow keys, reports the start once and has no pause button', () => {
    const onGameStart = vi.fn()
    renderGame(Game2048, { onGameStart })
    expect(screen.queryByRole('button', { name: /pause/i })).not.toBeInTheDocument()

    const initial = boardMarkup()

    for (const key of ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']) press(key)

    expect(boardMarkup()).not.toBe(initial)
    expect(onGameStart).toHaveBeenCalledTimes(1)
  })
})

describe('Tetris in Human mode', () => {
  it('starts on request, falls with gravity and drops with Space', () => {
    const onGameStart = vi.fn()
    renderGame(TetrisGame, { onGameStart })
    click('Start')
    const spawned = boardMarkup()

    press(' ')

    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(stat('Score')).toBeGreaterThan(0) // hard-drop points
    expect(boardMarkup()).not.toBe(spawned)
    expect(vi.getTimerCount()).toBe(1) // gravity is running
  })

  it('pauses gravity with P', () => {
    renderGame(TetrisGame)
    click('Start')

    press('p')

    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })
})
