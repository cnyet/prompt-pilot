import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Icon, type IconName } from './Icon'

/**
 * 全站按钮（ADR 0005：shadcn 工程模式 + 项目 token；DESIGN.md 5.1）。
 * 四级：
 * - primary     当前页面唯一的主操作，一屏最多一个
 * - secondary   次要操作，金色描边
 * - ghost       工具栏操作，无边框，hover 有底
 * - destructive 危险操作，深红底配浅色文字
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-control border font-medium whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary:
          'border-accent-hover bg-accent text-on-accent shadow-sm hover:bg-accent-hover active:bg-accent-hover focus-visible:outline-accent',
        secondary:
          'border-accent bg-transparent text-accent hover:bg-accent-subtle active:bg-accent-subtle focus-visible:outline-accent disabled:border-line-subtle',
        ghost:
          'border-transparent bg-transparent text-ink-muted hover:bg-surface-raised hover:text-ink active:bg-surface-inset focus-visible:outline-accent',
        destructive:
          'border-danger-fill bg-danger-fill text-on-danger-fill hover:bg-[#7F1D1D] active:bg-[#7F1D1D] focus-visible:outline-danger',
      },
      size: {
        sm: 'h-8 px-3 text-caption',
        md: 'h-10 px-4 text-label',
        lg: 'h-12 px-5 text-body',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
)

/** 供 Link 或自定义元素复用同一套样式，避免“链接长得像按钮却不是按钮”的分叉。 */
export function buttonStyles({
  variant = 'secondary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}) {
  return cn(buttonVariants({ variant, size, className }))
}

function iconSizeFor(size: ButtonSize) {
  if (size === 'sm') return 14
  if (size === 'lg') return 16
  return 15
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  iconRight?: IconName
  /** 合成一个子元素（通常是 Link）继承按钮样式，取代 buttonStyles 拼链接。 */
  asChild?: boolean
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  asChild = false,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  const iconSize = iconSizeFor(size)
  return (
    <Comp
      type={asChild ? undefined : type}
      className={cn(buttonVariants({ variant, size, className }))}
      {...rest}
    >
      {asChild ? (
        children
      ) : (
        <>
          {icon ? <Icon name={icon} size={iconSize} /> : null}
          {children}
          {iconRight ? <Icon name={iconRight} size={iconSize} /> : null}
        </>
      )}
    </Comp>
  )
}

/** 图标按钮。必须给 aria-label，否则读屏用户只知道“按钮” */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: IconName
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  const box = size === 'sm' ? 'size-8' : size === 'lg' ? 'size-12' : 'size-10'
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(buttonVariants({ variant, size }), box, 'px-0', className)}
      {...rest}
    >
      <Icon name={icon} size={iconSizeFor(size)} />
    </button>
  )
}