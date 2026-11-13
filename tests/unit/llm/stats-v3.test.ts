import { describe, expect, it } from 'vitest'
import type { LlmCallStatsRow } from '@/lib/llm/ledger'
import { V3_STAGES, summarizeV3Stats } from '@/lib/llm/stats-v3'

/** 上海 11 月 13 日 12:00，避免测试依赖运行机器的真实时钟。 */
const NOW = new Date('2026-11-13T04:00:00Z')

function row(overrides: Partial<LlmCallStatsRow> = {}): LlmCallStatsRow {
  return {
    stage: 'generate',
    modelId: 'doubao-pro',
    status: 'succeeded',
    tokensIn: 10,
    tokensOut: 20,
    cachedTokens: 0,
    reasoningTokens: null,
    costCny: 0.01,
    createdAt: '2026-11-12T02:00:00.000Z',
    ...overrides,
  }
}

describe('summarizeV3Stats', () => {
  it('只统计 generate/optimize/repair，compose/evaluate 被排除', () => {
    const stats = summarizeV3Stats(
      [
        row({ stage: 'generate' }),
        row({ stage: 'optimize' }),
        row({ stage: 'repair' }),
        row({ stage: 'compose' }),
        row({ stage: 'evaluate' }),
      ],
      null,
      NOW,
    )

    expect(V3_STAGES).toEqual(['generate', 'optimize', 'repair'])
    expect(stats.byStage.map((bucket) => bucket.key).sort()).toEqual([
      'generate',
      'optimize',
      'repair',
    ])
    expect(stats.month.calls).toBe(3)
    expect(
      stats.byModel.reduce((total, bucket) => total + bucket.calls, 0),
    ).toBe(3)
  })

  it('当月费用只累加已知成本，并统计未知调用数', () => {
    const stats = summarizeV3Stats(
      [
        row({ costCny: 0.25 }),
        row({ costCny: null }),
        row({ costCny: 0.5 }),
      ],
      null,
      NOW,
    )

    expect(stats.month.calls).toBe(3)
    expect(stats.month.knownCostCalls).toBe(2)
    expect(stats.month.unknownCostCalls).toBe(1)
    expect(stats.month.costCny).toBe(0.75)
    expect(stats.month.averageCostCny).toBe(0.375)
  })

  it('月费求和按 round6 归一：0.1 + 0.2 为 0.3', () => {
    const stats = summarizeV3Stats(
      [row({ costCny: 0.1 }), row({ costCny: 0.2 })],
      null,
      NOW,
    )

    expect(stats.month.costCny).toBe(0.3)
  })

  it('全部成本未知时 costCny 与 averageCostCny 为 null', () => {
    const stats = summarizeV3Stats(
      [row({ costCny: null }), row({ costCny: null })],
      null,
      NOW,
    )

    expect(stats.month.calls).toBe(2)
    expect(stats.month.knownCostCalls).toBe(0)
    expect(stats.month.unknownCostCalls).toBe(2)
    expect(stats.month.costCny).toBeNull()
    expect(stats.month.averageCostCny).toBeNull()
  })

  it('零调用时 calls 0、costCny 0、averageCostCny null、budgetUsage 0', () => {
    const stats = summarizeV3Stats([], 100, NOW)

    expect(stats.month.calls).toBe(0)
    expect(stats.month.knownCostCalls).toBe(0)
    expect(stats.month.unknownCostCalls).toBe(0)
    expect(stats.month.costCny).toBe(0)
    expect(stats.month.averageCostCny).toBeNull()
    expect(stats.month.budgetCny).toBe(100)
    expect(stats.month.budgetUsage).toBe(0)
  })

  it('未设置预算时 budgetCny 与 budgetUsage 为 null', () => {
    const stats = summarizeV3Stats([row({ costCny: 80 })], null, NOW)

    expect(stats.month.budgetCny).toBeNull()
    expect(stats.month.budgetUsage).toBeNull()
  })

  it('预算 100、已知费用 80 时使用率为 0.8', () => {
    const stats = summarizeV3Stats([row({ costCny: 80 })], 100, NOW)

    expect(stats.month.budgetCny).toBe(100)
    expect(stats.month.budgetUsage).toBe(0.8)
  })

  it('跨月按上海时区切分：10 月 31 日 23:59 不计入 11 月，但仍进 14 天趋势', () => {
    const stats = summarizeV3Stats(
      [
        // 上海 2026-10-31 23:59
        row({ costCny: 10, createdAt: '2026-10-31T15:59:00.000Z' }),
        // 上海 2026-11-01 00:00
        row({ costCny: 1, createdAt: '2026-10-31T16:00:00.000Z' }),
      ],
      null,
      NOW,
    )

    expect(stats.month.key).toBe('2026-11')
    expect(stats.month.calls).toBe(1)
    expect(stats.month.costCny).toBe(1)
    expect(stats.month.averageCostCny).toBe(1)

    const oct31 = stats.daily.find((day) => day.date === '2026-10-31')
    expect(oct31?.calls).toBe(1)
    expect(oct31?.costCny).toBe(10)
    const nov1 = stats.daily.find((day) => day.date === '2026-11-01')
    expect(nov1?.calls).toBe(1)
  })

  it('createdAt 缺失或非法的行不计入当月 KPI，但仍参与模型与阶段聚合', () => {
    const stats = summarizeV3Stats(
      [row({ createdAt: null }), row({ createdAt: 'not-a-date' })],
      100,
      NOW,
    )

    expect(stats.month.calls).toBe(0)
    expect(stats.month.costCny).toBe(0)
    expect(stats.month.budgetUsage).toBe(0)
    expect(stats.byModel[0]?.calls).toBe(2)
    expect(stats.byStage[0]?.calls).toBe(2)
    expect(stats.daily.every((day) => day.calls === 0)).toBe(true)
  })

  it('daily 固定 14 天并按日期升序，byStage 使用中文阶段标签', () => {
    const stats = summarizeV3Stats(
      [
        row({ stage: 'generate' }),
        row({ stage: 'optimize' }),
        row({ stage: 'repair' }),
      ],
      null,
      NOW,
    )

    expect(stats.daily).toHaveLength(14)
    expect(stats.daily[0]?.date).toBe('2026-10-31')
    expect(stats.daily[13]?.date).toBe('2026-11-13')
    const dates = stats.daily.map((day) => day.date)
    expect([...dates].sort()).toEqual(dates)

    const labels = Object.fromEntries(
      stats.byStage.map((bucket) => [bucket.key, bucket.label]),
    )
    expect(labels).toEqual({
      generate: '生成',
      optimize: '优化',
      repair: '修复',
    })
    expect(stats.generatedAt).toBe(NOW.toISOString())
  })
})
