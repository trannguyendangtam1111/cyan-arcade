import { Activity, LoaderCircle } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { ChessAi } from '../ai/chessAi'
import type { EngineStatus, EvaluationResponse } from '../types/chessTypes'
import { EvalBar } from './EvalBar'

interface AnalysisPanelProps {
  ai: ChessAi
  status: EngineStatus | null
  result: EvaluationResponse | null
  loading: boolean
  error: string | null
  onEvaluate: (depth: number, lines: number) => void
  onCancel: () => void
}

/**
 * Admins: Stockfish's evaluation of the position on the board, its best move and up to a few lines,
 * with the depth reached. A search that was cut short is marked provisional; nothing is shown as an
 * evaluation before the engine's answer has arrived.
 */
export function AnalysisPanel({ ai, status, result, loading, error, onEvaluate, onCancel }: AnalysisPanelProps) {
  const [depth, setDepth] = useState<number | null>(null)
  const [lines, setLines] = useState(1)
  const depthId = useId()
  const linesId = useId()
  const maxDepth = status?.maxDepth ?? 22
  const chosenDepth = depth ?? status?.defaultDepth ?? 16
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
          <select id={depthId} value={chosenDepth} onChange={(event) => setDepth(Number(event.target.value))} className="h-9 rounded-control border-2 border-line bg-surface px-2 text-sm font-semibold text-ink normal-case">
            {depths.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={linesId} className="flex flex-col gap-1 text-xs font-bold tracking-wide text-ink-soft uppercase">
          Lines
          <select id={linesId} value={lines} onChange={(event) => setLines(Number(event.target.value))} className="h-9 rounded-control border-2 border-line bg-surface px-2 text-sm font-semibold text-ink normal-case">
            {Array.from({ length: status?.maxLines ?? 3 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? (
        <div className="flex items-center gap-2">
          <span role="status" className="flex items-center gap-2 text-sm text-ink-soft">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            Stockfish is thinking…
          </span>
          <Button size="sm" variant="ghost" onClick={onCancel} className="ml-auto">
            Cancel
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => onEvaluate(chosenDepth, lines)}>
          Evaluate position
        </Button>
      )}
      {error && (
        <p role="alert" className="rounded-control bg-[#ffe4e6] px-3 py-2 text-sm font-semibold text-[#9f1239]">
          {error}
        </p>
      )}
      {result && (
        <div className="flex flex-col gap-2" aria-live="polite">
          <EvalBar evaluation={result.evaluation} ai={ai} provisional={!result.complete} />
          {result.finished ? (
            <p className="text-sm text-ink-soft">The game is over: this is its result, not a search.</p>
          ) : (
            <>
              <p className="text-xs text-ink-soft">
                Depth {result.depth} of {result.requestedDepth}
                {result.complete ? '' : ' (cut short: the numbers are provisional)'} · {result.engine} · from White's side
              </p>
              {result.bestMove && (
                <p className="text-sm">
                  Best move: <strong className="font-mono">{result.bestMove.san}</strong>
                </p>
              )}
              <ol aria-label="Principal variations" className="flex flex-col gap-1 text-sm">
                {result.lines.map((line) => (
                  <li key={line.rank} className="flex gap-2 rounded-md bg-surface px-2 py-1">
                    <span className="w-14 shrink-0 font-mono font-bold">{line.evaluation.display}</span>
                    <span className="min-w-0 truncate font-mono">{line.san.join(' ')}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </section>
  )
}
