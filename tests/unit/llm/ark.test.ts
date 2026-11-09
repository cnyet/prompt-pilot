import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArkProvider, type ArkProviderConfig } from '@/lib/llm/ark'
import { LlmError, classifyLengthCause } from '@/lib/llm/errors'
import type { ChatRequest } from '@/lib/llm/types'
import {
  chatChunk,
  collectChunks,
  completionResponse,
  createScriptedFetch,
  errorResponse,
  sseResponse,
  usageOnlyChunk,
} from '../../fixtures/llm/http'

function createArk(
  fetchImpl: typeof globalThis.fetch,
  overrides: Partial<ArkProviderConfig> = {},
): ArkProvider {
  return new ArkProvider({
    id: 'ark-generate',
    label: '方舟测试',
    baseURL: 'https://ark.test/api/v3',
    apiKey: 'test-key',
    model: 'doubao-seed-2-1-pro-260915',
    fetch: fetchImpl,
    pricing: {
      inputCnyPerMillion: 6,
      cachedInputCnyPerMillion: 1.2,
      outputCnyPerMillion: 30,
    },
    contextWindow: 1_048_576,
    retry: { maxAttempts: 3, baseDelayMs: 0, sleep: async () => {} },
    ...overrides,
  })
}

const baseRequest: ChatRequest = {
  modelConfigId: 'ark-generate',
  messages: [{ role: 'user', content: '帮我写一份周报' }],
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ArkProvider 请求构造', () => {
  it('默认显式关闭 thinking，且 reasoning_effort 不随 disabled 下发', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([chatChunk({ content: '好' }, 'stop')]),
    )
    const provider = createArk(fake.fetch)

    await collectChunks(
      provider.stream({ ...baseRequest, reasoningEffort: 'high' }),
    )

    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]?.body.thinking).toEqual({ type: 'disabled' })
    expect(fake.calls[0]?.body.reasoning_effort).toBeUndefined()
    expect(fake.calls[0]?.body.service_tier).toBe('default')
  })

  it('thinking=on / auto 分别映射为 enabled / auto，开启时才下发 reasoning_effort', async () => {
    const responses = [
      sseResponse([chatChunk({ content: 'on' }, 'stop')]),
      sseResponse([chatChunk({ content: 'auto' }, 'stop')]),
    ]
    const fake = createScriptedFetch(() => responses.shift() ?? responses[0]!)
    const provider = createArk(fake.fetch)

    await collectChunks(
      provider.stream({ ...baseRequest, thinking: 'on', reasoningEffort: 'medium' }),
    )
    await collectChunks(provider.stream({ ...baseRequest, thinking: 'auto' }))

    expect(fake.calls[0]?.body.thinking).toEqual({ type: 'enabled' })
    expect(fake.calls[0]?.body.reasoning_effort).toBe('medium')
    expect(fake.calls[1]?.body.thinking).toEqual({ type: 'auto' })
    expect(fake.calls[1]?.body.reasoning_effort).toBeUndefined()
  })

  it('流式请求显式带 stream_options.include_usage', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([chatChunk({ content: '好' }, 'stop')]),
    )
    const provider = createArk(fake.fetch)

    await collectChunks(provider.stream(baseRequest))

    expect(fake.calls[0]?.body.stream).toBe(true)
    expect(fake.calls[0]?.body.stream_options).toEqual({ include_usage: true })
  })

  it('maxTokens 只下发 max_tokens，不同时下发 max_completion_tokens', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([chatChunk({ content: '好' }, 'stop')]),
    )
    const provider = createArk(fake.fetch)

    await collectChunks(provider.stream({ ...baseRequest, maxTokens: 123 }))

    expect(fake.calls[0]?.body.max_tokens).toBe(123)
    expect(fake.calls[0]?.body).not.toHaveProperty('max_completion_tokens')
  })

  it('maxCompletionTokens 只下发 max_completion_tokens，不同时下发 max_tokens', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([chatChunk({ content: '好' }, 'stop')]),
    )
    const provider = createArk(fake.fetch)

    await collectChunks(provider.stream({ ...baseRequest, maxCompletionTokens: 456 }))

    expect(fake.calls[0]?.body.max_completion_tokens).toBe(456)
    expect(fake.calls[0]?.body).not.toHaveProperty('max_tokens')
  })

  it('两个上限同时传直接报 invalid_input，且不发请求', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([chatChunk({ content: '好' }, 'stop')]),
    )
    const provider = createArk(fake.fetch)

    await expect(
      provider.chat({ ...baseRequest, maxTokens: 100, maxCompletionTokens: 200 }),
    ).rejects.toMatchObject({ kind: 'invalid_input', retryable: false })
    expect(fake.calls).toHaveLength(0)
  })

  it('未设置上限时默认 max_tokens=4096', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([chatChunk({ content: '好' }, 'stop')]),
    )
    const provider = createArk(fake.fetch)

    await collectChunks(provider.stream(baseRequest))

    expect(fake.calls[0]?.body.max_tokens).toBe(4096)
    expect(fake.calls[0]?.body).not.toHaveProperty('max_completion_tokens')
  })

  it.each(['doubao-seed-2-1-pro-260915', 'ep-20250101-abcde'])(
    'model 同时支持 Model ID 与 ep- 接入点 ID：%s',
    async (model) => {
      const fake = createScriptedFetch(() =>
        sseResponse([chatChunk({ content: '好' }, 'stop')]),
      )
      const provider = createArk(fake.fetch, { model })

      await collectChunks(provider.stream(baseRequest))

      expect(fake.calls[0]?.body.model).toBe(model)
    },
  )

  it('prompt_cache_key 与 service_tier 只在 provider 内部下发', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([chatChunk({ content: '好' }, 'stop')]),
    )
    const provider = createArk(fake.fetch)

    await collectChunks(
      provider.stream({ ...baseRequest, cacheKey: 'prompt-123', serviceTier: 'fast' }),
    )

    expect(fake.calls[0]?.body.prompt_cache_key).toBe('prompt-123')
    expect(fake.calls[0]?.body.service_tier).toBe('fast')
  })
})

