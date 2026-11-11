import { cn } from '@/lib/utils'

/**
 * 表单控件基座（DESIGN.md 5.2）：40px 高、4px 圆角、羊皮纸底、金色焦点环。
 * 标签 13px / helper 12px / 错误 12px 由调用方排布；控件只负责自身状态。
 */
export const inputStyles = cn(
  'w-full rounded-control border border-line bg-surface px-3 text-label text-ink',
  'transition-colors duration-150 placeholder:text-ink-faint',
  'hover:border-line-strong',
  'focus-visible:border-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/25',
  'read-only:bg-bg-sunken read-only:text-ink-muted',
  'disabled:cursor-not-allowed disabled:bg-bg-sunken disabled:text-ink-faint',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-[3px] aria-[invalid=true]:ring-danger/25',
)

export function Input({
  className,
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  /** 置 true 时同步 aria-invalid 并切到错误配色。 */
  invalid?: boolean
}) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(inputStyles, 'h-10', className)}
      {...props}
    />
  )
}

export function Textarea({
  className,
  invalid,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean
}) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(inputStyles, 'min-h-24 resize-y py-2.5', className)}
      {...props}
    />
  )
}

export function Select({
  className,
  invalid,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean
}) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(inputStyles, 'h-10 pr-8', className)}
      {...props}
    >
      {children}
    </select>
  )
}