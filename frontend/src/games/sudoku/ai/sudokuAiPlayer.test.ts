import { describe, expect, it } from 'vitest'
import { bit } from '../engine/grid'
import type { AiSolution } from '../types/sudokuTypes'
import { BASE_DELAYS, createSudokuAiPlayer } from './sudokuAiPlayer'

const GIVENS = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'

function solution(strategy: AiSolution['strategy']): AiSolution {
  return {
    strategy,
    date: '2026-10-09',
    puzzleNumber: 282,
    difficulty: 'MEDIUM',
    seed: 1,
    givens: GIVENS,
    solution: '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
    moves: [
      { kind: 'ELIMINATE', cell: -1, digit: 0, eliminations: ['2:1', '2:2'], cleared: [], technique: 'NAKED_PAIR', text: 'x', lesson: ['a', 'b'], highlight: [2] },
      { kind: 'PLACE', cell: 2, digit: 4, eliminations: [], cleared: [], technique: 'NAKED_SINGLE', text: 'r1c3 is 4', lesson: [], highlight: [2] },
      { kind: 'GUESS', cell: 3, digit: 2, eliminations: [], cleared: [], technique: null, text: 'try', lesson: [], highlight: [3] },
      { kind: 'BACKTRACK', cell: -1, digit: 0, eliminations: [], cleared: [3], technique: null, text: 'back', lesson: [], highlight: [3] },
    ],
    guesses: 1,
    backtracks: 1,
    techniques: {},
    searched: 0,
    trimmed: false,
    millis: 3,
  }
}

describe('the Sudoku AI playback', () => {
  const player = createSudokuAiPlayer()

  it('plays the server\'s moves on the board in order', () => {
    const solved = solution('TEACHING')
    expect(player.frame(solved, 0).values[2]).toBe(0)
    const afterElimination = player.frame(solved, 1)
    expect(afterElimination.candidates[2] & (bit(1) | bit(2))).toBe(0)
    expect(afterElimination.struck.get(2)).toBe(bit(1) | bit(2))
    expect(player.frame(solved, 2).values[2]).toBe(4)
    expect(player.frame(solved, 3).values[3]).toBe(2)
    const backed = player.frame(solved, 4)
    expect(backed.values[3]).toBe(0)
    expect(backed.done).toBe(true)
    expect(backed.last?.kind).toBe('BACKTRACK')
  })

  it('changes only the waits with speed, never the moves', () => {
    const solved = solution('STEP_BY_STEP')
    const move = solved.moves[1]
    expect(player.delay(solved, move, 1)).toBe(BASE_DELAYS.PLACE)
    expect(player.delay(solved, move, 4)).toBe(BASE_DELAYS.PLACE / 4)
    expect(player.delay(solved, move, 0.25)).toBe(BASE_DELAYS.PLACE * 4)
    expect(player.frame(solved, 2)).toEqual(player.frame(solved, 2))
  })

  it('gives each strategy its own pace', () => {
    const place = solution('FAST').moves[1]
    expect(player.delay(solution('FAST'), place, 1)).toBeLessThan(player.delay(solution('STEP_BY_STEP'), place, 1))
    expect(player.delay(solution('TEACHING'), place, 1)).toBeGreaterThan(player.delay(solution('STEP_BY_STEP'), place, 1))
  })
})
