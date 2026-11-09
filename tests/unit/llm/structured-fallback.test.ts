import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { MockProvider } from '@/lib/llm/mock'
import {
  runStructuredOutcome,
  type StructuredAttempt,
  type StructuredFallback,
  type StructuredOutcome,
  type StructuredSuccess,
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

function withSchema(): ChatRequest {
  return makeRequest({
    jsonSchema: { name: 'test', schema: { type: 'object' }, strict: true },
  })
}

function requireStructured<T>(
  outcome: StructuredOutcome<T>,
): StructuredSuccess<T> {
  if (outcome.kind !== 'structured') {
    throw new Error(`期望结构化结果，实际是纯文本降级：${outcome.text}`)
  }
  return outcome
}

function requireFallback<T>(outcome: StructuredOutcome<T>): StructuredFallback {
  if (outcome.kind !== 'text') {
    throw new Error('期望纯文本降级结果，实际是结构化结果')
  }
  return outcome
}

function labels(attempts: readonly StructuredAttempt[]): string[] {
  return attempts.map((attempt) => {
    const repair = attempt.repair === undefined ? '' : `#${attempt.repair}`
    return `${attempt.level}:${attempt.status}${repair}`
  })
}

describe('五级降级链逐级可触发', () => {
  it('第 1 级：json_schema 严格模式一次调用成功', async () => {
    const requests: ChatRequest[] = []
    const seen: StructuredAttempt[] = []
    const provider = new MockProvider({
      chunks: [{ delta: '{"ok":true}', finishReason: 'stop' }],
      onRequest: (req) => requests.push(req),
    })

    const outcome = await runStructuredOutcome(provider, withSchema(), schema, {
      onAttempt: (attempt) => seen.push(attempt),
    })
    const structured = requireStructured(outcome)

    expect(structured.data).toEqual({ ok: true })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.jsonSchema?.strict).toBe(true)
    expect(requests[0]?.jsonObject).toBeUndefined()
    expect(labels(structured.attempts)).toEqual(['json_schema:success'])
    expect(seen).toEqual(structured.attempts)
  })

  it('第 2 级：严格模式输出不合规后降级 json_object', async () => {
    const requests: ChatRequest[] = []
    const provider = new MockProvider({
      script: [
        [{ delta: '[1,2,3]', finishReason: 'stop' }],
        [{ delta: '{"ok":true}', finishReason: 'stop' }],
      ],
      onRequest: (req) => requests.push(req),
    })

    const outcome = await runStructuredOutcome(provider, withSchema(), schema)
    const structured = requireStructured(outcome)

    expect(structured.data).toEqual({ ok: true })
    expect(requests).toHaveLength(2)
    expect(requests[0]?.jsonSchema).toBeDefined()
    expect(requests[1]?.jsonSchema).toBeUndefined()
    expect(requests[1]?.jsonObject).toBe(true)
    expect(labels(structured.attempts)).toEqual([
      'json_schema:failed',
      'json_object:success',
    ])
  })

  it('第 2 级：严格模式被 400 拒绝时也降级 json_object', async () => {
    const { createLlmError } = await import('@/lib/llm/errors')
    const requests: ChatRequest[] = []
    const provider = new MockProvider({
      errors: [createLlmError('invalid_input', 'response_format 不支持 strict')],
      script: [[{ delta: '{"ok":true}', finishReason: 'stop' }]],
      onRequest: (req) => requests.push(req),
    })

    const outcome = await runStructuredOutcome(provider, withSchema(), schema)
    const structured = requireStructured(outcome)

    expect(structured.data).toEqual({ ok: true })
    expect(requests).toHaveLength(2)
    expect(requests[1]?.jsonObject).toBe(true)
    expect(labels(structured.attempts)).toEqual([
      'json_schema:failed',
      'json_object:success',
    ])
  })

  it('第 3 级：围栏 JSON 在宽容解析阶段恢复', async () => {
    const requests: ChatRequest[] = []
    const provider = new MockProvider({
      fault: 'fenced_json',
      onRequest: (req) => requests.push(req),
    })

    const outcome = await runStructuredOutcome(provider, withSchema(), schema)
    const structured = requireStructured(outcome)

    expect(structured.data).toEqual({ ok: true })
    expect(requests).toHaveLength(2)
    expect(labels(structured.attempts)).toEqual([
      'json_schema:failed',
      'json_object:failed',
      'loose_parse:success',
    ])
    expect(
      structured.attempts.some((attempt) => attempt.level === 'repair'),
    ).toBe(false)
  })

  it('第 4 级：把 Zod 路径与信息喂回模型，第 1 次修复成功', async () => {
    const requests: ChatRequest[] = []
    const provider = new MockProvider({
      script: [
        [{ delta: '[1,2,3]', finishReason: 'stop' }],
        [{ delta: '{"ok":"不是布尔值"}', finishReason: 'stop' }],
        [{ delta: '{"ok":true}', finishReason: 'stop' }],
      ],
      onRequest: (req) => requests.push(req),
    })

    const outcome = await runStructuredOutcome(provider, withSchema(), schema)
    const structured = requireStructured(outcome)

    expect(structured.data).toEqual({ ok: true })
    expect(requests).toHaveLength(3)
    const feedback = requests[2]?.messages.at(-1)?.content ?? ''
    expect(feedback).toContain('校验错误')
    expect(feedback).toContain('ok')
    expect(feedback).toContain('boolean')
    expect(labels(structured.attempts)).toEqual([
      'json_schema:failed',
      'json_object:failed',
      'loose_parse:failed',
      'repair:success#1',
    ])
  })

  it('第 4 级：最多修复 2 次，每次失败原因都记录', async () => {
    const requests: ChatRequest[] = []
    const provider = new MockProvider({
      fault: 'bad_json',
      onRequest: (req) => requests.push(req),
    })

    const outcome = await runStructuredOutcome(provider, withSchema(), schema, {
      maxRepairAttempts: 2,
    })
    const fallback = requireFallback(outcome)

    // 1 次严格模式 + 1 次 json_object + 2 次修复，修复不会超过 2 次。
    expect(requests).toHaveLength(4)
    const repairs = fallback.attempts.filter(
      (attempt) => attempt.level === 'repair',
    )
    expect(repairs.map((attempt) => attempt.repair)).toEqual([1, 2])
    expect(repairs.every((attempt) => attempt.status === 'failed')).toBe(true)
    expect(
      repairs.every(
        (attempt) =>
          typeof attempt.reason === 'string' && attempt.reason.length > 0,
      ),
    ).toBe(true)
  })

  it('第 4 级：调用方传更大的修复次数也会被硬性封顶到 2', async () => {
    const requests: ChatRequest[] = []
    const provider = new MockProvider({
      fault: 'bad_json',
      onRequest: (req) => requests.push(req),
    })

    const outcome = await runStructuredOutcome(provider, withSchema(), schema, {
      maxRepairAttempts: 9,
    })
    const fallback = requireFallback(outcome)
    const repairs = fallback.attempts.filter(
      (attempt) => attempt.level === 'repair',
    )

    expect(requests).toHaveLength(4)
    expect(repairs).toHaveLength(2)
    expect(repairs.map((attempt) => attempt.repair)).toEqual([1, 2])
  })

  it('第 5 级：保留所有响应中最长的原始内容', async () => {
    const provider = new MockProvider({
      script: [
        [{ delta: '短内容', finishReason: 'stop' }],
        [{ delta: '第二段更长的内容', finishReason: 'stop' }],
        [{ delta: '修复一', finishReason: 'stop' }],
        [{ delta: '修复二', finishReason: 'stop' }],
      ],
    })

    const outcome = await runStructuredOutcome(provider, withSchema(), schema)
    const fallback = requireFallback(outcome)

    expect(fallback.text).toBe('第二段更长的内容')
    expect(Array.from(fallback.text)).toHaveLength(8)
    expect(labels(fallback.attempts).at(-1)).toBe('text:degraded')
    expect(fallback.attempts.at(-1)?.reason).toContain('保留 8 个字符')
  })

  it('fallbackToText=false 时不返回纯文本，直接抛 invalid_output', async () => {
    const provider = new MockProvider({ fault: 'bad_json' })

    await expect(
      runStructuredOutcome(provider, withSchema(), schema, {
        maxRepairAttempts: 1,
        fallbackToText: false,
      }),
    ).rejects.toMatchObject({ kind: 'invalid_output', retryable: true })
  })

  it('provider.structured 彻底失败时把保留文本放进 cause', async () => {
    const provider = new MockProvider({ fault: 'bad_json' })

    await expect(
      provider.structured(withSchema(), schema, {
        maxRepairAttempts: 2,
        fallbackToText: true,
      }),
    ).rejects.toMatchObject({
      kind: 'invalid_output',
      cause: { fallbackText: '这不是 JSON，只是一段解释，没有结构。' },
    })
  })
})
