import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { GameResponse } from '@/api/games'
import { createMinesweeper, layMines } from '@/games/minesweeper/engine/minesweeperEngine'
import { catalogFixture, mockApi, mockProblem, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/**
 * Minesweeper on the platform: listed from the catalog, played on its route, and its result sent
 * through the same session flow as every game. Nothing here is Minesweeper-specific platform code.
 */

const SEED = 4242
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => SEED,
}))

const minesweeper: GameResponse = {
  id: 4,
  slug: 'minesweeper',
  name: 'Minesweeper',
  description: 'Uncover every safe square without setting off a mine.',
  category: 'PUZZLE',
  thumbnailUrl: '/thumbnails/minesweeper.svg',
  accentColor: '#e11d48',
  featured: false,
  scored: true,
}
const games = [...catalogFixture, minesweeper]

const CENTRE = 40
const MINE = layMines(createMinesweeper(SEED), CENTRE).cells.findIndex((cell) => cell.mine)

/** The POST bodies the page sent, by path. */
const posts = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([input, init]) => [new URL(String(input), 'http://localhost').pathname, JSON.parse(String(init?.body))])

/** Plays a short, losing game: the opening, then a mine. */
async function playALosingGame() {
  const board = await screen.findByRole('grid', { name: 'Minefield' })
  const cells = within(board).getAllByRole('gridcell')
  fireEvent.click(cells[CENTRE])
  fireEvent.click(cells[MINE])
  return cells.filter((cell) => /: (empty|\d+ nearby)$/.test(cell.getAttribute('aria-label') ?? '')).length
}

describe('Minesweeper in the arcade', () => {
  it('is listed in the catalog with the other games', async () => {
    mockApi({ games })
    renderRoute('/games')

    const card = await screen.findByRole('link', { name: /Minesweeper/ })
    expect(card).toHaveAttribute('href', '/games/minesweeper')
    expect(screen.getByRole('link', { name: /Snake/ })).toBeInTheDocument()
  })

  it('opens on its route and sends its run through the platform', async () => {
    const fetchSpy = mockApi({ games, user: pixel })
    renderRoute('/games/minesweeper')

    expect(await screen.findByRole('heading', { level: 1, name: 'Minesweeper' })).toBeInTheDocument()
    const uncovered = await playALosingGame()

    expect(await screen.findByText(/saved\./)).toBeInTheDocument()
    const sent = posts(fetchSpy)
    expect(sent[0]).toEqual(['/api/game-sessions', { gameSlug: 'minesweeper' }])
    expect(sent[1][1]).toEqual({
      score: uncovered * 10,
      details: { rows: 9, columns: 9, mines: 10, revealedCells: uncovered, flagsUsed: 0, won: 0, moves: 2, seconds: 0 },
    })
  })

  it('says kindly when the server rejects the result', async () => {
    mockApi({
      games,
      user: pixel,
      handlers: [
        ({ path }) =>
          path.endsWith('/finish') ? mockProblem(400, 'SCORE_REJECTED', 'Score submission rejected.') : undefined,
      ],
    })
    renderRoute('/games/minesweeper')

    await playALosingGame()

    expect(await screen.findByText(/couldn't be accepted/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('has a leaderboard tab like every game', async () => {
    mockApi({ games })
    renderRoute('/leaderboard?game=minesweeper')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Minesweeper' })).toBeInTheDocument())
  })
})
