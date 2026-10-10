import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ShopItem } from '@/api/economy'
import type { GameResponse } from '@/api/games'
import { admin, catalogFixture, mockApi, pixel, shopItemsFixture } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/**
 * Brick Breaker on the platform: listed from the catalog, played on its route, its AI only for
 * admins, and its skins sold and worn through the ordinary shop. No platform code knows the game.
 */

const brickBreaker: GameResponse = {
  id: 6,
  slug: 'brick-breaker',
  name: 'Brick Breaker',
  description: 'Smash through levels and catch power-ups.',
  category: 'ARCADE',
  thumbnailUrl: '/thumbnails/brick-breaker.svg',
  accentColor: '#f97316',
  featured: false,
  scored: true,
}
const games = [...catalogFixture, brickBreaker]

const skin = (id: number, code: string, name: string, slot: string, icon: string, price: number, minLevel = 1): ShopItem => ({
  id,
  code,
  name,
  description: `${name}, for Brick Breaker.`,
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
  gameSlug: 'brick-breaker',
  slot,
})

const shopItems = [
  ...shopItemsFixture,
  skin(60, 'BRICK_PADDLE_CANDY', 'Candy Paddle', 'paddle', 'candy', 300),
  skin(61, 'BRICK_BALL_PLASMA', 'Plasma Ball', 'ball', 'plasma', 900, 4),
  skin(62, 'BRICK_THEME_NEON', 'Neon Bricks', 'bricks', 'neon', 800, 3),
]

const requested = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.some(([input]) => new URL(String(input), 'http://localhost').pathname === path)

describe('Brick Breaker in the arcade', () => {
  it('is listed in the catalog with the other games', async () => {
    mockApi({ games })
    renderRoute('/games')
    expect(await screen.findByRole('link', { name: /Brick Breaker/ })).toHaveAttribute('href', '/games/brick-breaker')
  })

  it('opens on its route, ready to play', async () => {
    mockApi({ games, user: pixel, shopItems })
    renderRoute('/games/brick-breaker')
    expect(await screen.findByRole('heading', { level: 1, name: 'Brick Breaker' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Brick Breaker arena/ })).toBeInTheDocument()
    expect(screen.getByText('Tap, click or press Space to launch')).toBeInTheDocument()
  })

  it('has a leaderboard tab like every game', async () => {
    mockApi({ games })
    renderRoute('/leaderboard?game=brick-breaker')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Brick Breaker' })).toBeInTheDocument())
  })

  it('offers AI mode to an admin, after the server allows it, and never to a player', async () => {
    const asPlayer = mockApi({ games, user: pixel, shopItems })
    const { unmount } = renderRoute('/games/brick-breaker')
    await screen.findByRole('button', { name: /Brick Breaker arena/ })
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
    expect(requested(asPlayer, '/api/ai/access')).toBe(false)
    unmount()

    const asAdmin = mockApi({ games, user: admin, shopItems })
    renderRoute('/games/brick-breaker')
    const modes = await screen.findByRole('group', { name: 'Play mode' })
    expect(requested(asAdmin, '/api/ai/access')).toBe(true)
    fireEvent.click(within(modes).getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('region', { name: 'AI mode' })).toBeInTheDocument()
  })
})

