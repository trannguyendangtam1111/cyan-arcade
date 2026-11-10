import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook as renderHookBare, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(start).toHaveBeenCalledWith('snake', 'classic')
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

    await waitFor(() =>
      expect(hook.current.submission).toEqual({ status: 'failed', score: 12, canRetry: false, reason: 'error' }),
    )
    expect(finish).not.toHaveBeenCalled()
  })

  it('can retry after the server was unreachable, reusing the same session', async () => {
    finish.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))
    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))
    await waitFor(() =>
      expect(hook.current.submission).toEqual({ status: 'failed', score: 12, canRetry: true, reason: 'error' }),
    )

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

    await waitFor(() =>
      expect(hook.current.submission).toEqual({ status: 'saved', score: 12, rewards: null, alreadySaved: true }),
    )
  })

  it('does not count a retry that finds the score saved as a second reward', async () => {
    // The first answer was lost on the way back; the retry finds the run finished.
    finish
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
      .mockRejectedValueOnce(new ApiError(409, 'SESSION_ALREADY_FINISHED', 'already finished'))
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))
    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))
    await waitFor(() => expect(hook.current.submission.status).toBe('failed'))

    act(() => hook.current.retry())

    await waitFor(() =>
      expect(hook.current.submission).toEqual({ status: 'saved', score: 12, rewards: null, alreadySaved: true }),
    )
    expect(finish).toHaveBeenCalledTimes(2)
  })

  it('reports a rejected score without offering to send it again', async () => {
    finish.mockRejectedValue(new ApiError(400, 'SCORE_REJECTED', 'Score submission rejected.'))
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))

    await waitFor(() =>
      expect(hook.current.submission).toEqual({ status: 'failed', score: 12, canRetry: false, reason: 'rejected' }),
    )
  })

  it('reports a run left open too long', async () => {
    finish.mockRejectedValue(new ApiError(410, 'SESSION_EXPIRED', 'This game session has expired'))
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))

    await waitFor(() =>
      expect(hook.current.submission).toEqual({ status: 'failed', score: 12, canRetry: false, reason: 'expired' }),
    )
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

describe('useScoreSubmission with game modes', () => {
  beforeEach(() => {
    queryClient = new QueryClient()
    finish.mockResolvedValue(recorded)
  })

  it('starts a run in Classic when no mode is chosen', async () => {
    start.mockResolvedValue({ ...session, mode: 'classic' })
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))

    await waitFor(() => expect(hook.current.submission.status).toBe('saved'))
    expect(start).toHaveBeenCalledWith('snake', 'classic')
  })

  it('treats anything but a mode ID, such as a click event, as Classic', async () => {
    start.mockResolvedValue({ ...session, mode: 'classic' })
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart({ type: 'click' }))
    act(() => hook.current.onGameOver(result))

    await waitFor(() => expect(hook.current.submission.status).toBe('saved'))
    expect(start).toHaveBeenCalledWith('snake', 'classic')
  })

  it('sends the chosen mode and finishes a run the server opened in it', async () => {
    start.mockResolvedValue({ ...session, mode: 'sprint' })
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart('sprint'))
    act(() => hook.current.onGameOver(result))

    await waitFor(() => expect(hook.current.submission).toEqual({ status: 'saved', score: 12, rewards: null }))
    expect(start).toHaveBeenCalledWith('snake', 'sprint')
    expect(finish).toHaveBeenCalledWith('session-1', 12, {})
  })

  it('submits nothing when the server opened the run in another mode', async () => {
    start.mockResolvedValue({ ...session, mode: 'classic' })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart('sprint'))
    act(() => hook.current.onGameOver(result))

    await waitFor(() =>
      expect(hook.current.submission).toEqual({ status: 'failed', score: 12, canRetry: false, reason: 'mode-mismatch' }),
    )
    expect(finish).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()

    // Nothing to retry either: the run is not the chosen mode's.
    act(() => hook.current.retry())
    await waitFor(() => expect(hook.current.submission).toMatchObject({ status: 'failed', reason: 'mode-mismatch' }))
    expect(finish).not.toHaveBeenCalled()
  })

  it('takes a session without a mode, from a backend before modes, as Classic', async () => {
    start.mockResolvedValue(session) // no `mode`
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))
    await waitFor(() => expect(hook.current.submission.status).toBe('saved'))
    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('does not submit a non-Classic run to a backend that does not know modes', async () => {
    start.mockResolvedValue(session) // the older backend ignored `mode` and opened a Classic run
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart('sprint'))
    act(() => hook.current.onGameOver(result))

    await waitFor(() => expect(hook.current.submission).toMatchObject({ status: 'failed', reason: 'mode-mismatch' }))
    expect(finish).not.toHaveBeenCalled()
  })

  it('keeps the mode of each run: a new run in another mode is judged by its own', async () => {
    start.mockResolvedValueOnce({ ...session, mode: 'sprint' }).mockResolvedValueOnce({ ...session, id: 'session-2', mode: 'classic' })
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))

    act(() => hook.current.onGameStart('sprint'))
    act(() => hook.current.onGameOver(result))
    await waitFor(() => expect(hook.current.submission.status).toBe('saved'))

    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))
    await waitFor(() => expect(finish).toHaveBeenCalledWith('session-2', 12, {}))
    expect(hook.current.submission.status).toBe('saved')
  })

})

