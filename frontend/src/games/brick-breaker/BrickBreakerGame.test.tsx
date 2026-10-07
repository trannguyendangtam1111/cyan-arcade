import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameCosmetics, GameProps, GameSkin } from '@/games/types'
import { createBrickAi, type BrickAI } from './ai/brickAi'
import BrickBreakerGame from './BrickBreakerGame'

vi.mock('@/games/shared/random', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/games/shared/random')>()),
  createSeed: () => 13579,
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

function play(props: Partial<GameProps<BrickAI>> = {}) {
  const handlers = { onGameStart: vi.fn(), onGameOver: vi.fn() }
  render(
    <MemoryRouter>
      <BrickBreakerGame {...handlers} {...props} />
    </MemoryRouter>,
  )
  return handlers
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const arena = () => screen.getByRole('button', { name: /Brick Breaker arena/ })
const statText = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent ?? ''
const score = () => Number(statText('Score').replace(/,/g, ''))

/** Holds the left arrow down (and never lets go), so the paddle sits at the left wall and misses. */
function loseOnPurpose() {
  fireEvent.keyDown(window, { key: ' ' })
  fireEvent.keyDown(window, { key: 'ArrowLeft' })
  for (let i = 0; i < 60 && !screen.queryByRole('heading', { name: /Game over|New personal best/ }); i++) advance(10_000)
}

describe('Brick Breaker', () => {
  it('opens on level 1 with its score, lives and look, waiting for a launch', () => {
    play()
    expect(arena().querySelector('canvas')).not.toBeNull()
    expect(screen.getByText('Tap, click or press Space to launch')).toBeInTheDocument()
    expect(screen.getByText('Level 1 · Cute Sakura')).toBeInTheDocument()
    expect(score()).toBe(0)
    expect(statText('Level')).toBe('1')
    expect(screen.getByLabelText('3 lives')).toBeInTheDocument()
    const look = screen.getByRole('region', { name: 'Your look' })
    for (const name of ['Cyan Default', 'Cyan Orb', 'Arcade Worlds']) expect(within(look).getByText(name)).toBeInTheDocument()
  })

  it('starts the run with the first launch, once, and keeps the page still', () => {
    const { onGameStart } = play()
    expect(fireEvent.keyDown(window, { key: 'ArrowRight' })).toBe(false)
    fireEvent.keyUp(window, { key: 'ArrowRight' })
    expect(onGameStart).not.toHaveBeenCalled()
    expect(fireEvent.keyDown(window, { key: ' ' })).toBe(false)
    expect(onGameStart).toHaveBeenCalledTimes(1)
    advance(500)
    fireEvent.keyDown(window, { key: ' ' })
    fireEvent.pointerDown(arena(), { pointerType: 'touch', button: 0, clientX: 100 })
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Tap, click or press Space to launch')).not.toBeInTheDocument()
  })

  it('starts even when the pointer cannot be captured (it was released before the tap was handled)', () => {
    const { onGameStart } = play()
    // What a browser does for a pointer that is no longer down (jsdom has no pointer capture at all).
    const capture = vi.fn(() => {
      throw new DOMException('No active pointer with the given id is found.', 'NotFoundError')
    })
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: capture })
    try {
      fireEvent.pointerDown(arena(), { pointerType: 'touch', button: 0, pointerId: 7 })
      expect(onGameStart).toHaveBeenCalledTimes(1)
      expect(capture).toHaveBeenCalled()
    } finally {
      delete (HTMLElement.prototype as { setPointerCapture?: unknown }).setPointerCapture
    }
  })

  it('starts with a tap or a click, but not a right click', () => {
    const { onGameStart } = play()
    fireEvent.pointerDown(arena(), { pointerType: 'mouse', button: 2 })
    expect(onGameStart).not.toHaveBeenCalled()
    fireEvent.pointerMove(arena(), { pointerType: 'mouse', clientX: 50 })
    fireEvent.pointerDown(arena(), { pointerType: 'touch', button: 0 })
    expect(onGameStart).toHaveBeenCalledTimes(1)
  })

  it('scores as bricks break, and ends when the lives run out, reporting the run once', () => {
    const { onGameOver } = play()
    loseOnPurpose()
    expect(screen.getByRole('heading', { name: /Game over|New personal best/ })).toBeInTheDocument()
    expect(onGameOver).toHaveBeenCalledTimes(1)
    const [result] = onGameOver.mock.calls[0]
    expect(Object.keys(result.metadata).sort()).toEqual(['bricks', 'fireBricks', 'gameMs', 'laserBricks', 'level', 'livesLost', 'maxBalls', 'maxCombo', 'perfectClears', 'powerUps'])
    expect(result.metadata.livesLost).toBeGreaterThanOrEqual(3)
    expect(result.score).toBe(score())
    expect(screen.getByLabelText('0 lives')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Leaderboard' })).toHaveAttribute('href', '/leaderboard?game=brick-breaker')
    advance(5000)
    expect(onGameOver).toHaveBeenCalledTimes(1)
  })

  it('starts over with Retry', () => {
    const { onGameStart } = play()
    loseOnPurpose()
    fireEvent.keyUp(window, { key: 'ArrowLeft' })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByText('Tap, click or press Space to launch')).toBeInTheDocument()
    expect(score()).toBe(0)
    fireEvent.keyDown(window, { key: ' ' })
    expect(onGameStart).toHaveBeenCalledTimes(2)
  })

  it('pauses, and nothing moves while paused', () => {
    play()
    fireEvent.keyDown(window, { key: ' ' })
    advance(300)
    fireEvent.keyDown(window, { key: 'p' })
    expect(screen.getByRole('heading', { name: 'Paused' })).toBeInTheDocument()
    const before = score()
    advance(20_000)
    expect(score()).toBe(before)
    fireEvent.keyDown(window, { key: 'p' })
    expect(screen.queryByRole('heading', { name: 'Paused' })).not.toBeInTheDocument()
  })
})