describe('ArkProvider 流式用量与思维链', () => {
  it('末尾 choices 为空数组的 chunk 返回 usage（含缓存与思维链 token）', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([
        chatChunk({ role: 'assistant', content: '' }),
        chatChunk({ content: '你好' }),
        chatChunk({ content: '，世界' }),
        chatChunk({}, 'stop'),
        usageOnlyChunk({
          prompt_tokens: 12,
          completion_tokens: 7,
          total_tokens: 19,
          prompt_tokens_details: { cached_tokens: 4 },
          completion_tokens_details: { reasoning_tokens: 2 },
        }),
      ]),
    )
    const provider = createArk(fake.fetch)

    const chunks = await collectChunks(provider.stream(baseRequest))
    const last = chunks[chunks.length - 1]

    expect(last?.delta).toBe('')
    expect(last?.usage).toEqual({
      tokensIn: 12,
      tokensOut: 7,
      cachedTokens: 4,
      reasoningTokens: 2,
      // (12-4)*6 + 4*1.2 + 7*30 = 262.8 元/百万 token
      costCny: 0.000263,
    })
  })

  it('拿不到 usage 时不伪造 0 成本', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([
        chatChunk({ content: '没有用量' }),
        chatChunk({}, 'stop'),
      ]),
    )
    const provider = createArk(fake.fetch)

    const chunks = await collectChunks(provider.stream(baseRequest))

    expect(chunks).toHaveLength(2)
    expect(chunks.every((chunk) => chunk.usage === undefined)).toBe(true)
  })

  it('reasoning_content 只进 reasoningDelta，绝不混进正文', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([
        chatChunk({ reasoning_content: '先想' }),
        chatChunk({ reasoning_content: '再想' }),
        chatChunk({ content: '答案' }),
        chatChunk({}, 'stop'),
      ]),
    )
    const provider = createArk(fake.fetch)

    const chunks = await collectChunks(provider.stream(baseRequest))
    const text = chunks.map((chunk) => chunk.delta).join('')
    const reasoning = chunks.map((chunk) => chunk.reasoningDelta ?? '').join('')

    expect(text).toBe('答案')
    expect(reasoning).toBe('先想再想')
    for (const chunk of chunks) {
      if (chunk.reasoningDelta) {
        expect(chunk.delta).toBe('')
      }
    }
  })

  it('chat 也把思维链放到 reasoning，而不是 text', async () => {
    const fake = createScriptedFetch(() =>
      completionResponse('最终答案', {
        reasoning: '内部推理',
        usage: {
          prompt_tokens: 9,
          completion_tokens: 5,
          total_tokens: 14,
          completion_tokens_details: { reasoning_tokens: 3 },
        },
      }),
    )
    const provider = createArk(fake.fetch)

    const result = await provider.chat(baseRequest)

    expect(result.text).toBe('最终答案')
    expect(result.reasoning).toBe('内部推理')
    expect(result.usage.reasoningTokens).toBe(3)
  })
})

