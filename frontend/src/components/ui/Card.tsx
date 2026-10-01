import type { HTMLAttributes } from 'react'
import { cardStyles, type CardPadding } from './cardStyles'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding
}

export function Card({ padding, className, ...props }: CardProps) {
  return <div className={cardStyles(padding, className)} {...props} />
}
