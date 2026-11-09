import type { ZodType } from 'zod'
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

export interface MockProviderOptions {
  id?: string
  label?: string
  /** 默认输出；不传时给一段固定文本。 */
  chunks?: readonly ChatChunk[]
  /** 按调用次数依次取脚本；用完后重复最后一段。 */
  script?: readonly (readonly ChatChunk[])[]
  /** 按调用次数抛错，用于测试重试与错误文案。 */
  errors?: readonly unknown[]
  /** 测试用：每次调用前记录请求，便于断言请求体降级路径。 */
  onRequest?: (req: ChatRequest) => void
  pingResult?: PingResult
  delayMs?: number
}

const DEFAULT_CHUNKS: readonly ChatChunk[] = [
  { delta: '这是 Mock provider 的固定输出。', finishReason: 'stop' },
]

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

  private nextChunks(): readonly ChatChunk[] {
    const call = this.calls
    this.calls += 1

    const error = this.options.errors?.[call]
    if (error !== undefined) {
      throw error
    }

    if (this.options.script && this.options.script.length > 0) {
      const index = Math.min(call, this.options.script.length - 1)
      return this.options.script[index] ?? DEFAULT_CHUNKS
    }
    return this.options.chunks ?? DEFAULT_CHUNKS
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    this.options.onRequest?.(req)
    const chunks = this.nextChunks()
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
    const chunks = this.nextChunks()
    for (const chunk of chunks) {
      if (req.signal?.aborted) {
        throw new DOMException('请求已取消。', 'AbortError')
      }
      if (this.options.delayMs && this.options.delayMs > 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, this.options.delayMs)
        })
      }
      yield chunk
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
