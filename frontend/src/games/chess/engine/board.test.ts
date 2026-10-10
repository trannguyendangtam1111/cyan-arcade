import { describe, expect, it } from 'vitest'
import { INITIAL_FEN, legal } from '@/test/chessServer'
import type { MatchView, PlayedMove } from '../types/chessTypes'
import { displayOrder, isLightSquare, materialLead, matchStatus, movePairs, movesBetween, parsePlacement, sortCaptured, squareIndex, squareName, targetsFrom } from './board'

const match = (overrides: Partial<MatchView>): MatchView => ({
  id: 'm',
  mode: 'LOCAL',
  status: 'ACTIVE',
  revision: 0,
  fen: INITIAL_FEN,
  turn: 'WHITE',
  fullmoveNumber: 1,
  halfmoveClock: 0,
  check: false,
  checkedKing: null,
  legalMoves: [],
  lastMove: null,
  history: [],
  captured: { WHITE: [], BLACK: [] },
  material: { WHITE: 39, BLACK: 39 },
  drawOffer: null,
  claimableDraw: null,
  repetitions: 1,
  canUndo: false,
  canRedo: false,
  engine: null,
  hints: { allowed: true, used: 0, limit: 3, remaining: 3 },
  result: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
})

describe('the board', () => {
  it('names squares the way the server numbers them', () => {
    expect(squareName(0)).toBe('a1')
    expect(squareName(7)).toBe('h1')
    expect(squareName(63)).toBe('h8')
    expect(squareIndex('e4')).toBe(28)
    expect(isLightSquare(squareIndex('h1'))).toBe(true)
    expect(isLightSquare(squareIndex('a1'))).toBe(false)
  })

  it('reads the pieces from a FEN', () => {
    const squares = parsePlacement(INITIAL_FEN)
    expect(squares[squareIndex('e1')]).toEqual({ side: 'WHITE', kind: 'k' })
    expect(squares[squareIndex('d8')]).toEqual({ side: 'BLACK', kind: 'q' })
    expect(squares[squareIndex('e4')]).toBeNull()
    expect(squares.filter(Boolean)).toHaveLength(32)

    const sparse = parsePlacement('k5N1/8/8/8/8/8/8/1R5K b - - 0 1')
    expect(sparse[squareIndex('g8')]).toEqual({ side: 'WHITE', kind: 'n' })
    expect(sparse[squareIndex('b1')]).toEqual({ side: 'WHITE', kind: 'r' })
    expect(sparse.filter(Boolean)).toHaveLength(4)
  })

  it('shows White at the bottom, or Black when turned round', () => {
    const white = displayOrder('WHITE').map(squareName)
    const black = displayOrder('BLACK').map(squareName)
    expect(white.slice(0, 2)).toEqual(['a8', 'b8'])
    expect(white.at(-1)).toBe('h1')
    expect(black.slice(0, 2)).toEqual(['h1', 'g1'])
    expect(black.at(-1)).toBe('a8')
    expect(new Set(black).size).toBe(64)
  })
})

describe('legal moves, as the server lists them', () => {
  const moves = [legal('e4d5', 'exd5'), legal('e4e5', 'e5'), legal('g7g8q', 'g8=Q+'), legal('g7g8n', 'g8=N')]

  it('mark captures, quiet moves and promotions from a square', () => {
    expect(targetsFrom(moves, 'e4')).toEqual(
      new Map([
        ['d5', { capture: true, promotion: false }],
        ['e5', { capture: false, promotion: false }],
      ]),
    )
    expect(targetsFrom(moves, 'g7').get('g8')).toEqual({ capture: false, promotion: true })
    expect(targetsFrom(moves, 'a2').size).toBe(0)
  })

  it('give one move between two squares, or one per promotion piece', () => {
    expect(movesBetween(moves, 'e4', 'd5').map((move) => move.uci)).toEqual(['e4d5'])
    expect(movesBetween(moves, 'g7', 'g8').map((move) => move.promotion)).toEqual(['q', 'n'])
    expect(movesBetween(moves, 'e4', 'e6')).toEqual([])
  })
})

describe('the score sheet', () => {
  const move = (ply: number, san: string): PlayedMove => ({ ply, color: ply % 2 ? 'WHITE' : 'BLACK', from: 'a1', to: 'a2', uci: 'a1a2', san })

  it('numbers moves in pairs', () => {
    expect(movePairs([move(1, 'e4'), move(2, 'e5'), move(3, 'Nf3')])).toEqual([
      { number: 1, white: move(1, 'e4'), black: move(2, 'e5') },
      { number: 2, white: move(3, 'Nf3'), black: null },
    ])
    expect(movePairs([])).toEqual([])
  })

  it('lists captures most valuable first and says who is ahead', () => {
    expect(sortCaptured(['p', 'q', 'n', 'p', 'r'])).toEqual(['q', 'r', 'n', 'p', 'p'])
    expect(materialLead({ WHITE: 39, BLACK: 36 })).toEqual({ side: 'WHITE', amount: 3 })
    expect(materialLead({ WHITE: 30, BLACK: 39 })).toEqual({ side: 'BLACK', amount: 9 })
    expect(materialLead({ WHITE: 39, BLACK: 39 })).toBeNull()
  })
})

describe('the status line', () => {
  it('says whose turn it is, and check', () => {
    expect(matchStatus(match({})).title).toBe('White to move')
    expect(matchStatus(match({ turn: 'BLACK', check: true })).title).toBe('Black is in check')
  })

  it('says how a game ended, from the server\'s result', () => {
    expect(matchStatus(match({ status: 'FINISHED', result: { winner: 'BLACK', termination: 'CHECKMATE', score: '0-1' } }))).toMatchObject({
      title: 'Checkmate! Black wins',
      tone: 'win',
    })
    expect(matchStatus(match({ status: 'FINISHED', result: { winner: 'WHITE', termination: 'RESIGNATION', score: '1-0' } })).detail).toBe(
      '1-0 · Black resigned',
    )
    for (const [termination, reason] of [
      ['STALEMATE', 'Stalemate'],
      ['INSUFFICIENT_MATERIAL', 'Insufficient material'],
      ['THREEFOLD_REPETITION', 'Threefold repetition'],
      ['FIVEFOLD_REPETITION', 'Fivefold repetition'],
      ['FIFTY_MOVE_RULE', '50-move rule'],
      ['SEVENTY_FIVE_MOVE_RULE', '75-move rule'],
      ['AGREEMENT', 'Draw agreed'],
    ] as const) {
      expect(matchStatus(match({ status: 'FINISHED', result: { winner: null, termination, score: '1/2-1/2' } }))).toEqual({
        title: 'Draw',
        detail: `1/2-1/2 · ${reason}`,
        tone: 'draw',
      })
    }
    expect(matchStatus(match({ status: 'ABANDONED' })).title).toBe('Game left')
  })
})
