import type { Opening } from '../api'

/**
 * The steps of opening a pack on screen.
 *
 * ```text
 * sealed ──open──► requesting ──opened──► tearing ──torn──► revealing ──(last card)──► results
 *    ▲                 │                                                                  │
 *    └─────failed──────┘◄──────────────────────────open / reset───────────────────────────┘
 * ```
 *
 * This only decides what is shown. Which cards the player got was decided by the server before
 * `tearing` begins, and they are in the collection already: closing the page halfway through the
 * animation loses nothing.
 */
export type OpeningPhase = 'sealed' | 'requesting' | 'tearing' | 'revealing' | 'results'

export interface OpeningState {
  phase: OpeningPhase
  /** What the server answered. Set from `tearing` on. */
  opening: Opening | null
  /** Positions of the cards turned face up so far, in the order they were turned. */
  revealed: number[]
  /** Why the last attempt to open a pack failed. */
  error: string | null
}

export type OpeningAction =
  | { type: 'open' }
  | { type: 'opened'; opening: Opening }
  | { type: 'failed'; message: string }
  | { type: 'torn' }
  | { type: 'reveal'; position: number }
  | { type: 'revealAll' }
  | { type: 'reset' }

export const sealed: OpeningState = { phase: 'sealed', opening: null, revealed: [], error: null }

export function openingReducer(state: OpeningState, action: OpeningAction): OpeningState {
  switch (action.type) {
    case 'open':
      // A new pack can be asked for from a sealed pack or from the results of the last one.
      if (state.phase !== 'sealed' && state.phase !== 'results') return state
      return { ...sealed, phase: 'requesting' }

    case 'opened':
      if (state.phase !== 'requesting') return state
      return { phase: 'tearing', opening: action.opening, revealed: [], error: null }

    case 'failed':
      if (state.phase !== 'requesting') return state
      return { ...sealed, error: action.message }

    case 'torn':
      if (state.phase !== 'tearing') return state
      return { ...state, phase: 'revealing' }

    case 'reveal': {
      if (state.phase !== 'revealing' || !state.opening) return state
      const exists = state.opening.cards.some((card) => card.position === action.position)
      if (!exists || state.revealed.includes(action.position)) return state
      return withRevealed(state, [...state.revealed, action.position])
    }

    case 'revealAll': {
      if (state.phase !== 'revealing' || !state.opening) return state
      const rest = state.opening.cards
        .map((card) => card.position)
        .filter((position) => !state.revealed.includes(position))
      return withRevealed(state, [...state.revealed, ...rest])
    }

    case 'reset':
      // While a request is on its way there is nothing to go back to yet.
      return state.phase === 'requesting' ? state : sealed
  }
}

/** Turning the last card face up is what ends the reveal. */
function withRevealed(state: OpeningState, revealed: number[]): OpeningState {
  const all = state.opening !== null && revealed.length === state.opening.cards.length
  return { ...state, revealed, phase: all ? 'results' : 'revealing' }
}

/** What a finished opening added up to. */
export function summarize(opening: Opening) {
  const newCards = opening.cards.filter((card) => card.isNew).length
  const bestTier = Math.max(...opening.cards.map((card) => card.card.rarity.tier))
  return { newCards, duplicates: opening.cards.length - newCards, bestTier }
}
