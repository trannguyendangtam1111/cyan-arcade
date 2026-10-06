import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameCosmetics, GameProps, GameSkin } from '@/games/types'
import { createFlappyAi, type FlappyAI } from './ai/flappyAi'
import FlappyBirdGame from './FlappyBirdGame'

vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 2468,
}))

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

function play(props: Partial<GameProps<FlappyAI>> = {}) {
  const handlers = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  render(
    <MemoryRouter>
      <FlappyBirdGame {...handlers} {...props} />
    </MemoryRouter>,
  )
  return handlers
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const press = (key: string) => fireEvent.keyDown(window, { key })
const playfield = () => screen.getByRole('button', { name: /playfield/i })
const stat = (label: string) => Number(screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent)

const skin = (overrides: Partial<GameSkin>): GameSkin => ({
  itemId: 1,
  slot: 'bird',
  skinId: 'pinky',
  name: 'Pinky Bird',
  price: 300,
  minLevel: 1,
  owned: false,
  equipped: false,
  unlocked: true,
  ...overrides,
})

const cosmetics = (overrides: Partial<GameCosmetics> = {}): GameCosmetics => ({
  signedIn: true,
  skins: [
    skin({ itemId: 1, skinId: 'pinky', name: 'Pinky Bird', owned: true }),
    skin({ itemId: 2, skinId: 'mochi', name: 'Mochi Bird', price: 350 }),
    skin({ itemId: 3, skinId: 'phoenix', name: 'Phoenix Bird', price: 2000, minLevel: 6, unlocked: false }),
    skin({ itemId: 20, slot: 'pipes', skinId: 'candy', name: 'Candy Pipes', owned: true, equipped: true }),
  ],
  equip: vi.fn(),
  saving: false,
  shopPath: '/shop?category=skins',
  loginPath: '/login?redirect=%2Fgames%2Fflappy-bird',
  ...overrides,
})

describe('Flappy Bird', () => {
  it('opens on the start screen, with the score, the best and the look', () => {
    play()
    expect(playfield().querySelector('canvas')).not.toBeNull()
    expect(screen.getByText('Tap, click or press Space to flap')).toBeInTheDocument()
    expect(stat('Score')).toBe(0)
    expect(stat('Best')).toBe(0)
    expect(stat('Level')).toBe(1)
    const look = screen.getByRole('region', { name: 'Your look' })
    expect(within(look).getByText('Cyan Bird')).toBeInTheDocument()
    expect(within(look).getByText('Classic Cyan Pipe')).toBeInTheDocument()
    expect(within(look).getByText('Cyan Sky')).toBeInTheDocument()
  })

  it('starts the run with the first flap, once, from Space, the up arrow or a tap', () => {
    const { onGameStart } = play()
    expect(fireEvent.keyDown(window, { key: ' ' })).toBe(false) // the page does not scroll
    expect(onGameStart).toHaveBeenCalledTimes(1)
    advance(100)
    press('ArrowUp')
    fireEvent.pointerDown(playfield(), { pointerType: 'touch', button: 0 })
    fireEvent.pointerDown(playfield(), { pointerType: 'mouse', button: 0 })
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Tap, click or press Space to flap')).not.toBeInTheDocument()
  })

  it('ignores the right mouse button and typing in other places', () => {
    const { onGameStart } = play()
    fireEvent.pointerDown(playfield(), { pointerType: 'mouse', button: 2 })
    expect(onGameStart).not.toHaveBeenCalled()
  })

  it('ends the flight on the ground and reports it once, with its details', () => {
    const { onGameStart, onGameOver } = play()
    press(' ')
    advance(3000)
    expect(onGameOver).toHaveBeenCalledTimes(1)
    const [result] = onGameOver.mock.calls[0]
    expect(result.score).toBe(0)
    expect(result.metadata).toEqual({
      pipes: 0,
      flaps: 1,
      flightMs: expect.any(Number),
      seconds: 0,
      level: 1,
      seed: 2468,
    })
    expect(result.metadata.flightMs).toBeGreaterThan(500)
    expect(result.metadata.flightMs).toBeLessThan(2000)
    expect(screen.getByRole('heading', { name: 'Down you go!' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute('href', '/leaderboard?game=flappy-bird')
    advance(2000)
    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameStart).toHaveBeenCalledTimes(1)
  })

  it('restarts with Retry, or with Space once the crash has sunk in', () => {
    const { onGameStart } = play()
    press(' ')
    advance(3000)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText('Tap, click or press Space to flap')).toBeInTheDocument()
    press(' ')
    expect(onGameStart).toHaveBeenCalledTimes(2)

    advance(3000)
    press(' ') // long after the crash: a new game
    expect(screen.getByText('Tap, click or press Space to flap')).toBeInTheDocument()
  })

  it('pauses and resumes, and nothing moves while paused', () => {
    const { onGameOver } = play()
    press(' ')
    advance(200)
    press('p')
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    advance(5000)
    expect(onGameOver).not.toHaveBeenCalled()
    // Flapping while paused does nothing either.
    press(' ')
    fireEvent.click(within(screen.getByRole('heading', { name: 'Paused' }).parentElement!).getByRole('button', { name: 'Resume' }))
    advance(3000)
    expect(onGameOver).toHaveBeenCalledTimes(1)
  })

  it('pauses by itself when the tab is hidden', () => {
    play()
    press(' ')
    advance(100)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument()
  })
})

describe('Flappy Bird skins', () => {
  it('shows the skins the player wears before the flight', () => {
    play({ cosmetics: cosmetics() })
    const look = screen.getByRole('region', { name: 'Your look' })
    expect(within(look).getByText('Cyan Bird')).toBeInTheDocument()
    expect(within(look).getByText('Candy Pipes')).toBeInTheDocument()
  })

  it('lets the player wear what they own, and points to the shop for the rest', () => {
    const equip = vi.fn()
    play({ cosmetics: cosmetics({ equip }) })
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }))
    const dialog = screen.getByRole('dialog', { name: 'Customize your flight' })

    // Owned: wear it. The default bird is worn now.
    expect(within(dialog).getAllByText('Equipped')).toHaveLength(1)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Equip Pinky Bird' }))
    expect(equip).toHaveBeenCalledWith('bird', 1)
    // Not owned: its price and the way to the shop.
    expect(within(dialog).getByRole('link', { name: 'Get Mochi Bird in the shop' })).toHaveAttribute('href', '/shop?category=skins')
    expect(within(dialog).getByText('Level 6')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Equip Mochi Bird' })).not.toBeInTheDocument()

    // Obstacles: the candy pipes are worn, and the classic ones take them off.
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Obstacles' }))
    expect(within(dialog).getByRole('tab', { name: 'Obstacles' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Equip Classic Cyan Pipe' }))
    expect(equip).toHaveBeenCalledWith('pipes', null)
    // Skins the shop does not sell are not shown.
    expect(within(dialog).queryByText('Dragon Towers')).not.toBeInTheDocument()
  })

  it('asks a guest to log in to collect skins', () => {
    play({ cosmetics: cosmetics({ signedIn: false, skins: cosmetics().skins!.map((each) => ({ ...each, owned: false, equipped: false, unlocked: null })) }) })
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login?redirect=%2Fgames%2Fflappy-bird')
    expect(within(dialog).queryByRole('button', { name: /^Equip/ })).not.toBeInTheDocument()
    expect(within(dialog).getAllByText('Locked').length).toBeGreaterThan(0)
  })

  it('pauses a flight while the player customizes', () => {
    const { onGameOver } = play({ cosmetics: cosmetics() })
    press(' ')
    advance(100)
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }))
    advance(5000)
    expect(onGameOver).not.toHaveBeenCalled()
  })
})

describe('Flappy Bird AI mode', () => {
  it('is not there for players without the AI', () => {
    play()
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'AI mode' })).not.toBeInTheDocument()
  })

  it('lets an admin watch the AI fly, at any speed, without reporting runs', () => {
    const { onGameStart, onGameOver } = play({ ai: createFlappyAi })
    fireEvent.click(within(screen.getByRole('group', { name: 'Play mode' })).getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('region', { name: 'AI mode' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'AI statistics' })).toBeInTheDocument()
    expect(screen.getByText('The AI is getting ready…')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: '8x' }))
    for (let i = 0; i < 20 && stat('Score') < 3; i++) advance(1000)
    expect(stat('Score')).toBeGreaterThanOrEqual(3)
    expect(screen.getByRole('region', { name: 'AI mode' })).toHaveTextContent(/AI → (Flap|Glide)/)
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
    // Its keys are not the player's.
    press(' ')
    expect(onGameStart).not.toHaveBeenCalled()
  })
})
