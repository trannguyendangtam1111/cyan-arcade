import type { BoardPiece, LegalMove, MatchView, PieceKind, PlayedMove, PromotionPiece, Side, Termination } from '../types/chessTypes'

/**
 * How the screen lays out what the server says. Nothing here knows the rules of chess: where a
 * piece may go, whether a king is in check and how a game ended all come with the match, and these
 * helpers only arrange that for the board, the move list and the status line.
 *
 * Squares are numbered as on the server: `rank * 8 + file`, so a1 is 0 and h8 is 63.
 */

export const FILES = 'abcdefgh'

export const SIDES: readonly Side[] = ['WHITE', 'BLACK']

export const PROMOTION_PIECES: readonly PromotionPiece[] = ['q', 'r', 'b', 'n']

const PIECE_NAMES: Record<PieceKind, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

/** Captured pieces are listed most valuable first. */
const PIECE_ORDER: Record<PieceKind, number> = { q: 0, r: 1, b: 2, n: 3, p: 4, k: 5 }

export function squareName(square: number): string {
  return `${FILES[square % 8]}${Math.floor(square / 8) + 1}`
}

export function squareIndex(name: string): number {
  return (Number(name[1]) - 1) * 8 + FILES.indexOf(name[0])
}

export function fileOf(square: number): number {
  return square % 8
}

export function rankOf(square: number): number {
  return Math.floor(square / 8)
}

/** h1 is a light square, a1 a dark one. */
export function isLightSquare(square: number): boolean {
  return (fileOf(square) + rankOf(square)) % 2 === 1
}

export function sideName(side: Side): string {
  return side === 'WHITE' ? 'White' : 'Black'
}

export function otherSide(side: Side): Side {
  return side === 'WHITE' ? 'BLACK' : 'WHITE'
}

export function pieceName(piece: BoardPiece): string {
  return `${sideName(piece.side).toLowerCase()} ${PIECE_NAMES[piece.kind]}`
}

export function kindName(kind: PieceKind): string {
  return PIECE_NAMES[kind]
}

/** The 64 squares from a FEN's first field, `null` where empty. */
export function parsePlacement(fen: string): (BoardPiece | null)[] {
  const squares: (BoardPiece | null)[] = Array<BoardPiece | null>(64).fill(null)
  const rows = fen.split(' ')[0].split('/')
  rows.forEach((row, index) => {
    const rank = 7 - index
    let file = 0
    for (const letter of row) {
      if (letter >= '1' && letter <= '8') {
        file += Number(letter)
        continue
      }
      const kind = letter.toLowerCase() as PieceKind
      squares[rank * 8 + file] = { side: letter === kind ? 'BLACK' : 'WHITE', kind }
      file++
    }
  })
  return squares
}

/**
 * The squares in the order the screen shows them, row by row from the top left: White's view has
 * a8 there, Black's view h1.
 */
export function displayOrder(orientation: Side): number[] {
  const squares: number[] = []
  for (let row = 0; row < 8; row++) {
    for (let column = 0; column < 8; column++) {
      squares.push(orientation === 'WHITE' ? (7 - row) * 8 + column : row * 8 + (7 - column))
    }
  }
  return squares
}

export interface Target {
  capture: boolean
  /** The move needs a piece chosen for the pawn. */
  promotion: boolean
}

/** Where the piece on a square may go, by the server's list of legal moves. */
export function targetsFrom(legalMoves: readonly LegalMove[], from: string): Map<string, Target> {
  const targets = new Map<string, Target>()
  for (const move of legalMoves) {
    if (move.from !== from) continue
    targets.set(move.to, { capture: move.capture, promotion: move.promotion !== null })
  }
  return targets
}

/** Whether the piece on a square has a legal move. */
export function canMoveFrom(legalMoves: readonly LegalMove[], from: string): boolean {
  return legalMoves.some((move) => move.from === from)
}

/** The legal moves from one square to another: one, or one per piece a promoting pawn may become. */
export function movesBetween(legalMoves: readonly LegalMove[], from: string, to: string): LegalMove[] {
  return legalMoves.filter((move) => move.from === from && move.to === to)
}

export interface MovePair {
  number: number
  white: PlayedMove | null
  black: PlayedMove | null
}

/** Moves numbered as a score sheet writes them: `1. e4 e5`. */
export function movePairs(history: readonly PlayedMove[]): MovePair[] {
  const pairs: MovePair[] = []
  for (const move of history) {
    const number = Math.ceil(move.ply / 2)
    let pair = pairs[pairs.length - 1]
    if (!pair || pair.number !== number) {
      pair = { number, white: null, black: null }
      pairs.push(pair)
    }
    if (move.color === 'WHITE') pair.white = move
    else pair.black = move
  }
  return pairs
}

/** Captured pieces, most valuable first. */
export function sortCaptured(pieces: readonly PieceKind[]): PieceKind[] {
  return [...pieces].sort((a, b) => PIECE_ORDER[a] - PIECE_ORDER[b])
}

/** How far a side is ahead in material, or `null` for level. */
export function materialLead(material: Record<Side, number>): { side: Side; amount: number } | null {
  const difference = material.WHITE - material.BLACK
  if (difference === 0) return null
  return { side: difference > 0 ? 'WHITE' : 'BLACK', amount: Math.abs(difference) }
}

const DRAW_REASONS: Partial<Record<Termination, string>> = {
  STALEMATE: 'Stalemate',
  INSUFFICIENT_MATERIAL: 'Insufficient material',
  FIVEFOLD_REPETITION: 'Fivefold repetition',
  SEVENTY_FIVE_MOVE_RULE: '75-move rule',
  AGREEMENT: 'Draw agreed',
  THREEFOLD_REPETITION: 'Threefold repetition',
  FIFTY_MOVE_RULE: '50-move rule',
}

/** What a claimable draw is called on its button. */
export function claimName(termination: Termination): string {
  return termination === 'FIFTY_MOVE_RULE' ? 'the 50-move rule' : 'threefold repetition'
}

export interface Status {
  title: string
  detail: string
  tone: 'turn' | 'check' | 'win' | 'draw' | 'left'
}

/** The line above the board: whose turn, check, or how the match ended. */
export function matchStatus(match: MatchView): Status {
  const result = match.result
  if (result) {
    if (result.winner) {
      const winner = sideName(result.winner)
      return result.termination === 'CHECKMATE'
        ? { title: `Checkmate! ${winner} wins`, detail: `${result.score} · the king has no way out`, tone: 'win' }
        : { title: `${winner} wins`, detail: `${result.score} · ${sideName(otherSide(result.winner))} resigned`, tone: 'win' }
    }
    const reason = DRAW_REASONS[result.termination] ?? 'Draw'
    return { title: 'Draw', detail: `${result.score} · ${reason}`, tone: 'draw' }
  }
  if (match.status === 'ABANDONED') {
    return { title: 'Game left', detail: 'A new game was started instead', tone: 'left' }
  }
  const side = sideName(match.turn)
  if (match.check) {
    return { title: `${side} is in check`, detail: `${side} to move: the king must be saved`, tone: 'check' }
  }
  return { title: `${side} to move`, detail: `Move ${match.fullmoveNumber}`, tone: 'turn' }
}
