import { ArrowUpDown, Bot, Flag, Handshake, LoaderCircle, Plus, Redo2, RotateCcw, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { GameShell, Key, type GameStat } from '@/games/shared/components/GameShell'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import type { ChessAi } from './ai/chessAi'
import { AnalysisPanel } from './components/AnalysisPanel'
import { ChessBoard } from './components/ChessBoard'
import { NewGameDialog, PromotionDialog, ResignDialog } from './components/Dialogs'
import { EngineGamePanel } from './components/EngineGamePanel'
import { HintButton, HintCard } from './components/HintPanel'
import { LookPicker } from './components/LookPicker'
import { MoveHistory } from './components/MoveHistory'
import { PlayerBar } from './components/PlayerBar'
import { ReviewPanel } from './components/ReviewPanel'
import { claimName, matchStatus, otherSide, parsePlacement, sideName } from './engine/board'
import { useEngineStatus, useEvaluation, useReview } from './hooks/useAnalysis'
import { useChessGame, type ChessController } from './hooks/useChessGame'
import { useLook } from './hooks/useLook'
import { useOrientation } from './hooks/useOrientation'
import type { Difficulty, MatchView, Side } from './types/chessTypes'
import './chess.css'

type Confirm = null | { kind: 'new' } | { kind: 'engine'; side: Side; difficulty: Difficulty } | { kind: 'resign' }

/**
 * Chess: two players on one device, or (admins) one player against Stockfish. The play lives in
 * `useChessGame`, which takes every answer from the server; this lays it out: whose turn it is, the
 * board between the two players' strips, hints, draw offers and claims, the moves so far and the
 * controls. Admins also get the engine panels (a game against Stockfish, analysis, game review),
 * which appear only when the platform hands this game its AI, after the server has said yes.
 */
export default function ChessGame(props: GameProps<ChessAi>) {
  const { ai: createAi } = props
  const ai = useMemo(() => createAi?.(), [createAi])
  const game = useChessGame(props.onGameStart)
  const look = useLook(props.cosmetics)
  const { orientation, flip, orient } = useOrientation()
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [reviewSide, setReviewSide] = useState<'before' | 'after'>('before')
  const engine = useEngineStatus(ai !== undefined)
  const evaluation = useEvaluation(game.match)
  const review = useReview(game.match)
  const match = game.match

  const inProgress = game.playing && match !== null && match.history.length > 0
  const requestNewGame = () => (inProgress ? setConfirm({ kind: 'new' }) : void game.newGame())
  const playEngine = (side: Side, difficulty: Difficulty) => {
    if (inProgress) {
      setConfirm({ kind: 'engine', side, difficulty })
      return
    }
    orient(side)
    void game.playEngine(side, difficulty)
  }
  const playerSide: Side | undefined = match?.engine ? otherSide(match.engine.side) : undefined

  const stats: GameStat[] = [
    { label: 'Turn', value: match && game.playing ? sideName(match.turn) : '—' },
    { label: 'Move', value: match ? match.fullmoveNumber : '—' },
  ]

  // A reviewed move takes over the board: the position before (with Stockfish's choice) or after it.
  const reviewed = review.review && review.selected !== null ? (review.review.moves[review.selected] ?? null) : null

  let board
  if (game.loading && !match) {
    board = <LoadingState label="Setting up the board…" className="min-h-80 w-full" />
  } else if (game.loadError || !match) {
    board = (
      <ErrorState
        title="Couldn't set up the board"
        description="The chess server could not be reached. Check your connection and try again."
        onRetry={() => void game.reload()}
      />
    )
  } else {
    const bottom = orientation
    const reviewBest = reviewed && reviewSide === 'before' && reviewed.best && reviewed.best.uci !== reviewed.uci ? reviewed.best : null
    board = (
      <div className="flex w-full max-w-[34rem] flex-col items-center gap-2">
        {reviewed ? (
          <div role="status" className="flex w-full flex-wrap items-center gap-2 rounded-control bg-brand-50 px-4 py-2.5">
            <p className="font-display font-semibold">
              Reviewing move {Math.ceil(reviewed.ply / 2)}
              {reviewed.color === 'WHITE' ? '.' : '…'} {reviewed.san} ({reviewSide === 'before' ? 'before' : 'after'} it)
            </p>
            <Button size="sm" variant="secondary" className="ml-auto" onClick={() => review.select(null)}>
              Back to the game
            </Button>
          </div>
        ) : (
          <StatusLine match={match} onNewGame={requestNewGame} busy={game.busy} thinking={game.engineThinking} />
        )}
        {game.notice && (
          <p
            key={game.notice.id}
            role={game.notice.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'w-full rounded-control px-3 py-2 text-sm font-semibold',
              game.notice.tone === 'error' ? 'bg-[#ffe4e6] text-[#9f1239]' : 'bg-brand-50 text-ink',
            )}
          >
            {game.notice.text}
          </p>
        )}
        {game.engineFailed && game.engineTurn && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded-control bg-[#fef3c7] px-3 py-2 text-sm">
            <span className="font-semibold">Stockfish could not move. The game is unchanged.</span>
            <Button size="sm" className="ml-auto" onClick={game.retryEngine} disabled={game.busy}>
              <RotateCcw aria-hidden className="size-4" />
              Retry Stockfish&apos;s move
            </Button>
          </div>
        )}
        {!reviewed && game.hint && <HintCard hint={game.hint} onDismiss={game.dismissHint} />}
        {!reviewed && <DrawPanel game={game} match={match} />}
        <PlayerBar side={otherSide(bottom)} match={match} pieces={look.pieces} />
        <ChessBoard
          placement={reviewed ? parsePlacement(reviewSide === 'before' ? reviewed.fenBefore : reviewed.fenAfter) : game.placement}
          orientation={orientation}
          selected={reviewed ? null : game.selected}
          targets={reviewed ? new Map() : game.targets}
          lastMove={reviewed ? { from: reviewed.from, to: reviewed.to } : match.lastMove}
          hint={reviewed ? reviewBest : game.hint ? { from: game.hint.move.from, to: game.hint.move.to } : null}
          checkedKing={reviewed ? null : match.checkedKing}
          interactive={!reviewed && game.playerTurn && !game.busy}
          onSquare={game.select}
          onEscape={game.deselect}
          theme={look.board}
          pieces={look.pieces}
        />
        <PlayerBar side={bottom} match={match} pieces={look.pieces} />
      </div>
    )
  }

  return (
    <>
      <GameShell
        board={board}
        stats={stats}
        onRestart={requestNewGame}
        humanHelp={
          <ul className="flex list-disc flex-col gap-1.5 pl-4">
            <li>Two players share this device and take turns, White first.</li>
            <li>Tap a piece, then one of its marked squares: dots are moves, rings are captures.</li>
            <li>
              With a keyboard, move around the board with the arrow keys and pick a square with <Key>Enter</Key>; <Key>Esc</Key> lets go of a piece.
            </li>
            <li>Signed-in players get three move hints a game from Stockfish, shown as dashed green squares.</li>
            <li>Every move is checked on the server by the full rules of chess. These games are for fun: they are not scored.</li>
          </ul>
        }
        sidebarExtra={
          match && (
            <>
              <Controls
                game={game}
                match={match}
                onFlip={flip}
                onResign={() => setConfirm({ kind: 'resign' })}
                loginPath={props.cosmetics?.loginPath ?? '/login?redirect=%2Fgames%2Fchess'}
              />
              {ai && (
                <>
                  <EngineGamePanel difficulties={engine.status?.difficulties ?? null} unavailable={engine.failed || engine.status?.available === false} busy={game.busy} onStart={playEngine} />
                  <AnalysisPanel
                    ai={ai}
                    status={engine.status}
                    result={evaluation.result}
                    loading={evaluation.loading}
                    error={evaluation.error}
                    onEvaluate={evaluation.evaluate}
                    onCancel={evaluation.cancel}
                  />
                  <ReviewPanel
                    ai={ai}
                    review={review.review}
                    error={review.error}
                    running={review.running}
                    finished={match.status === 'FINISHED'}
                    selected={review.selected}
                    side={reviewSide}
                    onStart={review.start}
                    onCancel={review.cancel}
                    onClose={review.close}
                    onSelect={review.select}
                    onSide={setReviewSide}
                  />
                </>
              )}
              <MoveHistory history={match.history} />
              <LookPicker cosmetics={props.cosmetics} look={look} />
            </>
          )
        }
      />
      <PromotionDialog side={game.promotion && match ? match.turn : null} pieces={look.pieces} onChoose={game.choosePromotion} />
      {match && (
        <ResignDialog
          open={confirm?.kind === 'resign'}
          turn={match.turn}
          only={playerSide}
          onClose={() => setConfirm(null)}
          onResign={(side) => {
            setConfirm(null)
            void game.resign(side)
          }}
        />
      )}
      <NewGameDialog
        open={confirm?.kind === 'new' || confirm?.kind === 'engine'}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const pending = confirm
          setConfirm(null)
          if (pending?.kind === 'engine') {
            orient(pending.side)
            void game.playEngine(pending.side, pending.difficulty)
          } else {
            void game.newGame()
          }
        }}
      />
    </>
  )
}

