import { z } from 'zod'
import {
  ComposeInputError,
  MAX_REQUIREMENT_LENGTH,
  composePrompt,
} from '@/lib/engine/compose'
import { renderFieldSegments } from '@/lib/engine/render'
import {
  SSE_HEADERS,
  encodeSseEvent,
  isFieldKey,
  type SseMessage,
} from '@/lib/engine/sse'
import { FIELD_KEYS, type FieldKey, type PromptSchema } from '@/lib/engine/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fieldKeySchema = z.custom<FieldKey>((value) => isFieldKey(value), {
  message: '未知字段',
})

const requestSchema = z.object({
  input: z
    .string()
    .trim()
    .min(2, '需求至少需要 2 个字符。')
    .max(MAX_REQUIREMENT_LENGTH, `需求不能超过 ${MAX_REQUIREMENT_LENGTH} 个字符。`),
  fields: z
    .array(fieldKeySchema)
    .min(1, '至少选择一个字段。')
    .optional(),
})

function jsonError(
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  detail?: unknown,
): Response {
  return new Response(JSON.stringify({ code, message, detail, retryable }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

/** 按字段粒度生成 SSE。`?fast=1` 跳过人工延迟，供集成测试与本地调试使用。 */
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
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    )
  }

  let schema: PromptSchema
  try {
    schema = composePrompt(parsed.data.input)
  } catch (error) {
    if (error instanceof ComposeInputError) {
      return jsonError(400, error.code, error.message, true)
    }
    return jsonError(500, 'COMPOSE_FAILED', '生成结构化内容时出错。', true)
  }

  const requested = parsed.data.fields
  const selected: FieldKey[] = requested
    ? FIELD_KEYS.filter((field) => requested.includes(field))
    : [...FIELD_KEYS]

  const fast = new URL(request.url).searchParams.get('fast') === '1'
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
          // 客户端可能已经断开，关闭失败不需要再处理
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
          if (request.signal.aborted) {
            resolve(false)
            return
          }
          if (ms <= 0) {
            resolve(true)
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
        const plans = selected.map((field) => ({
          field,
          segments: renderFieldSegments(schema, field),
        }))

        const totalChars = plans.reduce(
          (total, plan) =>
            total +
            plan.segments.reduce(
              (count, segment) => count + Array.from(segment.text).length,
              0,
            ),
          0,
        )
        // 把整次生成控制在约 9 秒：短文档慢一点，长文档快一点，始终低于验收的 20 秒。
        const charDelay =
          fast || totalChars === 0
            ? 0
            : Math.min(8, Math.max(2, Math.round(9000 / totalChars)))
        const stageDelay = fast ? 0 : 120
        const fieldGap = fast ? 0 : 60

        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'start', label: '正在生成结构' },
        })
        if (!(await wait(stageDelay))) {
          return
        }

        for (const [index, plan] of plans.entries()) {
          enqueue({ event: 'field', data: { path: plan.field, status: 'start' } })

          for (const segment of plan.segments) {
            for (const char of segment.text) {
              enqueue({
                event: 'delta',
                data: { path: segment.path, text: char },
              })
              if (charDelay > 0 && !(await wait(charDelay))) {
                return
              }
            }
          }

          enqueue({ event: 'field', data: { path: plan.field, status: 'done' } })

          if (index < plans.length - 1 && fieldGap > 0) {
            if (!(await wait(fieldGap))) {
              return
            }
          }
        }

        enqueue({
          event: 'stage',
          data: { stage: 'compose', status: 'done', label: '结构生成完成' },
        })
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'stop',
            title: schema.meta.title,
            assumptions: schema.assumptions,
          },
        })
      } catch {
        enqueue({
          event: 'error',
          data: {
            code: 'STREAM_FAILED',
            message: '生成过程中断，已保留已完成内容。',
            retryable: true,
            attempt: 1,
          },
        })
        enqueue({
          event: 'done',
          data: {
            durationMs: Date.now() - startedAt,
            finishReason: 'error',
            title: schema.meta.title,
            assumptions: schema.assumptions,
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
