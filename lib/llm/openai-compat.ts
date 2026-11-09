import OpenAI from 'openai'
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsBase,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionStreamOptions,
} from 'openai/resources/chat/completions'
import type { CompletionUsage } from 'openai/resources/completions'
import type { ZodType } from 'zod'
import {
  classifyError,
  classifyLengthCause,
  createLlmError,
  describeLengthCause,
  withRetry,
  type LengthCause,
  type RetryOptions,
} from './errors'
import { runStructured } from './structured'
import type {
  ChatChunk,
  ChatMessage,
  ChatRequest,
  ChatResult,
  FinishReason,
  LLMProvider,
  PingResult,
  StructuredOptions,
  TokenUsage,
} from './types'

/**
 * 基于 openai npm 包的 OpenAI 兼容实现。
 *
 * 方舟官方没有 Node SDK，数据面又走 OpenAI 协议，所以这一层是 Ark 与
 * 其他 OpenAI 兼容端点的共同底座。协议差异（thinking、reasoning_content 等）
 * 通过受保护的钩子留给子类收口，业务层不需要知道。
 */

export interface ModelPricingCny {
  /** 元 / 百万输入 token */
  inputCnyPerMillion?: number
  /** 元 / 百万缓存命中 token */
  cachedInputCnyPerMillion?: number
  /** 元 / 百万输出 token */
  outputCnyPerMillion?: number
}

export interface OpenAICompatConfig {
  id: string
  label: string
  baseURL: string
  apiKey: string
  model: string
  headers?: Record<string, string>
  pricing?: ModelPricingCny
  contextWindow?: number
  timeoutMs?: number
  /** 测试注入用；生产走全局 fetch */
  fetch?: typeof globalThis.fetch
  retry?: RetryOptions
}

/** 在 Chat Completions 基础参数上补一个 stream 标记。 */
export type OpenAIRequestParams = ChatCompletionCreateParamsBase & {
  stream?: boolean
  stream_options?: ChatCompletionStreamOptions | null
}

function mapFinishReason(reason: string | null | undefined): FinishReason {
  switch (reason) {
    case 'stop':
    case 'length':
    case 'content_filter':
    case 'tool_calls':
      return reason
    case 'function_call':
      return 'tool_calls'
    default:
      return null
  }
}

function toOpenAIMessages(messages: readonly ChatMessage[]): ChatCompletionMessageParam[] {
  return messages.map((message) => {
    switch (message.role) {
      case 'system':
        return { role: 'system', content: message.content }
      case 'user':
        return { role: 'user', content: message.content }
      case 'assistant':
        return { role: 'assistant', content: message.content }
      case 'tool':
        if (!message.toolCallId) {
          throw createLlmError('invalid_input', 'tool 角色消息缺少 toolCallId。')
        }
        return {
          role: 'tool',
          content: message.content,
          tool_call_id: message.toolCallId,
        }
    }
  })
}

export class OpenAICompatProvider implements LLMProvider {
  readonly id: string
  readonly label: string

  protected readonly client: OpenAI
  protected readonly config: OpenAICompatConfig