describe('finish_reason=length 的三种成因', () => {
  it('max_tokens 按「输出 token - 思维链 token」判断', () => {
    expect(
      classifyLengthCause({
        maxTokens: 100,
        usage: { tokensIn: 10, tokensOut: 140, reasoningTokens: 40 },
      }),
    ).toBe('max_tokens')
  })

  it('max_completion_tokens 直接比较输出 token', () => {
    expect(
      classifyLengthCause({
        maxCompletionTokens: 200,
        usage: { tokensIn: 10, tokensOut: 200, reasoningTokens: 50 },
      }),
    ).toBe('max_completion_tokens')
  })

  it('没顶到参数上限但顶到上下文窗口时归因为 context_window', () => {
    expect(
      classifyLengthCause({
        maxTokens: 4096,
        contextWindow: 1024,
        usage: { tokensIn: 1000, tokensOut: 24 },
      }),
    ).toBe('context_window')
  })

  it('usage 缺失或未达任何已知上限时返回 unknown，不猜', () => {
    expect(classifyLengthCause({ maxTokens: 100 })).toBe('unknown')
    expect(
      classifyLengthCause({
        maxTokens: 4096,
        contextWindow: 8192,
        usage: { tokensIn: 10, tokensOut: 20 },
      }),
    ).toBe('unknown')
  })

  it('流式收到 length + usage 后日志写明成因', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = createScriptedFetch(() =>
      sseResponse([
        chatChunk({ content: '被截断' }, 'length'),
        usageOnlyChunk({
          prompt_tokens: 10,
          completion_tokens: 50,
          total_tokens: 60,
        }),
      ]),
    )
    const provider = createArk(fake.fetch)

    await collectChunks(provider.stream({ ...baseRequest, maxTokens: 50 }))

    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('max_tokens')
    expect(String(warn.mock.calls[0]?.[0])).toContain('finish_reason=length')
  })

  it('流式没有 usage 时日志归因为 unknown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = createScriptedFetch(() =>
      sseResponse([chatChunk({ content: '' }, 'length')]),
    )
    const provider = createArk(fake.fetch)

    await collectChunks(provider.stream({ ...baseRequest, maxTokens: 50 }))

    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0]?.[0])).toContain('unknown')
  })
})

