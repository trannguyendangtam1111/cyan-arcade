import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chessServer, type ChessServerOptions } from '@/test/chessServer'
import { admin, mockApi, mockProblem, pixel, type MockHandler } from '@/test/mockApi'
import ChessGame from './ChessGame'
import { useChessGame, type ChessController } from './hooks/useChessGame'

/** The scripted server commits normally; only its client response is lost or delayed. */
function fixture(options: ChessServerOptions = { current: { moves: [] } }, asAdmin = false) {
  const server = chessServer(options)
  const requests: { method: string; path: string }[] = []
  const fault = {
    action: '',
    committed: true,
    response: 'network' as 'network' | 'json' | 'gateway',
    failReads: false,
    holdReads: false,
  }
  const held: (() => void)[] = []
  const handler: MockHandler = (request) => {
    if (!/^\/api\/(ai\/)?chess\//.test(request.path)) return undefined
    requests.push({ method: request.method, path: request.path })
    if (request.method === 'GET' && fault.failReads) return Promise.reject(new TypeError('Offline'))
    if (request.method === 'POST' && fault.action && request.path.endsWith(fault.action)) {
      fault.action = ''
      return (async () => {
        if (fault.committed) {
          const response = await server.handler(request)
          expect(response?.ok).toBe(true)
        }
        if (fault.response === 'json') return new Response('{', { status: 200, headers: { 'Content-Type': 'application/json' } })
        if (fault.response === 'gateway') return mockProblem(502, 'HTTP_502', 'Gateway response lost')
        throw new TypeError('Response lost at the client boundary')
      })()
    }
    const response = server.handler(request)
    if (response && request.method === 'GET' && fault.holdReads) {
      // Capture the response now, including when the request's AbortSignal is later cancelled.
      return new Promise<Response>((resolve) => held.push(() => void Promise.resolve(response).then(resolve)))
    }
    return response
  }
  mockApi({ user: asAdmin ? admin : pixel, handlers: [handler] })
  return { server, requests, fault, held, posts: () => requests.filter(r => r.method === 'POST') }
}

async function readyHook(f: ReturnType<typeof fixture>) {
  const hook = renderHook(() => useChessGame(vi.fn()))
  await waitFor(() => expect(hook.result.current.match?.id).toBe(f.server.match?.id))
  expect(hook.result.current.match).not.toBeNull()
  return hook
}

afterEach(() => window.localStorage.clear())

describe('Authoritative Chess recovery', () => {
  it('reports stale synchronization success only after the authoritative response arrives', async () => {
    const f = fixture(), { result } = await readyHook(f)
    f.server.moveElsewhere('e2e4')
    f.fault.holdReads = true
    act(() => result.current.drop('d2', 'd4'))
    await waitFor(() => expect(result.current.recovery).toBe('syncing'))
    expect(result.current.notice).toBeNull()
    expect(result.current.match?.revision).toBe(0)
    await act(async () => f.held.shift()!())
    await waitFor(() => expect(result.current.match?.revision).toBe(1))
    expect(result.current.notice?.text).toBe('The game changed elsewhere, so the board was brought up to date.')
    expect(result.current.match?.history[0].uci).toBe('e2e4')
    expect(f.posts()).toHaveLength(1)
  })

  it('keeps the old board locked after failed stale recovery and deduplicates Retry Sync clicks', async () => {
    const f = fixture(), { result } = await readyHook(f)
    f.server.moveElsewhere('e2e4')
    f.fault.failReads = true
    act(() => result.current.drop('d2', 'd4'))
    await waitFor(() => expect(result.current.recovery).toBe('failed'))
    expect(result.current.notice).toBeNull()
    expect(result.current.match?.revision).toBe(0)
    expect(result.current.playerTurn).toBe(false)
    await act(async () => {
      await result.current.newGame()
      await result.current.undo()
      result.current.drop('e2', 'e4')
    })
    expect(f.posts()).toHaveLength(1)
    f.fault.failReads = false
    f.fault.holdReads = true
    const reads = f.requests.filter(r => r.method === 'GET').length
    act(() => { void result.current.retrySync(); void result.current.retrySync(); void result.current.retrySync() })
    expect(f.requests.filter(r => r.method === 'GET')).toHaveLength(reads + 1)
    await act(async () => f.held.shift()!())
    await waitFor(() => expect(result.current.recovery).toBeNull())
    expect(result.current.match?.revision).toBe(1)
    expect(f.posts()).toHaveLength(1)
  })

  it('shows an accessible Retry Sync action without claiming the stale board was updated', async () => {
    const f = fixture()
    render(<MemoryRouter><ChessGame onGameStart={vi.fn()} onGameOver={vi.fn()} /></MemoryRouter>)
    const board = await screen.findByRole('grid', { name: /Chess board/ })
    f.server.moveElsewhere('e2e4')
    f.fault.failReads = true
    fireEvent.click(within(board).getByRole('gridcell', { name: /^d2,/ }))
    fireEvent.click(within(board).getByRole('gridcell', { name: /^d4,/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't sync the game. The board may be out of date.")
    expect(screen.queryByText(/board was brought up to date/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New game' })).toBeDisabled()
    f.fault.failReads = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry Sync' }))
    expect(await screen.findByText('The game changed elsewhere, so the board was brought up to date.')).toBeInTheDocument()
    // Sync feedback may wrap on a phone; it must not cover the board's clickable squares.
    expect(screen.getByTestId('board-frame')).not.toContainElement(screen.getByText('The game changed elsewhere, so the board was brought up to date.'))
    expect(within(board).getByRole('gridcell', { name: /^e4,/ })).toHaveAccessibleName('e4, white pawn, last move')
    expect(screen.queryByRole('button', { name: 'Retry Sync' })).not.toBeInTheDocument()
    expect(f.posts()).toHaveLength(1)
  })

  it('loads the authoritative finished outcome after a MATCH_OVER response and failed sync', async () => {
    const f = fixture(), { result } = await readyHook(f)
    f.server.match!.result = { winner: 'BLACK', termination: 'RESIGNATION', score: '0-1' }
    f.fault.failReads = true
    act(() => result.current.drop('e2', 'e4'))
    await waitFor(() => expect(result.current.recovery).toBe('failed'))
    expect(result.current.match?.result).toBeNull()
    expect(result.current.notice).toBeNull()
    f.fault.failReads = false
    await act(async () => { await result.current.retrySync() })
    expect(result.current.match?.result).toEqual(f.server.match!.result)
    expect(result.current.playing).toBe(false)
    expect(f.posts()).toHaveLength(1)
  })

  const actions: { name: string; suffix: string; moves?: string[]; prepare?: (f: ReturnType<typeof fixture>) => void; run: (game: ChessController) => unknown }[] = [
    { name: 'move', suffix: '/moves', run: game => game.drop('e2', 'e4') },
    { name: 'takeback', suffix: '/undo', moves: ['e2e4', 'd7d5'], run: game => game.undo() },
    { name: 'redo', suffix: '/redo', moves: ['e2e4'], prepare: f => { f.server.match!.undone = ['d7d5'] }, run: game => game.redo() },
    { name: 'restart', suffix: '/matches', moves: ['e2e4'], run: game => game.newGame() },
    { name: 'resignation', suffix: '/resign', run: game => game.resign('WHITE') },
    { name: 'draw offer', suffix: '/draw', run: game => game.draw('OFFER', 'WHITE') },
    { name: 'draw acceptance', suffix: '/draw', prepare: f => { f.server.match!.drawOffer = 'WHITE' }, run: game => game.draw('ACCEPT', 'BLACK') },
    { name: 'draw decline', suffix: '/draw', prepare: f => { f.server.match!.drawOffer = 'WHITE' }, run: game => game.draw('DECLINE', 'BLACK') },
    { name: 'draw claim', suffix: '/draw', run: game => game.draw('CLAIM', 'WHITE') },
  ]
  for (const action of actions) for (const committed of [true, false]) {
    it(`reconciles a lost ${action.name} response ${committed ? 'after' : 'before'} commit without replay`, async () => {
      const f = fixture({ current: { moves: action.moves ?? [] }, claimableDraw: 'THREEFOLD_REPETITION' })
      action.prepare?.(f)
      const { result } = await readyHook(f)
      const before = result.current.match!
      f.fault.action = action.suffix
      f.fault.committed = committed
      await act(async () => { await action.run(result.current) })
      await waitFor(() => expect(result.current.notice?.text).toContain('No action was repeated'))
      expect(result.current.recovery).toBeNull()
      expect(f.posts()).toHaveLength(1)
      const saved = f.server.match!
      expect(result.current.match?.id).toBe(saved.id)
      expect(result.current.match?.revision).toBe(saved.revision)
      expect(result.current.match?.history.map(m => m.uci)).toEqual(saved.moves)
      expect(result.current.match?.result).toEqual(saved.result)
      expect(result.current.match?.drawOffer).toEqual(saved.result ? null : saved.drawOffer)
      if (action.name === 'restart' && committed) expect(saved.id).not.toBe(before.id)
      else expect(saved.revision).toBe(before.revision + (committed ? 1 : 0))
      if (!committed) {
        // A second POST is possible only after reconciliation and a new, explicit player action.
        await act(async () => { await action.run(result.current) })
        await waitFor(() => expect(f.posts()).toHaveLength(2))
      }
    })
  }

  it.each(['json', 'gateway'] as const)('reconciles a committed action after an uncertain %s response', async response => {
    const f = fixture(), { result } = await readyHook(f)
    Object.assign(f.fault, { action: '/moves', response })
    act(() => result.current.drop('e2', 'e4'))
    await waitFor(() => expect(result.current.match?.revision).toBe(1))
    expect(result.current.notice?.text).toContain('No action was repeated')
    expect(f.posts()).toHaveLength(1)
  })

  it('locks uncertain actions across repeated failed syncs, then recovers the committed move', async () => {
    const f = fixture(), { result } = await readyHook(f)
    Object.assign(f.fault, { action: '/moves', failReads: true })
    act(() => result.current.drop('e2', 'e4'))
    await waitFor(() => expect(result.current.recovery).toBe('failed'))
    await act(async () => { await result.current.retrySync() })
    expect(result.current.recovery).toBe('failed')
    expect(result.current.match?.revision).toBe(0)
    expect(f.server.match?.moves).toEqual(['e2e4'])
    f.fault.failReads = false
    await act(async () => { await result.current.retrySync() })
    expect(result.current.match?.revision).toBe(1)
    expect(f.posts()).toHaveLength(1)
  })

  it.each([true, false])('recovers uncertain initial creation (committed=%s) using reads alone', async committed => {
    const f = fixture({ current: null })
    Object.assign(f.fault, { action: '/matches', committed })
    const { result } = renderHook(() => useChessGame(vi.fn()))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.recovery).toBeNull()
    expect(f.posts()).toHaveLength(1)
    expect(result.current.match?.id ?? null).toBe(f.server.match?.id ?? null)
    if (!committed) {
      expect(result.current.match).toBeNull()
      expect(result.current.notice?.text).toContain('No saved game was found')
      await act(async () => { await result.current.newGame() })
      expect(f.posts()).toHaveLength(2)
    }
  })

  it.each([true, false])('recovers uncertain AI game creation (committed=%s) without creating another match', async committed => {
    const f = fixture({ current: { moves: [] } }, true), { result } = await readyHook(f)
    Object.assign(f.fault, { action: '/matches', committed })
    await act(async () => { await result.current.playEngine('WHITE', 'BEGINNER') })
    expect(result.current.notice?.text).toContain('No action was repeated')
    expect(result.current.match?.id).toBe(f.server.match?.id)
    expect(result.current.match?.mode).toBe(committed ? 'AI' : 'LOCAL')
    expect(f.posts()).toHaveLength(1)
  })

  it('does not create a second match when initial creation and its recovery read both lose their response', async () => {
    const f = fixture({ current: null })
    f.fault.action = '/matches'
    const original = f.server.handler
    // The bootstrap read succeeds; all reads after the creation commits fail temporarily.
    f.server.handler = request => {
      const response = original(request)
      if (request.method === 'POST') f.fault.failReads = true
      return response
    }
    render(<MemoryRouter><ChessGame onGameStart={vi.fn()} onGameOver={vi.fn()} /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't sync the game")
    expect(screen.queryByRole('grid', { name: /Chess board/ })).not.toBeInTheDocument()
    expect(f.posts()).toHaveLength(1)
    f.fault.failReads = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry Sync' }))
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(f.posts()).toHaveLength(1)
  })

  it('offers an explicit New game action when an uncertain initial creation was not committed', async () => {
    const f = fixture({ current: null })
    Object.assign(f.fault, { action: '/matches', committed: false })
    render(<MemoryRouter><ChessGame onGameStart={vi.fn()} onGameOver={vi.fn()} /></MemoryRouter>)
    expect(await screen.findByText(/No saved game was found. No action was repeated/)).toBeInTheDocument()
    expect(f.posts()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'New game' }))
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(f.posts()).toHaveLength(2)
  })

  it('blocks duplicate actions while a committed POST response is still in flight', async () => {
    const f = fixture(), { result } = await readyHook(f)
    const original = f.server.handler
    let release!: () => void
    f.server.handler = request => {
      const response = original(request)
      return request.method === 'POST' && response
        ? new Promise<Response>(resolve => { release = () => void Promise.resolve(response).then(resolve) })
        : response
    }
    act(() => result.current.drop('e2', 'e4'))
    await waitFor(() => expect(f.server.match?.moves).toEqual(['e2e4']))
    await act(async () => {
      result.current.drop('e2', 'e4')
      await result.current.undo()
      await result.current.newGame()
      await result.current.resign('WHITE')
    })
    expect(f.posts()).toHaveLength(1)
    await act(async () => release())
    expect(result.current.match?.history).toHaveLength(1)
  })

  it('never applies an action response after the hook is unmounted', async () => {
    const f = fixture(), hook = await readyHook(f)
    let release!: () => void
    const original = f.server.handler
    f.server.handler = request => {
      const response = original(request)
      return request.method === 'POST' && response
        ? new Promise<Response>(resolve => { release = () => void Promise.resolve(response).then(resolve) })
        : response
    }
    act(() => hook.result.current.drop('e2', 'e4'))
    await waitFor(() => expect(f.server.match?.moves).toEqual(['e2e4']))
    const before = hook.result.current.match
    hook.unmount()
    await act(async () => release())
    expect(hook.result.current.match).toBe(before)
    expect(f.posts()).toHaveLength(1)
  })

  it('ignores older reload responses that arrive after a newer read', async () => {
    const f = fixture(), { result } = await readyHook(f)
    f.fault.holdReads = true
    act(() => { void result.current.reload() })
    f.server.moveElsewhere('e2e4')
    act(() => { void result.current.reload() })
    await act(async () => f.held.pop()!())
    expect(result.current.match?.revision).toBe(1)
    await act(async () => f.held.shift()!())
    expect(result.current.match?.revision).toBe(1)
  })

  it.each(['move', 'restart'] as const)('ignores a delayed read after a newer %s action', async action => {
    const f = fixture(), { result } = await readyHook(f)
    f.fault.holdReads = true
    act(() => { void result.current.reload() })
    await act(async () => { if (action === 'move') result.current.drop('e2', 'e4'); else await result.current.newGame() })
    await waitFor(() => expect(action === 'move' ? result.current.match?.revision : result.current.match?.id).toBe(action === 'move' ? 1 : 'match-2'))
    await act(async () => f.held.shift()!())
    expect(result.current.match?.id).toBe(f.server.match?.id)
    expect(result.current.match?.revision).toBe(f.server.match?.revision)
    expect(result.current.loading).toBe(false)
  })

  it('does not create a game from an initial read that finishes after unmount', async () => {
    const f = fixture({ current: null })
    f.fault.holdReads = true
    const hook = renderHook(() => useChessGame(vi.fn()))
    await waitFor(() => expect(f.held).toHaveLength(1))
    hook.unmount()
    await act(async () => f.held.shift()!())
    expect(f.posts()).toHaveLength(0)
  })

  it.each([true, false])('does not blindly repeat Stockfish after a lost response (committed=%s)', async committed => {
    const f = fixture({ current: { moves: [], engine: { side: 'WHITE', difficulty: 'CLUB' } } }, true)
    Object.assign(f.fault, { action: '/engine-move', committed })
    const { result } = await readyHook(f)
    await waitFor(() => expect(result.current.notice?.text).toContain('No action was repeated'))
    expect(f.posts()).toHaveLength(1)
    if (committed) {
      expect(result.current.match?.history).toHaveLength(1)
      expect(result.current.playerTurn).toBe(true)
      expect(result.current.engineFailed).toBe(false)
    } else {
      expect(result.current.engineFailed).toBe(true)
      expect(result.current.match?.history).toHaveLength(0)
    }
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)) })
    expect(f.posts()).toHaveLength(1)
    if (!committed) {
      await act(async () => { await result.current.retryEngine() })
      await waitFor(() => expect(result.current.match?.history).toHaveLength(1))
      expect(f.posts()).toHaveLength(2)
    }
  })
})
