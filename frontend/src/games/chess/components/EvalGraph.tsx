import type { MouseEvent } from 'react'
import type { MoveClass } from '../types/chessTypes'

export interface GraphPoint {
  /** 0 for the start, then one per move. */
  ply: number
  /** White's winning chances after this ply, from an engine evaluation; `null` where none exists. */
  white: number | null
  classification?: MoveClass
}

const WIDTH = 300
const HEIGHT = 80

const MARKS: Partial<Record<MoveClass, string>> = { INACCURACY: '#f59f00', MISTAKE: '#f76707', BLUNDER: '#e03131' }

/**
 * White's winning chances through a game, from the engine's evaluations only: the white area is
 * White's share, the dark Black's. Plies without an evaluation are left as gaps rather than guessed.
 * Mistakes and blunders are dotted; a click picks the move under the pointer.
 */
export function EvalGraph({ points, selected, onSelect, label }: { points: readonly GraphPoint[]; selected: number | null; onSelect: (ply: number) => void; label: string }) {
  const known = points.filter((point) => point.white !== null)
  if (known.length < 2) return null
  const last = Math.max(1, points[points.length - 1].ply)
  const x = (ply: number) => (ply / last) * WIDTH
  const y = (white: number) => HEIGHT - (white / 100) * HEIGHT

  // Runs of consecutive known points, each drawn as its own shape.
  const runs: GraphPoint[][] = []
  let run: GraphPoint[] = []
  for (const point of points) {
    if (point.white === null) {
      if (run.length) runs.push(run)
      run = []
    } else run.push(point)
  }
  if (run.length) runs.push(run)

  const pick = (event: MouseEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const ply = Math.round(((event.clientX - box.left) / box.width) * last)
    onSelect(Math.max(0, Math.min(last, ply)))
  }

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      onClick={pick}
      className="h-20 w-full cursor-pointer overflow-hidden rounded-md bg-[#26364a] ring-1 ring-line"
      data-testid="eval-graph"
    >
      {runs.map((part) => {
        const top = part.map((point) => `${x(point.ply)},${y(point.white!)}`).join(' ')
        const area = `${x(part[0].ply)},${HEIGHT} ${top} ${x(part[part.length - 1].ply)},${HEIGHT}`
        return (
          <g key={part[0].ply}>
            <polygon points={area} fill="#f8fafc" />
            <polyline points={top} fill="none" stroke="#94a3b8" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>
        )
      })}
      <line x1={0} x2={WIDTH} y1={HEIGHT / 2} y2={HEIGHT / 2} stroke="#f59e0b" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {selected !== null && <line x1={x(selected)} x2={x(selected)} y1={0} y2={HEIGHT} stroke="#22d3ee" strokeWidth={2} vectorEffect="non-scaling-stroke" />}
      {points.map((point) =>
        point.white !== null && point.classification && MARKS[point.classification] ? (
          <circle key={`d-${point.ply}`} cx={x(point.ply)} cy={y(point.white)} r={3} fill={MARKS[point.classification]} vectorEffect="non-scaling-stroke" />
        ) : null,
      )}
    </svg>
  )
}
