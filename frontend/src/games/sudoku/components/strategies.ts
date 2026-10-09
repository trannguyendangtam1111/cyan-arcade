import type { Strategy } from '../types/sudokuTypes'

/** The AI's strategies as the controls name them. */
export const STRATEGIES: { id: Strategy; label: string; text: string }[] = [
  { id: 'STEP_BY_STEP', label: 'Step by step', text: 'Logic, one digit at a time, each with its reason.' },
  { id: 'FAST', label: 'Fast solver', text: 'Propagation and search: quick, tries digits and backs out.' },
  { id: 'TEACHING', label: 'Teaching', text: 'Every deduction, eliminations too, with the houses spelled out.' },
]
