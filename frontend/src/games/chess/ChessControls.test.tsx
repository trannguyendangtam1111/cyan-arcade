import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/api/auth'
import { chessServer, INITIAL_FEN, legal, type ChessServerOptions, type Scripted } from '@/test/chessServer'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { createChessAi } from './ai/chessAi'
import { explain, MOVE_QUALITY } from './analysis/moveQuality'
import ChessGame from './ChessGame'
import type { Evaluation, MoveClass, ReviewedMove } from './types/chessTypes'

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
const posts = (server: ReturnType<typeof chessServer>, ending: string) => server.calls.filter((call) => call.method === 'POST' && call.path.endsWith(ending))
const frame = () => screen.getByTestId('board-frame')

async function play(uci: string) {
  const played = playedMoves()
  fireEvent.click(square(uci.slice(0, 2)))
  fireEvent.click(square(uci.slice(2, 4)))
  await waitFor(() => expect(playedMoves()).toBe(played + 1))
}

const SIZE = 400
function giveTheBoardASize() {
  const grid = board()
  Object.defineProperty(grid, 'clientWidth', { configurable: true, value: SIZE })
  Object.defineProperty(grid, 'clientLeft', { configurable: true, value: 0 })
  Object.defineProperty(grid, 'clientTop', { configurable: true, value: 0 })
  grid.getBoundingClientRect = () => ({ left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, x: 0, y: 0, toJSON: () => ({}) })
}
const point = (name: string) => ({ clientX: (name.charCodeAt(0) - 97) * 50 + 25, clientY: (8 - Number(name[1])) * 50 + 25 })
function drag(from: string, to: string) {
  giveTheBoardASize()
  fireEvent.pointerDown(square(from), { button: 0, pointerId: 1, ...point(from) })
  fireEvent.pointerMove(board(), { pointerId: 1, clientX: point(from).clientX + 10, clientY: point(from).clientY - 10 })
  fireEvent.pointerMove(board(), { pointerId: 1, ...point(to) })
  fireEvent.pointerUp(board(), { button: 0, pointerId: 1, ...point(to) })
  fireEvent.click(square(from))
}

/** A game against Stockfish, the player White. */
const AGAINST_STOCKFISH: ChessServerOptions = { current: { moves: [], engine: { side: 'BLACK', difficulty: 'CLUB' } } }

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

