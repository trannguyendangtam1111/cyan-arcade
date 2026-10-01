import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DirectionPad } from './components/DirectionPad'
import { useKeyboard } from './useKeyboard'
import { useSwipe, type SwipeDirection } from './useSwipe'

/** A surface that reports swipes, as the game boards do. */
function SwipeArea({ onSwipe }: { onSwipe: (direction: SwipeDirection) => void }) {
  return <div data-testid="area" {...useSwipe(onSwipe)} />
}

function swipe(from: [number, number], to: [number, number]) {
  const area = screen.getByTestId('area')
  fireEvent.pointerDown(area, { clientX: from[0], clientY: from[1] })
  fireEvent.pointerUp(area, { clientX: to[0], clientY: to[1] })
}

describe('useSwipe', () => {
  it.each([
    ['RIGHT', [100, 100], [180, 110]],
    ['LEFT', [100, 100], [20, 90]],
    ['DOWN', [100, 100], [110, 190]],
    ['UP', [100, 100], [95, 30]],
  ] as const)('reports a drag as %s', (direction, from, to) => {
    const onSwipe = vi.fn()
    render(<SwipeArea onSwipe={onSwipe} />)

    swipe([...from], [...to])

    expect(onSwipe).toHaveBeenCalledExactlyOnceWith(direction)
  })

  it('goes by the longer axis of a diagonal drag', () => {
    const onSwipe = vi.fn()
    render(<SwipeArea onSwipe={onSwipe} />)

    swipe([100, 100], [160, 140])

    expect(onSwipe).toHaveBeenCalledExactlyOnceWith('RIGHT')
  })

  it('ignores a tap and a drag too short to be meant', () => {
    const onSwipe = vi.fn()
    render(<SwipeArea onSwipe={onSwipe} />)

    swipe([100, 100], [100, 100])
    swipe([100, 100], [115, 110])

    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('forgets a drag the browser cancelled, and a release with no press before it', () => {
    const onSwipe = vi.fn()
    render(<SwipeArea onSwipe={onSwipe} />)
    const area = screen.getByTestId('area')

    fireEvent.pointerDown(area, { clientX: 100, clientY: 100 })
    fireEvent.pointerCancel(area)
    fireEvent.pointerUp(area, { clientX: 300, clientY: 100 })

    expect(onSwipe).not.toHaveBeenCalled()
  })
})

describe('useKeyboard', () => {
  const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event
  }

  it('passes keys to the handler and stops the browser acting on the ones it used', () => {
    const handler = vi.fn((event: KeyboardEvent) => event.key === 'ArrowUp')
    renderHook(() => useKeyboard(handler))

    expect(press('ArrowUp').defaultPrevented).toBe(true)
    // A key the game has no use for keeps its normal effect.
    expect(press('Tab').defaultPrevented).toBe(false)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('leaves shortcuts with a modifier key to the browser', () => {
    const handler = vi.fn(() => true)
    renderHook(() => useKeyboard(handler))

    press('r', { ctrlKey: true })
    press('ArrowLeft', { altKey: true })
    press('a', { metaKey: true })

    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores keys typed into a form field', () => {
    const handler = vi.fn(() => true)
    renderHook(() => useKeyboard(handler))
    render(<input aria-label="name" />)

    const event = press('ArrowLeft', {}, screen.getByLabelText('name'))

    expect(handler).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('lets Space and Enter keep pressing a focused button, but not other keys', () => {
    const handler = vi.fn(() => true)
    renderHook(() => useKeyboard(handler))
    render(<button>Pause</button>)
    const button = screen.getByRole('button', { name: 'Pause' })

    press(' ', {}, button)
    press('Enter', {}, button)
    expect(handler).not.toHaveBeenCalled()

    press('ArrowDown', {}, button)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('takes focus off a clicked button once the keyboard is used for the game', () => {
    renderHook(() => useKeyboard(() => true))
    render(<button>Restart</button>)
    const button = screen.getByRole('button', { name: 'Restart' })
    button.focus()

    press('ArrowDown', {}, button)

    expect(document.activeElement).not.toBe(button)
  })

  it('listens only while enabled, and always calls the latest handler', () => {
    const first = vi.fn(() => true)
    const second = vi.fn(() => true)
    const { rerender, unmount } = renderHook(({ handler, enabled }) => useKeyboard(handler, enabled), {
      initialProps: { handler: first, enabled: false },
    })

    press('ArrowUp')
    expect(first).not.toHaveBeenCalled()

    rerender({ handler: second, enabled: true })
    press('ArrowUp')
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()

    unmount()
    press('ArrowUp')
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('DirectionPad', () => {
  it('reports the direction of the button pressed, on press rather than release', () => {
    const onPress = vi.fn()
    render(<DirectionPad onPress={onPress} />)

    fireEvent.pointerDown(screen.getByRole('button', { name: 'left' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'up' }))

    expect(onPress.mock.calls).toEqual([['LEFT'], ['UP']])
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })
})
