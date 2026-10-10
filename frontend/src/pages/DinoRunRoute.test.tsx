import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShopItem } from '@/api/economy'
import type { GameResponse } from '@/api/games'
import { admin, catalogFixture, mockApi, pixel, SESSION_ID, shopItemsFixture } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/**
 * Dino Run on the platform: listed from the catalog, played on its route with its score submitted
 * through the platform's session, its AI only for admins, and its skins sold and worn through the
 * ordinary shop. No platform code knows the game.
 */

const dino: GameResponse = {
  id: 9,
  slug: 'dino-run',
  name: 'Dino Run',
  description: 'Run with Pip the little dino through eight pixel worlds.',
  category: 'ARCADE',
  thumbnailUrl: '/thumbnails/dino-run.svg',
  accentColor: '#14b8a6',
  featured: false,
  scored: true,
}
const games = [...catalogFixture, dino]

const skin = (id: number, code: string, name: string, slot: string, icon: string, price: number): ShopItem => ({
  id,
  code,
  name,
  description: `${name}, for Dino Run.`,
  type: 'GAME_SKIN',
  price,
  quantity: 1,
  maxOwned: 1,
  minLevel: 1,
  icon,
  equippable: true,
  consumable: false,
  owned: null,
  unlocked: null,
  soldOut: null,
  equipped: null,
  affordable: null,
  gameSlug: 'dino-run',
  slot,
})

const shopItems = [...shopItemsFixture, skin(95, 'DINO_RUNNER_MIDNIGHT', 'Midnight Pip', 'runner', 'midnight', 500), skin(96, 'DINO_OBSTACLES_CANDY', 'Candy Pop', 'obstacles', 'candy', 300)]

const requests = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.filter(([input]) => new URL(String(input), 'http://localhost').pathname === path)

afterEach(() => {
  vi.useRealTimers()
})

describe('Dino Run in the arcade', () => {
  it('is listed in the catalog with the other games', async () => {
    mockApi({ games })
    renderRoute('/games')
    expect(await screen.findByRole('link', { name: /Dino Run/ })).toHaveAttribute('href', '/games/dino-run')
  })

  it('submits a finished run through the platform\'s session, with what the engine reports', async () => {
    const fetchSpy = mockApi({ games, user: pixel, shopItems })
    renderRoute('/games/dino-run')
    const playfield = await screen.findByRole('button', { name: /playfield/i })
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    fireEvent.keyDown(window, { key: ' ' })
    // Nobody jumps: the run ends at the first mound.
    act(() => vi.advanceTimersByTime(4000))
    vi.useRealTimers()
    expect(playfield).toBeInTheDocument()

    await waitFor(() => expect(requests(fetchSpy, `/api/game-sessions/${SESSION_ID}/finish`)).toHaveLength(1))
    const [finish] = requests(fetchSpy, `/api/game-sessions/${SESSION_ID}/finish`)
    const body = JSON.parse(String(finish[1]?.body))
    expect(body.score).toBeGreaterThan(0)
    expect(Object.keys(body.details).sort()).toEqual(['ducks', 'jumps', 'level', 'meters', 'obstacles', 'runMs', 'seconds', 'seed'])
    expect(body.details.meters).toBe(body.score)
    expect(requests(fetchSpy, '/api/game-sessions')).toHaveLength(1)
  })

  it('has a leaderboard tab like every game', async () => {
    mockApi({ games })
    renderRoute('/leaderboard?game=dino-run')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Dino Run' })).toBeInTheDocument())
  })

  it('offers AI mode to an admin, after the server allows it, and never to a player', async () => {
    const asPlayer = mockApi({ games, user: pixel, shopItems })
    const { unmount } = renderRoute('/games/dino-run')
    await screen.findByRole('button', { name: /playfield/i })
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
    expect(requests(asPlayer, '/api/ai/access')).toHaveLength(0)
    unmount()

    const asAdmin = mockApi({ games, user: admin, shopItems })
    renderRoute('/games/dino-run')
    const modes = await screen.findByRole('group', { name: 'Play mode' })
    expect(requests(asAdmin, '/api/ai/access')).toHaveLength(1)
    fireEvent.click(within(modes).getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('region', { name: 'AI mode' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'AI strategy' })).toBeInTheDocument()
  })
})

describe('Dino Run skins', () => {
  it('are sold in the shop with a picture and the slot they dress', async () => {
    mockApi({ games, user: pixel, shopItems, coins: 1000 })
    renderRoute('/shop?category=skins')
    const section = await screen.findByRole('region', { name: 'Game skins' })
    const candy = within(section).getByRole('article', { name: 'Candy Pop' })
    expect(await within(candy).findByText('Dino Run · Obstacles')).toBeInTheDocument()
    expect(within(candy).getByRole('button', { name: 'Buy Candy Pop for 300 coins' })).toBeInTheDocument()
  })

  it('stay locked for a player who has not bought them', async () => {
    mockApi({ games, user: pixel, shopItems })
    renderRoute('/games/dino-run')
    const look = await screen.findByRole('region', { name: 'Your look' })
    expect(await within(look).findByRole('radio', { name: 'Midnight Pip (in the shop)' })).toBeDisabled()
  })

  it('are worn by an admin without buying them', async () => {
    const fetchSpy = mockApi({ games, user: admin, shopItems, coins: 0 })
    renderRoute('/games/dino-run')
    const look = await screen.findByRole('region', { name: 'Your look' })
    fireEvent.click(await within(look).findByRole('radio', { name: 'Candy Pop' }))
    await waitFor(() => expect(within(look).getByRole('radio', { name: 'Candy Pop' })).toHaveAttribute('aria-checked', 'true'))
    expect(requests(fetchSpy, '/api/shop/purchases')).toHaveLength(0)
  })
})
