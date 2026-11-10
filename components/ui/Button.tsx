import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Icon, type IconName } from './Icon'

/**
 * 全站按钮（ADR 0005：shadcn 工程模式 + 项目 token）。四级：
 * - primary   当前页面唯一的主操作，一屏最多一个
 * - secondary 次要操作，描边
 * - ghost     工具栏操作，无边框，hover 有底
 * - quiet     纯文字，用于行内或低优先
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'quiet'
export type ButtonSize = 'sm' | 'md'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-control font-medium whitespace-nowrap transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-on-accent hover:bg-accent-hover focus-visible:outline-accent',
        secondary:
          'border border-line bg-surface text-ink hover:border-line-strong hover:bg-bg-sunken',
        ghost: 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
        quiet: 'text-ink-muted hover:text-ink',
      },
      size: {
        sm: 'h-7 px-2.5 text-caption',
        md: 'h-8 px-3 text-label',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
)

/** 供 Link 或自定义元素复用同一套样式，避免"链接长得像按钮却不是按钮"的分叉。 */
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
          {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 15} /> : null}
          {children}
          {iconRight ? (
            <Icon name={iconRight} size={size === 'sm' ? 14 : 15} />
          ) : null}
        </>
      )}
    </Comp>
  )
}

/** 图标按钮。必须给 aria-label，否则读屏用户只知道"按钮" */
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
  const box = size === 'sm' ? 'size-7' : 'size-8'
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(buttonVariants({ variant, size }), box, 'px-0', className)}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 14 : 15} />
    </button>
  )
}
