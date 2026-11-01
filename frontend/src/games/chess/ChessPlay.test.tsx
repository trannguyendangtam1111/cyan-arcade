import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/api/auth'
import { chessServer, PROMOTION, type ChessServerOptions } from '@/test/chessServer'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { createChessAi } from './ai/chessAi'
import ChessGame from './ChessGame'
import { CHESS_SETTINGS_KEY } from './hooks/useChessSettings'

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
const moveCalls = (server: ReturnType<typeof chessServer>) => server.calls.filter((call) => call.path.endsWith('/moves'))

async function play(uci: string) {
  const played = playedMoves()
  fireEvent.click(square(uci.slice(0, 2)))
  fireEvent.click(square(uci.slice(2, 4)))
  await waitFor(() => expect(playedMoves()).toBe(played + 1))
}

/** The board is 400 px from the top left of the page, 50 px a square, White at the bottom. */
const SIZE = 400
function giveTheBoardASize() {
  const grid = board()
  Object.defineProperty(grid, 'clientWidth', { configurable: true, value: SIZE })
  Object.defineProperty(grid, 'clientLeft', { configurable: true, value: 0 })
  Object.defineProperty(grid, 'clientTop', { configurable: true, value: 0 })
  grid.getBoundingClientRect = () => ({ left: 0, top: 0, right: SIZE, bottom: SIZE, width: SIZE, height: SIZE, x: 0, y: 0, toJSON: () => ({}) })
}
const point = (name: string) => ({ clientX: (name.charCodeAt(0) - 97) * 50 + 25, clientY: (8 - Number(name[1])) * 50 + 25 })

/** A drag with the main button (or a finger), from one square to another. */
function drag(from: string, to: string, pointerType: 'mouse' | 'touch' = 'mouse') {
  giveTheBoardASize()
  fireEvent.pointerDown(square(from), { button: 0, pointerId: 1, pointerType, ...point(from) })
  fireEvent.pointerMove(board(), { pointerId: 1, pointerType, clientX: point(from).clientX + 10, clientY: point(from).clientY - 10 })
  fireEvent.pointerMove(board(), { pointerId: 1, pointerType, ...point(to) })
  fireEvent.pointerUp(board(), { button: 0, pointerId: 1, pointerType, ...point(to) })
  // The click that ends the same press in a browser.
  fireEvent.click(square(from))
}

/** The right mouse button: a drag draws an arrow, a click on one square highlights it. */
function rightDrag(from: string, to: string, keys: { shiftKey?: boolean; altKey?: boolean } = {}) {
  giveTheBoardASize()
  fireEvent.pointerDown(square(from), { button: 2, pointerId: 2, ...point(from), ...keys })
  fireEvent.pointerUp(board(), { button: 2, pointerId: 2, ...point(to), ...keys })
}


/** Opens a tool (a panel switched on by its button) and gives its panel. */
async function openTool(button: string, region: string) {
  fireEvent.click(await screen.findByRole('button', { name: button }))
  return screen.findByRole('region', { name: region })
}

