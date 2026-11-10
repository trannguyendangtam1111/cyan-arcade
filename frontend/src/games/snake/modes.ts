import { ADVENTURE_STAGES, type AdventureStage } from './engine/snakeAdventure'
import { snakeMap, type SnakeMap } from './engine/snakeMaps'

/**
 * The rulesets Snake can be played under: Classic (the open board), and each map, a mode of its own on
 * the server (`SnakeRunRules`): the same game with walls, ranked on a board of its own.
 */
export interface SnakeMapMode {
  /** The mode ID, as the server declares it. */
  mode: string
  map: SnakeMap
  /** What sets the map apart, for the Ready screen. */
  description: string
}

export const MAP_MODES: readonly SnakeMapMode[] = [
  { mode: 'map-pillars', map: snakeMap('pillars'), description: 'Four stone pillars stand in the way.' },
  { mode: 'map-tunnels', map: snakeMap('tunnels'), description: 'Two walls split the board; slip through the gaps.' },
  { mode: 'map-rooms', map: snakeMap('rooms'), description: 'Four rooms, joined by narrow doors.' },
]

/** What every map asks of the player. */
export const MAP_OBJECTIVE = 'Eat as many apples as you can without hitting a wall.'

/**
 * Adventure: six fixed stages (`engine/snakeAdventure.ts`), each a mode of its own on the server
 * (`adventure-1` to `adventure-6`), unranked. A stage is played on the open board or a map, with an
 * objective; only a clear is saved, as its game time.
 */
export interface SnakeAdventureMode {
  /** The mode ID, as the server declares it. */
  mode: string
  stage: AdventureStage
  /** The stage's map, or `undefined` for the open board. */
  map?: SnakeMap
  /** What the stage is played on: the map's name, or the open board. */
  board: string
}

export const ADVENTURE_MODES: readonly SnakeAdventureMode[] = ADVENTURE_STAGES.map((stage) => {
  const map = stage.map ? snakeMap(stage.map) : undefined
  return { mode: `adventure-${stage.id}`, stage, map, board: map?.name ?? 'Open board' }
})

/** A stage's objective, as a sentence: "Eat 15 apples within 400 moves." */
export function objectiveOf(stage: AdventureStage): string {
  const { apples, moveLimit } = stage.objective
  return `Eat ${apples} apples${moveLimit === undefined ? '' : ` within ${moveLimit} moves`}.`
}
