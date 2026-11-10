import { cn } from '@/lib/utils'

/**
 * 文档里的一个字段节。
 *
 * 与「卡片」的区别：没有边框、没有底色，靠编号与标题分层，
 * 节与节之间只有一条细线。操作按钮默认隐藏，鼠标悬停或键盘聚焦才出现。
 */
export function DocSection({
  id,
  index,
  title,
  meta,
  actions,
  children,
  className,
}: {
  /** 锚点 id，供大纲跳转 */
  id: string
  /** 序号，1 起 */
  index: number
  title: string
  /** 标题右侧的小标记，如状态、来源 */
  meta?: React.ReactNode
  /** 默认隐藏的操作条 */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn('group scroll-mt-24 py-7 first:pt-2', className)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-baseline gap-3">
          <span
            aria-hidden
            className="text-caption tracking-[0.14em] text-ink-faint tnum"
          >
            {String(index).padStart(2, '0')}
          </span>
          <h3
            id={`${id}-title`}
            className="text-h3 font-medium tracking-tight text-ink"
          >
            {title}
          </h3>
        </div>
        {meta ? (
          <div className="flex shrink-0 items-center gap-2 text-caption">
            {meta}
          </div>
        ) : null}
      </div>

      <div className="mt-3">{children}</div>

      {actions ? (
        <div className="mt-3 flex flex-wrap items-center gap-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          {actions}
        </div>
      ) : null}
    </section>
  )
}

/** 节与节之间的分隔线，单独导出便于在列表里按需插入 */
export function DocDivider() {
  return <div aria-hidden className="h-px bg-line-subtle" />
}
