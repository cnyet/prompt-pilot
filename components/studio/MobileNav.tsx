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
              'inline-flex shrink-0 items-center gap-1.5 rounded-control px-2.5 py-1.5 text-label transition-colors',
              active
                ? 'bg-accent-subtle font-medium text-accent'
                : 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
            )}
          >
            <Icon name={item.icon} size={15} />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
