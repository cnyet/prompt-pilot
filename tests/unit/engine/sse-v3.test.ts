import { describe, expect, it } from 'vitest'
import {
  encodeSseEventV3,
  parseSseStreamV3,
  type SseV3Message,
} from '@/lib/engine/sse-v3'

function streamFrom(parts: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(encoder.encode(part))
      }
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<SseV3Message[]> {
  const out: SseV3Message[] = []
  for await (const message of parseSseStreamV3(stream)) {
    out.push(message)
  }
  return out
}

const SAMPLE: SseV3Message[] = [
  { event: 'start', data: { recordId: 'r1', iterationId: 'i1' } },
  { event: 'delta', data: { text: '# 周报\n' } },
  { event: 'meta', data: { title: '周报生成', notes: ['补了边界'] } },
  { event: 'usage', data: { tokensIn: 100, tokensOut: 50, costCny: 0.01, latencyMs: 1200 } },
  { event: 'error', data: { code: 'RateLimited', message: '限流，可重试', retryable: true } },
  { event: 'done', data: { recordId: 'r1', iterationId: 'i1', status: 'completed' } },
]

describe('sse-v3 协议', () => {
  it('encode 后 parse 往返逐字段相等', async () => {
    const wire = SAMPLE.map(encodeSseEventV3).join('')
    const messages = await collect(streamFrom([wire]))
    expect(messages).toEqual(SAMPLE)
  })

  it('usage 缺 costCny 与 latencyMs 时（未知）仍可解析', async () => {
    const wire = encodeSseEventV3({ event: 'usage', data: { tokensIn: 1, tokensOut: 2 } })
    const messages = await collect(streamFrom([wire]))
    expect(messages[0]).toEqual({
      event: 'usage',
      data: { tokensIn: 1, tokensOut: 2 },
    })
  })

  it('任意分块边界、CRLF 与注释行都能解析', async () => {
    const wire = [
      'event: start\r\ndata: {"recordId":"r1","iterationId":"i1"}\r\n\r\n',
      ': heartbeat\n\n',
      'event: del',
      'ta\ndata: {"text":"片段"}\n\n',
    ].join('')
    const messages = await collect(streamFrom([wire]))
    expect(messages).toEqual([
      { event: 'start', data: { recordId: 'r1', iterationId: 'i1' } },
      { event: 'delta', data: { text: '片段' } },
    ])
  })

  it('未知事件名与畸形 payload 被跳过，不中断流', async () => {
    const wire = [
      'event: stage\ndata: {"stage":"compose"}\n\n',
      'event: delta\ndata: {"text":42}\n\n',
      'event: delta\ndata: {"text":"好"}\n\n',
    ].join('')
    const messages = await collect(streamFrom([wire]))
    expect(messages).toEqual([{ event: 'delta', data: { text: '好' } }])
  })
})
