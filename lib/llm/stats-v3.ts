import { getPrisma } from '@/lib/db/prisma'
import {
  summarizeCalls,
  type CostBucket,
  type CostDay,
  type LlmCallStatsRow,
} from '@/lib/llm/ledger'
import { getBudgetSetting } from '@/lib/settings/store'

/**
 * v3 成本统计：生成 / 优化 / 修复三个阶段的本月 KPI 与 14 天趋势。
 *
 * 与 v2 的 `getCostSummary` 不同，这里按上海时区切月并追加预算使用率；
 * 14 天趋势、按模型、按阶段三段直接复用 `summarizeCalls`，不重复实现。
 * null 一律表示「未知」，不写成 0。
 */

/** v3 账本阶段；v2 的 compose / evaluate 等不进入 v3 统计。 */
export const V3_STAGES = ['generate', 'optimize', 'repair'] as const

export interface V3StatsMonth {
  /** YYYY-MM，按 Asia/Shanghai 切月。 */
  key: string
  calls: number
  knownCostCalls: number
  unknownCostCalls: number
  /** 本月已知费用之和；有调用但全部未知时为 null，零调用为 0。 */
  costCny: number | null
  /** 已知调用的人均费用；没有已知费用时为 null。 */
  averageCostCny: number | null
  budgetCny: number | null
  /** 本月费用 / 预算；未设置预算或费用未知时为 null。 */
  budgetUsage: number | null
}

export interface V3Stats {
  month: V3StatsMonth
  daily: CostDay[]
  byModel: CostBucket[]
  byStage: CostBucket[]
  generatedAt: string
}

const MONTH_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
})

/** 按上海时区切月；缺失或非法时间不属于任何月份。 */
function monthKeyOf(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return MONTH_KEY_FORMATTER.format(date).replace('/', '-')
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/**
 * 纯函数聚合，方便单测直接喂行数据。
 *
 * 当月 KPI 只统计 v3 阶段且 createdAt 落在当前上海月的行；
 * 其余行（含 createdAt 缺失的行）仍交给 `summarizeCalls` 供 14 天趋势使用。
 */
export function summarizeV3Stats(
  rows: readonly LlmCallStatsRow[],
  budgetCny: number | null,
  now: Date = new Date(),
): V3Stats {
  const v3Rows = rows.filter((row) =>
    (V3_STAGES as readonly string[]).includes(row.stage),
  )
  const summary = summarizeCalls(v3Rows, now)
  const currentMonth = monthKeyOf(now)

  let calls = 0
  let knownCostCalls = 0
  let unknownCostCalls = 0
  let knownCostSum = 0

  for (const row of v3Rows) {
    const rowMonth = monthKeyOf(row.createdAt)
    if (rowMonth === null || rowMonth !== currentMonth) {
      continue
    }
    calls += 1
    if (row.costCny === null) {
      unknownCostCalls += 1
    } else {
      knownCostCalls += 1
      knownCostSum += row.costCny
    }
  }

  const costCny =
    calls > 0 && knownCostCalls === 0 ? null : round6(knownCostSum)
  const averageCostCny =
    knownCostCalls > 0 ? round6(knownCostSum / knownCostCalls) : null
  const budgetUsage =
    budgetCny === null
      ? null
      : costCny === null
        ? null
        : round6(costCny / budgetCny)

  return {
    month: {
      key: currentMonth ?? '',
      calls,
      knownCostCalls,
      unknownCostCalls,
      costCny,
      averageCostCny,
      budgetCny,
      budgetUsage,
    },
    daily: summary.daily,
    byModel: summary.byModel,
    byStage: summary.byStage,
    generatedAt: summary.generatedAt,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 读取 v3 账本并聚合。数据库不可用或查询失败时返回 null，
 * 路由据此返回 503，由界面显示暂不可用，不会渲染伪造的 0。
 */
export async function getV3Stats(
  now: Date = new Date(),
): Promise<V3Stats | null> {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }
  try {
    const [rows, budgetCny] = await Promise.all([
      prisma.llmCall.findMany({
        where: { stage: { in: [...V3_STAGES] } },
        select: {
          stage: true,
          modelId: true,
          status: true,
          tokensIn: true,
          tokensOut: true,
          cachedTokens: true,
          reasoningTokens: true,
          costCny: true,
          createdAt: true,
        },
      }),
      getBudgetSetting(),
    ])
    return summarizeV3Stats(rows, budgetCny, now)
  } catch (error) {
    console.warn('[stats-v3] 读取成本统计失败：', errorMessage(error))
    return null
  }
}
