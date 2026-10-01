import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PLAYER_ID_HEADER, getPlayerId } from '@/lib/playerId'
import { mockApi } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/** 23 scores for 2048, best first: 23000, 22000, ... 1000. The player owns the 4th. */
const scores2048 = Array.from({ length: 23 }, (_, index) => ({
  score: (23 - index) * 1000,
  durationMs: 125_000,
  you: index === 3,
}))

const rows = () => screen.getAllByRole('row').slice(1) // without the header row
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent)

/** Calls to the leaderboard endpoint as [path with query, headers]. */
function leaderboardRequests(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .filter(([input]) => String(input).startsWith('/api/leaderboards/'))
    .map(([input, init]) => [String(input), init?.headers as Record<string, string>] as const)
}

describe('leaderboard page', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows the first game of the catalog by default', async () => {
    mockApi({ scores: { snake: [{ score: 31 }, { score: 12 }] } })
    renderRoute('/leaderboard')

    expect(await screen.findByRole('button', { name: 'Snake' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('table', { name: /snake leaderboard/i })).toBeInTheDocument()
    expect(rows()).toHaveLength(2)
  })

  it('lists rank, player, score, time and date for every entry', async () => {
    mockApi({ scores: { '2048': scores2048 } })
    renderRoute('/leaderboard?game=2048')

    await screen.findByRole('table')
    expect(rows()).toHaveLength(10)
    expect(cells(rows()[0]).slice(0, 4)).toEqual(['1', 'Guest', '23,000', '2:05'])
    expect(cells(rows()[0])[4]).toMatch(/2026/)
    expect(cells(rows()[9]).slice(0, 3)).toEqual(['10', 'Guest', '14,000'])
  })

  it("marks the player's own scores and shows their best and rank", async () => {
    mockApi({ scores: { '2048': scores2048 }, standings: { '2048': { bestScore: 20000, rank: 4 } } })
    renderRoute('/leaderboard?game=2048')

    await screen.findByRole('table')
    expect(cells(rows()[3]).slice(0, 3)).toEqual(['4', 'GuestYou', '20,000'])
    expect(screen.getByText(/your best/i)).toHaveTextContent('Your best: 20,000 · rank #4')
  })

  it('shows the name of players with an account and "Guest" for the rest', async () => {
    mockApi({
      scores: {
        snake: [
          { score: 40, player: { username: 'pixel', avatar: 'CAT' }, you: true },
          { score: 30, player: { username: 'zelda_fan', avatar: 'ROBOT' } },
          { score: 20 },
        ],
      },
    })
    renderRoute('/leaderboard')

    await screen.findByRole('table')
    expect(cells(rows()[0]).slice(0, 3)).toEqual(['1', 'pixelYou', '40'])
    expect(cells(rows()[1]).slice(0, 3)).toEqual(['2', 'zelda_fan', '30'])
    expect(cells(rows()[2]).slice(0, 3)).toEqual(['3', 'Guest', '20'])
  })

  it('invites a player with no score yet to play', async () => {
    mockApi({ scores: { '2048': scores2048 } })
    renderRoute('/leaderboard?game=2048')

    await screen.findByRole('table')
    expect(screen.queryByText(/your best/i)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /play to get on the board/i })).toHaveAttribute('href', '/games/2048')
  })

  it('pages through long leaderboards', async () => {
    const fetchSpy = mockApi({ scores: { '2048': scores2048 } })
    renderRoute('/leaderboard?game=2048')
    await screen.findByRole('table')

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: '13,000' })).toBeInTheDocument()
    expect(cells(rows()[0]).slice(0, 3)).toEqual(['11', 'Guest', '13,000'])

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: '1,000' })).toBeInTheDocument()
    expect(rows()).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    expect(leaderboardRequests(fetchSpy).map(([path]) => path)).toEqual([
      '/api/leaderboards/2048?page=0&size=10',
      '/api/leaderboards/2048?page=1&size=10',
      '/api/leaderboards/2048?page=2&size=10',
    ])
  })

  it('opens directly on the page given in the URL', async () => {
    mockApi({ scores: { '2048': scores2048 } })
    renderRoute('/leaderboard?game=2048&page=3')

    expect(await screen.findByText('Page 3 of 3')).toBeInTheDocument()
    expect(rows()).toHaveLength(3)
  })

  it('offers a way back when the URL points past the last page', async () => {
    mockApi({ scores: { '2048': scores2048 } })
    renderRoute('/leaderboard?game=2048&page=9')

    expect(await screen.findByText('There are no scores on this page.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the top' }))

    expect(await screen.findByRole('cell', { name: '23,000' })).toBeInTheDocument()
  })

  it('switches game and starts again from the first page', async () => {
    mockApi({ scores: { '2048': scores2048, tetris: [{ score: 9000 }] } })
    renderRoute('/leaderboard?game=2048&page=2')
    await screen.findByText('Page 2 of 3')

    fireEvent.click(screen.getByRole('button', { name: 'Tetris' }))

    expect(await screen.findByRole('table', { name: /tetris leaderboard/i })).toBeInTheDocument()
    expect(cells(rows()[0]).slice(0, 3)).toEqual(['1', 'Guest', '9,000'])
    expect(screen.queryByRole('navigation', { name: 'Leaderboard pages' })).not.toBeInTheDocument()
  })

  it('shows an empty state with a link to play when a game has no scores', async () => {
    mockApi()
    renderRoute('/leaderboard?game=tetris')

    expect(await screen.findByRole('heading', { name: 'No scores yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Play Tetris' })).toHaveAttribute('href', '/games/tetris')
  })

  it('shows an error with retry when the server cannot be reached', async () => {
    mockApi({ offline: true })
    renderRoute('/leaderboard')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the games")
  })

  it('identifies the guest to the server with a header, never in the URL', async () => {
    const fetchSpy = mockApi({ scores: { snake: [{ score: 5 }] } })
    renderRoute('/leaderboard')
    await screen.findByRole('table')

    const [[path, headers]] = leaderboardRequests(fetchSpy)
    expect(headers[PLAYER_ID_HEADER]).toBe(getPlayerId())
    expect(path).not.toContain(getPlayerId())
  })
})
