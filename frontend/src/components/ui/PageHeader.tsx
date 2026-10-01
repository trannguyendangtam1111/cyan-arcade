import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  /** Buttons or links shown beside the title (below it on small screens). */
  actions?: ReactNode
}

export function PageHeader({ title, description, icon: Icon, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-4">
        {Icon && (
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-(--accent) text-(--accent-ink) shadow-soft sm:size-14">
            <Icon aria-hidden className="size-6 sm:size-7" strokeWidth={2.25} />
          </span>
        )}
        <div>
          <h1 className="text-title font-bold">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-lg text-ink-soft">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </header>
  )
}
