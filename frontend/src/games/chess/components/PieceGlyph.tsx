import type { ReactNode } from 'react'
import type { PieceSet } from '../skins'
import type { BoardPiece, PieceKind } from '../types/chessTypes'

/**
 * Cyan Arcade's own chess pieces: chunky, rounded shapes drawn from circles, rectangles and a few
 * curves on a 100 × 100 grid, with a thick outline so they read at any size on any square. Both
 * sides share one shape per piece; only the colours differ, and a skin changes only those.
 */

type Shapes = { body: ReactNode; details?: ReactNode }

const BASE = <rect x="22" y="74" width="56" height="13" rx="6.5" />

const SHAPES: Record<PieceKind, Shapes> = {
  p: {
    body: (
      <>
        <circle cx="50" cy="29" r="12.5" />
        <rect x="37" y="43" width="26" height="8" rx="4" />
        <path d="M40 51 C40 61 35 67 30 74 H70 C65 67 60 61 60 51 Z" />
        {BASE}
      </>
    ),
  },
  n: {
    body: (
      <>
        <path d="M33 74 C32 65 36 60 42 56 C36 57.5 30 58 25 55 C18.5 51.5 18 44 23 39 L37 25 L40 10 L50 19.5 C64 21 75 33 75 50 L73 74 Z" />
        {BASE}
      </>
    ),
    details: (
      <>
        <circle cx="40" cy="34" r="3.6" />
        <circle cx="25.5" cy="45.5" r="2" />
        <path d="M57 25 C64.5 33 67 45 64.5 60" fill="none" strokeWidth="3.5" strokeLinecap="round" />
      </>
    ),
  },
  b: {
    body: (
      <>
        <circle cx="50" cy="13" r="6" />
        <path d="M50 19 C64 28 68 44 60.5 57 H39.5 C32 44 36 28 50 19 Z" />
        <rect x="35" y="57" width="30" height="8" rx="4" />
        <path d="M40 65 C40 69 35 72 31 74 H69 C65 72 60 69 60 65 Z" />
        {BASE}
      </>
    ),
    details: <path d="M55 30 L46 44" fill="none" strokeWidth="4" strokeLinecap="round" />,
  },
  r: {
    body: (
      <>
        <path d="M27 15 H38 V23 H44.5 V15 H55.5 V23 H62 V15 H73 V34 H27 Z" />
        <path d="M33 34 H67 L64 66 H36 Z" />
        <rect x="29" y="64" width="42" height="10" rx="4" />
        {BASE}
      </>
    ),
    details: <path d="M36 44 H64 M43 44 V54 M57 44 V54 M37 54 H63" fill="none" strokeWidth="3" strokeLinecap="round" />,
  },
  q: {
    body: (
      <>
        <circle cx="21" cy="27" r="5.5" />
        <circle cx="35.5" cy="18.5" r="5.5" />
        <circle cx="50" cy="14" r="5.5" />
        <circle cx="64.5" cy="18.5" r="5.5" />
        <circle cx="79" cy="27" r="5.5" />
        <path d="M22 31 L33 54 L36 23 L44 50 L50 19 L56 50 L64 23 L67 54 L78 31 L70 64 H30 Z" />
        <rect x="27" y="63" width="46" height="11" rx="5" />
        {BASE}
      </>
    ),
    details: <circle cx="50" cy="68.5" r="2.8" />,
  },
  k: {
    body: (
      <>
        <path d="M45.5 5 H54.5 V13 H62 V21 H54.5 V30 H45.5 V21 H38 V13 H45.5 Z" />
        <path d="M50 29 C59 29 77 31 77 44 C77 54 69 59 67 64 H33 C31 59 23 54 23 44 C23 31 41 29 50 29 Z" />
        <rect x="27" y="63" width="46" height="11" rx="5" />
        {BASE}
      </>
    ),
    details: <path d="M50 36 V58 M38 43 C42 49 46 52 50 54 C54 52 58 49 62 43" fill="none" strokeWidth="3" strokeLinecap="round" />,
  },
}

interface PieceGlyphProps {
  piece: BoardPiece
  set: PieceSet
  /** A colour drawn around the piece so it stands out on the square; `undefined` for none. */
  halo?: string
  className?: string
}

/** One piece as an SVG, decorative: the square around it says what it is. */
export function PieceGlyph({ piece, set, halo, className }: PieceGlyphProps) {
  const shapes = SHAPES[piece.kind]
  const white = piece.side === 'WHITE'
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className} data-piece={`${piece.side}-${piece.kind}`}>
      <ellipse cx="50" cy="90" rx="25" ry="4" fill="rgba(0, 0, 0, 0.16)" />
      {halo && (
        <g fill={halo} stroke={halo} strokeWidth="11" strokeLinejoin="round">
          {shapes.body}
        </g>
      )}
      <g fill={white ? set.whiteFill : set.blackFill} stroke={set.outline} strokeWidth="4" strokeLinejoin="round">
        {shapes.body}
      </g>
      {shapes.details && (
        <g fill={white ? set.whiteDetail : set.blackDetail} stroke={white ? set.whiteDetail : set.blackDetail}>
          {shapes.details}
        </g>
      )}
    </svg>
  )
}
