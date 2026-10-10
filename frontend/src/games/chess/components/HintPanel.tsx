import { Lightbulb, LogIn, X } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import type { HintAllowance, HintResponse } from '../types/chessTypes'

/** The hint Stockfish suggested, shown until the board changes or the player puts it away. */
export function HintCard({ hint, onDismiss }: { hint: HintResponse; onDismiss: () => void }) {
  const [, ...rest] = hint.line
  return (
    <div role="status" className="flex w-full items-start gap-2 rounded-control bg-[#d1fae5] px-3 py-2 text-[#064e3b] ring-1 ring-[#6ee7b7]">
      <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          Hint: <span className="font-mono">{hint.move.san}</span>
          <span className="sr-only"> (from {hint.move.from} to {hint.move.to})</span>
        </p>
        {rest.length > 0 && (
          <p className="truncate text-sm opacity-80">
            Stockfish expects: <span className="font-mono">{rest.join(' ')}</span>
          </p>
        )}
        <p className="text-xs opacity-70">A suggestion only: your move is still yours to choose.</p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Hide the hint" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-black/5">
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}

interface HintButtonProps {
  allowance: HintAllowance
  /** Whether a hint can be asked for now: the game on, the player's turn, nothing in flight. */
  enabled: boolean
  onHint: () => void
  loginPath: string
}

/** Asks Stockfish for a hint; shows what is left of the server's per-game allowance. */
export function HintButton({ allowance, enabled, onHint, loginPath }: HintButtonProps) {
  if (!allowance.allowed) {
    return (
      <Link to={loginPath} className="inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:text-brand-900">
        <LogIn aria-hidden className="size-4" />
        Log in for move hints
      </Link>
    )
  }
  const left = allowance.remaining
  const none = left !== null && left <= 0
  return (
    <Button size="sm" variant="secondary" onClick={onHint} disabled={!enabled || none} aria-describedby="chess-hints-left">
      <Lightbulb aria-hidden className="size-4" />
      Hint
      <span id="chess-hints-left" className="text-xs font-semibold text-ink-soft">
        {left === null ? '(no limit)' : none ? '(none left)' : `(${left} left)`}
      </span>
    </Button>
  )
}