/** A switch of the Display panel, opened first if need be. */
function displaySwitch(name: string) {
  if (!screen.queryByRole('region', { name: 'Display' })) fireEvent.click(screen.getByRole('button', { name: 'Display' }))
  return screen.getByRole('switch', { name })
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('Dragging pieces', () => {
  it('plays a move by dragging a piece to a legal square, once', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })

    drag('e2', 'e4')

    await waitFor(() => expect(playedMoves()).toBe(1))
    expect(moveCalls(server)).toHaveLength(1)
    expect(moveCalls(server)[0].body).toEqual({ revision: 0, move: 'e2e4' })
    // The click at the end of the drag did not pick the pawn up again.
    expect(within(board()).getAllByRole('gridcell').some((cell) => cell.getAttribute('aria-selected') === 'true')).toBe(false)
  })

  it('shows where the dragged piece may go while it moves, and lifts it off its square', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    giveTheBoardASize()
    fireEvent.pointerDown(square('g1'), { button: 0, pointerId: 1, ...point('g1') })
    fireEvent.pointerMove(board(), { pointerId: 1, ...point('f3') })

    expect(board()).toHaveAttribute('data-dragging', 'g1')
    expect(square('f3')).toHaveAttribute('data-target', 'move')
    expect(square('h3')).toHaveAttribute('data-target', 'move')
    fireEvent.pointerCancel(board(), { pointerId: 1 })
    expect(board()).not.toHaveAttribute('data-dragging')
  })

  it('works with a finger too, and only pieces that may move hold the page still', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(square('e2').style.touchAction).toBe('none')
    expect(square('e4').style.touchAction).toBe('manipulation')
    expect(square('e7').style.touchAction).toBe('manipulation')

    drag('f2', 'f3', 'touch')

    await waitFor(() => expect(playedMoves()).toBe(1))
    expect(moveCalls(server)[0].body).toEqual({ revision: 0, move: 'f2f3' })
  })

  it('says so when a piece is dropped where it may not go, and sends nothing', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })

    drag('e2', 'e5')

    expect(await screen.findByText('That move is not legal here.')).toBeInTheDocument()
    expect(moveCalls(server)).toHaveLength(0)
    expect(square('e2')).toHaveAccessibleName(/^e2, white pawn/)
  })

  it('keeps a notice above the board while a piece is picked up, so the board does not move under it', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    drag('e2', 'e5')
    expect(await screen.findByText('That move is not legal here.')).toBeInTheDocument()

    // Picking a piece up (by drag or by click) leaves the notice, and with it the board, where it is.
    giveTheBoardASize()
    fireEvent.pointerDown(square('f2'), { button: 0, pointerId: 4, ...point('f2') })
    fireEvent.pointerMove(board(), { pointerId: 4, ...point('f3') })
    expect(board()).toHaveAttribute('data-dragging', 'f2')
    expect(screen.getByText('That move is not legal here.')).toBeInTheDocument()
    fireEvent.pointerUp(board(), { button: 0, pointerId: 4, ...point('f3') })
    await waitFor(() => expect(moveCalls(server)).toHaveLength(1))
    expect(moveCalls(server)[0].body).toEqual({ revision: 0, move: 'f2f3' })
    await waitFor(() => expect(playedMoves()).toBe(1))
    // The move itself replaced the notice.
    await waitFor(() => expect(screen.queryByText('That move is not legal here.')).not.toBeInTheDocument())
  })

  it('asks which piece a pawn dragged to the last rank becomes', async () => {
    const server = setup({ script: PROMOTION })
    await screen.findByRole('grid', { name: /Chess board/ })

    drag('g7', 'g8')

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'knight' }))
    await waitFor(() => expect(moveCalls(server).at(-1)?.body).toEqual({ revision: 0, move: 'g7g8n' }))
  })

  it('cannot drag the other side\'s pieces or anything once the game is over', async () => {
    const server = setup({ current: { moves: ['f2f3', 'e7e5', 'g2g4', 'd8h4'] } })
    await screen.findByRole('grid', { name: /Chess board/ })

    drag('e1', 'e2')

    expect(moveCalls(server)).toHaveLength(0)
    expect(square('e1').style.touchAction).toBe('manipulation')
  })
})

