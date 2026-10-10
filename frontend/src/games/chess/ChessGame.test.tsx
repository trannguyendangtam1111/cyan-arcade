import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chessServer, PROMOTION, type ChessServerOptions } from '@/test/chessServer'
import { mockApi, pixel } from '@/test/mockApi'
import ChessGame from './ChessGame'
import { ORIENTATION_KEY } from './hooks/useOrientation'

function setup(options: ChessServerOptions = {}) {
  const server = chessServer(options)
  mockApi({ user: pixel, handlers: [server.handler] })
  const onGameStart = vi.fn()
  const onGameOver = vi.fn()
  render(
    <MemoryRouter>
      <ChessGame onGameStart={onGameStart} onGameOver={onGameOver} />
    </MemoryRouter>,
  )
  return { server, onGameStart, onGameOver }
}

const board = () => screen.getByRole('grid', { name: /Chess board/ })
const square = (name: string) => within(board()).getByRole('gridcell', { name: new RegExp(`^${name},`) })
const click = (name: string) => fireEvent.click(square(name))
const status = () => screen.getAllByRole('status').find((element) => element.getAttribute('aria-live') === 'polite')!
const moves = () => screen.queryByRole('list', { name: 'Moves played' })
const playedMoves = () => screen.queryAllByLabelText(/^(White|Black): /).length

/** Plays moves by clicking from and to, each time waiting for the server's answer to show. */
async function play(...ucis: string[]) {
  for (const uci of ucis) {
    const played = playedMoves()
    click(uci.slice(0, 2))
    click(uci.slice(2, 4))
    await waitFor(() => expect(playedMoves()).toBe(played + 1))
  }
}

afterEach(() => {
  window.localStorage.clear()
})