describe('Brick Breaker skins in the shop', () => {
  it('are shown with a picture and the game and slot they are for', async () => {
    mockApi({ games, user: pixel, shopItems, coins: 1000 })
    renderRoute('/shop?category=skins')
    const section = await screen.findByRole('region', { name: 'Game skins' })
    const paddle = within(section).getByRole('article', { name: 'Candy Paddle' })
    expect(await within(paddle).findByText('Brick Breaker · Paddle')).toBeInTheDocument()
    await waitFor(() => expect(paddle.querySelector('canvas')).not.toBeNull())
    expect(within(within(section).getByRole('article', { name: 'Plasma Ball' })).getByText('Unlocks at level 4')).toBeInTheDocument()
  })

  it('are bought in the shop and worn in the game', async () => {
    mockApi({ games, user: pixel, shopItems, coins: 1000 })
    renderRoute('/shop?category=skins')
    fireEvent.click(await screen.findByRole('button', { name: 'Buy Candy Paddle for 300 coins' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Buy it' }))
    expect(await screen.findByText(/Candy Paddle is yours and already equipped in its game/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Play now' }))
    const look = await screen.findByRole('region', { name: 'Your look' })
    await waitFor(() => expect(within(look).getByText('Candy Paddle')).toBeInTheDocument())
  })
})

describe('Brick Breaker skins for an admin', () => {
  const openCustomize = async () => {
    await screen.findByRole('button', { name: /Brick Breaker arena|played by the AI/ })
    fireEvent.click(screen.getAllByRole('button', { name: /Customize/ })[0])
    return screen.findByRole('dialog', { name: 'Customize your arcade' })
  }
  const coinsSpent = (fetchSpy: ReturnType<typeof mockApi>) =>
    fetchSpy.mock.calls.some(([input, init]) => new URL(String(input), 'http://localhost').pathname === '/api/shop/purchases' && init?.method === 'POST')

  it('are all ready to wear, with nothing to buy, and the choice is kept after a reload', async () => {
    const fetchSpy = mockApi({ games, user: admin, shopItems, coins: 0 })
    const { unmount } = renderRoute('/games/brick-breaker')
    let dialog = await openCustomize()
    // Every slot: the sold skins can be worn at once, even the one a player could not buy yet.
    for (const [tab, name] of [['Paddle', 'Candy Paddle'], ['Ball', 'Plasma Ball'], ['Bricks', 'Neon Bricks']] as const) {
      fireEvent.click(within(dialog).getByRole('tab', { name: tab }))
      expect(await within(dialog).findByRole('button', { name: `Equip ${name}` })).toBeInTheDocument()
      expect(within(dialog).getByText('Included')).toBeInTheDocument()
      expect(within(dialog).queryByRole('link', { name: /Get .* in the shop/ })).not.toBeInTheDocument()
    }
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Ball' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Equip Plasma Ball' }))
    await waitFor(() => expect(within(dialog).getByText('Equipped')).toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))
    const look = screen.getByRole('region', { name: 'Your look' })
    await waitFor(() => expect(within(look).getByText('Plasma Ball')).toBeInTheDocument())
    expect(coinsSpent(fetchSpy)).toBe(false)
    unmount()

    // A reload asks the server again: still worn, still not bought, no coins spent.
    renderRoute('/games/brick-breaker')
    const again = await screen.findByRole('region', { name: 'Your look' })
    await waitFor(() => expect(within(again).getByText('Plasma Ball')).toBeInTheDocument())
    dialog = await openCustomize()
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Ball' }))
    expect(await within(dialog).findByText('Equipped')).toBeInTheDocument()
    expect(coinsSpent(fetchSpy)).toBe(false)
  })

  it('show as included in the shop, to equip instead of buy', async () => {
    mockApi({ games, user: admin, shopItems, coins: 0 })
    renderRoute('/shop?category=skins')
    const section = await screen.findByRole('region', { name: 'Game skins' })
    const ball = within(section).getByRole('article', { name: 'Plasma Ball' })
    expect(await within(ball).findByRole('button', { name: 'Equip Plasma Ball' })).toBeEnabled()
    expect(within(ball).getByText('Included')).toBeInTheDocument()
    expect(within(ball).queryByRole('button', { name: /^Buy/ })).not.toBeInTheDocument()
    expect(within(ball).queryByText('Unlocks at level 4')).not.toBeInTheDocument()
    fireEvent.click(within(ball).getByRole('button', { name: 'Equip Plasma Ball' }))
    expect(await within(ball).findByRole('button', { name: 'Unequip Plasma Ball' })).toBeInTheDocument()
  })

  it('stay locked for a player, who buys them in the shop', async () => {
    mockApi({ games, user: pixel, shopItems, coins: 0 })
    renderRoute('/games/brick-breaker')
    const dialog = await openCustomize()
    expect(await within(dialog).findByRole('link', { name: 'Get Candy Paddle in the shop' })).toHaveAttribute('href', '/shop?category=skins')
    expect(within(dialog).queryByRole('button', { name: 'Equip Candy Paddle' })).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Included')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))

  })

  it('stay to be bought in the shop for a player', async () => {
    mockApi({ games, user: pixel, shopItems, coins: 1000 })
    renderRoute('/shop?category=skins')
    const section = await screen.findByRole('region', { name: 'Game skins' })
    const paddle = within(section).getByRole('article', { name: 'Candy Paddle' })
    expect(await within(paddle).findByRole('button', { name: 'Buy Candy Paddle for 300 coins' })).toBeInTheDocument()
    expect(within(paddle).queryByText('Included')).not.toBeInTheDocument()
    expect(within(paddle).queryByRole('button', { name: 'Equip Candy Paddle' })).not.toBeInTheDocument()
  })
})
