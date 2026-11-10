import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * 单个数据点：大字数值 + 标签 + 可选注脚。
 * 数值一律等宽，避免刷新时抖动。
 */
const valueVariants = cva('truncate text-h2 font-normal tnum', {
  variants: {
    tone: {
      default: 'text-ink',
      accent: 'text-accent',
      warning: 'text-warning',
    },
  },
  defaultVariants: {
    tone: 'default',
  },
})

export function StatTile({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  tone?: 'default' | 'accent' | 'warning'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-panel bg-bg-sunken px-4 py-3',
        className,
      )}
    >
      <span className="text-caption text-ink-muted">{label}</span>
      <span className={cn(valueVariants({ tone }))}>{value}</span>
      {hint ? (
        <span className="truncate text-caption text-ink-faint">{hint}</span>
      ) : null}
    </div>
  )
}
