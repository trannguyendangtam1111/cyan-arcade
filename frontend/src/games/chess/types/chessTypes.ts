/**
 * Chess as the server describes it. The server owns the rules: the board, whose turn it is, the
 * legal moves and how the game ended all come from it, and the screen only shows them.
 */

export type Side = 'WHITE' | 'BLACK'

/** FEN letters, lower case: pawn, knight, bishop, rook, queen, king. */
export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

export interface BoardPiece {
  side: Side
  kind: PieceKind
}

export type Termination =
  | 'CHECKMATE'
  | 'STALEMATE'
  | 'INSUFFICIENT_MATERIAL'
  | 'FIVEFOLD_REPETITION'
  | 'SEVENTY_FIVE_MOVE_RULE'
  | 'RESIGNATION'
  | 'AGREEMENT'
  | 'THREEFOLD_REPETITION'
  | 'FIFTY_MOVE_RULE'

export type DrawAction = 'OFFER' | 'ACCEPT' | 'DECLINE' | 'CLAIM'

/** A move the side to move may make, with its notation and what kind of move it is. */
export interface LegalMove {
  from: string
  to: string
  promotion: PromotionPiece | null
  uci: string
  san: string
  capture: boolean
  castling: boolean
  enPassant: boolean
}

export interface PlayedMove {
  /** 1 for White's first move, 2 for Black's reply, … */
  ply: number
  color: Side
  from: string
  to: string
  uci: string
  san: string
}

export interface MatchResult {
  /** `null` for a draw. */
  winner: Side | null
  termination: Termination
  /** `1-0`, `0-1` or `1/2-1/2`. */
  score: string
}

/** A match, from `/api/chess/matches`. */
export interface MatchView {
  id: string
  /** Two players on one device, or one player against Stockfish (admins). */
  mode: 'LOCAL' | 'AI'
  status: 'ACTIVE' | 'FINISHED' | 'ABANDONED'
  /** Goes up with every change; every action sends the revision it was chosen in. */
  revision: number
  fen: string
  turn: Side
  fullmoveNumber: number
  halfmoveClock: number
  check: boolean
  /** The square of the king in check, or `null`. */
  checkedKing: string | null
  /** Empty once the match is over. */
  legalMoves: LegalMove[]
  lastMove: PlayedMove | null
  history: PlayedMove[]
  /** By side, the pieces it has taken. */
  captured: Record<Side, PieceKind[]>
  /** By side, the value of its pieces on the board. */
  material: Record<Side, number>
  drawOffer: Side | null
  claimableDraw: Termination | null
  repetitions: number
  canUndo: boolean
  canRedo: boolean
  /** For a game against Stockfish: its side and difficulty. */
  engine: EngineSide | null
  /** The caller's move hints in this match, as the server counts them. */
  hints: HintAllowance
  result: MatchResult | null
  createdAt: string
  updatedAt: string
}

export type Difficulty = 'BEGINNER' | 'CASUAL' | 'CLUB' | 'ADVANCED' | 'MAXIMUM'

export interface EngineSide {
  side: Side
  difficulty: Difficulty
  label: string
  /** What the engine is set to, in its own terms (`Elo setting 1600`): a target, not a promise. */
  setting: string
}

export interface HintAllowance {
  /** Guests may not ask for hints. */
  allowed: boolean
  used: number
  /** `null`: no limit (admins). */
  limit: number | null
  remaining: number | null
}

/** A move the engine suggests, checked by the server against the position. */
export interface SuggestedMove {
  from: string
  to: string
  promotion: PromotionPiece | null
  uci: string
  san: string
}

export interface HintResponse {
  /** The revision of the position the hint is for. */
  revision: number
  move: SuggestedMove
  /** The engine's expected continuation in SAN, the hint first. */
  line: string[]
  depth: number
  engine: string
  hints: HintAllowance
}

/** An evaluation, always from White's side. Mates are kept apart from centipawns. */
export interface Evaluation {
  kind: 'CENTIPAWNS' | 'MATE'
  centipawns: number
  mateIn: number | null
  matingSide: Side | null
  /** `+0.34`, `#3`, `#-2`, `1-0`… */
  display: string
  whiteWinPercent: number
  favoured: Side | null
  /** `false` when the engine reported only a bound. */
  exact: boolean
}

export interface AnalysisLine {
  rank: number
  evaluation: Evaluation
  san: string[]
  uci: string[]
  depth: number
}

export interface EvaluationResponse {
  revision: number
  sideToMove: Side
  evaluation: Evaluation
  bestMove: SuggestedMove | null
  lines: AnalysisLine[]
  depth: number
  requestedDepth: number
  /** `false`: the search was cut short; the numbers are provisional. */
  complete: boolean
  /** The game is over: the evaluation is its result, not a search. */
  finished: boolean
  engine: string | null
}

export type MoveClass = 'BEST' | 'EXCELLENT' | 'GOOD' | 'INACCURACY' | 'MISTAKE' | 'BLUNDER' | 'FORCED' | 'UNRATED'

export interface ReviewedMove {
  ply: number
  color: Side
  uci: string
  san: string
  from: string
  to: string
  fenBefore: string
  fenAfter: string
  best: SuggestedMove | null
  bestLine: string[]
  before: Evaluation
  after: Evaluation
  classification: MoveClass
  /** The mover's lost winning chances, in percentage points. */
  loss: number | null
  depth: number
}

export type ReviewStatus = 'QUEUED' | 'RUNNING' | 'DONE' | 'CANCELLED' | 'FAILED'

export interface ReviewResponse {
  matchId: string
  status: ReviewStatus
  analyzed: number
  total: number
  /** Only the moves both of whose positions are analysed. */
  moves: ReviewedMove[]
  engine: string | null
  settings: { movetimeMs: number; depth: number; minDepth: number }
  error: string | null
}

export interface DifficultyOption {
  id: Difficulty
  label: string
  setting: string
  movetimeMs: number
}

export interface EngineStatus {
  available: boolean
  engine: string | null
  difficulties: DifficultyOption[]
  defaultDepth: number
  maxDepth: number
  maxLines: number
  hintsPerGame: number
}
