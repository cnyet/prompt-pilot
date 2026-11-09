import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/engine/generate/route'
import { composePrompt } from '@/lib/engine/compose'
import { renderFieldText } from '@/lib/engine/render'
import { FIELD_KEYS, type FieldKey } from '@/lib/engine/schema'
import { parseSseStream, type SseMessage } from '@/lib/engine/sse'
import { MockProvider } from '@/lib/llm/mock'
import type { ChatChunk, LLMProvider } from '@/lib/llm/types'

/**
 * 注入 MockProvider 走真实模型分支（有 provider 时路由不再走离线模板）。
 * getGenerateProvider 由测试用例逐个替换，其余注册表函数保持原实现。
 */
const registryState = vi.hoisted(() => ({ provider: null as unknown }))

vi.mock('@/lib/llm/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/llm/registry')>()
  return {
    ...actual,
    getGenerateProvider: () => registryState.provider as LLMProvider | null,
  }
})

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/engine/generate?fast=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function splitEvery(text: string, size: number): string[] {
  const parts: string[] = []
  for (let index = 0; index < text.length; index += size) {
    parts.push(text.slice(index, index + size))
  }
  return parts
}

function jsonChunks(schema: unknown, size: number): ChatChunk[] {
  const pieces = splitEvery(JSON.stringify(schema), size)
  return pieces.map((delta, index) => ({
    delta,
    ...(index === pieces.length - 1 ? { finishReason: 'stop' as const } : {}),
  }))
}

function fieldFromPath(path: string): FieldKey | null {
  const [head] = path.split('.')
  return head !== undefined && (FIELD_KEYS as readonly string[]).includes(head)
    ? (head as FieldKey)
    : null
}

interface Collected {
  messages: SseMessage[]
  firstDeltaAt: number | null
  doneAt: number | null
  deltas: Map<FieldKey, string>
  seenFields: FieldKey[]
}

async function collect(
  response: Response,
  startedAt: number,
): Promise<Collected> {
  if (!response.body) {
    throw new Error('响应没有事件流')
  }
  const messages: SseMessage[] = []
  const deltas = new Map<FieldKey, string>()
  const seenFields: FieldKey[] = []
  let firstDeltaAt: number | null = null
  let doneAt: number | null = null

  for await (const message of parseSseStream(response.body)) {
    messages.push(message)
    if (message.event === 'delta' && firstDeltaAt === null) {
      firstDeltaAt = Date.now() - startedAt
    }
    if (message.event === 'delta') {
      const field = fieldFromPath(message.data.path)
      if (field) {
        deltas.set(field, (deltas.get(field) ?? '') + message.data.text)
      }
    }
    if (message.event === 'field' && message.data.status === 'start') {
      seenFields.push(message.data.path)
    }
    if (message.event === 'done') {
      doneAt = Date.now() - startedAt
    }
  }

  return { messages, firstDeltaAt, doneAt, deltas, seenFields }
}

