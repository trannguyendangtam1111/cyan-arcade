import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameProps } from '@/games/types'
import { createGame2048Ai, type Game2048AI } from './ai/game2048Ai'
import Game2048 from './Game2048'
import type { Game2048State } from './types/game2048Types'

// A fixed seed makes tile spawns, and therefore every AI decision in this file, repeatable.
vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 2048,
}))

// A test can stage the board and how many moves were already made; the rules (the move limit) are
// the real ones, passed through.
let startingBoard: number[] | null = null
let startingMoves = 0

vi.mock('./engine/game2048Engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('./engine/game2048Engine')>()
  return {
    ...original,
    createGame2048: (seed: number, rules?: Parameters<typeof original.createGame2048>[1]): Game2048State => {
      const real = original.createGame2048(seed, rules)
      const staged = startingBoard
        ? {
            board: startingBoard,
            tileIds: startingBoard.map((value, index) => (value === 0 ? 0 : index + 1)),
            nextTileId: 100,
          }
        : {}
      return { ...real, ...staged, moves: startingMoves }
    },
  }
})

/**
 * 2048's Moves Limit on its screen: offered only when the server declares it, played and reported
 * under its own mode with a best of its own, ended by the 300th valid move or by no move left, never
 * interrupted by 2048; the AI plays it too and never reports a run.
 */

