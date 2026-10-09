import { BarChart3, Shuffle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatScore } from '@/lib/format'
import type { RunView } from '../types/wordleTypes'

const PRAISE = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!']

interface ResultPanelProps {
  run: RunView
  onStats: () => void
  onPractice: () => void
}

/** How a finished game went: the word, the score and what made it, and what to do next. */
export function ResultPanel({ run, onStats, onPractice }: ResultPanelProps) {
  const solved = run.status === 'SOLVED'
  const daily = run.mode === 'DAILY'
  const result = run.result
  const streak = result?.details.streak ?? 0

  return (
    <section
      aria-label="Result"
      className="flex w-full max-w-[32rem] flex-col items-center gap-3 rounded-card bg-surface-muted p-4 text-center motion-safe:animate-pop-in"
    >
      <h2 className="flex items-center gap-2 font-display text-2xl font-semibold">
        {solved && <Sparkles aria-hidden className="size-6 text-(--accent)" />}
        {solved ? PRAISE[run.guesses.length - 1] : 'So close!'}
      </h2>
      <p className="text-ink-soft">
        {solved ? (
          <>
            Solved in <strong className="text-ink">{run.guesses.length}</strong> of 6.
          </>
        ) : (
          <>
            The word was <strong className="font-display tracking-widest text-ink">{run.answer}</strong>.
          </>
        )}
      </p>
      {result && (
        <p className="text-sm">
          {daily ? 'Score' : 'Practice score'} <strong className="font-display text-lg text-ink">{formatScore(result.score)}</strong>
          {solved && run.hints.length > 0 && <span className="text-ink-soft"> · {result.hintPercent}% after {run.hints.length} hint{run.hints.length === 1 ? '' : 's'}</span>}
          {solved && daily && streak > 1 && <span className="text-ink-soft"> · {streak}-day streak bonus</span>}
          {!daily && <span className="block text-xs text-ink-soft">Practice games are for fun: no score is saved.</span>}
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {daily && (
          <Button variant="secondary" size="sm" onClick={onStats}>
            <BarChart3 aria-hidden className="size-4" />
            Statistics
          </Button>
        )}
        <Button size="sm" onClick={onPractice}>
          <Shuffle aria-hidden className="size-4" />
          {daily ? 'Practice a random word' : 'New word'}
        </Button>
      </div>
    </section>
  )
}
