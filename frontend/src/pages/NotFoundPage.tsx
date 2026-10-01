import { Ghost } from 'lucide-react'
import { Link } from 'react-router'
import { buttonStyles } from '@/components/ui/buttonStyles'
import { EmptyState } from '@/components/ui/EmptyState'

export function NotFoundPage() {
  return (
    <EmptyState
      icon={Ghost}
      title="Game over… for this page"
      description="We looked under every cabinet but couldn't find what you were after."
      action={
        <Link to="/" className={buttonStyles('primary')}>
          Back to the arcade
        </Link>
      }
    />
  )
}
