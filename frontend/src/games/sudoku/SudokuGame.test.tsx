import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameProps } from '@/games/types'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { NEARLY_DONE, sudokuServer, type SudokuServerOptions } from '@/test/sudokuServer'
import { createSudokuAiPlayer, type SudokuAiPlayer } from './ai/sudokuAiPlayer'
import { SETTINGS_KEY } from './hooks/useSettings'
import SudokuGame from './SudokuGame'

function setup(options: SudokuServerOptions = {}, props: Partial<GameProps<SudokuAiPlayer>> = {}, user = pixel) {
  const server = sudokuServer(options)
  const fetchSpy = mockApi({ user, handlers: [server.handler] })
  const onGameStart = vi.fn()
  const onGameOver = vi.fn()
  const currentSession = vi.fn(() => Promise.resolve({ id: 'session-1' }))
  render(
    <MemoryRouter>
      <SudokuGame onGameStart={onGameStart} onGameOver={onGameOver} currentSession={currentSession} {...props} />
    </MemoryRouter>,
  )
  return { server, fetchSpy, onGameStart, onGameOver, currentSession }
}

const board = () => screen.getByRole('grid', { name: /Sudoku board|AI board/ })
const cell = (index: number) => within(board()).getAllByRole('gridcell')[index]
const key = (k: string, extra: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const pad = () => screen.getByRole('group', { name: /Number pad/ })
const tool = (name: string) => within(screen.getByRole('toolbar', { name: 'Tools' })).getByRole('button', { name: new RegExp(`^${name}`) })

/** Starts today's puzzle and waits for its board. */
async function startDaily() {
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }))
  await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
}

afterEach(() => {
  window.localStorage.clear()
})

