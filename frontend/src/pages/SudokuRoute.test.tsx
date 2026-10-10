import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ShopItem } from '@/api/economy'
import type { GameResponse } from '@/api/games'
import { admin, catalogFixture, mockApi, pixel, SESSION_ID, shopItemsFixture } from '@/test/mockApi'
import { renderRoute } from '@/test/renderWithProviders'
import { NEARLY_DONE, sudokuServer } from '@/test/sudokuServer'

/**
 * Sudoku on the platform: listed from the catalog, played on its route with its score submitted
 * through the platform's session, its AI only for admins, and its skins sold and worn through the
 * ordinary shop. No platform code knows the game.
 */

const sudoku: GameResponse = {
  id: 8,
  slug: 'sudoku',
  name: 'Sudoku',
  description: 'Fill the grid so every row, column and box holds 1 to 9.',
  category: 'PUZZLE',
  thumbnailUrl: '/thumbnails/sudoku.svg',
  accentColor: '#06b6d4',
  featured: false,
  scored: true,
}
const games = [...catalogFixture, sudoku]

const skin = (id: number, code: string, name: string, slot: string, icon: string, price: number): ShopItem => ({
  id,
  code,
  name,
  description: `${name}, for Sudoku.`,
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
  gameSlug: 'sudoku',
  slot,
})

const shopItems = [
  ...shopItemsFixture,
  skin(90, 'SUDOKU_BOARD_MIDNIGHT', 'Midnight Grid', 'board', 'midnight', 700),
  skin(91, 'SUDOKU_PAD_CANDY', 'Candy Pad', 'pad', 'candy', 300),
]

const requests = (fetchSpy: ReturnType<typeof mockApi>, path: string) =>
  fetchSpy.mock.calls.filter(([input]) => new URL(String(input), 'http://localhost').pathname === path)

describe('Sudoku in the arcade', () => {
  it('is listed in the catalog with the other games', async () => {
    mockApi({ games })
    renderRoute('/games')
    expect(await screen.findByRole('link', { name: /Sudoku/ })).toHaveAttribute('href', '/games/sudoku')
  })

  it('submits a solved daily puzzle through the platform\'s session, with the server\'s score', async () => {
    const server = sudokuServer({ givens: NEARLY_DONE })
    const fetchSpy = mockApi({ games, user: pixel, shopItems, handlers: [server.handler] })
    renderRoute('/games/sudoku')
    fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
    const board = await screen.findByRole('grid', { name: /Sudoku board/ })
    await waitFor(() => expect(within(board).getAllByRole('gridcell')[0]).toHaveAccessibleName(/clue/))
    fireEvent.click(within(board).getAllByRole('gridcell')[2])
    fireEvent.keyDown(window, { key: '4' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: '6' })

    expect(await screen.findByText(/saved\./)).toBeInTheDocument()
    expect(server.dailyRun?.sessionId).toBe(SESSION_ID)
    const [finish] = requests(fetchSpy, `/api/game-sessions/${SESSION_ID}/finish`)
    expect(JSON.parse(String(finish[1]?.body))).toMatchObject({ score: 5250, details: { solvedLevel: 3, dailyGrade: 4, streak: 1 } })
    expect(requests(fetchSpy, '/api/game-sessions')).toHaveLength(1)
  })

  it('has a leaderboard tab like every game', async () => {
    mockApi({ games })
    renderRoute('/leaderboard?game=sudoku')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sudoku' })).toBeInTheDocument())
  })

  it('offers AI mode to an admin, after the server allows it, and never to a player', async () => {
    const asPlayer = mockApi({ games, user: pixel, shopItems, handlers: [sudokuServer().handler] })
    const { unmount } = renderRoute('/games/sudoku')
    await screen.findByRole('heading', { name: 'Daily Sudoku #282' })
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
    expect(requests(asPlayer, '/api/ai/access')).toHaveLength(0)
    unmount()

    const asAdmin = mockApi({ games, user: admin, shopItems, handlers: [sudokuServer().handler] })
    renderRoute('/games/sudoku')
    const modes = await screen.findByRole('group', { name: 'Play mode' })
    expect(requests(asAdmin, '/api/ai/access')).toHaveLength(1)
    fireEvent.click(within(modes).getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('region', { name: 'AI mode' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'AI solver' })).toBeInTheDocument()
  })
})

describe('Sudoku skins', () => {
  it('are sold in the shop with a picture and the slot they dress', async () => {
    mockApi({ games, user: pixel, shopItems, coins: 1000 })
    renderRoute('/shop?category=skins')
    const section = await screen.findByRole('region', { name: 'Game skins' })
    const grid = within(section).getByRole('article', { name: 'Midnight Grid' })
    expect(await within(grid).findByText('Sudoku · Board')).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: 'Buy Midnight Grid for 700 coins' })).toBeInTheDocument()
  })

  it('stay locked in the game for a player who has not bought them', async () => {
    mockApi({ games, user: pixel, shopItems, handlers: [sudokuServer().handler] })
    renderRoute('/games/sudoku')
    const look = await screen.findByRole('region', { name: 'Your look' })
    expect(await within(look).findByRole('radio', { name: 'Midnight Grid (in the shop)' })).toBeDisabled()
  })

  it('are worn by an admin without buying them', async () => {
    const fetchSpy = mockApi({ games, user: admin, shopItems, coins: 0, handlers: [sudokuServer().handler] })
    renderRoute('/games/sudoku')
    const look = await screen.findByRole('region', { name: 'Your look' })
    fireEvent.click(await within(look).findByRole('radio', { name: 'Midnight Grid' }))

    await waitFor(() => expect(within(look).getByRole('radio', { name: 'Midnight Grid' })).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByRole('grid', { name: /Sudoku board/ })).toHaveStyle({ '--sd-cell': '#0f172a' })
    expect(requests(fetchSpy, '/api/shop/purchases')).toHaveLength(0)
  })
})
