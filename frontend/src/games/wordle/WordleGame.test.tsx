import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { GameCosmetics, GameProps, GameSkin } from '@/games/types'
import { admin, mockApi, pixel } from '@/test/mockApi'
import { wordleServer, type WordleServerOptions } from '@/test/wordleServer'
import { createWordleAiPlayer, type WordleAiPlayer } from './ai/wordleAiPlayer'
import WordleGame from './WordleGame'

function setup(options: WordleServerOptions = {}, props: Partial<GameProps<WordleAiPlayer>> = {}, user = pixel) {
  const server = wordleServer(options)
  const fetchSpy = mockApi({ user, handlers: [server.handler] })
  const onGameStart = vi.fn()
  const onGameOver = vi.fn()
  const currentSession = vi.fn(() => Promise.resolve({ id: 'session-1' }))
  render(
    <MemoryRouter>
      <WordleGame onGameStart={onGameStart} onGameOver={onGameOver} currentSession={currentSession} {...props} />
    </MemoryRouter>,
  )
  return { server, fetchSpy, onGameStart, onGameOver, currentSession }
}

const type = (word: string) => {
  for (const letter of word) fireEvent.keyDown(window, { key: letter })
}
const enter = () => fireEvent.keyDown(window, { key: 'Enter' })

const board = () => screen.getByRole('grid', { name: /Daily Word|Practice board|AI board/ })
const row = (index: number) => within(board()).getAllByRole('row')[index]
const states = (index: number) => within(row(index)).getAllByRole('gridcell').map((cell) => cell.dataset.state)
const letters = (index: number) => within(row(index)).getAllByRole('gridcell').map((cell) => cell.textContent).join('')

async function ready() {
  await screen.findByRole('grid', { name: 'Daily Word #281' })
}

