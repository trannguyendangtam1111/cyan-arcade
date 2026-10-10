import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/api/auth'
import { chessServer, type ChessServerOptions } from '@/test/chessServer'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { barShare, createChessAi, describe as describeEvaluation, step, stepToError } from './ai/chessAi'
import ChessGame from './ChessGame'
import type { Evaluation, ReviewedMove } from './types/chessTypes'

function setup(options: ChessServerOptions = {}, user: SessionUser | null = pixel, withAi = false) {
  const server = chessServer(options)
  mockApi({ user, handlers: [server.handler] })
  render(
    <MemoryRouter>
      <ChessGame onGameStart={vi.fn()} onGameOver={vi.fn()} ai={withAi ? createChessAi : undefined} />
    </MemoryRouter>,
  )
  return server
}

const board = () => screen.getByRole('grid', { name: /Chess board/ })
const square = (name: string) => within(board()).getByRole('gridcell', { name: new RegExp(`^${name},`) })
const status = () => screen.getAllByRole('status').find((element) => element.getAttribute('aria-live') === 'polite')!
const playedMoves = () => screen.queryAllByLabelText(/^(White|Black): /).length
const hintButton = () => screen.getByRole('button', { name: /^Hint/ })

async function play(uci: string) {
  const played = playedMoves()
  fireEvent.click(square(uci.slice(0, 2)))
  fireEvent.click(square(uci.slice(2, 4)))
  await waitFor(() => expect(playedMoves()).toBe(played + 1))
}

afterEach(() => {
  window.localStorage.clear()
})

