import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * 状态与假设 chip（DESIGN.md 5.3）。2px 圆角、12px 起、最小 24px 高。
 * 语义色永远同时给文字与圆点，不靠颜色单独表达状态。
 */
const chipVariants = cva(
  'inline-flex min-h-6 items-center gap-1.5 rounded-chip border px-2.5 py-0.5 text-caption whitespace-nowrap transition-colors duration-150',
  {
    variants: {
      tone: {
        default: 'border-line bg-surface text-ink-muted',
        accent: 'border-line bg-tint-gold text-accent',
        success: 'border-transparent bg-tint-green text-success',
        warning: 'border-transparent bg-tint-gold text-warning',
        error: 'border-transparent bg-tint-red text-danger',
        info: 'border-transparent bg-tint-purple text-info',
      },
      selected: {
        true: 'border-accent bg-accent text-on-accent',
        false: '',
      },
      interactive: {
        true: 'cursor-pointer hover:border-line-strong',
        false: '',
      },
    },
    compoundVariants: [
      {
        tone: 'accent',
        interactive: true,
        className: 'hover:bg-accent-subtle hover:text-accent',
      },
    ],
    defaultVariants: {
      tone: 'default',
      selected: false,
      interactive: false,
    },
  },
)

export type ChipTone = NonNullable<
  VariantProps<typeof chipVariants>['tone']
>

type ChipProps = Omit<React.HTMLAttributes<HTMLElement>, 'onClick'> & {
  tone?: ChipTone
  selected?: boolean
  onClick?: React.MouseEventHandler<HTMLButtonElement>
  onRemove?: () => void
  /** 移除按钮的无障碍标签，默认“移除”。 */
  removeLabel?: string
}

const DOT_TONES: ReadonlySet<ChipTone> = new Set([
  'success',
  'warning',
  'error',
  'info',
])

export function Chip({
  tone = 'default',
  selected = false,
  onClick,
  onRemove,
  removeLabel = '移除',
  className,
  children,
  ...rest
}: ChipProps) {
  const content = (
    <>
      {DOT_TONES.has(tone) && !selected ? (
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      ) : null}
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="-mr-1 ml-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-chip text-current opacity-70 transition-opacity hover:opacity-100"
        >
          <svg
            aria-hidden
            viewBox="0 0 10 10"
            width="10"
            height="10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" />
          </svg>
        </button>
      ) : null}
    </>
  )

  const classes = cn(
    chipVariants({ tone, selected, interactive: Boolean(onClick) }),
    className,
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} {...rest}>
        {content}
      </button>
    )
  }

  return (
    <span className={classes} {...rest}>
      {content}
    </span>
  )
}

export function chipStyles({
  tone = 'default',
  selected = false,
  className,
}: {
  tone?: ChipTone
  selected?: boolean
  className?: string
} = {}) {
  return cn(chipVariants({ tone, selected }), className)
}