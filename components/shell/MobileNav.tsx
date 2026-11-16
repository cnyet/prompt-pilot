'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/Icon'
import { t } from '@/lib/i18n/zh'
import { WORKSPACE_NAV } from '@/lib/ui/nav'
import { cn } from '@/lib/utils'

/**
 * 窄屏底部主导航（<1024px）。
 *
 * 桌面左轨在 lg 以下隐藏，这里固定四项入口；底部占位由 workspace layout
 * 提供，避免页面内容被固定导航遮挡。入口顺序与桌面左轨共用 WORKSPACE_NAV。
 */
export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="移动端主导航"
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-4 gap-1 border-t border-line bg-sidebar px-2 lg:hidden"
    >
      {WORKSPACE_NAV.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        const label = t(item.labelKey)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control px-1 py-1 text-caption transition-colors duration-150',
              active
                ? 'bg-accent-subtle font-medium text-accent shadow-[var(--glow-gold)]'
                : 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
            )}
          >
            <Icon name={item.icon} size={18} className="shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
