import { aiActionDelay, type AiSpeed } from '@/games/shared/ai'
import type { AiSolution, GuessView } from '../types/wordleTypes'

/**
 * The browser side of Word Guess's AI. The solving happens on the server, where the AI plays the same
 * puzzle through the same rules as a player and only an admin may ask it to; this turns its answer
 * into something to watch: thinking, typing each letter, submitting, the tiles turning over.
 *
 * Speed only stretches or squeezes the waits. The guesses come from the server and are the same at
 * every speed.
 */

export type AiAction =
  | { kind: 'think'; step: number }
  | { kind: 'type'; step: number; letters: number }
  | { kind: 'submit'; step: number }

/**
 * Waits at 1x, in milliseconds, before each kind of action. Thinking about a guess after the first
 * also covers the previous row turning over.
 */
export const BASE_DELAYS = {
  firstThink: 600,
  think: 1500,
  type: 170,
  submit: 320,
} as const

/** What the board shows after some of the actions. */
export interface AiFrame {
  /** Guesses submitted so far, with their answers. */
  guesses: GuessView[]
  /** Letters typed into the next row. */
  input: string
  /** The step being worked on, for the AI panel; -1 before the first. */
  step: number
  /** Whether the whole solve has been played back. */
  done: boolean
}

export interface WordleAiPlayer {
  /** Every action of the solve, in order. */
  script(solution: AiSolution): AiAction[]
  /** How long to wait before an action at this speed. */
  delay(action: AiAction, speed: AiSpeed): number
  /** The board after the first `played` actions of the script. */
  frame(solution: AiSolution, script: AiAction[], played: number): AiFrame
}

export function createWordleAiPlayer(): WordleAiPlayer {
  return {
    script(solution) {
      return solution.steps.flatMap((step, index): AiAction[] => [
        { kind: 'think', step: index },
        ...Array.from({ length: step.guess.length }, (_, letter) => ({ kind: 'type' as const, step: index, letters: letter + 1 })),
        { kind: 'submit', step: index },
      ])
    },

    delay(action, speed) {
      const base = action.kind === 'think' && action.step === 0 ? BASE_DELAYS.firstThink : BASE_DELAYS[action.kind]
      return aiActionDelay(base, speed)
    },

    frame(solution, script, played) {
      const guesses: GuessView[] = []
      let input = ''
      let step = -1
      for (const action of script.slice(0, played)) {
        const current = solution.steps[action.step]
        step = action.step
        if (action.kind === 'type') input = current.guess.slice(0, action.letters)
        if (action.kind === 'submit') {
          guesses.push({ word: current.guess, feedback: current.feedback })
          input = ''
        }
      }
      return { guesses, input, step, done: played >= script.length }
    },
  }
}
