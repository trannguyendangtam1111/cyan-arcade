import { Activity, Bot, CircleHelp, CornerUpLeft, Flag, GitBranch, GraduationCap, Handshake, LoaderCircle, Palette, Plus, Redo2, RotateCcw, SearchCheck, SlidersHorizontal, Undo2, X } from 'lucide-react'
import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/ErrorState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import type { GameProps } from '@/games/types'
import { cn } from '@/lib/cn'
import type { ChessAi } from './ai/chessAi'
import { moveQuality } from './analysis/moveQuality'
import { whiteShare } from './analysis/score'
import { AnalysisPanel } from './components/AnalysisPanel'
import type { EngineArrow } from './components/BoardArrows'
import { ChessBoard, type SquareBadge } from './components/ChessBoard'
import { CoachPanel } from './components/CoachPanel'
import { NewGameDialog, PromotionDialog, ResignDialog } from './components/Dialogs'
import { DisplaySettings } from './components/DisplaySettings'
import { EngineGamePanel } from './components/EngineGamePanel'
import { EvalBar, type EvalBarAction, type EvalBarState } from './components/EvalBar'
import type { GraphPoint } from './components/EvalGraph'
import { HelpDialog } from './components/HelpDialog'
import { HintButton, HintCard } from './components/HintPanel'
import { LookPicker } from './components/LookPicker'
import { MoveList, type MoveLabel } from './components/MoveList'
import { NavStrip } from './components/NavStrip'
import { PlayerBar } from './components/PlayerBar'
import { ReviewPanel } from './components/ReviewPanel'
import { claimName, kingSquare, matchStatus, otherSide, parsePlacement, sideName, squareIndex } from './engine/board'
import { useEngineStatus, useEvaluation, useReview } from './hooks/useAnalysis'
import { useAnnotations } from './hooks/useAnnotations'
import { ownsKeys, useBoardView, viewName } from './hooks/useBoardView'
import { useChessGame, type ChessController } from './hooks/useChessGame'
import { useChessSettings } from './hooks/useChessSettings'
import { useCoach } from './hooks/useCoach'
import { useLook } from './hooks/useLook'
import { useOrientation } from './hooks/useOrientation'
import { usePremove } from './hooks/usePremove'
import { useShownEvaluation } from './hooks/useShownEvaluation'
import { useWideBoard } from './hooks/useWideBoard'
import type { Difficulty, Evaluation, MatchView, Side } from './types/chessTypes'
import './chess.css'

type Confirm = null | { kind: 'new' } | { kind: 'engine'; side: Side; difficulty: Difficulty } | { kind: 'resign' }
type Dialog = null | 'help' | 'skin' | 'engine'

/**
 * Chess, board first: two players on one device, or (admins) one player against Stockfish.
 *
 * The match as the server has it lives in `useChessGame`; which position the board shows lives in
 * `useBoardView` (the live game, an earlier position, a line of the engine's), and only the live
 * board takes moves. While Stockfish is to move, a move can be planned (`usePremove`). Everything
 * else is on demand: the tool buttons switch on Coach Mode and (admins) analysis and the game
 * review, and open the Skin, Help, Display and "vs Stockfish" panels; none of them touches the game.
 */
