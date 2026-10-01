import { memo, useId } from 'react'
import type { Direction, Point, SnakeState } from '../types/snakeTypes'

/** Where the eyes sit relative to the head centre, per heading. */
const EYES: Record<Direction, [number, number][]> = {
  UP: [[-0.2, -0.12], [0.2, -0.12]],
  DOWN: [[-0.2, 0.12], [0.2, 0.12]],
  LEFT: [[-0.12, -0.2], [-0.12, 0.2]],
  RIGHT: [[0.12, -0.2], [0.12, 0.2]],
}

/** The cell where an apple was just eaten. `id` changes with every apple so the effect replays. */
export interface EatenFood extends Point {
  id: number
}

interface SnakeBoardProps {
  state: SnakeState
  eaten?: EatenFood | null
}

/** Renders a snake state. Purely presentational: one grid cell is one SVG unit. */
export const SnakeBoard = memo(function SnakeBoard({ state, eaten }: SnakeBoardProps) {
  const patternId = useId()
  const { width, height, snake, food, direction, status } = state
  const head = snake[0]
  const bodyPoints = snake.map((cell) => `${cell.x + 0.5},${cell.y + 0.5}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Snake board. Length ${snake.length}, score ${state.score}. Head at column ${head.x + 1}, row ${head.y + 1}.`}
      className="block size-full"
    >
      <defs>
        {/* Checkerboard: two tinted squares per 2x2 tile. */}
        <pattern id={patternId} width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" style={{ fill: 'var(--accent)' }} opacity="0.1" />
          <rect x="1" y="1" width="1" height="1" style={{ fill: 'var(--accent)' }} opacity="0.1" />
        </pattern>
      </defs>
      <rect width={width} height={height} style={{ fill: 'color-mix(in srgb, var(--accent) 14%, white)' }} />
      <rect width={width} height={height} fill={`url(#${patternId})`} />

      {food && (
        // Keyed by position so every new apple pops in.
        <g key={`${food.x},${food.y}`} className="origin-center [transform-box:fill-box] motion-safe:animate-pop-in">
          <circle cx={food.x + 0.5} cy={food.y + 0.55} r="0.34" fill="#ef4444" />
          <path
            d={`M${food.x + 0.5} ${food.y + 0.26} q0.06 -0.2 0.24 -0.18`}
            fill="none"
            stroke="#15803d"
            strokeWidth="0.09"
            strokeLinecap="round"
          />
        </g>
      )}

      <polyline
        points={bodyPoints}
        fill="none"
        strokeWidth="0.76"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: status === 'over' ? 'color-mix(in srgb, var(--accent) 45%, #64748b)' : 'var(--accent)' }}
      />
      <circle
        cx={head.x + 0.5}
        cy={head.y + 0.5}
        r="0.44"
        style={{ fill: 'color-mix(in srgb, var(--accent) 72%, black)' }}
      />
      {EYES[direction].map(([dx, dy], index) => (
        <circle key={index} cx={head.x + 0.5 + dx} cy={head.y + 0.5 + dy} r="0.09" fill="white" />
      ))}

      {eaten && (
        // A ring that expands and fades where the apple was: the "collected" feedback.
        <circle
          key={eaten.id}
          cx={eaten.x + 0.5}
          cy={eaten.y + 0.5}
          r="0.5"
          fill="none"
          stroke="#ef4444"
          strokeWidth="0.14"
          className="origin-center opacity-0 [transform-box:fill-box] motion-safe:animate-burst"
        />
      )}
    </svg>
  )
})
