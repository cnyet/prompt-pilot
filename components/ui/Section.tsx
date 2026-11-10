import { cn } from '@/lib/utils'

/**
 * 区块容器。用来替代"什么都套一个边框卡片"的写法：
 * 区块默认不加外框，靠标题与间距分组，组内用轻分隔线。
 * 需要明确边界时才传 bordered。
 */
export function Section({
  title,
  description,
  actions,
  children,
  bordered = false,
  className,
  contentClassName,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  bordered?: boolean
  className?: string
  contentClassName?: string
}) {
  return (
    <section className={cn('flex flex-col gap-3', className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            {title ? (
              <h2 className="text-h3 font-semibold text-ink">{title}</h2>
            ) : null}
            {description ? (
              <p className="max-w-[68ch] text-balance text-body text-ink-muted">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div
        className={cn(
          bordered && 'rounded-panel border border-line bg-surface',
          contentClassName,
        )}
      >
        {children}
      </div>
    </section>
  )
}

/** 页面标题区。一个页面只有一个，承载页面级主操作。 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-end justify-between gap-x-6 gap-y-3',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-display font-normal text-ink text-balance lg:text-[2.75rem] lg:leading-[1.1]">{title}</h1>
        {description ? (
          <p className="max-w-[72ch] text-balance text-body text-ink-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