describe('Move hints', () => {
  it('shows the suggested move on the board, in SAN, and the hints the server says are left', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(hintButton()).toHaveTextContent('(3 left)')

    fireEvent.click(hintButton())

    const card = await screen.findByText(/^Hint:/)
    expect(card).toHaveTextContent('Hint: e4')
    expect(screen.getByText('e5 Nf3')).toBeInTheDocument()
    expect(square('e2')).toHaveAttribute('data-hint', 'from')
    expect(square('e4')).toHaveAttribute('data-hint', 'to')
    expect(square('e4')).toHaveAccessibleName('e4, empty, suggested move to here')
    expect(hintButton()).toHaveTextContent('(2 left)')
    expect(server.calls.at(-1)).toEqual({ method: 'POST', path: '/api/chess/matches/match-1/hint', body: { revision: 0 } })
    // The hint never moves anything by itself.
    expect(square('e2')).toHaveAccessibleName(/^e2, white pawn/)
    expect(playedMoves()).toBe(0)
  })

  it('goes away once the board changes, whatever move is played', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(hintButton())
    await screen.findByText(/^Hint:/)

    await play('f2f3')

    expect(screen.queryByText(/^Hint:/)).not.toBeInTheDocument()
    expect(within(board()).getAllByRole('gridcell').some((cell) => cell.hasAttribute('data-hint'))).toBe(false)
  })

  it('stops at the server\'s limit, which a reload does not reset', async () => {
    setup({ current: { moves: [], hintsUsed: 3 } })
    await screen.findByRole('grid', { name: /Chess board/ })

    expect(hintButton()).toHaveTextContent('(none left)')
    expect(hintButton()).toBeDisabled()
  })

  it('says so when the server refuses one, and the board stays as it was', async () => {
    const server = setup({ current: { moves: [], hintsUsed: 2 } })
    await screen.findByRole('grid', { name: /Chess board/ })
    server.match!.hintsUsed = 3

    fireEvent.click(hintButton())

    expect(await screen.findByText(/No hints left in this game \(3 per game\)/)).toBeInTheDocument()
    expect(screen.queryByText(/^Hint:/)).not.toBeInTheDocument()
  })

  it('reports an engine failure without spending a hint', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    server.engineFailures = 1

    fireEvent.click(hintButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('The chess engine did not answer properly')
    expect(server.match!.hintsUsed).toBe(0)
    expect(hintButton()).toHaveTextContent('(3 left)')
    fireEvent.click(hintButton())
    expect(await screen.findByText(/^Hint:/)).toBeInTheDocument()
  })

  it('asks guests to sign in instead', async () => {
    setup({}, null)
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(screen.queryByRole('button', { name: /^Hint/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Log in for move hints' })).toBeInTheDocument()
  })

  it('give an admin as many as the server allows', async () => {
    setup({}, admin)
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(hintButton()).toHaveTextContent('(no limit)')
  })
})

describe('AI mode (admins)', () => {
  it('appears only with the game\'s AI, which the platform gives admins alone', async () => {
    setup({}, pixel, false)
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(screen.queryByRole('region', { name: 'Play vs Stockfish' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Engine analysis' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Game review' })).not.toBeInTheDocument()
  })

  it('starts a game against Stockfish at the chosen side and difficulty, and the engine answers by itself', async () => {
    const server = setup({}, admin, true)
    const panel = await screen.findByRole('region', { name: 'Play vs Stockfish' })
    await waitFor(() => expect(within(panel).getByRole('combobox')).toBeEnabled())

    fireEvent.click(within(panel).getByRole('radio', { name: 'Play Black' }))
    fireEvent.change(within(panel).getByRole('combobox'), { target: { value: 'BEGINNER' } })
    expect(within(panel).getByText(/Skill Level 0 of 20/)).toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Start game' }))

    // Stockfish plays White and moves first; the board turns to the player's side.
    await waitFor(() => expect(square('e4')).toHaveAccessibleName('e4, white pawn, last move'))
    expect(server.calls.find((call) => call.path === '/api/ai/chess/matches')?.body).toEqual({ playerSide: 'BLACK', difficulty: 'BEGINNER' })
    expect(server.calls.find((call) => call.path.endsWith('/engine-move'))?.body).toEqual({ revision: 0 })
    expect(screen.getByRole('grid', { name: 'Chess board, Black at the bottom' })).toBeInTheDocument()
    expect(status()).toHaveTextContent('You play Black against Stockfish (Beginner: Skill Level 0 of 20)')

    await play('d7d5')
    await waitFor(() => expect(square('d5')).toHaveAccessibleName('d5, white pawn, last move'))
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Offer draw' })).toBeDisabled()
  })

  it('keeps the board still while Stockfish thinks, and offers a retry if it fails', async () => {
    const server = setup({ current: { moves: [], engine: { side: 'WHITE', difficulty: 'CLUB' } } }, admin, true)
    server.engineFailures = 1
    await screen.findByRole('grid', { name: /Chess board/ })

    expect(await screen.findByText("Stockfish could not move. The game is unchanged.")).toBeInTheDocument()
    // White is Stockfish's: nothing can be picked up for it.
    fireEvent.click(square('e2'))
    expect(square('e2')).toHaveAttribute('aria-selected', 'false')
    expect(server.match!.moves).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: "Retry Stockfish's move" }))
    await waitFor(() => expect(square('e4')).toHaveAccessibleName('e4, white pawn, last move'))
    expect(screen.queryByText("Stockfish could not move. The game is unchanged.")).not.toBeInTheDocument()
  })

  it('evaluates the position from White\'s side with a bar, the best move and its lines', async () => {
    const server = setup({}, admin, true)
    const panel = await screen.findByRole('region', { name: 'Engine analysis' })
    fireEvent.change(within(panel).getByLabelText('Lines'), { target: { value: '2' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Evaluate position' }))

    expect(await within(panel).findByTestId('evaluation-display')).toHaveTextContent('+0.34')
    expect(within(panel).getByRole('meter', { name: 'Evaluation' })).toHaveAttribute('aria-valuetext', 'White is slightly better (+0.34)')
    expect(within(panel).getByText('a3')).toBeInTheDocument()
    expect(within(within(panel).getByRole('list', { name: 'Principal variations' })).getAllByRole('listitem')).toHaveLength(2)
    expect(within(panel).getByText(/Depth 16 of 16/)).toBeInTheDocument()
    expect(server.calls.at(-1)?.body).toEqual({ revision: 0, depth: 16, lines: 2 })
  })

  it('shows a mate as a mate, never as centipawns', async () => {
    setup({ evaluation: { kind: 'MATE', centipawns: 0, mateIn: 2, matingSide: 'BLACK', display: '#-2', whiteWinPercent: 0, favoured: 'BLACK' } }, admin, true)
    const panel = await screen.findByRole('region', { name: 'Engine analysis' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Evaluate position' }))

    expect(await within(panel).findByTestId('evaluation-display')).toHaveTextContent('#-2')
    expect(within(panel).getByRole('meter', { name: 'Evaluation' })).toHaveAttribute('aria-valuetext', 'Black mates in 2')
    expect(within(panel).getByRole('meter', { name: 'Evaluation' })).toHaveAttribute('aria-valuenow', '0')
  })

  it('drops an evaluation once the board has changed', async () => {
    setup({}, admin, true)
    const panel = await screen.findByRole('region', { name: 'Engine analysis' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Evaluate position' }))
    await within(panel).findByTestId('evaluation-display')

    await play('e2e4')

    expect(within(panel).queryByTestId('evaluation-display')).not.toBeInTheDocument()
  })

  it('reviews a finished game move by move, with labels, the engine\'s choice and the board at each move', async () => {
    const server = setup({ current: { moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] }, classifications: ['INACCURACY', 'GOOD', 'BLUNDER', 'BEST'] }, admin, true)
    const panel = await screen.findByRole('region', { name: 'Game review' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Review game' }))

    expect(await within(panel).findByText(/Analysing 0 of 5 positions/)).toBeInTheDocument()
    const list = await within(panel).findByRole('list', { name: 'Reviewed moves' }, { timeout: 3000 })
    expect(within(list).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'White f3: Inaccuracy',
      'Black e5: Good',
      'White g4: Blunder',
      'Black Qh4#: Best',
    ])
    expect(server.calls.some((call) => call.method === 'POST' && call.path.endsWith('/review'))).toBe(true)

    // The next error first: f3, an inaccuracy; the board shows the position before it, with Stockfish's choice.
    fireEvent.click(within(panel).getByRole('button', { name: 'Next inaccuracy, mistake or blunder' }))
    expect(within(panel).getByTestId('classification')).toHaveTextContent('Inaccuracy')
    expect(within(panel).getByText(/Stockfish preferred/)).toHaveTextContent('Stockfish preferred e4')
    expect(square('f2')).toHaveAccessibleName(/^f2, white pawn, last move/)
    expect(square('e2')).toHaveAttribute('data-hint', 'from')
    expect(screen.getByText(/Reviewing move 1\. f3/)).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: 'Next inaccuracy, mistake or blunder' }))
    expect(within(panel).getByTestId('classification')).toHaveTextContent('Blunder')
    fireEvent.click(within(panel).getByRole('button', { name: 'Next move' }))
    expect(within(panel).getByTestId('classification')).toHaveTextContent('Best')
    fireEvent.click(within(panel).getByRole('radio', { name: 'After the move' }))
    expect(square('h4')).toHaveAccessibleName(/^h4, black queen, last move/)
    expect(within(panel).getByRole('button', { name: 'Next move' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Back to the game' }))
    expect(status()).toHaveTextContent('Checkmate! Black wins')
    // Reviewing changed nothing on the server.
    expect(server.match!.moves).toEqual(['f2f3', 'e7e5', 'g2g4', 'd8h4'])
  })

  it('reviews only finished games', async () => {
    setup({}, admin, true)
    const panel = await screen.findByRole('region', { name: 'Game review' })
    expect(within(panel).getByRole('button', { name: 'Review game' })).toBeDisabled()
    expect(within(panel).getByText('Available once the game is over.')).toBeInTheDocument()
  })
})

describe('the AI chunk', () => {
  const evaluation = (overrides: Partial<Evaluation>): Evaluation => ({
    kind: 'CENTIPAWNS', centipawns: 0, mateIn: null, matingSide: null, display: '0.00', whiteWinPercent: 50, favoured: null, exact: true, ...overrides,
  })

  it('fills the bar by win chances, for either side', () => {
    expect(barShare(evaluation({ whiteWinPercent: 70 }), 'WHITE')).toBe(70)
    expect(barShare(evaluation({ whiteWinPercent: 70 }), 'BLACK')).toBe(30)
    expect(barShare(evaluation({ whiteWinPercent: 140 }), 'WHITE')).toBe(100)
  })

  it('describes evaluations without claiming more than they say', () => {
    expect(describeEvaluation(evaluation({ centipawns: 10, display: '+0.10', favoured: 'WHITE' }))).toBe('About level (+0.10)')
    expect(describeEvaluation(evaluation({ centipawns: -150, display: '-1.50', favoured: 'BLACK' }))).toBe('Black is better (-1.50)')
    expect(describeEvaluation(evaluation({ centipawns: 500, display: '+5.00', favoured: 'WHITE' }))).toBe('White is winning (+5.00)')
    expect(describeEvaluation(evaluation({ kind: 'MATE', mateIn: 3, matingSide: 'WHITE', display: '#3' }))).toBe('White mates in 3')
    expect(describeEvaluation(evaluation({ kind: 'MATE', mateIn: 0, matingSide: 'BLACK', display: '0-1' }))).toBe('Checkmate: Black has won')
  })

  it('steps through reviewed moves and to the next error', () => {
    const moves = ['GOOD', 'MISTAKE', 'BEST', 'BLUNDER'].map((classification, index) => ({ ply: index + 1, classification }) as ReviewedMove)
    expect(step(moves, null, 1)).toBe(0)
    expect(step(moves, 3, 1)).toBeNull()
    expect(step(moves, 0, -1)).toBeNull()
    expect(stepToError(moves, null, 1)).toBe(1)
    expect(stepToError(moves, 1, 1)).toBe(3)
    expect(stepToError(moves, 3, -1)).toBe(1)
    expect(stepToError(moves, 1, -1)).toBeNull()
  })
})
