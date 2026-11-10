'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon, type IconName } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'

interface Command {
  id: string
  label: string
  hint?: string
  icon: IconName
  group: '导航' | '动作'
  run: () => void
}

/**
 * ⌘K 命令面板。
 *
 * DESIGN.md 与设置页的快捷键表都写着它，之前一直没实现。
 * 零依赖：自己处理开合、过滤、方向键与回车，焦点落在输入框。
 */
export function CommandPalette({ onToggleTheme }: { onToggleTheme: () => void }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }, [])

  const commands = useMemo<Command[]>(
    () => [
      {
        id: 'studio',
        label: '工作台',
        hint: '输入一句话生成提示词',
        icon: 'studio',
        group: '导航',
        run: () => router.push('/studio'),
      },
      {
        id: 'library',
        label: '提示词库',
        hint: '查看已保存的提示词与版本',
        icon: 'library',
        group: '导航',
        run: () => router.push('/library'),
      },
      {
        id: 'eval',
        label: '评估',
        icon: 'eval',
        group: '导航',
        run: () => router.push('/eval'),
      },
      {
        id: 'templates',
        label: '模板',
        icon: 'template',
        group: '导航',
        run: () => router.push('/templates'),
      },
      {
        id: 'settings',
        label: '设置',
        hint: '密钥、端点与模型',
        icon: 'settings',
        group: '导航',
        run: () => router.push('/settings'),
      },
      {
        id: 'theme',
        label: '切换主题',
        hint: '浅色与深色',
        icon: 'moon',
        group: '动作',
        run: onToggleTheme,
      },
    ],
    [router, onToggleTheme],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length === 0) {
      return commands
    }
    return commands.filter((command) =>
      `${command.label} ${command.hint ?? ''}`.toLowerCase().includes(q),
    )
  }, [commands, query])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((previous) => !previous)
        return
      }
      if (!open) {
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
      return () => window.clearTimeout(timer)
    }
    return undefined
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  if (!open) {
    return null
  }

  const pick = (command: Command | undefined) => {
    if (!command) {
      return
    }
    close()
    command.run()
  }

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      pick(filtered[activeIndex])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 px-4 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close()
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        className="reveal w-full max-w-[520px] overflow-hidden rounded-overlay border border-line-strong bg-surface-raised shadow-overlay"
      >
        <div className="flex items-center gap-2 border-b border-line-subtle px-3">
          <Icon name="search" size={15} className="text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="搜索页面或动作"
            aria-label="搜索页面或动作"
            aria-controls="command-list"
            aria-activedescendant={
              filtered[activeIndex] ? `command-${filtered[activeIndex].id}` : undefined
            }
            className="h-11 w-full bg-transparent text-body text-ink placeholder:text-ink-faint focus:outline-none"
          />
          <kbd className="rounded-chip border border-line px-1.5 py-0.5 text-caption text-ink-faint">
            Esc
          </kbd>
        </div>

        <ul
          id="command-list"
          ref={listRef}
          role="listbox"
          aria-label="命令列表"
          className="max-h-[320px] overflow-auto p-1.5"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-caption text-ink-muted">
              没有匹配的页面或动作。
            </li>
          ) : (
            filtered.map((command, index) => (
              <li key={command.id}>
                <button
                  id={`command-${command.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(command)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left transition-colors duration-150',
                    index === activeIndex
                      ? 'bg-bg-sunken text-ink'
                      : 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
                  )}
                >
                  <Icon name={command.icon} size={15} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-label font-medium">{command.label}</span>
                    {command.hint ? (
                      <span className="truncate text-caption text-ink-faint">
                        {command.hint}
                      </span>
                    ) : null}
                  </span>
                  <span className="ml-auto text-caption text-ink-faint">
                    {command.group}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