describe('有 provider 时的真流式与用量透传', () => {
  it('首字早于 2 秒，字段逐段到达，最终内容与整体渲染一致', async () => {
    const schema = composePrompt('帮我写一份产品评审会议程')
    const chunks = jsonChunks(schema, 48)
    registryState.provider = new MockProvider({ chunks, delayMs: 40 })

    const startedAt = Date.now()
    const response = await POST(
      makeRequest({ input: '帮我写一份产品评审会议程' }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'text/event-stream; charset=utf-8',
    )

    const { messages, firstDeltaAt, doneAt, deltas, seenFields } =
      await collect(response, startedAt)

    expect(firstDeltaAt).not.toBeNull()
    expect(doneAt).not.toBeNull()
    if (firstDeltaAt === null || doneAt === null) {
      throw new Error('缺少首字或完成事件')
    }

    // NFR-2：首字延迟低于 2 秒；同时总时长明显更长，证明不是一次性回放。
    expect(firstDeltaAt).toBeLessThan(2000)
    expect(doneAt - firstDeltaAt).toBeGreaterThan(1000)

    expect(seenFields).toEqual([...FIELD_KEYS])
    for (const field of FIELD_KEYS) {
      expect((deltas.get(field) ?? '').trimEnd()).toBe(
        renderFieldText(schema, field),
      )
    }

    const last = messages.at(-1)
    expect(last?.event).toBe('done')
    if (last?.event === 'done') {
      expect(last.data.finishReason).toBe('stop')
      expect(last.data.title).toBe(schema.meta.title)
    }
    expect(messages.some((message) => message.event === 'error')).toBe(false)
  }, 15_000)

  it('usage 与 reasoning 走独立事件，思维链不混进正文', async () => {
    const schema = composePrompt('帮我写一份产品评审会议程')
    const bodyChunks = jsonChunks(schema, 64)
    const chunks: ChatChunk[] = [
      { delta: '', reasoningDelta: '先想' },
      { delta: '', reasoningDelta: '再想' },
      ...bodyChunks,
      {
        delta: '',
        usage: {
          tokensIn: 123,
          tokensOut: 456,
          cachedTokens: 10,
          reasoningTokens: 30,
          costCny: 0.0123,
        },
        finishReason: 'stop',
      },
    ]
    registryState.provider = new MockProvider({ chunks, delayMs: 5 })

    const startedAt = Date.now()
    const response = await POST(
      makeRequest({ input: '帮我写一份产品评审会议程' }),
    )
    const { messages, deltas } = await collect(response, startedAt)

    const reasoning = messages
      .filter((message) => message.event === 'reasoning')
      .map((message) => (message.event === 'reasoning' ? message.data.text : ''))
      .join('')
    expect(reasoning).toBe('先想再想')

    const usage = messages.find((message) => message.event === 'usage')
    expect(usage?.event).toBe('usage')
    if (usage?.event === 'usage') {
      expect(usage.data.tokensIn).toBe(123)
      expect(usage.data.tokensOut).toBe(456)
      expect(usage.data.cachedTokens).toBe(10)
      expect(usage.data.reasoningTokens).toBe(30)
      expect(usage.data.costCny).toBe(0.0123)
      expect(usage.data.model).toBe('doubao-seed-2-1-pro-260915')
    }

    // 思维链不能出现在任何 delta 里。
    for (const text of deltas.values()) {
      expect(text).not.toContain('先想')
      expect(text).not.toContain('再想')
    }

    const usageIndex = messages.findIndex(
      (message) => message.event === 'usage',
    )
    const lastDeltaIndex = messages.reduce(
      (last, message, index) =>
        message.event === 'delta' ? index : last,
      -1,
    )
    const doneIndex = messages.findIndex((message) => message.event === 'done')
    expect(usageIndex).toBeGreaterThan(lastDeltaIndex)
    expect(usageIndex).toBeLessThan(doneIndex)
  })

  it('拿不到用量时不发 usage，让界面显示未知而不是 0', async () => {
    const schema = composePrompt('帮我写一份产品评审会议程')
    const chunks: ChatChunk[] = [
      ...jsonChunks(schema, 96),
      {
        delta: '',
        usage: { tokensIn: 0, tokensOut: 0 },
        finishReason: 'stop',
      },
    ]
    registryState.provider = new MockProvider({ chunks })

    const startedAt = Date.now()
    const response = await POST(
      makeRequest({ input: '帮我写一份产品评审会议程' }),
    )
    const { messages } = await collect(response, startedAt)

    expect(messages.some((message) => message.event === 'usage')).toBe(false)
    expect(messages.at(-1)?.event).toBe('done')
  })

  it('增量解析失败时回退整体解析，已流出的字段内容不丢', async () => {
    const validSchema = composePrompt('帮我写一份产品评审会议程')
    const partial =
      '{"schemaVersion":"pp-schema-v1","meta":{"title":"产品评审会议程","taskType":"qa","language":"zh"},"role":{"persona":"你是产品评审主持人","expertise":"流程设计"}}' +
      ' 这里是无法继续解析的尾巴'
    const streamChunks: ChatChunk[] = splitEvery(partial, 32).map((delta) => ({
      delta,
    }))
    const script: readonly (readonly ChatChunk[])[] = [
      streamChunks,
      [{ delta: JSON.stringify(validSchema), finishReason: 'stop' }],
    ]
    registryState.provider = new MockProvider({ script })

    const startedAt = Date.now()
    const response = await POST(
      makeRequest({ input: '帮我写一份产品评审会议程' }),
    )
    expect(response.status).toBe(200)
    const { messages, deltas } = await collect(response, startedAt)

    // 已经流出的角色内容仍在，随后整体解析补齐其余字段。
    expect(deltas.get('role') ?? '').toContain('你是产品评审主持人')
    expect((deltas.get('objective') ?? '').length).toBeGreaterThan(0)
    expect(messages.some((message) => message.event === 'error')).toBe(false)

    const done = messages.at(-1)
    expect(done?.event).toBe('done')
    if (done?.event === 'done') {
      expect(done.data.finishReason).toBe('stop')
    }
  })
})
