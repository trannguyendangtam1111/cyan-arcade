import { FILES } from '../engine/board'
import { ANNOTATION_COLORS, type Arrow, type Mark } from '../hooks/useAnnotations'
import type { Side } from '../types/chessTypes'

/** The engine's suggestions (a hint, the best move, a line's next move): emerald and dashed. */
export const ENGINE_ARROW = '#059669'

export interface EngineArrow {
  from: string
  to: string
}

/** The centre of a square in board units (0 to 8 from the top left), as the board is turned. */
function centre(square: string, orientation: Side): [number, number] {
  const file = FILES.indexOf(square[0])
  const rank = Number(square[1]) - 1
  return orientation === 'WHITE' ? [file + 0.5, 7 - rank + 0.5] : [7 - file + 0.5, rank + 0.5]
}

function ArrowShape({ from, to, orientation, color, dashed, opacity }: { from: string; to: string; orientation: Side; color: string; dashed?: boolean; opacity: number }) {
  const [x1, y1] = centre(from, orientation)
  const [x2, y2] = centre(to, orientation)
  const length = Math.hypot(x2 - x1, y2 - y1)
  if (length === 0) return null
  const ux = (x2 - x1) / length
  const uy = (y2 - y1) / length
  const head = 0.42
  const width = 0.16
  // The shaft stops where the head begins; the arrow starts a little off the piece's centre.
  const sx = x1 + ux * 0.25
  const sy = y1 + uy * 0.25
  const tipX = x2 - ux * 0.12
  const tipY = y2 - uy * 0.12
  const baseX = tipX - ux * head
  const baseY = tipY - uy * head
  const nx = -uy
  const ny = ux
  return (
    <g opacity={opacity}>
      <line x1={sx} y1={sy} x2={baseX} y2={baseY} stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dashed ? '0.22 0.14' : undefined} />
      <polygon points={`${tipX},${tipY} ${baseX + nx * 0.22},${baseY + ny * 0.22} ${baseX - nx * 0.22},${baseY - ny * 0.22}`} fill={color} />
    </g>
  )
}

/**
 * What is drawn over the board: the player's arrows and highlighted squares, and the engine's
 * suggested moves. Pictures only, which no click or tap reaches.
 */
export function BoardArrows({
  orientation,
  arrows,
  marks,
  engine = [],
  pending = null,
}: {
  orientation: Side
  arrows: readonly Arrow[]
  marks: readonly Mark[]
  engine?: readonly EngineArrow[]
  /** The start of an arrow being drawn (annotation mode, or a right-button drag). */
  pending?: string | null
}) {
  if (arrows.length === 0 && marks.length === 0 && engine.length === 0 && !pending) return null
  return (
    <svg aria-hidden viewBox="0 0 8 8" className="pointer-events-none absolute inset-0 z-20 size-full" data-testid="board-drawings">
      {marks.map((mark) => {
        const [x, y] = centre(mark.square, orientation)
        return <rect key={`m-${mark.square}`} data-mark={mark.square} data-color={mark.color} x={x - 0.5} y={y - 0.5} width={1} height={1} fill={ANNOTATION_COLORS[mark.color]} opacity={0.5} />
      })}
      {pending &&
        (() => {
          const [x, y] = centre(pending, orientation)
          return <circle cx={x} cy={y} r={0.42} fill="none" stroke={ANNOTATION_COLORS.orange} strokeWidth={0.08} strokeDasharray="0.15 0.1" />
        })()}
      {engine.map((arrow) => (
        <g key={`e-${arrow.from}${arrow.to}`} data-engine-arrow={`${arrow.from}${arrow.to}`}>
          <ArrowShape from={arrow.from} to={arrow.to} orientation={orientation} color={ENGINE_ARROW} dashed opacity={0.85} />
        </g>
      ))}
      {arrows.map((arrow) => (
        <g key={`a-${arrow.from}${arrow.to}`} data-arrow={`${arrow.from}${arrow.to}`} data-color={arrow.color}>
          <ArrowShape from={arrow.from} to={arrow.to} orientation={orientation} color={ANNOTATION_COLORS[arrow.color]} opacity={0.8} />
        </g>
      ))}
    </svg>
  )
}
