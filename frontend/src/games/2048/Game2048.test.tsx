import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps } from '@/games/types'
import Game2048 from './Game2048'
import type { Game2048State } from './types/game2048Types'

// A fixed seed makes tile spawns, and therefore every AI decision in this file, repeatable.
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 2048,
}))

// Every new game in this file starts from `startingBoard`, so a test can stage any situation.
let startingBoard: number[] = []

vi.mock('./engine/game2048Engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('./engine/game2048Engine')>()
  return {
    ...original,
    createGame2048: (seed: number): Game2048State => ({
      ...original.createGame2048(seed),
      board: startingBoard,
      tileIds: startingBoard.map((value, index) => (value === 0 ? 0 : index + 1)),
      nextTileId: 100,
    }),
  }
})

const board = (...rows: number[][]) => rows.flat()
/** One merge away from 2048. */
const ALMOST_WON = board([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
/** Sliding left fills the last empty cell and leaves no legal move. */
const ALMOST_LOST = board([0, 8, 16, 32], [64, 128, 256, 512], [8, 16, 32, 64], [128, 256, 512, 1024])

const press = (key: string) => fireEvent.keyDown(window, { key })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const stat = (label: string) => Number(screen.getByText(label).nextElementSibling?.textContent)

function renderGame(handlers: Partial<GameProps> = {}) {
  return render(<Game2048 onGameStart={vi.fn()} onGameOver={vi.fn()} {...handlers} />)
}

beforeEach(() => window.localStorage.clear())

describe('winning at 2048', () => {
  beforeEach(() => {
    startingBoard = ALMOST_WON
  })

  it('announces the win and offers to keep going or start again', () => {
    renderGame()

    press('ArrowLeft')

    expect(screen.getByRole('heading', { name: 'You made 2048!' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep going' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument()
    expect(stat('Score')).toBe(2048)
    expect(stat('Best tile')).toBe(2048)
  })

  it('holds the board still until the player decides', () => {
    renderGame()
    press('ArrowLeft')
    const held = screen.getByRole('img', { name: /2048 board/i }).outerHTML

    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowUp', 'd', 's']) press(key)

    expect(screen.getByRole('img', { name: /2048 board/i }).outerHTML).toBe(held)
  })

  it('lets the player keep going after the win, without reporting the run yet', () => {
    const onGameOver = vi.fn()
    renderGame({ onGameOver })
    press('ArrowLeft')

    click('Keep going')

    expect(screen.queryByRole('heading', { name: 'You made 2048!' })).not.toBeInTheDocument()
    expect(screen.getByText('2048 reached!')).toBeInTheDocument()
    const before = screen.getByRole('img', { name: /2048 board/i }).outerHTML
    press('ArrowRight')
    expect(screen.getByRole('img', { name: /2048 board/i }).outerHTML).not.toBe(before)
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('banks the winning score when the player starts a new game from the win screen', () => {
    const onGameOver = vi.fn()
    const onGameStart = vi.fn()
    renderGame({ onGameStart, onGameOver })
    press('ArrowLeft')

    click('New game')

    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0]).toMatchObject({ score: 2048, metadata: { highestTile: 2048, moves: 1 } })
    expect(stat('Score')).toBe(0)
    expect(stat('Best')).toBe(2048)
    // The next input opens a new run.
    press('ArrowLeft')
    expect(onGameStart).toHaveBeenCalledTimes(2)
  })

  it('also banks the score when a won game is restarted later', () => {
    const onGameOver = vi.fn()
    renderGame({ onGameOver })
    press('ArrowLeft')
    click('Keep going')

    click('Restart')

    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0].score).toBeGreaterThanOrEqual(2048)
  })

  it('does not stop the AI at 2048', () => {
    vi.useFakeTimers()
    try {
      renderGame()
      click('AI')
      fireEvent.click(screen.getByRole('radio', { name: '8x' }))

      const step = () => act(() => vi.advanceTimersToNextTimer())

      // The AI may shuffle the two 1024s into position first; give it time to merge them.
      for (let i = 0; i < 50 && stat('Best tile') < 2048; i++) step()
      expect(stat('Best tile')).toBe(2048)
      const movesAtWin = stat('Moves')

      // It keeps playing: no win screen, and the move counter carries on.
      for (let i = 0; i < 3; i++) step()
      expect(screen.queryByRole('heading', { name: 'You made 2048!' })).not.toBeInTheDocument()
      expect(stat('Moves')).toBe(movesAtWin + 3)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('an abandoned game', () => {
  it('is not reported when the player restarts before winning', () => {
    startingBoard = board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
    const onGameOver = vi.fn()
    renderGame({ onGameOver })
    press('ArrowLeft')

    click('Restart')

    expect(onGameOver).not.toHaveBeenCalled()
  })
})

describe('losing at 2048', () => {
  beforeEach(() => {
    startingBoard = ALMOST_LOST
  })

  it('ends the game when no move is left and reports the result once', () => {
    const onGameOver = vi.fn()
    renderGame({ onGameOver })

    press('ArrowLeft')
    press('ArrowUp')

    expect(screen.getByRole('heading', { name: 'Game over' })).toBeInTheDocument()
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0]).toMatchObject({ score: 0, metadata: { highestTile: 1024, moves: 1 } })
  })

  it('starts a fresh game from the game-over screen', () => {
    renderGame()
    press('ArrowLeft')
    startingBoard = board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])

    click('Play again')

    expect(screen.queryByRole('heading', { name: 'Game over' })).not.toBeInTheDocument()
    expect(stat('Best tile')).toBe(2)
  })
})