export default function ChessGame(props: GameProps<ChessAi>) {
  const admin = props.ai !== undefined
  const game = useChessGame(props.onGameStart)
  const look = useLook(props.cosmetics)
  const { orientation, flip, orient } = useOrientation()
  const { settings, change } = useChessSettings()
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [listTall, setListTall] = useState(false)
  const [reviewSide, setReviewSide] = useState<'before' | 'after'>('after')
  const [drawMode, setDrawMode] = useState(false)
  /** A judged move whose better alternative is shown on the board (on the position before it). */
  const [bestFor, setBestFor] = useState<number | null>(null)
  const [depth, setDepth] = useState<number | null>(null)
  const [lines, setLines] = useState(1)
  const match = game.match
  const engine = useEngineStatus(admin)
  const nav = useBoardView(match)
  const view = nav.view
  const coach = useCoach(match, settings.coach)
  const review = useReview(match)
  const analysisShown = admin && settings.analysis
  const analysisDepth = depth ?? engine.status?.defaultDepth ?? 16
  // Analysis keeps what it found while its panel is put away, and searches only while it is shown.
  // While a line is looked through, the analysis stays on the position the line starts from.
  const analysedPly = view?.variation ? view.variation.basePly : (view?.ply ?? 0)
  const analysedFen = match ? (analysedPly === 0 ? match.startFen : (match.history[analysedPly - 1]?.fen ?? match.fen)) : null
  // For admins the evaluation bar is fed by Stockfish itself: while the bar is shown, every position
  // the board shows is evaluated (until the player stops it), not only while the panel is open.
  const engineUnavailable = engine.failed || engine.status?.available === false
  const barEvaluates = admin && settings.evalBar && !engineUnavailable
  const evaluation = useEvaluation(match, admin && view && analysedFen ? { ply: analysedPly, fen: analysedFen } : null, analysisDepth, lines, analysisShown || barEvaluates, {
    auto: barEvaluates,
    onStale: game.reload,
  })
  const drawings = useAnnotations(view?.key ?? 'none')
  const wide = useWideBoard()
  const premove = usePremove(match, game, game.placement, view?.live ?? false)

  const inProgress = game.playing && match !== null && match.history.length > 0
  const requestNewGame = () => (inProgress ? setConfirm({ kind: 'new' }) : void game.newGame())
  const playEngine = (side: Side, difficulty: Difficulty) => {
    setDialog(null)
    if (inProgress) {
      setConfirm({ kind: 'engine', side, difficulty })
      return
    }
    orient(side)
    void game.playEngine(side, difficulty)
  }
  const playerSide: Side | undefined = match?.engine ? otherSide(match.engine.side) : undefined
  const finished = match?.status === 'FINISHED'

  // Labels: the review's (the deeper analysis) where there is one, else Coach Mode's quick ones.
  const reviewMoves = useMemo(() => review.review?.moves ?? [], [review.review])
  const labels = useMemo(() => {
    const merged = new Map<number, MoveLabel>()
    for (const [ply, label] of coach.labels) merged.set(ply, { ...label, provisional: label.classification !== null })
    for (const move of reviewMoves) merged.set(move.ply, { classification: move.classification, pending: false, provisional: false })
    return merged
  }, [coach.labels, reviewMoves])

  // The reviewed move on the board: while looking back, or its position before (even for the last move).
  const reviewedAt = view && view.ply >= 1 && !view.variation ? (reviewMoves[view.ply - 1] ?? null) : null
  const reviewed = reviewedAt && (!view?.live || reviewSide === 'before') ? reviewedAt : null
  const showBefore = reviewed !== null && reviewSide === 'before'
  const backToGame = useCallback(() => {
    setReviewSide('after')
    setBestFor(null)
    nav.go(match?.history.length ?? 0)
  }, [match, nav])

  /** What is known of a game position's evaluation: the review's, else the coach's. */
  const knownEvaluation = useCallback(
    (ply: number): Evaluation | null => {
      if (ply >= 1 && reviewMoves[ply - 1]) return reviewMoves[ply - 1].after
      if (ply === 0 && reviewMoves[0]) return reviewMoves[0].before
      return coach.evaluationAt(ply)
    },
    [coach, reviewMoves],
  )

  // The bar: a line's evaluation, else Stockfish's answer for this position, else what the review or
  // the coach found for it, else nothing (never a guess).
  let barEvaluation: Evaluation | null = null
  let barProvisional = false
  if (view?.variation) barEvaluation = view.variation.line.evaluation
  else if (showBefore && reviewed) barEvaluation = reviewed.before
  else if (evaluation.result) {
    barEvaluation = evaluation.result.evaluation
    barProvisional = !evaluation.result.complete
  } else if (view) barEvaluation = knownEvaluation(view.ply)
  // Something is working out this position's evaluation: the analysis, the coach judging the move
  // that led here, or the review that has not reached it yet. Until it arrives the bar keeps the
  // last evaluation (marked as updating), never an invented 50/50.
  const evaluationPending =
    view !== null &&
    !view.variation &&
    !showBefore &&
    (evaluation.loading || coach.byPly.get(view.ply)?.status === 'pending' || (review.running && view.ply >= 1 && !reviewMoves[view.ply - 1]))
  const shownEvaluation = useShownEvaluation(match?.id ?? null, view ? `${view.key}:${showBefore ? 'before' : 'after'}` : null, barEvaluation, evaluationPending)
  if (shownEvaluation.state !== 'current') barProvisional = false
  // An empty bar says why, and what can be done about it; it never pretends a search has run.
  let barState: EvalBarState = shownEvaluation.state
  let barReason: string | undefined
  let barAction: EvalBarAction | null = null
  if (barState === 'unknown' && view && !view.variation && !showBefore) {
    if (admin && evaluation.error) {
      barState = 'error'
      barReason = `Stockfish could not evaluate this position. ${evaluation.error}`
      barAction = { kind: 'retry', label: 'Retry', onClick: evaluation.retry }
    } else if (admin && engineUnavailable) {
      barReason = 'Stockfish is not available on this server'
    } else if (admin && !evaluation.running) {
      barState = 'stopped'
      barReason = 'Stockfish evaluation is stopped'
      barAction = { kind: 'start', label: 'Evaluate', onClick: evaluation.start }
    } else if (!admin && !settings.coach) {
      barReason = 'Not evaluated: Coach Mode evaluates each move as it is played'
      if (match?.hints.allowed) barAction = { kind: 'coach', label: 'Turn on Coach', onClick: () => change('coach', true) }
    }
  }
  const barProps = { evaluation: shownEvaluation.evaluation, state: barState, reason: barReason, action: barAction, provisional: barProvisional, termination: evaluation.result?.termination }

  const knownWhite = (ply: number) => {
    const known = knownEvaluation(ply)
    return known ? whiteShare(known) : null
  }
  const historyPoints: GraphPoint[] = match
    ? Array.from({ length: match.history.length + 1 }, (_, ply) => ({ ply, white: knownWhite(ply), classification: labels.get(ply)?.classification ?? undefined }))
    : []

  const letGo = () => {
    setDrawMode(false)
    drawings.clear()
    premove.clear()
    game.deselect()
  }

  const onBoardKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !ownsKeys(event.target)) {
      letGo()
      nav.exitVariation()
      return
    }
    nav.onKeyDown(event)
  }

  /** Shows a judged move's better alternative on the board, on the position it was played in. */
  const showBest = (ply: number) => {
    if (reviewMoves[ply - 1]) {
      const shown = showBefore && reviewed?.ply === ply
      setReviewSide(shown ? 'after' : 'before')
      nav.go(ply)
      return
    }
    if (bestFor === ply && view?.ply === ply - 1) {
      setBestFor(null)
      return
    }
    setBestFor(ply)
    nav.go(ply - 1)
  }

  const openReview = () => {
    setReviewOpen((open) => !open)
    if (!reviewOpen && !review.review && finished) review.start()
  }

  let board: ReactNode
  if (game.loading && !match) {
    board = <LoadingState label="Setting up the board…" className="min-h-80 w-full" />
  } else if (game.loadError || !match || !view) {
    board = (
      <ErrorState
        title="Couldn't set up the board"
        description="The chess server could not be reached. Check your connection and try again."
        onRetry={() => void game.reload()}
      />
    )
  } else {
    // The board shows the game now (and takes moves) unless a review shows a move's position before it.
    const live = view.live && !showBefore
    const fen = showBefore && reviewed ? reviewed.fenBefore : view.fen
    const placement = live ? game.placement : parsePlacement(fen)
    const sideToMove: Side = fen.split(' ')[1] === 'b' ? 'BLACK' : 'WHITE'
    const shownMove = !view.variation && view.ply >= 1 ? match.history[view.ply - 1] : null
    const checked = live ? match.checkedKing : shownMove && /[+#]$/.test(shownMove.san) && !showBefore ? kingSquare(placement, sideToMove) : null
    // Who the board answers to: the player on their turn, a premove while Stockfish thinks, or nobody.
    const planning = live && premove.active
    const playing = live && game.playerTurn && !game.busy

    const arrows: EngineArrow[] = []
    if (showBefore && reviewed?.best && reviewed.best.uci !== reviewed.uci) arrows.push(reviewed.best)
    const coached = bestFor !== null && view.ply === bestFor - 1 && !view.variation ? coach.byPly.get(bestFor)?.move : null
    if (coached?.best) arrows.push(coached.best)
    if (analysisShown && evaluation.running && evaluation.result?.bestMove && !view.variation) arrows.push(evaluation.result.bestMove)

    const label = settings.moveLabels && shownMove && !showBefore ? labels.get(shownMove.ply) : null
    const quality = label?.classification ? moveQuality(label.classification) : null
    const badge: SquareBadge | null =
      quality && shownMove && quality.symbol ? { square: shownMove.to, symbol: quality.symbol, color: quality.color, ink: quality.ink, label: `${quality.label}${label?.provisional ? ' (quick analysis)' : ''}`, provisional: label?.provisional } : null
    const bottom = orientation

    // "Continue from here": the position shown, as a variation of its own (never the game itself).
    const explorePly = showBefore && reviewed ? reviewed.ply - 1 : view.ply
    const continueHere = (
      <Button
        size="sm"
        variant="secondary"
        // Once the variation shows, the game is left at its live position: coming back shows the game as it is.
        onClick={() => void game.explore(explorePly).then((started) => started && backToGame())}
        disabled={game.busy} title="Play on from this position in a separate variation: the game itself stays as it is">
        <GitBranch aria-hidden className="size-4" />
        Continue from here
      </Button>
    )

    board = (
      <div className="flex w-full flex-col gap-2">
        {match.mode === 'ANALYSIS' && <VariationBanner match={match} busy={game.busy} onLeave={() => void game.leaveVariation()} />}
        {reviewed ? (
          <div role="status" className="flex min-h-12 w-full flex-wrap items-center gap-2 rounded-control bg-brand-50 px-3 py-1.5">
            <p className="font-display font-semibold">
              Reviewing move {Math.ceil(reviewed.ply / 2)}
              {reviewed.color === 'WHITE' ? '.' : '…'} {reviewed.san} ({showBefore ? 'before' : 'after'} it)
            </p>
            <div className="ml-auto flex flex-wrap gap-2">
              {continueHere}
              <Button size="sm" variant="secondary" onClick={backToGame}>
                Back to the game
              </Button>
            </div>
          </div>
        ) : !live ? (
          <div role="status" className="flex min-h-12 w-full flex-wrap items-center gap-x-2 rounded-control bg-amber-100 px-3 py-1.5 text-amber-900" data-testid="inspecting">
            <p className="min-w-0 font-display font-semibold">
              {view.variation
                ? `Stockfish's line ${view.variation.line.rank}: ${view.variation.line.san.slice(0, view.variation.index).join(' ')}`
                : view.ply === 0
                  ? 'The start position'
                  : `After ${Math.ceil(view.ply / 2)}${view.ply % 2 === 1 ? '.' : '…'} ${shownMove?.san}`}
              <span className="block text-xs font-normal">Looking back: the game goes on unchanged.</span>
            </p>
            <div className="ml-auto flex flex-wrap gap-2">
              {!view.variation && continueHere}
              <Button size="sm" variant="secondary" onClick={backToGame}>
                <CornerUpLeft aria-hidden className="size-4" />
                Back to the game
              </Button>
            </div>
          </div>
        ) : (
          <StatusLine match={match} onNewGame={requestNewGame} busy={game.busy} thinking={game.engineThinking} />
        )}
        {game.engineFailed && game.engineTurn && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded-control bg-amber-100 px-3 py-1.5 text-sm text-amber-900">
            <span className="font-semibold">Stockfish could not move. The game is unchanged.</span>
            <Button size="sm" className="ml-auto" onClick={game.retryEngine} disabled={game.busy}>
              <RotateCcw aria-hidden className="size-4" />
              Retry Stockfish&apos;s move
            </Button>
          </div>
        )}
        {live && game.hint && <HintCard hint={game.hint} onDismiss={game.dismissHint} />}
        {live && <DrawPanel game={game} match={match} />}
        {settings.evalBar && !wide && <EvalBar {...barProps} />}
        <PlayerBar side={otherSide(bottom)} match={match} pieces={look.pieces} />
        <div
          tabIndex={0}
          role="group"
          aria-label="Board: arrow keys step through the game"
          onKeyDown={onBoardKeys}
          className="relative flex w-full items-stretch gap-2 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-brand-300"
          data-testid="board-frame"
        >
          {settings.evalBar && wide && (
            <div className="flex">
              <EvalBar layout="vertical" bottom={bottom} {...barProps} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <ChessBoard
              placement={placement}
              orientation={orientation}
              selected={playing ? game.selected : planning ? premove.selected : null}
              targets={playing ? game.targets : new Map()}
              lastMove={showBefore ? null : view.lastMove}
              hint={live && game.hint ? { from: game.hint.move.from, to: game.hint.move.to } : null}
              checkedKing={checked}
              interactive={playing || planning}
              onSquare={planning ? premove.select : game.select}
              onEscape={letGo}
              theme={look.board}
              pieces={look.pieces}
              movable={playing ? game.movable : planning ? premove.movable : undefined}
              onDragStart={planning ? premove.select : game.pickUp}
              onDrop={planning ? premove.queue : game.drop}
              annotations={settings.annotations ? drawings.annotations : null}
              engineArrows={arrows}
              onArrow={settings.annotations ? drawings.toggleArrow : undefined}
              onMark={settings.annotations ? drawings.toggleMark : undefined}
              onClearDrawings={drawings.clear}
              drawMode={settings.annotations && drawMode}
              badge={badge}
              premove={live && game.playing ? premove.premove : null}
              onInactivePress={(square) => {
                if (!view.live && placement[squareIndex(square)]) game.say('You are looking at an earlier position. Go back to the live game to move.', 'info')
              }}
            />
          </div>
          {game.notice && (
            <div
              key={game.notice.id}
              role={game.notice.tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'chess-toast absolute top-2 left-1/2 z-40 flex w-max max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold shadow-lift',
                game.notice.tone === 'error' ? 'bg-rose-100 text-rose-800' : 'bg-surface text-ink ring-1 ring-line',
              )}
            >
              <span className="min-w-0">{game.notice.text}</span>
              <button type="button" onClick={game.dismissNotice} aria-label="Dismiss" className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-black/5">
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
          )}
        </div>
        <PlayerBar side={bottom} match={match} pieces={look.pieces} />
        <NavStrip
          ply={view.ply}
          latest={match.history.length}
          live={view.live}
          inVariation={view.variation !== null}
          label={view.variation ? `Line ${view.variation.line.rank}, move ${view.variation.index}` : viewName(view.ply, view.live, match.history)}
          newMoves={view.newMoves}
          onFirst={() => nav.go(0)}
          onPrevious={() => nav.step(-1)}
          onNext={() => nav.step(1)}
          onLive={backToGame}
          onFlip={flip}
          drawing={{ enabled: settings.annotations, on: drawMode, count: drawings.count, toggle: () => setDrawMode((on) => !on), clear: drawings.clear }}
        />
        {live && game.playing && premove.premove && (
          <div className="flex w-full flex-wrap items-center gap-2 rounded-control bg-violet-50 px-3 py-1.5 text-sm text-violet-900 ring-1 ring-violet-200" data-testid="premove">
            <span className="font-semibold">
              Premove {premove.premove.from}–{premove.premove.to}
            </span>
            <span className="text-xs">played when your turn comes, if still legal</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={premove.clear}>
              Cancel premove
            </Button>
          </div>
        )}
        {drawMode && settings.annotations && <p className="w-full text-xs text-ink-soft">Draw mode: tap a square, then another for an arrow, or the same one to highlight it. Pieces stay put.</p>}
      </div>
    )
  }

  const loginPath = props.cosmetics?.loginPath ?? '/login?redirect=%2Fgames%2Fchess'
  const feedbackMove = match && view ? (view.ply >= 1 && !view.variation && !view.live ? match.history[view.ply - 1] : (match.history[match.history.length - 1] ?? null)) : null
  const feedbackReviewed = feedbackMove ? (reviewMoves[feedbackMove.ply - 1] ?? null) : null
  const feedbackBestShown = feedbackMove
    ? feedbackReviewed
      ? showBefore && reviewed?.ply === feedbackMove.ply
      : bestFor === feedbackMove.ply && view?.ply === feedbackMove.ply - 1
    : false

  return (
    <div className="chess-page mx-auto flex w-full max-w-[74rem] flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:items-start lg:gap-5">
      <div className="mx-auto flex w-full max-w-[40rem] min-w-0 flex-col gap-2 lg:mx-0 lg:flex-1">{board}</div>

      {match && view && (
        <aside className="flex w-full max-w-[40rem] min-w-0 flex-col gap-3 self-center lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:w-[22rem] lg:shrink-0 lg:self-start lg:overflow-y-auto lg:pr-1" aria-label="Game controls and tools">
          <Controls game={game} match={match} onResign={() => setConfirm({ kind: 'resign' })} onNewGame={requestNewGame} loginPath={loginPath} />
          <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Tools">
            <Tool icon={<GraduationCap aria-hidden className="size-4" />} label="Coach" pressed={settings.coach} onClick={() => change('coach', !settings.coach)} title="Coach Mode: Stockfish rates each of your moves as you play" />
            {admin && <Tool icon={<Activity aria-hidden className="size-4" />} label="Analysis" pressed={settings.analysis} onClick={() => change('analysis', !settings.analysis)} title="Engine analysis of the position on the board" />}
            {admin && (
              <Tool
                icon={<SearchCheck aria-hidden className="size-4" />}
                label="Review"
                expanded={reviewOpen}
                onClick={openReview}
                disabled={!finished}
                title={finished ? 'Game review: every move analysed' : 'Game review: available once the game is over'}
              />
            )}
            {admin && <Tool icon={<Bot aria-hidden className="size-4" />} label="vs Stockfish" dialog onClick={() => setDialog('engine')} title="Start a game against Stockfish" />}
            {props.cosmetics && <Tool icon={<Palette aria-hidden className="size-4" />} label="Skin" dialog onClick={() => setDialog('skin')} title="Board and piece set" />}
            <Tool icon={<CircleHelp aria-hidden className="size-4" />} label="Help" dialog onClick={() => setDialog('help')} title="How to play, and every control" />
            <Tool icon={<SlidersHorizontal aria-hidden className="size-4" />} label="Display" expanded={displayOpen} onClick={() => setDisplayOpen((open) => !open)} title="What the board and this column show" />
          </div>
          {displayOpen && <DisplaySettings settings={settings} onChange={change} analysisAvailable={admin} />}
          {(settings.coach || feedbackReviewed) && (
            <CoachPanel
              allowed={match.hints.allowed || feedbackReviewed !== null}
              enabled={settings.coach}
              loginPath={loginPath}
              move={feedbackMove}
              reviewed={feedbackReviewed}
              entry={feedbackMove ? (coach.byPly.get(feedbackMove.ply) ?? null) : null}
              bestShown={feedbackBestShown}
              onShowBest={showBest}
              onRetry={coach.retry}
            />
          )}
          {settings.moveList && (
            <MoveList
              history={match.history}
              viewPly={view.ply}
              live={view.live}
              onSelect={nav.go}
              labels={labels}
              showLabels={settings.moveLabels}
              expanded={listTall}
              onToggle={() => setListTall((tall) => !tall)}
              onKeyDown={onBoardKeys}
            />
          )}
          {analysisShown && (
            <AnalysisPanel
              status={engine.status}
              baseFen={analysedFen ?? match.fen}
              result={evaluation.result}
              running={evaluation.running}
              loading={evaluation.loading}
              error={evaluation.error}
              depth={analysisDepth}
              lines={lines}
              onDepth={setDepth}
              onLines={setLines}
              onStart={evaluation.start}
              onStop={evaluation.stop}
              sideToMove={(view.fen.split(' ')[1] === 'b' ? 'BLACK' : 'WHITE') as Side}
              variation={view.variation}
              onLine={(line, index) => nav.enterVariation(view.variation?.basePly ?? view.ply, line, index)}
              onBackToGame={nav.exitVariation}
              history={historyPoints}
              ply={view.ply}
              onPly={nav.go}
            />
          )}
          {admin && reviewOpen && (
            <ReviewPanel
              review={review.review}
              error={review.error}
              running={review.running}
              finished={finished}
              ply={view.ply}
              live={view.live}
              onPly={nav.go}
              side={reviewSide}
              onSide={setReviewSide}
              onStart={review.start}
              onCancel={review.cancel}
              onClose={() => {
                review.close()
                setReviewOpen(false)
              }}
            />
          )}
        </aside>
      )}

      <PromotionDialog side={game.promotion && match ? match.turn : null} pieces={look.pieces} onChoose={game.choosePromotion} />
      {match && (
        <ResignDialog
          open={confirm?.kind === 'resign'}
          turn={match.turn}
          only={playerSide}
          onClose={() => setConfirm(null)}
          onResign={(side) => {
            setConfirm(null)
            premove.clear()
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
          premove.clear()
          if (pending?.kind === 'engine') {
            orient(pending.side)
            void game.playEngine(pending.side, pending.difficulty)
          } else {
            void game.newGame()
          }
        }}
      />
      <HelpDialog open={dialog === 'help'} onClose={() => setDialog(null)} />
      <Modal open={dialog === 'skin'} onClose={() => setDialog(null)} title="Skin">
        <LookPicker cosmetics={props.cosmetics} look={look} />
      </Modal>
      {admin && (
        <Modal open={dialog === 'engine'} onClose={() => setDialog(null)} title="Play vs Stockfish">
          <EngineGamePanel difficulties={engine.status?.difficulties ?? null} unavailable={engine.failed || engine.status?.available === false} busy={game.busy} onStart={playEngine} />
        </Modal>
      )}
    </div>
  )
}

/** A tool: a toggle (`pressed`), a panel (`expanded`) or a dialog. */
function Tool({ icon, label, onClick, title, pressed, expanded, dialog, disabled }: { icon: ReactNode; label: string; onClick: () => void; title: string; pressed?: boolean; expanded?: boolean; dialog?: boolean; disabled?: boolean }) {
  const on = pressed ?? expanded ?? false
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={pressed}
      aria-expanded={expanded}
      aria-haspopup={dialog ? 'dialog' : undefined}
      disabled={disabled}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold ring-1 transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45',
        on ? 'bg-(--accent) text-(--accent-ink) ring-(--accent)' : 'bg-surface-muted text-ink ring-line hover:bg-surface',
      )}
    >
      {icon}
      {label}
    </button>
  )
}

