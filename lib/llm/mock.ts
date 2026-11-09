import type { ZodType } from 'zod'
import { createLlmError } from './errors'
import { runStructured } from './structured'
import type {
  ChatChunk,
  ChatRequest,
  ChatResult,
  FinishReason,
  LLMProvider,
  PingResult,
  StructuredOptions,
  TokenUsage,
} from './types'

/**
 * 确定性的 Mock provider。
 *
 * 用于无 Key 的界面验收、路由联调与单测故障注入；不读环境、不发网络请求。
 * 同一份脚本永远得到同一份输出。
 */

/** 六种可注入的故障画像；路由通过 MOCK_LLM_FAULT 环境变量选择其中一种。 */
export const MOCK_FAULT_PROFILES = [
  'bad_json',
  'fenced_json',
  'truncated',
  'rate_limited',
  'quota_exceeded',
  'slow_stream',
] as const

export type MockFaultProfile = (typeof MOCK_FAULT_PROFILES)[number]

export function isMockFaultProfile(value: unknown): value is MockFaultProfile {
  return (
    typeof value === 'string' &&
    (MOCK_FAULT_PROFILES as readonly string[]).includes(value)
  )
}

/** 慢流画像的首字延迟：与验收口径一致，固定 10 秒。 */
export const MOCK_SLOW_FIRST_TOKEN_MS = 10_000

/** 各画像的默认输出；测试可以据此断言内容是否被完整保留。 */
export const MOCK_FAULT_TEXTS = {
  bad_json: '这不是 JSON，只是一段解释，没有结构。',
  fenced_json: '```json\n{"ok":true}\n```',
  truncated:
    '{"schemaVersion":"pp-schema-v1","meta":{"title":"被截断的标题","taskType":"qa"',
  slow_stream: '{"ok":true}',
} as const

export interface MockProviderOptions {
  id?: string
  label?: string
  /** 默认输出；不传时给一段固定文本。 */
  chunks?: readonly ChatChunk[]
  /** 按调用次数依次取脚本；用完后重复最后一段。 */
  script?: readonly (readonly ChatChunk[])[]
  /** 按调用次数抛错，用于测试重试与错误文案。 */
  errors?: readonly unknown[]
  /** 故障画像；优先于 chunks / script 的默认值。 */
  fault?: MockFaultProfile
  /** 覆盖慢流首字延迟，默认 10000ms；单测注入小值以免真的等 10 秒。 */
  firstTokenDelayMs?: number
  /** 测试用：每次调用前记录请求，便于断言请求体降级路径。 */
  onRequest?: (req: ChatRequest) => void
  pingResult?: PingResult
  delayMs?: number
}

