import { LoaderCircle, LogIn, RotateCcw } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import type { CoachEntry } from '../hooks/useCoach'
import type { PlayedMove, ReviewedMove } from '../types/chessTypes'
import { MoveFeedback } from './MoveFeedback'

interface CoachPanelProps {
  /** Signed in: guests get a way to sign in instead. */
  allowed: boolean
  enabled: boolean
  loginPath: string
  /** The move the feedback is about: the one on the board, else the latest. */
  move: PlayedMove | null
  /** The game review's judgement of that move, which comes first when there is one. */
  reviewed: ReviewedMove | null
  /** Coach Mode's own (quick) judgement, or where it stands. */
  entry: CoachEntry | null
  bestShown: boolean
  onShowBest: (ply: number) => void
  onRetry: (ply: number) => void
}

/**
 * The feedback on one move, in a small space: the review's judgement if the game has been reviewed,
 * else Coach Mode's quick one, marked as such. A judgement still on its way is shown as pending,
 * never as a label; a failed one can be asked for again.
 */
export function CoachPanel({ allowed, enabled, loginPath, move, reviewed, entry, bestShown, onShowBest, onRetry }: CoachPanelProps) {
  if (!allowed) {
    return (
      <section aria-label="Coach" className="rounded-control bg-surface-muted p-3">
        <Link to={loginPath} className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-900">
          <LogIn aria-hidden className="size-4" />
          Log in for Coach Mode
        </Link>
      </section>
    )
  }
  if (!enabled && !reviewed) return null
  const number = move ? `${Math.ceil(move.ply / 2)}${move.color === 'WHITE' ? '.' : '…'} ${move.san}` : ''
  let body
  if (reviewed) body = <MoveFeedback move={reviewed} source="review" onShowBest={() => onShowBest(reviewed.ply)} bestShown={bestShown} />
  else if (!move) body = <p className="text-sm text-ink-soft">Make a move: the coach rates it here.</p>
  else if (!entry) body = <p className="text-sm text-ink-soft">{number} was played before the coach was on.</p>
  else if (entry.status === 'pending') {
    body = (
      <p role="status" className="flex items-center gap-2 text-sm text-ink-soft">
        <LoaderCircle aria-hidden className="size-4 animate-spin" />
        Rating {number}…
      </p>
    )
  } else if (entry.status !== 'done' || !entry.move) {
    body = (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p role="alert" className="font-semibold text-rose-700">
          {entry.status === 'limited' ? 'The coach has rated many moves this minute.' : 'The coach could not rate this move.'} {entry.error}
        </p>
        <Button size="sm" variant="secondary" onClick={() => onRetry(move.ply)}>
          <RotateCcw aria-hidden className="size-4" />
          Try again
        </Button>
      </div>
    )
  } else {
    const judged = entry.move
    body = <MoveFeedback move={judged} source="quick" onShowBest={() => onShowBest(judged.ply)} bestShown={bestShown} />
  }
  return (
    <section aria-label="Coach" className="flex flex-col gap-2 rounded-control bg-surface-muted p-3" aria-live="polite" data-testid="coach-feedback">
      {body}
    </section>
  )
}