describe('Sudoku', () => {
  it('hides today\'s puzzle until the player starts it, then starts a ranked run with the platform\'s session', async () => {
    const { server, onGameStart, currentSession } = setup()
    expect(await screen.findByRole('heading', { name: 'Daily Sudoku #282' })).toBeInTheDocument()
    expect(cell(0)).toHaveAccessibleName('Row 1, column 1: empty')

    await startDaily()
    expect(onGameStart).toHaveBeenCalledOnce()
    expect(currentSession).toHaveBeenCalled()
    expect(server.calls.find((call) => call.path === '/api/sudoku/daily/runs')?.body).toEqual({ sessionId: 'session-1' })
    expect(within(board()).getAllByRole('gridcell')).toHaveLength(81)
    expect(screen.getByText('Mistakes 0/3')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('1:05')
    expect(screen.getByText('Daily #282 · Hard')).toBeInTheDocument()
  })

  it('highlights the selected cell, its row, column and box, and the same digit', async () => {
    setup()
    await startDaily()
    // r1c2 holds a 3.
    fireEvent.click(cell(1))
    expect(cell(1)).toHaveAttribute('aria-selected', 'true')
    expect(cell(1)).toHaveAttribute('data-selected', 'true')
    expect(cell(7)).toHaveAttribute('data-related', 'true')
    expect(cell(73)).toHaveAttribute('data-related', 'true')
    expect(cell(19)).toHaveAttribute('data-related', 'true')
    expect(cell(40)).toHaveAttribute('data-related', 'false')
    // Every other 3 on the board: r6c? has none, r5c6 (cell 41) has a 3? r4c9 (cell 35) does.
    expect(cell(35)).toHaveAttribute('data-same', 'true')
    expect(cell(0)).toHaveAttribute('data-same', 'false')
    // An empty cell still lights up its houses.
    fireEvent.click(cell(2))
    expect(cell(4)).toHaveAttribute('data-related', 'true')
  })

  it('enters digits from the pad and the keyboard, sends them to the server, and never edits a clue', async () => {
    const { server } = setup()
    await startDaily()
    fireEvent.click(cell(2))
    fireEvent.click(within(pad()).getByRole('button', { name: /^4,/ }))
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: 4')
    key('ArrowRight')
    key('6')
    await waitFor(() => expect(server.moves()).toEqual([{ cell: 2, digit: 4 }, { cell: 3, digit: 6 }]))
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: 6')

    fireEvent.click(cell(0))
    key('9')
    expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue')
    expect(server.moves()).toHaveLength(2)
    // The pad counts down what is left of each digit.
    expect(within(pad()).getByRole('button', { name: /^4,/ })).toHaveAccessibleName(/left/)
  })

  it('counts a wrong digit as a mistake and marks it, and marks conflicts', async () => {
    setup()
    await startDaily()
    fireEvent.click(cell(2))
    key('1')
    expect(await screen.findByText('Mistakes 1/3')).toBeInTheDocument()
    expect(cell(2)).toHaveAttribute('data-error', 'true')
    expect(cell(2)).toHaveAccessibleName(/mistake/)
    // 5 repeats the clue at r1c1: a conflict, on both cells.
    fireEvent.click(cell(5))
    key('5')
    await waitFor(() => expect(cell(0)).toHaveAttribute('data-error', 'true'))
  })

  it('takes pencil marks in notes mode, and erases', async () => {
    setup()
    await startDaily()
    fireEvent.click(cell(2))
    key('n')
    expect(tool('Notes')).toHaveAttribute('aria-pressed', 'true')
    key('1')
    key('2')
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 1, 2')
    key('n')
    key('4')
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: 4')
    fireEvent.click(tool('Erase'))
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty')
    // Shift with a digit is a note too.
    fireEvent.keyDown(window, { key: '!', code: 'Digit1', shiftKey: true })
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 1')
  })

  it('undoes and redoes, with the buttons and with Ctrl+Z and Ctrl+Y', async () => {
    const { server } = setup()
    await startDaily()
    fireEvent.click(cell(2))
    key('4')
    key('z', { ctrlKey: true })
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty')
    key('y', { ctrlKey: true })
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: 4')
    fireEvent.click(tool('Undo'))
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty')
    fireEvent.click(tool('Redo'))
    await waitFor(() =>
      expect(server.moves()).toEqual([
        { cell: 2, digit: 4 },
        { cell: 2, digit: 0 },
        { cell: 2, digit: 4 },
        { cell: 2, digit: 0 },
        { cell: 2, digit: 4 },
      ]),
    )
  })

  it('gives three hints: a reveal locks the cell, an explanation can clear ruled-out notes', async () => {
    setup()
    await startDaily()
    fireEvent.click(cell(2))
    fireEvent.click(tool('Hint'))
    fireEvent.click(within(screen.getByRole('region', { name: 'Hints' })).getByRole('button', { name: /Reveal a cell/ }))
    await waitFor(() => expect(cell(2)).toHaveAccessibleName('Row 1, column 3: 4, revealed'))
    expect(within(screen.getByRole('region', { name: 'Hint' })).getByText(/is 4/)).toBeInTheDocument()
    expect(tool('Hint')).toHaveTextContent('2')
    key('Backspace')
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: 4, revealed')

    // A note the explanation rules out (7 at r1c9) can be removed in one go.
    fireEvent.click(cell(8))
    key('7', { shiftKey: true, code: 'Digit7' })
    fireEvent.click(tool('Hint'))
    fireEvent.click(within(screen.getByRole('region', { name: 'Hints' })).getByRole('button', { name: /Explain/ }))
    const card = await screen.findByRole('region', { name: 'Hint' })
    expect(within(card).getByText(/Pointing/)).toBeInTheDocument()
    fireEvent.click(within(card).getByRole('button', { name: /Remove 1 ruled-out note/ }))
    expect(cell(8)).toHaveAccessibleName('Row 1, column 9: empty')
  })

  it('pauses and resumes, hiding the board while paused', async () => {
    const { server } = setup()
    await startDaily()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(await screen.findByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    expect(cell(0)).toHaveAccessibleName('Row 1, column 1: empty')
    await waitFor(() => expect(server.calls.some((call) => call.path.endsWith('/pause'))).toBe(true))
    // Both the overlay and the clock's button resume.
    expect(screen.getAllByRole('button', { name: 'Resume' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Resume' })[1])
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
    expect(server.calls.some((call) => call.path.endsWith('/resume'))).toBe(true)
  })

  it('reports a solved daily puzzle to the platform with the server\'s score and shows the result', async () => {
    const { onGameOver } = setup({ givens: NEARLY_DONE })
    await startDaily()
    fireEvent.click(cell(2))
    key('4')
    key('ArrowRight')
    key('6')
    await waitFor(() => expect(onGameOver).toHaveBeenCalledOnce())
    expect(onGameOver.mock.calls[0][0]).toMatchObject({ score: 5250, metadata: { solvedLevel: 3, dailyGrade: 4, streak: 1 } })
    const dialog = await screen.findByRole('dialog', { name: 'Solved!' })
    expect(within(dialog).getByText('5,250')).toBeInTheDocument()
    expect(within(dialog).getByText('1:05')).toBeInTheDocument()
  })

  it('picks a run up again after a reload with a new session', async () => {
    const { server, onGameStart } = setup({ daily: { values: undefined, paused: true } })
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
    expect(onGameStart).toHaveBeenCalledOnce()
    expect(server.dailyRun?.sessionId).toBe('session-1')
    expect(server.dailyRun?.paused).toBe(false)
  })

  it('starts practice games of a chosen difficulty, ranked or relaxed', async () => {
    const { server, onGameStart } = setup()
    await screen.findByRole('heading', { name: 'Daily Sudoku #282' })
    fireEvent.click(screen.getByRole('tab', { name: /Practice/ }))
    fireEvent.click(screen.getByRole('radio', { name: 'Expert' }))
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() => expect(server.practiceRun?.difficulty).toBe('EXPERT'))
    expect(server.practiceRun?.sessionId).toBe('session-1')
    expect(onGameStart).toHaveBeenCalledOnce()
    expect(await screen.findByText('Practice · Expert')).toBeInTheDocument()

    // A new game while one is going needs a yes.
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Start a new puzzle?' })).getByRole('button', { name: 'New puzzle' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /Relaxed/ }))
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() => expect(server.practiceRun?.ranked).toBe(false))
    expect(onGameStart).toHaveBeenCalledOnce()
    expect(await screen.findByText('Conflicts 0')).toBeInTheDocument()
  })

  it('shows the player\'s statistics', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Statistics' }))
    const dialog = await screen.findByRole('dialog', { name: 'Your Sudoku' })
    await waitFor(() => expect(within(dialog).getByText('Best streak')).toBeInTheDocument())
    expect(within(dialog).getByText('75')).toBeInTheDocument()
    expect(within(dialog).getByText('3:35')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Practice' }))
    expect(within(dialog).getByText('50')).toBeInTheDocument()
  })

  it('keeps settings in the browser and follows them', async () => {
    setup()
    await startDaily()
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    fireEvent.click(within(dialog).getByRole('switch', { name: /Highlight row, column and box/ }))
    fireEvent.click(within(dialog).getByRole('switch', { name: /Keyboard shortcuts/ }))
    expect(JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({ highlightRelated: false, keyboardShortcuts: false })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }))

    fireEvent.click(cell(2))
    expect(cell(4)).toHaveAttribute('data-related', 'false')
    // Shortcuts are off: N does nothing, digits still work.
    key('n')
    expect(tool('Notes')).toHaveAttribute('aria-pressed', 'false')
    key('4')
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: 4')
  })

  it('offers no AI to a player', async () => {
    setup()
    await screen.findByRole('heading', { name: 'Daily Sudoku #282' })
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'AI solver' })).not.toBeInTheDocument()
  })

  it('lets an admin step through the AI\'s moves with each strategy, without touching the score', async () => {
    const { server, onGameStart, onGameOver } = setup({}, { ai: createSudokuAiPlayer }, admin)
    await screen.findByRole('heading', { name: 'Daily Sudoku #282' })
    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    const controls = screen.getByRole('region', { name: 'AI solver' })
    for (const speed of ['0.25x', '0.5x', '1x', '2x', '4x', '8x']) expect(screen.getByRole('radio', { name: speed })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '0.25x' }))

    fireEvent.click(within(controls).getByRole('radio', { name: /Teaching/ }))
    fireEvent.click(within(controls).getByRole('button', { name: 'Solve' }))
    await waitFor(() => expect(within(controls).getByText(/Move 0 of 3/)).toBeInTheDocument())
    expect(server.calls.find((call) => call.path === '/api/ai/sudoku/solve')?.body).toEqual({ strategy: 'TEACHING' })

    act(() => fireEvent.click(within(controls).getByRole('button', { name: 'Step' })))
    expect(await screen.findByRole('region', { name: 'AI reasoning' })).toHaveTextContent('Removes 1 from r1c3')
    act(() => fireEvent.click(within(controls).getByRole('button', { name: 'Step' })))
    await waitFor(() => expect(cell(2)).toHaveAccessibleName(/Row 1, column 3: 4/))

    // Another strategy solves the same puzzle its own way.
    fireEvent.click(within(controls).getByRole('radio', { name: /Fast solver/ }))
    await waitFor(() => expect(server.calls.filter((call) => call.path === '/api/ai/sudoku/solve')).toHaveLength(2))
    expect(server.calls.at(-1)?.body).toEqual({ strategy: 'FAST', date: '2026-10-09' })
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })
})
