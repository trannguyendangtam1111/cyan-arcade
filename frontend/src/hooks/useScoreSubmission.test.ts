import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook as renderHookBare, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import { finishGameSession, startGameSession, type GameSessionResponse, type ScoreResponse } from '@/api/gameSessions'
import { useScoreSubmission } from './useScoreSubmission'

vi.mock('@/api/gameSessions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/gameSessions')>()),
  startGameSession: vi.fn(),
  finishGameSession: vi.fn(),
}))

const start = vi.mocked(startGameSession)
const finish = vi.mocked(finishGameSession)

const session: GameSessionResponse = { id: 'session-1', gameSlug: 'snake', startedAt: '2026-09-30T10:00:00Z' }
const recorded: ScoreResponse = {
  sessionId: 'session-1',
  gameSlug: 'snake',
  score: 12,
  durationMs: 5000,
  recordedAt: '2026-09-30T10:00:05Z',
  rewards: null,
}
const result = { score: 12, durationMs: 5000 }

let queryClient: QueryClient

/** Renders a hook inside the query client the score flow reports to. */
function renderHook<T>(hook: () => T) {
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
  return renderHookBare(hook, { wrapper })
}

describe('useScoreSubmission', () => {
  beforeEach(() => {
    queryClient = new QueryClient()
    start.mockResolvedValue(session)
    finish.mockResolvedValue(recorded)
  })

  it('finishes the session that was opened for the run', async () => {
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))

    await waitFor(() => expect(hook.current.submission).toEqual({ status: 'saved', score: 12, rewards: null }))
    expect(start).toHaveBeenCalledWith('snake')
    expect(finish).toHaveBeenCalledWith('session-1', 12, {})
  })

  it('marks the game\'s leaderboard as out of date once the score is saved', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart())
    expect(invalidate).not.toHaveBeenCalled()
    act(() => hook.current.onGameOver(result))

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['leaderboards', 'snake'] }))
  })

  it('waits for the session when the run ends before the server has answered', async () => {
    let resolveSession!: (value: GameSessionResponse) => void
    start.mockReturnValue(new Promise((resolve) => (resolveSession = resolve)))
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))
    expect(hook.current.submission).toEqual({ status: 'saving', score: 12 })
    expect(finish).not.toHaveBeenCalled()

    await act(async () => resolveSession(session))

    await waitFor(() => expect(hook.current.submission.status).toBe('saved'))
    expect(finish).toHaveBeenCalledWith('session-1', 12, {})
  })

  it('reports a failure without retry when the session could not be opened', async () => {
    start.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'))
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))

    await waitFor(() => expect(hook.current.submission).toEqual({ status: 'failed', score: 12, canRetry: false }))
    expect(finish).not.toHaveBeenCalled()
  })

  it('can retry after the server was unreachable, reusing the same session', async () => {
    finish.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))
    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))
    await waitFor(() => expect(hook.current.submission).toEqual({ status: 'failed', score: 12, canRetry: true }))

    act(() => hook.current.retry())

    await waitFor(() => expect(hook.current.submission.status).toBe('saved'))
    expect(start).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalledTimes(2)
  })

  it('treats "already finished" as saved: an earlier attempt reached the server', async () => {
    finish.mockRejectedValue(new ApiError(409, 'SESSION_ALREADY_FINISHED', 'already finished'))
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))

    await waitFor(() => expect(hook.current.submission).toEqual({ status: 'saved', score: 12, rewards: null }))
  })

  it('passes the numbers a game reports about its run, and nothing else', async () => {
    const { result: hook } = renderHook(() => useScoreSubmission('tetris'))

    act(() => hook.current.onGameStart())
    act(() =>
      hook.current.onGameOver({
        score: 900,
        durationMs: 5000,
        metadata: { lines: 12, level: 2, note: 'not a number', ratio: 0.5, negative: -1 },
      }),
    )

    await waitFor(() => expect(finish).toHaveBeenCalledWith('session-1', 900, { lines: 12, level: 2 }))
  })

  it('keeps what the run earned and refreshes the player\'s own data', async () => {
    const rewards = {
      xpEarned: 85,
      coinsEarned: 20,
      personalBest: true,
      achievements: [],
      bonuses: [],
      totalXp: 85,
      level: 1,
      leveledUp: false,
      coinBalance: 20,
    }
    finish.mockResolvedValue({ ...recorded, rewards })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))

    await waitFor(() => expect(hook.current.submission).toEqual({ status: 'saved', score: 12, rewards }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users', 'me'] })
  })

  it('ignores the answer for an old run once a new run has started', async () => {
    let resolveFinish!: (value: ScoreResponse) => void
    finish.mockReturnValue(new Promise((resolve) => (resolveFinish = resolve)))
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))
    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))
    await waitFor(() => expect(finish).toHaveBeenCalled())

    act(() => hook.current.onGameStart())
    await act(async () => resolveFinish(recorded))

    expect(hook.current.submission).toEqual({ status: 'idle' })
  })
})
