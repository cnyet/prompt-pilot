'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * 文档大纲。
 *
 * 高亮用 IntersectionObserver，不监听 scroll——后者在长文档里会掉帧。
 * 观察区设在视口上方 20%-40% 之间：进入这块区域的节就是"当前在读的"。
 */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)

  useEffect(() => {
    if (ids.length === 0) {
      return
    }
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) {
      return
    }

    const visible = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(entry.target.id, entry.isIntersecting)
        }
        // 取文档顺序里第一个仍在视口带的节，保证滚动时不跳号
        const next = ids.find((id) => visible.get(id))
        if (next) {
          setActive(next)
        }
      },
      { rootMargin: '-15% 0px -65% 0px', threshold: 0 },
    )

    for (const element of elements) {
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [ids])

  return active
}

export interface OutlineItem {
  id: string
  label: string
}

export function OutlineRail({
  items,
  activeId,
  className,
}: {
  items: readonly OutlineItem[]
  activeId: string | null
  className?: string
}) {
  return (
    <nav aria-label="文档大纲" className={cn('flex flex-col gap-0.5', className)}>
      <p className="mb-2 text-caption tracking-[0.14em] text-ink-faint">
        大纲
      </p>
      {items.map((item, index) => {
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              document
                .getElementById(item.id)
                ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
            }}
            aria-current={active ? 'true' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-control px-2 py-1.5 text-left text-label transition-colors duration-150',
              active
                ? 'bg-bg-sunken font-medium text-ink'
                : 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'text-caption tnum',
                active ? 'text-accent' : 'text-ink-faint',
              )}
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="truncate">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
