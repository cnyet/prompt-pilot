import { cn } from '@/lib/utils'

export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string
  hint: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex max-w-[52ch] flex-col items-start gap-3 px-6 py-16',
        className,
      )}
    >
      <p className="text-h3 text-ink">{title}</p>
      <p className="text-body text-ink-muted">{hint}</p>
      {action}
    </div>
  )
}
