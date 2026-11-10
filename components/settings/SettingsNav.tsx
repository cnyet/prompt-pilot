'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

const SECTIONS = [
  { id: 'settings-model', label: '模型' },
  { id: 'settings-cost', label: '成本' },
  { id: 'settings-data', label: '数据' },
  { id: 'settings-shortcuts', label: '快捷键' },
] as const

/**
 * 设置页左侧锚点导航。
 * 高亮用 IntersectionObserver，不监听 scroll。
 */
export function SettingsNav() {
  const [active, setActive] = useState<string>(SECTIONS[0].id)

  useEffect(() => {
    const elements = SECTIONS.map((section) =>
      document.getElementById(section.id),
    ).filter((element): element is HTMLElement => element !== null)
    if (elements.length === 0) {
      return
    }

    const visible = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          visible.set(entry.target.id, entry.isIntersecting)
        }
        const next = SECTIONS.map((section) => section.id).find((id) =>
          visible.get(id),
        )
        if (next) {
          setActive(next)
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    )
    for (const element of elements) {
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <nav
      aria-label="设置分区"
      className="sticky top-8 hidden w-40 shrink-0 flex-col gap-0.5 self-start lg:flex"
    >
      {SECTIONS.map((section) => {
        const current = section.id === active
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={current ? 'true' : undefined}
            className={cn(
              'rounded-control px-2.5 py-1.5 text-label transition-colors duration-150',
              current
                ? 'bg-bg-sunken font-medium text-ink'
                : 'text-ink-muted hover:bg-bg-sunken hover:text-ink',
            )}
          >
            {section.label}
          </a>
        )
      })}
    </nav>
  )
}
