import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ShopItem } from '@/api/economy'
import type { GameResponse } from '@/api/games'
import { admin, catalogFixture, mockApi, pixel, SESSION_ID, shopItemsFixture } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'
import { wordleServer } from '@/test/wordleServer'

/**
 * Word Guess on the platform: listed from the catalog, played on its route with its score submitted
 * through the platform's session, its AI only for admins, and its skins sold and worn through the
 * ordinary shop. No platform code knows the game.
 */

const wordle: GameResponse = {
  id: 7,
  slug: 'wordle',
  name: 'Word Guess',
  description: 'Find the hidden five-letter word in six guesses.',
  category: 'PUZZLE',
  thumbnailUrl: '/thumbnails/wordle.svg',
  accentColor: '#ec4899',
  featured: false,
}
const games = [...catalogFixture, wordle]

const skin = (id: number, code: string, name: string, slot: string, icon: string, price: number): ShopItem => ({
  id,
  code,
  name,
  description: `${name}, for Word Guess.`,
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
  gameSlug: 'wordle',
  slot,
})

const shopItems = [
  ...shopItemsFixture,
  skin(80, 'WORDLE_TILES_NEON', 'Neon Tiles', 'tiles', 'neon', 700),
  skin(81, 'WORDLE_KEYS_SAKURA', 'Sakura Keys', 'keyboard', 'sakura', 300),
]

const requests = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.filter(([input]) => new URL(String(input), 'http://localhost').pathname === path)

const type = (word: string) => {
  for (const key of [...word, 'Enter']) fireEvent.keyDown(window, { key })
}

describe('Word Guess in the arcade', () => {
  it('is listed in the catalog with the other games', async () => {
    mockApi({ games })
    renderRoute('/games')
    expect(await screen.findByRole('link', { name: /Word Guess/ })).toHaveAttribute('href', '/games/wordle')
  })

  it('submits a solved daily puzzle through the platform\'s session, with the server\'s score', async () => {
    const server = wordleServer()
    const fetchSpy = mockApi({ games, user: pixel, shopItems, handlers: [server.handler] })
    renderRoute('/games/wordle')
    await screen.findByRole('grid', { name: 'Daily Word #281' })

    type('APPLE')

    expect(await screen.findByText(/saved\./)).toBeInTheDocument()
    expect(server.dailyRun?.sessionId).toBe(SESSION_ID)
    const [finish] = requests(fetchSpy, `/api/game-sessions/${SESSION_ID}/finish`)
    expect(JSON.parse(String(finish[1]?.body))).toEqual({
      score: 600,
      details: { solved: 1, guesses: 1, hints: 0, speed: 6, cleanSolve: 1, oneHintSolve: 0, streak: 1 },
    })
    expect(requests(fetchSpy, '/api/game-sessions')).toHaveLength(1)
  })

  it('has a leaderboard tab like every game', async () => {
    mockApi({ games })
    renderRoute('/leaderboard?game=wordle')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Word Guess' })).toBeInTheDocument())
  })

  it('offers AI mode to an admin, after the server allows it, and never to a player', async () => {
    const asPlayer = mockApi({ games, user: pixel, shopItems, handlers: [wordleServer().handler] })
    const { unmount } = renderRoute('/games/wordle')
    await screen.findByRole('grid', { name: 'Daily Word #281' })
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
    expect(requests(asPlayer, '/api/ai/access')).toHaveLength(0)
    unmount()

    const asAdmin = mockApi({ games, user: admin, shopItems, handlers: [wordleServer().handler] })
    renderRoute('/games/wordle')
    const modes = await screen.findByRole('group', { name: 'Play mode' })
    expect(requests(asAdmin, '/api/ai/access')).toHaveLength(1)
    fireEvent.click(within(modes).getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('region', { name: 'AI mode' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'AI settings' })).toBeInTheDocument()
  })
})

describe('Word Guess skins', () => {
  it('are sold in the shop with a picture and the slot they dress', async () => {
    mockApi({ games, user: pixel, shopItems, coins: 1000 })
    renderRoute('/shop?category=skins')
    const section = await screen.findByRole('region', { name: 'Game skins' })
    const tiles = within(section).getByRole('article', { name: 'Neon Tiles' })
    expect(await within(tiles).findByText('Word Guess · Tiles')).toBeInTheDocument()
    expect(within(tiles).getByRole('button', { name: 'Buy Neon Tiles for 700 coins' })).toBeInTheDocument()
  })

  it('stay locked in the game for a player who has not bought them', async () => {
    mockApi({ games, user: pixel, shopItems, handlers: [wordleServer().handler] })
    renderRoute('/games/wordle')
    const look = await screen.findByRole('region', { name: 'Your look' })
    expect(await within(look).findByRole('radio', { name: 'Neon Tiles (in the shop)' })).toBeDisabled()
  })

  it('are worn by an admin without buying them', async () => {
    const fetchSpy = mockApi({ games, user: admin, shopItems, coins: 0, handlers: [wordleServer().handler] })
    renderRoute('/games/wordle')
    const look = await screen.findByRole('region', { name: 'Your look' })
    const neon = await within(look).findByRole('radio', { name: 'Neon Tiles' })
    fireEvent.click(neon)

    await waitFor(() => expect(within(look).getByRole('radio', { name: 'Neon Tiles' })).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByRole('grid', { name: 'Daily Word #281' })).toHaveStyle({ background: '#0b1120' })
    expect(requests(fetchSpy, '/api/shop/purchases')).toHaveLength(0)
  })
})