describe('The control surface', () => {
  it('keeps the tools on demand: panels and dialogs open only when asked, and close again', async () => {
    const server = setup({}, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    for (const name of ['Coach', 'Analysis', 'Review', 'vs Stockfish', 'Help', 'Display']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    for (const region of ['Engine analysis', 'Game review', 'Display', 'Play vs Stockfish']) expect(screen.queryByRole('region', { name: region })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    expect(screen.getByRole('button', { name: 'Analysis' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: 'Engine analysis' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    expect(screen.queryByRole('region', { name: 'Engine analysis' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Display' }))
    expect(screen.getByRole('button', { name: 'Display' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(screen.getByRole('region', { name: 'Display' })).getAllByRole('switch').map((element) => element.getAttribute('id') && element.closest('label')?.textContent)).toEqual([
      'Evaluation bar',
      'Analysis panel',
      'Move-quality labels',
      'Move list',
      'Arrows and highlights',
    ])

    fireEvent.click(screen.getByRole('button', { name: 'vs Stockfish' }))
    const dialog = await screen.findByRole('dialog', { name: 'Play vs Stockfish' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Opening and closing things never touched the game (the bar's evaluations only read it).
    expect(server.calls.filter((call) => call.method === 'POST' && !call.path.endsWith('/evaluation'))).toHaveLength(1)
  })

  it('explains how to play in a Help dialog, with the keys and the difference between looking back and taking back', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(screen.queryByRole('dialog', { name: 'How to play' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Help' }))
    const dialog = await screen.findByRole('dialog', { name: 'How to play' })
    expect(within(dialog).getByText('Looking back is not taking back')).toBeInTheDocument()
    expect(within(dialog).getByRole('region', { name: 'Keys' })).toHaveTextContent('←Previous position')
    expect(within(dialog).getByRole('region', { name: 'Keys' })).toHaveTextContent('EscLet go of a piece; clear a premove and drawings')
    expect(within(dialog).getAllByText(/premove/).length).toBeGreaterThan(0)
  })

  it('opens the review only for a finished game, starting it, and closes it again', async () => {
    const server = setup({ current: { moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] } }, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    const review = screen.getByRole('button', { name: 'Review' })
    expect(review).toBeEnabled()

    fireEvent.click(review)
    expect(await screen.findByRole('region', { name: 'Game review' })).toBeInTheDocument()
    expect(posts(server, '/review')).toHaveLength(1)
    fireEvent.click(review)
    expect(screen.queryByRole('region', { name: 'Game review' })).not.toBeInTheDocument()
  })

  it('keeps an analysis while its panel is put away, and does not search again when it comes back', async () => {
    const server = setup({}, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    await screen.findByTestId('evaluation-display')
    const searches = posts(server, '/evaluation').length

    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    // The bar still shows what was found.
    expect(screen.getByTestId('eval-bar-figure')).toHaveTextContent('+0.34')
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    expect(await screen.findByTestId('evaluation-display')).toHaveTextContent('+0.34')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(posts(server, '/evaluation')).toHaveLength(searches)
  })
})

describe('Looking back while the game goes on', () => {
  it('steps back and forward with the strip under the board, and the game itself never changes', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('e2e4')
    await play('d7d5')
    const before = server.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Reviewing move 1. e4')
    expect(square('d7')).toHaveAccessibleName(/^d7, black pawn/)
    expect(screen.getByRole('button', { name: 'White: e4' })).toHaveAttribute('aria-current', 'step')
    // The latest move of the game stays marked apart from the one on the board.
    expect(screen.getByRole('button', { name: 'Black: d5' })).toHaveAttribute('data-latest', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'First position' }))
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Start position')
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }))
    // At the latest position the board is live again.
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Live')
    expect(server.calls.length).toBe(before)
    expect(server.match!.moves).toEqual(['e2e4', 'd7d5'])
  })

  it('takes no move on an earlier position and says how to get back to the game', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('e2e4')
    fireEvent.keyDown(frame(), { key: 'ArrowLeft' })

    fireEvent.pointerDown(square('d2'), { button: 0, pointerId: 1 })
    fireEvent.click(square('d2'))
    fireEvent.click(square('d4'))
    expect(await screen.findByText('You are looking at an earlier position. Go back to the live game to move.')).toBeInTheDocument()
    expect(posts(server, '/moves')).toHaveLength(1)

    fireEvent.click(within(screen.getByTestId('inspecting')).getByRole('button', { name: 'Back to the game' }))
    expect(status()).toHaveTextContent('Black to move')
  })

  it('keeps the position being looked at when Stockfish moves meanwhile, and says a new move came', async () => {
    const server = setup(AGAINST_STOCKFISH, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    server.holdEngine = true
    await play('e2e4')
    await waitFor(() => expect(posts(server, '/engine-move')).toHaveLength(1))

    // Stockfish is thinking; the player looks back at the start.
    fireEvent.keyDown(frame(), { key: 'ArrowLeft' })
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Start position')
    act(() => server.releaseEngine())
    await waitFor(() => expect(playedMoves()).toBe(2))

    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Start position')
    expect(square('e2')).toHaveAccessibleName(/^e2, white pawn/)
    const fresh = screen.getByTestId('new-moves')
    expect(fresh).toHaveTextContent('1 new move · live')
    fireEvent.click(fresh)
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Live')
    expect(square('d5')).toHaveAccessibleName(/^d5, black pawn, last move/)
  })

  it('never steals the arrow keys from a control outside the board and the moves', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('e2e4')
    fireEvent.click(screen.getByRole('button', { name: 'Display' }))
    fireEvent.keyDown(screen.getByRole('switch', { name: 'Move list' }), { key: 'ArrowLeft' })
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Live')
    fireEvent.keyDown(frame(), { key: 'ArrowLeft' })
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Start position')
  })
})

describe('Premoves against Stockfish', () => {
  async function waitingForStockfish(options: ChessServerOptions = AGAINST_STOCKFISH, first = 'e2e4') {
    const server = setup(options, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    server.holdEngine = true
    if (first) await play(first)
    await waitFor(() => expect(posts(server, '/engine-move')).toHaveLength(1))
    await waitFor(() => expect(status()).toHaveTextContent('Stockfish is thinking'))
    return server
  }

  it('plans a move while Stockfish thinks, sends nothing, and plays it once it is legal on the player\'s turn', async () => {
    const server = await waitingForStockfish()
    drag('e4', 'd5')

    expect(screen.getByTestId('premove')).toHaveTextContent('Premove e4–d5')
    expect(square('e4')).toHaveAttribute('data-premove', 'from')
    expect(square('d5')).toHaveAttribute('data-premove', 'to')
    expect(square('e4')).toHaveAccessibleName(/premove from here/)
    expect(posts(server, '/moves')).toHaveLength(1)

    act(() => server.releaseEngine())
    await waitFor(() => expect(posts(server, '/moves')).toHaveLength(2))
    expect(posts(server, '/moves')[1].body).toEqual({ revision: 2, move: 'e4d5' })
    await waitFor(() => expect(playedMoves()).toBe(3))
    expect(screen.queryByTestId('premove')).not.toBeInTheDocument()
    // Played once only, however the state updates came.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(posts(server, '/moves')).toHaveLength(2)
  })

  it('can be planned by tapping too, and is dropped with a note when it is no longer legal', async () => {
    const server = await waitingForStockfish()
    fireEvent.click(square('a1'))
    fireEvent.click(square('a5'))
    expect(screen.getByTestId('premove')).toHaveTextContent('Premove a1–a5')

    act(() => server.releaseEngine())
    expect(await screen.findByText('The premove a1–a5 was no longer legal, so it was cleared.')).toBeInTheDocument()
    expect(posts(server, '/moves')).toHaveLength(1)
    expect(screen.queryByTestId('premove')).not.toBeInTheDocument()
  })

  it('is never played on a position reached by a takeback', async () => {
    const server = setup(AGAINST_STOCKFISH, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    server.holdEngine = true
    server.engineFailures = 1
    await play('e2e4')
    drag('e4', 'd5')
    act(() => server.releaseEngine())
    await screen.findByRole('button', { name: "Retry Stockfish's move" })
    expect(screen.getByTestId('premove')).toHaveTextContent('Premove e4–d5')

    // Taken back: the player's turn again, but on the position before e4, not the one the plan was for.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('The premove e4–d5 was cleared: the game was taken back.')).toBeInTheDocument()
    expect(screen.queryByTestId('premove')).not.toBeInTheDocument()
    expect(posts(server, '/moves')).toHaveLength(1)
    expect(server.match!.moves).toEqual([])
  })

  it('is cleared by Cancel and by Escape', async () => {
    const server = await waitingForStockfish()
    drag('e4', 'd5')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel premove' }))
    expect(screen.queryByTestId('premove')).not.toBeInTheDocument()

    drag('e4', 'd5')
    fireEvent.keyDown(frame(), { key: 'Escape' })
    expect(screen.queryByTestId('premove')).not.toBeInTheDocument()

    act(() => server.releaseEngine())
    await waitFor(() => expect(playedMoves()).toBe(2))
    expect(posts(server, '/moves')).toHaveLength(1)
  })

  it("is cleared, never played, when Stockfish's move ends the game", async () => {
    const server = setup(AGAINST_STOCKFISH, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('f2f3')
    await waitFor(() => expect(playedMoves()).toBe(2))
    server.holdEngine = true
    await play('g2g4')
    await waitFor(() => expect(posts(server, '/engine-move')).toHaveLength(2))
    drag('e2', 'e4')
    expect(screen.getByTestId('premove')).toHaveTextContent('Premove e2–e4')

    act(() => server.releaseEngine())
    await waitFor(() => expect(status()).toHaveTextContent('Checkmate! Black wins'))
    expect(screen.queryByTestId('premove')).not.toBeInTheDocument()
    expect(posts(server, '/moves').map((call) => call.body?.move)).toEqual(['f2f3', 'g2g4'])
  })

  it('asks for the promotion piece instead of guessing it', async () => {
    const PROMOTION_AFTER_BLACK: Record<string, Scripted> = {
      '': { fen: 'k7/6P1/8/8/8/8/8/1R5K b - - 0 1', legal: [legal('a8a7', 'Ka7')], material: { WHITE: 6, BLACK: 0 } },
      a8a7: {
        fen: '8/k5P1/8/8/8/8/8/1R5K w - - 1 2',
        san: 'Ka7',
        legal: [legal('g7g8q', 'g8=Q'), legal('g7g8r', 'g8=R'), legal('g7g8b', 'g8=B'), legal('g7g8n', 'g8=N'), legal('h1h2', 'Kh2')],
        material: { WHITE: 6, BLACK: 0 },
      },
      'a8a7 g7g8n': { fen: '6N1/k7/8/8/8/8/8/1R5K b - - 0 2', san: 'g8=N', legal: [legal('a7a6', 'Ka6')], material: { WHITE: 8, BLACK: 0 } },
    }
    const server = await waitingForStockfish({ script: PROMOTION_AFTER_BLACK, current: { moves: [], engine: { side: 'BLACK', difficulty: 'CLUB' } } }, '')
    drag('g7', 'g8')
    expect(screen.getByTestId('premove')).toHaveTextContent('Premove g7–g8')

    act(() => server.releaseEngine())
    const dialog = await screen.findByRole('dialog', { name: 'Promote your pawn' })
    expect(posts(server, '/moves')).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'knight' }))
    await waitFor(() => expect(posts(server, '/moves')).toHaveLength(1))
    expect(posts(server, '/moves')[0].body).toEqual({ revision: 1, move: 'g7g8n' })
  })

  it('does not exist in a two-player game: only the side to move moves, and the board says so', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(square('e7'))
    expect(await screen.findByText("It is White's move: only White's pieces can move now.")).toBeInTheDocument()
    expect(square('e7')).toHaveAttribute('aria-selected', 'false')
    drag('e7', 'e5')
    expect(screen.queryByTestId('premove')).not.toBeInTheDocument()
    expect(posts(server, '/moves')).toHaveLength(0)
  })
})

describe('Undo and Redo, apart from looking back', () => {
  it('in a two-player game really take a move back and replay it, while the arrows only look', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('e2e4')
    await play('d7d5')
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute('title', expect.stringContaining('this changes the game'))
    expect(screen.getByRole('button', { name: 'Previous move' })).toHaveAttribute('title', expect.stringContaining('nothing is taken back'))

    // Looking at the earlier position first: a takeback then brings the board back to the game.
    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    expect(posts(server, '/undo')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(playedMoves()).toBe(1))
    expect(posts(server, '/undo')[0].body).toEqual({ revision: 2 })
    expect(server.match!.moves).toEqual(['e2e4'])
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Live')

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(playedMoves()).toBe(2))
    expect(posts(server, '/redo')[0].body).toEqual({ revision: 3 })
    expect(server.match!.moves).toEqual(['e2e4', 'd7d5'])
  })

  it("take back the player's move and Stockfish's reply together, and replay both", async () => {
    const server = setup({ current: { moves: ['e2e4', 'd7d5'], engine: { side: 'BLACK', difficulty: 'CLUB' } } }, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    // Looking back only looks.
    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Reviewing move 1. e4')
    expect(posts(server, '/undo')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }))

    const undo = screen.getByRole('button', { name: 'Undo' })
    expect(undo).toHaveAttribute('title', expect.stringContaining("Take back your last move and Stockfish's reply"))
    fireEvent.click(undo)
    await waitFor(() => expect(playedMoves()).toBe(0))
    expect(server.match!.moves).toEqual([])
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Live')
    // Still White's turn: Stockfish does not answer a takeback.
    expect(square('e2')).toHaveAccessibleName(/^e2, white pawn/)

    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    await waitFor(() => expect(playedMoves()).toBe(2))
    expect(server.match!.moves).toEqual(['e2e4', 'd7d5'])
    expect(posts(server, '/redo')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })
})

describe('The move list and move labels', () => {
  const evaluation = (overrides: Partial<Evaluation>): Evaluation => ({
    kind: 'CENTIPAWNS', centipawns: 0, mateIn: null, matingSide: null, display: '0.00', whiteWinPercent: 50, favoured: null, exact: true, ...overrides,
  })
  const judged = (overrides: Partial<ReviewedMove>): ReviewedMove => ({
    ply: 3, color: 'WHITE', uci: 'g2g4', san: 'g4', from: 'g2', to: 'g4', fenBefore: INITIAL_FEN, fenAfter: INITIAL_FEN, best: null, bestLine: [],
    before: evaluation({}), after: evaluation({}), classification: 'GOOD', loss: 3, depth: 14, ...overrides,
  })

  it('maps every label to its symbol and meaning, with no Brilliant label at all', () => {
    const symbols = Object.fromEntries((Object.keys(MOVE_QUALITY) as MoveClass[]).map((label) => [label, MOVE_QUALITY[label].symbol]))
    expect(symbols).toEqual({ BEST: '★', EXCELLENT: '!', GOOD: '✓', INACCURACY: '?!', MISTAKE: '?', BLUNDER: '??', FORCED: '□', UNRATED: '' })
    expect(Object.values(MOVE_QUALITY).map((quality) => quality.annotation)).toEqual(['', '!', '', '?!', '?', '??', '', ''])
    expect(Object.values(MOVE_QUALITY).some((quality) => quality.symbol === '!!')).toBe(false)
    for (const quality of Object.values(MOVE_QUALITY)) expect(quality.meaning.startsWith(quality.label)).toBe(true)
  })

  it('explains a label only when the engine\'s numbers show why', () => {
    expect(explain(judged({ classification: 'BLUNDER', after: evaluation({ kind: 'MATE', mateIn: 1, matingSide: 'BLACK', whiteWinPercent: 0 }) }))).toBe('It allows Black a forced mate in 1.')
    expect(explain(judged({ classification: 'MISTAKE', before: evaluation({ kind: 'MATE', mateIn: 2, matingSide: 'WHITE', whiteWinPercent: 100 }), after: evaluation({ whiteWinPercent: 90 }) }))).toBe(
      'It misses a forced mate: mate in 2 was there.',
    )
    expect(explain(judged({ classification: 'MISTAKE', before: evaluation({ whiteWinPercent: 80 }), after: evaluation({ whiteWinPercent: 50 }) }))).toBe('It turns a winning position into an unclear one, or worse.')
    expect(explain(judged({ classification: 'INACCURACY', color: 'BLACK', before: evaluation({ whiteWinPercent: 50 }), after: evaluation({ whiteWinPercent: 75 }) }))).toBe(
      'It turns a playable position into a difficult one for Black.',
    )
    // A small loss, a good move, or a mate still on the board: nothing is made up.
    expect(explain(judged({ classification: 'INACCURACY', before: evaluation({ whiteWinPercent: 55 }), after: evaluation({ whiteWinPercent: 48 }) }))).toBeNull()
    expect(explain(judged({ classification: 'GOOD' }))).toBeNull()
    expect(explain(judged({ classification: 'FORCED' }))).toBe('It was the only legal move.')
    expect(explain(judged({ classification: 'UNRATED' }))).toBe('The analysis was too shallow or uncertain to judge this move.')
  })

  it('shows no symbol while a judgement is pending, a dashed one from the quick analysis, and the review\'s once it comes', async () => {
    const server = setup({ classifications: ['INACCURACY', 'GOOD', 'BLUNDER', 'BEST'] }, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(screen.getByRole('button', { name: 'Coach' }))
    server.holdCoach = true
    await play('f2f3')
    const f3 = await screen.findByRole('button', { name: 'White: f3, being judged' })
    expect(f3.querySelector('[data-quality]')).toBeNull()
    act(() => server.releaseCoach())

    const quick = await screen.findByRole('button', { name: 'White: f3, Good (quick analysis)' })
    expect(quick.querySelector('[data-quality="GOOD"]')).toHaveAttribute('data-provisional', 'true')
    expect(within(quick).getByRole('img', { name: 'Good (quick analysis)' })).toHaveAttribute('title', expect.stringContaining('From a quick analysis'))
    // The board's badge on f3 is dashed too.
    expect(document.querySelector('[data-badge]')).toHaveAttribute('data-provisional', 'true')
    expect(square('f3').getAttribute('aria-label')).toContain('Good (quick analysis)')
    server.holdCoach = false
    for (const uci of ['e7e5', 'g2g4', 'd8h4']) await play(uci)
    await waitFor(() => expect(status()).toHaveTextContent('Checkmate! Black wins'))

    // The review's labels replace the quick ones, drawn solid, and the feedback says where they come from.
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))
    const reviewedF3 = await screen.findByRole('button', { name: 'White: f3, Inaccuracy' })
    expect(reviewedF3.querySelector('[data-quality="INACCURACY"]')).not.toHaveAttribute('data-provisional')
    expect(within(reviewedF3).getByRole('img', { name: 'Inaccuracy' })).toHaveTextContent('?!')
    expect(screen.getByRole('button', { name: 'Black: Qh4#, Best' })).toBeInTheDocument()
    expect(document.querySelector('[data-badge]')).not.toHaveAttribute('data-provisional')
    fireEvent.click(reviewedF3)
    const feedback = within(screen.getByRole('region', { name: 'Coach' })).getByTestId('move-feedback')
    expect(feedback).toHaveTextContent('1. f3?!')
    expect(feedback).not.toHaveTextContent('quick analysis')
  })

  it('takes a long game: every move a button, clicking one only looks, and the list grows on request', async () => {
    // Knights out and back, again and again: 24 plies.
    const dance = ['g1f3', 'g8f6', 'f3g1', 'f6g8']
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
      'rnbqkb1r/pppppppp/5n2/8/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 2 2',
      'rnbqkb1r/pppppppp/5n2/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 3 2',
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3',
    ]
    const sans = ['Nf3', 'Nf6', 'Ng1', 'Ng8']
    const moves = Array.from({ length: 24 }, (_, index) => dance[index % 4])
    const script: Record<string, Scripted> = { '': { fen: INITIAL_FEN, legal: [legal('g1f3', 'Nf3')] } }
    moves.forEach((_, index) => {
      script[moves.slice(0, index + 1).join(' ')] = { fen: fens[index % 4], san: sans[index % 4], legal: [legal(dance[(index + 1) % 4], sans[(index + 1) % 4])] }
    })
    const server = setup({ script, current: { moves } })
    await screen.findByRole('grid', { name: /Chess board/ })
    const list = screen.getByRole('list', { name: 'Moves played' })
    expect(within(list).getAllByRole('button')).toHaveLength(24)
    expect(list.className).toContain('max-h-36')

    fireEvent.click(screen.getByRole('button', { name: 'Show more moves at once' }))
    expect(list.className).toContain('max-h-96')
    fireEvent.click(within(list).getAllByRole('button')[2])
    expect(screen.getByTestId('view-indicator')).toHaveTextContent('Reviewing move 2. Ng1')
    expect(within(list).getAllByRole('button')[23]).toHaveAttribute('data-latest', 'true')
    expect(server.calls.filter((call) => call.method === 'POST')).toHaveLength(0)
    expect(server.match!.moves).toHaveLength(24)
  })
})
