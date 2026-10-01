import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_SPEEDS, aiActionDelay } from './ai'
import { useTicker } from './useTicker'

function Ticker({ onTick, intervalMs }: { onTick: () => void; intervalMs: number | null }) {
  useTicker(onTick, intervalMs)
  return null
}

describe('useTicker', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('calls the callback once per interval', () => {
    const onTick = vi.fn()
    render(<Ticker onTick={onTick} intervalMs={100} />)

    vi.advanceTimersByTime(99)
    expect(onTick).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onTick).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300)
    expect(onTick).toHaveBeenCalledTimes(4)
  })

  it('stops when the interval becomes null and resumes when it comes back', () => {
    const onTick = vi.fn()
    const { rerender } = render(<Ticker onTick={onTick} intervalMs={100} />)
    vi.advanceTimersByTime(200)

    rerender(<Ticker onTick={onTick} intervalMs={null} />)
    vi.advanceTimersByTime(1000)
    expect(onTick).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)

    rerender(<Ticker onTick={onTick} intervalMs={100} />)
    vi.advanceTimersByTime(100)
    expect(onTick).toHaveBeenCalledTimes(3)
  })

  it('switches to a new interval without keeping the old timer', () => {
    const onTick = vi.fn()
    const { rerender } = render(<Ticker onTick={onTick} intervalMs={1000} />)

    rerender(<Ticker onTick={onTick} intervalMs={10} />)
    vi.advanceTimersByTime(100)

    expect(onTick).toHaveBeenCalledTimes(10)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('always calls the latest callback', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(<Ticker onTick={first} intervalMs={100} />)

    rerender(<Ticker onTick={second} intervalMs={100} />)
    vi.advanceTimersByTime(100)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('leaves no timer behind after unmounting', () => {
    const onTick = vi.fn()
    const { unmount } = render(<Ticker onTick={onTick} intervalMs={100} />)
    vi.advanceTimersByTime(100)

    unmount()
    vi.advanceTimersByTime(1000)

    expect(onTick).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('AI speed', () => {
  it('only scales the delay between actions', () => {
    expect(AI_SPEEDS).toEqual([0.25, 0.5, 1, 2, 4, 8])
    expect(aiActionDelay(120, 1)).toBe(120)
    expect(aiActionDelay(120, 0.25)).toBe(480)
    expect(aiActionDelay(120, 8)).toBe(15)
  })
})
