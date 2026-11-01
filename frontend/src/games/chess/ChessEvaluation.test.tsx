import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/api/auth'
import { chessServer, type ChessServerOptions } from '@/test/chessServer'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { createChessAi } from './ai/chessAi'
import { scoreText, shareFor, whiteShare } from './analysis/score'
import ChessGame from './ChessGame'
import { EvalBar } from './components/EvalBar'
import { useShownEvaluation } from './hooks/useShownEvaluation'
import type { Evaluation } from './types/chessTypes'

const evaluation = (overrides: Partial<Evaluation>): Evaluation => ({
  kind: 'CENTIPAWNS', centipawns: 0, mateIn: null, matingSide: null, display: '0.00', whiteWinPercent: 50, favoured: null, exact: true, ...overrides,
})
const pawns = (centipawns: number, whiteWinPercent: number) =>
  evaluation({ centipawns, whiteWinPercent, display: scoreText(evaluation({ centipawns })), favoured: centipawns > 0 ? 'WHITE' : centipawns < 0 ? 'BLACK' : null })
const mate = (mateIn: number, matingSide: 'WHITE' | 'BLACK') => evaluation({ kind: 'MATE', mateIn, matingSide, whiteWinPercent: matingSide === 'WHITE' ? 100 : 0, favoured: matingSide })

describe('the score convention', () => {
  it('reads centipawns from White\'s side: plus for White, minus for Black', () => {
    expect(scoreText(pawns(34, 53))).toBe('+0.34')
    expect(scoreText(pawns(-120, 39))).toBe('-1.20')
    expect(scoreText(pawns(0, 50))).toBe('0.00')
    expect(whiteShare(pawns(34, 53))).toBe(53)
    expect(whiteShare(pawns(-120, 39))).toBe(39)
  })

  it('gives each side its own share of the same evaluation, whoever is to move', () => {
    // The server has already turned Stockfish's side-to-move score to White's side.
    expect(shareFor(pawns(-120, 39), 'WHITE')).toBe(39)
    expect(shareFor(pawns(-120, 39), 'BLACK')).toBe(61)
  })

  it('keeps mates apart from centipawns', () => {
    expect(scoreText(mate(3, 'WHITE'))).toBe('#3')
    expect(scoreText(mate(2, 'BLACK'))).toBe('#-2')
    expect(scoreText(mate(0, 'WHITE'))).toBe('1-0')
    expect(scoreText(mate(0, 'BLACK'))).toBe('0-1')
    // A mate fills the bar whatever its distance, and whatever the curve said.
    expect(whiteShare({ ...mate(7, 'WHITE'), whiteWinPercent: 80 })).toBe(100)
    expect(whiteShare({ ...mate(7, 'BLACK'), whiteWinPercent: 20 })).toBe(0)
  })

  it('clamps the bar to 0..100 and never makes a number up', () => {
    expect(whiteShare(pawns(2000, 140))).toBe(100)
    expect(whiteShare(pawns(-2000, -5))).toBe(0)
    expect(whiteShare(pawns(0, Number.NaN))).toBe(50)
  })
})

describe('what the evaluation bar shows', () => {
  it('keeps the last evaluation while the next one is on its way, and only within the match', () => {
    const start = pawns(34, 53)
    const { result, rerender } = renderHook(({ scope, position, current, pending }) => useShownEvaluation(scope, position, current, pending), {
      initialProps: { scope: 'm1' as string | null, position: 'ply0', current: start as Evaluation | null, pending: false },
    })
    expect(result.current).toEqual({ evaluation: start, state: 'current' })

    rerender({ scope: 'm1', position: 'ply1', current: null, pending: true })
    expect(result.current).toEqual({ evaluation: start, state: 'previous' })

    rerender({ scope: 'm1', position: 'ply1', current: null, pending: false })
    expect(result.current).toEqual({ evaluation: null, state: 'unknown' })

    rerender({ scope: 'm2', position: 'ply0', current: null, pending: true })
    expect(result.current).toEqual({ evaluation: null, state: 'loading' })
  })

  it('shows no evaluation as unknown, never as an equal 50/50', () => {
    render(<EvalBar evaluation={null} state="unknown" provisional={false} />)
    const meter = screen.getByRole('meter', { name: 'Evaluation' })
    expect(meter).not.toHaveAttribute('aria-valuenow')
    expect(meter).toHaveAttribute('aria-valuetext', 'No evaluation of this position yet')
    expect(screen.getByTestId('eval-bar-figure')).toHaveTextContent('–')
  })

  it('marks a kept evaluation as updating', () => {
    render(<EvalBar evaluation={pawns(34, 53)} state="previous" provisional={false} />)
    const meter = screen.getByRole('meter', { name: 'Evaluation' })
    expect(meter).toHaveAttribute('aria-valuenow', '53')
    expect(meter).toHaveAttribute('aria-busy', 'true')
    expect(meter).toHaveAttribute('aria-valuetext', 'Updating; last evaluation: White is slightly better (+0.34)')
    expect(screen.getByTestId('eval-updating')).toBeInTheDocument()
  })

  it('draws the same score with the board either way round', () => {
    const { rerender } = render(<EvalBar evaluation={pawns(-120, 39)} provisional={false} layout="vertical" bottom="WHITE" />)
    const fill = () => screen.getByRole('meter', { name: 'Evaluation' }).querySelector('.chess-eval-fill') as HTMLElement
    expect(fill().style.height).toBe('39%')
    expect(fill()).toHaveClass('bottom-0')
    rerender(<EvalBar evaluation={pawns(-120, 39)} provisional={false} layout="vertical" bottom="BLACK" />)
    expect(screen.getByRole('meter', { name: 'Evaluation' })).toHaveAttribute('aria-valuenow', '39')
    expect(fill().style.height).toBe('39%')
    expect(fill()).toHaveClass('top-0')
    expect(screen.getByTestId('eval-bar-figure')).toHaveTextContent('-1.20')
  })
})

