import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * 页面骨架。三种形态，五页各选其一，避免"所有页面都是居中单列"。
 *
 * - reading   单列阅读，760 宽（评估、以及将来的长文）
 * - workbench 工具型，占满可用宽度，内部自己分栏（工作台）
 * - grid      卡片网格，1280 宽（库、模板）
 */
export type ShellVariant = 'reading' | 'workbench' | 'grid'

const shellVariants = cva('', {
  variants: {
    variant: {
      reading: 'mx-auto w-full max-w-[760px] px-6 py-10 lg:px-8',
      workbench: 'w-full px-5 py-5 lg:px-7 lg:py-6',
      grid: 'mx-auto w-full max-w-[1280px] px-6 py-8 lg:px-10',
    },
  },
  defaultVariants: {
    variant: 'grid',
  },
})

export function PageShell({
  variant = 'grid',
  children,
  className,
}: {
  variant?: ShellVariant
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn(shellVariants({ variant }), className)}>{children}</div>
}
