import { MOVES, type Move } from '../engine/game2048Engine'
import { emptyCells, evaluate, slideRows, withTile, type Rows } from './bitboard'

/**
 * Expectimax search for 2048.
 *
 * The game alternates between the player choosing a move and the game placing a random tile, so
 * the search tree alternates two kinds of node:
 *
 *  - max node:    the player moves. Value = the best value among the legal moves.
 *  - chance node: a tile spawns. Value = the probability-weighted average over every empty cell
 *                 and both tile values (a 2 with 90%, a 4 with 10%).
 *
 * The tree is cut off after `depth` spawns and the board there is scored by the heuristic.
 * Three things keep the work bounded:
 *  - a fixed depth,
 *  - pruning branches that are too improbable to matter (mostly long chains of 4-spawns),
 *  - a transposition table, because different move orders often reach the same board.
 */

const TWO_PROBABILITY = 0.9
const FOUR_PROBABILITY = 0.1
/** Branches less likely than this are scored by the heuristic instead of being searched. */
const MIN_BRANCH_PROBABILITY = 0.0005

/** Transposition table: fixed size, overwritten on collision, validated by the full board. */
const TABLE_BITS = 17
const TABLE_MASK = (1 << TABLE_BITS) - 1
const tableTop = new Uint32Array(1 << TABLE_BITS)
const tableBottom = new Uint32Array(1 << TABLE_BITS)
const tableDepth = new Int8Array(1 << TABLE_BITS)
const tableStamp = new Uint32Array(1 << TABLE_BITS)
const tableValue = new Float64Array(1 << TABLE_BITS)
/** Bumped for every search, which invalidates all older entries without clearing the arrays. */
let currentStamp = 0

export interface SearchResult {
  /** `null` when the game is over and no move is possible. */
  best: Move | null
  /** Expected value of each move; `null` for illegal moves. */
  values: Record<Move, number | null>
  /** How many random tile spawns the search looked past. */
  depth: number
  /** Boards examined, as a measure of effort. */
  nodes: number
}

let nodes = 0

/** Finds the move with the highest expected value, looking `depth` tile spawns ahead. */
export function search(rows: Rows, depth: number): SearchResult {
  currentStamp++
  nodes = 0

  const values: Record<Move, number | null> = { UP: null, DOWN: null, LEFT: null, RIGHT: null }
  let best: Move | null = null
  let bestValue = -Infinity

  for (const move of MOVES) {
    const next = slideRows(rows, move)
    if (next === rows) continue
    const value = chanceValue(next, depth, 1)
    values[move] = value
    if (value > bestValue) {
      bestValue = value
      best = move
    }
  }
  return { best, values, depth, nodes }
}

/** Value of a position where the player is to move. A position with no legal move is worth 0. */
function maxValue(rows: Rows, depth: number, probability: number): number {
  let best = 0
  for (const move of MOVES) {
    const next = slideRows(rows, move)
    if (next === rows) continue
    const value = chanceValue(next, depth, probability)
    if (value > best) best = value
  }
  return best
}

/** Expected value of a position where a random tile is about to spawn. */
export function chanceValue(rows: Rows, depth: number, probability: number): number {
  nodes++
  if (depth === 0 || probability < MIN_BRANCH_PROBABILITY) return evaluate(rows)

  const top = (rows[0] | (rows[1] << 16)) >>> 0
  const bottom = (rows[2] | (rows[3] << 16)) >>> 0
  const slot = (Math.imul(top, 0x9e3779b1) ^ Math.imul(bottom, 0x85ebca6b)) & TABLE_MASK
  if (
    tableStamp[slot] === currentStamp &&
    tableTop[slot] === top &&
    tableBottom[slot] === bottom &&
    tableDepth[slot] === depth
  ) {
    return tableValue[slot]
  }

  const empty = emptyCells(rows)
  const cellProbability = probability / empty.length
  let total = 0
  for (const { row, shift } of empty) {
    total += TWO_PROBABILITY * maxValue(withTile(rows, row, shift, 1), depth - 1, cellProbability * TWO_PROBABILITY)
    total += FOUR_PROBABILITY * maxValue(withTile(rows, row, shift, 2), depth - 1, cellProbability * FOUR_PROBABILITY)
  }
  const value = total / empty.length

  tableStamp[slot] = currentStamp
  tableTop[slot] = top
  tableBottom[slot] = bottom
  tableDepth[slot] = depth
  tableValue[slot] = value
  return value
}