describe('Drawing on the board', () => {
  it('draws arrows with a right-button drag and highlights squares with a right click, in colours by key', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })

    rightDrag('e2', 'e4')
    rightDrag('g1', 'f3', { shiftKey: true })
    rightDrag('d5', 'd5')
    rightDrag('c6', 'c6', { altKey: true })

    expect(document.querySelector('[data-arrow="e2e4"]')).toHaveAttribute('data-color', 'orange')
    expect(document.querySelector('[data-arrow="g1f3"]')).toHaveAttribute('data-color', 'green')
    expect(document.querySelector('[data-mark="d5"]')).toHaveAttribute('data-color', 'red')
    expect(document.querySelector('[data-mark="c6"]')).toHaveAttribute('data-color', 'blue')
    expect(screen.getByRole('button', { name: 'Clear drawings (4)' })).toBeInTheDocument()
    // Drawing again takes it away.
    rightDrag('d5', 'd5')
    expect(document.querySelector('[data-mark="d5"]')).toBeNull()
    // Pictures only: nothing was sent and no piece moved.
    expect(moveCalls(server)).toHaveLength(0)
    expect(playedMoves()).toBe(0)
  })

  it('clears the drawings with Escape, the clear button, a left click, or another position', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    rightDrag('e2', 'e4')
    fireEvent.keyDown(screen.getByTestId('board-frame'), { key: 'Escape' })
    expect(document.querySelector('[data-arrow]')).toBeNull()

    rightDrag('e2', 'e4')
    fireEvent.click(screen.getByRole('button', { name: 'Clear drawings (1)' }))
    expect(document.querySelector('[data-arrow]')).toBeNull()

    rightDrag('e2', 'e4')
    fireEvent.pointerDown(square('a2'), { button: 0, pointerId: 3, ...point('a2') })
    expect(document.querySelector('[data-arrow]')).toBeNull()

    rightDrag('e2', 'e4')
    await play('e2e4')
    expect(document.querySelector('[data-arrow]')).toBeNull()
  })

  it('has a draw mode for touch screens: tap, then tap again, and pieces stay put', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    const draw = screen.getByRole('button', { name: 'Draw' })
    fireEvent.click(draw)
    expect(draw).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(square('e2'))
    expect(square('e2')).toHaveAttribute('data-draw-from', 'true')
    fireEvent.click(square('e4'))
    fireEvent.click(square('f7'))
    fireEvent.click(square('f7'))

    expect(document.querySelector('[data-arrow="e2e4"]')).not.toBeNull()
    expect(document.querySelector('[data-mark="f7"]')).not.toBeNull()
    expect(within(board()).getAllByRole('gridcell').some((cell) => cell.getAttribute('aria-selected') === 'true')).toBe(false)
    expect(moveCalls(server)).toHaveLength(0)

    fireEvent.click(draw)
    await play('e2e4')
  })

  it('can be switched off, and the drawings go with it', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    rightDrag('e2', 'e4')
    fireEvent.click(displaySwitch('Arrows and highlights'))

    expect(document.querySelector('[data-arrow]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Draw' })).not.toBeInTheDocument()
    rightDrag('d2', 'd4')
    expect(document.querySelector('[data-arrow]')).toBeNull()
  })
})