describe('finishing a run of a mode other than Classic', () => {
  const offline = () => new ApiError(0, 'NETWORK_ERROR', 'offline')
  const flush = (ms = 0) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

  beforeEach(() => {
    queryClient = new QueryClient()
    finish.mockResolvedValue(recorded)
    vi.useFakeTimers()
    start.mockResolvedValue({ ...session, mode: 'time-attack' })
  })
  afterEach(() => vi.useRealTimers())

  function playTimeAttack() {
    const rendered = renderHook(() => useScoreSubmission('2048'))
    act(() => rendered.result.current.onGameStart('time-attack'))
    act(() => rendered.result.current.onGameOver(result))
    return rendered.result
  }

  it('tries again on its own, at once, while its time still fits, and saves the run', async () => {
    finish.mockRejectedValueOnce(offline()).mockRejectedValueOnce(new ApiError(503, 'HTTP_503', 'unavailable'))
    const hook = playTimeAttack()

    await flush()
    expect(finish).toHaveBeenCalledTimes(1)
    expect(hook.current.submission.status).toBe('saving')
    await flush(1000)
    expect(finish).toHaveBeenCalledTimes(2)
    await flush(3000)

    expect(finish).toHaveBeenCalledTimes(3)
    expect(hook.current.submission).toEqual({ status: 'saved', score: 12, rewards: null })
    // The same session every time: one run, one session, finished once.
    expect(start).toHaveBeenCalledTimes(1)
    expect(new Set(finish.mock.calls.map(([id]) => id))).toEqual(new Set(['session-1']))
  })

  it('counts an attempt that had reached the server as saved, not as a second run', async () => {
    finish.mockRejectedValueOnce(offline()).mockRejectedValueOnce(new ApiError(409, 'SESSION_ALREADY_FINISHED', 'done'))
    const hook = playTimeAttack()
    await flush(1000)

    expect(hook.current.submission).toEqual({ status: 'saved', score: 12, rewards: null, alreadySaved: true })
  })

  it('gives up after a few seconds, still offering to retry', async () => {
    finish.mockRejectedValue(offline())
    const hook = playTimeAttack()
    await flush(10_000)

    expect(finish).toHaveBeenCalledTimes(3)
    expect(hook.current.submission).toEqual({ status: 'failed', score: 12, canRetry: true, reason: 'error' })
  })

  it('never sends again a run the server refused', async () => {
    finish.mockRejectedValue(new ApiError(400, 'SCORE_REJECTED', 'rejected'))
    const hook = playTimeAttack()
    await flush(10_000)

    expect(finish).toHaveBeenCalledTimes(1)
    expect(hook.current.submission).toEqual({ status: 'failed', score: 12, canRetry: false, reason: 'rejected' })
  })

  it('stops trying for a run once a new one has started', async () => {
    finish.mockRejectedValueOnce(offline())
    const { result: hook } = renderHook(() => useScoreSubmission('2048'))
    act(() => hook.current.onGameStart('time-attack'))
    act(() => hook.current.onGameOver(result))
    await flush()
    act(() => hook.current.onGameStart('time-attack'))
    await flush(10_000)

    expect(finish).toHaveBeenCalledTimes(1)
  })

  it('leaves Classic as it was: one attempt, then the manual retry', async () => {
    start.mockResolvedValue(session)
    finish.mockRejectedValueOnce(offline())
    const { result: hook } = renderHook(() => useScoreSubmission('snake'))
    act(() => hook.current.onGameStart())
    act(() => hook.current.onGameOver(result))
    await flush(10_000)

    expect(finish).toHaveBeenCalledTimes(1)
    expect(hook.current.submission).toEqual({ status: 'failed', score: 12, canRetry: true, reason: 'error' })
  })
})

