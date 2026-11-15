import { useEffect, useRef, useState } from 'react'
import { ApiError } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import type { GameCosmetics } from '@/games/types'
import { fetchArchive, fetchArchivedMatch, fetchPgn } from '../api/chessApi'
import { kingSquare, parsePlacement, type Target } from '../engine/board'
import { useBoardView } from '../hooks/useBoardView'
import { useLook } from '../hooks/useLook'
import type { ArchivePage, ArchivedMatch, MatchView, Side } from '../types/chessTypes'
import { ChessBoard } from './ChessBoard'
import { MoveList, type MoveLabel } from './MoveList'
import { NavStrip } from './NavStrip'

const nothing = () => {}
const noTargets = new Map<string, Target>()
const noLabels = new Map<number, MoveLabel>()
const difficultyLabels = { BEGINNER: 'Beginner', CASUAL: 'Casual', CLUB: 'Club', ADVANCED: 'Advanced', MAXIMUM: 'Maximum' }

function opponent(row: ArchivedMatch) {
  if (row.mode === 'LOCAL') return 'Local multiplayer'
  if (row.mode === 'ANALYSIS') return 'Variation'
  return `Stockfish · ${row.difficulty ? difficultyLabels[row.difficulty] ?? 'Difficulty not recorded' : 'Difficulty not recorded'}`
}

function colour(row: ArchivedMatch) {
  if (row.mode !== 'AI') return 'Both colours'
  return row.playerColor === 'WHITE' ? 'White' : row.playerColor === 'BLACK' ? 'Black' : 'Colour not recorded'
}

function outcome(row: Pick<ArchivedMatch, 'status' | 'result'>) {
  if (row.status === 'ACTIVE') return 'In progress'
  if (row.status === 'ABANDONED') return 'Abandoned'
  return ({ '1-0': '1-0 · White won', '0-1': '0-1 · Black won', '1/2-1/2': '1/2-1/2 · Draw' })[row.result] ?? 'Finished · Result not recorded'
}

function DateLabel({ value }: { value: string | null }) {
  return value && Number.isFinite(Date.parse(value)) ? <time dateTime={value}>{new Date(value).toLocaleString()}</time> : <>Date unavailable</>
}

function ExportPgn({ id }: { id: string }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const download = async () => {
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setMessage(null)
    try {
      const pgn = await fetchPgn(id, controller.signal)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `chess-${id}.pgn`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      setFailed(false)
      setMessage('PGN download started.')
    } catch (error) {
      if (!controller.signal.aborted) {
        setFailed(true)
        setMessage(error instanceof ApiError ? error.message : 'Could not export this match. Try again.')
      }
    } finally {
      if (!controller.signal.aborted) {
        request.current = null
        setBusy(false)
      }
    }
  }
  return <div className="flex flex-col items-start gap-2">
    <Button size="sm" disabled={busy} onClick={() => void download()}>{busy ? 'Exporting…' : 'Download PGN'}</Button>
    {message && <p role={failed ? 'alert' : 'status'} className="text-sm">{message}</p>}
  </div>
}

