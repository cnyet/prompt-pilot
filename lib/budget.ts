/**
 * 月度预算的展示规则（FR-9.5/9.6）。
 *
 * 纯函数、客户端安全：设置页与工作台提示共用同一套阈值，
 * 避免两处各写一份 80% / 100% 判断。
 */

export type BudgetLevel = 'ok' | 'warning' | 'over'

const WARN_THRESHOLD = 0.8
const OVER_THRESHOLD = 1

const percentFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export function budgetLevel(usage: number | null): BudgetLevel | null {
  if (usage === null || !Number.isFinite(usage)) {
    return null
  }
  if (usage >= OVER_THRESHOLD) {
    return 'over'
  }
  if (usage >= WARN_THRESHOLD) {
    return 'warning'
  }
  return 'ok'
}

export function formatBudgetPercent(usage: number): string {
  return percentFormatter.format(usage)
}

/** 预算未设置优先于使用率未知；两者都不写 0。 */
export function formatBudgetUsage(
  budgetCny: number | null,
  usage: number | null,
): string {
  if (budgetCny === null) {
    return '未设置'
  }
  if (usage === null) {
    return '—'
  }
  return formatBudgetPercent(usage)
}
