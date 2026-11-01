import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/api/auth'
import { chessServer, type ChessServerOptions } from '@/test/chessServer'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { createChessAi } from './ai/chessAi'
import ChessGame from './ChessGame'

function setup(options: ChessServerOptions = {}, user: SessionUser = pixel) {
  const server = chessServer(options)
  const onGameStart = vi.fn()
  mockApi({ user, handlers: [server.handler] })
  render(
    <MemoryRouter>
      <ChessGame onGameStart={onGameStart} onGameOver={vi.fn()} ai={user.role === 'ADMIN' ? createChessAi : undefined} />
    </MemoryRouter>,
  )
  return { server, onGameStart }
}

const board = () => screen.getByRole('grid', { name: /Chess board/ })
const square = (name: string) => within(board()).getByRole('gridcell', { name: new RegExp(`^${name},`) })
const playedMoves = () => screen.queryAllByLabelText(/^(White|Black): /).length
const status = () => screen.getAllByRole('status').find((element) => element.getAttribute('aria-live') === 'polite')!
const variationPosts = (server: ReturnType<typeof chessServer>) => server.calls.filter((call) => call.path.endsWith('/variations'))

async function play(uci: string) {
  const played = playedMoves()
  fireEvent.click(square(uci.slice(0, 2)))
  fireEvent.click(square(uci.slice(2, 4)))
  await waitFor(() => expect(playedMoves()).toBe(played + 1))
}

describe('Continue from here', () => {
  it('plays on from an earlier position in a variation of its own, and the game stays as it was', async () => {
    const { server, onGameStart } = setup({ current: { moves: ['e2e4', 'd7d5', 'e4d5'] } })
    await screen.findByRole('grid', { name: /Chess board/ })
    const game = server.match!
    // Live, there is nothing to continue: the game itself goes on.
    expect(screen.queryByRole('button', { name: 'Continue from here' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    fireEvent.click(within(screen.getByTestId('inspecting')).getByRole('button', { name: 'Continue from here' }))

    const banner = await screen.findByTestId('variation-banner')
    expect(banner).toHaveTextContent('Exploring a variation from after 1… d5')
    expect(banner).toHaveTextContent('Your game is unchanged')
    expect(variationPosts(server).map((call) => call.body)).toEqual([{ ply: 2 }])
    expect(playedMoves()).toBe(2)
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Live')
    // Not a new game for the hub.
    expect(onGameStart).not.toHaveBeenCalled()

    // Played like a local game, with takebacks; nothing to resign, and a player gets no hints here.
    await play('e4d5')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(playedMoves()).toBe(2))
    expect(screen.getByRole('button', { name: 'Resign' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^Hint/ })).toHaveTextContent('(not in a variation)')
    expect(screen.getByRole('button', { name: /^Hint/ })).toBeDisabled()

    // The game was never touched.
    expect(server.match).toBe(game)
    expect(game.moves).toEqual(['e2e4', 'd7d5', 'e4d5'])
    expect(game.revision).toBe(3)

    fireEvent.click(screen.getByRole('button', { name: 'Back to my game' }))
    await waitFor(() => expect(screen.queryByTestId('variation-banner')).not.toBeInTheDocument())
    expect(playedMoves()).toBe(3)
    expect(square('d5')).toHaveAccessibleName(/^d5, white pawn, last move/)
  })

  it('explores a finished game without changing its result', async () => {
    const { server } = setup({ current: { moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] } })
    await screen.findByRole('grid', { name: /Chess board/ })
    await waitFor(() => expect(status()).toHaveTextContent('Checkmate! Black wins'))
    // The final position is over: nothing to continue from it.
    expect(screen.queryByRole('button', { name: 'Continue from here' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue from here' }))
    await screen.findByTestId('variation-banner')
    expect(status()).toHaveTextContent('Black to move')
    // The mate again, in the variation this time: it is the variation's, not the game's.
    await play('d8h4')
    await waitFor(() => expect(status()).toHaveTextContent('Checkmate! Black wins'))
    expect(screen.getByTestId('variation-banner')).toBeInTheDocument()
    expect(server.match!.moves).toEqual(['f2f3', 'e7e5', 'g2g4', 'd8h4'])

    fireEvent.click(screen.getByRole('button', { name: 'Back to my game' }))
    await waitFor(() => expect(status()).toHaveTextContent('Checkmate! Black wins'))
    expect(playedMoves()).toBe(4)
  })

  it('offers to continue from a reviewed position too, in a game against Stockfish, without touching it', async () => {
    const { server } = setup({ current: { moves: ['e2e4', 'd7d5'], engine: { side: 'BLACK', difficulty: 'CLUB' } } }, admin)
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue from here' }))
    await screen.findByTestId('variation-banner')
    // Both sides are the player's in a variation (here Black, Stockfish's side in the game): it does not answer.
    await play('d7d5')
    expect(server.calls.filter((call) => call.path.endsWith('/engine-move'))).toHaveLength(0)
    expect(server.match!.moves).toEqual(['e2e4', 'd7d5'])
  })
})

describe('Hint, analysis and review stay apart', () => {
  it('a hint suggests one move, says what it does, and does not pass for an analysis', async () => {
    const { server } = setup({ current: { moves: ['f2f3', 'e7e5', 'g2g4'] } })
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(screen.getByRole('button', { name: /^Hint/ }))

    const card = await screen.findByText(/^Hint:/)
    const hint = card.closest('[role=status]') as HTMLElement
    expect(hint).toHaveTextContent('Qh4#')
    expect(within(hint).getByTestId('hint-ideas')).toHaveTextContent('It is checkmate.')
    expect(hint).toHaveTextContent('not a full analysis')
    expect(hint).toHaveTextContent("from White's side")
    // The board marks the move, nothing more: no analysis panel, no lines, no move labels.
    expect(screen.queryByRole('region', { name: 'Engine analysis' })).not.toBeInTheDocument()
    expect(document.querySelector('[data-quality]')).toBeNull()
    expect(server.calls.filter((call) => call.path.includes('/api/ai/'))).toHaveLength(0)
  })
})
