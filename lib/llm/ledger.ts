import type { ZodType } from 'zod'
import { getPrisma } from '../db/prisma'
import {
  classifyError,
  classifyLengthCause,
  errorCodeForKind,
  type LengthCause,
} from './errors'
import { ARK_MODEL_PRESETS } from './registry'
import { runStructured } from './structured'
import type {
  ChatChunk,
  ChatRequest,
  ChatResult,
  EngineStage,
  FinishReason,
  LLMProvider,
  PingResult,
  StructuredOptions,
  TokenUsage,
} from './types'

/**
 * 调用账本。
 *
 * 职责分三块：
 * 1. 价格表：代码内默认价加 AppSetting 覆盖，业务层不写死单价。
 * 2. 写入：每次模型调用落一条 LlmCall，失败只记日志，不影响主流程。
 * 3. 聚合：按阶段与模型汇总 token、缓存命中与人民币金额，null 一律表示「未知」。
 *
 * 用量与金额都使用 nullable 语义：拿不到就写 null，绝不写 0 或负数哨兵。
 */

/* ---------- 价格表 ---------- */

/** 单价单位：元 / 百万 token。字段缺失表示该项价格未知。 */
export interface ModelPricingCny {
  inputCnyPerMillion?: number
  cachedInputCnyPerMillion?: number
  outputCnyPerMillion?: number
}

export type PricingTable = Readonly<Record<string, ModelPricingCny>>

function presetPricingTable(): Record<string, ModelPricingCny> {
  const table: Record<string, ModelPricingCny> = {}
  for (const [modelId, preset] of Object.entries(ARK_MODEL_PRESETS)) {
    table[modelId] = {
      ...(preset.inputCnyPerMillion !== undefined
        ? { inputCnyPerMillion: preset.inputCnyPerMillion }
        : {}),
      ...(preset.cachedInputCnyPerMillion !== undefined
        ? { cachedInputCnyPerMillion: preset.cachedInputCnyPerMillion }
        : {}),
      ...(preset.outputCnyPerMillion !== undefined
        ? { outputCnyPerMillion: preset.outputCnyPerMillion }
        : {}),
    }
  }
  // Mock 不产生真实费用，价格明确为 0，便于本地验收时区分「免费」与「未知」。
  table.mock = {
    inputCnyPerMillion: 0,
    cachedInputCnyPerMillion: 0,
    outputCnyPerMillion: 0,
  }
  return table
}

/** 代码内默认表，与 registry 的模型预设同源，避免两处价格漂移。 */
export const DEFAULT_MODEL_PRICING_CNY: PricingTable = presetPricingTable()

/** AppSetting 里的覆盖键。值为 JSON，形如 { "models": { "<modelId>": {...} } }。 */
export const PRICING_SETTING_KEY = 'llm.pricing.cny'

/** 覆盖配置的缓存时长；设置页改价后最多 30 秒生效。 */
export const PRICING_CACHE_MS = 30_000

export interface PricingOverrideSetting {
  models: Record<string, ModelPricingCny>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNonNegative(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return undefined
  }
  return value
}

function parsePricingEntry(value: unknown): ModelPricingCny | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const input = finiteNonNegative(value.inputCnyPerMillion)
  const output = finiteNonNegative(value.outputCnyPerMillion)
  if (input === undefined || output === undefined) {
    return undefined
  }
  const cached = finiteNonNegative(value.cachedInputCnyPerMillion)
  return {
    inputCnyPerMillion: input,
    outputCnyPerMillion: output,
    ...(cached !== undefined ? { cachedInputCnyPerMillion: cached } : {}),
  }
}

/**
 * 解析 AppSetting 的价格覆盖。
 *
 * 主格式是 { "models": { ... } }，同时兼容直接给模型映射的简写。
 * 非法条目直接忽略并回落到默认表，避免一条坏配置让整个成本面板失真。
 */
