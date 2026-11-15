import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CLASSIC, type GameMode, type GameResponse } from '@/api/games'
import { BOARDS, createMinesweeper, layMines, replayMines } from '@/games/minesweeper/engine/minesweeperEngine'
import { catalogFixture, mockApi, mockJson, mockProblem, pixel, SESSION_ID } from '@/test/mockApi'
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

/** Plays a short, losing game: the opening (once the server has opened the run), then a mine. */
async function playALosingGame() {
  const board = await screen.findByRole('grid', { name: 'Minefield' })
  const cells = within(board).getAllByRole('gridcell')
  fireEvent.click(cells[CENTRE])
  await waitFor(() => expect(cells[CENTRE].getAttribute('aria-label')).not.toMatch(/hidden$/))
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
    expect(sent[0]).toEqual(['/api/game-sessions', { gameSlug: 'minesweeper', mode: 'classic' }])
    expect(sent[1][1]).toEqual({
      score: uncovered * 10,
      details: { rows: 9, columns: 9, mines: 10, revealedCells: uncovered, flagsUsed: 0, won: 0, moves: 2, seconds: 0 },
    })
  })

  it('saves a race whose session took 3.5 s to open: its time counts from the opening', async () => {
    const BEGINNER: GameMode = { id: 'beginner', name: 'Beginner', ranked: true, order: 'ASC', unit: 'MILLISECONDS' }
    let now = 1_000
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    // The server's side, as the backend judges a race: its session time from the moment the start
    // request reaches it, and the reported game time held to it within ±2 s.
    let serverStartedAt = 0
    let reachServer!: () => void
    const fetchSpy = mockApi({
      games,
      user: pixel,
      modes: { minesweeper: [CLASSIC, BEGINNER] },
      handlers: [
        ({ path, method, body }) => {
          if (method !== 'POST') return undefined
          if (path === '/api/game-sessions') {
            return new Promise<Response>((resolve) => {
              reachServer = () => {
                serverStartedAt = now
                resolve(mockJson({ id: SESSION_ID, gameSlug: 'minesweeper', mode: body?.mode, startedAt: '2026-09-30T10:00:00Z' }, 201))
              }
            })
          }
          if (path.endsWith('/finish')) {
            const details = body?.details as Record<string, number> | undefined
            if (details === undefined || Math.abs(details.gameMs - (now - serverStartedAt)) > 2_000) {
              return mockProblem(400, 'SCORE_REJECTED', 'Score submission rejected.')
            }
          }
          return undefined
        },
      ],
    })
    try {
      renderRoute('/games/minesweeper')
      fireEvent.click(await screen.findByRole('button', { name: 'Beginner' }))
      const cells = () => within(screen.getByRole('grid', { name: 'Minefield' })).getAllByRole('gridcell')
      const hidden = (index: number) => cells()[index].getAttribute('aria-label')?.endsWith('hidden') === true

      fireEvent.click(cells()[CENTRE])
      // The start request is 3.5 s on its way; the board waits for it.
      now += 3_500
      await waitFor(() => expect(reachServer).toBeTypeOf('function'))
      expect(hidden(CENTRE)).toBe(true)
      reachServer()
      await waitFor(() => expect(hidden(CENTRE)).toBe(false))

      now += 4_000
      const mines = new Set(replayMines(BOARDS.beginner, SEED >>> 1, CENTRE))
      for (let index = 0; index < 81; index++) if (!mines.has(index) && hidden(index)) fireEvent.click(cells()[index])

      await waitFor(() => expect(posts(fetchSpy)).toHaveLength(2))
      const sent = posts(fetchSpy)
      expect(sent.map(([path]) => path)).toEqual(['/api/game-sessions', `/api/game-sessions/${SESSION_ID}/finish`])
      expect(sent[0][1]).toEqual({ gameSlug: 'minesweeper', mode: 'beginner' })
      expect(sent[1][1]).toMatchObject({ score: 4_000, details: { gameMs: 4_000, firstCell: CENTRE, won: 1 } })
      expect(await screen.findByText(/saved\./)).toBeInTheDocument()
      expect(screen.queryByText(/couldn't be accepted/)).not.toBeInTheDocument()
    } finally {
      clock.mockRestore()
    }
  })

  it('saves a Classic win whose session took 3.5 s to open: its seconds count from the opening', async () => {
    let now = 1_000
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now)
    // The server's side, as the backend judges Classic: the reported seconds held to its own whole
    // seconds since the start request reached it, within 3 s.
    let serverStartedAt = 0
    let reachServer!: () => void
    const fetchSpy = mockApi({
      games,
      user: pixel,
      handlers: [
        ({ path, method, body }) => {
          if (method !== 'POST') return undefined
          if (path === '/api/game-sessions') {
            return new Promise<Response>((resolve) => {
              reachServer = () => {
                serverStartedAt = now
                resolve(mockJson({ id: SESSION_ID, gameSlug: 'minesweeper', mode: body?.mode, startedAt: '2026-09-30T10:00:00Z' }, 201))
              }
            })
          }
          if (path.endsWith('/finish')) {
            const details = body?.details as Record<string, number> | undefined
            const serverSeconds = Math.floor((now - serverStartedAt) / 1000)
            if (details === undefined || details.seconds > serverSeconds + 3 || (details.won === 1 && details.seconds < serverSeconds - 3)) {
              return mockProblem(400, 'SCORE_REJECTED', 'Score submission rejected.')
            }
          }
          return undefined
        },
      ],
    })
    try {
      renderRoute('/games/minesweeper')
      const board = await screen.findByRole('grid', { name: 'Minefield' })
      const cells = () => within(board).getAllByRole('gridcell')
      const hidden = (index: number) => cells()[index].getAttribute('aria-label')?.endsWith('hidden') === true

      fireEvent.click(cells()[CENTRE])
      // The start request is 3.5 s on its way; the board waits for it.
      now += 3_500
      await waitFor(() => expect(reachServer).toBeTypeOf('function'))
      expect(hidden(CENTRE)).toBe(true)
      reachServer()
      await waitFor(() => expect(hidden(CENTRE)).toBe(false))

      // 1.6 s of play: timed from the click, the seconds (5) would be more than 3 over the server's (1).
      now += 1_600
      const mines = new Set(layMines(createMinesweeper(SEED), CENTRE).cells.flatMap((cell, index) => (cell.mine ? [index] : [])))
      let reveals = 0
      for (let index = 0; index < 81; index++) {
        if (mines.has(index) || !hidden(index)) continue
        fireEvent.click(cells()[index])
        reveals++
      }

      await waitFor(() => expect(posts(fetchSpy)).toHaveLength(2))
      const sent = posts(fetchSpy)
      expect(sent[0]).toEqual(['/api/game-sessions', { gameSlug: 'minesweeper', mode: 'classic' }])
      expect(sent[1]).toEqual([
        `/api/game-sessions/${SESSION_ID}/finish`,
        {
          score: 71 * 10 + 500 + (600 - 1),
          details: { rows: 9, columns: 9, mines: 10, revealedCells: 71, flagsUsed: 0, won: 1, moves: reveals + 1, seconds: 1 },
        },
      ])
      expect(await screen.findByText(/saved\./)).toBeInTheDocument()
      expect(screen.queryByText(/couldn't be accepted/)).not.toBeInTheDocument()
    } finally {
      clock.mockRestore()
    }
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
