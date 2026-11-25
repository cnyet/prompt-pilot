import { describe, expect, it, vi } from 'vitest'
import { OpenAICompatProvider } from '@/lib/llm/openai-compat'
import type { ChatRequest } from '@/lib/llm/types'
import {
  chatChunk,
  collectChunks,
  completionResponse,
  createScriptedFetch,
  sseResponse,
} from '../../fixtures/llm/http'

function createProvider(fetchImpl: typeof globalThis.fetch): OpenAICompatProvider {
  return new OpenAICompatProvider({
    id: 'compat',
    label: 'OpenAI 兼容',
    baseURL: 'https://compat.test/v1',
    apiKey: 'test-key',
    model: 'test-model',
    fetch: fetchImpl,
    pricing: {
      inputCnyPerMillion: 10,
      cachedInputCnyPerMillion: 1,
      outputCnyPerMillion: 20,
    },
    retry: { maxAttempts: 1, sleep: async () => {} },
  })
}

const baseRequest: ChatRequest = {
  modelConfigId: 'compat',
  messages: [{ role: 'user', content: '你好' }],
}

describe('OpenAICompatProvider', () => {
  it('把 finish_reason=function_call 归一为 tool_calls', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([chatChunk({ content: '' }, 'function_call')]),
    )
    const provider = createProvider(fake.fetch)

    const chunks = await collectChunks(provider.stream(baseRequest))

    expect(chunks[0]?.finishReason).toBe('tool_calls')
  })

  it('chat 缺少 usage 时返回 0 token 但不写 costCny，并留下告警', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = createScriptedFetch(
      () =>
        new Response(
          JSON.stringify({
            id: 'chatcmpl-test',
            object: 'chat.completion',
            created: 1_700_000_000,
            model: 'test-model',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: '没有用量' },
                finish_reason: 'stop',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )
    const provider = createProvider(fake.fetch)

    const result = await provider.chat(baseRequest)

    expect(result.usage).toEqual({ tokensIn: 0, tokensOut: 0 })
    expect(result.usage.costCny).toBeUndefined()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('按价格表估算人民币成本', async () => {
    const fake = createScriptedFetch(() =>
      completionResponse('好', {
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_tokens_details: { cached_tokens: 40 },
        },
      }),
    )
    const provider = createProvider(fake.fetch)

    const result = await provider.chat(baseRequest)

    // (100-40)*10 + 40*1 + 20*20 = 1040 元/百万 token
    expect(result.usage.costCny).toBe(0.00104)
  })

  it('jsonSchema 映射到 response_format.json_schema', async () => {
    const fake = createScriptedFetch(() => completionResponse('{"ok":true}'))
    const provider = createProvider(fake.fetch)

    await provider.chat({
      ...baseRequest,
      jsonSchema: {
        name: 'test_schema',
        schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
        strict: true,
      },
    })

    expect(fake.calls[0]?.body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'test_schema',
        schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
        strict: true,
      },
    })
  })

  it('jsonObject 映射到 response_format.json_object', async () => {
    const fake = createScriptedFetch(() => completionResponse('{"ok":true}'))
    const provider = createProvider(fake.fetch)

    await provider.chat({ ...baseRequest, jsonObject: true })

    expect(fake.calls[0]?.body.response_format).toEqual({ type: 'json_object' })
  })

  it('tool 消息缺少 toolCallId 时直接 invalid_input', async () => {
    const fake = createScriptedFetch(() => completionResponse('ok'))
    const provider = createProvider(fake.fetch)

    await expect(
      provider.chat({
        ...baseRequest,
        messages: [{ role: 'tool', content: '结果' }],
      }),
    ).rejects.toMatchObject({ kind: 'invalid_input' })
    expect(fake.calls).toHaveLength(0)
  })
})

describe('OpenAICompatProvider thinking 开关', () => {
  it('默认显式下发 thinking.type=disabled，防止思维链吃满 max_tokens 预算', async () => {
    const fake = createScriptedFetch(() =>
      sseResponse([chatChunk({ content: '好' }, 'stop')]),
    )
    const provider = createProvider(fake.fetch)

    await collectChunks(provider.stream(baseRequest))

    expect(fake.calls[0]?.body.thinking).toEqual({ type: 'disabled' })
  })

  it('off / on / auto 分别映射为 disabled / enabled / auto', async () => {
    const responses = [
      sseResponse([chatChunk({ content: 'off' }, 'stop')]),
      sseResponse([chatChunk({ content: 'on' }, 'stop')]),
      sseResponse([chatChunk({ content: 'auto' }, 'stop')]),
    ]
    const fake = createScriptedFetch(() => responses.shift() ?? responses[0]!)
    const provider = createProvider(fake.fetch)

    await collectChunks(provider.stream({ ...baseRequest, thinking: 'off' }))
    await collectChunks(provider.stream({ ...baseRequest, thinking: 'on' }))
    await collectChunks(provider.stream({ ...baseRequest, thinking: 'auto' }))

    expect(fake.calls[0]?.body.thinking).toEqual({ type: 'disabled' })
    expect(fake.calls[1]?.body.thinking).toEqual({ type: 'enabled' })
    expect(fake.calls[2]?.body.thinking).toEqual({ type: 'auto' })
  })

  it('非流式 chat 同样下发 thinking 开关', async () => {
    const fake = createScriptedFetch(() => completionResponse('好'))
    const provider = createProvider(fake.fetch)

    await provider.chat(baseRequest)

    expect(fake.calls[0]?.body.thinking).toEqual({ type: 'disabled' })
  })
})

describe('峰值计费与免费档', () => {
  const usage = {
    prompt_tokens: 1_000_000,
    completion_tokens: 1_000_000,
    total_tokens: 2_000_000,
  }
  const peakPricing = {
    inputCnyPerMillion: 1,
    outputCnyPerMillion: 2,
    peak: {
      factor: 2,
      utcWeekdayHourRanges: [[1, 4], [6, 10]] as readonly (readonly [
        number,
        number,
      ])[],
    },
  }
  function priced(fetchImpl: typeof globalThis.fetch, pricing: object) {
    return new OpenAICompatProvider({
      id: 'compat',
      label: 'OpenAI 兼容',
      baseURL: 'https://compat.test/v1',
      apiKey: 'test-key',
      model: 'test-model',
      fetch: fetchImpl,
      pricing,
      retry: { maxAttempts: 1, sleep: async () => {} },
    })
  }

  it('UTC 工作日峰值窗口内价格乘 factor，窗口外与周末不乘', async () => {
    vi.useFakeTimers()
    try {
      const at = (iso: string) => vi.setSystemTime(new Date(iso))
      const run = async () => {
        const fake = createScriptedFetch(() => completionResponse('好', { usage }))
        return (await priced(fake.fetch, peakPricing).chat(baseRequest)).usage
          .costCny
      }
      at('2026-11-25T02:00:00Z') // 周三 UTC 02，落在 [1,4)
      expect(await run()).toBe(6)
      at('2026-11-25T05:00:00Z') // 周三 UTC 05，窗口外
      expect(await run()).toBe(3)
      at('2026-11-28T02:00:00Z') // 周六，不乘
      expect(await run()).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('免费档价格 0 时成本为已知 0，不是未知', async () => {
    const fake = createScriptedFetch(() => completionResponse('好', { usage }))
    const provider = priced(fake.fetch, {
      inputCnyPerMillion: 0,
      cachedInputCnyPerMillion: 0,
      outputCnyPerMillion: 0,
    })

    const result = await provider.chat(baseRequest)

    expect(result.usage.costCny).toBe(0)
  })
})
