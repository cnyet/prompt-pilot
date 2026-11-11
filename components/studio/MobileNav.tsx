'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'

const NAV: ReadonlyArray<{ href: string; label: string; icon: IconName }> = [
  { href: '/studio', label: '工作台', icon: 'studio' },
  { href: '/library', label: '提示词库', icon: 'library' },
  { href: '/eval', label: '评估', icon: 'eval' },
  { href: '/templates', label: '模板', icon: 'template' },
  { href: '/settings', label: '设置', icon: 'settings' },
]

/**
 * 窄屏下的主导航。桌面左轨在 1024px 以下隐藏，这里在内容顶部提供同一组
 * 入口；入口顺序与桌面左轨保持一致，避免两处导航漂移。
 */
export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="移动端主导航"
      className="sticky top-0 z-20 grid grid-cols-5 gap-1 border-b border-line bg-sidebar px-2 py-1.5 lg:hidden"
    >
      {NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1 text-caption transition-colors sm:flex-row sm:gap-1.5 sm:px-2 sm:text-label',
              active
                ? 'bg-accent-subtle font-medium text-accent'
                : 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
            )}
          >
            <Icon name={item.icon} size={15} className="shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
