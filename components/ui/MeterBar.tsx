import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/** 把任意输入压到 0-1，非有限值按 0 处理 */
export function clampRatio(value: number, max = 1): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0
  }
  return Math.min(1, Math.max(0, value / max))
}

const barVariants = cva('h-full rounded-full transition-[width] duration-300', {
  variants: {
    tone: {
      accent: 'bg-accent',
      success: 'bg-success',
      muted: 'bg-ink-faint',
    },
  },
  defaultVariants: {
    tone: 'accent',
  },
})

/**
 * 单值进度条。用于胜率、完成度、成本占比这类"一个比例"的表达。
 * 颜色只分三档，不按数值做彩虹色。
 */
export function MeterBar({
  label,
  value,
  max = 1,
  display,
  tone = 'accent',
  empty = false,
  className,
}: {
  label: string
  value: number
  max?: number
  /** 条右侧的文字，默认显示百分比 */
  display?: string
  tone?: 'accent' | 'success' | 'muted'
  /** 无数据时显示空条与 —，不要把 0 伪装成"实际为 0" */
  empty?: boolean
  className?: string
}) {
  const ratio = empty ? 0 : clampRatio(value, max)
  const text = display ?? (empty ? '—' : `${Math.round(ratio * 100)}%`)

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-ink">{label}</span>
        <span className="text-caption text-ink-muted tnum">{text}</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={empty ? undefined : Math.round(ratio * 100)}
        className="h-1.5 overflow-hidden rounded-full bg-bg-sunken"
      >
        <div
          className={cn(barVariants({ tone }))}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </div>
  )
}
