import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ShopItem } from '@/api/economy'
import type { GameResponse } from '@/api/games'
import { admin, catalogFixture, mockApi, pixel, shopItemsFixture } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/**
 * Flappy Bird on the platform: listed from the catalog, played on its route with its run sent
 * through the same session flow as every game, its AI only for admins, and its skins sold, owned
 * and worn through the ordinary shop and inventory. Nothing here is Flappy Bird-specific platform code.
 */

vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 97531,
}))

const flappyBird: GameResponse = {
  id: 5,
  slug: 'flappy-bird',
  name: 'Flappy Bird',
  description: 'Flap through colourful obstacle courses and chase the highest score.',
  category: 'ARCADE',
  thumbnailUrl: '/thumbnails/flappy-bird.svg',
  accentColor: '#0ea5e9',
  featured: false,
}
const games = [...catalogFixture, flappyBird]

const gameSkin = (id: number, code: string, name: string, slot: string, icon: string, price: number, minLevel = 1): ShopItem => ({
  id,
  code,
  name,
  description: `${name}, for Flappy Bird.`,
  type: 'GAME_SKIN',
  price,
  quantity: 1,
  maxOwned: 1,
  minLevel,
  icon,
  equippable: true,
  consumable: false,
  owned: null,
  unlocked: null,
  soldOut: null,
  equipped: null,
  affordable: null,
  gameSlug: 'flappy-bird',
  slot,
})

const shopItems = [
  ...shopItemsFixture,
  gameSkin(40, 'FLAPPY_BIRD_PINKY', 'Pinky Bird', 'bird', 'pinky', 300),
  gameSkin(41, 'FLAPPY_BIRD_PHOENIX', 'Phoenix Bird', 'bird', 'phoenix', 2000, 6),
  gameSkin(50, 'FLAPPY_PIPE_CANDY', 'Candy Pipes', 'pipes', 'candy', 300),
]

/** The POST bodies the page sent, by path. */
const posts = (fetchSpy: ReturnType<typeof mockApi>) =>
  fetchSpy.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([input, init]) => [new URL(String(input), 'http://localhost').pathname, JSON.parse(String(init?.body))])

const requested = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.some(([input]) => new URL(String(input), 'http://localhost').pathname === path)

describe('Flappy Bird in the arcade', () => {
  it('is listed in the catalog with the other games', async () => {
    mockApi({ games })
    renderRoute('/games')

    const card = await screen.findByRole('link', { name: /Flappy Bird/ })
    expect(card).toHaveAttribute('href', '/games/flappy-bird')
  })

  it('sends a flight through the platform, which saves it and links the leaderboard', async () => {
    const fetchSpy = mockApi({ games, user: pixel, shopItems })
    renderRoute('/games/flappy-bird')

    expect(await screen.findByRole('heading', { level: 1, name: 'Flappy Bird' })).toBeInTheDocument()
    const playfield = await screen.findByRole('button', { name: /playfield/i })
    fireEvent.pointerDown(playfield, { pointerType: 'touch', button: 0 })

    // One flap and nothing more: the bird is on the ground within a second or so.
    expect(await screen.findByText(/saved\./, {}, { timeout: 8000 })).toBeInTheDocument()
    const sent = posts(fetchSpy)
    expect(sent[0]).toEqual(['/api/game-sessions', { gameSlug: 'flappy-bird' }])
    expect(sent[1][1]).toEqual({
      score: 0,
      details: { pipes: 0, flaps: 1, flightMs: expect.any(Number), seconds: 0, level: 1, seed: 97531 },
    })
    expect(screen.getByRole('link', { name: 'View leaderboard →' })).toHaveAttribute('href', '/leaderboard?game=flappy-bird')
  })

  it('has a leaderboard tab like every game', async () => {
    mockApi({ games })
    renderRoute('/leaderboard?game=flappy-bird')

    await waitFor(() => expect(screen.getByRole('button', { name: 'Flappy Bird' })).toBeInTheDocument())
  })
})

