import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * 内容卡片（DESIGN.md 5.4）。默认羊皮纸底、1px 细边、6px 圆角、轻阴影。
 * 顶部金色描边只用于“当前字段 / 重要 KPI”，不要给所有卡片同时加。
 */
const cardVariants = cva('rounded-panel border text-ink', {
  variants: {
    variant: {
      default: 'border-line bg-surface shadow-sm',
      elevated: 'border-line-strong bg-surface-raised shadow-md',
      accent: 'border-line border-t-2 border-t-accent bg-surface shadow-sm',
      interactive:
        'border-line bg-surface shadow-sm transition-colors duration-150 hover:border-line-strong hover:shadow-glow',
      selected: 'border-accent bg-accent-subtle shadow-glow',
    },
    padding: {
      none: '',
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-6',
    },
  },
  defaultVariants: {
    variant: 'default',
    padding: 'md',
  },
})

export type CardVariant = NonNullable<
  VariantProps<typeof cardVariants>['variant']
>
export type CardPadding = NonNullable<
  VariantProps<typeof cardVariants>['padding']
>

export function Card({
  variant = 'default',
  padding = 'md',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant
  padding?: CardPadding
}) {
  return (
    <div className={cn(cardVariants({ variant, padding }), className)} {...props} />
  )
}

export function cardStyles({
  variant = 'default',
  padding = 'md',
  className,
}: {
  variant?: CardVariant
  padding?: CardPadding
  className?: string
} = {}) {
  return cn(cardVariants({ variant, padding }), className)
}