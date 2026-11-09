import type { ZodType } from 'zod'

/**
 * 与厂商无关的模型调用接口。
 * Ark 的扩展字段（thinking / caching / prompt_cache_key / service_tier）
 * 只能在这一层的实现内部出现，不得泄漏到业务层。
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  role: ChatRole
  content: string
  toolCallId?: string
}

export type ThinkingMode = 'auto' | 'on' | 'off'
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high'
export type ServiceTier = 'default' | 'fast' | 'flex' | 'scale'
export type FinishReason = 'stop' | 'length' | 'content_filter' | 'tool_calls' | null

export interface ToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ChatRequest {
  /** 模型配置 id，由注册表解析成具体 provider 与 model */
  modelConfigId: string
  messages: ChatMessage[]
  /** Ark: [0, 2]，默认 1.0。与 topP 只调一个 */
  temperature?: number
  /** Ark: 默认 0.7 */
  topP?: number
  /** 映射 max_tokens，默认 4096，不含思维链。与 maxCompletionTokens 互斥 */
  maxTokens?: number
  /** 映射 max_completion_tokens，上限 65536，含思维链。与 maxTokens 互斥 */
  maxCompletionTokens?: number
  thinking?: ThinkingMode
  reasoningEffort?: ReasoningEffort
  /** 能走严格模式就走，走不通由 provider 自行降级 */
  jsonSchema?: { name: string; schema: Record<string, unknown>; strict?: boolean }
  jsonObject?: boolean
  /** 映射 prompt_cache_key，提升隐式缓存命中率。建议传 promptId */
  cacheKey?: string
  serviceTier?: ServiceTier
  tools?: ToolDef[]
  signal?: AbortSignal
}

export interface TokenUsage {
  tokensIn: number
  tokensOut: number
  /** Ark: usage.prompt_tokens_details.cached_tokens */
  cachedTokens?: number
  /** Ark: usage.completion_tokens_details.reasoning_tokens */
  reasoningTokens?: number
  /** 方舟按人民币计价，单位元 */
  costCny?: number
}

export interface ChatChunk {
  delta: string
  reasoningDelta?: string
  finishReason?: FinishReason
  usage?: TokenUsage
}

export interface ChatResult {
  text: string
  reasoning?: string
  finishReason: FinishReason
  usage: TokenUsage
}

export interface StructuredOptions {
  /** 默认 2 */
  maxRepairAttempts?: number
  /** 默认 true：结构化彻底失败时降级为纯文本 */
  fallbackToText?: boolean
}

export interface PingResult {
  ok: boolean
  latencyMs: number
  error?: string
}

export interface LLMProvider {
  readonly id: string
  readonly label: string
  chat(req: ChatRequest): Promise<ChatResult>
  stream(req: ChatRequest): AsyncIterable<ChatChunk>
  /** 内部做 Zod 校验、宽容解析、修复重试 */
  structured<T>(
    req: ChatRequest,
    schema: ZodType<T>,
    opts?: StructuredOptions,
  ): Promise<T>
  ping(): Promise<PingResult>
}

/* ---------- 引擎阶段 ---------- */

export type EngineStage =
  | 'compose'
  | 'interview'
  | 'evaluate'
  | 'refine'
  | 'run'
  | 'judge'

/* ---------- 错误分类：决定要不要重试 ---------- */

export type ErrorKind =
  | 'auth'            // 401
  | 'forbidden'       // 403，含模型未开通、欠费
  | 'invalid_input'   // 400 参数类
  | 'content_filter'  // 内容安全
  | 'rate_limited'    // 429 限流，可重试
  | 'quota_exceeded'  // 429 额度用尽，不可重试
  | 'overloaded'      // 429 ServerOverloaded / RequestBurstTooFast
  | 'server'          // 5xx，可重试
  | 'network'
  | 'aborted'
  | 'invalid_output'  // 模型输出不合法，走修复重试
  | 'unknown'

export interface LlmErrorShape {
  kind: ErrorKind
  code?: string
  message: string
  retryable: boolean
  cause?: unknown
}

export function isRetryable(kind: ErrorKind): boolean {
  return kind === 'rate_limited' || kind === 'overloaded' || kind === 'server' ||
    kind === 'network' || kind === 'invalid_output'
}
