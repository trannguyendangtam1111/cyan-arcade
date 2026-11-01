import { Activity, CornerUpLeft, LoaderCircle, Play, Square } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { describe } from '../analysis/evaluationText'
import { scoreText, whiteShare } from '../analysis/score'
import type { Variation } from '../hooks/useBoardView'
import type { AnalysisLine, EngineStatus, EvaluationResponse, Side } from '../types/chessTypes'
import { EvalGraph, type GraphPoint } from './EvalGraph'

interface AnalysisPanelProps {
  status: EngineStatus | null
  /** The evaluation of the position on the board, once Stockfish has answered for it. */
  result: EvaluationResponse | null
  running: boolean
  loading: boolean
  error: string | null
  depth: number
  lines: number
  onDepth: (depth: number) => void
  onLines: (lines: number) => void
  onStart: () => void
  onStop: () => void
  /** The position analysed (the base of a line being looked through), for numbering the lines. */
  baseFen: string
  /** Who is to move in the position on the board. */
  sideToMove: Side
  /** A line being looked through, if any. */
  variation: Variation | null
  onLine: (line: AnalysisLine, index: number) => void
  onBackToGame: () => void
  history: readonly GraphPoint[]
  ply: number
  onPly: (ply: number) => void
}

const sideName = (side: Side) => (side === 'WHITE' ? 'White' : 'Black')

/**
 * Admins: Stockfish on the position on the board, whichever it is (the game now, an earlier move),
 * while analysis is on: the evaluation from White's side, the best move, one to three principal
 * variations and the depth reached. A line's moves can be stepped through on the board without
 * touching the game. Every search goes through the server's engine pool and limits; nothing is shown
 * for a position before the engine has answered for it, and a search cut short is marked provisional.
 */
export function AnalysisPanel({ status, baseFen, result, running, loading, error, depth, lines, onDepth, onLines, onStart, onStop, sideToMove, variation, onLine, onBackToGame, history, ply, onPly }: AnalysisPanelProps) {
  const depthId = useId()
  const linesId = useId()
  const maxDepth = status?.maxDepth ?? 22
  const depths = Array.from({ length: Math.floor(maxDepth / 2) - 3 }, (_, index) => 8 + 2 * index).filter((value) => value <= maxDepth)

  return (
    <section aria-labelledby="chess-analysis" className="flex flex-col gap-3 rounded-control bg-surface-muted p-3">
      <h2 id="chess-analysis" className="flex items-center gap-1.5 font-display text-base font-semibold">
        <Activity aria-hidden className="size-4.5" />
        Engine analysis
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <label htmlFor={depthId} className="flex flex-col gap-1 text-xs font-bold tracking-wide text-ink-soft uppercase">
          Depth
          <select id={depthId} value={depth} onChange={(event) => onDepth(Number(event.target.value))} className="h-9 rounded-control border-2 border-line bg-surface px-2 text-sm font-semibold text-ink normal-case">
            {depths.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={linesId} className="flex flex-col gap-1 text-xs font-bold tracking-wide text-ink-soft uppercase">
          Lines
          <select id={linesId} value={lines} onChange={(event) => onLines(Number(event.target.value))} className="h-9 rounded-control border-2 border-line bg-surface px-2 text-sm font-semibold text-ink normal-case">
            {Array.from({ length: Math.min(3, status?.maxLines ?? 3) }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button size="sm" variant="secondary" onClick={onStop}>
            <Square aria-hidden className="size-3.5" />
            Stop analysis
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={onStart}>
            <Play aria-hidden className="size-3.5" />
            Start analysis
          </Button>
        )}
        {loading && (
          <span role="status" className="flex items-center gap-1.5 text-sm text-ink-soft">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            Stockfish is thinking…
          </span>
        )}
      </div>
      <p className="text-xs text-ink-soft">
        {sideName(sideToMove)} to move{variation ? ' (in a line Stockfish suggests)' : ''}. Evaluations are from White&apos;s side: + favours White, − Black.
      </p>
      {error && (
        <p role="alert" className="rounded-control bg-rose-100 px-3 py-2 text-sm font-semibold text-rose-800">
          {error}
        </p>
      )}
      {variation && (
        <div className="flex flex-wrap items-center gap-2 rounded-control bg-sky-100 px-3 py-2 text-sm text-sky-800">
          <span className="font-semibold">
            Line {variation.line.rank}, move {variation.index} of {variation.line.uci.length}: the game is unchanged.
          </span>
          <Button size="sm" variant="secondary" onClick={onBackToGame} className="ml-auto">
            <CornerUpLeft aria-hidden className="size-4" />
            Back to the game
          </Button>
        </div>
      )}
      {result && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <strong className="font-mono text-base" data-testid="evaluation-display">
              {scoreText(result.evaluation)}
            </strong>
            <span className="text-ink-soft">{describe(result.evaluation, result.termination)}</span>
            {!result.complete && <span className="rounded-full bg-amber-100 px-2 text-xs font-bold text-amber-900">provisional</span>}
          </p>
          {result.finished ? (
            <p className="text-sm text-ink-soft">The game is over: this is its result, not a search.</p>
          ) : (
            <>
              <p className="text-xs text-ink-soft">
                Depth {result.depth} of {result.requestedDepth}
                {result.complete ? '' : ' (cut short: the numbers are provisional)'} · {result.engine}
                {result.bestMove && (
                  <>
                    {' · '}best <strong className="font-mono text-ink">{result.bestMove.san}</strong>
                  </>
                )}
              </p>
              <ol aria-label="Principal variations" className="flex flex-col gap-1.5">
                {result.lines.map((line) => (
                  <LineRow key={line.rank} line={line} baseFen={baseFen} selected={variation?.line.rank === line.rank ? variation.index : null} onLine={onLine} />
                ))}
              </ol>
            </>
          )}
        </div>
      )}
      {!result && !variation && !loading && !running && <p className="text-sm text-ink-soft">Start analysis to see Stockfish&apos;s view of the position on the board.</p>}
      <EvalGraph points={history} selected={ply} onSelect={onPly} label="White's winning chances so far, from the coach's analysis" />
    </section>
  )
}

