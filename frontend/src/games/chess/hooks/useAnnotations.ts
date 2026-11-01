import { useCallback, useState } from 'react'

/**
 * Arrows and highlighted squares a player draws to think a position through. They are pictures
 * only: nothing here reaches the server or the match. They belong to the position they were drawn
 * on, and go when another position is shown.
 */

/** Colours by kind: orange arrows and red squares by default, green with Shift, blue with Alt or Ctrl. */
export type AnnotationColor = 'orange' | 'red' | 'green' | 'blue'

/** Drawing colours: strong enough on every board skin, and apart from the engine's emerald. */
export const ANNOTATION_COLORS: Record<AnnotationColor, string> = {
  orange: '#f08c00',
  red: '#e03131',
  green: '#2f9e44',
  blue: '#1c7ed6',
}

export interface Arrow {
  from: string
  to: string
  color: AnnotationColor
}

export interface Mark {
  square: string
  color: AnnotationColor
}

export interface Annotations {
  arrows: Arrow[]
  marks: Mark[]
}

const EMPTY: Annotations = { arrows: [], marks: [] }

/** The colour a drawing gesture gets from the keys held down with it. */
export function annotationColor(kind: 'arrow' | 'mark', keys: { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): AnnotationColor {
  if (keys.shiftKey) return 'green'
  if (keys.altKey || keys.ctrlKey || keys.metaKey) return 'blue'
  return kind === 'arrow' ? 'orange' : 'red'
}

/**
 * The drawings on the position `positionKey`: drawing the same arrow or square again (in the same
 * colour) takes it away, as on a paper board.
 */
export function useAnnotations(positionKey: string) {
  const [state, setState] = useState<{ key: string; annotations: Annotations }>({ key: positionKey, annotations: EMPTY })
  // Another position: a clean board.
  if (state.key !== positionKey) setState({ key: positionKey, annotations: EMPTY })
  const annotations = state.key === positionKey ? state.annotations : EMPTY

  const toggleArrow = useCallback((from: string, to: string, color: AnnotationColor) => {
    setState((current) => {
      const arrows = current.annotations.arrows
      const same = arrows.find((arrow) => arrow.from === from && arrow.to === to)
      const rest = arrows.filter((arrow) => arrow !== same)
      const next = same && same.color === color ? rest : [...rest, { from, to, color }]
      return { ...current, annotations: { ...current.annotations, arrows: next } }
    })
  }, [])

  const toggleMark = useCallback((square: string, color: AnnotationColor) => {
    setState((current) => {
      const marks = current.annotations.marks
      const same = marks.find((mark) => mark.square === square)
      const rest = marks.filter((mark) => mark !== same)
      const next = same && same.color === color ? rest : [...rest, { square, color }]
      return { ...current, annotations: { ...current.annotations, marks: next } }
    })
  }, [])

  const clear = useCallback(() => setState((current) => ({ ...current, annotations: EMPTY })), [])

  const count = annotations.arrows.length + annotations.marks.length
  return { annotations, count, toggleArrow, toggleMark, clear }
}
