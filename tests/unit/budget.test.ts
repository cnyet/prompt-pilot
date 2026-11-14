import { describe, expect, it } from 'vitest'
import {
  budgetLevel,
  formatBudgetPercent,
  formatBudgetUsage,
} from '@/lib/budget'

describe('月度预算阈值与格式（FR-9.5/9.6）', () => {
  it('未设置或未知使用率不返回级别', () => {
    expect(budgetLevel(null)).toBeNull()
    expect(budgetLevel(Number.NaN)).toBeNull()
  })

  it('80% 起提示，100% 起超额', () => {
    expect(budgetLevel(0.79)).toBe('ok')
    expect(budgetLevel(0.8)).toBe('warning')
    expect(budgetLevel(0.99)).toBe('warning')
    expect(budgetLevel(1)).toBe('over')
    expect(budgetLevel(1.2)).toBe('over')
  })

  it('百分比最多保留一位小数', () => {
    expect(formatBudgetPercent(0.04)).toBe('4%')
    expect(formatBudgetPercent(0.0325)).toBe('3.3%')
    expect(formatBudgetPercent(0)).toBe('0%')
  })

  it('未设置预算显示未设置，未知使用率显示破折号', () => {
    expect(formatBudgetUsage(null, null)).toBe('未设置')
    expect(formatBudgetUsage(null, 0.5)).toBe('未设置')
    expect(formatBudgetUsage(100, null)).toBe('—')
    expect(formatBudgetUsage(100, 0.8)).toBe('80%')
  })
})