describe('telling a game its run was recorded (onSaved)', () => {
  beforeEach(() => {
    queryClient = new QueryClient()
    start.mockResolvedValue({ ...session, mode: 'puzzle-1' })
    finish.mockResolvedValue(recorded)
  })

  /** Plays one Puzzle run that reports `onSaved`, and gives the hook and the callback. */
  function playStage() {
    const onSaved = vi.fn()
    const rendered = renderHook(() => useScoreSubmission('2048'))
    act(() => rendered.result.current.onGameStart('puzzle-1'))
    act(() => rendered.result.current.onGameOver({ ...result, onSaved }))
    return { hook: rendered.result, onSaved }
  }

  it('calls it once the server has recorded the run, and sends it nowhere', async () => {
    const { hook, onSaved } = playStage()

    await waitFor(() => expect(hook.current.submission.status).toBe('saved'))
    expect(onSaved).toHaveBeenCalledTimes(1)
    // One session, finished once; the callback is not a detail of the run.
    expect(start).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalledTimes(1)
    expect(finish).toHaveBeenCalledWith('session-1', 12, {})
  })

  it('never calls it for a run the server refused', async () => {
    finish.mockRejectedValue(new ApiError(400, 'SCORE_REJECTED', 'rejected'))
    const { hook, onSaved } = playStage()

    await waitFor(() => expect(hook.current.submission).toMatchObject({ status: 'failed', reason: 'rejected' }))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('never calls it for a run that could not be saved, until a retry saves it', async () => {
    vi.useFakeTimers()
    try {
      finish.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'))
      const { hook, onSaved } = playStage()
      await act(async () => void (await vi.advanceTimersByTimeAsync(10_000)))

      expect(hook.current.submission).toMatchObject({ status: 'failed', canRetry: true, reason: 'error' })
      expect(onSaved).not.toHaveBeenCalled()

      finish.mockResolvedValue(recorded)
      act(() => hook.current.retry())
      await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
      expect(hook.current.submission.status).toBe('saved')
      expect(onSaved).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('never calls it when the session could not be opened', async () => {
    start.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'))
    const { hook, onSaved } = playStage()

    await waitFor(() => expect(hook.current.submission.status).toBe('failed'))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('never calls it for a run the server opened under another mode', async () => {
    start.mockResolvedValue({ ...session, mode: 'classic' })
    const { hook, onSaved } = playStage()

    await waitFor(() => expect(hook.current.submission).toMatchObject({ status: 'failed', reason: 'mode-mismatch' }))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('calls it for an attempt that had reached the server, once', async () => {
    // The first answer was lost on the way back; the retry finds the run finished, which the server
    // only does once it has accepted it.
    vi.useFakeTimers()
    try {
      finish
        .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline'))
        .mockRejectedValue(new ApiError(409, 'SESSION_ALREADY_FINISHED', 'done'))
      const { hook, onSaved } = playStage()
      await act(async () => void (await vi.advanceTimersByTimeAsync(1000)))

      expect(hook.current.submission).toEqual({ status: 'saved', score: 12, rewards: null, alreadySaved: true })
      expect(onSaved).toHaveBeenCalledTimes(1)

      // A further answer for the same run (here, sending it again) is not a second save.
      act(() => hook.current.retry())
      await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
      expect(onSaved).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores a late answer once a new run has started', async () => {
    let resolveFinish!: (value: ScoreResponse) => void
    finish.mockReturnValue(new Promise((resolve) => (resolveFinish = resolve)))
    const { hook, onSaved } = playStage()
    await waitFor(() => expect(finish).toHaveBeenCalled())

    act(() => hook.current.onGameStart('puzzle-1'))
    await act(async () => resolveFinish(recorded))

    expect(onSaved).not.toHaveBeenCalled()
  })

  it('keeps the save when the game itself fails in its callback', async () => {
    const onSaved = vi.fn(() => {
      throw new Error('storage full')
    })
    const rendered = renderHook(() => useScoreSubmission('2048'))
    act(() => rendered.result.current.onGameStart('puzzle-1'))
    act(() => rendered.result.current.onGameOver({ ...result, onSaved }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(rendered.result.current.submission).toEqual({ status: 'saved', score: 12, rewards: null })
  })
})