describe('Chess', () => {
  it('starts a new two-player game from the starting position', async () => {
    const { server } = setup()

    expect(await screen.findByRole('grid', { name: 'Chess board, White at the bottom' })).toBeInTheDocument()
    expect(within(board()).getAllByRole('gridcell')).toHaveLength(64)
    expect(square('e1')).toHaveAccessibleName('e1, white king')
    expect(square('d8')).toHaveAccessibleName('d8, black queen')
    expect(square('e4')).toHaveAccessibleName('e4, empty')
    expect(status()).toHaveTextContent('White to move')
    expect(screen.getByText('No moves yet. White starts.')).toBeInTheDocument()
    expect(server.calls.map((call) => `${call.method} ${call.path}`)).toEqual(['GET /api/chess/matches/current', 'POST /api/chess/matches'])
  })

  it('highlights the selected piece and only the legal squares the server lists', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })

    click('g1')
    expect(square('g1')).toHaveAttribute('aria-selected', 'true')
    expect(square('f3')).toHaveAttribute('data-target', 'move')
    expect(square('h3')).toHaveAttribute('data-target', 'move')
    expect(square('e2')).not.toHaveAttribute('data-target')
    expect(square('g3')).not.toHaveAttribute('data-target')
    expect(square('f3')).toHaveAccessibleName('f3, empty, legal move')

    // Another of one's own pieces takes over the selection; the opponent's pieces cannot be picked up.
    click('e2')
    expect(square('e2')).toHaveAttribute('aria-selected', 'true')
    expect(square('g1')).toHaveAttribute('aria-selected', 'false')
    expect(within(board()).getAllByRole('gridcell').filter((cell) => cell.hasAttribute('data-target')).map((cell) => cell.dataset.square)).toEqual(['e4', 'e3'])
    click('e7')
    expect(square('e7')).toHaveAttribute('aria-selected', 'false')
    expect(within(board()).getAllByRole('gridcell').some((cell) => cell.hasAttribute('data-target'))).toBe(false)
  })

  it('sends a move with its revision, then shows the last move, the history and whose turn it is', async () => {
    const { server, onGameStart } = setup()
    await screen.findByRole('grid', { name: /Chess board/ })

    await play('e2e4')

    expect(server.calls.at(-1)).toEqual({ method: 'POST', path: '/api/chess/matches/match-1/moves', body: { revision: 0, move: 'e2e4' } })
    expect(square('e4')).toHaveAccessibleName('e4, white pawn, last move')
    expect(square('e2')).toHaveAttribute('data-last', 'true')
    expect(status()).toHaveTextContent('Black to move')
    expect(within(moves()!).getByLabelText('White: e4')).toHaveAttribute('aria-current', 'step')
    expect(onGameStart).toHaveBeenCalledOnce()

    // White cannot move again: it is Black's turn.
    click('d2')
    expect(square('d2')).toHaveAttribute('aria-selected', 'false')
  })

  it('marks captures, shows what each side has taken and records the move in SAN', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('e2e4', 'd7d5')

    click('e4')
    expect(square('d5')).toHaveAttribute('data-target', 'capture')
    expect(square('d5')).toHaveAccessibleName('d5, black pawn, capture, last move')
    expect(square('e5')).toHaveAttribute('data-target', 'move')
    click('d5')
    await waitFor(() => expect(playedMoves()).toBe(3))

    expect(screen.getByRole('img', { name: 'White has taken pawn' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'White has taken pawn' })).toHaveTextContent('+1')
    expect(screen.getByRole('img', { name: 'Black has taken nothing yet' })).toBeInTheDocument()
    const sheet = within(moves()!)
    expect(sheet.getByText('1.')).toBeInTheDocument()
    expect(sheet.getByText('2.')).toBeInTheDocument()
    expect(sheet.getByLabelText('White: exd5')).toHaveAttribute('aria-current', 'step')
  })

  it('shows checkmate, the winner and stops the board', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })

    await play('f2f3', 'e7e5', 'g2g4', 'd8h4')

    expect(status()).toHaveTextContent('Checkmate! Black wins')
    expect(status()).toHaveTextContent('0-1')
    expect(square('e1')).toHaveAttribute('data-check', 'true')
    expect(square('e1')).toHaveAccessibleName('e1, white king, in check')
    expect(within(moves()!).getByLabelText('Black: Qh4#')).toBeInTheDocument()
    expect(within(status()).getByRole('button', { name: 'New game' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Resign' })).toBeDisabled()

    click('d2')
    expect(square('d2')).toHaveAttribute('aria-selected', 'false')
  })

  it('asks which piece a promoting pawn becomes and sends that choice', async () => {
    const { server } = setup({ script: PROMOTION })
    await screen.findByRole('grid', { name: /Chess board/ })

    click('g7')
    expect(square('g8')).toHaveAccessibleName('g8, empty, legal move, promotion')
    click('g8')
    const dialog = await screen.findByRole('dialog', { name: 'Promote your pawn' })
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(expect.arrayContaining(['queen', 'rook', 'bishop', 'knight']))

    fireEvent.click(within(dialog).getByRole('button', { name: 'knight' }))

    await waitFor(() => expect(square('g8')).toHaveAccessibleName('g8, white knight, last move'))
    expect(server.calls.at(-1)?.body).toEqual({ revision: 0, move: 'g7g8n' })
    expect(within(moves()!).getByLabelText('White: g8=N')).toBeInTheDocument()
  })

  it('puts the pawn back when the promotion is cancelled', async () => {
    const { server } = setup({ script: PROMOTION })
    await screen.findByRole('grid', { name: /Chess board/ })

    click('g7')
    click('g8')
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Promote your pawn' })).getByRole('button', { name: 'Close' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Promote your pawn' })).not.toBeInTheDocument())
    expect(server.calls.some((call) => call.path.endsWith('/moves'))).toBe(false)
    expect(square('g7')).toHaveAccessibleName('g7, white pawn')
  })

  it('turns the board round and remembers it on this device', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    const first = () => within(board()).getAllByRole('gridcell')[0].dataset.square

    expect(first()).toBe('a8')
    fireEvent.click(screen.getByRole('button', { name: 'Flip' }))

    expect(screen.getByRole('grid', { name: 'Chess board, Black at the bottom' })).toBeInTheDocument()
    expect(first()).toBe('h1')
    expect(within(board()).getAllByRole('gridcell')[63].dataset.square).toBe('a8')
    expect(window.localStorage.getItem(ORIENTATION_KEY)).toBe('BLACK')
  })

  it('moves around the board with the keyboard', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })

    square('e2').focus()
    fireEvent.keyDown(square('e2'), { key: 'ArrowUp' })
    expect(square('e3')).toHaveFocus()
    fireEvent.keyDown(square('e3'), { key: 'ArrowLeft' })
    expect(square('d3')).toHaveFocus()
    fireEvent.keyDown(square('d3'), { key: 'ArrowDown' })
    fireEvent.keyDown(square('d2'), { key: 'ArrowDown' })
    fireEvent.keyDown(square('d1'), { key: 'ArrowDown' })
    expect(square('d1')).toHaveFocus()
  })

  it('takes a move back and replays it, both from the server', async () => {
    const { server } = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('e2e4')

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(square('e2')).toHaveAccessibleName('e2, white pawn'))
    expect(server.calls.at(-1)).toMatchObject({ path: '/api/chess/matches/match-1/undo', body: { revision: 1 } })
    expect(status()).toHaveTextContent('White to move')

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(square('e4')).toHaveAccessibleName('e4, white pawn, last move'))
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('confirms before resigning and lets either side resign', async () => {
    const { server } = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('e2e4')

    fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
    const dialog = await screen.findByRole('dialog', { name: 'Resign the game?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep playing' }))
    expect(server.calls.some((call) => call.path.endsWith('/resign'))).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Resign the game?' })).getByRole('button', { name: 'White resigns' }))

    await waitFor(() => expect(status()).toHaveTextContent('Black wins'))
    expect(status()).toHaveTextContent('White resigned')
    expect(server.calls.at(-1)?.body).toEqual({ revision: 1, side: 'WHITE' })
  })

  it('offers a draw for the side to move and lets the other side accept it', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })

    fireEvent.click(screen.getByRole('button', { name: 'Offer draw' }))
    expect(await screen.findByText('White offers a draw. Black, do you accept?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Offer draw' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Accept draw' }))
    await waitFor(() => expect(status()).toHaveTextContent('Draw'))
    expect(status()).toHaveTextContent('Draw agreed')
    expect(status()).toHaveTextContent('1/2-1/2')
  })

  it('lets the side to move claim a draw the server allows', async () => {
    const { server } = setup({ claimableDraw: 'THREEFOLD_REPETITION' })
    await screen.findByRole('grid', { name: /Chess board/ })

    expect(screen.getByText('White may claim a draw by threefold repetition.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Claim draw' }))

    await waitFor(() => expect(status()).toHaveTextContent('Threefold repetition'))
    expect(server.calls.at(-1)?.body).toEqual({ revision: 0, action: 'CLAIM', side: 'WHITE' })
  })

  it('confirms before leaving a game in progress for a new one', async () => {
    const { server } = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('e2e4')

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    const dialog = await screen.findByRole('dialog', { name: 'Start a new game?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'New game' }))

    await waitFor(() => expect(screen.getByText('No moves yet. White starts.')).toBeInTheDocument())
    expect(server.calls.filter((call) => call.method === 'POST' && call.path === '/api/chess/matches')).toHaveLength(2)
    expect(server.match?.id).toBe('match-2')
  })

  it('picks the game in progress up again after a reload', async () => {
    const { server, onGameStart } = setup({ current: { moves: ['e2e4', 'd7d5'] } })

    await waitFor(() => expect(square('d5')).toHaveAccessibleName('d5, black pawn, last move'))
    expect(within(moves()!).getByLabelText('Black: d5')).toBeInTheDocument()
    expect(server.calls.some((call) => call.method === 'POST')).toBe(false)
    expect(onGameStart).not.toHaveBeenCalled()
  })

  it('brings the board up to date when the game moved on elsewhere', async () => {
    const { server } = setup()
    await screen.findByRole('grid', { name: /Chess board/ })

    // Another tab plays 1.e4; this one still shows the start and tries 1.d4.
    server.moveElsewhere('e2e4')
    click('d2')
    click('d4')

    expect(await screen.findByText('The game changed elsewhere, so the board was brought up to date.')).toBeInTheDocument()
    expect(square('e4')).toHaveAccessibleName('e4, white pawn, last move')
    expect(square('d4')).toHaveAccessibleName('d4, empty')
    expect(status()).toHaveTextContent('Black to move')
  })

  it('says so when the server cannot be reached, and keeps the position', async () => {
    const { server } = setup()
    await screen.findByRole('grid', { name: /Chess board/ })

    server.failNext = true
    click('e2')
    click('e4')

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the server")
    expect(square('e2')).toHaveAccessibleName('e2, white pawn')
    // The next try goes through.
    await play('e2e4')
    expect(square('e4')).toHaveAccessibleName('e4, white pawn, last move')
  })

  it('offers a retry when the board cannot be set up', async () => {
    setup({ failFirst: true })

    expect(await screen.findByRole('heading', { name: "Couldn't set up the board" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('grid', { name: /Chess board/ })).toBeInTheDocument()
  })
})
