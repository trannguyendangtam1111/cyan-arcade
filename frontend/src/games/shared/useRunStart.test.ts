import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useRunStart } from './useRunStart'

describe('useRunStart and game modes', () => {
  it('reports a run begun without a mode with no mode, which the platform takes as Classic', () => {
    const onGameStart = vi.fn()
    const { result } = renderHook(() => useRunStart(onGameStart))

    act(() => void result.current.begin())

    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameStart).toHaveBeenCalledWith()
  })

  it('passes the mode a run begins in on to the platform', () => {
    const onGameStart = vi.fn()
    const { result } = renderHook(() => useRunStart(onGameStart))

    act(() => void result.current.begin('sprint'))

    expect(onGameStart).toHaveBeenCalledWith('sprint')
  })

  it('keeps the mode a run began with: a later begin in another mode changes nothing', () => {
    const onGameStart = vi.fn()
    const { result } = renderHook(() => useRunStart(onGameStart))

    let results: boolean[] = []
    act(() => {
      results = [result.current.begin('sprint'), result.current.begin('classic'), result.current.begin()]
    })

    expect(results).toEqual([true, false, false])
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(onGameStart).toHaveBeenCalledWith('sprint')
  })

  it('ignores an event passed by a game that uses begin as a click handler', () => {
    const onGameStart = vi.fn()
    const { result } = renderHook(() => useRunStart(onGameStart))

    act(() => void result.current.begin({ type: 'click' }))

    expect(onGameStart).toHaveBeenCalledWith()
  })

  it('lets the next run choose again once reset', () => {
    const onGameStart = vi.fn()
    const { result } = renderHook(() => useRunStart(onGameStart))

    act(() => void result.current.begin('sprint'))
    act(() => result.current.reset())
    act(() => void result.current.begin('classic'))

    expect(onGameStart.mock.calls).toEqual([['sprint'], ['classic']])
  })
})