describe('Flappy Bird AI mode', () => {
  it('is not offered to a player, whose browser never asks for it', async () => {
    const fetchSpy = mockApi({ games, user: pixel, shopItems })
    renderRoute('/games/flappy-bird')

    await screen.findByRole('button', { name: /playfield/i })
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
    expect(requested(fetchSpy, '/api/ai/access')).toBe(false)
  })

  it('is offered to an admin once the server allows it', async () => {
    const fetchSpy = mockApi({ games, user: admin, shopItems })
    renderRoute('/games/flappy-bird')

    const modes = await screen.findByRole('group', { name: 'Play mode' })
    expect(requested(fetchSpy, '/api/ai/access')).toBe(true)
    fireEvent.click(within(modes).getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('region', { name: 'AI mode' })).toBeInTheDocument()
  })
})

describe('Flappy Bird skins', () => {
  it('are sold in the shop with a picture of the skin and the game they are for', async () => {
    mockApi({ games, user: pixel, shopItems, coins: 1000 })
    renderRoute('/shop?category=skins')

    const section = await screen.findByRole('region', { name: 'Game skins' })
    const pinky = within(section).getByRole('article', { name: 'Pinky Bird' })
    expect(await within(pinky).findByText('Flappy Bird · Bird')).toBeInTheDocument()
    await waitFor(() => expect(pinky.querySelector('canvas')).not.toBeNull())
    // The phoenix is locked below its level.
    const phoenix = within(section).getByRole('article', { name: 'Phoenix Bird' })
    expect(within(phoenix).getByText('Unlocks at level 6')).toBeInTheDocument()
  })

  it('are bought in the shop, worn at once, and flown with in the game', async () => {
    const fetchSpy = mockApi({ games, user: pixel, shopItems, coins: 1000 })
    renderRoute('/shop?category=skins')

    fireEvent.click(await screen.findByRole('button', { name: 'Buy Pinky Bird for 300 coins' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Buy it' }))
    expect(await screen.findByText(/Pinky Bird is yours and already equipped in its game/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Play now' })).toHaveAttribute('href', '/games/flappy-bird')
    // The price was the server's: the request named the item and nothing else.
    const [, purchase] = posts(fetchSpy).find(([path]) => path === '/api/shop/purchases')!
    expect(Object.keys(purchase).sort()).toEqual(['itemId', 'requestId'])

    fireEvent.click(screen.getByRole('link', { name: 'Play now' }))
    const look = await screen.findByRole('region', { name: 'Your look' })
    await waitFor(() => expect(within(look).getByText('Pinky Bird')).toBeInTheDocument())
  })

  it('are chosen in the game and the choice is saved by the server', async () => {
    const fetchSpy = mockApi({ games, user: pixel, shopItems, coins: 1000 })
    renderRoute('/shop?category=skins')
    // Two birds: the first is worn straight away, the second waits.
    for (const name of ['Pinky Bird', 'Candy Pipes']) {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^Buy ${name}`) }))
      fireEvent.click(await screen.findByRole('button', { name: 'Buy it' }))
      await screen.findByText(new RegExp(`${name} is yours`))
    }

    fireEvent.click(screen.getAllByRole('link', { name: 'Play now' })[0])
    fireEvent.click(await screen.findByRole('button', { name: 'Customize' }))
    const dialog = await screen.findByRole('dialog', { name: 'Customize your flight' })
    // Back to the game's own bird: the server is asked to take Pinky off.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Equip Cyan Bird' }))
    await waitFor(() =>
      expect(
        fetchSpy.mock.calls.some(
          ([input, init]) => String(input).endsWith('/api/users/me/inventory/40/equipped') && init?.method === 'DELETE',
        ),
      ).toBe(true),
    )
    const look = screen.getByRole('region', { name: 'Your look' })
    await waitFor(() => expect(within(look).getByText('Cyan Bird')).toBeInTheDocument())
    // The pipes, another slot, are still worn.
    expect(within(look).getByText('Candy Pipes')).toBeInTheDocument()
  })

  it('are only the game defaults for a guest', async () => {
    mockApi({ games, shopItems })
    renderRoute('/games/flappy-bird')

    const look = await screen.findByRole('region', { name: 'Your look' })
    expect(within(look).getByText('Cyan Bird')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }))
    const dialog = await screen.findByRole('dialog', { name: 'Customize your flight' })
    expect(within(dialog).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?redirect=%2Fgames%2Fflappy-bird')
  })
})
