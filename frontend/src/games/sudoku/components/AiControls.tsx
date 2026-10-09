import { LoaderCircle, Play, RotateCcw, SkipForward } from 'lucide-react'
import { useId } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import type { AiPuzzle, AiState } from '../hooks/useSudokuAi'
import { DIFFICULTIES, DIFFICULTY_LABELS, type AiSolution, type Strategy } from '../types/sudokuTypes'
import { STRATEGIES } from './strategies'


interface AiControlsProps {
  strategy: Strategy
  onStrategy: (strategy: Strategy) => void
  puzzle: AiPuzzle
  onPuzzle: (puzzle: AiPuzzle) => void
  state: AiState
  solution: AiSolution | null
  played: number
  error: string | null
  onSolve: () => void
  onStep: () => void
  onRestart: () => void
}

/** Admins only: which strategy, which puzzle, solve, and step through the moves. */
export function AiControls({ strategy, onStrategy, puzzle, onPuzzle, state, solution, played, error, onSolve, onStep, onRestart }: AiControlsProps) {
  const strategyLabel = useId()
  const puzzleLabel = useId()
  return (
    <section aria-label="AI solver" className="flex flex-col gap-3 rounded-control bg-surface-muted p-3">
      <div>
        <p id={strategyLabel} className="mb-1.5 text-sm font-bold text-ink-soft">
          Strategy
        </p>
        <div role="radiogroup" aria-labelledby={strategyLabel} className="flex flex-col gap-1">
          {STRATEGIES.map(({ id, label, text }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={strategy === id}
              onClick={() => onStrategy(id)}
              disabled={state === 'loading'}
              className={cn(
                'rounded-xl px-3 py-2 text-left ring-2 transition-colors',
                strategy === id ? 'bg-(--accent) text-(--accent-ink) ring-(--accent)' : 'bg-surface ring-transparent hover:ring-line',
              )}
            >
              <span className="block text-sm font-bold">{label}</span>
              <span className="block text-xs opacity-80">{text}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <p id={puzzleLabel} className="mb-1.5 text-sm font-bold text-ink-soft">
          Puzzle
        </p>
        <div role="radiogroup" aria-labelledby={puzzleLabel} className="grid grid-cols-5 gap-1">
          {(['DAILY', ...DIFFICULTIES] as AiPuzzle[]).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={puzzle === option}
              onClick={() => onPuzzle(option)}
              className={cn(
                'h-9 rounded-lg text-xs font-bold transition-colors',
                puzzle === option ? 'bg-(--accent) text-(--accent-ink)' : 'bg-surface text-ink-soft ring-1 ring-line hover:text-ink',
              )}
            >
              {option === 'DAILY' ? 'Daily' : DIFFICULTY_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onSolve} disabled={state === 'loading'} className="flex-1">
          {state === 'loading' ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Play aria-hidden className="size-4" />}
          Solve
        </Button>
        <Button variant="secondary" onClick={onStep} disabled={!solution || played >= (solution?.moves.length ?? 0)}>
          <SkipForward aria-hidden className="size-4" />
          Step
        </Button>
        <Button variant="secondary" onClick={onRestart} disabled={!solution} aria-label="Replay from the start">
          <RotateCcw aria-hidden className="size-4" />
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {solution && (
        <p className="text-xs text-ink-soft">
          Move {played} of {solution.moves.length} ·{' '}
          {solution.strategy === 'FAST'
            ? `${solution.guesses} guesses, ${solution.backtracks} dead ends`
            : `${Object.keys(solution.techniques).length} techniques${solution.searched ? `, ${solution.searched} placed by search` : ''}`}{' '}
          · solved in {solution.millis} ms
        </p>
      )}
    </section>
  )
}
