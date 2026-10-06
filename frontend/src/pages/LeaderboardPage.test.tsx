import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PLAYER_ID_HEADER, getPlayerId } from '@/lib/playerId'
import { mockApi, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/** 23 players' best scores in 2048, best first: 23000, 22000, ... 1000. The caller is 4th. */
const scores2048 = Array.from({ length: 23 }, (_, index) => ({
  score: (23 - index) * 1000,
  durationMs: 125_000,
  you: index === 3,
}))

const rows = () => screen.getAllByRole('row').slice(1) // without the header row
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((cell) => cell.textContent)
const podium = () => within(screen.getByRole('list', { name: /^Top \d in/ })).getAllByRole('listitem')
const yourRank = () => within(screen.getByRole('region', { name: 'Your rank' }))

/** Calls to the leaderboard endpoint as [path with query, headers]. */
function leaderboardRequests(fetchSpy: ReturnType<typeof mockApi>) {
  return fetchSpy.mock.calls
    .filter(([input]) => String(input).startsWith('/api/leaderboards/'))
    .map(([input, init]) => [String(input), init?.headers as Record<string, string>] as const)
}

describe('leaderboard page', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows the first game of the catalog, of all time, by default', async () => {
    mockApi({ scores: { snake: [{ score: 31 }, { score: 12 }] } })
    renderRoute('/leaderboard')

    expect(await screen.findByRole('button', { name: 'Snake' })).toHaveAttribute('aria-pressed', 'true')
    const periods = within(screen.getByRole('group', { name: 'Choose a period' }))
    expect(periods.getAllByRole('button').map((button) => button.textContent)).toEqual(['Today', 'This week', 'All time'])
    expect(periods.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('list', { name: 'Top 2 in Snake' })).toBeInTheDocument()
    expect(podium()).toHaveLength(2)
  })

  it('puts the top three on a podium, with medals, and the rest in a table', async () => {
    mockApi({ scores: { '2048': scores2048 } })
    renderRoute('/leaderboard?game=2048')

    const top = within(await screen.findByRole('list', { name: 'Top 3 in 2048' })).getAllByRole('listitem')
    expect(top.map((place) => place.textContent)).toEqual([
      '🥇Rank 1Guest23,000',
      '🥈Rank 2Guest22,000',
      '🥉Rank 3Guest21,000',
    ])
    // Page 1 holds 20: three on the podium, 17 in the table, from rank 4.
    expect(rows()).toHaveLength(17)
    expect(cells(rows()[0]).slice(0, 4)).toEqual(['4', 'GuestYou', '20,000', '2:05'])
    expect(cells(rows()[0])[4]).toMatch(/2026/)
    expect(cells(rows()[16]).slice(0, 3)).toEqual(['20', 'Guest', '4,000'])
  })

  it("shows the player's own rank and best score above the board", async () => {
    mockApi({ scores: { '2048': scores2048 }, standings: { '2048': { rank: 4, score: 20000 } } })
    renderRoute('/leaderboard?game=2048')

    await screen.findByRole('table')
    expect(yourRank().getByText('#4')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Your rank' })).toHaveTextContent('Your rank#4of 23 · best 20,000')
    expect(rows()[0]).toHaveTextContent('You')
  })

  it('invites a player who is not on the board to play, without making up a rank', async () => {
    mockApi({ scores: { '2048': scores2048 } })
    renderRoute('/leaderboard?game=2048')

    await screen.findByRole('table')
    expect(yourRank().queryByText(/#\d/)).not.toBeInTheDocument()
    expect(yourRank().getByRole('link', { name: /play to get on the board/i })).toHaveAttribute('href', '/games/2048')
  })

  it('shows the name of players with an account and "Guest" for the rest, long names cut short', async () => {
    const longName = 'a_really_long_name20'
    mockApi({
      user: pixel,
      scores: {
        snake: [
          { score: 50, player: { username: longName, displayName: longName, avatar: 'GHOST' } },
          { score: 45, player: { username: 'zelda_fan', displayName: 'zelda_fan', avatar: 'ROBOT' } },
          { score: 42 },
          { score: 40, player: { username: 'pixel', displayName: 'pixel', avatar: 'CAT' }, you: true },
          { score: 20 },
        ],
      },
    })
    renderRoute('/leaderboard')

    await screen.findByRole('table')
    expect(podium()[0]).toHaveTextContent(longName)
    const name = within(podium()[0]).getByText(longName)
    expect(name).toHaveClass('truncate')
    expect(name).toHaveAttribute('title', `${longName} (@${longName})`)
    expect(podium()[2]).toHaveTextContent('Guest')
    expect(cells(rows()[0]).slice(0, 3)).toEqual(['4', 'pixelYou', '40'])
    expect(cells(rows()[1]).slice(0, 3)).toEqual(['5', 'Guest', '20'])
  })

  it('switches between today, this week and all time', async () => {
    const fetchSpy = mockApi({
      scores: {
        snake: [{ score: 90 }, { score: 80 }],
        'snake:WEEKLY': [{ score: 60, player: { username: 'weekly_star', displayName: 'weekly_star', avatar: 'CAT' } }],
        'snake:DAILY': [],
      },
      standings: { 'snake:WEEKLY': { rank: 1, score: 60 } },
    })
    renderRoute('/leaderboard')
    await screen.findByRole('list', { name: 'Top 2 in Snake' })

    fireEvent.click(screen.getByRole('button', { name: 'This week' }))
    expect(await screen.findByText('weekly_star')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'This week' })).toHaveAttribute('aria-pressed', 'true')
    expect(yourRank().getByText('#1')).toBeInTheDocument()
    // Today's and this week's boards say when the next one starts.
    expect(yourRank().getByText('New board in 5h 12m')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(await screen.findByRole('heading', { name: 'No scores today yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Play Snake' })).toHaveAttribute('href', '/games/snake')

    expect(leaderboardRequests(fetchSpy).map(([path]) => path)).toEqual([
      '/api/leaderboards/snake?period=ALL_TIME&page=0&size=20',
      '/api/leaderboards/snake?period=WEEKLY&page=0&size=20',
      '/api/leaderboards/snake?period=DAILY&page=0&size=20',
    ])
  })

  it('opens the period given in the URL', async () => {
    const fetchSpy = mockApi({ scores: { snake: [{ score: 9 }] } })
    renderRoute('/leaderboard?game=snake&period=weekly')

    expect(await screen.findByRole('button', { name: 'This week' })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByRole('list', { name: 'Top 1 in Snake' })
    expect(leaderboardRequests(fetchSpy)[0][0]).toContain('period=WEEKLY')
  })

  it('falls back to all time for a period it does not know', async () => {
    mockApi({ scores: { snake: [{ score: 9 }] } })
    renderRoute('/leaderboard?game=snake&period=monthly')

    expect(await screen.findByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('pages through long leaderboards, the podium only on the first page', async () => {
    const fetchSpy = mockApi({ scores: { '2048': scores2048 } })
    renderRoute('/leaderboard?game=2048&period=weekly')
    await screen.findByRole('table')

    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: '3,000' })).toBeInTheDocument()
    expect(rows()).toHaveLength(3)
    expect(cells(rows()[0]).slice(0, 3)).toEqual(['21', 'Guest', '3,000'])
    expect(screen.queryByRole('list', { name: /^Top/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()

    expect(leaderboardRequests(fetchSpy).map(([path]) => path)).toEqual([
      '/api/leaderboards/2048?period=WEEKLY&page=0&size=20',
      '/api/leaderboards/2048?period=WEEKLY&page=1&size=20',
    ])
  })

  it('opens directly on the page given in the URL', async () => {
    mockApi({ scores: { '2048': scores2048 } })
    renderRoute('/leaderboard?game=2048&page=2')

    expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument()
    expect(rows()).toHaveLength(3)
  })

  it('offers a way back when the URL points past the last page', async () => {
    mockApi({ scores: { '2048': scores2048 } })
    renderRoute('/leaderboard?game=2048&page=9')

    expect(await screen.findByText('There are no scores on this page.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to the top' }))

    expect(await screen.findByRole('list', { name: 'Top 3 in 2048' })).toBeInTheDocument()
  })

  it('switches game, keeping the period and starting again from the first page', async () => {
    const fetchSpy = mockApi({ scores: { '2048': scores2048, tetris: [{ score: 9000 }] } })
    renderRoute('/leaderboard?game=2048&period=daily&page=2')
    await screen.findByText('Page 2 of 2')

    fireEvent.click(screen.getByRole('button', { name: 'Tetris' }))

    expect(await screen.findByRole('list', { name: 'Top 1 in Tetris' })).toHaveTextContent('9,000')
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('navigation', { name: 'Leaderboard pages' })).not.toBeInTheDocument()
    expect(leaderboardRequests(fetchSpy).at(-1)?.[0]).toBe('/api/leaderboards/tetris?period=DAILY&page=0&size=20')
  })

  it('shows an empty state with a link to play when a game has no scores', async () => {
    mockApi()
    renderRoute('/leaderboard?game=tetris')

    expect(await screen.findByRole('heading', { name: 'No scores yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Play Tetris' })).toHaveAttribute('href', '/games/tetris')
  })

  it('shows a loading state while the board is on its way', async () => {
    mockApi({ scores: { snake: [{ score: 5 }] } })
    renderRoute('/leaderboard')

    expect(await screen.findByRole('status', { name: 'Loading leaderboard' })).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Top 1 in Snake' })).toBeInTheDocument()
  })

  it('shows an error with retry when a board cannot be loaded', async () => {
    mockApi({
      handlers: [
        ({ path }) =>
          path.startsWith('/api/leaderboards/') ? new Response('{}', { status: 500, headers: { 'Content-Type': 'application/json' } }) : undefined,
      ],
    })
    renderRoute('/leaderboard')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load this leaderboard")
    expect(screen.getByRole('button', { name: /try again|retry/i })).toBeInTheDocument()
  })

  it('shows an error with retry when the server cannot be reached', async () => {
    mockApi({ offline: true })
    renderRoute('/leaderboard')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the games")
  })

  it('identifies the guest to the server with a header, never in the URL', async () => {
    const fetchSpy = mockApi({ scores: { snake: [{ score: 5 }] } })
    renderRoute('/leaderboard')
    await screen.findByRole('list', { name: 'Top 1 in Snake' })

    const [[path, headers]] = leaderboardRequests(fetchSpy)
    expect(headers[PLAYER_ID_HEADER]).toBe(getPlayerId())
    expect(path).not.toContain(getPlayerId())
  })

  it('only ever reads: there is nothing on the page that sends a score or a rank', async () => {
    const fetchSpy = mockApi({ user: pixel, scores: { snake: [{ score: 5, you: true }] } })
    renderRoute('/leaderboard')
    await screen.findByRole('list', { name: 'Top 1 in Snake' })

    expect(fetchSpy.mock.calls.filter(([, init]) => (init?.method ?? 'GET') !== 'GET')).toEqual([])
  })
})