/**
 * One principal variation: its score in a fixed column (light for White's advantage, dark for
 * Black's, so the sign reads at a glance), then its moves as separate tokens numbered as a score
 * sheet would. Each token shows the line up to that move on the board; the game does not change.
 * The tokens wrap inside the row, so a long line never widens the page.
 */
function LineRow({ line, baseFen, selected, onLine }: { line: AnalysisLine; baseFen: string; selected: number | null; onLine: (line: AnalysisLine, index: number) => void }) {
  const [, turn = 'w', , , , fullmove = '1'] = baseFen.split(' ')
  const startNumber = Number(fullmove) || 1
  const whiteFirst = turn === 'w'
  const score = scoreText(line.evaluation)
  const whiteAhead = whiteShare(line.evaluation) >= 50
  return (
    <li
      className={cn('flex min-w-0 items-start gap-2 rounded-control bg-surface p-1.5 ring-1', selected !== null ? 'ring-2 ring-(--accent)' : 'ring-line')}
      data-line={line.rank}
      data-selected={selected !== null || undefined}
    >
      <span
        aria-label={`Line ${line.rank}: ${describe(line.evaluation)}, depth ${line.depth}`}
        title={`Line ${line.rank} · depth ${line.depth}`}
        className={cn(
          'mt-0.5 inline-flex w-16 shrink-0 justify-center rounded-md px-1 py-0.5 font-mono text-sm font-bold tabular-nums ring-1',
          whiteAhead ? 'bg-white text-[#16323f] ring-black/10' : 'bg-[#26364a] text-white ring-white/10',
        )}
        data-testid="line-score"
      >
        {score}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 gap-y-1 font-mono text-sm">
        {line.san.map((san, index) => {
          const white = whiteFirst ? index % 2 === 0 : index % 2 === 1
          const number = startNumber + Math.floor((index + (whiteFirst ? 0 : 1)) / 2)
          const prefix = white ? `${number}.` : index === 0 ? `${number}…` : ''
          const current = selected === index + 1
          return (
            <span key={`${line.rank}-${index}`} className="inline-flex items-center">
              {prefix && <span className="pr-0.5 pl-1 text-xs text-ink-soft tabular-nums">{prefix}</span>}
              <button
                type="button"
                onClick={() => onLine(line, index + 1)}
                aria-label={`Line ${line.rank}: show the position after ${prefix ? `${prefix} ` : ''}${san}`}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'rounded-md px-1 py-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none',
                  current ? 'bg-(--accent) text-(--accent-ink)' : index === 0 ? 'bg-(--accent)/15 font-bold text-ink hover:bg-(--accent)/30' : 'text-ink hover:bg-surface-muted',
                )}
              >
                {san}
              </button>
            </span>
          )
        })}
      </span>
    </li>
  )
}
