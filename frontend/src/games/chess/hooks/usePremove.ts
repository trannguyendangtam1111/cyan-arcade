import { useCallback, useEffect, useRef, useState } from 'react'
import { otherSide, squareIndex } from '../engine/board'
import type { BoardPiece, MatchView, Side } from '../types/chessTypes'
import type { ChessController } from './useChessGame'

/** A move planned while Stockfish is to move, played once it is the player's turn (if still legal). */
export interface Premove {
  from: string
  to: string
}

/**
 * Premoves, in games against Stockfish only. While the engine is to move, the player may pick up one
 * of their pieces (click or drag) and put it on any square: that is a plan, kept here and drawn on
 * the board, and nothing reaches the server. When the engine has moved and it is the player's turn,
 * the plan is checked against the legal moves the server now lists: played once if legal (a pawn's
 * promotion piece is asked for, never guessed), dropped with a short note if not. A plan is for the
 * position after the engine's reply: if the game reaches the player's turn any other way (a takeback),
 * it is dropped, never played on a position it was not made for. Escape, the cancel button, a new game
 * and the end of the game clear it. Two-player games have none: there the side
 * to move is always one of the players at the board.
 */
export function usePremove(match: MatchView | null, game: ChessController, placement: readonly (BoardPiece | null)[], live: boolean) {
  const [premove, setPremove] = useState<Premove | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  // The plan in a ref too, so it is taken exactly once however state updates interleave.
  const planned = useRef<{ move: Premove; matchId: string; plannedAt: number } | null>(null)

  const player: Side | null = match?.engine ? otherSide(match.engine.side) : null
  /** Premoves are possible now: Stockfish's turn in a game against it, on the live board. */
  const active = player !== null && game.playing && game.engineTurn && live

  const clear = useCallback(() => {
    planned.current = null
    setPremove(null)
    setSelected(null)
  }, [])

  const own = useCallback((square: string) => player !== null && placement[squareIndex(square)]?.side === player, [placement, player])

  const queue = useCallback(
    (from: string, to: string) => {
      if (!match || from === to) return
      const move = { from, to }
      planned.current = { move, matchId: match.id, plannedAt: match.history.length }
      setPremove(move)
      setSelected(null)
    },
    [match],
  )

  /** A tap or click while Stockfish is to move: pick one of the player's pieces, then a square. */
  const select = useCallback(
    (square: string) => {
      if (selected && square !== selected) {
        if (own(square)) {
          setSelected(square)
          return
        }
        queue(selected, square)
        return
      }
      if (square === selected) {
        setSelected(null)
        return
      }
      if (own(square)) setSelected(square)
    },
    [own, queue, selected],
  )

  // A different match, or the end of this one, clears the plan.
  const matchId = match?.id ?? null
  const over = !game.playing
  useEffect(() => {
    const current = planned.current
    if (current && (current.matchId !== matchId || over)) {
      planned.current = null
      setPremove(null)
      setSelected(null)
    }
  }, [matchId, over])

  // Once it is the player's turn on the board the plan was made for, play it (once) or drop it.
  const revision = match?.revision
  useEffect(() => {
    const current = planned.current
    if (!current || !game.playerTurn || game.busy || current.matchId !== matchId) return
    const { from, to } = current.move
    if ((match?.history.length ?? 0) !== current.plannedAt + 1) {
      // Not the engine's reply to the position it was planned in (a takeback): not this plan's position.
      planned.current = null
      setPremove(null)
      setSelected(null)
      game.say(`The premove ${from}–${to} was cleared: the game was taken back.`, 'info')
      return
    }
    const outcome = game.playPlanned(from, to)
    if (outcome === 'wait') return
    planned.current = null
    setPremove(null)
    setSelected(null)
    if (outcome === 'illegal') game.say(`The premove ${from}–${to} was no longer legal, so it was cleared.`, 'info')
  }, [game, match, matchId, revision])

  return {
    premove,
    selected,
    active,
    /** Pieces that may be picked up for a premove: the player's own. */
    movable: own,
    select,
    queue,
    clear,
  }
}
