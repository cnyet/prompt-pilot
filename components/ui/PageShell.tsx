import { cn } from '@/lib/utils'

/**
 * 页面骨架。四页共用一条 1280px 居中容器，宽度与留白完全一致；
 * 分栏与排列交给页面内部的 className 决定。
 */
export function PageShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1280px] px-6 py-8 lg:px-10',
        className,
      )}
    >
      {children}
    </div>
  )
}