describe('Word Guess', () => {
  it('shows today\'s puzzle on an empty board of six rows of five, with a keyboard', async () => {
    setup()
    await ready()

    expect(within(board()).getAllByRole('row')).toHaveLength(6)
    expect(within(board()).getAllByRole('gridcell')).toHaveLength(30)
    expect(screen.getByRole('group', { name: 'Keyboard' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Q' })).toBeInTheDocument()
    expect(screen.getByText('#281')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Daily Word/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('types from the keyboard and the screen, and erases', async () => {
    setup()
    await ready()

    type('apx')
    expect(letters(0)).toBe('APX')
    fireEvent.keyDown(window, { key: 'Backspace' })
    fireEvent.click(screen.getByRole('button', { name: 'P' }))
    expect(letters(0)).toBe('APP')
    fireEvent.click(screen.getByRole('button', { name: 'Delete letter' }))
    expect(letters(0)).toBe('AP')
    // A sixth letter does not fit.
    type('PLEX')
    expect(letters(0)).toBe('APPLE')
  })

  it('starts the daily run with the platform\'s session and colours the tiles the server judged', async () => {
    const { server, onGameStart, currentSession } = setup()
    await ready()

    type('ALLEY')
    enter()

    await waitFor(() => expect(states(0)).toEqual(['correct', 'present', 'absent', 'present', 'absent']))
    expect(onGameStart).toHaveBeenCalledOnce()
    expect(currentSession).toHaveBeenCalled()
    expect(server.calls.find((call) => call.path === '/api/wordle/daily/runs')?.body).toEqual({ sessionId: 'session-1' })
    // One L in APPLE: the second L is grey on the board, but the key says the letter is in the word.
    expect(screen.getByRole('button', { name: 'L, in the word' })).toHaveAttribute('data-state', 'present')
    expect(screen.getByRole('button', { name: 'A, correct' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Y, not in the word' })).toBeInTheDocument()
    expect(letters(1)).toBe('')
  })

  it('wants five letters before Enter, and asks the server nothing', async () => {
    const { server } = setup()
    await ready()

    type('APP')
    enter()

    expect(await screen.findByRole('status')).toHaveTextContent('Not enough letters')
    expect(server.calls.some((call) => call.path.includes('/guesses'))).toBe(false)
  })

  it('refuses a word that is not in the list without using a guess', async () => {
    setup()
    await ready()

    type('QQQQQ')
    enter()

    expect(await screen.findByText('Not in the word list')).toBeInTheDocument()
    expect(letters(0)).toBe('QQQQQ')
    expect(states(0)).toEqual(['filled', 'filled', 'filled', 'filled', 'filled'])
    expect(screen.getByText('0/6')).toBeInTheDocument()
  })

  it('reports a solved daily puzzle to the platform with the server\'s score', async () => {
    const { onGameOver } = setup()
    await ready()

    type('CRANE')
    enter()
    await waitFor(() => expect(letters(0)).toBe('CRANE'))
    await waitFor(() => expect(screen.getByText('1/6')).toBeInTheDocument())
    type('APPLE')
    enter()

    await waitFor(() => expect(onGameOver).toHaveBeenCalledOnce())
    expect(onGameOver.mock.calls[0][0]).toMatchObject({
      score: 500,
      metadata: { solved: 1, guesses: 2, hints: 0, speed: 5, cleanSolve: 1, oneHintSolve: 0, streak: 1 },
    })
    const result = await screen.findByRole('region', { name: 'Result' })
    expect(result).toHaveTextContent('Solved in 2 of 6')
    expect(result).toHaveTextContent('500')
    expect(states(1)).toEqual(['correct', 'correct', 'correct', 'correct', 'correct'])
    // The game is over: no more typing.
    expect(screen.queryByRole('group', { name: 'Keyboard' })).not.toBeInTheDocument()
  })

  it('shows the word after six misses and reports a score of nothing', async () => {
    const { onGameOver } = setup()
    await ready()

    for (const [index, word] of ['CRANE', 'SLOTH', 'BUILT', 'GHOST', 'MOUND', 'PIXEL'].entries()) {
      type(word)
      enter()
      await waitFor(() => expect(screen.getByText(`${index + 1}/6`)).toBeInTheDocument())
    }

    expect(await screen.findByRole('region', { name: 'Result' })).toHaveTextContent('The word was APPLE')
    expect(onGameOver.mock.calls[0][0]).toMatchObject({ score: 0, metadata: { solved: 0, guesses: 6 } })
  })

  it('gives three hints, one of each, and says what they cost', async () => {
    setup()
    await ready()
    const hints = screen.getByRole('region', { name: 'Hints' })
    expect(hints).toHaveTextContent('The next one leaves 90% of your score.')

    fireEvent.click(within(hints).getByRole('button', { name: /Reveal/ }))
    expect(await within(hints).findByText('2nd letter: P')).toBeInTheDocument()
    // The revealed letter waits faintly in its place on the row being typed.
    expect(within(row(0)).getAllByRole('gridcell')[1]).toHaveAttribute('data-state', 'hint')

    fireEvent.click(within(hints).getByRole('button', { name: /Check/ }))
    expect(hints).toHaveTextContent('Tap a letter to check it.')
    fireEvent.click(screen.getByRole('button', { name: 'E' }))
    expect(await within(hints).findByText('E is in the word')).toBeInTheDocument()

    fireEvent.click(within(hints).getByRole('button', { name: /Remove/ }))
    expect(await within(hints).findByText('Not in the word: Q X Z')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Q, not in the word' })).toBeInTheDocument()
    expect(hints).toHaveTextContent('No hints left in this game.')
    for (const name of [/Reveal/, /Check/, /Remove/]) expect(within(hints).getByRole('button', { name })).toBeDisabled()
  })

  it('plays practice words without the platform: no session, no score', async () => {
    const { onGameStart, onGameOver, server } = setup()
    await ready()

    fireEvent.click(screen.getByRole('tab', { name: /Practice/ }))
    expect(screen.getByText('Practice', { selector: 'dd' })).toBeInTheDocument()
    type('SLOTH')
    enter()

    expect(await screen.findByRole('region', { name: 'Result' })).toHaveTextContent('no score is saved')
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
    expect(server.calls.some((call) => call.path === '/api/wordle/practice/runs')).toBe(true)

    // A new word starts a new practice game.
    fireEvent.click(screen.getByRole('button', { name: 'New word' }))
    expect(await screen.findByRole('group', { name: 'Keyboard' })).toBeInTheDocument()
  })

  it('shows a daily puzzle already played today as it ended, and plays it no more', async () => {
    const { onGameStart, onGameOver } = setup({ daily: { guesses: ['ALLEY', 'APPLE'], scored: true } })
    await ready()

    expect(await screen.findByRole('region', { name: 'Result' })).toHaveTextContent('Solved in 2 of 6')
    expect(letters(1)).toBe('APPLE')
    expect(screen.queryByRole('group', { name: 'Keyboard' })).not.toBeInTheDocument()
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('picks up a daily puzzle left half-played, with a new session at the next guess', async () => {
    const { server, onGameStart } = setup({ daily: { guesses: ['CRANE'], scored: false } })
    await ready()
    expect(letters(0)).toBe('CRANE')
    expect(onGameStart).not.toHaveBeenCalled()

    type('ALLEY')
    enter()

    await waitFor(() => expect(letters(1)).toBe('ALLEY'))
    expect(onGameStart).toHaveBeenCalledOnce()
    expect(server.dailyRun?.sessionId).toBe('session-1')
  })

  it('reports a finished daily puzzle whose score never reached the platform', async () => {
    const { onGameStart, onGameOver, server } = setup({ daily: { guesses: ['APPLE'], scored: false } })

    await waitFor(() => expect(onGameOver).toHaveBeenCalledOnce())
    expect(onGameStart).toHaveBeenCalledOnce()
    expect(server.dailyRun?.sessionId).toBe('session-1')
    expect(onGameOver.mock.calls[0][0]).toMatchObject({ score: 600 })
  })

  it('shows the player\'s statistics', async () => {
    setup({ daily: { guesses: ['CRANE', 'ALLEY', 'APPLE'], scored: true } })
    await ready()

    fireEvent.click(screen.getAllByRole('button', { name: /Statistics/ })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Your Daily Word' })
    expect(await within(dialog).findByText('75')).toBeInTheDocument()
    expect(within(dialog).getByText('Win %')).toBeInTheDocument()
    expect(within(dialog).getByText('3.7')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('1 solved in 3')).toBeInTheDocument()
    expect(within(dialog).getByText(/Next puzzle in/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Copy result/ })).toBeInTheDocument()
  })

  it('offers no AI to a player', async () => {
    setup()
    await ready()

    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
  })

  it('lets an admin watch the AI solve with a chosen strategy, without touching the score', async () => {
    const { server, onGameStart, onGameOver } = setup({}, { ai: createWordleAiPlayer }, admin)
    await ready()

    fireEvent.click(screen.getByRole('button', { name: 'AI' }))
    const settings = screen.getByRole('region', { name: 'AI settings' })
    fireEvent.click(within(settings).getByRole('radio', { name: /Speed Solver/ }))
    fireEvent.click(screen.getByRole('radio', { name: '8x' }))
    fireEvent.click(within(settings).getByRole('button', { name: 'Solve' }))

    await screen.findByRole('grid', { name: 'AI board' })
    expect(await screen.findByText('AI finished', {}, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.getByText(/Solved in 3: APPLE/)).toBeInTheDocument()
    expect(server.calls.find((call) => call.path === '/api/ai/wordle/solve')?.body).toEqual({ strategy: 'SPEED_SOLVER', date: '2026-10-08' })
    const aiBoard = screen.getByRole('grid', { name: 'AI board' })
    expect(within(aiBoard).getAllByRole('row').slice(0, 3).map((line) => line.getAttribute('aria-label'))).toEqual([
      'Row 1: CRANE',
      'Row 2: ALLEY',
      'Row 3: APPLE',
    ])
    expect(within(settings).getByRole('list', { name: 'AI games this visit' })).toHaveTextContent('Speed Solver')
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })

  it('runs an admin\'s benchmark of a strategy', async () => {
    setup({}, { ai: createWordleAiPlayer }, admin)
    await ready()
    fireEvent.click(screen.getByRole('button', { name: 'AI' }))

    fireEvent.click(screen.getByRole('button', { name: /Test Balanced on every word/ }))

    expect(await screen.findByText(/solved/, { selector: 'p' })).toHaveTextContent('Balanced: solved 662 of 662 words, 3.61 guesses on average.')
  })

  it('dresses the board and keyboard in the skins worn, and lets the player wear one', async () => {
    const skin = (itemId: number, slot: string, skinId: string, owned: boolean, equipped: boolean): GameSkin => ({
      itemId, slot, skinId, name: `${skinId} ${slot}`, price: 400, minLevel: 1, owned, wearable: owned, equipped, unlocked: true,
    })
    const equip = vi.fn()
    const cosmetics: GameCosmetics = {
      signedIn: true,
      skins: [skin(70, 'tiles', 'neon', true, true), skin(71, 'tiles', 'candy', false, false), skin(72, 'keyboard', 'sakura', true, false)],
      equip,
      saving: false,
      shopPath: '/shop?type=GAME_SKIN',
      loginPath: '/login',
    }
    setup({}, { cosmetics })
    await ready()

    // Neon tiles bring a dark backdrop.
    expect(board()).toHaveStyle({ background: '#0b1120' })
    const look = screen.getByRole('region', { name: 'Your look' })
    expect(within(look).getByRole('radio', { name: 'neon tiles' })).toHaveAttribute('aria-checked', 'true')
    expect(within(look).getByRole('radio', { name: 'candy tiles (in the shop)' })).toBeDisabled()

    fireEvent.click(within(look).getByRole('radio', { name: 'sakura keyboard' }))
    expect(equip).toHaveBeenCalledWith('keyboard', 72)
    fireEvent.click(within(look).getByRole('radio', { name: 'Cyan Tiles' }))
    expect(equip).toHaveBeenCalledWith('tiles', null)
  })
})