const DEFAULT_CHUNKS: readonly ChatChunk[] = [
  { delta: '这是 Mock provider 的固定输出。', finishReason: 'stop' },
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export class MockProvider implements LLMProvider {
  readonly id: string
  readonly label: string

  private readonly options: MockProviderOptions
  private calls = 0

  constructor(options: MockProviderOptions = {}) {
    this.options = options
    this.id = options.id ?? 'mock'
    this.label = options.label ?? 'Mock 模型'
  }

  /** 故障画像里属于 transport 层的两种错误，直接抛出，不伪造内容。 */
  private faultError(): Error | null {
    if (this.options.fault === 'rate_limited') {
      return createLlmError(
        'rate_limited',
        '请求被限流（Mock 故障画像 rate_limited）。',
        { code: 'RateLimitExceeded' },
      )
    }
    if (this.options.fault === 'quota_exceeded') {
      return createLlmError(
        'quota_exceeded',
        '额度已用尽（Mock 故障画像 quota_exceeded）。',
        { code: 'QuotaExceeded' },
      )
    }
    return null
  }

  /** 截断画像按请求里真实的上限伪造 usage，让 length 成因可被反推。 */
  private faultChunks(req: ChatRequest): readonly ChatChunk[] {
    const fault = this.options.fault
    if (!fault || fault === 'rate_limited' || fault === 'quota_exceeded') {
      return []
    }
    // 显式 chunks 是更细的测试脚本，优先于画像自带的默认内容。
    if (this.options.chunks && this.options.chunks.length > 0) {
      return this.options.chunks
    }

    switch (fault) {
      case 'bad_json':
        return [{ delta: MOCK_FAULT_TEXTS.bad_json, finishReason: 'stop' }]
      case 'fenced_json':
        return [{ delta: MOCK_FAULT_TEXTS.fenced_json, finishReason: 'stop' }]
      case 'truncated': {
        const hasExplicitLimit =
          req.maxTokens !== undefined || req.maxCompletionTokens !== undefined
        const tokensOut = req.maxTokens ?? req.maxCompletionTokens ?? 200
        const tokensIn = hasExplicitLimit ? 1000 : 800
        return [
          {
            delta: MOCK_FAULT_TEXTS.truncated,
            finishReason: 'length',
            usage: { tokensIn, tokensOut },
          },
        ]
      }
      case 'slow_stream':
        return [{ delta: MOCK_FAULT_TEXTS.slow_stream, finishReason: 'stop' }]
    }
  }

  private nextChunks(req: ChatRequest): readonly ChatChunk[] {
    const call = this.calls
    this.calls += 1

    const error = this.options.errors?.[call]
    if (error !== undefined) {
      throw error
    }

    const faultError = this.faultError()
    if (faultError) {
      throw faultError
    }

    if (this.options.script && this.options.script.length > 0) {
      const index = Math.min(call, this.options.script.length - 1)
      return this.options.script[index] ?? DEFAULT_CHUNKS
    }

    const faultChunks = this.faultChunks(req)
    if (faultChunks.length > 0) {
      return faultChunks
    }

    return this.options.chunks ?? DEFAULT_CHUNKS
  }

  private firstTokenDelayMs(): number {
    if (this.options.firstTokenDelayMs !== undefined) {
      return Math.max(0, this.options.firstTokenDelayMs)
    }
    return this.options.fault === 'slow_stream' ? MOCK_SLOW_FIRST_TOKEN_MS : 0
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    this.options.onRequest?.(req)
    const chunks = this.nextChunks(req)
    const firstDelay = this.firstTokenDelayMs()
    if (firstDelay > 0) {
      await sleep(firstDelay)
    }
    let text = ''
    let reasoning = ''
    let finishReason: FinishReason = null
    let usage: TokenUsage | undefined

    for (const chunk of chunks) {
      text += chunk.delta
      if (chunk.reasoningDelta) {
        reasoning += chunk.reasoningDelta
      }
      if (chunk.finishReason) {
        finishReason = chunk.finishReason
      }
      if (chunk.usage) {
        usage = chunk.usage
      }
    }

    if (req.signal?.aborted) {
      throw new DOMException('请求已取消。', 'AbortError')
    }

    return {
      text,
      ...(reasoning ? { reasoning } : {}),
      finishReason,
      usage: usage ?? {
        tokensIn: Array.from(text).length,
        tokensOut: Array.from(text).length,
      },
    }
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    this.options.onRequest?.(req)
    const chunks = this.nextChunks(req)
    const firstDelay = this.firstTokenDelayMs()
    const perChunkDelay = this.options.delayMs ?? 0
    let index = 0

    for (const chunk of chunks) {
      const wait = (index === 0 ? firstDelay : 0) + perChunkDelay
      if (wait > 0) {
        await sleep(wait)
      }
      if (req.signal?.aborted) {
        throw new DOMException('请求已取消。', 'AbortError')
      }
      yield chunk
      index += 1
    }
  }

  async structured<T>(
    req: ChatRequest,
    schema: ZodType<T>,
    opts?: StructuredOptions,
  ): Promise<T> {
    return runStructured(this, req, schema, opts)
  }

  async ping(): Promise<PingResult> {
    return this.options.pingResult ?? { ok: true, latencyMs: 0 }
  }
}