describe('Stepping through the game', () => {
  async function threeMoves() {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('e2e4')
    await play('d7d5')
    await play('e4d5')
    return server
  }

  it('steps back and forth with the arrow keys, Home, End and up and down, without touching the game', async () => {
    const server = await threeMoves()
    const frame = screen.getByTestId('board-frame')

    fireEvent.keyDown(frame, { key: 'ArrowLeft' })
    expect(screen.getByTestId('inspecting')).toHaveTextContent('After 1… d5')
    expect(square('d5')).toHaveAccessibleName(/^d5, black pawn, last move/)
    expect(square('e4')).toHaveAccessibleName(/^e4, white pawn/)
    expect(screen.getByRole('button', { name: 'Black: d5' })).toHaveAttribute('aria-current', 'step')

    fireEvent.keyDown(frame, { key: 'ArrowUp' })
    expect(screen.getByTestId('inspecting')).toHaveTextContent('The start position')
    expect(square('e2')).toHaveAccessibleName(/^e2, white pawn/)
    fireEvent.keyDown(frame, { key: 'ArrowRight' })
    expect(screen.getByTestId('inspecting')).toHaveTextContent('After 1. e4')
    fireEvent.keyDown(frame, { key: 'End' })
    expect(screen.queryByTestId('inspecting')).not.toBeInTheDocument()
    expect(square('d5')).toHaveAccessibleName(/^d5, white pawn, last move/)
    fireEvent.keyDown(frame, { key: 'Home' })
    expect(screen.getByTestId('inspecting')).toHaveTextContent('The start position')
    fireEvent.keyDown(frame, { key: 'ArrowDown' })
    expect(screen.queryByTestId('inspecting')).not.toBeInTheDocument()

    expect(server.match!.moves).toEqual(['e2e4', 'd7d5', 'e4d5'])
    expect(server.calls.filter((call) => call.method === 'POST')).toHaveLength(4)
  })

  it('works from the move list too, and a click on a move shows the position after it', async () => {
    await threeMoves()
    const list = screen.getByRole('list', { name: 'Moves played' })
    fireEvent.click(within(list).getByRole('button', { name: 'White: e4' }))
    expect(screen.getByTestId('inspecting')).toHaveTextContent('After 1. e4')
    expect(screen.getByTestId('view-indicator')).toHaveTextContent('Reviewing move 1. e4')
    expect(screen.getByTestId('nav-indicator')).toHaveTextContent('Reviewing move 1. e4')

    fireEvent.keyDown(within(list).getByRole('button', { name: 'White: e4' }), { key: 'ArrowRight' })
    expect(screen.getByTestId('inspecting')).toHaveTextContent('After 1… d5')
    fireEvent.click(screen.getByRole('button', { name: 'Latest position' }))
    expect(screen.getByTestId('view-indicator')).toHaveTextContent('Live')
  })

  it('takes no moves while looking back, and goes back to the game in one click', async () => {
    const server = await threeMoves()
    fireEvent.keyDown(screen.getByTestId('board-frame'), { key: 'Home' })

    fireEvent.click(square('a7'))
    fireEvent.click(square('a6'))
    drag('a7', 'a6')
    expect(moveCalls(server)).toHaveLength(3)

    fireEvent.click(within(screen.getByTestId('inspecting')).getByRole('button', { name: 'Back to the game' }))
    expect(status()).toHaveTextContent('Black to move')
    // The game again: its pieces answer.
    fireEvent.click(square('d8'))
    expect(square('d8')).toHaveAttribute('aria-selected', 'true')
    expect(square('d5')).toHaveAttribute('data-target', 'capture')
  })

  it('leaves the arrow keys to the squares, so a keyboard player can still move', async () => {
    await threeMoves()
    square('e1').focus()
    fireEvent.keyDown(square('e1'), { key: 'ArrowLeft' })

    expect(square('d1')).toHaveFocus()
    expect(screen.queryByTestId('inspecting')).not.toBeInTheDocument()
  })

  it('leaves the keys to form controls', async () => {
    await threeMoves()
    const evalSwitch = displaySwitch('Evaluation bar')
    fireEvent.keyDown(evalSwitch, { key: 'ArrowLeft' })
    expect(screen.queryByTestId('inspecting')).not.toBeInTheDocument()
  })
})