const TONES = {
  turn: 'bg-surface-muted text-ink',
  check: 'bg-rose-100 text-rose-800',
  win: 'bg-amber-100 text-ink',
  draw: 'bg-surface-muted text-ink',
  left: 'bg-surface-muted text-ink-soft',
}

/** Whose turn it is, check, or how the game ended, and a way to start again once it has. */
function StatusLine({ match, onNewGame, busy, thinking }: { match: MatchView; onNewGame: () => void; busy: boolean; thinking: boolean }) {
  const status = matchStatus(match)
  const over = match.result !== null || match.status !== 'ACTIVE'
  const engine = match.engine
  return (
    <div role="status" aria-live="polite" className={cn('flex min-h-12 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-3 py-1.5', TONES[status.tone])}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-display leading-tight font-semibold">
          {thinking && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {thinking ? 'Stockfish is thinking…' : status.title}
        </p>
        <p className="text-xs opacity-80">
          {engine && !over ? `You play ${sideName(otherSide(engine.side))} vs Stockfish (${engine.label}) · ` : ''}
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

/**
 * A variation is not the game: says so on top of the board, where it starts from, and leads back to
 * the game (which it never changed).
 */
function VariationBanner({ match, busy, onLeave }: { match: MatchView; busy: boolean; onLeave: () => void }) {
  const ply = match.source?.ply ?? 0
  const from = ply === 0 ? 'the start position' : `after ${Math.ceil(ply / 2)}${ply % 2 === 1 ? '.' : '…'} ${match.history[ply - 1]?.san ?? ''}`
  return (
    <div className="flex min-h-12 w-full flex-wrap items-center gap-2 rounded-control bg-violet-50 px-3 py-1.5 text-violet-900 ring-1 ring-violet-200" data-testid="variation-banner">
      <GitBranch aria-hidden className="size-5 shrink-0" />
      <p className="min-w-0 font-display font-semibold">
        Exploring a variation from {from}
        <span className="block text-xs font-normal">Your game is unchanged: nothing here counts or is kept as its result.</span>
      </p>
      <Button size="sm" variant="secondary" className="ml-auto" onClick={onLeave} disabled={busy}>
        <CornerUpLeft aria-hidden className="size-4" />
        Back to my game
      </Button>
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
    <div className="flex w-full flex-col gap-2 rounded-control bg-brand-50 p-2.5 ring-1 ring-brand-200">
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

/** Hint, takebacks (which change the game), a draw offer, resigning and a new game. */
function Controls({ game, match, onResign, onNewGame, loginPath }: { game: ChessController; match: MatchView; onResign: () => void; onNewGame: () => void; loginPath: string }) {
  const on = game.playing
  const local = match.mode === 'LOCAL'
  const variation = match.mode === 'ANALYSIS'
  const undoTitle =
    match.mode === 'AI'
      ? "Take back your last move and Stockfish's reply: this changes the game. To only look back, use the arrows under the board."
      : variation
        ? 'Take the last move of the variation back'
        : 'Take the last move back: this changes the game (agree on it first). To only look back, use the arrows under the board.'
  const redoTitle = match.mode === 'AI' ? "Play your taken-back move (and Stockfish's reply) again" : 'Play the taken-back move again'
  return (
    <section aria-label="Game controls" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 [&>*]:w-full">
          <HintButton allowance={match.hints} enabled={game.playerTurn && !game.busy} onHint={() => void game.askHint()} loginPath={loginPath} />
        </div>
        <Button size="sm" variant="secondary" onClick={onNewGame} disabled={game.busy} title="Start a new game (the one in progress is left)">
          <Plus aria-hidden className="size-4" />
          New game
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void game.undo()}
          disabled={!on || !match.canUndo || game.busy}
          title={undoTitle}
        >
          <Undo2 aria-hidden className="size-4" />
          Undo
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void game.redo()} disabled={!on || !match.canRedo || game.busy} title={redoTitle}>
          <Redo2 aria-hidden className="size-4" />
          Redo
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void game.draw('OFFER', match.turn)} disabled={!on || !local || match.drawOffer !== null || game.busy} title={local ? 'Offer a draw for the side to move' : variation ? 'A variation has no result to agree' : 'Stockfish does not take draw offers'}>
          <Handshake aria-hidden className="size-4" />
          Offer draw
        </Button>
        <Button size="sm" variant="secondary" onClick={onResign} disabled={!on || variation || game.busy} title={variation ? 'A variation has no result to resign' : 'Give the game up (asks first)'}>
          <Flag aria-hidden className="size-4" />
          Resign
        </Button>
      </div>
    </section>
  )
}
