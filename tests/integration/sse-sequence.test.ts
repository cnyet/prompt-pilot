import { describe, expect, it } from 'vitest'
import { POST } from '@/app/api/engine/generate/route'
import { FIELD_KEYS, type FieldKey } from '@/lib/engine/schema'
import {
  apiErrorSchema,
  parseSseStream,
  type SseMessage,
} from '@/lib/engine/sse'

function makeRequest(body: unknown, query = '?fast=1'): Request {
  return new Request(`http://localhost/api/engine/generate${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readAll(body: ReadableStream<Uint8Array>): Promise<{
  messages: SseMessage[]
  chunks: number
  text: string
}> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let chunks = 0
  let text = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks += 1
    text += decoder.decode(value, { stream: true })
  }
  text += decoder.decode()

  const replay = new Response(text).body
  if (!replay) {
    throw new Error('测试无法重建事件流')
  }

  const messages: SseMessage[] = []
  for await (const message of parseSseStream(replay)) {
    messages.push(message)
  }

  return { messages, chunks, text }
}

describe('POST /api/engine/generate SSE 序列', () => {
  it('响应头与事件顺序满足协议，且真正分块返回', async () => {
    const response = await POST(
      makeRequest({ input: '帮我写一份产品评审会议程' }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      'text/event-stream; charset=utf-8',
    )
    expect(response.headers.get('cache-control')).toBe('no-cache, no-transform')
    expect(response.headers.get('x-accel-buffering')).toBe('no')
    expect(response.body).not.toBeNull()

    if (!response.body) {
      throw new Error('响应没有 body')
    }

    const { messages, chunks, text } = await readAll(response.body)
    expect(chunks).toBeGreaterThan(20)
    expect(text.startsWith('event: stage\n')).toBe(true)

    let stageOpen = false
    let openField: FieldKey | null = null
    const seenFields: FieldKey[] = []
    const deltas: { field: FieldKey; text: string }[] = []
    let stageDoneCount = 0
    let doneCount = 0

    for (const message of messages) {
      switch (message.event) {
        case 'stage': {
          if (message.data.status === 'start') {
            expect(stageOpen).toBe(false)
            expect(openField).toBeNull()
            stageOpen = true
          } else {
            expect(stageOpen).toBe(true)
            expect(openField).toBeNull()
            stageOpen = false
            stageDoneCount += 1
          }
          break
        }

        case 'field': {
          expect(stageOpen).toBe(true)
          if (message.data.status === 'start') {
            expect(openField).toBeNull()
            openField = message.data.path
            seenFields.push(message.data.path)
          } else {
            expect(openField).toBe(message.data.path)
            openField = null
          }
          break
        }

        case 'delta': {
          expect(stageOpen).toBe(true)
          expect(openField).not.toBeNull()
          if (!openField) {
            throw new Error('delta 出现在 field 之外')
          }
          expect(
            message.data.path === openField ||
              message.data.path.startsWith(`${openField}.`),
          ).toBe(true)
          expect(Array.from(message.data.text)).toHaveLength(1)
          deltas.push({ field: openField, text: message.data.text })
          break
        }

        case 'error': {
          throw new Error(`不应出现 error 事件：${message.data.message}`)
        }

        case 'done': {
          expect(stageOpen).toBe(false)
          expect(openField).toBeNull()
          doneCount += 1
          expect(message.data.finishReason).toBe('stop')
          expect(message.data.durationMs).toBeGreaterThanOrEqual(0)
          expect(message.data.title?.length ?? 0).toBeGreaterThanOrEqual(2)
          expect(message.data.assumptions?.length ?? 0).toBeGreaterThan(0)
          break
        }
      }
    }

    expect(stageDoneCount).toBe(1)
    expect(doneCount).toBe(1)
    expect(stageOpen).toBe(false)
    expect(openField).toBeNull()
    expect(seenFields).toEqual([...FIELD_KEYS])
    expect(deltas.length).toBeGreaterThan(100)

    const last = messages.at(-1)
    expect(last?.event).toBe('done')
  })

  it('只请求部分字段时按契约顺序返回，用于单字段重试', async () => {
    const response = await POST(
      makeRequest({
        input: '帮我写个周报',
        fields: ['output', 'role'],
      }),
    )
    expect(response.status).toBe(200)
    if (!response.body) {
      throw new Error('响应没有 body')
    }

    const { messages } = await readAll(response.body)
    const seenFields: FieldKey[] = []
    for (const message of messages) {
      if (message.event === 'field' && message.data.status === 'start') {
        seenFields.push(message.data.path)
      }
    }

    expect(seenFields).toEqual(['role', 'output'])
  })

  it('非法输入返回统一 JSON 错误，不进入事件流', async () => {
    const response = await POST(makeRequest({ input: '   ' }))
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe(
      'application/json; charset=utf-8',
    )

    const payload: unknown = await response.json()
    const parsed = apiErrorSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.code).toBe('INVALID_INPUT')
      expect(parsed.data.retryable).toBe(true)
    }
  })

  it('非法 JSON 请求体返回 INVALID_JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/engine/generate?fast=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
    )
    expect(response.status).toBe(400)

    const payload: unknown = await response.json()
    const parsed = apiErrorSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.code).toBe('INVALID_JSON')
      expect(parsed.data.retryable).toBe(false)
    }
  })

  it('未知字段返回 INVALID_INPUT', async () => {
    const response = await POST(
      makeRequest({ input: '帮我写个周报', fields: ['unknown'] }),
    )
    expect(response.status).toBe(400)

    const payload: unknown = await response.json()
    const parsed = apiErrorSchema.safeParse(payload)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.code).toBe('INVALID_INPUT')
    }
  })
})