describe('ArkProvider 错误分级与重试边界', () => {
  it.each([
    [401, 'AuthenticationError', 'auth'],
    [403, 'OperationDenied.ServiceNotOpen', 'forbidden'],
    [400, 'InvalidParameter.temperature', 'invalid_input'],
    [400, 'InputTextSensitiveContentDetected', 'content_filter'],
  ])('HTTP %i（%s）不重试，归类为 %s', async (status, code, kind) => {
    const fake = createScriptedFetch(() =>
      errorResponse(status, code, '请求失败'),
    )
    const provider = createArk(fake.fetch)

    await expect(provider.chat(baseRequest)).rejects.toMatchObject({
      kind,
      retryable: false,
    })
    expect(fake.calls).toHaveLength(1)
  })

  it('429 限流按指数退避重试，最多 3 次', async () => {
    const fake = createScriptedFetch(() =>
      errorResponse(429, 'RateLimitExceeded.EndpointRPMExceeded', '限流'),
    )
    const provider = createArk(fake.fetch)

    await expect(provider.chat(baseRequest)).rejects.toMatchObject({
      kind: 'rate_limited',
      retryable: true,
    })
    expect(fake.calls).toHaveLength(3)
  })

  it('429 ServerOverloaded 归类为 overloaded 且可重试', async () => {
    const fake = createScriptedFetch(() =>
      errorResponse(429, 'ServerOverloaded', '繁忙'),
    )
    const provider = createArk(fake.fetch)

    await expect(provider.chat(baseRequest)).rejects.toMatchObject({
      kind: 'overloaded',
      retryable: true,
    })
    expect(fake.calls).toHaveLength(3)
  })

  it('429 QuotaExceeded 额度用尽，不重试', async () => {
    const fake = createScriptedFetch(() =>
      errorResponse(429, 'QuotaExceeded', '额度用尽'),
    )
    const provider = createArk(fake.fetch)

    await expect(provider.chat(baseRequest)).rejects.toMatchObject({
      kind: 'quota_exceeded',
      retryable: false,
    })
    expect(fake.calls).toHaveLength(1)
  })

  it('5xx 可重试，最多 3 次', async () => {
    const fake = createScriptedFetch(() =>
      errorResponse(503, 'NoAvailableService', '无可用服务'),
    )
    const provider = createArk(fake.fetch)

    await expect(provider.chat(baseRequest)).rejects.toMatchObject({
      kind: 'server',
      retryable: true,
    })
    expect(fake.calls).toHaveLength(3)
  })

  it('重试后成功会返回结果', async () => {
    const fake = createScriptedFetch((_request, callIndex) => {
      if (callIndex === 0) {
        return errorResponse(500, 'InternalServiceError', '临时错误')
      }
      return completionResponse('恢复成功')
    })
    const provider = createArk(fake.fetch)

    const result = await provider.chat(baseRequest)

    expect(result.text).toBe('恢复成功')
    expect(fake.calls).toHaveLength(2)
  })

  it('LlmError 保留 kind / code / retryable', async () => {
    const fake = createScriptedFetch(() =>
      errorResponse(401, 'AuthenticationError', 'bad key'),
    )
    const provider = createArk(fake.fetch)

    await expect(provider.chat(baseRequest)).rejects.toBeInstanceOf(LlmError)
    await expect(provider.chat(baseRequest)).rejects.toMatchObject({
      code: 'AuthenticationError',
      retryable: false,
    })
  })
})

describe('ArkProvider ping', () => {
  it('成功时返回耗时，并用 1 token + 关闭思维链做轻量探测', async () => {
    const fake = createScriptedFetch(() => completionResponse('pong'))
    const provider = createArk(fake.fetch)

    const result = await provider.ping()

    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(fake.calls[0]?.body.max_tokens).toBe(1)
    expect(fake.calls[0]?.body.thinking).toEqual({ type: 'disabled' })
    expect(fake.calls[0]?.body.stream).toBeUndefined()
  })

  it('失败时返回明确原因且不重试', async () => {
    const fake = createScriptedFetch(() =>
      errorResponse(401, 'AuthenticationError', 'bad key'),
    )
    const provider = createArk(fake.fetch)

    const result = await provider.ping()

    expect(result.ok).toBe(false)
    expect(result.error).toContain('认证失败')
    expect(result.error).toContain('ARK_API_KEY')
    expect(fake.calls).toHaveLength(1)
  })

  it('网络错误时返回明确原因', async () => {
    const fake = createScriptedFetch(() => {
      throw new TypeError('fetch failed')
    })
    const provider = createArk(fake.fetch)

    const result = await provider.ping()

    expect(result.ok).toBe(false)
    expect(result.error).toContain('无法连接方舟')
    expect(fake.calls).toHaveLength(1)
  })
})
