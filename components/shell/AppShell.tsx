'use client'

import Link from 'next/link'

import { ModelStatusBadge } from '@/components/studio/modelStatus'
import { CommandPalette } from './CommandPalette'
import { IconButton } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/studio', label: '工作台', icon: 'studio' },
  { href: '/library', label: '提示词库', icon: 'library' },
  { href: '/eval', label: '评估', icon: 'eval' },
  { href: '/templates', label: '模板', icon: 'template' },
  { href: '/settings', label: '设置', icon: 'settings' },
] as const satisfies ReadonlyArray<{
  href: string
  label: string
  icon: IconName
}>

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

  // `\` 折叠侧栏。在输入框里按下时不拦截，避免打断写作。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '\\' || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }
      const target = event.target as HTMLElement | null
      const tag = target?.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return
      }
      event.preventDefault()
      toggleNav()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleNav])

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
        <div
          className={cn(
            'flex h-12 items-center gap-2 border-b border-line-subtle px-3',
            collapsed && 'justify-center px-0',
          )}
        >
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
                  'group flex h-8 items-center gap-2.5 rounded-control px-2 text-label transition-colors duration-150',
                  active
                    ? 'bg-bg-sunken font-medium text-accent'
                    : 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
                  collapsed && 'justify-center px-0',
                )}
              >
                <Icon
                  name={item.icon}
                  size={16}
                  className={
                    active
                      ? 'text-accent'
                      : 'text-ink-faint group-hover:text-ink'
                  }
                />
                <span className={cn('truncate', collapsed && 'sr-only')}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        <div
          className={cn(
            'flex border-t border-line-subtle p-2',
            collapsed ? 'justify-center' : 'justify-end',
          )}
        >
          <IconButton
            icon="panel"
            label={collapsed ? '展开导航' : '折叠导航'}
            onClick={toggleNav}
            aria-expanded={!collapsed}
            size="sm"
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
          <div className="flex min-w-0 items-center gap-1.5 text-caption">
            <span className="text-ink-faint">工作区</span>
            <Icon name="chevron-right" size={12} className="text-ink-faint" />
            <span className="truncate text-label font-medium text-ink">
              {pageLabel}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
                )
              }}
              className="hidden items-center gap-2 rounded-control border border-line bg-surface px-2 py-1 text-caption text-ink-faint transition-colors duration-150 hover:border-line-strong hover:text-ink-muted sm:inline-flex"
              aria-label="打开命令面板"
            >
              <Icon name="search" size={13} />
              搜索
              <kbd className="rounded-chip bg-bg-sunken px-1 text-[11px]">⌘K</kbd>
            </button>
            <ModelStatusBadge />
            <span aria-hidden className="h-4 w-px bg-line-subtle" />
            <IconButton
              icon={mounted && dark ? 'sun' : 'moon'}
              label={
                !mounted
                  ? '切换主题'
                  : dark
                    ? '切换到浅色主题'
                    : '切换到深色主题'
              }
              onClick={toggleTheme}
              size="sm"
            />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
        <CommandPalette onToggleTheme={toggleTheme} />
      </div>
    </div>
  )
}
