import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createLlmError } from '@/lib/llm/errors'
import {
  MOCK_FAULT_PROFILES,
  MOCK_FAULT_TEXTS,
  MOCK_SLOW_FIRST_TOKEN_MS,
  MockProvider,
} from '@/lib/llm/mock'
import { getGenerateProvider } from '@/lib/llm/registry'
import {
  runStructuredOutcome,
  type StructuredFallback,
  type StructuredOutcome,
} from '@/lib/llm/structured'
import type { ChatRequest } from '@/lib/llm/types'

const schema = z.object({ ok: z.boolean(), note: z.string().optional() })

function makeRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return {
    modelConfigId: 'mock',
    messages: [{ role: 'user', content: '请输出 JSON' }],
    ...overrides,
  }
}

function withSchema(overrides: Partial<ChatRequest> = {}): ChatRequest {
  return makeRequest({
    jsonSchema: { name: 'test', schema: { type: 'object' }, strict: true },
    ...overrides,
  })
}

function requireFallback<T>(outcome: StructuredOutcome<T>): StructuredFallback {
  if (outcome.kind !== 'text') {
    throw new Error('期望纯文本降级结果，实际是结构化结果')
  }
  return outcome
}

describe('MockProvider 六种故障画像', () => {
  it('画像清单固定为六种', () => {
    expect(MOCK_FAULT_PROFILES).toEqual([
      'bad_json',
      'fenced_json',
      'truncated',
      'rate_limited',
      'quota_exceeded',
      'slow_stream',
    ])
  })

  it('bad_json：返回不可解析的普通文本', async () => {
    const provider = new MockProvider({ fault: 'bad_json' })
    const result = await provider.chat(makeRequest())

    expect(result.text).toBe(MOCK_FAULT_TEXTS.bad_json)
    expect(result.finishReason).toBe('stop')
  })

  it('fenced_json：返回 Markdown 围栏包裹的合法 JSON', async () => {
    const provider = new MockProvider({ fault: 'fenced_json' })
    const result = await provider.chat(makeRequest())

    expect(result.text).toContain('```json')
    expect(result.text).toContain('{"ok":true}')
  })

  it('truncated：finish_reason=length，且 usage 能反推 max_tokens 成因', async () => {
    const provider = new MockProvider({ fault: 'truncated' })
    const outcome = await runStructuredOutcome(
      provider,
      withSchema({ maxTokens: 32 }),
      schema,
    )
    const fallback = requireFallback(outcome)

    expect(fallback.finishReason).toBe('length')
    expect(fallback.lengthCause).toBe('max_tokens')
    expect(fallback.text).toBe(MOCK_FAULT_TEXTS.truncated)
  })

  it('truncated：能反推 max_completion_tokens 成因', async () => {
    const provider = new MockProvider({ fault: 'truncated' })
    const outcome = await runStructuredOutcome(
      provider,
      withSchema({ maxCompletionTokens: 64 }),
      schema,
    )

    expect(requireFallback(outcome).lengthCause).toBe('max_completion_tokens')
  })

  it('truncated：能反推上下文窗口耗尽', async () => {
    const provider = new MockProvider({ fault: 'truncated' })
    const outcome = await runStructuredOutcome(provider, withSchema(), schema, {
      contextWindow: 1000,
    })

    expect(requireFallback(outcome).lengthCause).toBe('context_window')
  })

  it('truncated：无法反推时归 unknown，不猜', async () => {
    const provider = new MockProvider({
      chunks: [{ delta: '{"ok":', finishReason: 'length' }],
    })
    const outcome = await runStructuredOutcome(
      provider,
      withSchema({ maxTokens: 4096 }),
      schema,
    )

    expect(requireFallback(outcome).lengthCause).toBe('unknown')
  })

  it('rate_limited：429 限流，可重试', async () => {
    const provider = new MockProvider({ fault: 'rate_limited' })

    await expect(provider.chat(makeRequest())).rejects.toMatchObject({
      kind: 'rate_limited',
      retryable: true,
      code: 'RateLimitExceeded',
    })

    const iterator = provider.stream(makeRequest())[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toMatchObject({
      kind: 'rate_limited',
      retryable: true,
    })
  })

  it('quota_exceeded：429 QuotaExceeded，不可重试', async () => {
    const provider = new MockProvider({ fault: 'quota_exceeded' })

    await expect(provider.chat(makeRequest())).rejects.toMatchObject({
      kind: 'quota_exceeded',
      retryable: false,
      code: 'QuotaExceeded',
    })

    const iterator = provider.stream(makeRequest())[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toMatchObject({
      kind: 'quota_exceeded',
      retryable: false,
    })
  })

  it('slow_stream：首字默认 10 秒，延迟可注入且只延迟首字', async () => {
    expect(MOCK_SLOW_FIRST_TOKEN_MS).toBe(10_000)

    const provider = new MockProvider({
      fault: 'slow_stream',
      firstTokenDelayMs: 30,
    })
    const started = performance.now()
    const iterator = provider.stream(makeRequest())[Symbol.asyncIterator]()
    const first = await iterator.next()
    const elapsed = performance.now() - started

    expect(elapsed).toBeGreaterThanOrEqual(25)
    expect(first.done).toBe(false)
    if (!first.done) {
      expect(first.value.delta).toBe(MOCK_FAULT_TEXTS.slow_stream)
    }

    const secondStarted = performance.now()
    const second = await iterator.next()
    expect(performance.now() - secondStarted).toBeLessThan(20)
    expect(second.done).toBe(true)
  })

  it('errors 与 script 仍可精确注入，优先于画像默认内容', async () => {
    const provider = new MockProvider({
      fault: 'bad_json',
      errors: [createLlmError('rate_limited', '第一次限流')],
      script: [[{ delta: '{"ok":true}', finishReason: 'stop' }]],
    })

    await expect(provider.chat(makeRequest())).rejects.toMatchObject({
      kind: 'rate_limited',
    })
    const second = await provider.chat(makeRequest())
    expect(second.text).toBe('{"ok":true}')
  })
})

describe('MOCK_LLM_FAULT 路由注入开关', () => {
  it('无 Key 且设置合法画像时返回 MockProvider', () => {
    const provider = getGenerateProvider({ MOCK_LLM_FAULT: 'bad_json' })
    expect(provider?.id).toBe('mock-fault')
    expect(provider?.label).toContain('bad_json')
  })

  it('未设置或画像未知时保持离线（null）', () => {
    expect(getGenerateProvider({})).toBeNull()
    expect(getGenerateProvider({ MOCK_LLM_FAULT: 'unknown' })).toBeNull()
  })

  it('有 Key 时真实方舟优先，故障开关不生效', () => {
    const provider = getGenerateProvider({
      ARK_API_KEY: 'test-key',
      MOCK_LLM_FAULT: 'bad_json',
    })
    expect(provider?.id).toBe('ark-generate')
  })
})
