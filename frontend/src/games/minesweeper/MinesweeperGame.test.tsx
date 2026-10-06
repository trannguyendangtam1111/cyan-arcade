import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps } from '@/games/types'
import { createMinesweeper, layMines } from './engine/minesweeperEngine'
import MinesweeperGame from './MinesweeperGame'

// A fixed seed lays the same mines every game, so a test knows where they are.
const SEED = 4242
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => SEED,
}))

const CENTRE = 40
/** Where the mines go when the first reveal is the centre, worked out by the engine itself. */
const laid = layMines(createMinesweeper(SEED), CENTRE)
const MINES = laid.cells.flatMap((cell, index) => (cell.mine ? [index] : []))
const SAFE = laid.cells.flatMap((cell, index) => (cell.mine ? [] : [index]))

const cells = () => screen.getAllByRole('gridcell')
const cell = (index: number) => cells()[index]
const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent

function renderGame(handlers: Partial<GameProps> = {}) {
  const props = { onGameStart: vi.fn(), onGameOver: vi.fn(), ...handlers }
  render(<MinesweeperGame {...props} />)
  return props
}

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.useRealTimers())

describe('a new game of Minesweeper', () => {
  it('shows a covered 9 × 9 board, the mine counter, the clock and no AI controls', () => {
    renderGame()

    expect(screen.getByRole('grid', { name: 'Minefield' })).toBeInTheDocument()
    expect(cells()).toHaveLength(81)
    expect(cells().every((button) => button.getAttribute('aria-label')?.endsWith('hidden'))).toBe(true)
    expect(stat('Mines')).toBe('10')
    expect(stat('Time')).toBe('0:00')
    expect(stat('Score')).toBe('0')
    expect(screen.getByText('Pick any square to start')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reveal' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /^AI/ })).not.toBeInTheDocument()
  })
})

describe('revealing', () => {
  it('starts the run with the first reveal and uncovers a safe opening', () => {
    const { onGameStart } = renderGame()

    fireEvent.click(cell(CENTRE))

    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(cell(CENTRE)).toHaveAccessibleName('Row 5, column 5: empty')
    const uncovered = cells().filter((button) => !button.getAttribute('aria-label')?.endsWith('hidden')).length
    expect(uncovered).toBeGreaterThan(9)
    expect(stat('Score')).toBe(String(uncovered * 10))
    expect(screen.queryByText('Pick any square to start')).not.toBeInTheDocument()

    // Another reveal is part of the same run.
    fireEvent.click(cell(SAFE.find((index) => cell(index).getAttribute('aria-label')?.endsWith('hidden'))!))
    expect(onGameStart).toHaveBeenCalledTimes(1)
  })

  it('ends with a boom on a mine, shows every mine, and reports the run once', () => {
    const { onGameOver } = renderGame()
    fireEvent.click(cell(CENTRE))
    const uncovered = cells().filter((button) => !button.getAttribute('aria-label')?.endsWith('hidden')).length

    fireEvent.click(cell(MINES[0]))

    expect(screen.getByRole('heading', { name: 'Boom!' })).toBeInTheDocument()
    for (const mine of MINES) expect(cell(mine)).toHaveAccessibleName(/: mine$/)
    expect(cells().every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver).toHaveBeenCalledWith(
      expect.objectContaining({
        score: uncovered * 10,
        metadata: { rows: 9, columns: 9, mines: 10, revealedCells: uncovered, flagsUsed: 0, won: 0, moves: 2, seconds: 0 },
      }),
    )
  })

  it('clears the board, wins and reports the score with its time bonus', () => {
    // The clock stands still, so the whole board is cleared in no time at all.
    vi.useFakeTimers({ toFake: ['performance'] })
    const { onGameOver } = renderGame()
    fireEvent.click(cell(CENTRE))
    for (const index of SAFE) {
      if (cell(index).getAttribute('aria-label')?.endsWith('hidden')) fireEvent.click(cell(index))
    }

    expect(screen.getByRole('heading', { name: /Board cleared!|New best!/ })).toBeInTheDocument()
    // 71 cells, the win and the whole 600-second bonus for a board cleared within the second.
    expect(stat('Score')).toBe('1810')
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver).toHaveBeenCalledWith(
      expect.objectContaining({ score: 1810, metadata: expect.objectContaining({ revealedCells: 71, won: 1, seconds: 0 }) }),
    )
  })
})

describe('flags', () => {
  it('go on and off with a right click or F, and count down the mines', () => {
    renderGame()
    fireEvent.click(cell(CENTRE))
    const covered = MINES[0]

    fireEvent.contextMenu(cell(covered))
    expect(cell(covered)).toHaveAccessibleName(/flagged$/)
    expect(stat('Mines')).toBe('9')
    // A flagged square is safe from a careless click.
    fireEvent.click(cell(covered))
    expect(screen.queryByRole('heading', { name: 'Boom!' })).not.toBeInTheDocument()

    fireEvent.keyDown(cell(covered), { key: 'f' })
    expect(cell(covered)).toHaveAccessibleName(/hidden$/)
    expect(stat('Mines')).toBe('10')
  })

  it('are what a tap does in Flag mode, for phones without a right click', () => {
    renderGame()
    fireEvent.click(cell(CENTRE))
    const tools = within(screen.getByRole('group', { name: 'What a tap does' }))

    fireEvent.click(tools.getByRole('button', { name: 'Flag' }))
    expect(tools.getByRole('button', { name: 'Flag' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(cell(MINES[0]))
    expect(cell(MINES[0])).toHaveAccessibleName(/flagged$/)
    expect(screen.queryByRole('heading', { name: 'Boom!' })).not.toBeInTheDocument()

    fireEvent.click(tools.getByRole('button', { name: 'Reveal' }))
    fireEvent.click(cell(MINES[1]))
    expect(screen.getByRole('heading', { name: 'Boom!' })).toBeInTheDocument()
  })
})

describe('the clock and starting over', () => {
  it('counts the seconds of a game in progress', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    renderGame()
    fireEvent.click(cell(CENTRE))

    act(() => vi.advanceTimersByTime(65_000))
    expect(stat('Time')).toBe('1:05')
  })

  it('starts a fresh game, and a fresh run, on Restart', () => {
    const { onGameStart, onGameOver } = renderGame()
    fireEvent.click(cell(CENTRE))
    fireEvent.click(cell(MINES[0]))

    fireEvent.click(screen.getByRole('button', { name: 'Play again' }))

    expect(cells().every((button) => button.getAttribute('aria-label')?.endsWith('hidden'))).toBe(true)
    expect(stat('Mines')).toBe('10')
    expect(stat('Time')).toBe('0:00')
    expect(stat('Score')).toBe('0')
    fireEvent.click(cell(CENTRE))
    expect(onGameStart).toHaveBeenCalledTimes(2)
    expect(onGameOver).toHaveBeenCalledTimes(1)
  })
})