function setup(options: ChessServerOptions = {}, user: SessionUser = admin) {
  const server = chessServer(options)
  mockApi({ user, handlers: [server.handler] })
  render(
    <MemoryRouter>
      <ChessGame onGameStart={vi.fn()} onGameOver={vi.fn()} ai={user.role === 'ADMIN' ? createChessAi : undefined} />
    </MemoryRouter>,
  )
  return server
}

const board = () => screen.getByRole('grid', { name: /Chess board/ })
const square = (name: string) => within(board()).getByRole('gridcell', { name: new RegExp(`^${name},`) })
const playedMoves = () => screen.queryAllByLabelText(/^(White|Black): /).length
const meter = () => screen.getByRole('meter', { name: 'Evaluation' })
const figure = () => screen.getByTestId('eval-bar-figure')
const evaluationsAsked = (server: ReturnType<typeof chessServer>, ply: number) =>
  server.calls.filter((call) => call.path.endsWith('/evaluation') && (call.body as { ply?: number })?.ply === ply).length

async function play(uci: string) {
  const played = playedMoves()
  fireEvent.click(square(uci.slice(0, 2)))
  fireEvent.click(square(uci.slice(2, 4)))
  await waitFor(() => expect(playedMoves()).toBe(played + 1))
}

async function startAnalysis() {
  fireEvent.click(await screen.findByRole('button', { name: 'Analysis' }))
  const panel = await screen.findByRole('region', { name: 'Engine analysis' })
  await within(panel).findByTestId('evaluation-display')
  return panel
}

describe('the evaluation during a game', () => {
  it('keeps the last value while a move is evaluated, and ignores an answer that comes too late', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await startAnalysis()
    expect(meter()).toHaveAttribute('data-state', 'current')
    expect(meter()).toHaveAttribute('aria-valuenow', '53')

    server.holdEvaluation = true
    server.evaluationByPly = { 1: pawns(-80, 43), 2: pawns(150, 70) }
    await play('e2e4')
    await waitFor(() => expect(evaluationsAsked(server, 1)).toBe(1))
    // Not 50/50: the start position's value stays, marked as updating.
    expect(meter()).toHaveAttribute('data-state', 'previous')
    expect(meter()).toHaveAttribute('aria-valuenow', '53')
    expect(screen.getByTestId('eval-updating')).toBeInTheDocument()

    // A second move before the first answer; the newer answer comes first, the older one after it.
    await play('d7d5')
    await waitFor(() => expect(evaluationsAsked(server, 2)).toBe(1))
    act(() => server.releaseEvaluation(2))
    await waitFor(() => expect(figure()).toHaveTextContent('+1.50'))
    expect(meter()).toHaveAttribute('data-state', 'current')
    await act(async () => server.releaseEvaluation(1))
    await act(async () => {})
    expect(figure()).toHaveTextContent('+1.50')
    expect(meter()).toHaveAttribute('aria-valuenow', '70')
  })

  it('evaluates the position looked at while the game goes on, and the newest one back at the live board', async () => {
    const server = setup({ current: { moves: [], engine: { side: 'BLACK', difficulty: 'CLUB' } } })
    await screen.findByRole('grid', { name: /Chess board/ })
    server.evaluationByPly = { 1: pawns(-80, 43), 2: pawns(150, 70) }
    await startAnalysis()
    server.holdEngine = true
    await play('e2e4')
    await waitFor(() => expect(figure()).toHaveTextContent('-0.80'))

    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    await waitFor(() => expect(figure()).toHaveTextContent('+0.34'))
    // Stockfish answers meanwhile: the board stays where the player is looking, and so does the bar.
    act(() => server.releaseEngine())
    await waitFor(() => expect(server.match!.moves).toHaveLength(2))
    await waitFor(() => expect(playedMoves()).toBe(2))
    expect(screen.getByTestId('nav-indicator')).not.toHaveTextContent('Live')
    expect(figure()).toHaveTextContent('+0.34')

    fireEvent.keyDown(screen.getByTestId('board-frame'), { key: 'End' })
    await waitFor(() => expect(figure()).toHaveTextContent('+1.50'))
    expect(meter()).toHaveAttribute('data-state', 'current')
  })

  it('keeps the score when the board is turned round', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    server.evaluationByPly = { 1: pawns(-80, 43) }
    await startAnalysis()
    await play('e2e4')
    await waitFor(() => expect(figure()).toHaveTextContent('-0.80'))
    fireEvent.click(screen.getByRole('button', { name: 'Flip' }))
    expect(screen.getByRole('grid', { name: 'Chess board, Black at the bottom' })).toBeInTheDocument()
    expect(figure()).toHaveTextContent('-0.80')
    expect(meter()).toHaveAttribute('aria-valuenow', '43')
  })
})

