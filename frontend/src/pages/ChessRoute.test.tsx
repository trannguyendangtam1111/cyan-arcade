import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ShopItem } from '@/api/economy'
import type { GameResponse } from '@/api/games'
import { chessServer } from '@/test/chessServer'
import { admin, catalogFixture, mockApi, pixel, shopItemsFixture } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'

/**
 * Chess on the platform: listed from the catalog and played on its route, but unscored: no score
 * session is opened and it has no leaderboard tab. Its skins are sold and worn through the ordinary
 * shop. Its AI mode (games against Stockfish, analysis, reviews) reaches admins only, after the server
 * has said yes; players get move hints, counted by the server. No platform code knows the game.
 */

const chess: GameResponse = {
  id: 10,
  slug: 'chess',
  name: 'Chess',
  description: 'The classic game of kings and queens for two players on one device.',
  category: 'STRATEGY',
  thumbnailUrl: '/thumbnails/chess.svg',
  accentColor: '#4f46e5',
  featured: false,
  scored: false,
}
const games = [...catalogFixture, chess]

const skin = (id: number, code: string, name: string, slot: string, icon: string, price: number): ShopItem => ({
  id,
  code,
  name,
  description: `${name}, for Chess.`,
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
  gameSlug: 'chess',
  slot,
})

const shopItems = [
  ...shopItemsFixture,
  skin(95, 'CHESS_BOARD_MIDNIGHT', 'Midnight Hall', 'board', 'midnight', 700),
  skin(96, 'CHESS_PIECES_CANDY', 'Candy Set', 'pieces', 'candy', 350),
]

const requests = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.filter(([input]) => new URL(String(input), 'http://localhost').pathname === path)

describe('Chess in the arcade', () => {
  it('is listed in the catalog with the other games', async () => {
    mockApi({ games })
    renderRoute('/games')
    expect(await screen.findByRole('link', { name: /Chess/ })).toHaveAttribute('href', '/games/chess')
  })

  it('is played on its route without opening a score session', async () => {
    const server = chessServer()
    const fetchSpy = mockApi({ games, user: pixel, shopItems, handlers: [server.handler] })
    renderRoute('/games/chess')
    const board = await screen.findByRole('grid', { name: /Chess board/ })

    fireEvent.click(within(board).getByRole('gridcell', { name: /^e2,/ }))
    fireEvent.click(within(board).getByRole('gridcell', { name: /^e4,/ }))
    await waitFor(() => expect(within(board).getByRole('gridcell', { name: /^e4,/ })).toHaveAccessibleName('e4, white pawn, last move'))

    expect(requests(fetchSpy, '/api/game-sessions')).toHaveLength(0)
    expect(screen.queryByText(/Saving your score/)).not.toBeInTheDocument()
    // Still remembered for the hub's "Jump back in".
    expect(window.localStorage.getItem('cyan-arcade:recent-games')).toContain('chess')
  })

  it('has no leaderboard tab, being unscored', async () => {
    mockApi({ games })
    renderRoute('/leaderboard?game=chess')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Snake' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Chess' })).not.toBeInTheDocument()
  })

  it('offers its AI mode to an admin, after the server allows it, and never to a player', async () => {
    const asPlayer = mockApi({ games, user: pixel, shopItems, handlers: [chessServer().handler] })
    const { unmount } = renderRoute('/games/chess')
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(screen.getByRole('button', { name: /Hint/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Play vs Stockfish' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Engine analysis' })).not.toBeInTheDocument()
    expect(requests(asPlayer, '/api/ai/access')).toHaveLength(0)
    expect(asPlayer.mock.calls.some(([input]) => String(input).includes('/api/ai/chess'))).toBe(false)
    unmount()

    const asAdmin = mockApi({ games, user: admin, shopItems, handlers: [chessServer().handler] })
    renderRoute('/games/chess')
    expect(await screen.findByRole('region', { name: 'Play vs Stockfish' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Engine analysis' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Game review' })).toBeInTheDocument()
    expect(requests(asAdmin, '/api/ai/access')).toHaveLength(1)
    // There is no Human/AI switch: the engine is an opponent and an analyst, not an autoplayer.
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
  })
})

describe('Chess skins', () => {
  it('are sold in the shop with a picture and the slot they dress', async () => {
    mockApi({ games, user: pixel, shopItems, coins: 1000 })
    renderRoute('/shop?category=skins')
    const section = await screen.findByRole('region', { name: 'Game skins' })
    const item = within(section).getByRole('article', { name: 'Midnight Hall' })
    expect(await within(item).findByText('Chess · Board')).toBeInTheDocument()
    expect(within(item).getByRole('button', { name: 'Buy Midnight Hall for 700 coins' })).toBeInTheDocument()
  })

  it('stay locked in the game for a player who has not bought them', async () => {
    mockApi({ games, user: pixel, shopItems, handlers: [chessServer().handler] })
    renderRoute('/games/chess')
    const look = await screen.findByRole('region', { name: 'Your look' })
    expect(await within(look).findByRole('radio', { name: 'Midnight Hall (in the shop)' })).toBeDisabled()
  })

  it('are worn by an admin without buying them, and change only colours', async () => {
    const fetchSpy = mockApi({ games, user: admin, shopItems, coins: 0, handlers: [chessServer().handler] })
    renderRoute('/games/chess')
    const look = await screen.findByRole('region', { name: 'Your look' })
    fireEvent.click(await within(look).findByRole('radio', { name: 'Midnight Hall' }))

    await waitFor(() => expect(within(look).getByRole('radio', { name: 'Midnight Hall' })).toHaveAttribute('aria-checked', 'true'))
    const board = screen.getByRole('grid', { name: /Chess board/ })
    expect(within(board).getByRole('gridcell', { name: /^a1,/ })).toHaveStyle({ background: '#222d4a' })
    expect(within(board).getAllByRole('gridcell')).toHaveLength(64)
    expect(requests(fetchSpy, '/api/shop/purchases')).toHaveLength(0)
  })
})
