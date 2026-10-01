import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: ReactNode
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center rounded-card border-2 border-dashed border-brand-200 bg-surface/70 px-6 py-12 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-brand-100 text-brand-600 motion-safe:animate-float">
        <Icon aria-hidden className="size-8" strokeWidth={2.25} />
      </div>
      <h3 className="text-xl font-semibold">{title}</h3>
      <p className="mt-2 max-w-md text-ink-soft">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
