import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createLlmError } from '@/lib/llm/errors'
import { MockProvider } from '@/lib/llm/mock'
import { parseJsonLoose } from '@/lib/llm/structured'
import type { ChatRequest } from '@/lib/llm/types'

const schema = z.object({ ok: z.boolean(), note: z.string().optional() })

const baseRequest: ChatRequest = {
  modelConfigId: 'mock',
  messages: [{ role: 'user', content: '请输出 JSON' }],
}

describe('parseJsonLoose 宽容解析', () => {
  it('剥掉 Markdown 代码围栏与前后解释', () => {
    expect(parseJsonLoose('好的，结果如下：\n```json\n{"ok":true}\n```\n请查收')).toEqual({
      ok: true,
    })
  })

  it('去掉尾随逗号', () => {
    expect(parseJsonLoose('{"ok":true,}')).toEqual({ ok: true })
  })

  it('补全未闭合的括号', () => {
    expect(parseJsonLoose('{"ok":true,"note":"未闭合')).toEqual({
      ok: true,
      note: '未闭合',
    })
  })

  it('单引号 JSON 在完全没有双引号时自动转换', () => {
    expect(parseJsonLoose("{'ok': true}")).toEqual({ ok: true })
  })

  it('实在不是 JSON 时返回 undefined', () => {
    expect(parseJsonLoose('这是一段普通文本，没有结构。')).toBeUndefined()
  })
})

describe('runStructured 修复重试', () => {
  it('首次输出不合法时把校验错误喂回模型并重试', async () => {
    const requests: ChatRequest[] = []
    const provider = new MockProvider({
      script: [
        [{ delta: '我先解释一下，不输出 JSON。' }],
        [{ delta: '```json\n{"ok":true}\n```' }],
      ],
      onRequest: (req) => requests.push(req),
    })

    const result = await provider.structured(baseRequest, schema, {
      maxRepairAttempts: 2,
    })

    expect(result).toEqual({ ok: true })
    expect(requests).toHaveLength(2)
    expect(requests[1]?.messages).toHaveLength(3)
    expect(requests[1]?.messages[2]?.content).toContain('校验错误')
  })

  it('json_schema 被 400 拒绝时自动降级到 json_object', async () => {
    const requests: ChatRequest[] = []
    const provider = new MockProvider({
      errors: [createLlmError('invalid_input', 'response_format 不支持')],
      script: [[{ delta: '{"ok":true}' }]],
      onRequest: (req) => requests.push(req),
    })

    const result = await provider.structured(
      {
        ...baseRequest,
        jsonSchema: { name: 'test', schema: { type: 'object' }, strict: true },
      },
      schema,
      { maxRepairAttempts: 0, fallbackToText: false },
    )

    expect(result).toEqual({ ok: true })
    expect(requests).toHaveLength(2)
    expect(requests[0]?.jsonSchema).toBeDefined()
    expect(requests[1]?.jsonSchema).toBeUndefined()
    expect(requests[1]?.jsonObject).toBe(true)
  })

  it('彻底失败时降级为纯文本请求，仍失败则抛 invalid_output', async () => {
    const requests: ChatRequest[] = []
    const provider = new MockProvider({
      chunks: [{ delta: '始终不是 JSON' }],
      onRequest: (req) => requests.push(req),
    })

    await expect(
      provider.structured(
        { ...baseRequest, jsonObject: true },
        schema,
        { maxRepairAttempts: 0, fallbackToText: true },
      ),
    ).rejects.toMatchObject({ kind: 'invalid_output', retryable: true })

    expect(requests).toHaveLength(2)
    expect(requests[1]?.jsonObject).toBeUndefined()
    expect(requests[1]?.jsonSchema).toBeUndefined()
  })

  it('Zod 校验失败时错误里带原始输出与校验问题', async () => {
    const provider = new MockProvider({
      chunks: [{ delta: '{"ok":"不是布尔值"}' }],
    })

    await expect(
      provider.structured(baseRequest, schema, {
        maxRepairAttempts: 0,
        fallbackToText: false,
      }),
    ).rejects.toMatchObject({
      kind: 'invalid_output',
      cause: {
        raw: '{"ok":"不是布尔值"}',
      },
    })
  })
})