export function parsePricingOverrides(
  raw: string | null | undefined,
): Record<string, ModelPricingCny> {
  if (!raw || raw.trim().length === 0) {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return {}
  }
  if (!isRecord(parsed)) {
    return {}
  }
  const modelSource = isRecord(parsed.models) ? parsed.models : parsed
  const result: Record<string, ModelPricingCny> = {}
  for (const [modelId, value] of Object.entries(modelSource)) {
    if (modelId === 'models') {
      continue
    }
    const entry = parsePricingEntry(value)
    if (entry) {
      result[modelId] = entry
    }
  }
  return result
}

/** 模型级合并：覆盖项没写的字段继续沿用默认表，避免缓存价被意外清空。 */
export function mergePricingTable(
  base: PricingTable,
  overrides: Readonly<Record<string, ModelPricingCny>>,
): PricingTable {
  const merged: Record<string, ModelPricingCny> = { ...base }
  for (const [modelId, override] of Object.entries(overrides)) {
    const existing = base[modelId]
    merged[modelId] = existing ? { ...existing, ...override } : { ...override }
  }
  return merged
}

interface PricingCacheEntry {
  table: PricingTable
  loadedAt: number
}

let pricingCache: PricingCacheEntry | null = null

/** 单测与脚本用，清掉内存价格表缓存。 */
export function resetPricingCache(): void {
  pricingCache = null
}

/**
 * 读取价格表：默认表加 AppSetting 覆盖。
 * 数据库不可用时只返回默认表，读取失败不影响调用主流程。
 */
export async function loadPricingTable(now = Date.now()): Promise<PricingTable> {
  if (pricingCache && now - pricingCache.loadedAt < PRICING_CACHE_MS) {
    return pricingCache.table
  }

  const prisma = getPrisma()
  if (!prisma) {
    pricingCache = { table: DEFAULT_MODEL_PRICING_CNY, loadedAt: now }
    return DEFAULT_MODEL_PRICING_CNY
  }

  try {
    const setting = await prisma.appSetting.findUnique({
      where: { key: PRICING_SETTING_KEY },
    })
    const table = mergePricingTable(
      DEFAULT_MODEL_PRICING_CNY,
      parsePricingOverrides(setting?.value),
    )
    pricingCache = { table, loadedAt: now }
    return table
  } catch (error) {
    console.warn(
      '[ledger] 读取价格配置失败，使用默认价格表：',
      errorMessage(error),
    )
    pricingCache = { table: DEFAULT_MODEL_PRICING_CNY, loadedAt: now }
    return DEFAULT_MODEL_PRICING_CNY
  }
}

