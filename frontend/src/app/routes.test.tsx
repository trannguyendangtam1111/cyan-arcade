import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { GameResponse } from '@/api/games'
import { admin, catalogFixture, mockApi, mockProblem, pixel } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/** The paths the app asked the API for. */
const requested = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls.map(([input]) => new URL(String(input), 'http://localhost').pathname)

/** In the catalog, but with no module in the frontend registry. */
const unreleasedGame: GameResponse = {
  id: 4,
  slug: 'minesweeper',
  name: 'Minesweeper',
  description: 'Clear the field without detonating a mine.',
  category: 'PUZZLE',
  thumbnailUrl: '/thumbnails/minesweeper.svg',
  accentColor: '#ef4444',
  featured: false,
}

describe('home page', () => {
  it('shows the hero and featured games from the catalog', async () => {
    mockApi()
    renderRoute('/')

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pick a cabinet.')
    const featured = within(screen.getByRole('region', { name: 'Featured games' }))
    expect(await featured.findByRole('link', { name: /snake/i })).toHaveAttribute('href', '/games/snake')
    expect(featured.getByRole('link', { name: /tetris/i })).toBeInTheDocument()
    expect(await screen.findByText('Server online')).toBeInTheDocument()
  })

  it('shows an error state with retry when the server is unreachable', async () => {
    mockApi({ offline: true })
    renderRoute('/')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the games")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(await screen.findByText('Server offline')).toBeInTheDocument()
  })

  it('recovers when retrying after the server comes back', async () => {
    const fetchSpy = mockApi({ offline: true })
    renderRoute('/')
    const retry = await screen.findByRole('button', { name: 'Try again' })

    fetchSpy.mockRestore()
    mockApi()
    await userEvent.click(retry)

    const featured = within(screen.getByRole('region', { name: 'Featured games' }))
    expect(await featured.findByRole('link', { name: /snake/i })).toBeInTheDocument()
  })
})

describe('games page', () => {
  it('lists every game in the catalog, playable or coming soon', async () => {
    mockApi({ games: [...catalogFixture, unreleasedGame] })
    renderRoute('/games')

    expect(screen.getByRole('heading', { level: 1, name: 'Games' })).toBeInTheDocument()
    const snake = await screen.findByRole('link', { name: /snake/i })
    const names = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
    expect(names).toEqual(['Snake', '2048', 'Tetris', 'Minesweeper'])
    expect(within(snake).getByText('Arcade')).toBeInTheDocument()

    // Snake, 2048 and Tetris have a registered module; a catalog-only game does not.
    for (const name of [/snake/i, /2048/, /tetris/i]) {
      expect(within(screen.getByRole('link', { name })).getByText('Play')).toBeInTheDocument()
    }
    expect(within(screen.getByRole('link', { name: /minesweeper/i })).getByText('Coming soon')).toBeInTheDocument()
  })

  it('shows an empty state when the catalog has no games', async () => {
    mockApi({ games: [] })
    renderRoute('/games')

    expect(await screen.findByRole('heading', { name: 'The arcade is warming up' })).toBeInTheDocument()
  })
})

describe('game detail page', () => {
  it('shows catalog details and a coming-soon stage for a game without a module', async () => {
    mockApi({ games: [...catalogFixture, unreleasedGame] })
    renderRoute('/games/minesweeper')

    expect(await screen.findByRole('heading', { level: 1, name: 'Minesweeper' })).toBeInTheDocument()
    expect(screen.getByText('Clear the field without detonating a mine.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Minesweeper is being built' })).toBeInTheDocument()
  })

  it.each([
    ['snake', 'Snake'],
    ['2048', '2048'],
    ['tetris', 'Tetris'],
  ])('loads the real %s game, with Human and AI modes for an admin', async (slug, name) => {
    const fetchSpy = mockApi({ user: admin })
    renderRoute(`/games/${slug}`)

    expect(await screen.findByRole('heading', { level: 1, name })).toBeInTheDocument()
    // The game module is lazy-loaded from the registry, its AI only once the server has said yes.
    expect(await screen.findByRole('button', { name: 'AI' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Human' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img', { name: /board/i })).toBeInTheDocument()
    expect(screen.queryByText(/is being built/i)).not.toBeInTheDocument()
    expect(requested(fetchSpy)).toContain('/api/ai/access')
  })

  it.each([
    ['a player', pixel],
    ['a guest', null],
  ])('gives %s the game without AI mode, and never asks for the AI', async (_, user) => {
    const fetchSpy = mockApi({ user })
    renderRoute('/games/snake')

    expect(await screen.findByRole('img', { name: /board/i })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument()
    expect(requested(fetchSpy)).not.toContain('/api/ai/access')
  })

  it('leaves AI mode out when the server refuses it, whatever the app believed', async () => {
    // A session that still says "admin", but the server no longer agrees.
    mockApi({
      user: admin,
      handlers: [({ path }) => (path === '/api/ai/access' ? mockProblem(403, 'FORBIDDEN', 'Admins only') : undefined)],
    })
    renderRoute('/games/snake')

    expect(await screen.findByRole('img', { name: /board/i })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument()
  })

  it('renders the 404 page for a game that is not in the catalog', async () => {
    mockApi()
    renderRoute('/games/pong')

    expect(await screen.findByRole('heading', { name: /game over/i })).toBeInTheDocument()
  })
})

describe('other pages', () => {
  it('leaderboard lets the player pick a game from the catalog', async () => {
    mockApi()
    renderRoute('/leaderboard')

    expect(screen.getByRole('heading', { level: 1, name: 'Leaderboard' })).toBeInTheDocument()
    const tetris = await screen.findByRole('button', { name: 'Tetris' })
    expect(screen.getByRole('button', { name: 'Snake' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(tetris)

    expect(tetris).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByText(/nobody has finished a game of tetris yet/i)).toBeInTheDocument()
  })

  it('renders a friendly 404 for unknown paths', () => {
    mockApi()
    renderRoute('/definitely/not/here')

    expect(screen.getByRole('heading', { name: /game over/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to the arcade' })).toHaveAttribute('href', '/')
  })
})
