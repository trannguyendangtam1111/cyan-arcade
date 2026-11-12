import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chessServer } from '@/test/chessServer'
import { mockApi, mockJson, mockProblem, pixel, type MockHandler } from '@/test/mockApi'
import ChessGame from './ChessGame'
import { MatchArchive } from './components/MatchArchive'
import type { ArchivedMatch, MatchView } from './types/chessTypes'

const row = (extra: Partial<ArchivedMatch> = {}): ArchivedMatch => ({
  id: 'saved-1', mode: 'LOCAL', status: 'FINISHED', playerColor: null, difficulty: null,
  result: '1-0', plyCount: 1, createdAt: '2026-11-09T12:00:00Z', updatedAt: '2026-11-09T12:10:00Z', finishedAt: '2026-11-09T12:10:00Z', ...extra,
})

async function fixture(moves = ['e2e4']): Promise<MatchView> {
  const server = chessServer({ current: { moves } })
  const response = await server.handler({ path: '/api/chess/matches/current', method: 'GET', body: undefined, user: pixel, url: new URL('http://localhost/api/chess/matches/current') })
  return { ...await response!.json(), id: 'saved-1' }
}

function setup(handler: MockHandler) {
  const fetchSpy = mockApi({ user: pixel, handlers: [handler] })
  const back = vi.fn()
  const view = render(<MatchArchive onBack={back} />)
  return { fetchSpy, back, ...view }
}

