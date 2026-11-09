import { z } from 'zod'
import { AssumptionSchema, FIELD_KEYS, type FieldKey } from './schema'

/**
 * SSE 事件协议（与 ARCHITECTURE.md 第五节一致）。
 *
 * 事件名为 stage / field / delta / reasoning / usage / error / done。
 * 顺序保证 stage 包裹 field 包裹 delta；reasoning 与 usage 不改变字段状态：
 * - reasoning 承载思维链增量，绝不进入 delta 与提示词正文；
 * - usage 承载本次调用的 token 与人民币金额，拿不到用量时不发该事件。
 * 本文件是同构的：服务端用 encodeSseEvent 编码，客户端用 parseSseStream 解码。
 */

export const SSE_EVENT_NAMES = [
  'stage',
  'field',
  'delta',
  'reasoning',
  'usage',
  'error',
  'done',
] as const
export type SseEventName = (typeof SSE_EVENT_NAMES)[number]

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
} as const

export function isFieldKey(value: unknown): value is FieldKey {
  return typeof value === 'string' && (FIELD_KEYS as readonly string[]).includes(value)
}

const fieldKeySchema = z.custom<FieldKey>((value) => isFieldKey(value), {
  message: '未知字段路径',
})

export const stagePayloadSchema = z.object({
  stage: z.enum(['compose', 'interview', 'evaluate', 'refine']),
  status: z.enum(['start', 'done']),
  label: z.string().optional(),
})

export const fieldPayloadSchema = z.object({
  path: fieldKeySchema,
  status: z.enum(['start', 'done']),
})

export const deltaPayloadSchema = z.object({
  path: z.string().min(1),
  text: z.string(),
})

/** 思维链增量。只用于「思考」区展示，客户端不得写入字段正文。 */
export const reasoningPayloadSchema = z.object({
  text: z.string().min(1),
})

/**
 * 本次调用的用量。
 *
 * costCny 缺省表示价格未知（或模型未配置价格），界面显示「未知」而不是 0。
 * tokensIn / tokensOut 必填，但服务端在用量完全缺失时不会发 usage 事件。
 */
export const usagePayloadSchema = z.object({
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
  costCny: z.number().nonnegative().optional(),
  model: z.string().min(1).optional(),
})

export const errorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  field: z.string().optional(),
  retryable: z.boolean(),
  attempt: z.number().int().positive().optional(),
})

export const donePayloadSchema = z.object({
  durationMs: z.number().nonnegative(),
  finishReason: z.enum(['stop', 'error', 'aborted']),
  /** 离线模板生成的标题，供复制 Markdown 与结果头部使用 */
  title: z.string().optional(),
  /** 生成期假设，供假设 chip 使用 */
  assumptions: z.array(AssumptionSchema).optional(),
})

export type StagePayload = z.infer<typeof stagePayloadSchema>
export type FieldPayload = z.infer<typeof fieldPayloadSchema>
export type DeltaPayload = z.infer<typeof deltaPayloadSchema>
export type ReasoningPayload = z.infer<typeof reasoningPayloadSchema>
export type UsagePayload = z.infer<typeof usagePayloadSchema>
export type ErrorPayload = z.infer<typeof errorPayloadSchema>
export type DonePayload = z.infer<typeof donePayloadSchema>

export type SseMessage =
  | { event: 'stage'; data: StagePayload }
  | { event: 'field'; data: FieldPayload }
  | { event: 'delta'; data: DeltaPayload }
  | { event: 'reasoning'; data: ReasoningPayload }
  | { event: 'usage'; data: UsagePayload }
  | { event: 'error'; data: ErrorPayload }
  | { event: 'done'; data: DonePayload }

export const apiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  detail: z.unknown().optional(),
  retryable: z.boolean().optional(),
})

export type ApiErrorBody = z.infer<typeof apiErrorSchema>

export class SseParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SseParseError'
  }
}

export function encodeSseEvent(message: SseMessage): string {
  return `event: ${message.event}\ndata: ${JSON.stringify(message.data)}\n\n`
}

function parseMessage(event: SseEventName, rawData: string): SseMessage {
  let data: unknown
  try {
    data = JSON.parse(rawData)
  } catch {
    throw new SseParseError(`无法解析 ${event} 事件的 JSON 数据。`)
  }

  try {
    switch (event) {
      case 'stage':
        return { event, data: stagePayloadSchema.parse(data) }
      case 'field':
        return { event, data: fieldPayloadSchema.parse(data) }
      case 'delta':
        return { event, data: deltaPayloadSchema.parse(data) }
      case 'reasoning':
        return { event, data: reasoningPayloadSchema.parse(data) }
      case 'usage':
        return { event, data: usagePayloadSchema.parse(data) }
      case 'error':
        return { event, data: errorPayloadSchema.parse(data) }
      case 'done':
        return { event, data: donePayloadSchema.parse(data) }
      default:
        throw new SseParseError(`未知事件名：${String(event)}`)
    }
  } catch (error) {
    if (error instanceof SseParseError) {
      throw error
    }
    throw new SseParseError(`${event} 事件的字段不符合协议。`)
  }
}

function isSseEventName(value: string): value is SseEventName {
  return (SSE_EVENT_NAMES as readonly string[]).includes(value)
}

function parseEventBlock(block: string): SseMessage | null {
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

  if (!eventName || dataLines.length === 0 || !isSseEventName(eventName)) {
    return null
  }
  return parseMessage(eventName, dataLines.join('\n'))
}

/**
 * 把 fetch 返回的字节流解析成协议消息。
 * 支持任意分块边界、CRLF、注释行与多行 data。
 */
export async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<SseMessage, void, void> {
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
        const message = parseEventBlock(block)
        if (message) {
          yield message
        }
        boundary = buffer.indexOf('\n\n')
      }
    }

    buffer = `${buffer}${decoder.decode()}`.replace(/\r\n/g, '\n')
    if (buffer.trim().length > 0) {
      const message = parseEventBlock(buffer)
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