const TONES = {
  turn: 'bg-surface-muted text-ink',
  check: 'bg-[#ffe4e6] text-[#9f1239]',
  win: 'bg-[#fef3c7] text-ink',
  draw: 'bg-surface-muted text-ink',
  left: 'bg-surface-muted text-ink-soft',
}

/** Whose turn it is, check, or how the game ended, and a way to start again once it has. */
function StatusLine({ match, onNewGame, busy, thinking }: { match: MatchView; onNewGame: () => void; busy: boolean; thinking: boolean }) {
  const status = matchStatus(match)
  const over = match.result !== null || match.status !== 'ACTIVE'
  const engine = match.engine
  return (
    <div role="status" aria-live="polite" className={cn('flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-4 py-2.5', TONES[status.tone])}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-display text-lg leading-tight font-semibold">
          {thinking && <LoaderCircle aria-hidden className="size-4.5 animate-spin" />}
          {thinking ? 'Stockfish is thinking…' : status.title}
        </p>
        <p className="text-sm opacity-80">
          {engine && !over ? `You play ${sideName(otherSide(engine.side))} against Stockfish (${engine.label}: ${engine.setting}) · ` : ''}
          {status.detail}
        </p>
      </div>
      {over && (
        <Button size="sm" className="ml-auto" onClick={onNewGame} disabled={busy}>
          <Plus aria-hidden className="size-4" />
          New game
        </Button>
      )}
    </div>
  )
}