describe('Brick Breaker skins', () => {
  const skin = (overrides: Partial<GameSkin>): GameSkin => ({ itemId: 1, slot: 'paddle', skinId: 'candy', name: 'Candy Paddle', price: 300, minLevel: 1, owned: true, equipped: false, unlocked: true, ...overrides })
  const cosmetics = (overrides: Partial<GameCosmetics> = {}): GameCosmetics => ({
    signedIn: true,
    skins: [
      skin({}),
      skin({ itemId: 2, skinId: 'dragon', name: 'Dragon Paddle', owned: false, price: 1800, minLevel: 6, unlocked: false }),
      skin({ itemId: 3, slot: 'ball', skinId: 'plasma', name: 'Plasma Ball', equipped: true }),
    ],
    equip: vi.fn(),
    saving: false,
    shopPath: '/shop?category=skins',
    loginPath: '/login?redirect=%2Fgames%2Fbrick-breaker',
    ...overrides,
  })

  it('shows what is worn, and lets the player equip, unequip or find more', () => {
    const equip = vi.fn()
    play({ cosmetics: cosmetics({ equip }) })
    expect(within(screen.getByRole('region', { name: 'Your look' })).getByText('Plasma Ball')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }))
    const dialog = screen.getByRole('dialog', { name: 'Customize your arcade' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Equip Candy Paddle' }))
    expect(equip).toHaveBeenCalledWith('paddle', 1)
    expect(within(dialog).getByRole('link', { name: 'Get Dragon Paddle in the shop' })).toHaveAttribute('href', '/shop?category=skins')
    expect(within(dialog).getByText('Level 6')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Ball' }))
    // Back to the game's own ball: take the plasma one off.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Equip Cyan Orb' }))
    expect(equip).toHaveBeenCalledWith('ball', null)
  })

  it('asks a guest to log in', () => {
    play({ cosmetics: cosmetics({ signedIn: false, skins: cosmetics().skins!.map((each) => ({ ...each, owned: false, equipped: false, unlocked: null })) }) })
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }))
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Log in' })).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /^Equip Candy/ })).not.toBeInTheDocument()
  })
})

describe('Brick Breaker AI mode', () => {
  it('is not there without the AI', () => {
    play()
    expect(screen.queryByRole('group', { name: 'Play mode' })).not.toBeInTheDocument()
  })

  it('plays on its own for an admin, at any speed, without reporting runs', () => {
    const { onGameStart, onGameOver } = play({ ai: createBrickAi })
    fireEvent.click(within(screen.getByRole('group', { name: 'Play mode' })).getByRole('button', { name: 'AI' }))
    expect(screen.getByRole('region', { name: 'AI statistics' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: '4x' }))
    for (let i = 0; i < 30 && score() < 500; i++) advance(1000)
    expect(score()).toBeGreaterThanOrEqual(500)
    expect(screen.getByRole('region', { name: 'AI mode' })).toHaveTextContent(/AI → paddle → \d+/)
    expect(onGameStart).not.toHaveBeenCalled()
    expect(onGameOver).not.toHaveBeenCalled()
  })
})
