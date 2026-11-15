import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameProps } from '@/games/types'
import { admin, mockApi, mockProblem, pixel } from '@/test/mockApi'
import { NEARLY_DONE, sudokuServer, type SudokuServerOptions } from '@/test/sudokuServer'
import { createSudokuAiPlayer, type SudokuAiPlayer } from './ai/sudokuAiPlayer'
import { SETTINGS_KEY } from './hooks/useSettings'
import SudokuGame from './SudokuGame'

function setup(options: SudokuServerOptions = {}, props: Partial<GameProps<SudokuAiPlayer>> = {}, user: typeof pixel | null = pixel) {
  const server = sudokuServer(options)
  const fetchSpy = mockApi({ user, handlers: [server.handler] })
  const onGameStart = vi.fn()
  const onGameOver = vi.fn()
  const currentSession = vi.fn(() => Promise.resolve({ id: 'session-1' }))
  const page = () => (
    <MemoryRouter>
      <SudokuGame onGameStart={onGameStart} onGameOver={onGameOver} currentSession={currentSession} {...props} />
    </MemoryRouter>
  )
  const { unmount } = render(page())
  /** The page opened again in this browser, against the same server: a reload, or the next visit. */
  const reopen = () => render(page())
  return { server, fetchSpy, onGameStart, onGameOver, currentSession, unmount, reopen }
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
    // On the Daily leaderboard: the session is opened in its mode.
    expect(onGameStart).toHaveBeenCalledExactlyOnceWith('daily')
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

  it('fills in every empty cell\'s candidates with Auto or C: one undo step, nothing sent, no penalty', async () => {
    const { server, onGameOver } = setup()
    await startDaily()
    // A note of the player's own, at r1c4.
    fireEvent.click(cell(3))
    key('n')
    key('9')
    key('n')
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 9')
    /** Calls that are about the game: a signed-in player's notes are saved too, but they are no move. */
    const gameCalls = () => server.calls.filter((call) => !call.path.endsWith('/notes'))
    const sent = gameCalls().length

    key('c')
    // r1c3: row 5 3 7, column 8, box 5 3 6 9 8. r1c4: row 5 3 7, column 1 8 4, box 7 1 9 5.
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 1, 2, 4')
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 2, 6')
    expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue')
    expect(cell(80)).toHaveAccessibleName('Row 9, column 9: 9, clue')

    // One step back puts every cell's notes back as they were, the player's 9 included.
    fireEvent.click(tool('Undo'))
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty')
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 9')
    key('y', { ctrlKey: true })
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 1, 2, 4')
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 2, 6')
    key('z', { ctrlKey: true })
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 9')
    // The toolbar button does the same.
    fireEvent.click(tool('Auto-fill candidates'))
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 2, 6')

    // Notes are no move: nothing goes to the game, and the mistakes, hints, clock and score are untouched.
    await act(async () => Promise.resolve())
    expect(gameCalls()).toHaveLength(sent)
    expect(screen.getByText('Mistakes 0/3')).toBeInTheDocument()
    expect(tool('Hint')).toHaveTextContent('3')
    expect(screen.getByRole('timer')).toHaveTextContent('1:05')
    expect(onGameOver).not.toHaveBeenCalled()

    // Notes by hand work as before on the filled-in marks, and a placed digit clears them where it rules them out.
    fireEvent.click(cell(2))
    key('n')
    key('1')
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 2, 4')
    key('n')
    key('4')
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: 4')
    // r2c3 had 2, 4, 7.
    expect(cell(11)).toHaveAccessibleName('Row 2, column 3: empty, notes 2, 7')
    await waitFor(() => expect(server.moves()).toEqual([{ cell: 2, digit: 4 }]))
  })

  it('cannot fill in candidates while paused or once the game is over', async () => {
    setup()
    await startDaily()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(await screen.findByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    expect(tool('Auto-fill candidates')).toBeDisabled()
    key('c')
    fireEvent.click(screen.getAllByRole('button', { name: 'Resume' })[1])
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty')
    expect(tool('Auto-fill candidates')).toBeEnabled()

    // Three wrong digits end the game (r1c3 is 4, r1c4 is 6), with empty cells left.
    fireEvent.click(cell(2))
    key('1')
    key('2')
    fireEvent.click(cell(3))
    key('1')
    const dialog = await screen.findByRole('dialog', { name: 'Out of mistakes' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(tool('Auto-fill candidates')).toBeDisabled()
    key('c')
    expect(cell(4)).toHaveAccessibleName(/^Row 1, column 5: 7/)
    expect(cell(5)).toHaveAccessibleName('Row 1, column 6: empty')
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
    expect(onGameStart).toHaveBeenCalledExactlyOnceWith('daily')
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
    // On the Expert leaderboard, not the Daily one or another difficulty's.
    expect(onGameStart).toHaveBeenCalledExactlyOnceWith('expert')
    expect(await screen.findByText('Practice · Expert')).toBeInTheDocument()

    // A new game while one is going needs a yes.
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Start a new puzzle?' })).getByRole('button', { name: 'New puzzle' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: /Relaxed/ }))
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() => expect(server.practiceRun?.ranked).toBe(false))
    // A relaxed game opens no session: it is on no leaderboard.
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

  it('shows the Daily history calendar beside the streaks, from the signed-in player\'s own history', async () => {
    const { fetchSpy } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Statistics' }))
    const dialog = await screen.findByRole('dialog', { name: 'Your Sudoku' })
    const calendar = await within(dialog).findByRole('radiogroup', { name: 'Daily history, UTC dates' })
    expect(within(calendar).getAllByRole('radio')).toHaveLength(30)
    expect(within(calendar).getByRole('radio', { name: 'Thursday 8 October 2026: Completed' })).toBeInTheDocument()
    // The streaks are still the statistics' own.
    expect(within(dialog).getByText('Current streak').nextSibling).toHaveTextContent('2')
    expect(within(dialog).getByText('Best streak').nextSibling).toHaveTextContent('5')
    expect(within(dialog).getByText(/Days follow UTC dates/)).toBeInTheDocument()
    // The history is asked for once, with nothing that names a player but the session.
    const asked = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/api/sudoku/daily/history'))
    expect(asked).toHaveLength(1)
    expect(String(asked[0][0])).not.toContain('?')
  })

  it('asks a guest to sign in for the Daily history and still shows their statistics', async () => {
    setup({}, {}, null)
    fireEvent.click(await screen.findByRole('button', { name: 'Statistics' }))
    const dialog = await screen.findByRole('dialog', { name: 'Your Sudoku' })
    expect(await within(dialog).findByText('Sign in to see your Daily history for the last 30 days.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Best streak')).toBeInTheDocument()
    expect(within(dialog).getByText('75')).toBeInTheDocument()
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

describe('Sudoku Daily archive', () => {
  const dateInput = () => screen.getByLabelText('Puzzle date (UTC)') as HTMLInputElement
  const play = () => screen.getByRole('button', { name: 'Play unranked' })
  /** Nothing that could rank, score or reward a run: no platform session, no ranked Daily. */
  const rankedCalls = (server: ReturnType<typeof setup>['server']) =>
    server.calls.filter((call) => call.path === '/api/sudoku/daily/runs' || call.path.endsWith('/session'))

  async function openArchive() {
    await screen.findByRole('heading', { name: 'Daily Sudoku #282' })
    fireEvent.click(screen.getByRole('tab', { name: /Archive/ }))
  }

  async function playYesterday() {
    await openArchive()
    await screen.findByText('Daily Sudoku #281 · Hard')
    fireEvent.click(play())
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
  }

  it('picks a past UTC date, showing its number and difficulty but not its board', async () => {
    const { server } = setup()
    await openArchive()
    expect(screen.getByRole('tab', { name: 'Archive' })).toHaveAttribute('aria-selected', 'true')
    // The Daily tab keeps its full name on a narrow screen too.
    expect(screen.getByRole('tab', { name: 'Daily Sudoku' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Daily archive' })).toBeInTheDocument()
    expect(screen.getAllByText('Practice / Unranked').length).toBeGreaterThan(0)

    // Yesterday by default, between the first Daily and yesterday.
    expect(dateInput().value).toBe('2026-10-08')
    expect(dateInput()).toHaveAttribute('min', '2026-01-01')
    expect(dateInput()).toHaveAttribute('max', '2026-10-08')
    expect(await screen.findByText('Daily Sudoku #281 · Hard')).toBeInTheDocument()
    expect(screen.getByText('Thu, 8 Oct 2026 (UTC)')).toBeInTheDocument()
    expect(cell(0)).toHaveAccessibleName('Row 1, column 1: empty')
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(dateInput().value).toBe('2026-10-07')
    expect(await screen.findByText('Daily Sudoku #280 · Hard')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled()

    // Touch-sized controls; on the narrowest phones the three tabs drop their icons to keep their labels.
    for (const tab of screen.getAllByRole('tab')) expect(tab.querySelector('svg')).toHaveClass('hidden', '@min-[19rem]:block')
    expect(screen.getByRole('button', { name: 'Previous day' })).toHaveClass('size-11')
    expect(dateInput()).toHaveClass('h-11')

    // Today, a future date or an empty field cannot be played.
    for (const date of ['2026-10-09', '2026-12-01', '2025-12-31', '']) {
      fireEvent.change(dateInput(), { target: { value: date } })
      expect(screen.getByText(/Pick a date from Thu, 1 Jan 2026 to Thu, 8 Oct 2026/)).toBeInTheDocument()
      expect(play()).toBeDisabled()
    }
    fireEvent.change(dateInput(), { target: { value: '2026-01-01' } })
    expect(await screen.findByText('Daily Sudoku #1 · Hard')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled()
    expect(play()).toBeEnabled()
    // Only the puzzle's public part was asked for; nothing was started.
    expect(server.calls.filter((call) => call.method === 'POST')).toHaveLength(0)
    expect(server.calls.some((call) => call.path === '/api/sudoku/archive/2026-10-09')).toBe(false)
  })

  it('shows the server\'s answer when it has no puzzle for a date, and cannot play it', async () => {
    // Around midnight UTC the browser's yesterday can be the server's today: the server wins.
    const server = sudokuServer()
    mockApi({
      user: pixel,
      handlers: [
        ({ path }) => (path === '/api/sudoku/archive/2026-10-08' ? mockProblem(404, 'NOT_IN_ARCHIVE', "Today's puzzle is not in the archive yet: play it as the Daily") : undefined),
        server.handler,
      ],
    })
    render(
      <MemoryRouter>
        <SudokuGame onGameStart={vi.fn()} onGameOver={vi.fn()} currentSession={vi.fn(() => Promise.resolve({ id: 'session-1' }))} />
      </MemoryRouter>,
    )
    await openArchive()
    expect(await screen.findByText("Today's puzzle is not in the archive yet: play it as the Daily")).toBeInTheDocument()
    expect(play()).toBeDisabled()
    // Another day still works.
    fireEvent.click(screen.getByRole('button', { name: 'Previous day' }))
    expect(await screen.findByText('Daily Sudoku #280 · Hard')).toBeInTheDocument()
    expect(play()).toBeEnabled()
  })

  it('replays a past Daily unranked: no session, no ranked Daily run, clearly labelled', async () => {
    const { server, onGameStart, currentSession } = setup()
    await playYesterday()
    expect(server.calls.find((call) => call.method === 'POST' && call.path === '/api/sudoku/archive/runs')?.body).toEqual({ date: '2026-10-08' })
    expect(onGameStart).not.toHaveBeenCalled()
    expect(currentSession).not.toHaveBeenCalled()
    expect(rankedCalls(server)).toHaveLength(0)
    expect(server.dailyRun).toBeNull()

    expect(screen.getByText('Archive #281 · Hard')).toBeInTheDocument()
    expect(screen.getByText('Replaying Daily Sudoku #281 of 2026-10-08 (UTC)')).toBeInTheDocument()
    expect(screen.getByText('Practice / Unranked')).toBeInTheDocument()
    // The relaxed rule: repeats count, with no limit.
    expect(screen.getByText('Conflicts 0')).toBeInTheDocument()
  })

  it('plays an archive replay with the same controls: digits, notes, undo, hints and pause', async () => {
    const { server, onGameStart } = setup()
    await playYesterday()
    fireEvent.click(cell(2))
    key('4')
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: 4')
    await waitFor(() => expect(server.moves()).toEqual([{ cell: 2, digit: 4 }]))
    expect(server.calls.filter((call) => call.path.endsWith('/moves')).every((call) => call.path.includes('/runs/archive-1/'))).toBe(true)

    fireEvent.click(cell(3))
    key('n')
    key('2')
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 2')
    key('n')
    fireEvent.click(tool('Undo'))
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty')
    fireEvent.click(tool('Redo'))
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 2')

    fireEvent.click(cell(5))
    fireEvent.click(tool('Hint'))
    fireEvent.click(within(screen.getByRole('region', { name: 'Hints' })).getByRole('button', { name: /Reveal a cell/ }))
    await waitFor(() => expect(tool('Hint')).toHaveTextContent('2'))

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(await screen.findByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Resume' })[1])
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(onGameStart).not.toHaveBeenCalled()
    expect(rankedCalls(server)).toHaveLength(0)
  })

  it('finishes a replay without reporting anything, then replays the same date again', async () => {
    const { server, onGameOver, onGameStart } = setup({ archiveGivens: NEARLY_DONE })
    await openArchive()
    await screen.findByText('Daily Sudoku #281 · Hard')
    fireEvent.click(play())
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
    fireEvent.click(cell(2))
    key('4')
    key('ArrowRight')
    key('6')

    const dialog = await screen.findByRole('dialog', { name: 'Solved!' })
    expect(within(dialog).getByText(/Archive · Daily Sudoku #281 · Hard · practice \/ unranked/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Archive replays are practice: no score, rewards or streak/)).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
    expect(onGameStart).not.toHaveBeenCalled()

    // Back to the picker on the same date, and again.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replay or pick a date' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(dateInput().value).toBe('2026-10-08')
    await waitFor(() => expect(play()).toBeEnabled())
    fireEvent.click(play())
    await waitFor(() => expect(server.archiveRun?.id).toBe('archive-2'))
    await waitFor(() => expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty'))
    expect(screen.getByText('Archive #281 · Hard')).toBeInTheDocument()
    expect(onGameOver).not.toHaveBeenCalled()
    expect(rankedCalls(server)).toHaveLength(0)
  })

  it('asks before leaving a replay in progress for another date', async () => {
    const { server } = setup()
    await playYesterday()
    fireEvent.click(screen.getByRole('button', { name: 'Pick a date' }))
    const dialog = await screen.findByRole('dialog', { name: 'Leave this replay?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pick a date' }))
    expect(await screen.findByRole('heading', { name: 'Daily archive' })).toBeInTheDocument()
    // Back to the replay, untouched.
    fireEvent.click(screen.getByRole('button', { name: 'Back to my game' }))
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
    expect(server.archiveRun?.abandoned).toBe(false)
  })

  it('keeps today\'s ranked Daily apart: it still starts with a session, and the replay waits', async () => {
    const { server, onGameStart } = setup()
    await playYesterday()
    fireEvent.click(cell(2))
    key('4')
    await waitFor(() => expect(server.moves()).toHaveLength(1))

    fireEvent.click(screen.getByRole('tab', { name: 'Daily Sudoku' }))
    expect(await screen.findByRole('heading', { name: 'Daily Sudoku #282' })).toBeInTheDocument()
    await startDaily()
    expect(onGameStart).toHaveBeenCalledExactlyOnceWith('daily')
    expect(server.calls.find((call) => call.path === '/api/sudoku/daily/runs')?.body).toEqual({ sessionId: 'session-1' })
    expect(screen.getByText('Daily #282 · Hard')).toBeInTheDocument()
    expect(screen.getByText('Mistakes 0/3')).toBeInTheDocument()
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty')

    // The replay is where it was.
    fireEvent.click(screen.getByRole('tab', { name: 'Archive' }))
    await waitFor(() => expect(screen.getByText('Archive #281 · Hard')).toBeInTheDocument())
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: 4')
    expect(server.archiveRun?.abandoned).toBe(false)
  })

  it('picks a replay in progress up again after a reload, still without a session', async () => {
    const { server, onGameStart, currentSession } = setup({ archive: { date: '2026-03-14' } })
    await openArchive()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
    expect(screen.getByText('Archive #73 · Hard')).toBeInTheDocument()
    expect(screen.getByText('Replaying Daily Sudoku #73 of 2026-03-14 (UTC)')).toBeInTheDocument()
    expect(onGameStart).not.toHaveBeenCalled()
    expect(currentSession).not.toHaveBeenCalled()
    expect(rankedCalls(server)).toHaveLength(0)
  })
})

describe('Sudoku notes across devices', () => {
  const NOTES_KEY = 'cyan-arcade:sudoku-notes'
  const SYNCED_KEY = 'cyan-arcade:sudoku-notes-synced'
  const SENT_KEY = 'cyan-arcade:sudoku-notes-sent'
  /** A mask per cell from `{ cell: digits }`. */
  const masks = (notes: Record<number, number[]>) => Array.from({ length: 81 }, (_, index) => (notes[index] ?? []).reduce((mask, digit) => mask | (1 << digit), 0))
  const saves = (server: ReturnType<typeof setup>['server']) => server.noteCalls().filter((call) => call.method === 'PUT')
  const reads = (server: ReturnType<typeof setup>['server']) => server.noteCalls().filter((call) => call.method === 'GET')
  /** Real time passing, for what must not happen within it. */
  const wait = (ms: number) => act(() => new Promise<void>((resolve) => window.setTimeout(resolve, ms)))

  it("saves a signed-in player's notes once they rest, in one request for many toggles, and Undo saves too", async () => {
    const { server, onGameOver } = setup()
    await startDaily()
    await waitFor(() => expect(reads(server)).toHaveLength(1))
    expect(reads(server)[0].path).toBe('/api/sudoku/runs/daily-run/notes')

    fireEvent.click(cell(2))
    key('n')
    key('1')
    key('2')
    key('4')
    key('2')
    fireEvent.click(cell(3))
    key('9')
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 1, 4')
    expect(saves(server)).toHaveLength(0)

    await waitFor(() => expect(saves(server)).toHaveLength(1))
    expect(saves(server)[0].body).toEqual({ baseRevision: 0, cells: [{ cell: 2, digits: [1, 4] }, { cell: 3, digits: [9] }] })
    expect(server.notes('daily-run').revision).toBe(1)

    // Undo is an edit of the notes like any other: saved over the revision just made.
    key('z', { ctrlKey: true })
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty')
    await waitFor(() => expect(saves(server)).toHaveLength(2))
    expect(saves(server)[1].body).toEqual({ baseRevision: 1, cells: [{ cell: 2, digits: [1, 4] }] })
    key('y', { ctrlKey: true })
    await waitFor(() => expect(server.notes('daily-run')).toEqual({ revision: 3, cells: [{ cell: 2, digits: [1, 4] }, { cell: 3, digits: [9] }] }))

    // Nothing about the game: no moves, no mistakes, the same hints, no result.
    expect(server.moves()).toEqual([])
    expect(screen.getByText('Mistakes 0/3')).toBeInTheDocument()
    expect(tool('Hint')).toHaveTextContent('3')
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('restores the notes saved on another device, without saving them back', async () => {
    const { server } = setup({ daily: { paused: true }, notes: { 'daily-run': { revision: 3, cells: [{ cell: 2, digits: [1, 4] }, { cell: 3, digits: [2] }] } } })
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 1, 4'))
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 2')
    await wait(1200)
    expect(saves(server)).toHaveLength(0)

    // Carrying on here saves over the other device's revision.
    fireEvent.click(cell(3))
    key('n')
    key('6')
    await waitFor(() => expect(saves(server)).toHaveLength(1))
    expect(saves(server)[0].body).toEqual({ baseRevision: 3, cells: [{ cell: 2, digits: [1, 4] }, { cell: 3, digits: [2, 6] }] })
  })

  it("after a reload, brings this browser's unsaved notes and the server's newer ones together", async () => {
    // Last agreed with the server: 1 at r1c3. Since then, offline here: 7 at r1c6. And another device
    // added 4 at r1c3 and 6 at r1c4.
    window.localStorage.setItem(SYNCED_KEY, JSON.stringify({ 'daily-run': masks({ 2: [1] }) }))
    window.localStorage.setItem(NOTES_KEY, JSON.stringify({ 'daily-run': masks({ 2: [1], 5: [7] }) }))
    const { server } = setup({ daily: { paused: true }, notes: { 'daily-run': { revision: 2, cells: [{ cell: 2, digits: [1, 4] }, { cell: 3, digits: [6] }] } } })
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 1, 4'))
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 6')
    expect(cell(5)).toHaveAccessibleName('Row 1, column 6: empty, notes 7')
    await waitFor(() => expect(saves(server)).toHaveLength(1))
    expect(saves(server)[0].body).toEqual({ baseRevision: 2, cells: [{ cell: 2, digits: [1, 4] }, { cell: 3, digits: [6] }, { cell: 5, digits: [7] }] })
    expect(server.notes('daily-run').revision).toBe(3)
  })

  it('never overwrites newer notes from another device: a stale save merges them in and saves again', async () => {
    const { server } = setup()
    await startDaily()
    await waitFor(() => expect(reads(server)).toHaveLength(1))
    // Meanwhile, on the phone: 9 at r1c3 and 6 at r1c4.
    server.saveElsewhere('daily-run', [{ cell: 2, digits: [9] }, { cell: 3, digits: [6] }])

    fireEvent.click(cell(2))
    key('n')
    key('1')
    fireEvent.click(cell(5))
    key('7')
    await waitFor(() => expect(saves(server)).toHaveLength(2))
    expect(saves(server)[0].body).toMatchObject({ baseRevision: 0 })
    expect(saves(server)[1].body).toMatchObject({ baseRevision: 1 })
    // Both changed r1c3: the phone's, the newer, stays. The rest of both comes together.
    expect(server.notes('daily-run')).toEqual({ revision: 2, cells: [{ cell: 2, digits: [9] }, { cell: 3, digits: [6] }, { cell: 5, digits: [7] }] })
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 9')
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 6')
    expect(cell(5)).toHaveAccessibleName('Row 1, column 6: empty, notes 7')
    expect(await screen.findByText('Notes updated from another device.')).toBeInTheDocument()
    expect(server.moves()).toEqual([])
  })

  it('keeps the notes when the network is down, and saves them once it is back', async () => {
    const { server } = setup()
    await startDaily()
    await waitFor(() => expect(reads(server)).toHaveLength(1))
    server.notesOffline = true
    fireEvent.click(cell(2))
    key('n')
    key('3')
    key('8')
    await waitFor(() => expect(saves(server)).toHaveLength(1))
    // Nothing lost: on the board, and in this browser.
    await wait(50)
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 3, 8')
    expect(JSON.parse(window.localStorage.getItem(NOTES_KEY) ?? '{}')['daily-run']).toEqual(masks({ 2: [3, 8] }))
    expect(screen.queryByText("Couldn't reach the arcade. Try again.")).not.toBeInTheDocument()
    expect(server.notes('daily-run').revision).toBe(0)

    server.notesOffline = false
    await waitFor(() => expect(server.notes('daily-run')).toEqual({ revision: 1, cells: [{ cell: 2, digits: [3, 8] }] }))
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 3, 8')
  })

  it('never puts notes read for one run on another', async () => {
    const { server } = setup({ practice: { ranked: false }, notes: { 'practice-0': { revision: 1, cells: [{ cell: 2, digits: [8] }] } }, holdNotes: true })
    await screen.findByRole('heading', { name: 'Daily Sudoku #282' })
    fireEvent.click(screen.getByRole('tab', { name: /Practice/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
    // A new game before the old one's notes have come back.
    fireEvent.click(await screen.findByRole('button', { name: 'New game' }))
    fireEvent.click(await screen.findByRole('button', { name: 'New puzzle' }))
    fireEvent.click(await screen.findByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    await waitFor(() => expect(server.practiceRun?.id).toBe('practice-1'))
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))

    server.releaseNotes()
    await waitFor(() => expect(reads(server).map((call) => call.path)).toContain('/api/sudoku/runs/practice-1/notes'))
    await wait(1200)
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty')
    expect(saves(server)).toHaveLength(0)
  })

  /** The page is hidden: the last moment a closing page is sure to have. */
  const hide = () =>
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
  const shown = () => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  afterEach(shown)
  /** The page opened again: today's game, picked up where it was. */
  async function reopened(reopen: () => unknown) {
    shown()
    reopen()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(cell(0)).toHaveAccessibleName('Row 1, column 1: 5, clue'))
  }
  /** Marks 1 at r1c3 and waits for its save to reach the server; its answer is held. */
  async function saveOnItsWay(server: ReturnType<typeof setup>['server']) {
    await startDaily()
    await waitFor(() => expect(reads(server)).toHaveLength(1))
    server.holdSaves()
    fireEvent.click(cell(2))
    key('n')
    key('1')
    await waitFor(() => expect(saves(server)).toHaveLength(1))
    // While it is on its way: 1 taken off r1c3 again, 7 at r1c6.
    key('1')
    fireEvent.click(cell(5))
    key('7')
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty')
  }

  it('sends an edit made while a save is on its way as the page is left, after that save', async () => {
    const { server, unmount, reopen } = setup()
    await saveOnItsWay(server)
    expect(server.notes('daily-run')).toEqual({ revision: 1, cells: [{ cell: 2, digits: [1] }] })

    hide()
    unmount()
    // Over the revision the first save made, and only if that save is what the server holds there.
    await waitFor(() => expect(saves(server)).toHaveLength(2))
    expect(saves(server)[1].body).toEqual({ baseRevision: 1, cells: [{ cell: 5, digits: [7] }], baseCells: [{ cell: 2, digits: [1] }] })
    expect(server.notes('daily-run')).toEqual({ revision: 2, cells: [{ cell: 5, digits: [7] }] })
    // The page is gone: the answers never reach it.
    server.dropSaves()

    // The next visit finds exactly that, with nothing left to save.
    await reopened(reopen)
    await waitFor(() => expect(cell(5)).toHaveAccessibleName('Row 1, column 6: empty, notes 7'))
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty')
    await wait(1200)
    expect(saves(server)).toHaveLength(2)
    expect(window.localStorage.getItem(SENT_KEY)).toBeNull()
  })

  it('restores edits that never reached the server on the next visit, and saves them, without bringing back a mark taken off', async () => {
    const { server, unmount, reopen } = setup()
    await saveOnItsWay(server)
    // The page closes with the network gone: the edit made during the first save never leaves.
    server.notesOffline = true
    hide()
    unmount()
    await waitFor(() => expect(saves(server)).toHaveLength(2))
    server.notesOffline = false
    server.dropSaves()
    expect(server.notes('daily-run')).toEqual({ revision: 1, cells: [{ cell: 2, digits: [1] }] })
    // Kept in this browser, and so is what was sent.
    expect(JSON.parse(window.localStorage.getItem(NOTES_KEY) ?? '{}')['daily-run']).toEqual(masks({ 5: [7] }))
    expect(JSON.parse(window.localStorage.getItem(SENT_KEY) ?? '{}')['daily-run']).toEqual([masks({ 2: [1] }), masks({ 5: [7] })])

    await reopened(reopen)
    await waitFor(() => expect(cell(5)).toHaveAccessibleName('Row 1, column 6: empty, notes 7'))
    // The server's 1 at r1c3 is this browser's own earlier save, taken off since: it stays off.
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty')
    await waitFor(() => expect(server.notes('daily-run')).toEqual({ revision: 2, cells: [{ cell: 5, digits: [7] }] }))
    expect(saves(server).at(-1)?.body).toEqual({ baseRevision: 1, cells: [{ cell: 5, digits: [7] }] })
    await wait(1000)
    expect(window.localStorage.getItem(SENT_KEY)).toBeNull()
  })

  it('never lets a save sent as the page is left overwrite another device', async () => {
    const { server, unmount, reopen } = setup()
    await startDaily()
    await waitFor(() => expect(reads(server)).toHaveLength(1))
    // The phone saves first: this page's save, on its way, is refused (its answer held).
    server.saveElsewhere('daily-run', [{ cell: 3, digits: [6] }])
    server.holdSaves()
    fireEvent.click(cell(2))
    key('n')
    key('1')
    await waitFor(() => expect(saves(server)).toHaveLength(1))
    fireEvent.click(cell(5))
    key('7')

    hide()
    unmount()
    // Sent over revision 1, but revision 1 is the phone's marks, not this page's save: refused.
    await waitFor(() => expect(saves(server)).toHaveLength(2))
    expect(saves(server)[1].body).toMatchObject({ baseRevision: 1, baseCells: [{ cell: 2, digits: [1] }] })
    expect(server.notes('daily-run')).toEqual({ revision: 1, cells: [{ cell: 3, digits: [6] }] })
    server.dropSaves()

    // The next visit merges both, and saves them over the phone's.
    await reopened(reopen)
    await waitFor(() => expect(server.notes('daily-run')).toEqual({ revision: 2, cells: [{ cell: 2, digits: [1] }, { cell: 3, digits: [6] }, { cell: 5, digits: [7] }] }))
    expect(cell(3)).toHaveAccessibleName('Row 1, column 4: empty, notes 6')
  })

  it('tries a failed save again as soon as the browser is back online, and sends nothing when nothing waits', async () => {
    const { server } = setup()
    await startDaily()
    await waitFor(() => expect(reads(server)).toHaveLength(1))
    server.notesOffline = true
    fireEvent.click(cell(2))
    key('n')
    key('3')
    await waitFor(() => expect(saves(server)).toHaveLength(1))
    server.notesOffline = false
    // Well inside the first wait (2 s) before trying again.
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await waitFor(() => expect(server.notes('daily-run')).toEqual({ revision: 1, cells: [{ cell: 2, digits: [3] }] }), { timeout: 1000 })
    expect(saves(server)).toHaveLength(2)

    const before = server.noteCalls().length
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await wait(2500)
    expect(server.noteCalls()).toHaveLength(before)
  })

  it("keeps a guest's notes in the browser only", async () => {
    const { server } = setup({}, {}, null)
    await startDaily()
    fireEvent.click(cell(2))
    key('n')
    key('5')
    expect(cell(2)).toHaveAccessibleName('Row 1, column 3: empty, notes 5')
    await wait(1200)
    // Leaving the page, or coming back online, sends nothing either.
    hide()
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    await wait(100)
    expect(server.noteCalls()).toHaveLength(0)
    expect(JSON.parse(window.localStorage.getItem(NOTES_KEY) ?? '{}')['daily-run']).toEqual(masks({ 2: [5] }))
    expect(window.localStorage.getItem(SENT_KEY)).toBeNull()
  })
})