function roundCny(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

/**
 * 按 token 与单价估算人民币金额。
 * 任一必要单价缺失时返回 undefined，由调用方写 null，绝不按 0 处理。
 */
export function computeCostCny(
  usage: TokenUsage,
  pricing: ModelPricingCny | undefined,
): number | undefined {
  if (!pricing) {
    return undefined
  }
  const inputPrice = pricing.inputCnyPerMillion
  const outputPrice = pricing.outputCnyPerMillion
  if (inputPrice === undefined || outputPrice === undefined) {
    return undefined
  }

  const tokensIn = Math.max(0, usage.tokensIn)
  const tokensOut = Math.max(0, usage.tokensOut)
  const cached = Math.min(tokensIn, Math.max(0, usage.cachedTokens ?? 0))
  const uncached = tokensIn - cached
  const cachedPrice = pricing.cachedInputCnyPerMillion ?? inputPrice
  const cost =
    (uncached * inputPrice + cached * cachedPrice + tokensOut * outputPrice) /
    1_000_000
  return roundCny(cost)
}

function costForCall(
  usage: TokenUsage | undefined,
  modelId: string,
  pricingTable: PricingTable,
): number | null {
  if (!usage) {
    return null
  }
  const computed = computeCostCny(usage, pricingTable[modelId])
  if (computed !== undefined) {
    return computed
  }
  // 价格表没有该模型时，接受 provider 已经算好的金额；仍然没有才记未知。
  if (usage.costCny !== undefined && Number.isFinite(usage.costCny)) {
    return roundCny(usage.costCny)
  }
  return null
}

/* ---------- traceId ---------- */

export const TRACE_ID_PREFIX = 'trace_'

/**
 * 一次请求的 traceId 优先从客户端 requestId 派生，缺省时服务端生成。
 * 同一次请求里的所有模型调用复用同一个值，便于把 compose 与修复重试串起来。
 */
export function resolveTraceId(
  requestId?: string | null,
  generate: () => string = () => globalThis.crypto.randomUUID(),
): string {
  const trimmed = requestId?.trim()
  if (trimmed) {
    return trimmed.startsWith(TRACE_ID_PREFIX)
      ? trimmed
      : `${TRACE_ID_PREFIX}${trimmed}`
  }
  return `${TRACE_ID_PREFIX}${generate()}`
}

/* ---------- 写入 ---------- */

export type LlmCallStatus = 'succeeded' | 'failed' | 'canceled' | 'interrupted'

export interface LlmCallInput {
  traceId?: string | null
  stage: EngineStage
  provider: string
  modelId: string
  thinking?: string | null
  status?: LlmCallStatus
  usage?: TokenUsage
  latencyMs?: number | null
  ttftMs?: number | null
  finishReason?: string | null
  lengthCause?: LengthCause | string | null
  attempts?: number
  errorCode?: string | null
  promptId?: string | null
  versionId?: string | null
  runId?: string | null
  evalTaskId?: string | null
}

export interface LlmCallWrite {
  traceId: string | null
  stage: string
  promptId: string | null
  versionId: string | null
  runId: string | null
  evalTaskId: string | null
  provider: string
  modelId: string
  thinking: string | null
  status: string
  tokensIn: number | null
  tokensOut: number | null
  cachedTokens: number | null
  reasoningTokens: number | null
  costCny: number | null
  latencyMs: number | null
  ttftMs: number | null
  finishReason: string | null
  lengthCause: string | null
  attempts: number
  errorCode: string | null
}

export interface LlmCallStore {
  create(data: LlmCallWrite): Promise<{ id: string }>
}

export interface RecordLlmCallOptions {
  /** 显式注入存储，便于单测；传 null 表示跳过写入。不传时使用 Prisma。 */
  store?: LlmCallStore | null
  /** 显式注入价格表，避免单测读数据库；不传时走缓存价格表。 */
  pricingTable?: PricingTable
  now?: number
}

function normalizeToken(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) {
    return null
  }
  return Math.max(0, Math.round(value))
}

function normalizeDuration(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null
  }
  return Math.max(0, Math.round(value))
}

function optionalString(
  value: string | null | undefined,
): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function buildWrite(
  input: LlmCallInput,
  pricingTable: PricingTable,
): LlmCallWrite {
  return {
    traceId: optionalString(input.traceId),
    stage: input.stage,
    promptId: optionalString(input.promptId),
    versionId: optionalString(input.versionId),
    runId: optionalString(input.runId),
    evalTaskId: optionalString(input.evalTaskId),
    provider: input.provider,
    modelId: input.modelId,
    thinking: optionalString(input.thinking),
    status: input.status ?? 'succeeded',
    tokensIn: normalizeToken(input.usage?.tokensIn),
    tokensOut: normalizeToken(input.usage?.tokensOut),
    cachedTokens: normalizeToken(input.usage?.cachedTokens),
    reasoningTokens: normalizeToken(input.usage?.reasoningTokens),
    costCny: costForCall(input.usage, input.modelId, pricingTable),
    latencyMs: normalizeDuration(input.latencyMs),
    ttftMs: normalizeDuration(input.ttftMs),
    finishReason: optionalString(input.finishReason),
    lengthCause: optionalString(input.lengthCause),
    attempts: Math.max(1, normalizeDuration(input.attempts) ?? 1),
    errorCode: optionalString(input.errorCode),
  }
}

