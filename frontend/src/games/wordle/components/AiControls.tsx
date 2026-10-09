import { Gauge, LoaderCircle, Play } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import type { AiBenchmark, Strategy } from '../types/wordleTypes'
import { STRATEGIES, type AiRecord } from './strategies'

interface AiControlsProps {
  strategy: Strategy
  onStrategy: (strategy: Strategy) => void
  /** The daily puzzle to solve, `YYYY-MM-DD`. */
  date: string
  onDate: (date: string) => void
  firstDay: string
  today: string
  onSolve: () => void
  solving: boolean
  error: string | null
  history: AiRecord[]
  benchmark: { strategy: Strategy; result: AiBenchmark | null; loading: boolean } | null
  onBenchmark: () => void
}

/** What the admin can set for the AI (strategy, puzzle), and how it has done. */
export function AiControls(props: AiControlsProps) {
  const { strategy, onStrategy, date, onDate, firstDay, today, onSolve, solving, error, history } = props
  const labelId = useId()
  const dateId = useId()

  return (
    <section aria-label="AI settings" className="flex flex-col gap-4 rounded-control bg-surface-muted p-4">
      <div>
        <p id={labelId} className="mb-1.5 text-sm font-bold text-ink-soft">
          Strategy
        </p>
        <div role="radiogroup" aria-labelledby={labelId} className="grid gap-1.5">
          {STRATEGIES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={option.id === strategy}
              onClick={() => onStrategy(option.id)}
              className={cn(
                'rounded-xl px-3 py-2 text-left transition-colors',
                option.id === strategy ? 'bg-(--accent) text-(--accent-ink)' : 'bg-surface text-ink ring-1 ring-line hover:ring-(--accent)',
              )}
            >
              <span className="block font-display text-sm font-semibold">{option.name}</span>
              <span className={cn('block text-xs', option.id === strategy ? 'opacity-90' : 'text-ink-soft')}>{option.summary}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label htmlFor={dateId} className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-bold text-ink-soft">
          Daily puzzle
          <input
            id={dateId}
            type="date"
            value={date}
            min={firstDay}
            max={today}
            onChange={(event) => event.target.value && onDate(event.target.value)}
            className="h-10 rounded-xl bg-surface px-3 font-sans text-ink ring-1 ring-line focus:ring-(--accent) focus:outline-none"
          />
        </label>
        <Button onClick={onSolve} disabled={solving} className="h-10">
          {solving ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Play aria-hidden className="size-4" />}
          Solve
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}

      <AiStatistics history={history} benchmark={props.benchmark} onBenchmark={props.onBenchmark} strategy={strategy} />
    </section>
  )
}

function AiStatistics({
  history,
  benchmark,
  onBenchmark,
  strategy,
}: Pick<AiControlsProps, 'history' | 'benchmark' | 'onBenchmark' | 'strategy'>) {
  const solved = history.filter((record) => record.solved)
  const average = solved.length ? (solved.reduce((sum, record) => sum + record.guesses, 0) / solved.length).toFixed(2) : '–'
  const name = STRATEGIES.find((option) => option.id === strategy)?.name
  const shown = benchmark?.strategy === strategy ? benchmark : null

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      <h3 className="font-display text-sm font-semibold">AI statistics</h3>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Games', history.length],
          ['Solved', solved.length],
          ['Avg guesses', average],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-surface px-2 py-1.5">
            <dt className="text-[0.65rem] font-bold tracking-wide text-ink-soft uppercase">{label}</dt>
            <dd className="font-display text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {history.length > 0 && (
        <ul aria-label="AI games this visit" className="flex max-h-28 flex-col gap-1 overflow-y-auto text-xs">
          {[...history].reverse().map((record, index) => (
            <li key={index} className="flex justify-between gap-2">
              <span className="truncate">
                #{record.puzzleNumber} · {STRATEGIES.find((option) => option.id === record.strategy)?.name}
              </span>
              <span className="font-bold tabular-nums">{record.solved ? `${record.guesses}/6` : 'X/6'}</span>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" variant="secondary" onClick={onBenchmark} disabled={shown?.loading}>
        {shown?.loading ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Gauge aria-hidden className="size-4" />}
        Test {name} on every word
      </Button>
      {shown?.result && (
        <p className="text-xs text-ink-soft" role="status">
          {name}: solved <strong className="text-ink">{shown.result.solved}</strong> of {shown.result.games} words,{' '}
          <strong className="text-ink">{shown.result.averageGuesses.toFixed(2)}</strong> guesses on average
          {shown.result.failed > 0 && `, ${shown.result.failed} missed`}.
        </p>
      )}
    </div>
  )
}
