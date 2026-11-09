import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/engine/generate/route'
import { parseSseStream, type SseMessage } from '@/lib/engine/sse'
import { MOCK_FAULT_TEXTS } from '@/lib/llm/mock'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/engine/generate?fast=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readMessages(
  body: ReadableStream<Uint8Array> | null,
): Promise<SseMessage[]> {
  if (!body) {
    throw new Error('响应没有事件流')
  }
  const messages: SseMessage[] = []
  for await (const message of parseSseStream(body)) {
    messages.push(message)
  }
  return messages
}

function useFault(fault: string): void {
  vi.stubEnv('ARK_API_KEY', '')
  vi.stubEnv('MOCK_LLM_FAULT', fault)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('generate 路由的结构化失败兜底', () => {
  it('bad_json：保留原始文本、发三段式提示并允许手动重试', async () => {
    useFault('bad_json')
    const response = await POST(
      makeRequest({ input: '帮我写一份产品评审会议程' }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'text/event-stream; charset=utf-8',
    )

    const messages = await readMessages(response.body)
    const start = messages.find(
      (message) => message.event === 'field' && message.data.status === 'start',
    )
    const delta = messages.find((message) => message.event === 'delta')
    const error = messages.find((message) => message.event === 'error')
    const done = messages.at(-1)

    expect(start?.event).toBe('field')
    if (start?.event === 'field') {
      expect(start.data.path).toBe('role')
    }
    expect(delta?.event).toBe('delta')
    if (delta?.event === 'delta') {
      expect(delta.data.path).toBe('role')
      expect(delta.data.text).toBe(MOCK_FAULT_TEXTS.bad_json)
    }

    expect(error?.event).toBe('error')
    if (error?.event === 'error') {
      const chars = Array.from(MOCK_FAULT_TEXTS.bad_json).length
      expect(error.data.code).toBe('LLM_STRUCTURED_FALLBACK')
      expect(error.data.retryable).toBe(true)
      expect(error.data.field).toBe('role')
      expect(error.data.message).toContain('发生了什么：')
      expect(error.data.message).toContain('为什么：')
      expect(error.data.message).toContain('怎么办：')
      expect(error.data.message).toContain(`保留的 ${chars} 个字符`)
      expect(error.data.message).toContain('「角色」字段')
      expect(error.data.message).not.toMatch(/[!！]|—/)
    }

    // 先按 done 写入纯文本，再由 error 把该字段标记为 failed，内容不丢。
    const doneField = messages.find(
      (message) =>
        message.event === 'field' && message.data.status === 'done',
    )
    expect(doneField?.event).toBe('field')
    if (doneField?.event === 'field') {
      expect(doneField.data.path).toBe('role')
    }

    expect(done?.event).toBe('done')
    if (done?.event === 'done') {
      expect(done.data.finishReason).toBe('error')
    }
  })

  it('truncated：提示区分 max_tokens 并保留截断前内容', async () => {
    useFault('truncated')
    const response = await POST(
      makeRequest({ input: '帮我写一份产品评审会议程', fields: ['role'] }),
    )
    const messages = await readMessages(response.body)
    const delta = messages.find((message) => message.event === 'delta')
    const error = messages.find((message) => message.event === 'error')

    expect(delta?.event).toBe('delta')
    if (delta?.event === 'delta') {
      expect(delta.data.text).toBe(MOCK_FAULT_TEXTS.truncated)
    }

    expect(error?.event).toBe('error')
    if (error?.event === 'error') {
      expect(error.data.code).toBe('LLM_STRUCTURED_FALLBACK')
      expect(error.data.message).toContain('为什么：模型输出被截断')
      expect(error.data.message).toContain('max_tokens')
      expect(error.data.message).toContain('怎么办：')
    }
  })

  it('rate_limited：429 限流走三段式提示且可重试', async () => {
    useFault('rate_limited')
    const response = await POST(
      makeRequest({ input: '帮我写一份产品评审会议程' }),
    )
    const messages = await readMessages(response.body)
    const error = messages.find((message) => message.event === 'error')
    const done = messages.at(-1)

    expect(error?.event).toBe('error')
    if (error?.event === 'error') {
      expect(error.data.code).toBe('LLM_RATE_LIMITED')
      expect(error.data.retryable).toBe(true)
      expect(error.data.message).toContain('发生了什么：模型调用被限流')
      expect(error.data.message).toContain('为什么：')
      expect(error.data.message).toContain('怎么办：')
      expect(error.data.message).not.toMatch(/[!！]|—/)
    }
    expect(done?.event).toBe('done')
    if (done?.event === 'done') {
      expect(done.data.finishReason).toBe('error')
    }
  })

  it('quota_exceeded：429 额度用尽不可重试', async () => {
    useFault('quota_exceeded')
    const response = await POST(
      makeRequest({ input: '帮我写一份产品评审会议程' }),
    )
    const messages = await readMessages(response.body)
    const error = messages.find((message) => message.event === 'error')

    expect(error?.event).toBe('error')
    if (error?.event === 'error') {
      expect(error.data.code).toBe('LLM_QUOTA_EXCEEDED')
      expect(error.data.retryable).toBe(false)
      expect(error.data.message).toContain('额度已用尽')
      expect(error.data.message).toContain('怎么办：')
    }
  })
})
