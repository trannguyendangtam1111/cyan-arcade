import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

export interface Crumb {
  label: string
  /** Where the crumb leads. The last crumb is the current page and has no link. */
  to?: string
}

/** The way back up: card game, set, pack. */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm font-bold text-ink-soft">
        {crumbs.map(({ label, to }, index) => (
          <li key={label} className="flex items-center gap-1">
            {index > 0 && <ChevronRight aria-hidden className="size-4" />}
            {to ? (
              <Link to={to} className="rounded hover:text-ink">
                {label}
              </Link>
            ) : (
              <span aria-current="page" className="text-ink">
                {label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