describe('what feeds the evaluation bar', () => {
  const asked = (server: ReturnType<typeof chessServer>) => server.calls.filter((call) => call.path.endsWith('/evaluation')).map((call) => call.body)

  it('evaluates every position by itself for an admin, with no panel open, and after each move', async () => {
    const server = setup()
    server.evaluationByPly = { 1: pawns(-80, 43) }
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(screen.queryByRole('region', { name: 'Engine analysis' })).not.toBeInTheDocument()

    await waitFor(() => expect(figure()).toHaveTextContent('+0.34'))
    expect(meter()).toHaveAttribute('data-state', 'current')
    expect(asked(server)).toEqual([{ revision: 0, depth: 16, lines: 1, ply: 0 }])

    await play('e2e4')
    await waitFor(() => expect(figure()).toHaveTextContent('-0.80'))
    expect(asked(server).at(-1)).toEqual({ revision: 1, depth: 16, lines: 1, ply: 1 })
    // Looking back shows the earlier position's evaluation (already known: not asked again).
    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    await waitFor(() => expect(figure()).toHaveTextContent('+0.34'))
    expect(asked(server)).toHaveLength(2)
  })

  it('says when the player has stopped it, and starts it again on request', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await waitFor(() => expect(meter()).toHaveAttribute('data-state', 'current'))
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Engine analysis' })).getByRole('button', { name: 'Stop analysis' }))
    await play('e2e4')

    expect(meter()).toHaveAttribute('data-state', 'stopped')
    expect(meter()).toHaveAttribute('aria-valuetext', 'Stockfish evaluation is stopped')
    expect(meter()).not.toHaveAttribute('aria-valuenow')
    const before = asked(server).length
    fireEvent.click(screen.getByTestId('eval-bar-action'))
    await waitFor(() => expect(meter()).toHaveAttribute('data-state', 'current'))
    expect(asked(server)).toHaveLength(before + 1)
  })

  it('shows a failure as an error with a retry, never as a score', async () => {
    const server = setup()
    server.engineFailures = 1
    await screen.findByRole('grid', { name: /Chess board/ })

    await waitFor(() => expect(meter()).toHaveAttribute('data-state', 'error'))
    expect(meter()).toHaveAttribute('aria-valuetext', expect.stringContaining('Stockfish could not evaluate this position.'))
    expect(meter()).not.toHaveAttribute('aria-valuenow')
    expect(figure()).toHaveTextContent('!')
    fireEvent.click(screen.getByRole('button', { name: /^Retry: / }))
    await waitFor(() => expect(figure()).toHaveTextContent('+0.34'))
  })

  it('brings the match up to date when the server says it has moved on, then evaluates the new position', async () => {
    const server = setup()
    server.evaluationByPly = { 1: pawns(-80, 43) }
    await screen.findByRole('grid', { name: /Chess board/ })
    await waitFor(() => expect(figure()).toHaveTextContent('+0.34'))

    // Another tab plays e4; this page still thinks the game is at the start and asks about it.
    server.moveElsewhere('e2e4')
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    fireEvent.change(within(screen.getByRole('region', { name: 'Engine analysis' })).getByLabelText('Lines'), { target: { value: '2' } })

    await waitFor(() => expect(square('e4')).toHaveAccessibleName(/^e4, white pawn/))
    await waitFor(() => expect(figure()).toHaveTextContent('-0.80'))
    expect(asked(server)).toContainEqual({ revision: 0, depth: 16, lines: 2, ply: 0 })
    expect(asked(server).at(-1)).toEqual({ revision: 1, depth: 16, lines: 2, ply: 1 })
  })

  it('tells a player that Coach Mode is what evaluates, and turns it on from the bar', async () => {
    const server = setup({}, pixel)
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(meter()).toHaveAttribute('data-state', 'unknown')
    expect(meter()).toHaveAttribute('aria-valuetext', 'Not evaluated: Coach Mode evaluates each move as it is played')

    fireEvent.click(screen.getByRole('button', { name: /^Turn on Coach: / }))
    expect(screen.getByRole('button', { name: 'Coach' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('eval-bar-action')).not.toBeInTheDocument()
    expect(asked(server)).toEqual([])
  })
})
