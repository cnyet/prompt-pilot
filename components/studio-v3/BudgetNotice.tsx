'use client'

import { useEffect, useState, type ReactElement } from 'react'
import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { budgetLevel, formatBudgetPercent } from '@/lib/budget'
import { t } from '@/lib/i18n/zh'
import { cn } from '@/lib/utils'
import { fetchV3Stats } from './api'

/**
 * 月度预算提示（FR-9.5）。
 *
 * 挂载时读一次成本统计；未设置预算、费用未知或请求失败都静默不显示。
 * 使用率达到 80% 提示，达到 100% 用 danger 样式强提示但不阻断调用。
 */
export function BudgetNotice(): ReactElement | null {
  const [usage, setUsage] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    fetchV3Stats()
      .then((stats) => {
        if (alive) setUsage(stats.month.budgetUsage)
      })
      .catch(() => {
        // 预算提示是辅助信息，读取失败不打断工作台
      })
    return () => {
      alive = false
    }
  }, [])

  if (usage === null) return null
  const level = budgetLevel(usage)
  if (level === null || level === 'ok') return null

  const over = level === 'over'
  const percent = formatBudgetPercent(usage)

  return (
    <p
      role={over ? 'alert' : 'status'}
      className={cn(
        'mb-3 flex flex-wrap items-center gap-2 rounded-control px-3 py-2 text-caption',
        over ? 'bg-tint-red text-danger' : 'bg-tint-gold text-warning',
      )}
    >
      <Icon name="alert" size={14} />
      <span className="tabular-nums">
        {over
          ? t('studio.budget.over', { percent })
          : t('studio.budget.warning', { percent })}
      </span>
      <Link
        href="/settings#settings-cost"
        className="text-accent underline decoration-line-strong underline-offset-2 transition-colors hover:text-accent-hover"
      >
        {t('studio.budget.link')}
      </Link>
    </p>
  )
}
