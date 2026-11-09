'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/studio', label: '工作台' },
  { href: '/library', label: '提示词库' },
  { href: '/eval', label: '评估' },
  { href: '/templates', label: '模板' },
  { href: '/settings', label: '设置' },
] as const

const PATH_LABEL: Record<string, string> = {
  '/studio': '工作台',
  '/library': '提示词库',
  '/eval': '评估',
  '/templates': '模板',
  '/settings': '设置',
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      setCollapsed(localStorage.getItem('pp-nav-collapsed') === '1')
      setDark(document.documentElement.classList.contains('dark'))
    } catch {
      // 隐私模式下 localStorage 可能不可用，保持默认即可
    }
  }, [])

  const toggleNav = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('pp-nav-collapsed', next ? '1' : '0')
      } catch {}
      return next
    })
  }, [])

  const toggleTheme = useCallback(() => {
    setDark((prev) => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      try {
        localStorage.setItem('pp-theme', next ? 'dark' : 'light')
      } catch {}
      return next
    })
  }, [])

  const pageLabel = PATH_LABEL[pathname] ?? '工作台'
  const width = collapsed ? 56 : 240

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-ink">
      <aside
        className="flex shrink-0 flex-col border-r border-line bg-sidebar"
        style={{ width }}
      >
        <div className="flex h-12 items-center gap-2 border-b border-line px-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-chip bg-accent text-caption font-semibold text-bg">
            PP
          </span>
          {!collapsed && (
            <span className="truncate text-label font-medium">PromptPilot</span>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="主导航">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'flex h-8 items-center rounded-control px-2 text-label transition-colors duration-120',
                  active
                    ? 'bg-accent-subtle text-accent font-medium'
                    : 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
                  collapsed && 'justify-center px-0',
                )}
              >
                <span className={cn('truncate', collapsed && 'sr-only')}>
                  {item.label}
                </span>
                {collapsed && (
                  <span aria-hidden className="text-caption">
                    {item.label.slice(0, 1)}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="border-t border-line p-2">
          <button
            type="button"
            onClick={toggleNav}
            aria-label={collapsed ? '展开导航' : '折叠导航'}
            aria-expanded={!collapsed}
            className="flex h-8 w-full items-center justify-center rounded-control text-caption text-ink-faint hover:bg-bg-sunken hover:text-ink-muted"
          >
            {collapsed ? '»' : '«  折叠'}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
          <div className="flex items-center gap-2 text-label">
            <span className="text-ink-faint">工作区</span>
            <span className="text-ink-faint">/</span>
            <span className="font-medium">{pageLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <span
              className="rounded-chip border border-line px-2 py-0.5 text-caption text-ink-muted"
              title="未配置 ARK_API_KEY，当前处于离线模板模式：功能可走通，生成质量下降"
            >
              L1 离线模板
            </span>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={dark ? '切换到浅色' : '切换到深色'}
              className="h-7 rounded-control border border-line px-2 text-caption text-ink-muted hover:bg-bg-sunken hover:text-ink"
            >
              {mounted ? (dark ? '深色' : '浅色') : '主题'}
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
