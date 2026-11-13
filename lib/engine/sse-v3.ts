/**
 * v3 SSE 事件协议（ARCHITECTURE §五）。客户端用 fetch + ReadableStream，不用 EventSource。
 *
 * 同构：服务端 encodeSseEventV3 编码，客户端 parseSseStreamV3 解析。
 * 解析层只做校验：未知事件名与畸形 payload 的 block 返回 null 跳过，
 * 不抛错、不中断流；错误事件的发送由路由负责。
 */
import { z } from 'zod'

export const SSE_V3_EVENT_NAMES = ['start', 'delta', 'meta', 'usage', 'error', 'done'] as const
export type SseV3EventName = (typeof SSE_V3_EVENT_NAMES)[number]

export const SSE_V3_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
} as const

export const startPayloadSchema = z.object({
  recordId: z.string().min(1),
  iterationId: z.string().min(1),
})

export const deltaV3PayloadSchema = z.object({
  text: z.string(),
})

export const metaPayloadSchema = z.object({
  title: z.string().nullable(),
  notes: z.array(z.string()),
})

export const usageV3PayloadSchema = z.object({
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  costCny: z.number().nonnegative().optional(),
  latencyMs: z.number().nonnegative().optional(),
})

export const errorV3PayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
})

export const doneV3PayloadSchema = z.object({
  recordId: z.string().min(1),
  iterationId: z.string().min(1),
  status: z.enum(['completed', 'canceled', 'failed']),
})

export type StartPayload = z.infer<typeof startPayloadSchema>
export type DeltaV3Payload = z.infer<typeof deltaV3PayloadSchema>
export type MetaPayload = z.infer<typeof metaPayloadSchema>
export type UsageV3Payload = z.infer<typeof usageV3PayloadSchema>
export type ErrorV3Payload = z.infer<typeof errorV3PayloadSchema>
export type DoneV3Payload = z.infer<typeof doneV3PayloadSchema>

export type SseV3Message =
  | { event: 'start'; data: StartPayload }
  | { event: 'delta'; data: DeltaV3Payload }
  | { event: 'meta'; data: MetaPayload }
  | { event: 'usage'; data: UsageV3Payload }
  | { event: 'error'; data: ErrorV3Payload }
  | { event: 'done'; data: DoneV3Payload }

export function encodeSseEventV3(message: SseV3Message): string {
  return `event: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`
}

function isSseV3EventName(value: string): value is SseV3EventName {
  return (SSE_V3_EVENT_NAMES as readonly string[]).includes(value)
}

function parseMessageV3(event: SseV3EventName, rawData: string): SseV3Message | null {
  let data: unknown
  try {
    data = JSON.parse(rawData)
  } catch {
    return null
  }

  try {
    switch (event) {
      case 'start':
        return { event, data: startPayloadSchema.parse(data) }
      case 'delta':
        return { event, data: deltaV3PayloadSchema.parse(data) }
      case 'meta':
        return { event, data: metaPayloadSchema.parse(data) }
      case 'usage':
        return { event, data: usageV3PayloadSchema.parse(data) }
      case 'error':
        return { event, data: errorV3PayloadSchema.parse(data) }
      case 'done':
        return { event, data: doneV3PayloadSchema.parse(data) }
      default:
        return null
    }
  } catch {
    // 字段不符合协议：跳过该 block，不中断流
    return null
  }
}

function parseEventBlockV3(block: string): SseV3Message | null {
  let eventName: string | null = null
  const dataLines: string[] = []

  for (const line of block.split('\n')) {
    if (line.startsWith(':')) {
      continue
    }
    const colon = line.indexOf(':')
    const fieldName = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) {
      value = value.slice(1)
    }
    if (fieldName === 'event') {
      eventName = value
    } else if (fieldName === 'data') {
      dataLines.push(value)
    }
  }

  if (!eventName || dataLines.length === 0 || !isSseV3EventName(eventName)) {
    return null
  }
  return parseMessageV3(eventName, dataLines.join('\n'))
}

/**
 * 把 fetch 返回的字节流解析成 v3 协议消息。
 * 支持任意分块边界、CRLF、注释行与多行 data；无法解析的 block 被跳过。
 */
export async function* parseSseStreamV3(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseV3Message, void, void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      buffer = `${buffer}${decoder.decode(value, { stream: true })}`.replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const message = parseEventBlockV3(block)
        if (message) {
          yield message
        }
        boundary = buffer.indexOf('\n\n')
      }
    }

    buffer = `${buffer}${decoder.decode()}`.replace(/\r\n/g, '\n')
    if (buffer.trim().length > 0) {
      const message = parseEventBlockV3(buffer)
      if (message) {
        yield message
      }
    }
  } finally {
    try {
      await reader.cancel()
    } catch {
      // 流已经结束时 cancel 会抛错，这里不需要再处理
    }
    reader.releaseLock()
  }
}
