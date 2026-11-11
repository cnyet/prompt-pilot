'use client'

import Link from 'next/link'

import { BrandMark } from '@/components/brand/BrandMark'
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

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

/** 日期在挂载后再算，避免服务端与浏览器时区不一致导致 hydration 对不上。 */
function formatToday(): string {
  const parts = dateFormatter.formatToParts(new Date())
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('year')} 年 ${pick('month')} 月 ${pick('day')} 日 · ${pick('weekday')}`
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(false)
  const [dark, setDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [today, setToday] = useState('')

  useEffect(() => {
    setMounted(true)
    setToday(formatToday())
    try {
      setExpanded(localStorage.getItem('pp-nav-expanded') === '1')
      setDark(document.documentElement.classList.contains('dark'))
    } catch {
      // 隐私模式下 localStorage 可能不可用，保持默认即可
    }
  }, [])

  const toggleNav = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev
      try {
        localStorage.setItem('pp-nav-expanded', next ? '1' : '0')
      } catch {}
      return next
    })
  }, [])

  // `\` 展开或收起左轨标签。在输入框里按下时不拦截，避免打断写作。
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
  const width = expanded ? 208 : 64

  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-ink">
      <aside
        className="hidden shrink-0 flex-col border-r border-line bg-sidebar lg:flex"
        style={{ width }}
      >
        <div
          className={cn(
            'flex h-[72px] items-center border-b border-line-subtle',
            expanded ? 'gap-2.5 px-3' : 'justify-center px-0',
          )}
        >
          <BrandMark size={40} className="text-accent" />
          {expanded ? (
            <span className="truncate text-label font-medium text-ink">
              PromptPilot
            </span>
          ) : null}
        </div>

        <nav className="flex flex-1 flex-col gap-1.5 p-3" aria-label="主导航">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                title={expanded ? undefined : item.label}
                className={cn(
                  'flex h-10 items-center rounded-control border transition-colors duration-150',
                  expanded ? 'gap-2.5 px-2.5' : 'w-10 justify-center',
                  active
                    ? 'border-accent bg-accent-subtle font-medium text-accent shadow-[var(--glow-gold)]'
                    : 'border-transparent text-ink-muted hover:bg-surface-raised hover:text-ink',
                )}
              >
                <Icon
                  name={item.icon}
                  size={18}
                  className={active ? 'text-accent' : 'text-ink-faint'}
                />
                <span className={cn('truncate text-label', !expanded && 'sr-only')}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        <div
          className={cn(
            'flex flex-col gap-1.5 border-t border-line-subtle p-3',
            !expanded && 'items-center',
          )}
        >
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
          <IconButton
            icon="panel"
            label={expanded ? '收起导航标签' : '展开导航标签'}
            onClick={toggleNav}
            aria-expanded={expanded}
            size="sm"
          />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center gap-6 border-b border-line bg-bg px-6 lg:px-8">
          <h1 className="font-display text-h2 font-semibold leading-tight text-ink">
            {pageLabel}
          </h1>
          {today.length > 0 ? (
            <span className="hidden border-l border-line-subtle pl-4 text-caption text-ink-faint tnum sm:inline">
              {today}
            </span>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ModelStatusBadge />
            <IconButton
              icon="search"
              label="打开命令面板（⌘K）"
              size="sm"
              onClick={() => {
                window.dispatchEvent(
                  new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
                )
              }}
            />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <div className="flex min-h-full flex-col">
            <div className="flex-1">{children}</div>
            <footer className="border-t border-line-subtle px-6 py-4 text-caption text-ink-faint lg:px-8">
              © 2026 PromptPilot · 本地优先的提示词工坊
            </footer>
          </div>
        </main>
        <CommandPalette onToggleTheme={toggleTheme} />
      </div>
    </div>
  )
}