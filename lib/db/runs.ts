import type { Prisma } from '@prisma/client'
import { getPrisma } from './prisma'
import type { TokenUsage } from '@/lib/llm/types'

/**
 * 试运行的落库层。
 *
 * 写入时机固定在流结束、失败或取消之后，绝不在 delta 途中写库；
 * 所有失败都只告警并返回 null，数据库问题不能影响已经流出的内容。
 */

export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'interrupted'

export interface RunWriteInput {
  sessionKey: string
  variablesJson: string
  modelId: string
  paramsJson: string
  output: string
  reasoning?: string
  status: RunStatus
  errorCode?: string
  errorMsg?: string
  latencyMs: number
  usage?: TokenUsage
  finishReason?: string
  attempts?: number
  traceId?: string
  requestId?: string
  cacheKey?: string
}

export type RunWrite = Prisma.RunUncheckedCreateInput

export interface RunStore {
  create(data: RunWrite): Promise<{ id: string }>
}

export interface RecordRunOptions {
  /** 显式注入存储，便于单测；传 null 表示跳过写入。不传时使用 Prisma。 */
  store?: RunStore | null
}

function normalizeToken(value: number | undefined): number | null {
  // 未知就是 null，不能写 0：0 是「确实用了 0 个 token」的合法值
  if (value === undefined || !Number.isFinite(value)) {
    return null
  }
  return Math.max(0, Math.round(value))
}

function normalizeCost(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) {
    return null
  }
  return Math.max(0, value)
}

function optional(value: string | undefined): string | undefined {
  return value !== undefined && value.length > 0 ? value : undefined
}

/** 把一次运行整理成 Run 行；未知用量按 schema 的非空默认值落 0。 */
export function buildRunWrite(input: RunWriteInput): RunWrite {
  const usage = input.usage
  const data: RunWrite = {
    sessionKey: input.sessionKey,
    variablesJson: input.variablesJson,
    modelId: input.modelId,
    paramsJson: input.paramsJson,
    output: input.output,
    status: input.status,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    tokensIn: normalizeToken(usage?.tokensIn),
    tokensOut: normalizeToken(usage?.tokensOut),
    cachedTokens: normalizeToken(usage?.cachedTokens),
    reasoningTokens: normalizeToken(usage?.reasoningTokens),
    costCny: normalizeCost(usage?.costCny),
    attempts: Math.max(1, Math.round(input.attempts ?? 1)),
  }
  const reasoning = optional(input.reasoning)
  if (reasoning !== undefined) {
    data.reasoning = reasoning
  }
  const errorCode = optional(input.errorCode)
  if (errorCode !== undefined) {
    data.errorCode = errorCode
  }
  const errorMsg = optional(input.errorMsg)
  if (errorMsg !== undefined) {
    data.errorMsg = errorMsg
  }
  const finishReason = optional(input.finishReason)
  if (finishReason !== undefined) {
    data.finishReason = finishReason
  }
  const traceId = optional(input.traceId)
  if (traceId !== undefined) {
    data.traceId = traceId
  }
  const requestId = optional(input.requestId)
  if (requestId !== undefined) {
    data.requestId = requestId
  }
  const cacheKey = optional(input.cacheKey)
  if (cacheKey !== undefined) {
    data.cacheKey = cacheKey
  }
  return data
}

function defaultStore(): RunStore | null {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }
  return {
    create: async (data) => {
      const row = await prisma.run.create({ data })
      return { id: row.id }
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 写一条运行记录。保证不抛错：缺数据库、缺表或写入失败都只告警。
 * 调用点可以 await（结束或取消时），不会拖慢 delta 的发送。
 */
export async function recordRun(
  input: RunWriteInput,
  options: RecordRunOptions = {},
): Promise<string | null> {
  try {
    const store =
      options.store === null ? null : (options.store ?? defaultStore())
    if (!store) {
      return null
    }
    const created = await store.create(buildRunWrite(input))
    return created.id
  } catch (error) {
    console.warn('[run] 写入运行记录失败，已忽略：', errorMessage(error))
    return null
  }
}

export interface RunSummary {
  id: string
  status: string
  output: string
  reasoning: string | null
  errorCode: string | null
  errorMsg: string | null
  latencyMs: number | null
  // null 表示未知，与「0 个 token」区分
  tokensIn: number | null
  tokensOut: number | null
  costCny: number | null
  finishReason: string | null
  createdAt: string
}

function toSummary(row: {
  id: string
  status: string
  output: string
  reasoning: string | null
  errorCode: string | null
  errorMsg: string | null
  latencyMs: number | null
  tokensIn: number | null
  tokensOut: number | null
  costCny: number | null
  finishReason: string | null
  createdAt: Date
}): RunSummary {
  return {
    id: row.id,
    status: row.status,
    output: row.output,
    reasoning: row.reasoning,
    errorCode: row.errorCode,
    errorMsg: row.errorMsg,
    latencyMs: row.latencyMs,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costCny: row.costCny,
    finishReason: row.finishReason,
    createdAt: row.createdAt.toISOString(),
  }
}

/** 回看当前草稿的最近运行；数据库不可用时返回空数组。 */
export async function listRecentRuns(
  sessionKey: string,
  limit = 8,
): Promise<RunSummary[]> {
  const prisma = getPrisma()
  if (!prisma || sessionKey.length === 0) {
    return []
  }
  try {
    const rows = await prisma.run.findMany({
      where: { sessionKey },
      orderBy: { createdAt: 'desc' },
      take: Math.min(20, Math.max(1, Math.round(limit))),
    })
    return rows.map(toSummary)
  } catch (error) {
    console.warn('[run] 读取运行记录失败，已忽略：', errorMessage(error))
    return []
  }
}
