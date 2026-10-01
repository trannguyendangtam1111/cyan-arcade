/**
 * The one concept every game AI shares: look at a pure engine state, answer with the next action.
 *
 * Each game implements this with its own algorithm in `games/<slug>/ai/`. There is deliberately no
 * generic algorithm here. Implementations must not touch React, timers or the DOM.
 */
export interface GameAI<State, Action> {
  getNextAction(state: State): Action
}

export type PlayMode = 'human' | 'ai'

/**
 * Playback multipliers for AI mode. Speed only changes the delay between AI actions;
 * it never changes search depth or decision quality.
 */
export const AI_SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const

export type AiSpeed = (typeof AI_SPEEDS)[number]

/** Delay between AI actions for a game whose 1x pace is `baseDelayMs`. */
export function aiActionDelay(baseDelayMs: number, speed: AiSpeed): number {
  return baseDelayMs / speed
}
