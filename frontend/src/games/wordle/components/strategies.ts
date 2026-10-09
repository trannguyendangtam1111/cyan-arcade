import type { Strategy } from '../types/wordleTypes'

/** The AI's strategies, as the admin sees them. The server does the solving. */
export const STRATEGIES: { id: Strategy; name: string; summary: string }[] = [
  { id: 'BALANCED', name: 'Balanced', summary: 'Most information, with a bonus for a guess that could win.' },
  { id: 'INFORMATION_HUNTER', name: 'Information Hunter', summary: 'Leaves the fewest words, even with guesses that cannot win.' },
  { id: 'CONSERVATIVE', name: 'Conservative', summary: 'Only guesses words that could be the answer.' },
  { id: 'SPEED_SOLVER', name: 'Speed Solver', summary: 'A fast rule of thumb: the most common letters.' },
]

/** One AI game played in this visit, for the AI's statistics. */
export interface AiRecord {
  strategy: Strategy
  puzzleNumber: number
  solved: boolean
  guesses: number
}