/** A snapshot viewer: no gameplay hook, engine hooks or mutating API calls are mounted here. */
function Replay({ match, cosmetics }: { match: MatchView; cosmetics?: GameCosmetics }) {
  const nav = useBoardView(match)
  const look = useLook(cosmetics)
  const [orientation, setOrientation] = useState<Side>('WHITE')
  const [expanded, setExpanded] = useState(false)
  const view = nav.view!
  const placement = parsePlacement(view.fen)
  const side = view.fen.split(' ')[1] === 'b' ? 'BLACK' : 'WHITE'
  const move = match.history[view.ply - 1]
  return <div className="grid min-w-0 gap-4 lg:grid-cols-2">
    <div className="min-w-0" onKeyDown={nav.onKeyDown}>
      <ChessBoard placement={placement} orientation={orientation} selected={null} targets={noTargets}
        lastMove={view.lastMove} checkedKing={move && /[+#]$/.test(move.san) ? kingSquare(placement, side) : null}
        interactive={false} onSquare={nothing} onEscape={nothing} theme={look.board} pieces={look.pieces} />
      <NavStrip ply={view.ply} latest={match.history.length} live={view.live} inVariation={false}
        label={view.live ? 'Saved position' : `Position ${view.ply}`} latestTitle="Show the saved final position" newMoves={0}
        onFirst={() => nav.go(0)} onPrevious={() => nav.step(-1)} onNext={() => nav.step(1)} onLive={() => nav.go(match.history.length)}
        onFlip={() => setOrientation(value => value === 'WHITE' ? 'BLACK' : 'WHITE')}
        drawing={{ enabled: false, on: false, count: 0, toggle: nothing, clear: nothing }} />
    </div>
    <div className="flex min-w-0 flex-col gap-4">
      <p className="font-semibold">{outcome({ status: match.status, result: match.result?.score ?? '*' })}</p>
      <MoveList history={match.history} viewPly={view.ply} live={view.live} latestLabel="Saved position" onSelect={nav.go} labels={noLabels}
        showLabels={false} expanded={expanded} onToggle={() => setExpanded(value => !value)} onKeyDown={nav.onKeyDown} />
      <ExportPgn id={match.id} />
    </div>
  </div>
}

function ArchivedReplay({ id, cosmetics, onBack }: { id: string; cosmetics?: GameCosmetics; onBack: () => void }) {
  const [match, setMatch] = useState<MatchView | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void fetchArchivedMatch(id, controller.signal).then(value => {
      if (!controller.signal.aborted) setMatch(value)
    }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [id, attempt])
  return <section className="flex min-w-0 flex-col gap-4" aria-label="Archived match replay">
    <Button variant="secondary" className="self-start" onClick={onBack}>Back to archive</Button>
    <p>Read-only replay. Moves and results stay unchanged, including matches still in progress.</p>
    {failed ? <ErrorState title="Couldn't open this match" description="It may no longer be retained or available to your account." onRetry={() => { setFailed(false); setAttempt(value => value + 1) }} />
      : match ? <Replay match={match} cosmetics={cosmetics} /> : <LoadingState label="Loading saved match…" />}
  </section>
}

function ArchiveList({ page, onPage, onOpen }: { page: number; onPage: (page: number) => void; onOpen: (id: string) => void }) {
  const [data, setData] = useState<ArchivePage | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void fetchArchive(page, controller.signal).then(value => { if (!controller.signal.aborted) setData(value) })
      .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    return () => controller.abort()
  }, [page, attempt])
  return <section aria-label="Retained matches" className="flex flex-col gap-4">
    <p className="text-sm text-ink-soft">Your account's retained matches. Matches may be removed after 30 days without activity. Download PGN to keep a copy.</p>
    {failed ? <ErrorState title="Couldn't load your archive" description="Check your connection and sign-in, then try again." onRetry={() => { setFailed(false); setAttempt(value => value + 1) }} />
      : !data ? <LoadingState label="Loading match archive…" />
      : data.content.length === 0 ? <p role="status">No retained matches on this page. Play Chess while signed in to build your archive.</p>
      : <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
        {data.content.map(row => <li key={row.id} className="flex min-w-0 flex-col gap-2 rounded-card bg-surface p-4 shadow-card ring-1 ring-line">
          <h3 className="font-display text-lg">{opponent(row)}</h3>
          <p>{colour(row)} · {row.plyCount} {row.plyCount === 1 ? 'half-move' : 'half-moves'}</p>
          <p className="font-semibold">{outcome(row)}</p>
          <p className="text-sm text-ink-soft">Last played: <DateLabel value={row.updatedAt ?? row.createdAt} /></p>
          <Button variant="secondary" size="sm" className="mt-auto self-start" onClick={() => onOpen(row.id)}>Open replay</Button>
        </li>)}
      </ul>}
    <nav aria-label="Archive pages" className="flex flex-wrap items-center justify-between gap-3">
      <Button variant="secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous page</Button>
      <span aria-live="polite">Page {page + 1}</span>
      <Button variant="secondary" disabled={!data?.hasNext || page >= 1000} onClick={() => onPage(page + 1)}>Next page</Button>
    </nav>
  </section>
}

export function MatchArchive({ onBack, cosmetics }: { onBack: () => void; cosmetics?: GameCosmetics }) {
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  return <div className="chess-page mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4 p-3 sm:p-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-display text-2xl text-ink">Match archive</h2>
      <Button variant="secondary" onClick={onBack}>Back to game</Button>
    </header>
    {selected ? <ArchivedReplay key={selected} id={selected} cosmetics={cosmetics} onBack={() => setSelected(null)} />
      : <ArchiveList key={page} page={page} onPage={setPage} onOpen={setSelected} />}
  </div>
}
