import { cn } from '@/lib/utils'
import { Icon, type IconName } from './Icon'

/**
 * 全站统一空态：图标锚点 + 标题 + 一句说明 + 一个主操作。
 * 居中于内容区，不再用大边框盒子包一段左上角文字。
 */
export function EmptyState({
  title,
  hint,
  action,
  icon,
  className,
}: {
  title: string
  hint: string
  action?: React.ReactNode
  icon?: IconName
  className?: string
}) {
  return (
    <div
      className={cn(
        'rise flex flex-col items-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      {icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-tint-butter text-ink-muted">
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      <p className="text-h3 font-medium text-ink">{title}</p>
      <p className="max-w-[48ch] text-body text-ink-muted">{hint}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
