import { apiFetch } from '@/api/client'
import { playerHeaders } from '@/lib/playerId'
import type { Difficulty, DrawAction, EngineStatus, EvaluationResponse, HintResponse, MatchView, ReviewResponse, Side } from '../types/chessTypes'

/**
 * Chess's own endpoints. Chess is played on the server, which judges every move; a match is not
 * scored, so nothing here touches game sessions or rewards. A guest is recognised by the same id
 * their other games carry. Every change names the revision it was chosen in, so a stale one is
 * refused instead of landing on a position the player did not see.
 */

export const STALE_REVISION = 'STALE_REVISION'
export const MATCH_OVER = 'MATCH_OVER'
export const ILLEGAL_MOVE = 'ILLEGAL_MOVE'

const matchPath = (id: string, action?: string) =>
  `/api/chess/matches/${encodeURIComponent(id)}${action ? `/${action}` : ''}`

/** The player's match in progress, else their last finished one; `undefined` when there is none. */
export function fetchCurrentMatch(signal?: AbortSignal): Promise<MatchView | undefined> {
  return apiFetch<MatchView | undefined>('/api/chess/matches/current', { headers: playerHeaders(), signal })
}

export function fetchMatch(id: string, signal?: AbortSignal): Promise<MatchView> {
  return apiFetch<MatchView>(matchPath(id), { headers: playerHeaders(), signal })
}

/** A new two-player match on this device. The match in progress, if any, is left. */
export function startMatch(): Promise<MatchView> {
  return apiFetch<MatchView>('/api/chess/matches', { method: 'POST', body: { mode: 'LOCAL' }, headers: playerHeaders() })
}

/** A move in UCI: `e2e4`, `e7e8q`. */
export function sendMove(id: string, revision: number, move: string): Promise<MatchView> {
  return apiFetch<MatchView>(matchPath(id, 'moves'), { method: 'POST', body: { revision, move }, headers: playerHeaders() })
}

export function undoMove(id: string, revision: number): Promise<MatchView> {
  return apiFetch<MatchView>(matchPath(id, 'undo'), { method: 'POST', body: { revision }, headers: playerHeaders() })
}

export function redoMove(id: string, revision: number): Promise<MatchView> {
  return apiFetch<MatchView>(matchPath(id, 'redo'), { method: 'POST', body: { revision }, headers: playerHeaders() })
}

export function resign(id: string, revision: number, side: Side): Promise<MatchView> {
  return apiFetch<MatchView>(matchPath(id, 'resign'), { method: 'POST', body: { revision, side }, headers: playerHeaders() })
}

export function draw(id: string, revision: number, action: DrawAction, side: Side): Promise<MatchView> {
  return apiFetch<MatchView>(matchPath(id, 'draw'), {
    method: 'POST',
    body: { revision, action, side },
    headers: playerHeaders(),
  })
}

// --- Stockfish -----------------------------------------------------------------------------------

export const HINT_LIMIT_REACHED = 'HINT_LIMIT_REACHED'

/**
 * A move hint for the current position. Signed-in players only; a player has a few per game, which
 * the server counts. It changes nothing on the board.
 */
export function requestHint(id: string, revision: number, signal?: AbortSignal): Promise<HintResponse> {
  return apiFetch<HintResponse>(matchPath(id, 'hint'), { method: 'POST', body: { revision }, headers: playerHeaders(), signal })
}

/**
 * Admins only from here on: the server answers anyone else with 401 or 403. The engine's moves,
 * evaluations and reviews are worked out on the server from the match it keeps; nothing here sends
 * a position.
 */
const aiPath = (id: string, action: string) => `/api/ai/chess/matches/${encodeURIComponent(id)}/${action}`

export function fetchEngineStatus(signal?: AbortSignal): Promise<EngineStatus> {
  return apiFetch<EngineStatus>('/api/ai/chess/engine', { signal })
}

/** A game against Stockfish, the player on `playerSide`. The match in progress, if any, is left. */
export function startEngineGame(playerSide: Side, difficulty: Difficulty): Promise<MatchView> {
  return apiFetch<MatchView>('/api/ai/chess/matches', { method: 'POST', body: { playerSide, difficulty } })
}

/** Has Stockfish play its move; a failure changes nothing and can be retried. */
export function requestEngineMove(id: string, revision: number): Promise<MatchView> {
  return apiFetch<MatchView>(aiPath(id, 'engine-move'), { method: 'POST', body: { revision } })
}

export function evaluatePosition(id: string, revision: number, depth: number, lines: number, signal?: AbortSignal): Promise<EvaluationResponse> {
  return apiFetch<EvaluationResponse>(aiPath(id, 'evaluation'), { method: 'POST', body: { revision, depth, lines }, signal })
}

export function startReview(id: string): Promise<ReviewResponse> {
  return apiFetch<ReviewResponse>(aiPath(id, 'review'), { method: 'POST' })
}

export function fetchReview(id: string, signal?: AbortSignal): Promise<ReviewResponse> {
  return apiFetch<ReviewResponse>(aiPath(id, 'review'), { signal })
}

export function cancelReview(id: string): Promise<ReviewResponse> {
  return apiFetch<ReviewResponse>(aiPath(id, 'review'), { method: 'DELETE' })
}