/** A draw offer waiting for an answer, or a draw the side to move may claim. */
function DrawPanel({ game, match }: { game: ChessController; match: MatchView }) {
  if (!game.playing) return null
  const offer = match.drawOffer
  const claim = match.claimableDraw && game.playerTurn ? match.claimableDraw : null
  if (!offer && !claim) return null
  return (
    <div className="flex w-full flex-col gap-2 rounded-control bg-brand-50 p-3 ring-1 ring-brand-200">
      {offer && (
        <div className="flex flex-wrap items-center gap-2">
          <Handshake aria-hidden className="size-5 text-brand-700" />
          <p className="font-semibold">
            {sideName(offer)} offers a draw. {sideName(otherSide(offer))}, do you accept?
          </p>
          <div className="ml-auto flex gap-2">
            <Button size="sm" onClick={() => void game.draw('ACCEPT', otherSide(offer))} disabled={game.busy}>
              Accept draw
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void game.draw('DECLINE', otherSide(offer))} disabled={game.busy}>
              Decline
            </Button>
          </div>
        </div>
      )}
      {claim && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">
            {sideName(match.turn)} may claim a draw by {claimName(claim)}.
          </p>
          <Button size="sm" className="ml-auto" onClick={() => void game.draw('CLAIM', match.turn)} disabled={game.busy}>
            Claim draw
          </Button>
        </div>
      )}
    </div>
  )
}

/** Ask for a hint, take a move back or replay it, turn the board, offer a draw, resign. */
function Controls({
  game,
  match,
  onFlip,
  onResign,
  loginPath,
}: {
  game: ChessController
  match: MatchView
  onFlip: () => void
  onResign: () => void
  loginPath: string
}) {
  const on = game.playing
  const local = match.mode === 'LOCAL'
  return (
    <section aria-label="Game controls" className="flex flex-col gap-2">
      <HintButton allowance={match.hints} enabled={game.playerTurn && !game.busy} onHint={() => void game.askHint()} loginPath={loginPath} />
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" variant="secondary" onClick={() => void game.undo()} disabled={!on || !match.canUndo || game.busy}>
          <Undo2 aria-hidden className="size-4" />
          Undo
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void game.redo()} disabled={!on || !match.canRedo || game.busy}>
          <Redo2 aria-hidden className="size-4" />
          Redo
        </Button>
        <Button size="sm" variant="secondary" onClick={onFlip}>
          <ArrowUpDown aria-hidden className="size-4" />
          Flip
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" onClick={() => void game.draw('OFFER', match.turn)} disabled={!on || !local || match.drawOffer !== null || game.busy}>
          <Handshake aria-hidden className="size-4" />
          Offer draw
        </Button>
        <Button size="sm" variant="secondary" onClick={onResign} disabled={!on || game.busy}>
          <Flag aria-hidden className="size-4" />
          Resign
        </Button>
      </div>
      <p className="text-xs text-ink-soft">
        {local ? (
          'Undo takes back the last move, whoever played it, so agree on takebacks first. A draw is offered for the side to move.'
        ) : (
          <span className="inline-flex items-center gap-1">
            <Bot aria-hidden className="size-3.5" />
            Against Stockfish there are no takebacks or draw offers; a repetition or 50-move draw can still be claimed.
          </span>
        )}
      </p>
    </section>
  )
}
