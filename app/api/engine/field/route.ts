import { z } from 'zod'
import { MAX_REQUIREMENT_LENGTH } from '@/lib/engine/compose'
import {
  SSE_HEADERS,
  encodeSseEvent,
  isFieldKey,
  type SseMessage,
} from '@/lib/engine/sse'
import type { FieldKey } from '@/lib/engine/schema'
import { applyFieldOp } from '@/components/studio/fieldOps'
import { FIELD_OPS } from '@/components/studio/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 单字段重算的 SSE 路由。
 *
 * 请求只带一个字段的当前文本，响应也只回这一个字段，因此「其他字段逐字不变」
 * 在协议层就是自然结果：服务端根本拿不到其他字段，也没有机会改它们。
 *
 * 事件协议与 /api/engine/generate 完全一致：stage / field / delta / error / done，
 * 响应头复用 SSE_HEADERS。有模型时这里可以换成模型改写，事件形状不变。
 */

const fieldKeySchema = z.custom<FieldKey>((value) => isFieldKey(value), {
  message: '未知字段',
})

const requestSchema = z.object({
  field: fieldKeySchema,
  action: z.enum(FIELD_OPS),
  text: z.string().max(20_000, '字段文本过长。'),
  requirement: z
    .string()
    .trim()
    .max(
      MAX_REQUIREMENT_LENGTH,
      `需求不能超过 ${MAX_REQUIREMENT_LENGTH} 个字符。`,
    )
    .optional(),
  title: z.string().trim().max(120, '标题过长。').optional(),
})

function jsonError(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
): Response {
  return new Response(JSON.stringify({ code, message, retryable }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function chunkText(text: string, size: number): string[] {
  const chars = Array.from(text)
  const chunks: string[] = []
  for (let index = 0; index < chars.length; index += size) {
    chunks.push(chars.slice(index, index + size).join(''))
  }
  return chunks
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return jsonError(400, 'INVALID_JSON', '请求体不是合法 JSON。', false)
  }

  const parsed = requestSchema.safeParse(payload)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return jsonError(
      400,
      'INVALID_INPUT',
      firstIssue?.message ?? '请求参数不合法。',
      true,
    )
  }

  const { field, action, text, requirement, title } = parsed.data
  if (text.trim().length === 0) {
    return jsonError(
      400,
      'EMPTY_FIELD',
      '该字段还没有内容，先生成或填写后再重算。',
      false,
    )
  }

  let nextText: string
  try {
    nextText = applyFieldOp(field, text, action, { requirement, title })
  } catch {
    return jsonError(
      500,
      'FIELD_OP_FAILED',
      '重算该字段时出错。',
      true,
    )
  }

  if (nextText.trim().length === 0) {
    return jsonError(500, 'EMPTY_RESULT', '重算没有产生可用内容。', true)
  }

  const fast = new URL(request.url).searchParams.get('fast') === '1'
  const chunkSize = fast ? 64 : 4
  const chunkDelay = fast ? 0 : 6
  const startedAt = Date.now()
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => {
        if (closed) {
          return
        }
        closed = true
        try {
          controller.close()
        } catch {
          // 客户端可能已经断开
        }
      }

      const enqueue = (message: SseMessage) => {
        if (closed || request.signal.aborted) {
          return
        }
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(message)))
        } catch {
          closed = true
        }
      }

      const wait = (ms: number): Promise<boolean> =>
        new Promise((resolve) => {
          if (ms <= 0) {
            resolve(!request.signal.aborted)
            return
          }
          if (request.signal.aborted) {
            resolve(false)
            return
          }
          let timer: ReturnType<typeof setTimeout> | undefined
          const onAbort = () => {
            if (timer) {
              clearTimeout(timer)
              timer = undefined
            }
            resolve(false)
          }
          request.signal.addEventListener('abort', onAbort, { once: true })
          timer = setTimeout(() => {
            request.signal.removeEventListener('abort', onAbort)
            timer = undefined
            resolve(true)
          }, ms)
        })

      const onAbort = () => {
        closed = true
        try {
          controller.close()
        } catch {
          // 客户端已断开
        }
      }
      request.signal.addEventListener('abort', onAbort, { once: true })

      try {
        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'start', label: '正在重算该字段' },
        })
        enqueue({ event: 'field', data: { path: field, status: 'start' } })

        for (const chunk of chunkText(nextText, chunkSize)) {
          enqueue({ event: 'delta', data: { path: field, text: chunk } })
          if (!(await wait(chunkDelay))) {
            return
          }
        }

        enqueue({ event: 'field', data: { path: field, status: 'done' } })
        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'done', label: '字段重算完成' },
        })
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'stop',
            ...(title ? { title } : {}),
          },
        })
      } catch {
        enqueue({
          event: 'error',
          data: {
            code: 'FIELD_RECALC_FAILED',
            message: '字段重算中断，已保留原内容。',
            field,
            retryable: true,
            attempt: 1,
          },
        })
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'error',
          },
        })
      } finally {
        request.signal.removeEventListener('abort', onAbort)
        close()
      }
    },
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    status: 200,
    headers: { ...SSE_HEADERS },
  })
}
