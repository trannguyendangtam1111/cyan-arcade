import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useHumanRun } from './useHumanRun'

function setup() {
  const onGameStart = vi.fn()
  const onGameOver = vi.fn()
  const hook = renderHook(() => useHumanRun('snake', { onGameStart, onGameOver }))
  return { onGameStart, onGameOver, run: () => hook.result.current }
}

describe('useHumanRun', () => {
  beforeEach(() => window.localStorage.clear())

  it('reports the start of a run once, however often it is begun', () => {
    const { run, onGameStart } = setup()

    let results: boolean[] = []
    act(() => {
      results = [run().begin(), run().begin(), run().begin()]
    })

    expect(results).toEqual([true, false, false])
    expect(onGameStart).toHaveBeenCalledTimes(1)
    expect(run().started).toBe(true)
  })

  it('reports the result once and passes game-specific details through', () => {
    const { run, onGameOver } = setup()
    act(() => void run().begin())

    act(() => {
      run().finish(12, { level: 3 })
      run().finish(99)
    })

    expect(onGameOver).toHaveBeenCalledTimes(1)
    expect(onGameOver.mock.calls[0][0]).toMatchObject({ score: 12, metadata: { level: 3 } })
    expect(onGameOver.mock.calls[0][0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('tracks the best score and says when a run beats it', () => {
    const { run } = setup()

    act(() => void run().begin())
    act(() => run().finish(10))
    expect(run()).toMatchObject({ best: 10, newBest: true })

    act(() => run().reset())
    act(() => void run().begin())
    act(() => run().finish(4))
    expect(run()).toMatchObject({ best: 10, newBest: false })
  })

  it('is ready for a new run after a reset', () => {
    const { run, onGameStart, onGameOver } = setup()
    act(() => void run().begin())
    act(() => run().finish(10))

    act(() => run().reset())
    expect(run().started).toBe(false)

    act(() => void run().begin())
    act(() => run().finish(3))
    expect(onGameStart).toHaveBeenCalledTimes(2)
    expect(onGameOver).toHaveBeenCalledTimes(2)
  })
})
