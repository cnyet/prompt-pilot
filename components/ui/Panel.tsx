import { cn } from '@/lib/utils'

/**
 * 结构面板（DESIGN.md 5.4）：卡片材质 + 可选的头尾栏。
 * 用于诊断 dock、侧栏面板、设置分组这类“有一块明确边界并带标题”的区域；
 * 纯内容块用 Card，不要把每个区块都套成 Panel。
 */
export function Panel({
  title,
  description,
  actions,
  footer,
  children,
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
  headerClassName?: string
  bodyClassName?: string
  footerClassName?: string
}) {
  const hasHeader = Boolean(title || description || actions)
  return (
    <section
      className={cn(
        'overflow-hidden rounded-panel border border-line bg-surface shadow-sm',
        className,
      )}
    >
      {hasHeader ? (
        <header
          className={cn(
            'flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line-subtle px-5 py-3.5',
            headerClassName,
          )}
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            {title ? (
              <h2 className="font-display text-h3 font-semibold text-ink">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="max-w-[68ch] text-balance text-caption text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
      {footer ? (
        <footer
          className={cn(
            'border-t border-line-subtle px-5 py-3',
            footerClassName,
          )}
        >
          {footer}
        </footer>
      ) : null}
    </section>
  )
}