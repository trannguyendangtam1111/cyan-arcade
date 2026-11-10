import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CLASSIC, type GameMode } from '@/api/games'
import { mockApi } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/**
 * Snake's maps on the platform: offered on the game page only when the server declares them, their
 * runs opened and finished as sessions of their own mode, and each map's board a tab of its own on
 * the leaderboard, never mixed with Classic.
 */

const map = (id: string, name: string): GameMode => ({ id, name, ranked: true, order: 'DESC', unit: 'POINTS' })
const PILLARS = map('map-pillars', 'Pillars')
const TUNNELS = map('map-tunnels', 'Tunnels')
const ROOMS = map('map-rooms', 'Rooms')
const SNAKE_MODES = [CLASSIC, PILLARS, TUNNELS, ROOMS]

const requests = (fetchSpy: ReturnType<typeof mockApi>, path: (url: string) => boolean) =>
  fetchSpy.mock.calls
    .filter(([input, init]) => path(String(input)) && init?.method === 'POST')
    .map(([, init]) => JSON.parse(String(init?.body)))
const sessionStarts = (fetchSpy: ReturnType<typeof mockApi>) => requests(fetchSpy, (url) => url === '/api/game-sessions')
const finishes = (fetchSpy: ReturnType<typeof mockApi>) => requests(fetchSpy, (url) => url.endsWith('/finish'))
const boardRequests = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls.map(([input]) => String(input)).filter((path) => path.startsWith('/api/leaderboards/snake'))

const press = (key: string) => fireEvent.keyDown(window, { key })

describe('Snake maps on the game page', () => {
  beforeEach(() => window.localStorage.clear())

  it('opens a map run as a session of its map, and finishes that session', async () => {
    const fetchSpy = mockApi({ modes: { snake: SNAKE_MODES } })
    renderRoute('/games/snake')

    const maps = await screen.findByRole('group', { name: 'Map' })
    fireEvent.click(within(maps).getByRole('button', { name: 'Rooms' }))
    // Rooms starts the snake three cells below the top edge: up, and the run is over in four steps.
    press('ArrowUp')

    await waitFor(() => expect(sessionStarts(fetchSpy)).toEqual([{ gameSlug: 'snake', mode: 'map-rooms' }]))
    await waitFor(() => expect(finishes(fetchSpy)).toHaveLength(1), { timeout: 4000 })
    const [finish] = finishes(fetchSpy)
    expect(finish.details).toEqual({ length: finish.score + 3, level: Math.floor(finish.score / 5) + 1 })
    // The result is a ranked one: it links to the leaderboard, on the board of the map it was played on.
    expect(await screen.findByRole('heading', { name: /Game over|New best!/ })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'View leaderboard →' })).toHaveAttribute(
      'href',
      '/leaderboard?game=snake&mode=map-rooms',
    )
  })

  it('links a Classic result to the Classic board, as before', async () => {
    mockApi({ modes: { snake: SNAKE_MODES } })
    renderRoute('/games/snake')

    await screen.findByRole('group', { name: 'Map' })
    // The snake starts on row 9: up, and the run ends at the top edge nine real ticks later.
    press('ArrowUp')

    expect(await screen.findByRole('link', { name: 'View leaderboard →' }, { timeout: 8000 })).toHaveAttribute(
      'href',
      '/leaderboard?game=snake',
    )
  }, 10_000)

  it('opens a Classic run as Classic, as before', async () => {
    const fetchSpy = mockApi({ modes: { snake: SNAKE_MODES } })
    renderRoute('/games/snake')

    await screen.findByRole('group', { name: 'Map' })
    press('ArrowUp')

    await waitFor(() => expect(sessionStarts(fetchSpy)).toEqual([{ gameSlug: 'snake', mode: 'classic' }]))
  })

  it('offers no maps while the server does not declare them', async () => {
    const fetchSpy = mockApi()
    renderRoute('/games/snake')

    await screen.findByRole('img', { name: /Snake board/ })
    press('ArrowUp')

    await waitFor(() => expect(sessionStarts(fetchSpy)).toEqual([{ gameSlug: 'snake', mode: 'classic' }]))
    expect(screen.queryByRole('group', { name: 'Map' })).not.toBeInTheDocument()
  })

  it('offers only the maps the server declares', async () => {
    mockApi({ modes: { snake: [CLASSIC, TUNNELS] } })
    renderRoute('/games/snake')

    const maps = await screen.findByRole('group', { name: 'Map' })
    expect(within(maps).getAllByRole('button').map((button) => button.textContent)).toEqual(['Classic', 'Tunnels'])
  })
})

describe('the Snake map leaderboards', () => {
  it('give each map a tab of its own, ranked highest first, apart from Classic', async () => {
    const fetchSpy = mockApi({
      modes: { snake: SNAKE_MODES },
      scores: {
        snake: [{ score: 250 }],
        'snake@map-pillars': [{ score: 120 }, { score: 90 }],
        'snake@map-rooms': [{ score: 75 }],
      },
    })
    renderRoute('/leaderboard?game=snake')
    expect(await screen.findByText('250')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Pillars' }))
    expect(await screen.findByText('120')).toBeInTheDocument()
    expect(screen.getByText('90')).toBeInTheDocument()
    expect(screen.queryByText('250')).not.toBeInTheDocument()
    expect(boardRequests(fetchSpy).at(-1)).toBe('/api/leaderboards/snake?mode=map-pillars&period=ALL_TIME&page=0&size=20')

    fireEvent.click(screen.getByRole('button', { name: 'Rooms' }))
    expect(await screen.findByText('75')).toBeInTheDocument()
    expect(screen.queryByText('120')).not.toBeInTheDocument()
    expect(boardRequests(fetchSpy).at(-1)).toBe('/api/leaderboards/snake?mode=map-rooms&period=ALL_TIME&page=0&size=20')
  })
})
