import { describe, expect, it } from 'vitest'
import { AI_SPEEDS } from '@/games/shared/ai'
import type { AiSolution } from '../types/wordleTypes'
import { BASE_DELAYS, createWordleAiPlayer } from './wordleAiPlayer'

const solution: AiSolution = {
  puzzleNumber: 281,
  date: '2026-10-08',
  strategy: 'BALANCED',
  solved: true,
  guesses: 2,
  score: 500,
  answer: 'APPLE',
  steps: [
    { guess: 'ALLEY', feedback: ['CORRECT', 'PRESENT', 'ABSENT', 'PRESENT', 'ABSENT'], candidatesBefore: 662, candidatesAfter: 3, reason: '5.9 bits expected', couldWin: true, remaining: ['AMPLE', 'ANKLE', 'APPLE'] },
    { guess: 'APPLE', feedback: ['CORRECT', 'CORRECT', 'CORRECT', 'CORRECT', 'CORRECT'], candidatesBefore: 3, candidatesAfter: 1, reason: 'one of the last words', couldWin: true, remaining: ['APPLE'] },
  ],
}

describe('the Word Guess AI player', () => {
  const player = createWordleAiPlayer()

  it('thinks, types each letter and submits, for every guess the server played', () => {
    const script = player.script(solution)

    expect(script).toHaveLength(2 * (1 + 5 + 1))
    expect(script.slice(0, 7).map((action) => action.kind)).toEqual(['think', 'type', 'type', 'type', 'type', 'type', 'submit'])
    expect(script.at(-1)).toEqual({ kind: 'submit', step: 1 })
  })

  it('rebuilds the board from the actions played so far', () => {
    const script = player.script(solution)

    expect(player.frame(solution, script, 0)).toEqual({ guesses: [], input: '', step: -1, done: false })
    expect(player.frame(solution, script, 4)).toMatchObject({ guesses: [], input: 'ALL', step: 0 })
    const afterFirst = player.frame(solution, script, 7)
    expect(afterFirst.guesses).toEqual([{ word: 'ALLEY', feedback: solution.steps[0].feedback }])
    expect(afterFirst.input).toBe('')
    const end = player.frame(solution, script, script.length)
    expect(end.guesses.map((guess) => guess.word)).toEqual(['ALLEY', 'APPLE'])
    expect(end.done).toBe(true)
  })

  it('changes only the waits with speed, never the guesses', () => {
    const script = player.script(solution)
    for (const speed of AI_SPEEDS) {
      expect(player.script(solution)).toEqual(script)
      expect(player.delay({ kind: 'type', step: 0, letters: 1 }, speed)).toBe(BASE_DELAYS.type / speed)
    }
    expect(player.delay({ kind: 'think', step: 0 }, 1)).toBe(BASE_DELAYS.firstThink)
    expect(player.delay({ kind: 'think', step: 1 }, 2)).toBe(BASE_DELAYS.think / 2)
    expect(player.delay({ kind: 'submit', step: 1 }, 8)).toBeLessThan(player.delay({ kind: 'submit', step: 1 }, 0.25))
  })
})
