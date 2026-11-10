'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/studio', label: '工作台' },
  { href: '/library', label: '提示词库' },
  { href: '/eval', label: '评估' },
  { href: '/templates', label: '模板' },
  { href: '/settings', label: '设置' },
] as const

/**
 * 窄屏下的主导航。侧边导航是固定 240px 的桌面布局，在手机上会把内容
 * 挤到不足 200px；这里用媒体查询隐藏侧栏，并在内容顶部提供同一组入口。
 * 入口顺序与桌面侧栏保持一致，避免两处导航漂移。
 */
export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="移动端主导航"
      className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-line bg-sidebar px-2 py-1.5 md:hidden"
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
              'shrink-0 rounded-control px-2.5 py-1 text-label transition-colors',
              active
                ? 'bg-accent-subtle font-medium text-accent'
                : 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
