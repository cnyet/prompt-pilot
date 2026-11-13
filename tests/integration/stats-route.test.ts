import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GET as getStatsRoute } from '@/app/api/stats/route'
import { disconnectPrisma, getPrisma } from '@/lib/db/prisma'
import type { V3Stats } from '@/lib/llm/stats-v3'
import {
  BUDGET_SETTING_KEY,
  invalidateSettingsCache,
  saveBudgetSetting,
} from '@/lib/settings/store'

interface InsertCallInput {
  stage: string
  costCny?: number | null
  modelId?: string
}

async function insertCall(input: InsertCallInput): Promise<void> {
  const prisma = getPrisma()
  if (!prisma) {
    throw new Error('测试数据库不可用')
  }
  await prisma.llmCall.create({
    data: {
      stage: input.stage,
      provider: 'mock',
      modelId: input.modelId ?? 'mock-model',
      status: 'succeeded',
      tokensIn: 10,
      tokensOut: 20,
      cachedTokens: 0,
      costCny: input.costCny === undefined ? null : input.costCny,
    },
  })
}

async function resetLedgerAndBudget(): Promise<void> {
  const prisma = getPrisma()
  if (!prisma) {
    return
  }
  await prisma.llmCall.deleteMany({})
  await prisma.appSetting.deleteMany({ where: { key: BUDGET_SETTING_KEY } })
  invalidateSettingsCache()
}

async function getStatsBody(response: Response): Promise<V3Stats> {
  return (await response.json()) as V3Stats
}

beforeEach(async () => {
  await resetLedgerAndBudget()
})

afterAll(async () => {
  await resetLedgerAndBudget()
  await disconnectPrisma()
})

describe('GET /api/stats', () => {
  it('返回 v3 聚合：两行账本、预算使用率与 14 天趋势', async () => {
    await insertCall({ stage: 'generate', costCny: 1.5 })
    await insertCall({ stage: 'optimize', costCny: 2.5 })
    await saveBudgetSetting(100)
    invalidateSettingsCache()

    const response = await getStatsRoute()
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')

    const body = await getStatsBody(response)
    expect(body.month.calls).toBe(2)
    expect(body.month.knownCostCalls).toBe(2)
    expect(body.month.unknownCostCalls).toBe(0)
    expect(body.month.costCny).toBe(4)
    expect(body.month.averageCostCny).toBe(2)
    expect(body.month.budgetCny).toBe(100)
    expect(body.month.budgetUsage).toBe(0.04)
    expect(body.daily).toHaveLength(14)
    expect(body.byStage.map((bucket) => bucket.key).sort()).toEqual([
      'generate',
      'optimize',
    ])
    expect(body).not.toHaveProperty('total')
  })

  it('未知费用单独计数，不影响已知金额求和', async () => {
    await insertCall({ stage: 'generate', costCny: 3 })
    await insertCall({ stage: 'repair', costCny: null })

    const body = await getStatsBody(await getStatsRoute())
    expect(body.month.calls).toBe(2)
    expect(body.month.knownCostCalls).toBe(1)
    expect(body.month.unknownCostCalls).toBe(1)
    expect(body.month.costCny).toBe(3)
    expect(body.month.averageCostCny).toBe(3)
  })

  it('未设置预算时 budgetCny 与 budgetUsage 为 null', async () => {
    await insertCall({ stage: 'generate', costCny: 1 })

    const body = await getStatsBody(await getStatsRoute())
    expect(body.month.budgetCny).toBeNull()
    expect(body.month.budgetUsage).toBeNull()
  })

  it('compose 行不计入 month.calls 与 byStage', async () => {
    await insertCall({ stage: 'generate', costCny: 1 })
    await insertCall({ stage: 'compose', costCny: 99 })

    const body = await getStatsBody(await getStatsRoute())
    expect(body.month.calls).toBe(1)
    expect(body.month.costCny).toBe(1)
    expect(body.byStage.some((bucket) => bucket.key === 'compose')).toBe(false)
    expect(
      body.byModel.reduce((total, bucket) => total + bucket.calls, 0),
    ).toBe(1)
  })

  it('零账本时返回 200 与零值月份，不伪造调用', async () => {
    const response = await getStatsRoute()
    expect(response.status).toBe(200)
    const body = await getStatsBody(response)
    expect(body.month.calls).toBe(0)
    expect(body.month.costCny).toBe(0)
    expect(body.month.averageCostCny).toBeNull()
    expect(body.byStage).toEqual([])
    expect(body.daily.every((day) => day.calls === 0)).toBe(true)
  })
})