  constructor(config: OpenAICompatConfig) {
    this.config = config
    this.id = config.id
    this.label = config.label
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeoutMs ?? 120_000,
      // 重试由 withRetry 统一实现，避免 SDK 内部再重试导致次数与日志失真。
      maxRetries: 0,
      ...(config.headers ? { defaultHeaders: config.headers } : {}),
      ...(config.fetch ? { fetch: config.fetch } : {}),
    })
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const result = await withRetry(
      () => this.requestChat(req),
      (error) => classifyError(error, req.signal),
      this.config.retry,
    )
    return result
  }

  async *stream(req: ChatRequest): AsyncIterable<ChatChunk> {
    const body = this.buildBody(req, true)
    const iterator = await withRetry(
      async () => {
        const stream = await this.client.chat.completions.create(
          body as ChatCompletionCreateParamsStreaming,
          { signal: req.signal },
        )
        return stream[Symbol.asyncIterator]()
      },
      (error) => classifyError(error, req.signal),
      this.config.retry,
    )

    const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : undefined
    const maxCompletionTokens =
      typeof body.max_completion_tokens === 'number'
        ? body.max_completion_tokens
        : undefined

    let finishReason: FinishReason = null
    let usage: TokenUsage | undefined
    let lengthLogged = false

    try {
      while (true) {
        const next = await iterator.next()
        if (next.done) {
          break
        }
        const chunk = this.mapChunk(next.value)
        if (!chunk) {
          continue
        }
        if (chunk.finishReason) {
          finishReason = chunk.finishReason
        }
        if (chunk.usage) {
          usage = chunk.usage
        }
        if (!lengthLogged && finishReason === 'length' && usage) {
          lengthLogged = true
          this.logLengthCause(
            classifyLengthCause({
              maxTokens,
              maxCompletionTokens,
              usage,
              contextWindow: this.config.contextWindow,
            }),
            usage,
          )
        }
        yield chunk
      }
    } catch (error) {
      throw classifyError(error, req.signal)
    }

    if (!lengthLogged && finishReason === 'length') {
      this.logLengthCause(
        classifyLengthCause({
          maxTokens,
          maxCompletionTokens,
          usage,
          contextWindow: this.config.contextWindow,
        }),
        usage,
      )
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
    const startedAt = Date.now()
    try {
      await this.requestChat({
        modelConfigId: this.id,
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 1,
        thinking: 'off',
      })
      return { ok: true, latencyMs: Date.now() - startedAt }
    } catch (error) {
      const llmError = classifyError(error)
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        error: llmError.message,
      }
    }
  }

  /** 单次请求，不做重试；重试由 chat / stream 统一包一层。 */
  protected async requestChat(req: ChatRequest): Promise<ChatResult> {
    const body = this.buildBody(req, false)
    const completion = (await this.client.chat.completions.create(
      body as ChatCompletionCreateParamsNonStreaming,
      { signal: req.signal },
    )) as ChatCompletion

    const choice = completion.choices[0]
    if (!choice) {
      throw createLlmError('invalid_output', '模型没有返回任何候选结果。')
    }

    const text = typeof choice.message.content === 'string' ? choice.message.content : ''
    const reasoning = this.extractReasoningFromMessage(choice.message)
    const finishReason = mapFinishReason(choice.finish_reason)
    const usage = completion.usage ? this.mapUsage(completion.usage) : undefined

    if (!usage) {
      console.warn('[llm] 响应缺少 usage，本次调用的成本将标记为未知。')
    }
    if (finishReason === 'length') {
      this.logLengthCause(
        classifyLengthCause({
          maxTokens: typeof body.max_tokens === 'number' ? body.max_tokens : undefined,
          maxCompletionTokens:
            typeof body.max_completion_tokens === 'number'
              ? body.max_completion_tokens
              : undefined,
          usage,
          contextWindow: this.config.contextWindow,
        }),
        usage,
      )
    }

    return {
      text,
      ...(reasoning ? { reasoning } : {}),
      finishReason,
      // ChatResult 的 usage 是必填；拿不到时给 0 且不写 costCny，
      // 让上层能通过 costCny === undefined 判断成本未知，而不是误显示 0 元。
      usage: usage ?? { tokensIn: 0, tokensOut: 0 },
    }
  }

  /** 组装请求体；子类在这里追加方舟扩展字段。 */
  protected buildBody(req: ChatRequest, stream: boolean): OpenAIRequestParams {
    if (req.maxTokens !== undefined && req.maxCompletionTokens !== undefined) {
      throw createLlmError(
        'invalid_input',
        'maxTokens 与 maxCompletionTokens 互斥，只能传一个。',
      )
    }

    const body: OpenAIRequestParams = {
      model: this.config.model,
      messages: toOpenAIMessages(req.messages),
      ...(req.maxCompletionTokens !== undefined
        ? { max_completion_tokens: req.maxCompletionTokens }
        : { max_tokens: req.maxTokens ?? 4096 }),
    }

    if (req.temperature !== undefined) {
      body.temperature = req.temperature
    }
    if (req.topP !== undefined) {
      body.top_p = req.topP
    }
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }))
    }
    if (req.jsonSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: req.jsonSchema.name,
          schema: req.jsonSchema.schema,
          strict: req.jsonSchema.strict ?? false,
        },
      }
    } else if (req.jsonObject) {
      body.response_format = { type: 'json_object' }
    }

    if (stream) {
      body.stream = true
      // 方舟多数模型默认不返回 usage，必须显式开启；适配层不提供关闭选项。
      body.stream_options = { include_usage: true }
    }

    return body
  }

  /** 把 OpenAI 的 usage 映射成与厂商无关的 TokenUsage，并估算人民币成本。 */
  protected mapUsage(usage: CompletionUsage): TokenUsage {
    const mapped: TokenUsage = {
      tokensIn: usage.prompt_tokens,
      tokensOut: usage.completion_tokens,
    }
    if (usage.prompt_tokens_details?.cached_tokens !== undefined) {
      mapped.cachedTokens = usage.prompt_tokens_details.cached_tokens
    }
    if (usage.completion_tokens_details?.reasoning_tokens !== undefined) {
      mapped.reasoningTokens = usage.completion_tokens_details.reasoning_tokens
    }

    const cost = this.estimateCost(mapped)
    if (cost !== undefined) {
      mapped.costCny = cost
    }
    return mapped
  }

  protected estimateCost(usage: TokenUsage): number | undefined {
    const pricing = this.config.pricing
    if (
      !pricing ||
      pricing.inputCnyPerMillion === undefined ||
      pricing.outputCnyPerMillion === undefined
    ) {
      return undefined
    }

    const cached = Math.max(0, usage.cachedTokens ?? 0)
    const uncached = Math.max(0, usage.tokensIn - cached)
    const cachedPrice =
      pricing.cachedInputCnyPerMillion ?? pricing.inputCnyPerMillion
    const cost =
      (uncached * pricing.inputCnyPerMillion +
        cached * cachedPrice +
        usage.tokensOut * pricing.outputCnyPerMillion) /
      1_000_000
    return Math.round(cost * 1_000_000) / 1_000_000
  }

  /** 映射单个流式 chunk；子类可覆盖 extractReasoningDelta 收口思维链。 */
  protected mapChunk(chunk: ChatCompletionChunk): ChatChunk | null {
    const choice = chunk.choices[0]
    const delta = typeof choice?.delta.content === 'string' ? choice.delta.content : ''
    const reasoningDelta = this.extractReasoningDelta(chunk)
    const finishReason = choice ? mapFinishReason(choice.finish_reason) : null
    const usage = chunk.usage ? this.mapUsage(chunk.usage) : undefined

    if (!delta && !reasoningDelta && !usage && finishReason === null) {
      return null
    }

    const result: ChatChunk = { delta }
    if (reasoningDelta) {
      result.reasoningDelta = reasoningDelta
    }
    if (finishReason !== null) {
      result.finishReason = finishReason
    }
    if (usage) {
      result.usage = usage
    }
    return result
  }

  /** 默认没有思维链字段；方舟在子类里覆盖。 */
  protected extractReasoningDelta(_chunk: ChatCompletionChunk): string | undefined {
    return undefined
  }

  /** 默认没有思维链字段；方舟在子类里覆盖。 */
  protected extractReasoningFromMessage(
    _message: ChatCompletion['choices'][number]['message'],
  ): string | undefined {
    return undefined
  }

  protected logLengthCause(cause: LengthCause, usage?: TokenUsage): void {
    console.warn(
      `[llm] finish_reason=length，成因=${cause}。${describeLengthCause(cause)}`,
      usage
        ? {
            tokensIn: usage.tokensIn,
            tokensOut: usage.tokensOut,
            reasoningTokens: usage.reasoningTokens,
          }
        : undefined,
    )
  }
}
