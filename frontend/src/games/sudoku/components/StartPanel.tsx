import { Pause, Play, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { formatClock } from '../engine/format'
import { DIFFICULTIES, DIFFICULTY_LABELS, type Difficulty, type DifficultyInfo } from '../types/sudokuTypes'

/** What covers the board when it cannot be played yet: a start, a pick-up after a reload, or a pause. */
export type Cover =
  | { kind: 'daily'; puzzleNumber: number; difficulty: Difficulty }
  | { kind: 'practice'; difficulties: DifficultyInfo[]; cancellable: boolean }
  | { kind: 'continue'; elapsedMs: number }
  | { kind: 'paused' }

interface StartPanelProps {
  cover: Cover
  busy: boolean
  onStart: (practice?: { difficulty: Difficulty; relaxed: boolean }) => void
  onResume: () => void
  /** Back to the game in progress, from the practice picker. */
  onCancel: () => void
}

/**
 * Sits over the hidden board. The clock only starts when the player does, so the puzzle is not shown
 * before: a daily puzzle cannot be studied for free.
 */
export function StartPanel({ cover, busy, onStart, onResume, onCancel }: StartPanelProps) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center rounded-[1rem] bg-surface/85 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-[19rem] flex-col items-center gap-3 text-center">
        {cover.kind === 'daily' && (
          <>
            <Sparkles aria-hidden className="size-8 text-brand-600" />
            <h2 className="font-display text-xl font-semibold">Daily Sudoku #{cover.puzzleNumber}</h2>
            <p className="text-sm text-ink-soft">
              {DIFFICULTY_LABELS[cover.difficulty]} today, the same puzzle for everyone. The clock starts when you do.
            </p>
            <Button onClick={() => onStart()} disabled={busy}>
              <Play aria-hidden className="size-4" />
              Start
            </Button>
          </>
        )}
        {cover.kind === 'practice' && (
          <>
            <PracticePicker difficulties={cover.difficulties} busy={busy} onStart={onStart} />
            {cover.cancellable && (
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Back to my game
              </Button>
            )}
          </>
        )}
        {cover.kind === 'continue' && (
          <>
            <h2 className="font-display text-xl font-semibold">Welcome back</h2>
            <p className="text-sm text-ink-soft">Your game is where you left it, at {formatClock(cover.elapsedMs)}.</p>
            <Button onClick={onResume} disabled={busy}>
              <Play aria-hidden className="size-4" />
              Continue
            </Button>
          </>
        )}
        {cover.kind === 'paused' && (
          <>
            <Pause aria-hidden className="size-8 text-brand-600" />
            <h2 className="font-display text-xl font-semibold">Paused</h2>
            <p className="text-sm text-ink-soft">The clock is stopped and the board hidden.</p>
            <Button onClick={onResume} disabled={busy}>
              <Play aria-hidden className="size-4" />
              Resume
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

/** Difficulty, ranked or relaxed, and go. */
export function PracticePicker({
  difficulties,
  busy,
  onStart,
  initial = 'MEDIUM',
}: {
  difficulties: DifficultyInfo[]
  busy: boolean
  onStart: (practice: { difficulty: Difficulty; relaxed: boolean }) => void
  initial?: Difficulty
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>(initial)
  const [relaxed, setRelaxed] = useState(false)
  const labelId = useId()
  const par = difficulties.find((info) => info.id === difficulty)?.parSeconds
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <h2 id={labelId} className="font-display text-xl font-semibold">
        New practice puzzle
      </h2>
      <div role="radiogroup" aria-labelledby={labelId} className="grid w-full grid-cols-2 gap-1.5">
        {DIFFICULTIES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={difficulty === option}
            onClick={() => setDifficulty(option)}
            className={cn(
              'h-10 rounded-xl font-display text-sm font-semibold ring-2 transition-colors',
              difficulty === option ? 'bg-(--accent) text-(--accent-ink) ring-(--accent)' : 'bg-surface text-ink-soft ring-line hover:text-ink',
            )}
          >
            {DIFFICULTY_LABELS[option]}
          </button>
        ))}
      </div>
      {par !== undefined && <p className="text-xs text-ink-soft">Par time {Math.round(par / 60)} minutes.</p>}
      <label className="flex items-center gap-2 text-left text-sm">
        <input type="checkbox" checked={relaxed} onChange={(event) => setRelaxed(event.target.checked)} className="size-4 accent-brand-600" />
        <span>
          <strong className="text-ink">Relaxed</strong>: no score, no mistake limit; only repeats count as mistakes.
        </span>
      </label>
      <Button onClick={() => onStart({ difficulty, relaxed })} disabled={busy}>
        <Play aria-hidden className="size-4" />
        New game
      </Button>
    </div>
  )
}