const ALL_MODES = ['classic', 'moves']
const board = (...rows: number[][]) => rows.flat()
/** Packed to the left with nothing to merge: LEFT changes nothing, RIGHT does. */
const PACKED_LEFT = board([2, 4, 0, 0], [8, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
/** One merge to make, with room to spare. */
const ONE_MERGE = board([2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
/** One merge away from 2048. */
const ALMOST_WON = board([1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0])
/** Sliding left fills the last empty cell and leaves no legal move. */
const ALMOST_LOST = board([0, 8, 16, 32], [64, 128, 256, 512], [8, 16, 32, 64], [128, 256, 512, 1024])

const press = (key: string) => fireEvent.keyDown(window, { key })
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const stat = (label: string) => Number(screen.getByText(label).nextElementSibling?.textContent)
const picker = () => screen.queryByRole('group', { name: 'Game mode' })
const choose = (name: string) => fireEvent.click(within(picker()!).getByRole('button', { name }))
const heading = (name: string) => screen.queryByRole('heading', { name })

function game(props: Partial<GameProps<Game2048AI>> = {}) {
  const handlers = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  const view = render(<Game2048 {...handlers} ai={createGame2048Ai} {...props} />)
  return { ...handlers, ...view }
}

beforeEach(() => {
  window.localStorage.clear()
  startingBoard = null
  startingMoves = 0
})
afterEach(() => vi.useRealTimers())

describe('choosing a mode', () => {
  it('offers no picker without the list of modes, or while the server declares only Classic', () => {
    const { unmount } = game()
    expect(picker()).not.toBeInTheDocument()
    unmount()

    game({ modes: ['classic'] })
    expect(picker()).not.toBeInTheDocument()
    // Classic plays as before.
    expect(screen.getByText('Best tile')).toBeInTheDocument()
    expect(screen.queryByText('Moves left')).not.toBeInTheDocument()
  })

  it('offers Classic and Moves Limit when the server declares it, Classic first and chosen', () => {
    game({ modes: ALL_MODES })

    const buttons = within(picker()!).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Classic', 'Moves Limit'])
    expect(within(picker()!).getByRole('button', { name: 'Classic' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('sets Moves Limit up with its 300 moves and shows its objective', () => {
    game({ modes: ALL_MODES })
    choose('Moves Limit')

    expect(within(picker()!).getByRole('button', { name: 'Moves Limit' })).toHaveAttribute('aria-pressed', 'true')
    expect(stat('Moves used')).toBe(0)
    expect(stat('Moves left')).toBe(300)
    expect(screen.getByText(/Score as many points as you can in 300 moves\./)).toBeInTheDocument()
  })

  it('keeps Human or AI, and the AI speed, when the mode changes', () => {
    game({ modes: ALL_MODES })
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))

    choose('Moves Limit')
    expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: '8x' })).toHaveAttribute('aria-checked', 'true')

    choose('Classic')
    expect(screen.getByRole('button', { name: 'AI' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('radio', { name: '8x' })).toHaveAttribute('aria-checked', 'true')
  })

  it('cannot change while a human run is under way', () => {
    startingBoard = ONE_MERGE
    game({ modes: ALL_MODES })
    choose('Moves Limit')
    press('ArrowLeft')

    expect(within(picker()!).getByRole('button', { name: 'Classic' })).toBeDisabled()
    expect(screen.getByText('The mode can change once this run ends.')).toBeInTheDocument()
  })
})

describe('a Moves Limit run', () => {
  it('begins under its mode, and a Classic run as Classic, as before', () => {
    startingBoard = ONE_MERGE
    const moves = game({ modes: ALL_MODES })
    choose('Moves Limit')
    press('ArrowLeft')
    expect(moves.onGameStart).toHaveBeenCalledTimes(1)
    expect(moves.onGameStart).toHaveBeenCalledWith('moves')
    moves.unmount()

    const classic = game({ modes: ALL_MODES })
    press('ArrowLeft')
    expect(classic.onGameStart).toHaveBeenCalledTimes(1)
    expect(classic.onGameStart).toHaveBeenCalledWith()
  })

  it('does not count a move that changes nothing', () => {
    startingBoard = PACKED_LEFT
    game({ modes: ALL_MODES })
    choose('Moves Limit')

    for (let i = 0; i < 5; i++) press('ArrowLeft')
    expect(stat('Moves used')).toBe(0)
    expect(stat('Moves left')).toBe(300)

    press('ArrowRight')
    expect(stat('Moves used')).toBe(1)
    expect(stat('Moves left')).toBe(299)
  })

  it('ends right after the 300th valid move and reports the run once', () => {
    startingBoard = ONE_MERGE
    startingMoves = 299
    const { onGameOver } = game({ modes: ALL_MODES })
    choose('Moves Limit')
    expect(stat('Moves left')).toBe(1)

    press('ArrowLeft')

    expect(stat('Moves used')).toBe(300)
    expect(stat('Moves left')).toBe(0)
    expect(screen.getByText(/All 300 moves used\./)).toBeInTheDocument()
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0]).toMatchObject({ score: 4, metadata: { highestTile: 4, moves: 300 } })

    // Nothing moves after the last move.
    const held = screen.getByRole('img', { name: /2048 board/i }).outerHTML
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowUp', 'ArrowLeft']) press(key)
    expect(screen.getByRole('img', { name: /2048 board/i }).outerHTML).toBe(held)
    expect(onGameOver).toHaveBeenCalledTimes(1)
  })

  it('ends early when no move is left, and still reports the score', () => {
    startingBoard = ALMOST_LOST
    startingMoves = 40
    const { onGameOver } = game({ modes: ALL_MODES })
    choose('Moves Limit')

    press('ArrowLeft')

    expect(heading('No moves left') ?? heading('New best!')).toBeInTheDocument()
    expect(screen.getByText(/Stuck after 41 of 300 moves\./)).toHaveTextContent(
      'Only a run that uses every move earns the completion reward.',
    )
    expect(stat('Moves left')).toBe(259)
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0]).toMatchObject({ score: 0, metadata: { highestTile: 1024, moves: 41 } })
  })

  it('is not interrupted by making 2048', () => {
    startingBoard = ALMOST_WON
    const { onGameOver } = game({ modes: ALL_MODES })
    choose('Moves Limit')

    press('ArrowLeft')

    expect(heading('You made 2048!')).not.toBeInTheDocument()
    expect(screen.getByText('2048 reached!')).toBeInTheDocument()
    expect(stat('Score')).toBe(2048)
    press('ArrowRight')
    expect(stat('Moves used')).toBe(2)
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('is not reported when the player restarts before it ends', () => {
    startingBoard = ONE_MERGE
    const { onGameOver } = game({ modes: ALL_MODES })
    choose('Moves Limit')
    press('ArrowLeft')

    click('Restart')

    expect(onGameOver).not.toHaveBeenCalled()
    expect(stat('Moves used')).toBe(0)
  })

  it('keeps a best of its own, apart from Classic', () => {
    startingBoard = ONE_MERGE
    startingMoves = 299
    game({ modes: ALL_MODES })
    choose('Moves Limit')
    press('ArrowLeft')

    expect(heading('New best!')).toBeInTheDocument()
    expect(window.localStorage.getItem('cyan-arcade:high-score:2048-moves')).toBe('4')
    expect(window.localStorage.getItem('cyan-arcade:high-score:2048')).toBeNull()

    click('Play again')
    choose('Classic')
    expect(stat('Best')).toBe(0)
    choose('Moves Limit')
    expect(stat('Best')).toBe(4)
  })
})

describe('Moves Limit when the server no longer declares it', () => {
  it('never starts a human run of it, and never falls back to Classic', () => {
    startingBoard = ONE_MERGE
    const view = game({ modes: ALL_MODES })
    choose('Moves Limit')
    view.rerender(<Game2048 onGameStart={view.onGameStart} onGameOver={view.onGameOver} ai={createGame2048Ai} modes={['classic']} />)

    expect(heading('Moves Limit unavailable')).toBeInTheDocument()
    press('ArrowLeft')
    expect(view.onGameStart).not.toHaveBeenCalled()
    expect(stat('Moves used')).toBe(0)

    click('Play Classic')
    expect(heading('Moves Limit unavailable')).not.toBeInTheDocument()
    press('ArrowLeft')
    expect(view.onGameStart).toHaveBeenCalledWith()
  })
})

describe('the AI in Moves Limit', () => {
  it('plays to the limit and stops there, and never reports a run', () => {
    vi.useFakeTimers()
    startingMoves = 290
    const { onGameStart, onGameOver } = game({ modes: ALL_MODES })
    choose('Moves Limit')
    click('AI')
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))

    for (let i = 0; i < 40 && stat('Moves left') > 0; i++) act(() => vi.advanceTimersToNextTimer())
    expect(stat('Moves used')).toBe(300)
    expect(stat('Moves left')).toBe(0)
    expect(screen.getByText(/All 300 moves used\. The AI scored/)).toBeInTheDocument()

    // Nothing more is played, and nothing is ever reported.
    for (let i = 0; i < 5; i++) act(() => vi.advanceTimersByTime(1000))
    expect(stat('Moves used')).toBe(300)
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })
})