const page = (rows: ArchivedMatch[], n = 0, hasNext = false) => mockJson({ content: rows, page: n, size: 10, hasNext })
const board = () => screen.getByRole('grid', { name: /Chess board/ })
const square = (name: string) => within(board()).getByRole('gridcell', { name: new RegExp(`^${name},`) })

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Chess match archive', () => {
  it('shows loading and an empty retained archive without game creation', async () => {
    let release!: (response: Response) => void
    const { fetchSpy } = setup(() => new Promise(resolve => { release = resolve }))
    expect(screen.getByText('Loading match archive…')).toBeInTheDocument()
    await act(async () => release(page([])))
    expect(await screen.findByText(/No retained matches/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(fetchSpy.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  })

  it('paginates metadata, including legacy colours/difficulty and explicit half-move counts', async () => {
    setup(({ url }) => Number(url.searchParams.get('page')) === 1
      ? page([row({ mode: 'AI', playerColor: null, difficulty: null, status: 'ABANDONED', result: '*', updatedAt: null, createdAt: null })], 1)
      : page([row(), row({ id: 'saved-2', mode: 'AI', playerColor: 'BLACK', difficulty: 'CLUB', status: 'ACTIVE', result: '*' }), row({ id: 'saved-3', mode: 'ANALYSIS', result: '1/2-1/2' })], 0, true))
    expect(await screen.findByText('Local multiplayer')).toBeInTheDocument()
    expect(screen.getAllByText('Both colours · 1 half-move')).toHaveLength(2)
    expect(screen.getByText('Stockfish · Club')).toBeInTheDocument()
    expect(screen.getByText('Black · 1 half-move')).toBeInTheDocument()
    expect(screen.getByText('1-0 · White won')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('Variation')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(await screen.findByText('Stockfish · Difficulty not recorded')).toBeInTheDocument()
    expect(screen.getByText('Colour not recorded · 1 half-move')).toBeInTheDocument()
    expect(screen.getByText(/Date unavailable/)).toBeInTheDocument()
    expect(screen.getByText('Abandoned')).toBeInTheDocument()
    expect(screen.getByText('Page 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(await screen.findByText('Local multiplayer')).toBeInTheDocument()
  })

  it('retries list failures without retaining another page of results', async () => {
    let failures = 1
    setup(() => failures-- > 0 ? mockProblem(401, 'UNAUTHORIZED', 'Sign in') : page([row()]))
    expect(await screen.findByText("Couldn't load your archive")).toBeInTheDocument()
    expect(screen.queryByText('Local multiplayer')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }))
    expect(await screen.findByText('Local multiplayer')).toBeInTheDocument()
  })

  it('opens an active Stockfish snapshot without triggering engine moves and reuses replay navigation', async () => {
    const saved = await fixture()
    saved.engine = { side: 'BLACK', difficulty: 'CLUB', label: 'Club', setting: 'Elo setting 1600' }
    saved.mode = 'AI'
    const { fetchSpy } = setup(({ path }) => path === '/api/chess/archive' ? page([row({ mode: 'AI' })]) : mockJson(saved))
    fireEvent.click(await screen.findByRole('button', { name: 'Open replay' }))
    expect(await screen.findByRole('grid', { name: /Chess board/ })).toBeInTheDocument()
    expect(screen.getByText(/Read-only replay/)).toBeInTheDocument()
    expect(screen.queryByText('Live')).not.toBeInTheDocument()
    expect(square('e4')).toHaveAccessibleName(/white pawn/)
    fireEvent.click(square('e4'))
    fireEvent.click(square('e5'))
    fireEvent.click(screen.getByRole('button', { name: 'First position' }))
    expect(square('e2')).toHaveAccessibleName(/white pawn/)
    expect(screen.getByRole('button', { name: 'Previous move' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next move' }))
    expect(square('e4')).toHaveAccessibleName(/white pawn/)
    fireEvent.click(screen.getByRole('button', { name: 'Previous move' }))
    fireEvent.click(screen.getByLabelText(/^White: e4/))
    expect(square('e4')).toHaveAccessibleName(/white pawn/)
    expect(fetchSpy.mock.calls.some(([input]) => String(input).includes('/api/ai/'))).toBe(false)
    expect(fetchSpy.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
  })

  it('handles missing detail and retries, with navigation back to the archive', async () => {
    const saved = await fixture()
    let fail = true
    setup(({ path }) => path === '/api/chess/archive' ? page([row()]) : fail ? mockProblem(404, 'NOT_FOUND', 'Gone') : mockJson(saved))
    fireEvent.click(await screen.findByRole('button', { name: 'Open replay' }))
    expect(await screen.findByText("Couldn't open this match")).toBeInTheDocument()
    fail = false
    fireEvent.click(screen.getByRole('button', { name: /Try again/i }))
    expect(await screen.findByRole('grid', { name: /Chess board/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to archive' }))
    expect(await screen.findByText('Local multiplayer')).toBeInTheDocument()
  })

  it('ignores an old detail response after a different match was opened', async () => {
    const first = await fixture(), second = { ...await fixture(['e2e4', 'd7d5']), id: 'saved-2' }
    let release!: (response: Response) => void
    setup(({ path }) => path === '/api/chess/archive' ? page([row(), row({ id: 'saved-2' })])
      : path.endsWith('saved-1') ? new Promise(resolve => { release = resolve }) : mockJson(second))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open replay' }))[0])
    await waitFor(() => expect(release).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Back to archive' }))
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open replay' }))[1])
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(square('d5')).toHaveAccessibleName(/black pawn/)
    await act(async () => release(mockJson(first)))
    expect(square('d5')).toHaveAccessibleName(/black pawn/)
  })

  it('downloads the original PGN attachment once while repeated clicks are pending', async () => {
    const saved = await fixture()
    const pgn = '[Result "*"]\n\n1. e4 *\n'
    let release!: (response: Response) => void
    const { fetchSpy } = setup(({ path }) => path === '/api/chess/archive' ? page([row()])
      : path.endsWith('/pgn') ? new Promise(resolve => { release = resolve }) : mockJson(saved))
    const objectUrl = vi.fn((_blob: Blob | MediaSource) => 'blob:pgn')
    class DownloadURL extends URL {
      static createObjectURL = objectUrl
      static revokeObjectURL = vi.fn()
    }
    vi.stubGlobal('URL', DownloadURL)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    fireEvent.click(await screen.findByRole('button', { name: 'Open replay' }))
    const download = await screen.findByRole('button', { name: 'Download PGN' })
    fireEvent.click(download)
    fireEvent.click(download)
    expect(screen.getByRole('button', { name: 'Exporting…' })).toBeDisabled()
    await act(async () => release(new Response(pgn, { headers: { 'Content-Type': 'application/x-chess-pgn' } })))
    expect(await screen.findByText('PGN download started.')).toBeInTheDocument()
    expect(objectUrl.mock.calls).toHaveLength(1)
    expect((objectUrl.mock.calls[0][0] as Blob).size).toBe(new Blob([pgn]).size)
    expect(click.mock.instances[0]).toHaveAttribute('download', 'chess-saved-1.pgn')
    expect(fetchSpy.mock.calls.filter(([input]) => String(input).endsWith('/pgn'))).toHaveLength(1)
  })

  it('reports export failure and allows an explicit retry', async () => {
    const saved = await fixture()
    let failures = 0
    setup(({ path }) => path === '/api/chess/archive' ? page([row()])
      : path.endsWith('/pgn') ? mockProblem(++failures === 1 ? 503 : 401, 'FAILED', 'Unavailable') : mockJson(saved))
    fireEvent.click(await screen.findByRole('button', { name: 'Open replay' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download PGN' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not export this match. Try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Download PGN' }))
    expect(await screen.findByText('Sign in again to export this match.')).toBeInTheDocument()
  })

  it('integrates account archive navigation and returns to the existing match without writes', async () => {
    const server = chessServer({ current: { moves: ['e2e4'] } })
    const fetchSpy = mockApi({ user: pixel, handlers: [({ path }) => path === '/api/chess/archive' ? page([]) : undefined, server.handler] })
    render(<MemoryRouter><ChessGame onGameStart={vi.fn()} onGameOver={vi.fn()} /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: 'Match archive' }))
    expect(await screen.findByText(/No retained matches/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back to game' }))
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(square('e4')).toHaveAccessibleName(/white pawn/)
    expect(fetchSpy.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
  })

  it('does not offer an account archive to guests', async () => {
    const server = chessServer({ current: { moves: [] } })
    mockApi({ user: null, handlers: [server.handler] })
    render(<MemoryRouter><ChessGame onGameStart={vi.fn()} onGameOver={vi.fn()} /></MemoryRouter>)
    await screen.findByRole('grid', { name: /Chess board/ })
    expect(screen.queryByRole('button', { name: 'Match archive' })).not.toBeInTheDocument()
  })
})
