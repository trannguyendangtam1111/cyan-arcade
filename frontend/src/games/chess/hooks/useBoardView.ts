import { useCallback, useState, type KeyboardEvent } from 'react'
import type { AnalysisLine, MatchView, PlayedMove } from '../types/chessTypes'

/** A principal variation being looked through: the moves of a line from a position of the game. */
export interface Variation {
  /** The ply of the game the line starts from. */
  basePly: number
  line: AnalysisLine
  /** How many of the line's moves are on the board (1 for its first move). */
  index: number
}

/** Where the board is, in words: the live game, the start, or the move being looked at. */
export function viewName(viewPly: number, live: boolean, history: readonly PlayedMove[]): string {
  if (live) return 'Live'
  if (viewPly === 0) return 'Start position'
  const move = history[viewPly - 1]
  return `Reviewing move ${Math.ceil(viewPly / 2)}${viewPly % 2 === 0 ? '…' : '.'} ${move?.san ?? ''}`.trim()
}

/** What the board shows: a position of the game (a ply), or a position of a variation. */
export interface BoardView {
  /** 0 for the start, `history.length` for the position now. */
  ply: number
  live: boolean
  variation: Variation | null
  fen: string
  lastMove: { from: string; to: string } | null
  /** A stable name for the position on the board (drawings belong to it). */
  key: string
  /** Moves played in the game since the player started looking back (0 while live). */
  newMoves: number
}

/** Keys the move list and the board's frame use to step through a game. */
const STEP_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'])

/** Whether a key press belongs to a control that has its own use for it (a text field, a list…). */
export function ownsKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.closest('dialog[open]')) return true
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return true
  // Squares move focus among themselves with the arrow keys.
  return target.getAttribute('role') === 'gridcell'
}

function fenAt(match: MatchView, ply: number): string {
  return ply === 0 ? match.startFen : (match.history[ply - 1]?.fen ?? match.fen)
}

function moveAt(history: readonly PlayedMove[], ply: number) {
  const move = history[ply - 1]
  return move ? { from: move.from, to: move.to } : null
}

/**
 * Which position the board shows, apart from the game itself: following the game (live), an earlier
 * position, or a line the engine suggests. Looking around never changes the match: the board only
 * takes moves while it shows the position now. The positions come from the server, with the moves.
 */
export function useBoardView(match: MatchView | null) {
  // `null`: follow the game as it goes.
  const [chosen, setChosen] = useState<{ matchId: string; ply: number; latest: number } | null>(null)
  const [variation, setVariation] = useState<(Variation & { matchId: string }) | null>(null)

  const latest = match?.history.length ?? 0
  // A choice belongs to its match, and to plies that still exist (a takeback can remove them).
  const ply = chosen && match && chosen.matchId === match.id && chosen.ply <= latest ? chosen.ply : latest
  const shownVariation = variation && match && variation.matchId === match.id && variation.basePly <= latest ? variation : null
  const live = ply === latest && shownVariation === null
  // A move that arrived while looking back (the engine's, another tab's), or a takeback that removed some.
  const newMoves = chosen && match && chosen.matchId === match.id && chosen.ply <= latest ? Math.max(0, latest - chosen.latest) : 0

  const go = useCallback(
    (next: number) => {
      if (!match) return
      setVariation(null)
      const clamped = Math.max(0, Math.min(match.history.length, next))
      setChosen(clamped === match.history.length ? null : { matchId: match.id, ply: clamped, latest: match.history.length })
    },
    [match],
  )

  const enterVariation = useCallback(
    (basePly: number, line: AnalysisLine, index = 1) => {
      if (!match || line.uci.length === 0) return
      setVariation({ matchId: match.id, basePly, line, index: Math.max(1, Math.min(line.uci.length, index)) })
    },
    [match],
  )

  const exitVariation = useCallback(() => setVariation(null), [])

  /** Steps within a variation, or through the game when there is none. */
  const step = useCallback(
    (direction: 1 | -1) => {
      if (shownVariation) {
        const next = shownVariation.index + direction
        if (next < 1) setVariation(null)
        else if (next <= shownVariation.line.uci.length) setVariation({ ...shownVariation, index: next })
        return
      }
      go(ply + direction)
    },
    [go, ply, shownVariation],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!STEP_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey || ownsKeys(event.target)) return
      event.preventDefault()
      if (event.key === 'ArrowLeft') step(-1)
      else if (event.key === 'ArrowRight') step(1)
      else if (event.key === 'ArrowUp' || event.key === 'Home') go(0)
      else go(latest)
    },
    [go, latest, step],
  )

  let view: BoardView | null = null
  if (match) {
    if (shownVariation) {
      const { line, index, basePly } = shownVariation
      const uci = line.uci[index - 1]
      view = {
        ply: basePly,
        live: false,
        variation: shownVariation,
        fen: line.fens[index - 1],
        lastMove: { from: uci.slice(0, 2), to: uci.slice(2, 4) },
        key: `${match.id}:${basePly}:${line.uci.slice(0, index).join(' ')}`,
        newMoves,
      }
    } else {
      view = { ply, live, variation: null, fen: live ? match.fen : fenAt(match, ply), lastMove: moveAt(match.history, ply), key: `${match.id}:${ply}`, newMoves: live ? 0 : newMoves }
    }
  }

  return { view, go, step, enterVariation, exitVariation, onKeyDown }
}