describe('Display settings', () => {
  it('turn the evaluation bar, the labels and the move list on and off, keep them, and leave the game alone', async () => {
    const server = setup({ current: { moves: ['e2e4', 'd7d5'] } }, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.keyDown(screen.getByTestId('board-frame'), { key: 'ArrowLeft' })
    expect(screen.getByRole('meter', { name: 'Evaluation' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    expect(screen.getByRole('region', { name: 'Engine analysis' })).toBeInTheDocument()
    fireEvent.click(displaySwitch('Evaluation bar'))
    expect(screen.queryByRole('meter', { name: 'Evaluation' })).not.toBeInTheDocument()
    fireEvent.click(displaySwitch('Analysis panel'))
    expect(screen.queryByRole('region', { name: 'Engine analysis' })).not.toBeInTheDocument()
    fireEvent.click(displaySwitch('Move list'))
    expect(screen.queryByRole('list', { name: 'Moves played' })).not.toBeInTheDocument()

    // Still looking at the same position of the same game.
    expect(screen.getByTestId('inspecting')).toHaveTextContent('After 1. e4')
    expect(server.match!.moves).toEqual(['e2e4', 'd7d5'])
    expect(JSON.parse(window.localStorage.getItem(CHESS_SETTINGS_KEY)!)).toMatchObject({ evalBar: false, analysis: false, moveList: false })

    fireEvent.click(displaySwitch('Evaluation bar'))
    expect(screen.getByRole('meter', { name: 'Evaluation' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Engine analysis' })).not.toBeInTheDocument()
  })

  it('offer no analysis panel to a player, who has none', async () => {
    setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(displaySwitch('Evaluation bar')).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Analysis panel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Analysis' })).not.toBeInTheDocument()
  })

  it('put the bar beside the board on a wide screen and above it on a phone', async () => {
    const matches = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', matches)
    try {
      setup()
      await screen.findByRole('grid', { name: /Chess board/ })
      expect(screen.queryByTestId('eval-bar-vertical')).not.toBeInTheDocument()
      // A player's bar is fed by Coach Mode, which is off: it says so and offers to turn it on.
      expect(screen.getByRole('meter', { name: 'Evaluation' })).toHaveAttribute('aria-valuetext', 'Not evaluated: Coach Mode evaluates each move as it is played')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('Coach Mode', () => {
  const coachCalls = (server: ReturnType<typeof chessServer>) => server.calls.filter((call) => call.path.endsWith('/coach'))
  const coachSwitch = () => screen.getByRole('button', { name: 'Coach' })

  it('rates each move as it is played, without holding the board up', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(coachSwitch())
    server.holdCoach = true

    await play('e2e4')
    // Pending: shown as such, and the board already takes the next move.
    expect(await screen.findByRole('button', { name: 'White: e4, being judged' })).toBeInTheDocument()
    expect(screen.getByText(/Rating 1\. e4/)).toBeInTheDocument()
    await play('d7d5')

    act(() => server.releaseCoach())
    expect(await screen.findByRole('button', { name: 'White: e4, Best (quick analysis)' })).toBeInTheDocument()
    expect(coachCalls(server)[0].body).toEqual({ ply: 1, uci: 'e2e4' })
  })

  it('shows the label, the evaluation and the move Stockfish preferred, and puts that on the board', async () => {
    const server = setup({ coachLabels: { 1: 'MISTAKE' } })
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(coachSwitch())
    await play('f2f3')

    const feedback = await screen.findByTestId('move-feedback')
    expect(feedback).toHaveTextContent('1. f3')
    expect(feedback).toHaveTextContent('Mistake')
    expect(feedback).toHaveTextContent('+0.34 → -2.50')
    expect(feedback).toHaveTextContent("24.6 points of White's winning chances lost")
    expect(feedback).toHaveTextContent('Better was e4')
    expect(feedback).toHaveTextContent('quick analysis')
    expect(square('f3')).toHaveAccessibleName(/Mistake/)
    expect(document.querySelector('[data-badge="?"]')).not.toBeNull()

    fireEvent.click(within(feedback).getByRole('button', { name: 'Show best move' }))
    expect(screen.getByTestId('inspecting')).toHaveTextContent('The start position')
    expect(document.querySelector('[data-engine-arrow="e2e4"]')).not.toBeNull()
    expect(server.match!.moves).toEqual(['f2f3'])
  })

  it('never puts a late answer on a move that was taken back', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(coachSwitch())
    server.holdCoach = true
    await play('e2e4')
    await screen.findByRole('button', { name: 'White: e4, being judged' })

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(playedMoves()).toBe(0))
    await play('f2f3')
    act(() => server.releaseCoach())
    await waitFor(() => expect(coachCalls(server).length).toBeGreaterThanOrEqual(2))
    act(() => server.releaseCoach())

    // f3 gets its own judgement; e4's never shows on it.
    expect(await screen.findByRole('button', { name: 'White: f3, Good (quick analysis)' })).toBeInTheDocument()
    expect(coachCalls(server).map((call) => call.body)).toContainEqual({ ply: 1, uci: 'f2f3' })
  })

  it('asks about one move at a time', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(coachSwitch())
    server.holdCoach = true
    await play('e2e4')
    await play('d7d5')
    await waitFor(() => expect(coachCalls(server)).toHaveLength(1))

    act(() => server.releaseCoach())
    await waitFor(() => expect(coachCalls(server)).toHaveLength(2))
    act(() => server.releaseCoach())
    expect(await screen.findByRole('button', { name: 'Black: d5, Best (quick analysis)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'White: e4, Best (quick analysis)' })).toBeInTheDocument()
  })

  it('says when a move could not be rated, and tries again on request', async () => {
    const server = setup()
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(coachSwitch())
    server.engineFailures = 1
    await play('e2e4')

    expect(await screen.findByText(/The coach could not rate this move/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'White: e4, Best (quick analysis)' })).toBeInTheDocument()
  })

  it('judges only the player\'s own moves against Stockfish', async () => {
    const server = setup({ current: { moves: [], engine: { side: 'BLACK', difficulty: 'CLUB' } } }, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    fireEvent.click(coachSwitch())
    await play('e2e4')
    await waitFor(() => expect(playedMoves()).toBe(2))
    await screen.findByRole('button', { name: 'White: e4, Best (quick analysis)' })

    expect(coachCalls(server).map((call) => call.body)).toEqual([{ ply: 1, uci: 'e2e4' }])
  })

  it('is for signed-in players', async () => {
    setup({}, null)
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(screen.queryByRole('link', { name: 'Log in for Coach Mode' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Coach' }))
    expect(screen.getByRole('link', { name: 'Log in for Coach Mode' })).toBeInTheDocument()
    expect(screen.queryByTestId('coach-feedback')).not.toBeInTheDocument()
  })
})

describe('Engine lines (admins)', () => {
  it('steps through a principal variation on the board without touching the game', async () => {
    const server = setup({}, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    await play('e2e4')
    await play('d7d5')
    const panel = await openTool('Analysis', 'Engine analysis')

    fireEvent.click(await within(panel).findByRole('button', { name: 'Line 1: show the position after 2. exd5' }))
    expect(screen.getByTestId('inspecting')).toHaveTextContent("Stockfish's line 1: exd5")
    expect(square('d5')).toHaveAccessibleName(/^d5, white pawn, last move/)
    expect(within(panel).getByText(/the game is unchanged/)).toBeInTheDocument()
    expect(server.match!.moves).toEqual(['e2e4', 'd7d5'])

    fireEvent.click(within(panel).getByRole('button', { name: 'Back to the game' }))
    expect(square('d5')).toHaveAccessibleName(/^d5, black pawn, last move/)
    expect(screen.queryByTestId('inspecting')).not.toBeInTheDocument()
  })

  it('analyses an earlier position of the game when the board shows it', async () => {
    const server = setup({ current: { moves: ['e2e4', 'd7d5'] } }, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    const panel = await openTool('Analysis', 'Engine analysis')
    await within(panel).findByTestId('evaluation-display')

    fireEvent.keyDown(screen.getByTestId('board-frame'), { key: 'ArrowLeft' })
    await waitFor(() => expect(server.calls.filter((call) => call.path.endsWith('/evaluation')).at(-1)?.body).toMatchObject({ ply: 1, revision: 2 }))
    expect(within(panel).getByText(/Black to move/)).toBeInTheDocument()
  })

  it('reports an engine failure in the panel and shows no numbers for it', async () => {
    const server = setup({}, admin, true)
    await screen.findByRole('grid', { name: /Chess board/ })
    server.engineFailures = 1
    const panel = await openTool('Analysis', 'Engine analysis')

    expect(await within(panel).findByRole('alert')).toHaveTextContent('The chess engine did not answer properly')
    expect(within(panel).queryByTestId('evaluation-display')).not.toBeInTheDocument()
  })
})