function defaultStore(): LlmCallStore | null {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }
  return {
    create: async (data) => {
      const row = await prisma.llmCall.create({ data })
      return { id: row.id }
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 写一条调用账本。
 *
 * 这个函数保证不抛错：价格读取、存储缺失或写入失败都只打日志并返回 null。
 * 调用点因此可以放心地 fire-and-forget，不会拖慢流式响应。
 */
export async function recordLlmCall(
  input: LlmCallInput,
  options: RecordLlmCallOptions = {},
): Promise<string | null> {
  try {
    const pricingTable = options.pricingTable ?? (await loadPricingTable(options.now))
    const data = buildWrite(input, pricingTable)
    const store =
      options.store === null ? null : options.store ?? defaultStore()
    if (!store) {
      return null
    }
    const created = await store.create(data)
    return created.id
  } catch (error) {
    console.warn('[ledger] 写入调用账本失败，已忽略：', errorMessage(error))
    return null
  }
}

/* ---------- provider 埋点 ---------- */

export interface LlmCallContext {
  traceId: string
  stage: EngineStage
  provider: string
  modelId: string
  thinking?: string | null
  contextWindow?: number
  promptId?: string | null
  versionId?: string | null
  runId?: string | null
  evalTaskId?: string | null
  /** 本轮请求已发生的 HTTP 次数；用于把 withRetry 的 attempts 落账。 */
  fetchAttempts?: () => number
  /** 单测注入用，生产留空。 */
  recordOptions?: RecordLlmCallOptions
  /** 单测观察写入内容用。 */
  onRecorded?: (input: LlmCallInput) => void
}

type LlmCallInputPatch = Partial<
  Omit<LlmCallInput, 'stage' | 'provider' | 'modelId' | 'traceId'>
> & { status: LlmCallStatus }

export const STREAM_INTERRUPTED_CODE = 'LLM_STREAM_INTERRUPTED'

export interface CallStatusInput {
  failure?: unknown
  signal?: AbortSignal
  sawContent: boolean
  hasCompletionSignal: boolean
}

/**
 * 区分被取消与被中断：
 * - canceled：客户端主动断开，或 provider 报 aborted。
 * - interrupted：已经流出内容后上游断开，或流正常结束却没有 finish_reason / usage。
 * - failed：还没流出内容就失败。
 */
export function classifyCallStatus(input: CallStatusInput): LlmCallStatus {
  if (input.failure !== undefined) {
    const error = classifyError(input.failure, input.signal)
    if (error.kind === 'aborted' || input.signal?.aborted) {
      return 'canceled'
    }
    return input.sawContent ? 'interrupted' : 'failed'
  }
  if (input.signal?.aborted && !input.hasCompletionSignal) {
    return 'canceled'
  }
  if (!input.hasCompletionSignal) {
    return 'interrupted'
  }
  return 'succeeded'
}

class LedgerProvider implements LLMProvider {
  readonly id: string
  readonly label: string

  constructor(
    private readonly inner: LLMProvider,
    private readonly context: LlmCallContext,
  ) {
    this.id = inner.id
    this.label = inner.label
  }

  private attemptsSince(before: number | null): number {
    const current = this.context.fetchAttempts?.()
    if (before === null || current === undefined) {
      return 1
    }
    return Math.max(1, current - before)
  }

  private lengthCauseFor(
    req: ChatRequest,
    finishReason: FinishReason,
    usage: TokenUsage | undefined,
  ): LengthCause | null {
    if (finishReason !== 'length') {
      return null
    }
    return classifyLengthCause({
      ...(req.maxTokens !== undefined ? { maxTokens: req.maxTokens } : {}),
      ...(req.maxCompletionTokens !== undefined
        ? { maxCompletionTokens: req.maxCompletionTokens }
        : {}),
      ...(usage ? { usage } : {}),
      ...(this.context.contextWindow !== undefined
        ? { contextWindow: this.context.contextWindow }
        : {}),
    })
  }

  private emit(patch: LlmCallInputPatch): void {
    const input: LlmCallInput = {
      traceId: this.context.traceId,
      stage: this.context.stage,
      provider: this.context.provider,
      modelId: this.context.modelId,
      thinking: this.context.thinking ?? null,
      promptId: this.context.promptId ?? null,
      versionId: this.context.versionId ?? null,
      runId: this.context.runId ?? null,
      evalTaskId: this.context.evalTaskId ?? null,
      ...patch,
    }
    try {
      this.context.onRecorded?.(input)
    } catch (error) {
      console.warn('[ledger] 账本观察回调失败，已忽略：', errorMessage(error))
    }
    // fire-and-forget：写入失败在 recordLlmCall 内部吞掉，不影响响应。
    void recordLlmCall(input, this.context.recordOptions)
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const startedAt = Date.now()
    const before = this.context.fetchAttempts?.() ?? null
    try {
      const result = await this.inner.chat(req)
      this.emit({
        status: 'succeeded',
        usage: result.usage,
        latencyMs: Date.now() - startedAt,
        ttftMs: null,
        finishReason: result.finishReason,
        lengthCause: this.lengthCauseFor(req, result.finishReason, result.usage),
        attempts: this.attemptsSince(before),
      })
      return result
    } catch (error) {
      const llmError = classifyError(error, req.signal)
      this.emit({
        status:
          llmError.kind === 'aborted' || req.signal?.aborted
            ? 'canceled'
            : 'failed',
        latencyMs: Date.now() - startedAt,
        ttftMs: null,
        finishReason: null,
        errorCode: errorCodeForKind(llmError.kind),
        attempts: this.attemptsSince(before),
      })
      throw error
    }
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    const startedAt = Date.now()
    const before = this.context.fetchAttempts?.() ?? null
    let ttftMs: number | null = null
    let usage: TokenUsage | undefined
    let finishReason: FinishReason = null
    let sawContent = false
    let failure: unknown

    try {
      for await (const chunk of this.inner.stream(req)) {
        const hasContent =
          chunk.delta.length > 0 || chunk.reasoningDelta !== undefined
        if (hasContent && ttftMs === null) {
          ttftMs = Date.now() - startedAt
        }
        if (hasContent) {
          sawContent = true
        }
        if (chunk.finishReason !== undefined && chunk.finishReason !== null) {
          finishReason = chunk.finishReason
        }
        if (chunk.usage !== undefined) {
          usage = chunk.usage
        }
        yield chunk
      }
    } catch (error) {
      failure = error
      throw error
    } finally {
      const latencyMs = Date.now() - startedAt
      const hasCompletionSignal = finishReason !== null || usage !== undefined
      const status = classifyCallStatus({
        ...(failure !== undefined ? { failure } : {}),
        ...(req.signal ? { signal: req.signal } : {}),
        sawContent,
        hasCompletionSignal,
      })
      const llmError =
        failure === undefined ? undefined : classifyError(failure, req.signal)
      const errorCode =
        status === 'canceled'
          ? errorCodeForKind('aborted')
          : status === 'interrupted' && llmError === undefined
            ? STREAM_INTERRUPTED_CODE
            : llmError
              ? errorCodeForKind(llmError.kind)
              : null

      this.emit({
        status,
        ...(usage ? { usage } : {}),
        latencyMs,
        ttftMs,
        finishReason,
        lengthCause: this.lengthCauseFor(req, finishReason, usage),
        ...(errorCode ? { errorCode } : {}),
        attempts: this.attemptsSince(before),
      })
    }
  }

  structured<T>(
    req: ChatRequest,
    schema: ZodType<T>,
    opts?: StructuredOptions,
  ): Promise<T> {
    return runStructured(this, req, schema, opts)
  }

  ping(): Promise<PingResult> {
    return this.inner.ping()
  }
}

/**
 * 包一层账本埋点。返回对象仍是 LLMProvider，路由只换传入的 provider，
 * 流式事件顺序与内容完全不变。
 */
export function instrumentProvider(
  provider: LLMProvider,
  context: LlmCallContext,
): LLMProvider {
  return new LedgerProvider(provider, context)
}

/* ---------- 聚合 ---------- */

export const STAGE_LABELS: Readonly<Record<string, string>> = {
  compose: '生成',
  interview: '访谈',
  evaluate: '评估',
  refine: '优化',
  run: '试运行',
  judge: '盲评',
}

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage
}

export interface LlmCallStatsRow {
  stage: string
  modelId: string
  status: string
  tokensIn: number | null
  tokensOut: number | null
  cachedTokens: number | null
  reasoningTokens: number | null
  costCny: number | null
}

export interface CostBucket {
  key: string
  label: string
  calls: number
  succeededCalls: number
  failedCalls: number
  canceledCalls: number
  interruptedCalls: number
  /** 没拿到输入或输出 token 的调用数。 */
  unknownUsageCalls: number
  /** 没拿到价格的调用数。 */
  unknownCostCalls: number
  tokensIn: number
  tokensOut: number
  cachedTokens: number
  reasoningTokens: number
  costCny: number
  cachedKnownCalls: number
  reasoningKnownCalls: number
  /** 缓存命中率百分比；没有可用的缓存明细时为 null。 */
  cacheHitRate: number | null
}

export interface CostSummary {
  total: CostBucket
  byStage: CostBucket[]
  byModel: CostBucket[]
  generatedAt: string
}

interface BucketAccumulator {
  key: string
  label: string
  calls: number
  succeededCalls: number
  failedCalls: number
  canceledCalls: number
  interruptedCalls: number
  unknownUsageCalls: number
  unknownCostCalls: number
  tokensIn: number
  tokensOut: number
  cachedTokens: number
  reasoningTokens: number
  costCny: number
  cachedKnownCalls: number
  reasoningKnownCalls: number
  cacheTokensIn: number
  cacheHitTokens: number
}

function createAccumulator(key: string, label: string): BucketAccumulator {
  return {
    key,
    label,
    calls: 0,
    succeededCalls: 0,
    failedCalls: 0,
    canceledCalls: 0,
    interruptedCalls: 0,
    unknownUsageCalls: 0,
    unknownCostCalls: 0,
    tokensIn: 0,
    tokensOut: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    costCny: 0,
    cachedKnownCalls: 0,
    reasoningKnownCalls: 0,
    cacheTokensIn: 0,
    cacheHitTokens: 0,
  }
}

function addRow(accumulator: BucketAccumulator, row: LlmCallStatsRow): void {
  accumulator.calls += 1
  switch (row.status) {
    case 'succeeded':
      accumulator.succeededCalls += 1
      break
    case 'canceled':
      accumulator.canceledCalls += 1
      break
    case 'interrupted':
      accumulator.interruptedCalls += 1
      break
    default:
      accumulator.failedCalls += 1
      break
  }

  const tokensIn = row.tokensIn
  const tokensOut = row.tokensOut
  if (tokensIn !== null && tokensOut !== null) {
    accumulator.tokensIn += tokensIn
    accumulator.tokensOut += tokensOut
  } else {
    accumulator.unknownUsageCalls += 1
  }

  if (row.costCny !== null) {
    accumulator.costCny += row.costCny
  } else {
    accumulator.unknownCostCalls += 1
  }

  if (row.cachedTokens !== null) {
    accumulator.cachedKnownCalls += 1
    accumulator.cachedTokens += row.cachedTokens
    if (tokensIn !== null && tokensOut !== null && tokensIn > 0) {
      accumulator.cacheTokensIn += tokensIn
      accumulator.cacheHitTokens += Math.min(row.cachedTokens, tokensIn)
    }
  }

  if (row.reasoningTokens !== null) {
    accumulator.reasoningKnownCalls += 1
    accumulator.reasoningTokens += row.reasoningTokens
  }
}

function finalizeBucket(accumulator: BucketAccumulator): CostBucket {
  return {
    key: accumulator.key,
    label: accumulator.label,
    calls: accumulator.calls,
    succeededCalls: accumulator.succeededCalls,
    failedCalls: accumulator.failedCalls,
    canceledCalls: accumulator.canceledCalls,
    interruptedCalls: accumulator.interruptedCalls,
    unknownUsageCalls: accumulator.unknownUsageCalls,
    unknownCostCalls: accumulator.unknownCostCalls,
    tokensIn: accumulator.tokensIn,
    tokensOut: accumulator.tokensOut,
    cachedTokens: accumulator.cachedTokens,
    reasoningTokens: accumulator.reasoningTokens,
    costCny: Math.round(accumulator.costCny * 1_000_000) / 1_000_000,
    cachedKnownCalls: accumulator.cachedKnownCalls,
    reasoningKnownCalls: accumulator.reasoningKnownCalls,
    cacheHitRate:
      accumulator.cacheTokensIn > 0
        ? (accumulator.cacheHitTokens / accumulator.cacheTokensIn) * 100
        : null,
  }
}

/** 有金额的排前面并按金额降序；金额全未知的按调用数降序，保证展示稳定。 */
function sortBuckets(left: CostBucket, right: CostBucket): number {
  const leftCostKnown = left.calls > 0 && left.unknownCostCalls < left.calls
  const rightCostKnown = right.calls > 0 && right.unknownCostCalls < right.calls
  if (leftCostKnown !== rightCostKnown) {
    return leftCostKnown ? -1 : 1
  }
  if (leftCostKnown && rightCostKnown && right.costCny !== left.costCny) {
    return right.costCny - left.costCny
  }
  if (right.calls !== left.calls) {
    return right.calls - left.calls
  }
  return left.key.localeCompare(right.key)
}

/**
 * 纯函数聚合，方便单测直接喂行数据。
 * null 表示未知，不计入对应合计，也不当成 0。
 */
export function summarizeCalls(
  rows: readonly LlmCallStatsRow[],
): CostSummary {
  const total = createAccumulator('total', '全部')
  const stages = new Map<string, BucketAccumulator>()
  const models = new Map<string, BucketAccumulator>()

  for (const row of rows) {
    addRow(total, row)

    const stageAccumulator =
      stages.get(row.stage) ?? createAccumulator(row.stage, stageLabel(row.stage))
    addRow(stageAccumulator, row)
    stages.set(row.stage, stageAccumulator)

    const modelAccumulator =
      models.get(row.modelId) ??
      createAccumulator(row.modelId, row.modelId)
    addRow(modelAccumulator, row)
    models.set(row.modelId, modelAccumulator)
  }

  return {
    total: finalizeBucket(total),
    byStage: [...stages.values()].map(finalizeBucket).sort(sortBuckets),
    byModel: [...models.values()].map(finalizeBucket).sort(sortBuckets),
    generatedAt: new Date().toISOString(),
  }
}

/**
 * 读取全部账本并聚合。数据库不可用或查询失败时返回 null，
 * 设置页据此显示「数据暂不可用」，不会渲染伪造的 0。
 */
export async function getCostSummary(): Promise<CostSummary | null> {
  const prisma = getPrisma()
  if (!prisma) {
    return null
  }
  try {
    const rows = await prisma.llmCall.findMany({
      select: {
        stage: true,
        modelId: true,
        status: true,
        tokensIn: true,
        tokensOut: true,
        cachedTokens: true,
        reasoningTokens: true,
        costCny: true,
      },
    })
    return summarizeCalls(rows)
  } catch (error) {
    console.warn('[ledger] 读取调用账本失败：', errorMessage(error))
    return null
  }
}
