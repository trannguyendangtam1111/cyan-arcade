import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { highestUnlocked, PROGRESS_KEY, readCleared, recordCleared, useChallengeProgress } from './challengeProgress'

beforeEach(() => window.localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe("this device's Challenge progress", () => {
  it('starts with no stage cleared and stage 1 open', () => {
    expect(readCleared()).toBe(0)
    expect(highestUnlocked(0)).toBe(1)
  })

  it('opens one stage after each cleared, up to the sixth', () => {
    expect([0, 1, 2, 5, 6].map(highestUnlocked)).toEqual([1, 2, 3, 6, 6])
  })

  it('records only the clear of the next stage', () => {
    expect(recordCleared(2)).toBe(0)
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBeNull()
    expect(recordCleared(1)).toBe(1)
    expect(recordCleared(1)).toBe(1)
    expect(recordCleared(3)).toBe(1)
    expect(recordCleared(2)).toBe(2)
    expect(readCleared()).toBe(2)
  })

  it('reads anything unreadable as nothing cleared, and anything beyond the last stage as the last', () => {
    for (const stored of ['abc', '-1', '1.5', '']) {
      window.localStorage.setItem(PROGRESS_KEY, stored)
      expect(readCleared()).toBe(0)
    }
    window.localStorage.setItem(PROGRESS_KEY, '99')
    expect(readCleared()).toBe(6)
  })

  it('keeps stage 1 open where storage is unavailable, and a clear open for the visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useChallengeProgress())
    expect(result.current.highestUnlocked).toBe(1)

    act(() => result.current.markCleared(1))
    expect(result.current).toMatchObject({ cleared: 1, highestUnlocked: 2 })
  })

  it('opens the next stage as soon as a clear is marked, and ignores a stage out of order', () => {
    const { result } = renderHook(() => useChallengeProgress())
    act(() => result.current.markCleared(3))
    expect(result.current.cleared).toBe(0)
    act(() => result.current.markCleared(1))
    expect(result.current).toMatchObject({ cleared: 1, highestUnlocked: 2 })
    expect(window.localStorage.getItem(PROGRESS_KEY)).toBe('1')
  })
})
