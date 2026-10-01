import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHighScore } from './useHighScore'

describe('useHighScore', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts at zero for a game that has never been played', () => {
    const { result } = renderHook(() => useHighScore('snake'))

    expect(result.current.best).toBe(0)
  })

  it('records a better score, reports it as a new best and remembers it', () => {
    const { result } = renderHook(() => useHighScore('snake'))

    let isNewBest = false
    act(() => {
      isNewBest = result.current.record(12)
    })

    expect(isNewBest).toBe(true)
    expect(result.current.best).toBe(12)
    // A later visit reads the stored value.
    expect(renderHook(() => useHighScore('snake')).result.current.best).toBe(12)
  })

  it('ignores scores that do not beat the best', () => {
    const { result } = renderHook(() => useHighScore('snake'))
    act(() => void result.current.record(12))

    let isNewBest = true
    act(() => {
      isNewBest = result.current.record(12)
    })

    expect(isNewBest).toBe(false)
    expect(result.current.best).toBe(12)
  })

  it('keeps a separate best per game', () => {
    const snake = renderHook(() => useHighScore('snake'))
    act(() => void snake.result.current.record(30))

    expect(renderHook(() => useHighScore('tetris')).result.current.best).toBe(0)
  })

  it('still works when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useHighScore('snake'))

    act(() => void result.current.record(5))

    expect(result.current.best).toBe(5)
  })
})
