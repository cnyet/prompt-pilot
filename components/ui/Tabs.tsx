'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'

export interface TabItem {
  value: string
  label: React.ReactNode
  /** 计数用 12px 弱化数字，不抢标签。 */
  count?: React.ReactNode
  disabled?: boolean
}

/**
 * 标签页（DESIGN.md 5.6）。受控组件，选中态靠底部 2px 金色描边。
 * 方向键 / Home / End 自动激活，符合 ARIA tabs 的键盘约定。
 */
export function Tabs({
  items,
  value,
  onValueChange,
  ariaLabel,
  className,
}: {
  items: readonly TabItem[]
  value: string
  onValueChange: (value: string) => void
  ariaLabel?: string
  className?: string
}) {
  const refs = useRef(new Map<string, HTMLButtonElement | null>())

  function activate(item: TabItem) {
    if (item.disabled) return
    onValueChange(item.value)
    refs.current.get(item.value)?.focus()
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const enabled = items.filter((item) => !item.disabled)
    if (enabled.length === 0) return
    const current = enabled.findIndex((item) => item.value === value)
    if (current < 0) return

    let next = current
    if (event.key === 'ArrowRight') next = (current + 1) % enabled.length
    else if (event.key === 'ArrowLeft')
      next = (current - 1 + enabled.length) % enabled.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = enabled.length - 1
    else return

    event.preventDefault()
    const target = enabled[next]
    if (target) activate(target)
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex items-center gap-1 overflow-x-auto border-b border-line-subtle',
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current.set(item.value, node)
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => activate(item)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-label transition-colors duration-150',
              selected
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
              item.disabled && 'pointer-events-none opacity-40',
            )}
          >
            {item.label}
            {item.count !== undefined && item.count !== null ? (
              <span className="text-caption text-ink-faint tnum">
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}