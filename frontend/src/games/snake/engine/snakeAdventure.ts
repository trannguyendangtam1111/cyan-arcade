import type { SnakeObjective, SnakeState } from '../types/snakeTypes'
import { createSnakeGame } from './snakeEngine'
import { snakeMap, type SnakeMapId } from './snakeMaps'

/**
 * Snake Adventure: six fixed stages, each a board (the open Classic board or one of the maps) with an
 * objective and a seed of its own. The seed fixes the start and every apple, so a stage plays the same
 * way each time it is tried with the same moves. The board, the speed curve and the rules are those of
 * Classic and Maps; only the objective is added.
 */

export type AdventureStageId = 1 | 2 | 3 | 4 | 5 | 6

export interface AdventureStage {
  readonly id: AdventureStageId
  /** The map the stage is played on, or `null` for the open Classic board. */
  readonly map: SnakeMapId | null
  readonly objective: SnakeObjective
  /** The stage's fixed seed: the same start and the same apples for the same moves. */
  readonly seed: number
}

function defineStage(stage: AdventureStage): AdventureStage {
  return Object.freeze({ ...stage, objective: Object.freeze({ ...stage.objective }) })
}

export const ADVENTURE_STAGES: readonly AdventureStage[] = Object.freeze([
  defineStage({ id: 1, map: null, objective: { apples: 10 }, seed: 0x5a0e_0001 }),
  defineStage({ id: 2, map: 'pillars', objective: { apples: 15 }, seed: 0x5a0e_0002 }),
  defineStage({ id: 3, map: 'tunnels', objective: { apples: 20 }, seed: 0x5a0e_0003 }),
  defineStage({ id: 4, map: 'tunnels', objective: { apples: 15, moveLimit: 400 }, seed: 0x5a0e_0004 }),
  defineStage({ id: 5, map: 'rooms', objective: { apples: 25 }, seed: 0x5a0e_0005 }),
  defineStage({ id: 6, map: 'rooms', objective: { apples: 30, moveLimit: 900 }, seed: 0x5a0e_0006 }),
])

export function adventureStage(id: AdventureStageId): AdventureStage {
  const stage = ADVENTURE_STAGES.find((candidate) => candidate.id === id)
  if (!stage) throw new Error(`Unknown Snake Adventure stage ${id}`)
  return stage
}

/** A fresh game of the stage: its board, its fixed seed and its objective. */
export function createAdventureGame(stage: AdventureStage): SnakeState {
  return createSnakeGame({
    seed: stage.seed,
    map: stage.map ? snakeMap(stage.map) : undefined,
    objective: stage.objective,
  })
}
